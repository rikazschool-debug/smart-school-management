insert into public.perm_role_grants(role_id, section, action, scope)
select r.id, 'procurement', a, 'own'
from public.perm_roles r cross join unnest(array['view','create','edit','cancel']) a
where r.org_id is null and r.name in ('مسؤول صيانة مدارس','مسؤول صيانة باصات')
on conflict do nothing;