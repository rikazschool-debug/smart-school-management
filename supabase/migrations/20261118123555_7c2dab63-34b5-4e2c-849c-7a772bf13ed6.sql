-- 1) Display label: «مالك المجموعة» -> «مدير النظام» in every server message/label (role identity unchanged)
do $$ declare r record; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f' and p.prosrc like '%مالك المجموعة%'
  loop execute replace(pg_get_functiondef(r.oid), 'مالك المجموعة', 'مدير النظام'); end loop;
end $$;

-- 2) Several people may share one duty location (required is a target, not a cap)
create or replace function public.adm_duty_assign(_roster uuid, _post uuid, _date date, _user uuid, _client uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare ro adm_duty_rosters; po adm_duty_posts; nid uuid; why text; begin
  if _client is not null then select id into nid from adm_duty_assignments where created_by=auth.uid() and client_id=_client; if nid is not null then return nid; end if; end if;
  ro := _duty_roster_for(_roster, null);
  select * into po from adm_duty_posts where id=_post and school_id=ro.school_id;
  if po.id is null then raise exception 'موقع غير صالح'; end if;
  if _date not between ro.week_start and ro.week_start + 6 then raise exception 'التاريخ خارج أسبوع الجدول'; end if;
  if not (extract(dow from _date)::int = any(po.days)) then raise exception 'هذا الموقع لا يعمل في هذا اليوم'; end if;
  if ro.status = 'published' and _date < school_today() then raise exception 'لا تُعدّل مناوبة تاريخها مضى'; end if;
  if not exists(select 1 from memberships m where m.school_id=ro.school_id and m.user_id=_user and m.is_active and m.role::text = any(po.eligible_roles)) then raise exception 'الموظف غير مؤهل لهذا الموقع'; end if;
  if exists(select 1 from adm_duty_assignments a where a.post_id=_post and a.date=_date and a.user_id=_user and a.status='assigned') then raise exception 'الموظف مُسند لهذا الموقع في اليوم نفسه'; end if;
  why := _duty_busy(ro.school_id, _user, _date, po.start_time, po.end_time, null);
  if why is not null then raise exception 'لا يمكن الإسناد: %', why; end if;
  insert into adm_duty_assignments(school_id, roster_id, post_id, date, start_time, end_time, user_id, source, client_id)
    values (ro.school_id, _roster, _post, _date, po.start_time, po.end_time, _user, 'manual', _client) returning id into nid;
  update adm_duty_rosters set rev=rev + 1, updated_at=now() where id=_roster;
  perform _adm_log(ro.school_id, 'duty', _roster, 'assigned', jsonb_build_object('note', _adm_name(_user) || ' — ' || po.name || ' ' || _date));
  if ro.status = 'published' then
    perform _duty_snapshot(_roster);
    perform _notify(_user, ro.school_id, 'admin', 'أُسندت إليك مناوبة', po.name || ' — ' || _date || ' ' || to_char(po.start_time, 'HH24:MI'), '/app/admin/duties', 'adm:duty:' || nid || ':new');
  end if;
  return nid;
end $function$;

-- 3) Quick assignments
create table public.adm_duty_quick (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null,
  date date not null,
  post_id uuid not null references public.adm_duty_posts(id),
  grade_id uuid references public.grades(id),
  section_id uuid references public.sections(id),
  period_id uuid references public.periods(id),
  note text check (note is null or length(note) <= 500),
  status text not null default 'active' check (status in ('active','cancelled')),
  cancel_reason text,
  client_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, client_id)
);
create index adm_duty_quick_school_date on public.adm_duty_quick(school_id, date);
create index adm_duty_quick_user on public.adm_duty_quick(user_id, date);
grant all on public.adm_duty_quick to service_role;
alter table public.adm_duty_quick enable row level security;

