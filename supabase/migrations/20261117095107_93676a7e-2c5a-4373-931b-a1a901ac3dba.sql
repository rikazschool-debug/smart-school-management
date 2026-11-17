create table public.sv5_portfolio(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid not null references schools(id), teacher_id uuid not null references teachers(id),
 source_kind text not null check (source_kind in ('record','pd_session','dev_plan','action')), source_id uuid not null, source_snap jsonb not null, source_date date not null,
 year_name text, term_name text,
 domain text not null check (domain in ('planning','instruction','assessment','outcomes','pd','community')),
 title text not null, reflection text not null default '',
 status text not null default 'proposed' check (status in ('proposed','returned','verified','withdrawn')),
 review_note text, verified_by uuid, verified_at timestamptz, proposed_by uuid not null, rev int not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index sv5_portfolio_one_active on public.sv5_portfolio(teacher_id, source_kind, source_id) where status <> 'withdrawn';
create index sv5_portfolio_school on public.sv5_portfolio(school_id, teacher_id);
create table public.sv5_portfolio_log(id uuid primary key default gen_random_uuid(), item_id uuid not null references sv5_portfolio(id), action text not null, note text, actor uuid not null, at timestamptz not null default now());
create index sv5_portfolio_log_item on public.sv5_portfolio_log(item_id);
grant all on public.sv5_portfolio to service_role; grant all on public.sv5_portfolio_log to service_role;
alter table public.sv5_portfolio enable row level security; alter table public.sv5_portfolio_log enable row level security;

create or replace function private._sv5_pf_guard() returns trigger language plpgsql set search_path=public as $$ begin
 if old.status in ('verified','withdrawn') then raise exception 'العنصر المتحقق منه أو المسحوب لا يُعدّل'; end if;
 if new.teacher_id<>old.teacher_id or new.source_kind<>old.source_kind or new.source_id<>old.source_id or new.school_id<>old.school_id or new.source_snap<>old.source_snap then raise exception 'مصدر العنصر لا يتغير'; end if;
 new.updated_at:=now(); return new; end $$;
create trigger sv5_portfolio_guard before update on public.sv5_portfolio for each row execute function private._sv5_pf_guard();
create or replace function private._sv5_pf_log_guard() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'سجل الملف المهني لا يُعدّل ولا يُحذف'; end $$;
create trigger sv5_portfolio_log_guard before update or delete on public.sv5_portfolio_log for each row execute function private._sv5_pf_log_guard();

create or replace function private._sv5_pf_log(_i uuid, _a text, _n text) returns void language sql security definer set search_path=public as $$ insert into sv5_portfolio_log(item_id,action,note,actor) values(_i,_a,_n,auth.uid()) $$;

-- Source summary: only items that belong to the teacher and are final (approved / present / done). Title/date/description only — no notes, no files.
create or replace function private._sv5_pf_src(_kind text, _id uuid, _teacher uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare tu uuid; sch uuid; j jsonb; begin
 select user_id, school_id into tu, sch from teachers where id=_teacher;
 if _kind='record' then
  select jsonb_build_object('title',coalesce(nullif(r.form_snapshot->>'title',''),'سجل إشرافي'),'date',(coalesce(r.approved_at,r.updated_at) at time zone 'Asia/Riyadh')::date,'detail','سجل إشرافي معتمد') into j
  from sv_records r where r.id=_id and r.teacher_id=_teacher and r.school_id=sch and r.status='approved';
 elsif _kind='pd_session' then
  select jsonb_build_object('title',g.title,'date',(s.starts_at at time zone 'Asia/Riyadh')::date,'detail','حضور موثّق في برنامج تطوير — '||round((extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2)||' ساعة','hours',round((extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2)) into j
  from sv4_attendance a join sv4_sessions s on s.id=a.session_id join sv4_programs g on g.id=s.program_id
  where a.id=_id and tu is not null and a.user_id=tu and a.status='present' and s.status='scheduled' and g.status<>'cancelled' and g.school_id=sch;
 elsif _kind='dev_plan' then
  select jsonb_build_object('title','خطة التطوير المهني — الإصدار '||p.version,'date',(coalesce(p.approved_at,p.updated_at) at time zone 'Asia/Riyadh')::date,'detail','خطة تطوير مهني معتمدة') into j
  from sv4_dev_plans p where p.id=_id and p.teacher_id=_teacher and p.school_id=sch and p.status in ('approved','superseded');
 elsif _kind='action' then
  select jsonb_build_object('title',a.title,'date',(a.updated_at at time zone 'Asia/Riyadh')::date,'detail','إجراء تحسين منفّذ (التنفيذ لا يعني قياس الأثر)') into j
  from sv5_actions a where a.id=_id and tu is not null and a.owner_id=tu and a.school_id=sch and a.status='done';
 end if;
 return j; end $$;

create or replace function private._sv5_pf_period(_school uuid, _d date) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('year',y.name,'term',(select t.name from terms t where t.year_id=y.id and _d between t.start_date and t.end_date order by t.start_date limit 1))
 from academic_years y where y.school_id=_school and _d between y.start_date and y.end_date order by y.start_date desc limit 1 $$;

create or replace function private._sv5_pf_read(p sv5_portfolio) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv3_enabled(p.school_id) and (private._sv_is_teacher(p.teacher_id) or (p.status<>'withdrawn' and private._sv4_work(p.school_id,p.teacher_id))),false) $$;
create or replace function private._sv5_pf_reviewer(p sv5_portfolio) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv3_enabled(p.school_id) and private._sv4_work(p.school_id,p.teacher_id) and not private._sv_is_teacher(p.teacher_id),false) $$;
create or replace function private._sv5_pf_open(p sv5_portfolio) returns boolean language plpgsql stable security definer set search_path=public as $$
declare r sv_records; d sv4_dev_plans; a sv5_actions; begin
 if p.source_kind='record' then select * into r from sv_records where id=p.source_id; return r.id is not null and private._sv3_record_read(r);
 elsif p.source_kind='dev_plan' then select * into d from sv4_dev_plans where id=p.source_id; return d.id is not null and private._sv4_plan_read(d);
 elsif p.source_kind='action' then select * into a from sv5_actions where id=p.source_id; return a.id is not null and private._sv5_act_read(a);
 else return false; end if; end $$;

create or replace function private._sv5_pf_json(p sv5_portfolio, _full boolean) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',p.id,'school_id',p.school_id,'school',(select name from schools where id=p.school_id),'teacher_id',p.teacher_id,'teacher',private._sv_name(private._sv4_teacher_user(p.teacher_id)),
  'source_kind',p.source_kind,'source_id',p.source_id,'source',p.source_snap,'source_date',p.source_date,'year',p.year_name,'term',p.term_name,'domain',p.domain,'title',p.title,'reflection',p.reflection,
  'status',p.status,'review_note',p.review_note,'verifier',case when p.verified_by is null then null else private._sv_name(p.verified_by) end,'verified_at',p.verified_at,'rev',p.rev,'updated_at',p.updated_at,
  'is_teacher',private._sv_is_teacher(p.teacher_id),'can_edit',private._sv_is_teacher(p.teacher_id) and p.status in ('proposed','returned'),'can_review',p.status='proposed' and private._sv5_pf_reviewer(p),
  'can_open',private._sv5_pf_open(p))
  || case when _full then jsonb_build_object('log',(select coalesce(jsonb_agg(jsonb_build_object('action',l.action,'note',l.note,'actor',private._sv_name(l.actor),'at',l.at) order by l.at),'[]') from sv5_portfolio_log l where l.item_id=p.id)) else '{}'::jsonb end $$;

create or replace function private.sv5_pf_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv5_pf_json(p,false) order by p.source_date desc, p.created_at desc),'[]') from sv5_portfolio p where p.org_id=_org and private._sv5_pf_read(p) $$;

