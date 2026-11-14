alter table public.memberships add column if not exists branch_suspended boolean not null default false;

-- Nobody becomes active in a suspended branch (covers invitations, activation, provisioning).
create or replace function public._branch_guard_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active and new.school_id is not null and new.role <> 'org_owner'
     and exists(select 1 from schools s where s.id=new.school_id and not s.is_active) then
    raise exception 'هذا الفرع موقوف؛ أعد تفعيله أولًا';
  end if;
  if new.is_active then new.branch_suspended := false; end if;
  return new;
end $$;
drop trigger if exists branch_guard on public.memberships;
create trigger branch_guard before insert or update of is_active, school_id on public.memberships for each row execute function public._branch_guard_trg();

-- School writes only through owner RPCs.
drop policy if exists "school insert" on public.schools;
drop policy if exists "school update" on public.schools;
revoke insert, update, delete on public.schools from authenticated, anon;

create or replace function public.org_school_save(_org uuid, _id uuid, _name text, _code text default null, _city text default null, _stage_type text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare r schools; nid uuid; nm text := nullif(trim(coalesce(_name,'')),'');
begin
  if nm is null then raise exception 'اسم المدرسة مطلوب'; end if;
  if _id is null then
    if not (is_platform_admin() or is_org_owner(_org)) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
    if exists(select 1 from schools where org_id=_org and lower(name)=lower(nm)) then raise exception 'توجد مدرسة بالاسم نفسه في المؤسسة'; end if;
    insert into schools(org_id, name, code, city, stage_type) values (_org, nm, nullif(trim(_code),''), nullif(trim(_city),''), nullif(trim(_stage_type),'')) returning id into nid;
    perform _access_audit(_org, nid, 'school_create', null, null, null, null, jsonb_build_object('name', nm, 'code', _code, 'city', _city, 'stage_type', _stage_type), null);
    return nid;
  end if;
  select * into r from schools where id=_id for update;
  if r.id is null or r.org_id <> _org or not (is_platform_admin() or is_org_owner(r.org_id)) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if exists(select 1 from schools where org_id=r.org_id and id<>r.id and lower(name)=lower(nm)) then raise exception 'توجد مدرسة بالاسم نفسه في المؤسسة'; end if;
  update schools set name=nm, code=nullif(trim(_code),''), city=nullif(trim(_city),''), stage_type=nullif(trim(_stage_type),'') where id=_id;
  perform _access_audit(r.org_id, r.id, 'school_update', null, null, null,
    jsonb_build_object('name', r.name, 'code', r.code, 'city', r.city, 'stage_type', r.stage_type),
    jsonb_build_object('name', nm, 'code', _code, 'city', _city, 'stage_type', _stage_type), null);
  return _id;
end $$;

create or replace function public.org_school_set_active(_id uuid, _active boolean, _reason text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare r schools; n integer := 0;
begin
  select * into r from schools where id=_id for update;
  if r.id is null or not (is_platform_admin() or is_org_owner(r.org_id)) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if r.is_active = _active then return 0; end if;
  if not _active then
    if nullif(trim(coalesce(_reason,'')),'') is null then raise exception 'سبب الإيقاف مطلوب'; end if;
    if not exists(select 1 from schools where org_id=r.org_id and is_active and id<>r.id) then raise exception 'لا يمكن إيقاف آخر فرع نشط في المؤسسة'; end if;
    update schools set is_active=false where id=_id;
    update memberships set is_active=false, branch_suspended=true where school_id=_id and is_active and role<>'org_owner';
    get diagnostics n = row_count;
    perform _access_audit(r.org_id, r.id, 'school_suspend', null, null, null, jsonb_build_object('is_active', true), jsonb_build_object('is_active', false, 'paused_accounts', n), trim(_reason));
  else
    update schools set is_active=true where id=_id;
    update memberships set is_active=true where school_id=_id and branch_suspended;
    get diagnostics n = row_count;
    perform _access_audit(r.org_id, r.id, 'school_activate', null, null, null, jsonb_build_object('is_active', false), jsonb_build_object('is_active', true, 'restored_accounts', n), nullif(trim(coalesce(_reason,'')),''));
  end if;
  return n;
end $$;

create or replace function public.org_schools_overview(_org uuid)
returns table(id uuid, name text, code text, city text, stage_type text, is_active boolean, staff jsonb, staff_total integer, students integer, paused integer, pending_invites integer)
language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_platform_admin() or is_org_owner(_org)) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  return query
  select s.id, s.name, s.code, s.city, s.stage_type, s.is_active,
    coalesce((select jsonb_object_agg(x.role, x.c) from (select m.role::text role, count(*)::int c from memberships m where m.school_id=s.id and m.is_active and m.role not in ('student','guardian') group by m.role) x), '{}'::jsonb),
    (select count(*)::int from memberships m where m.school_id=s.id and m.is_active and m.role not in ('student','guardian')),
    (select count(*)::int from students st where st.school_id=s.id and st.status='active'),
    (select count(*)::int from memberships m where m.school_id=s.id and m.branch_suspended),
    (select count(*)::int from invitations i where i.school_id=s.id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
  from schools s where s.org_id=_org order by s.is_active desc, s.name;
end $$;

revoke all on function public.org_school_save(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.org_school_set_active(uuid, boolean, text) from public, anon;
revoke all on function public.org_schools_overview(uuid) from public, anon;
revoke all on function public._branch_guard_trg() from public, anon, authenticated;
grant execute on function public.org_school_save(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.org_school_set_active(uuid, boolean, text) to authenticated;
grant execute on function public.org_schools_overview(uuid) to authenticated;