create table public.cv_visits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  evaluator_id uuid not null default auth.uid(),
  visit_date date not null,
  lesson text,
  form_version int not null default 1,
  scores jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  summary text,
  status text not null default 'draft' check (status in ('draft','submitted','approved','returned')),
  return_reason text,
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant all on public.cv_visits to service_role;
alter table public.cv_visits enable row level security;

create table public.cv_events (id bigserial primary key, visit_id uuid not null references public.cv_visits(id) on delete cascade,
  actor uuid, action text not null, details jsonb, at timestamptz not null default now());
grant all on public.cv_events to service_role;
grant usage on sequence public.cv_events_id_seq to service_role;
alter table public.cv_events enable row level security;

create or replace function public._cv_codes() returns text[] language sql immutable as $$
  select array(select 'c'||g from generate_series(1,24) g) $$;

-- evaluator rights: principal-level of the branch, or supervisor of an assigned teacher
create or replace function public._cv_can_eval(_teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from teachers t where t.id=_teacher and (is_school_principal(t.school_id) or t.id in (select supervised_teacher_ids()))) $$;
create or replace function public._cv_can_read(v cv_visits) returns boolean language sql stable security definer set search_path=public as $$
  select v.evaluator_id = auth.uid() or is_school_principal(v.school_id) $$;

create or replace function public.cv_save(_id uuid, _teacher uuid, _date date, _lesson text, _scores jsonb, _notes jsonb, _summary text, _submit boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare v cv_visits; k text; s int; _school uuid;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not _cv_can_eval(_teacher) then raise exception 'لا تملك صلاحية تقييم هذا المعلم'; end if;
  select school_id into _school from teachers where id=_teacher;
  if _date is null or _date > (now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ الزيارة غير صالح'; end if;
  for k in select jsonb_object_keys(coalesce(_scores,'{}')) loop
    if not k = any(_cv_codes()) then raise exception 'بند غير معروف'; end if;
    s := (_scores->>k)::int; if s < 1 or s > 5 then raise exception 'الدرجة من 1 إلى 5'; end if;
  end loop;
  if _submit and (select count(*) from jsonb_object_keys(coalesce(_scores,'{}'))) < 24 then raise exception 'أكمل تقييم جميع البنود قبل الإرسال'; end if;
  if _id is null then
    insert into cv_visits(school_id,teacher_id,visit_date,lesson,scores,notes,summary,status)
      values(_school,_teacher,_date,_lesson,coalesce(_scores,'{}'),coalesce(_notes,'{}'),_summary, case when _submit then 'submitted' else 'draft' end) returning * into v;
  else
    select * into v from cv_visits where id=_id for update;
    if v.id is null or v.evaluator_id <> auth.uid() then raise exception 'غير مصرح'; end if;
    if v.status not in ('draft','returned') then raise exception 'لا يمكن تعديل زيارة مرسلة أو معتمدة'; end if;
    update cv_visits set teacher_id=_teacher, school_id=_school, visit_date=_date, lesson=_lesson, scores=coalesce(_scores,'{}'), notes=coalesce(_notes,'{}'),
      summary=_summary, status=case when _submit then 'submitted' else status end, updated_at=now() where id=_id returning * into v;
  end if;
  insert into cv_events(visit_id,actor,action) values(v.id,auth.uid(), case when _submit then 'submit' else 'save' end);
  if _submit then
    perform _notify(m.user_id, v.school_id, 'visit', 'زيارة صفية بانتظار الاعتماد', null, '/app/visits?id='||v.id, 'cv-sub-'||v.id||'-'||extract(epoch from now())::bigint)
    from memberships m where m.school_id=v.school_id and m.role='principal' and m.is_active and m.user_id<>auth.uid();
  end if;
  return v.id;
end $$;

create or replace function public.cv_decide(_id uuid, _approve boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare v cv_visits;
begin
  select * into v from cv_visits where id=_id for update;
  if v.id is null or not is_school_principal(v.school_id) then raise exception 'الاعتماد للمدير فقط'; end if;
  if v.status <> 'submitted' then raise exception 'الزيارة ليست بانتظار الاعتماد'; end if;
  if not _approve and coalesce(trim(_reason),'')='' then raise exception 'سبب الإعادة مطلوب'; end if;
  update cv_visits set status=case when _approve then 'approved' else 'returned' end, return_reason=case when _approve then null else _reason end,
    decided_by=auth.uid(), decided_at=now(), updated_at=now() where id=_id;
  insert into cv_events(visit_id,actor,action,details) values(_id,auth.uid(), case when _approve then 'approve' else 'return' end, jsonb_build_object('reason',_reason));
  perform _notify(v.evaluator_id, v.school_id, 'visit', case when _approve then 'اعتُمدت الزيارة الصفية' else 'أعيدت الزيارة الصفية للتعديل' end, _reason, '/app/visits?id='||_id, 'cv-dec-'||_id||'-'||extract(epoch from now())::bigint);
end $$;

create or replace function public.cv_list(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'teacher_id',v.teacher_id,'teacher',t.full_name,'visit_date',v.visit_date,'lesson',v.lesson,'status',v.status,
    'scores',v.scores,'notes',v.notes,'summary',v.summary,'return_reason',v.return_reason,'evaluator',coalesce(p.full_name,''),'mine',v.evaluator_id=auth.uid(),
    'can_decide', is_school_principal(v.school_id) and v.status='submitted') order by v.visit_date desc, v.created_at desc),'[]')
  from cv_visits v join teachers t on t.id=v.teacher_id left join profiles p on p.id=v.evaluator_id
  where v.school_id=_school and _cv_can_read(v) $$;

create or replace function public.cv_teachers(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.full_name) order by t.full_name),'[]') from teachers t
  where t.school_id=_school and t.status='active' and (is_school_principal(_school) or t.id in (select supervised_teacher_ids())) $$;

revoke execute on function public._cv_can_eval(uuid), public._cv_can_read(cv_visits) from public, anon, authenticated;
revoke execute on function public.cv_save(uuid,uuid,date,text,jsonb,jsonb,text,boolean), public.cv_decide(uuid,boolean,text), public.cv_list(uuid), public.cv_teachers(uuid) from public, anon;
grant execute on function public.cv_save(uuid,uuid,date,text,jsonb,jsonb,text,boolean), public.cv_decide(uuid,boolean,text), public.cv_list(uuid), public.cv_teachers(uuid) to authenticated;