create function public._ws_not_denied(_school uuid,_section text) returns boolean language sql stable security definer set search_path=public as $$ select auth.uid() is not null and not _perm_denied(school_org(_school),auth.uid(),_section,'view') $$;
revoke all on function public._ws_not_denied(uuid,text) from public,anon;
grant execute on function public._ws_not_denied(uuid,text) to authenticated,service_role;
comment on function public._ws_not_denied(uuid,text) is 'Intentional authenticated SECURITY DEFINER current-session boolean used by restrictive academic RLS; no caller supplied user and no writes.';
do $$ declare r record; begin
 for r in select * from (values ('academic_years','academic_years'),('terms','academic_terms'),('stages','academic_stages'),('grades','academic_grades'),('sections','academic_sections'),('departments','academic_departments'),('subjects','academic_subjects')) t(tbl,sec) loop
 execute format('alter policy "workspace read denial" on public.%I using (public._ws_not_denied(school_id,%L))',r.tbl,r.sec);
 end loop;
end $$;
create function public.workspace_teacher_accounts(_school uuid) returns table(id uuid,has_account boolean) language sql stable security definer set search_path=public as $$ select t.id,t.user_id is not null from teachers t join workspace_teacher_options(_school) o on o.id=t.id $$;
revoke all on function public.workspace_teacher_accounts(uuid) from public,anon;
grant execute on function public.workspace_teacher_accounts(uuid) to authenticated,service_role;
comment on function public.workspace_teacher_accounts(uuid) is 'Intentional authenticated SECURITY DEFINER boolean account presence for teachers already visible in workspace_teacher_options; no identity ids or private personnel fields.';
notify pgrst,'reload schema';