create or replace function private.sv5_pf_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p sv5_portfolio; begin select * into p from sv5_portfolio where id=_id;
 if p.id is null or not private._sv5_pf_read(p) then raise exception 'عنصر الملف المهني غير متاح لصلاحيتك'; end if;
 return private._sv5_pf_json(p,true); end $$;

create or replace function private.sv5_pf_candidates(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t uuid; tu uuid; begin
 if not private._sv3_enabled(_school) then raise exception 'الإشراف التربوي غير متاح في هذا الفرع'; end if;
 t:=private._sv4_school_teacher(_school); if t is null then raise exception 'اقتراح عناصر الملف المهني للمعلم نفسه فقط'; end if; tu:=auth.uid();
 return coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'id',c.id,'source',c.src)||coalesce(private._sv5_pf_period(_school,(c.src->>'date')::date),'{}') order by c.src->>'date' desc)
  from (select x.kind, x.id, private._sv5_pf_src(x.kind,x.id,t) src from (
     select 'record' kind, r.id from sv_records r where r.teacher_id=t and r.status='approved'
     union all select 'pd_session', a.id from sv4_attendance a where a.user_id=tu and a.status='present'
     union all select 'dev_plan', p.id from sv4_dev_plans p where p.teacher_id=t and p.status in ('approved','superseded')
     union all select 'action', a.id from sv5_actions a where a.owner_id=tu and a.school_id=_school and a.status='done') x) c
  where c.src is not null and not exists(select 1 from sv5_portfolio p where p.teacher_id=t and p.source_kind=c.kind and p.source_id=c.id and p.status<>'withdrawn')),'[]'); end $$;

