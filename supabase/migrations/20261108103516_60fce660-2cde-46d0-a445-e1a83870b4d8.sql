alter table public.schools add column if not exists logo_path text;

create or replace function public.is_org_owner(_org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from platform_admins where user_id=auth.uid())
      or exists(select 1 from memberships where user_id=auth.uid() and org_id=_org and role='org_owner' and is_active) $$;

create or replace function public._perm_owner(_uid uuid, _org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from platform_admins where user_id=_uid)
      or exists(select 1 from memberships where user_id=_uid and org_id=_org and role='org_owner' and is_active) $$;

create or replace function public.perm_scope(_org uuid, _user uuid, _section text, _action text)
 returns text language plpgsql stable security definer set search_path to 'public' as $function$
declare best text;
begin
  if _perm_area(_section) is not null and not section_enabled(_org, _perm_area(_section)) then return null; end if;
  if _perm_owner(_user, _org) then return 'org'; end if;
  if not _perm_staff(_org,_user) then return null; end if;
  if exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section=_section and action=_action and effect='deny') then return null; end if;
  select s into best from (
    select g.scope s from perm_assignments a join perm_roles r on r.id=a.role_id and r.archived_at is null
      join perm_role_grants g on g.role_id=r.id and g.section=_section and g.action=_action
     where a.org_id=_org and a.user_id=_user
    union all select scope from perm_overrides where org_id=_org and user_id=_user and section=_section and action=_action and effect='grant') x
   order by _scope_rank(s) desc limit 1;
  return best;
end $function$;

create or replace function public.set_active_context(_role text, _school uuid) returns void language plpgsql security definer set search_path to 'public' as $function$
declare o uuid; begin
  if _role = 'platform_admin' or (_role = 'org_owner' and is_platform_admin()) then
    if not is_platform_admin() then raise exception 'سياق غير صالح'; end if;
  elsif not exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.role::text=_role
        and (m.school_id is not distinct from _school or (m.role='org_owner' and (_school is null or exists(select 1 from schools s where s.id=_school and s.org_id=m.org_id))))) then
    raise exception 'سياق غير صالح';
  end if;
  select org_id into o from schools where id=_school;
  insert into user_active_context(user_id, role, school_id, org_id) values (auth.uid(), _role, _school, o)
    on conflict (user_id) do update set role=excluded.role, school_id=excluded.school_id, org_id=excluded.org_id, updated_at=now();
end $function$;

create or replace function public.conv_access_ok(_conv uuid) returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(select 1 from conversations c where c.id=_conv and (
      exists(select 1 from platform_admins where user_id=auth.uid())
      or (c.school_id is not null and exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and (m.school_id=c.school_id or (m.role='org_owner' and m.org_id=c.org_id))))
      or (c.school_id is null and exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id=c.org_id)))
    and (c.kind<>'family' or c.staff_user_id=auth.uid() or exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
         where sg.guardian_id=c.guardian_id and sg.student_id=c.student_id and g.user_id=auth.uid() and sg.verified and sg.can_follow))
    and (c.kind<>'student' or c.staff_user_id=auth.uid() or exists(select 1 from students st where st.id=c.student_id and st.user_id=auth.uid())))
$function$;

-- staff provisioning: platform admin acts as owner
do $$ declare src text; f oid; begin
  for f in select p.oid from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('_staff_provision','_staff_reset') loop
    src := pg_get_functiondef(f);
    src := replace(src, 'if not exists(select 1 from memberships m where m.user_id=_actor and m.org_id=_org and m.role=''org_owner'' and m.is_active) then',
                        'if not _perm_owner(_actor, _org) then');
    execute src;
  end loop;
end $$;

create or replace function public.school_set_logo(_school uuid, _path text) returns void language plpgsql security definer set search_path to 'public' as $$
declare r schools; begin
  select * into r from schools where id=_school for update;
  if r.id is null or not is_org_owner(r.org_id) then raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode='42501'; end if;
  if _path is not null and split_part(_path,'/',1) <> _school::text then raise exception 'مسار غير صالح'; end if;
  update schools set logo_path=_path, updated_at=now() where id=_school;
  perform _access_audit(r.org_id, r.id, 'school_logo', null, null, null, jsonb_build_object('logo', r.logo_path), jsonb_build_object('logo', _path), null);
end $$;
revoke all on function public.school_set_logo(uuid,text) from public, anon;
grant execute on function public.school_set_logo(uuid,text) to authenticated;

create policy "school logos read by org members" on storage.objects for select to authenticated
  using (bucket_id='school-logos' and (is_platform_admin() or exists(select 1 from memberships m join schools s on s.org_id=m.org_id
    where m.user_id=auth.uid() and m.is_active and s.id::text=split_part(name,'/',1))));
create policy "school logos written by owner" on storage.objects for insert to authenticated
  with check (bucket_id='school-logos' and exists(select 1 from schools s where s.id::text=split_part(name,'/',1) and is_org_owner(s.org_id)));
create policy "school logos deleted by owner" on storage.objects for delete to authenticated
  using (bucket_id='school-logos' and exists(select 1 from schools s where s.id::text=split_part(name,'/',1) and is_org_owner(s.org_id)));