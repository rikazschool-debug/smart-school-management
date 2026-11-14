create or replace function public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
returns table(user_id uuid, school_id uuid, role text)
language plpgsql stable security definer set search_path=public as $$
declare org uuid := coalesce(_org, school_org(_school)); er text[]; begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _purpose = 'group' then
    if not _can_create_group(org, _school) then raise exception 'اختيار أعضاء المجموعات للمالك ومدير المدرسة فقط'; end if;
  elsif _purpose = 'direct' then
    if not _eligible_staff(org, _school, auth.uid()) then raise exception 'دليل الموظفين لموظفي المدرسة فقط'; end if;
  elsif _purpose = 'task' then
    if _school is null or not has_school_role(_school, array['principal','vice_principal','supervisor']::app_role[]) then raise exception 'إنشاء التكليفات للمدير والوكيل والمشرف'; end if;
  elsif _purpose = 'duty' then
    if _school is null or not _adm_lead(_school) then raise exception 'إدارة المناوبات لمدير المدرسة والوكيل'; end if;
    if _post is not null then
      select eligible_roles into er from adm_duty_posts where id=_post and adm_duty_posts.school_id=_school;
      if er is null then raise exception 'موقع غير صالح'; end if;
    end if;
  elsif _purpose in ('meeting','decision') then
    if _school is null or not _adm_can_organize(_school) then raise exception 'اختيار المدعوين لمنظمي الاجتماعات فقط'; end if;
    if _purpose = 'meeting' and _org is not null and not is_org_owner(org) then raise exception 'الاجتماع بين الفروع لمالك المؤسسة فقط'; end if;
  else raise exception 'غرض غير معروف';
  end if;
  return query
    select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
    where m.is_active and m.role not in ('student','guardian')
      and (case
        when _purpose in ('group','direct') then (_school is not null and m.school_id=_school) or (_school is null and s.org_id=org)
        when _purpose = 'meeting' then m.role <> 'org_owner' and m.user_id <> auth.uid() and ((_org is null and m.school_id=_school) or (_org is not null and s.org_id=org))
        when _purpose = 'decision' then m.role <> 'org_owner' and m.school_id=_school
        when _purpose = 'task' then m.role <> 'org_owner' and m.school_id=_school and m.user_id <> auth.uid() and _task_target_ok(_school, m.user_id)
        when _purpose = 'duty' then m.role <> 'org_owner' and m.school_id=_school and (er is null or m.role::text = any(er))
        else false end);
end $$;
revoke execute on function public._people_pool(text,uuid,uuid,uuid) from public, anon, authenticated;

-- Unified authorized people search: one row per person (all roles merged), no contact data.
create or replace function public.people_pick(_purpose text, _school uuid, _org uuid default null, _q text default null, _role text default null,
  _dept uuid default null, _branch uuid default null, _post uuid default null, _ids uuid[] default null, _limit int default 50)
returns table(user_id uuid, full_name text, roles text[], school_id uuid, school_name text, dept_id uuid, dept_name text, total bigint)
language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_q,'')), ''); begin
  if q is not null then q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  return query
  with pool as (select * from _people_pool(_purpose, _school, _org, _post)),
  u as (
    select pl.user_id, (array_agg(pl.school_id order by (pl.school_id = _school) desc, pl.school_id))[1] sid,
      array_agg(distinct pl.role order by pl.role) rs
    from pool pl
    where (_branch is null or pl.school_id=_branch)
    group by pl.user_id
    having _role is null or _role = any(array_agg(pl.role))
  ), r as (
    select u.user_id, coalesce(p.full_name,'—') fn, u.rs, u.sid, sc.name sn, dd.dep, d.name dn
    from u left join profiles p on p.id=u.user_id join schools sc on sc.id=u.sid
    left join lateral (select coalesce(
      (select m.department_id from memberships m where m.user_id=u.user_id and m.school_id=u.sid and m.is_active and m.department_id is not null limit 1),
      (select t.department_id from teachers t where t.user_id=u.user_id and t.school_id=u.sid and t.department_id is not null limit 1)) dep) dd on true
    left join departments d on d.id=dd.dep
    where (_dept is null or dd.dep=_dept)
      and (_ids is null or u.user_id = any(_ids))
      and (q is null or p.full_name ilike q || '%' or p.full_name ilike '% ' || q || '%')
  )
  select r.user_id, r.fn, r.rs, r.sid, r.sn, r.dep, r.dn, count(*) over () from r
  order by r.fn, r.sn limit least(greatest(coalesce(_limit,50),1), 500);
end $$;

-- Filter options limited to the same authorized pool.
create or replace function public.people_pick_facets(_purpose text, _school uuid, _org uuid default null, _post uuid default null)
returns table(kind text, id text, label text)
language plpgsql stable security definer set search_path=public as $$ begin
  return query
  with pool as (select * from _people_pool(_purpose, _school, _org, _post))
  select 'role'::text, x.role, x.role from (select distinct pool.role from pool) x
  union all
  select 'branch', s.id::text, s.name from schools s where s.id in (select pool.school_id from pool)
  union all
  select 'dept', d.id::text, d.name || case when _org is not null or _school is null then ' — ' || s.name else '' end
    from departments d join schools s on s.id=d.school_id
    where d.school_id in (select pool.school_id from pool)
  order by 1, 3;
end $$;

revoke execute on function public.people_pick(text,uuid,uuid,text,text,uuid,uuid,uuid,uuid[],int) from public, anon;
revoke execute on function public.people_pick_facets(text,uuid,uuid,uuid) from public, anon;
grant execute on function public.people_pick(text,uuid,uuid,text,text,uuid,uuid,uuid,uuid[],int) to authenticated, service_role;
grant execute on function public.people_pick_facets(text,uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public._people_pool(text,uuid,uuid,uuid) to service_role;