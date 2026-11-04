insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,g.sec,g.a,'branch' from public.perm_roles r join (values
 ('admissions','view'),('admissions','view_branch'),('admissions','decide')) g(sec,a) on true
where r.key='base_principal' and r.org_id is null
on conflict do nothing;