create or replace function private.sv5_pf_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare p sv5_portfolio; sch uuid; t uuid; src jsonb; per jsonb; ttl text:=btrim(coalesce(_p->>'title','')); refl text:=btrim(coalesce(_p->>'reflection','')); dom text:=coalesce(_p->>'domain',''); nid uuid; begin
 if dom not in ('planning','instruction','assessment','outcomes','pd','community') then raise exception 'اختر مجال العنصر'; end if;
 if length(refl)>3000 then raise exception 'التأمل أطول من المسموح'; end if;
 if _id is null then
  sch:=(_p->>'school_id')::uuid; if not private._sv3_enabled(sch) then raise exception 'الإشراف التربوي غير متاح في هذا الفرع'; end if;
  t:=private._sv4_school_teacher(sch); if t is null then raise exception 'اقتراح عناصر الملف المهني للمعلم نفسه فقط'; end if;
  src:=private._sv5_pf_src(_p->>'source_kind',(_p->>'source_id')::uuid,t);
  if src is null then raise exception 'المصدر غير متاح: يُقترح فقط عمل معتمد أو موثّق يخصك'; end if;
  if exists(select 1 from sv5_portfolio where teacher_id=t and source_kind=_p->>'source_kind' and source_id=(_p->>'source_id')::uuid and status<>'withdrawn') then raise exception 'هذا المصدر موجود في ملفك المهني'; end if;
  per:=private._sv5_pf_period(sch,(src->>'date')::date);
  if length(ttl)<3 then ttl:=src->>'title'; end if;
  insert into sv5_portfolio(org_id,school_id,teacher_id,source_kind,source_id,source_snap,source_date,year_name,term_name,domain,title,reflection,proposed_by)
   values(school_org(sch),sch,t,_p->>'source_kind',(_p->>'source_id')::uuid,src,(src->>'date')::date,per->>'year',per->>'term',dom,ttl,refl,auth.uid()) returning id into nid;
  perform private._sv5_pf_log(nid,'propose',null); return nid;
 end if;
 select * into p from sv5_portfolio where id=_id for update;
 if p.id is null or not private._sv5_pf_read(p) then raise exception 'عنصر الملف المهني غير متاح لصلاحيتك'; end if;
 if not private._sv_is_teacher(p.teacher_id) then raise exception 'يعدّل العنصر المعلم صاحب الملف فقط'; end if;
 if p.status not in ('proposed','returned') then raise exception 'العنصر المتحقق منه لا يُعدّل'; end if;
 if p.rev<>_rev then raise exception 'تغيّر العنصر بعد فتحه؛ حدّث الصفحة'; end if;
 if length(ttl)<3 then raise exception 'العنوان قصير'; end if;
 update sv5_portfolio set domain=dom,title=ttl,reflection=refl,status='proposed',rev=rev+1 where id=_id;
 perform private._sv5_pf_log(_id,case when p.status='returned' then 'repropose' else 'edit' end,null); return _id; end $$;

