-- Customer service agent: perm section, template, login role
alter function public.perm_catalog() rename to _perm_catalog_v12;
revoke all on function public._perm_catalog_v12() from public, anon, authenticated;
create function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','customer_service','label','خدمة العملاء','parent','school_admin',
      'actions',jsonb_build_array('handle'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('handle','عرض التذاكر المسندة إليه والرد عليها وتحديث حالتها'))))
  from (select _perm_catalog_v12() b) x $$;
grant execute on function public.perm_catalog() to authenticated;

insert into public.perm_roles(org_id, key, name, description)
select null, 'cs_agent', 'مسؤول خدمة العملاء', 'قسم خدمة العملاء: التذاكر المسندة إليه فقط (عرض/رد/تحديث الحالة)؛ لا موارد بشرية ولا رواتب ولا تذاكر الآخرين'
where not exists (select 1 from public.perm_roles where org_id is null and key='cs_agent');
insert into public.perm_role_grants(role_id, section, action, scope)
select r.id, 'customer_service', 'handle', 'branch' from public.perm_roles r
where r.org_id is null and r.key='cs_agent'
  and not exists (select 1 from public.perm_role_grants x where x.role_id=r.id and x.section='customer_service');

create or replace function public._hr_login_roles(_org uuid, _school uuid) returns text[]
language sql stable security definer set search_path to 'public' as $$
  select case
    when is_org_owner(_org) then array['principal','vice_principal','dept_head','supervisor','student_affairs','teacher','counselor','nurse','security',
      'tpl:مسؤول صيانة مدارس','tpl:مسؤول صيانة باصات','tpl:مسؤول متابعة صيانة المدارس','tpl:مسؤول مشتريات','tpl:مسؤول متابعة صيانة الباصات','tpl:مسؤول حركة النقل بالمدرسة','tpl:مسؤول القبول والتسجيل',
      'tpl:مساعد إداري','tpl:مدير إدارة الموارد البشرية','tpl:مسؤول خدمة العملاء']
    when _school is not null and (_hr_org_ok(_org,'create') or _hr_school_ok(_school,'create')) then array['teacher','counselor','nurse','security','student_affairs']
    else array[]::text[] end $$;