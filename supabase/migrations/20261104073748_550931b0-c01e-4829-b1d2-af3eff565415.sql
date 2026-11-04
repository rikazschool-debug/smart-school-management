alter table public.org_sections drop constraint org_sections_section_check;
alter table public.org_sections add constraint org_sections_section_check check (section = any (array['school_admin','finance','hr','operations','admissions']));
create or replace function public._ad_read(a ad_applications, _uid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(case when a.school_id is null then _ad_org_level(_uid, a.org_id)
    else _ad_ok(_uid, a.school_id, 'view_branch') or (a.assignee is not null and a.assignee = _uid and _ad_ok(_uid, a.school_id, 'view')) end, false) $$;
revoke all on function public._ad_read(ad_applications,uuid) from public, anon, authenticated;
do $$ declare d text; begin
  select pg_get_functiondef('public.ad_act(uuid,int,text,jsonb,text)'::regprocedure) into d;
  d := replace(d, $x$when 'reopen' then 'edit'$x$, $x$when 'reopen' then case when a.status in ('accepted','rejected') then 'decide' else 'edit' end$x$);
  execute d;
end $$;