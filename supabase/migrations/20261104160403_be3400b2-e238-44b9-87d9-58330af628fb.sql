insert into public.perm_role_grants(role_id,section,action,scope)
select r.id, g.sec, g.a, 'branch' from public.perm_roles r join (values
 ('ev_summary','view'),('ev_summary','export'),('ev_guardian','view'),('ev_guardian','export'),
 ('ev_visits','view'),('ev_visits','execute'),('ev_visits','approve'),('ev_visits','edit'),
 ('ev_monthly','view'),('ev_monthly','execute'),('ev_monthly','approve'),('ev_monthly','edit'),('ev_monthly','export')) g(sec,a) on true
where r.key='base_principal' and r.org_id is null
on conflict do nothing;
insert into public.perm_roles(key,name,description,base_role) values
 ('base_supervisor','مشرف تربوي','ما يملكه المشرف اليوم: تنفيذ الزيارات الصفية لمعلميه المسندين فقط','supervisor')
on conflict (key) where org_id is null do nothing;
insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,'ev_visits','execute','assigned' from public.perm_roles r where r.key='base_supervisor' and r.org_id is null
on conflict do nothing;