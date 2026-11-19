create or replace function private.family_request_guardian_match(_uid uuid, _org uuid, _q text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians g where g.user_id = _uid and school_org(g.school_id) = _org
    and (g.full_name ilike '%' || _q || '%' or g.display_name ilike '%' || _q || '%' or g.national_id ilike _q || '%'))
  or exists (select 1 from profiles p where p.id = _uid and p.full_name ilike '%' || _q || '%')
$$;
revoke all on function private.family_request_guardian_match(uuid, uuid, text) from public, anon;
grant execute on function private.family_request_guardian_match(uuid, uuid, text) to authenticated;

-- Search guardian requests by guardian name, student name or guardian ID. SECURITY INVOKER: family_requests RLS still decides visibility.
create or replace function public.family_request_find(_org uuid, _q text)
returns setof public.family_requests language sql stable security invoker set search_path = public as $$
  with t as (select nullif(btrim(replace(replace(replace(coalesce(_q, ''), '\', ''), '%', ''), '_', ' ')), '') as q)
  select r.* from family_requests r, t
  where r.org_id = _org
    and (t.q is null
      or exists (select 1 from students s where s.id = r.student_id and s.full_name ilike '%' || t.q || '%')
      or private.family_request_guardian_match(r.requested_by, r.org_id, t.q))
$$;
revoke all on function public.family_request_find(uuid, text) from public, anon;
grant execute on function public.family_request_find(uuid, text) to authenticated;