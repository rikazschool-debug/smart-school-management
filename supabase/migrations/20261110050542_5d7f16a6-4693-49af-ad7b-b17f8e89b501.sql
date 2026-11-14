create table public.xb_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  mode text not null default 'off' check (mode in ('off','all','scoped')),
  schools uuid[] not null default '{}',
  roles text[] not null default '{}',
  updated_by uuid, updated_at timestamptz not null default now());
grant select on public.xb_settings to authenticated;
grant all on public.xb_settings to service_role;
alter table public.xb_settings enable row level security;
create policy "xb read own org" on public.xb_settings for select to authenticated
  using (exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id=xb_settings.org_id));

-- is _user allowed to take part in cross-branch staff messaging in _org?
create or replace function public._xb_ok(_org uuid, _user uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare s xb_settings; begin
  select * into s from xb_settings where org_id=_org;
  if s is null or s.mode='off' then return false; end if;
  return exists(
    select 1 from memberships m left join schools sch on sch.id=m.school_id
    where m.user_id=_user and m.is_active and not coalesce(m.branch_suspended,false)
      and m.role not in ('student','guardian')
      and (m.org_id=_org or sch.org_id=_org)
      and (m.role='org_owner' or s.mode='all' or (
        (cardinality(s.schools)=0 or m.school_id = any(s.schools))
        and (cardinality(s.roles)=0 or m.role::text = any(s.roles)))));
end $$;
revoke all on function public._xb_ok(uuid,uuid) from public, anon;

create or replace function public.xb_get(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r xb_settings; begin
  if not exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id=_org) then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into r from xb_settings where org_id=_org;
  return jsonb_build_object('mode', coalesce(r.mode,'off'), 'schools', coalesce(to_jsonb(r.schools),'[]'), 'roles', coalesce(to_jsonb(r.roles),'[]'), 'me', _xb_ok(_org, auth.uid()), 'owner', is_org_owner(_org));
end $$;

create or replace function public.xb_save(_org uuid, _mode text, _schools uuid[], _roles text[]) returns void
language plpgsql security definer set search_path=public as $$
declare b jsonb; begin
  if not is_org_owner(_org) then raise exception 'إعداد التواصل بين الفروع لمالك المجموعة فقط' using errcode='42501'; end if;
  if _mode not in ('off','all','scoped') then raise exception 'وضع غير صالح'; end if;
  if exists(select 1 from unnest(coalesce(_schools,'{}')) x where not exists(select 1 from schools s where s.id=x and s.org_id=_org)) then raise exception 'فرع خارج المجموعة'; end if;
  if exists(select 1 from unnest(coalesce(_roles,'{}')) x where x in ('student','guardian') or x not in (select unnest(enum_range(null::app_role))::text)) then raise exception 'دور غير صالح'; end if;
  select to_jsonb(x) into b from xb_settings x where org_id=_org;
  insert into xb_settings(org_id, mode, schools, roles, updated_by, updated_at) values (_org, _mode, coalesce(_schools,'{}'), coalesce(_roles,'{}'), auth.uid(), now())
    on conflict (org_id) do update set mode=excluded.mode, schools=excluded.schools, roles=excluded.roles, updated_by=excluded.updated_by, updated_at=now();
  perform _audit(_org, null, null, null, 'xb_settings', jsonb_build_object('before', b, 'mode', _mode, 'schools', _schools, 'roles', _roles));
end $$;
revoke all on function public.xb_get(uuid), public.xb_save(uuid,text,uuid[],text[]) from public, anon;
grant execute on function public.xb_get(uuid), public.xb_save(uuid,text,uuid[],text[]) to authenticated;

-- directory pool 'xbranch': eligible staff of every branch of the caller's org
create or replace function public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
 returns table(user_id uuid, school_id uuid, role text) language plpgsql stable security definer set search_path to 'public' as $function$
declare org uuid; begin
  if _purpose = 'xbranch' then
    org := coalesce(_org, school_org(_school));
    if org is null or not _xb_ok(org, auth.uid()) then raise exception 'التواصل بين الفروع غير مفعّل لحسابك' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=org and m.role not in ('student','guardian','org_owner')
        and m.user_id <> auth.uid() and _xb_ok(org, m.user_id);
    return;
  end if;
  if _purpose = 'visit_host' then
    if _school is null or not _gv_ok(_school,'manage') then raise exception 'اختيار المسؤول لمن يدير الزيارات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner');
    return;
  end if;
  if _purpose = 'evt_staff' then
    if _school is null or not (_evt_school_ok(_school,'course','settings') or _evt_school_ok(_school,'course','edit')) then raise exception 'التفويض لمن يملك صلاحية إعدادات الدورات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner') and m.user_id <> auth.uid();
    return;
  end if;
  return query select * from _people_pool_v6(_purpose, _school, _org, _post);
end $function$;

-- org-level private chat between two staff of different branches (school_id null => no branch data access)
create or replace function public.start_xbranch_conversation(_org uuid, _other uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; key text; begin
  perform _bt_guard('bt_chat_direct','use');
  if _other is null or _other = auth.uid() then raise exception 'لا يمكن مراسلة نفسك'; end if;
  if not _xb_ok(_org, auth.uid()) then raise exception 'التواصل بين الفروع غير مفعّل لحسابك' using errcode='42501'; end if;
  if not _xb_ok(_org, _other) or exists(select 1 from memberships m where m.user_id=_other and m.role in ('student','guardian') and m.is_active and not exists(select 1 from memberships k where k.user_id=_other and k.is_active and k.role not in ('student','guardian'))) then
    raise exception 'الزميل غير متاح للتواصل بين الفروع' using errcode='42501'; end if;
  key := 'xdirect:' || _org || ':' || least(auth.uid(), _other) || ':' || greatest(auth.uid(), _other);
  insert into conversations(org_id, school_id, kind, dedupe_key, created_by) values (_org, null, 'direct', key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select id into cid from conversations where dedupe_key=key; end if;
  perform _add_member(cid, auth.uid(), 'member', 'relation', '-infinity');
  perform _add_member(cid, _other, 'member', 'relation', '-infinity');
  return cid;
end $$;
revoke all on function public.start_xbranch_conversation(uuid,uuid) from public, anon;
grant execute on function public.start_xbranch_conversation(uuid,uuid) to authenticated;

-- sending in an org-level direct chat re-checks the cross-branch scope for every member
create or replace function public.conv_send_block(_conv uuid) returns text
language plpgsql stable security definer set search_path to 'public' as $function$
declare c record; begin
  select kind, group_type, school_id, org_id, dedupe_key into c from conversations where id=_conv;
  if c.kind in ('direct','family','student') and _bt_off('bt_chat_direct','use') then return 'أوقف مالك المؤسسة المحادثات الخاصة لحسابك؛ يمكنك القراءة فقط'; end if;
  if c.kind='group' and c.group_type in ('section','class','course') and _bt_off('bt_chat_groups','use') then return 'أوقف مالك المؤسسة الإرسال في مجموعات الشعب لحسابك'; end if;
  if c.kind='direct' and c.school_id is null and c.dedupe_key like 'xdirect:%' then
    if exists(select 1 from conversation_members o where o.conversation_id=_conv and o.left_at is null and not _xb_ok(c.org_id, o.user_id)) then
      return 'التواصل بين الفروع لم يعد متاحًا لأحد الطرفين؛ المحادثة للقراءة فقط'; end if;
  end if;
  return _conv_send_block_v1(_conv);
end $function$;