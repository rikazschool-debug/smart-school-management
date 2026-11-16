create or replace function public._ad_me_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as $$ select public._ad_ok(auth.uid(), _school, _action) $$;
revoke all on function public._ad_me_ok(uuid,text) from public, anon;
grant execute on function public._ad_me_ok(uuid,text) to authenticated;
drop policy if exists family_requests_read on public.family_requests;
create policy family_requests_read on public.family_requests for select to authenticated using (((requested_by = auth.uid()) and is_guardian_of(student_id) and (school_org(school_id) = org_id)) or public._ad_me_ok(school_id,'view') or public._ad_me_ok(school_id,'view_branch'));
drop policy if exists family_requests_decide on public.family_requests;
create policy family_requests_decide on public.family_requests for update to authenticated using (public._ad_me_ok(school_id,'decide')) with check (public._ad_me_ok(school_id,'decide'));