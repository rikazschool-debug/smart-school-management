create or replace function public._staff_title(_school uuid, _uid uuid, _role text) returns text language sql stable security definer set search_path=public as $$
  select case when _role <> 'teacher' or exists(select 1 from teachers t where t.user_id=_uid and t.school_id=_school and t.status='active') then _role
    else coalesce(nullif(concat_ws(' و', 
      case when _perm_allows_user(_school,_uid,'maint_school','execute') then 'مدير صيانة المدارس' when _perm_allows_user(_school,_uid,'maint_school','follow') then 'مسؤول متابعة صيانة المدارس' end,
      case when _perm_allows_user(_school,_uid,'maint_bus','execute') then 'مدير صيانة الباصات' when _perm_allows_user(_school,_uid,'maint_bus','follow') then 'مسؤول صيانة الباصات' end),''), 'موظف تشغيل') end $$;
revoke all on function public._staff_title(uuid,uuid,text) from public, anon, authenticated;

create or replace function public.support_route_candidates(_school uuid, _dept uuid default null, _q text default null, _ticket uuid default null)
returns table(user_id uuid, name text, role text, school_name text, dept_name text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not _support_route_ok(_school, _ticket) then raise exception 'غير مصرح'; end if;
  if _dept is not null and not exists(select 1 from departments d where d.id=_dept and d.school_id=_school) then raise exception 'القسم لا يتبع هذا الفرع'; end if;
  return query
    select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—')::text, _staff_title(m.school_id, m.user_id, m.role::text), s.name::text, dd.name::text
    from memberships m join schools s on s.id=m.school_id left join profiles p on p.id=m.user_id
      left join teachers tt on tt.user_id=m.user_id and tt.school_id=m.school_id
      left join departments dd on dd.id=coalesce(m.department_id, tt.department_id)
    where m.school_id=_school and s.is_active and m.is_active and m.user_id<>auth.uid()
      and m.role not in ('student','guardian','org_owner')
      and (_ticket is null or m.user_id <> (select requester from support_tickets where id=_ticket))
      and (_dept is null or coalesce(m.department_id, tt.department_id)=_dept)
      and (_q is null or length(trim(_q))<2 or p.full_name ilike '%'||trim(_q)||'%')
    order by m.user_id limit 200;
end $$;

create or replace function public.support_follower_candidates(_ticket uuid, _q text default null)
returns table(user_id uuid, name text, role text, school_name text, dept_name text)
language plpgsql stable security definer set search_path to 'public' as $$
declare t support_tickets; q text := nullif(btrim(coalesce(_q,'')),''); begin
  select * into t from support_tickets where id=_ticket;
  if t.id is null or t.scope<>'school' or not _support_tcan(t,'followers') then raise exception 'غير مصرح' using errcode='42501'; end if;
  if q is not null then q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  return query
    select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—')::text, _staff_title(m.school_id, m.user_id, m.role::text), s.name::text, dd.name::text
    from memberships m join schools s on s.id=m.school_id left join profiles p on p.id=m.user_id
      left join teachers tt on tt.user_id=m.user_id and tt.school_id=m.school_id
      left join departments dd on dd.id=coalesce(m.department_id, tt.department_id)
    where m.school_id=t.school_id and m.is_active and m.role not in ('student','guardian')
      and m.user_id<>t.requester and m.user_id is distinct from t.assignee
      and not exists(select 1 from support_followers f where f.ticket_id=t.id and f.user_id=m.user_id)
      and (q is null or p.full_name ilike '%'||q||'%')
    order by m.user_id limit 50;
end $$;

create or replace function public._adm_meet_target(_org uuid, _school uuid, _scope text, _t jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sch uuid[]; cats text[]; deps uuid[]; begin
  if _t is null or coalesce(_t->>'mode','') <> 'all' then return null; end if;
  if _scope = 'school' then sch := array[_school];
  elsif coalesce((_t->>'all_schools')::boolean,false) then select array_agg(id order by name) into sch from schools where org_id=_org and is_active;
  else
    select array_agg(distinct x::uuid) into sch from jsonb_array_elements_text(coalesce(_t->'schools','[]')) x;
    if exists(select 1 from unnest(coalesce(sch,'{}')) z where not exists(select 1 from schools s where s.id=z and s.org_id=_org and s.is_active)) then
      raise exception 'فرع خارج نطاق صلاحيتك' using errcode='42501'; end if;
  end if;
  if coalesce(array_length(sch,1),0)=0 then raise exception 'اختر فرعًا واحدًا على الأقل'; end if;
  select array_agg(distinct x) into cats from jsonb_array_elements_text(coalesce(_t->'categories','[]')) x;
  if coalesce(array_length(cats,1),0)=0 then raise exception 'اختر فئة واحدة على الأقل'; end if;
  if exists(select 1 from unnest(cats) c where c not in ('guardian','teacher','staff','maint_school','maint_bus')) then raise exception 'فئة غير مسموحة في الاجتماعات (الطلاب لا يُدعون)'; end if;
  select array_agg(distinct x::uuid) into deps from jsonb_array_elements_text(coalesce(_t->'departments','[]')) x;
  if exists(select 1 from unnest(coalesce(deps,'{}')) d where not exists(select 1 from departments z where z.id=d and z.school_id = any(sch))) then raise exception 'قسم غير صالح'; end if;
  return jsonb_build_object('mode','all','schools',to_jsonb(sch),'categories',to_jsonb(cats),'departments',to_jsonb(coalesce(deps,'{}')),'all_schools',coalesce((_t->>'all_schools')::boolean,false) and _scope='org');
end $$;
revoke all on function public._adm_meet_target(uuid,uuid,text,jsonb) from public, anon, authenticated;