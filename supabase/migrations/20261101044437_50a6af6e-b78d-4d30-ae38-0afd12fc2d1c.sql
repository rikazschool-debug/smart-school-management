create or replace function public.create_group(_org uuid, _school uuid, _title text, _description text, _group_type text, _membership_mode text,
  _department uuid, _post_policy text, _allow_attachments boolean, _history_policy text, _expires_at date, _year uuid,
  _members uuid[], _moderators uuid[], _owner uuid default null, _request_key text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; org uuid := coalesce(school_org(_school), _org); owner uuid := coalesce(_owner, auth.uid()); u uuid; allowed boolean; begin
  if _school is not null and _org is not null and school_org(_school)<>_org then raise exception 'المدرسة لا تتبع المؤسسة'; end if;
  allowed := _scope_manager(org, _school)
    or (_school is not null and _group_type='department' and _department is not null
        and coalesce((select dept_head_groups from comm_settings where school_id=_school), false)
        and exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=_school and m.is_active and m.role='dept_head' and m.department_id=_department));
  if not allowed then raise exception 'ليست لديك صلاحية إنشاء مجموعة في هذا النطاق'; end if;
  if length(btrim(coalesce(_title,''))) < 2 then raise exception 'اسم المجموعة مطلوب'; end if;
  if _membership_mode='derived' and (_department is null or _school is null) then raise exception 'العضوية المشتقة تتطلب قسمًا داخل مدرسة'; end if;
  if _department is not null and not exists(select 1 from departments d where d.id=_department and d.school_id=_school) then raise exception 'القسم لا يتبع هذه المدرسة'; end if;
  if _request_key is not null then select id into cid from conversations where dedupe_key='group:' || auth.uid() || ':' || _request_key; if cid is not null then return cid; end if; end if;
  if not _eligible_staff(org, _school, owner) then raise exception 'المالك المختار خارج نطاق المجموعة'; end if;
  insert into conversations(org_id, school_id, kind, group_type, title, description, department_id, membership_mode, post_policy, allow_attachments, history_policy, expires_at, year_id, dedupe_key)
    values (org, _school, 'group', coalesce(_group_type,'custom'), btrim(_title), _description, _department, coalesce(_membership_mode,'manual'), coalesce(_post_policy,'all'),
            coalesce(_allow_attachments,true), coalesce(_history_policy,'from_join'), _expires_at, _year,
            case when _request_key is null then null else 'group:' || auth.uid() || ':' || _request_key end)
    returning id into cid;
  insert into conversation_members(conversation_id, user_id, role, source, visible_from, added_by) values (cid, owner, 'owner', 'manual', '-infinity', auth.uid());
  foreach u in array coalesce(_moderators,'{}') loop
    if not _eligible_staff(org, _school, u) then raise exception 'مستخدم خارج نطاق المجموعة'; end if;
    perform _add_member(cid, u, 'moderator', 'manual', '-infinity');
  end loop;
  foreach u in array coalesce(_members,'{}') loop
    if not _eligible_staff(org, _school, u) then raise exception 'مستخدم خارج نطاق المجموعة'; end if;
    perform _add_member(cid, u, 'member', 'manual', '-infinity');
  end loop;
  perform sync_derived_group(cid);
  for u in select user_id from conversation_members where conversation_id=cid and user_id<>auth.uid() and left_at is null loop
    perform _notify(u, _school, 'group', 'أُضفت إلى مجموعة: ' || btrim(_title), null, _conv_link(cid), 'grp-add:' || cid || ':' || u);
  end loop;
  perform _audit(org, _school, cid, null, 'group_create', jsonb_build_object('title', _title, 'mode', _membership_mode, 'members', (select count(*) from conversation_members where conversation_id=cid)));
  return cid;
end $$;