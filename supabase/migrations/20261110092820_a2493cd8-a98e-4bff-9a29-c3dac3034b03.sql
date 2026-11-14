insert into public.perm_role_grants(role_id, section, action, scope) values
 ('e4467c6d-d807-4046-aa7c-a14de51523cc','people_staff','view','branch'),
 ('e4467c6d-d807-4046-aa7c-a14de51523cc','people_family','view','branch'),
 ('618a4acf-be7c-4204-85dc-d551fb41b696','people_family','view','branch'),
 ('8daa70b9-8cc7-4015-95ee-e43b535a977e','people_family','view','branch'),
 ('8daa70b9-8cc7-4015-95ee-e43b535a977e','people_family','edit','branch')
on conflict do nothing;