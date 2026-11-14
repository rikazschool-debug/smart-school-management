insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,g.s,g.a,'branch' from public.perm_roles r, (values ('maint_school','request'),('maint_school','view'),('maint_bus','view')) g(s,a)
where r.key='base_principal' and r.org_id is null on conflict do nothing;