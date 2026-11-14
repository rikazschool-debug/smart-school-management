create or replace function public._perm_catalog_v17() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','cs_comm','label','التواصل — خدمة العملاء','parent','support',
      'actions',jsonb_build_array('message'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('message','مراسلة أي موظف أو ولي أمر في المدارس المصرح بها'))))
  from (select _perm_catalog_v16() b offset 0) x $$;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_set(c, '{sections}', (select jsonb_agg(case when s->>'key'='hr_employees'
      then jsonb_set(jsonb_set(s,'{actions}',(s->'actions')||'["print"]'::jsonb),'{labels,print}', to_jsonb('طباعة ملفات الموظفين (فردي وجماعي)'::text))
      else s end order by o) from jsonb_array_elements(c->'sections') with ordinality t(s,o)))
  from (select _perm_catalog_v17() c offset 0) x
$function$;
revoke all on function public._perm_catalog_v17() from public, anon, authenticated;

insert into public.perm_role_grants(role_id,section,action,scope)
select r.id, g.sec, g.a, 'org' from public.perm_roles r, (values
  ('support','view'),('support','create'),('support','assign'),('support','transfer'),('support','status'),('support','follow'),('support','followers'),('support','export'),('support','settings'),
  ('calls','view'),('calls','own'),('calls','link'),('calls','listen'),('calls','download'),('calls','export'),('cs_comm','message')) g(sec,a)
where r.key='cs_agent' and r.org_id is null
on conflict do nothing;

create or replace function public._cs_contact_ok(_school uuid, _uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select _school is not null and _uid is not null and (_perm_owner(_uid, school_org(_school)) or _perm_allows_user(_school, _uid, 'cs_comm', 'message')) $$;
revoke all on function public._cs_contact_ok(uuid,uuid) from public, anon, authenticated;

create or replace function public.cs_comm_me(_org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and exists(select 1 from schools s where s.org_id=_org and s.is_active and _cs_contact_ok(s.id, auth.uid())) $$;

create or replace function public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
 returns table(user_id uuid, school_id uuid, role text) language plpgsql stable security definer set search_path to 'public' as $function$
declare org uuid; begin
  if _purpose = 'cs_contact' then
    org := coalesce(_org, school_org(_school));
    if org is null or not cs_comm_me(org) then raise exception 'مراسلات خدمة العملاء غير مفعّلة لحسابك' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=org and s.is_active and m.role not in ('student')
        and m.user_id <> auth.uid() and (_school is null or m.school_id=_school) and _cs_contact_ok(m.school_id, auth.uid());
    return;
  end if;
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

-- other person reachable by this officer in at least one allowed branch
create or replace function public._cs_reach(_org uuid, _agent uuid, _other uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from memberships m join schools s on s.id=m.school_id where m.user_id=_other and m.is_active and not coalesce(m.branch_suspended,false)
    and s.org_id=_org and s.is_active and m.role <> 'student' and _cs_contact_ok(m.school_id, _agent)) $$;
revoke all on function public._cs_reach(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function public.cs_start_conversation(_org uuid, _other uuid) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare cid uuid; key text; begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _other = auth.uid() then raise exception 'لا يمكن مراسلة نفسك'; end if;
  if not _cs_reach(_org, auth.uid(), _other) then raise exception 'هذا الشخص خارج المدارس المصرح لك بمراسلتها' using errcode='42501'; end if;
  key := 'csdirect:' || _org || ':' || auth.uid() || ':' || _other;
  insert into conversations(org_id, school_id, kind, dedupe_key, created_by) values (_org, null, 'direct', key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select id into cid from conversations where dedupe_key=key; end if;
  perform _add_member(cid, auth.uid(), 'member', 'relation', '-infinity');
  perform _add_member(cid, _other, 'member', 'relation', '-infinity');
  perform _audit(_org, null, cid, null, 'cs_contact_start', jsonb_build_object('other', _other));
  return cid;
end $$;

create or replace function public.conv_send_block(_conv uuid) returns text language plpgsql stable security definer set search_path to 'public' as $function$
declare c record; ag uuid; ot uuid; begin
  select kind, group_type, school_id, org_id, dedupe_key, status, created_by into c from conversations where id=_conv;
  if c.kind in ('direct','family','student') and _bt_off('bt_chat_direct','use') then return 'أوقف مالك المؤسسة المحادثات الخاصة لحسابك؛ يمكنك القراءة فقط'; end if;
  if c.kind='group' and c.group_type in ('section','class','course') and _bt_off('bt_chat_groups','use') then return 'أوقف مالك المؤسسة الإرسال في مجموعات الشعب لحسابك'; end if;
  if c.kind='direct' and c.school_id is null and c.dedupe_key like 'csdirect:%' then
    if not exists(select 1 from conversation_members where conversation_id=_conv and user_id=auth.uid() and left_at is null) or not conv_access_ok(_conv) then return 'لست عضوًا في هذه المحادثة'; end if;
    if c.status='archived' then return 'المحادثة مؤرشفة؛ الإرسال متوقف'; end if;
    ag := split_part(c.dedupe_key, ':', 3)::uuid; ot := split_part(c.dedupe_key, ':', 4)::uuid;
    if not _cs_reach(c.org_id, ag, ot) then return 'انتهت صلاحية مراسلة خدمة العملاء لهذا الشخص؛ المحادثة للقراءة فقط'; end if;
    return null;
  end if;
  if c.kind='direct' and c.school_id is null and c.dedupe_key like 'xdirect:%' then
    if exists(select 1 from conversation_members o where o.conversation_id=_conv and o.left_at is null and not _xb_ok(c.org_id, o.user_id)) then
      return 'التواصل بين الفروع لم يعد متاحًا لأحد الطرفين؛ المحادثة للقراءة فقط'; end if;
  end if;
  return _conv_send_block_v1(_conv);
end $function$;

revoke all on function public.cs_comm_me(uuid), public.cs_start_conversation(uuid,uuid) from public, anon;
grant execute on function public.cs_comm_me(uuid), public.cs_start_conversation(uuid,uuid) to authenticated;