create or replace function public.adm_duty_quick_save(_school uuid, _user uuid, _date date, _post uuid, _grade uuid, _section uuid, _period uuid, _note text, _client uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare nid uuid; po adm_duty_posts; begin
  if _client is not null then select id into nid from adm_duty_quick where created_by=auth.uid() and client_id=_client; if nid is not null then return nid; end if; end if;
  if not _adm_duty_manage(_school) then raise exception 'لا تملك صلاحية إدارة جداول المناوبة' using errcode='42501'; end if;
  if _date is null or _date < school_today() then raise exception 'اختر تاريخًا من اليوم فصاعدًا'; end if;
  select * into po from adm_duty_posts where id=_post and school_id=_school;
  if po.id is null then raise exception 'اختر الموقع'; end if;
  if not exists(select 1 from memberships m where m.school_id=_school and m.user_id=_user and m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian','org_owner')) then raise exception 'اختر معلمًا أو إداريًا من الفرع'; end if;
  if _grade is not null and not exists(select 1 from grades where id=_grade and school_id=_school) then raise exception 'الصف غير صالح'; end if;
  if _section is not null and not exists(select 1 from sections where id=_section and school_id=_school and (_grade is null or grade_id=_grade)) then raise exception 'الشعبة غير صالحة'; end if;
  if _period is not null and not exists(select 1 from periods where id=_period and school_id=_school) then raise exception 'الحصة غير صالحة'; end if;
  insert into adm_duty_quick(school_id,user_id,date,post_id,grade_id,section_id,period_id,note,client_id)
    values (_school,_user,_date,_post,_grade,_section,_period,nullif(btrim(_note),''),_client) returning id into nid;
  perform _adm_log(_school, 'duty_quick', nid, 'assigned', jsonb_build_object('note', _adm_name(_user) || ' — ' || po.name || ' ' || _date));
  perform _notify(_user, _school, 'admin', 'أُسند إليك إسناد سريع', po.name || ' — ' || _date, '/app/admin/duties', 'adm:dq:' || nid);
  return nid;
end $$;

create or replace function public.adm_duty_quick_cancel(_id uuid, _reason text)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare q adm_duty_quick; begin
  select * into q from adm_duty_quick where id=_id for update;
  if q.id is null or not _adm_duty_manage(q.school_id) then raise exception 'لا تملك صلاحية إدارة جداول المناوبة' using errcode='42501'; end if;
  if q.status <> 'active' then raise exception 'الإسناد ملغى مسبقًا'; end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'اكتب سبب الإلغاء'; end if;
  update adm_duty_quick set status='cancelled', cancel_reason=btrim(_reason), updated_at=now() where id=_id;
  perform _adm_log(q.school_id, 'duty_quick', _id, 'cancelled', jsonb_build_object('note', btrim(_reason)));
  perform _notify(q.user_id, q.school_id, 'admin', 'أُلغي إسناد سريع', btrim(_reason), '/app/admin/duties', 'adm:dq:' || _id || ':cancel');
end $$;

create or replace function public.adm_duty_quick_list(_school uuid, _from date, _to date, _mine boolean)
 returns table(id uuid, user_id uuid, user_name text, date date, post_id uuid, post text, grade text, section text, period text, period_time text, note text, status text, cancel_reason text, created_by_name text, created_at timestamptz)
 language plpgsql stable security definer set search_path to 'public'
as $$ begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not coalesce(_mine,false) and not _adm_duty_view(_school) then raise exception 'لا تملك صلاحية عرض المناوبات' using errcode='42501'; end if;
  return query select q.id, q.user_id, _adm_name(q.user_id), q.date, q.post_id, p.name, g.name, s.name, pe.name,
      case when pe.id is null then null else to_char(pe.start_time,'HH24:MI') || '–' || to_char(pe.end_time,'HH24:MI') end,
      q.note, q.status, q.cancel_reason, _adm_name(q.created_by), q.created_at
    from adm_duty_quick q join adm_duty_posts p on p.id=q.post_id
    left join grades g on g.id=q.grade_id left join sections s on s.id=q.section_id left join periods pe on pe.id=q.period_id
    where q.school_id=_school and q.date between coalesce(_from, q.date) and coalesce(_to, q.date)
      and (not coalesce(_mine,false) or q.user_id=auth.uid())
    order by q.date desc, q.created_at desc limit 500;
end $$;

revoke execute on function public.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid), public.adm_duty_quick_cancel(uuid,text), public.adm_duty_quick_list(uuid,date,date,boolean) from public, anon;
grant execute on function public.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid), public.adm_duty_quick_cancel(uuid,text), public.adm_duty_quick_list(uuid,date,date,boolean) to authenticated;