alter table public.schools add column if not exists address text, add column if not exists phone text;

create or replace function public.school_profile_save(_school uuid, _address text, _phone text)
returns void language plpgsql security definer set search_path=public as $$
declare s schools; p text := nullif(regexp_replace(coalesce(_phone,''), '[^0-9+]', '', 'g'), '');
begin
  select * into s from schools where id=_school;
  if s.id is null then raise exception 'المدرسة غير موجودة'; end if;
  if not (is_platform_admin() or is_org_owner(s.org_id) or is_school_principal(_school)) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if length(coalesce(_address,'')) > 300 then raise exception 'العنوان طويل جدًا'; end if;
  if p is not null and length(p) not between 7 and 15 then raise exception 'رقم الهاتف غير صحيح'; end if;
  update schools set address=nullif(btrim(coalesce(_address,'')),''), phone=p, updated_at=now() where id=_school;
  perform _access_audit(s.org_id, _school, 'school_profile', auth.uid(), null, null,
    jsonb_build_object('address', s.address, 'phone', s.phone), jsonb_build_object('address', nullif(btrim(coalesce(_address,'')),''), 'phone', p), null);
end $$;
revoke all on function public.school_profile_save(uuid, text, text) from public, anon;
grant execute on function public.school_profile_save(uuid, text, text) to authenticated;

drop function if exists public.org_schools_overview(uuid);
create function public.org_schools_overview(_org uuid)
returns table(id uuid, name text, code text, city text, stage_type text, is_active boolean, staff jsonb, staff_total integer, students integer, paused integer, pending_invites integer, address text, phone text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_platform_admin() or is_org_owner(_org)) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  return query
  select s.id, s.name, s.code, s.city, s.stage_type, s.is_active,
    coalesce((select jsonb_object_agg(x.role, x.c) from (select m.role::text role, count(*)::int c from memberships m where m.school_id=s.id and m.is_active and m.role not in ('student','guardian') group by m.role) x), '{}'::jsonb),
    (select count(*)::int from memberships m where m.school_id=s.id and m.is_active and m.role not in ('student','guardian')),
    (select count(*)::int from students st where st.school_id=s.id and st.status='active'),
    (select count(*)::int from memberships m where m.school_id=s.id and m.branch_suspended),
    (select count(*)::int from invitations i where i.school_id=s.id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
    s.address, s.phone
  from schools s where s.org_id=_org order by s.is_active desc, s.name;
end $$;
revoke all on function public.org_schools_overview(uuid) from public, anon;
grant execute on function public.org_schools_overview(uuid) to authenticated;