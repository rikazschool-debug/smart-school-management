do $$ declare d text; begin
  d := pg_get_functiondef('public._ct_plan(uuid,uuid,jsonb)'::regprocedure);
  d := replace(d, $x$_ct_txt(e->>'status') st, _ct_txt(e->>'type') ty$x$, $x$coalesce(_ct_txt(e->>'status'),'لا يوجد') st, coalesce(_ct_txt(e->>'type'),'لا يوجد') ty$x$);
  if position('لا يوجد'') st' in d) = 0 then raise exception 'patch failed'; end if;
  execute d;
end $$;

create table public.ct_manual_log(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade, old jsonb not null, new jsonb not null,
  changed_by uuid not null, changed_at timestamptz not null default now());
grant all on public.ct_manual_log to service_role;
alter table public.ct_manual_log enable row level security;

create or replace function public.ct_set(_student uuid, _year text, _status text, _type text) returns void
language plpgsql security definer set search_path=public as $$
declare s students; y date;
begin
  select * into s from students where id=_student;
  if s.id is null then raise exception 'الطالب غير موجود'; end if;
  perform _ct_check(s.school_id);
  _year := coalesce(_ct_txt(_year),'لا يوجد'); _status := coalesce(_ct_txt(_status),'لا يوجد'); _type := coalesce(_ct_txt(_type),'لا يوجد');
  if length(_year)>60 or length(_status)>120 or length(_type)>120 then raise exception 'القيمة طويلة جدًا'; end if;
  select start_date into y from academic_years where school_id=s.school_id and name=_year limit 1;
  perform set_config('rikaz.ct_sync','1',true);
  update students set contract_year=_year, contract_status=_status, contract_type=_type,
    contract_year_start=coalesce(y, contract_year_start), contract_synced_at=now() where id=_student;
  perform set_config('rikaz.ct_sync','',true);
  insert into ct_manual_log(school_id,student_id,old,new,changed_by) values (s.school_id,_student,
    jsonb_build_object('year',s.contract_year,'status',s.contract_status,'type',s.contract_type),
    jsonb_build_object('year',_year,'status',_status,'type',_type), auth.uid());
end $$;
revoke all on function public.ct_set(uuid,text,text,text) from public, anon;
grant execute on function public.ct_set(uuid,text,text,text) to authenticated, service_role;