create or replace function private.sv5_pf_withdraw(_id uuid, _rev int) returns void language plpgsql security definer set search_path=public as $$
declare p sv5_portfolio; begin select * into p from sv5_portfolio where id=_id for update;
 if p.id is null or not private._sv5_pf_read(p) or not private._sv_is_teacher(p.teacher_id) then raise exception 'يسحب العنصر المعلم صاحب الملف فقط'; end if;
 if p.status not in ('proposed','returned') then raise exception 'العنصر المتحقق منه لا يُسحب'; end if;
 if p.rev<>_rev then raise exception 'تغيّر العنصر بعد فتحه؛ حدّث الصفحة'; end if;
 update sv5_portfolio set status='withdrawn',rev=rev+1 where id=_id; perform private._sv5_pf_log(_id,'withdraw',null); end $$;

create or replace function private.sv5_pf_review(_id uuid, _rev int, _decision text, _note text) returns void language plpgsql security definer set search_path=public as $$
declare p sv5_portfolio; n text:=btrim(coalesce(_note,'')); begin select * into p from sv5_portfolio where id=_id for update;
 if p.id is null or not private._sv5_pf_read(p) then raise exception 'عنصر الملف المهني غير متاح لصلاحيتك'; end if;
 if not private._sv5_pf_reviewer(p) then raise exception 'يتحقق من العنصر المالك أو مدير الفرع أو مشرف يغطي المعلم، وليس المعلم نفسه'; end if;
 if p.status<>'proposed' then raise exception 'العنصر ليس بانتظار التحقق'; end if;
 if p.rev<>_rev then raise exception 'تغيّر العنصر بعد فتحه؛ حدّث الصفحة'; end if;
 if _decision='verify' then
  if private._sv5_pf_src(p.source_kind,p.source_id,p.teacher_id) is null then raise exception 'المصدر لم يعد معتمدًا أو موثّقًا؛ أعد العنصر للمعلم'; end if;
  update sv5_portfolio set status='verified',verified_by=auth.uid(),verified_at=now(),review_note=nullif(n,''),rev=rev+1 where id=_id; perform private._sv5_pf_log(_id,'verify',nullif(n,''));
 elsif _decision='return' then
  if length(n)<3 then raise exception 'اكتب سبب الإعادة'; end if;
  update sv5_portfolio set status='returned',review_note=n,rev=rev+1 where id=_id; perform private._sv5_pf_log(_id,'return',n);
 else raise exception 'قرار غير معروف'; end if; end $$;

do $$ declare r record; begin
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_arguments(p.oid) fargs, pg_get_function_result(p.oid) res, p.provolatile v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'sv5\_pf\_%' loop
  execute format('create or replace function public.%I(%s) returns %s language sql %s set search_path=public as $w$ select private.%I(%s) $w$', r.proname, r.fargs, r.res, case when r.v='s' then 'stable' else 'volatile' end, r.proname,
   (select string_agg(split_part(trim(a),' ',1), ',') from unnest(string_to_array(r.args, ',')) a));
  execute format('revoke all on function public.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop;
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('_sv5_pf_guard','_sv5_pf_log_guard','_sv5_pf_log','_sv5_pf_src','_sv5_pf_period','_sv5_pf_read','_sv5_pf_reviewer','_sv5_pf_open','_sv5_pf_json') loop
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop; end $$;