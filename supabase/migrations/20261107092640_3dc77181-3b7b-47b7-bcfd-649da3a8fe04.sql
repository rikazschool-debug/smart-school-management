-- Bring the ready-made role templates back in line with the base role rules (support, guardian visits, identity).
insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,g.sec,g.a,'branch' from public.perm_roles r join (values
 ('base_principal','support','view'),('base_principal','support','create'),('base_principal','support','assign'),('base_principal','support','status'),
 ('base_principal','support','follow'),('base_principal','support','followers'),('base_principal','support','export'),
 ('base_principal','guardian_visits','view'),('base_principal','guardian_visits','manage'),('base_principal','guardian_visits','settings'),('base_principal','guardian_visits','reception'),
 ('base_principal','people_identity','view'),('base_principal','people_identity','edit'),
 ('base_vice','guardian_visits','view'),('base_vice','guardian_visits','manage'),('base_vice','guardian_visits','settings'),('base_vice','guardian_visits','reception'),
 ('base_security','guardian_visits','reception')) g(k,sec,a) on g.k=r.key and r.org_id is null
on conflict do nothing;