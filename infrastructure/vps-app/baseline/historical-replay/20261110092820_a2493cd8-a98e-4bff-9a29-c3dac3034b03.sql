insert into public.perm_role_grants(role_id, section, action, scope) values
 ((select id from public.perm_roles where key='base_principal' and org_id is null),'people_staff','view','branch'),
 ((select id from public.perm_roles where key='base_principal' and org_id is null),'people_family','view','branch'),
 ((select id from public.perm_roles where key='base_vice' and org_id is null),'people_family','view','branch'),
 ((select id from public.perm_roles where key='base_student_affairs' and org_id is null),'people_family','view','branch'),
 ((select id from public.perm_roles where key='base_student_affairs' and org_id is null),'people_family','edit','branch')
on conflict do nothing;