insert into public.perm_role_grants(role_id, section, action, scope)
select r.id, s.section, 'request', 'branch'
from public.perm_roles r
join (values ('مسؤول متابعة صيانة المدارس','maint_school'),('مسؤول متابعة صيانة الباصات','maint_bus'),('مسؤول متابعة الصيانة','maint_school'),('مسؤول متابعة الصيانة','maint_bus')) s(name, section) on s.name = r.name
where r.org_id is null
on conflict do nothing;