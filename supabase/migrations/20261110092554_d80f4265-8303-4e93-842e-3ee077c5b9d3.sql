-- restore the broad helper (used by reads and attendance tools)
create or replace function public.can_manage_students(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_school(_school) or public.has_school_role(_school, array['student_affairs']::public.app_role[]) $$;
create or replace function public.staff_view(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_students(_school) or public.perm_allows(_school, 'people_family', 'view') $$;

-- record edits follow people_family.edit (owner, student affairs by default; owner-grantable)
create or replace function public.can_edit_students(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.is_org_owner(public.school_org(_school)) or public.perm_allows(_school, 'people_family', 'edit') $$;
revoke all on function public.can_edit_students(uuid) from public, anon;
grant execute on function public.can_edit_students(uuid) to authenticated, service_role;

do $$ declare t text; c text; p text; q text; w text; r record; begin
  for r in select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public'
    and tablename in ('students','guardians','student_guardians','enrollments') and cmd in ('INSERT','UPDATE','DELETE') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    if r.cmd='INSERT' then execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.policyname, r.tablename, replace(r.with_check,'can_manage_students(','can_edit_students('));
    elsif r.cmd='UPDATE' then execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.policyname, r.tablename, replace(r.qual,'can_manage_students(','can_edit_students('), replace(coalesce(r.with_check,r.qual),'can_manage_students(','can_edit_students('));
    else execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.policyname, r.tablename, replace(r.qual,'can_manage_students(','can_edit_students(')); end if;
  end loop;
  for r in select p.oid from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('import_guardian_row','upsert_student_guardian','verify_guardian_link') loop
    execute replace(pg_get_functiondef(r.oid), 'can_manage_students(', 'can_edit_students(');
  end loop;
end $$;