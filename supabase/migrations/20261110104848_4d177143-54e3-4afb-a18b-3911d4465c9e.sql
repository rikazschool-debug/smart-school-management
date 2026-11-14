
-- ===== Family/student contact rules: administration + student counselor only =====
create or replace function public._family_admin_roles(_school uuid) returns app_role[]
language sql stable security definer set search_path = public as $$
  select array(select distinct r from unnest(coalesce((select family_admin_roles from comm_settings where school_id = _school),
    '{principal,vice_principal,student_affairs}'::app_role[]) || '{counselor}'::app_role[]) r)
$$;

create or replace function public._contact_label(_r app_role) returns text language sql immutable set search_path = public as $$
  select case _r when 'principal' then 'مدير المدرسة' when 'vice_principal' then 'الوكيل' when 'student_affairs' then 'شؤون الطلاب'
    when 'counselor' then 'المرشد الطلابي / الموجّه الطلابي' when 'org_owner' then 'إدارة المجموعة' else _r::text end
$$;

create or replace function public._family_ok(_student uuid, _guardian uuid, _staff uuid, _kind text)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
      where sg.student_id=_student and sg.guardian_id=_guardian and sg.verified and sg.can_follow and g.user_id is not null
        and exists(select 1 from memberships m where m.user_id=g.user_id and m.school_id=sg.school_id and m.is_active))
  and case _kind
    when 'teacher' then exists(select 1 from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
        join teacher_assignments a on a.course_id=c.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date)
        join teachers t on t.id=a.teacher_id
        where e.student_id=_student and e.status='active' and t.user_id=_staff and t.status='active'
          and exists(select 1 from memberships m where m.user_id=_staff and m.school_id=e.school_id and m.is_active))
    when 'admin' then exists(select 1 from enrollments e join memberships m on m.school_id=e.school_id
        where e.student_id=_student and e.status='active' and m.user_id=_staff and m.is_active
          and m.role = any(_family_admin_roles(e.school_id)))
    else false end
$function$;

-- student ↔ administration of the student's current school (from the active enrollment)
create or replace function public._student_admin_ok(_student uuid, _staff uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from students st join enrollments e on e.student_id=st.id and e.status='active'
      join memberships m on m.school_id=e.school_id and m.user_id=_staff and m.is_active and m.role = any(_family_admin_roles(e.school_id))
    where st.id=_student and st.user_id is not null
      and exists(select 1 from memberships sm where sm.user_id=st.user_id and sm.school_id=e.school_id and sm.is_active))
$$;

-- guardian new chat: only permitted administration of the chosen child's school (never teachers)
create or replace function public.guardian_contacts(_student uuid)
 returns table(user_id uuid, full_name text, label text, kind text)
 language sql stable security definer set search_path to 'public' as $function$
  with me as (select g.id gid from guardians g join student_guardians sg on sg.guardian_id=g.id where g.user_id=auth.uid() and sg.student_id=_student and sg.verified and sg.can_follow limit 1)
  select m.user_id, coalesce(p.full_name,'—'), string_agg(distinct _contact_label(m.role), ' / '), 'admin'
  from me, enrollments e join memberships m on m.school_id=e.school_id and m.is_active and m.role = any(_family_admin_roles(e.school_id))
    left join profiles p on p.id=m.user_id
  where e.student_id=_student and e.status='active' and m.user_id<>auth.uid() and _family_ok(_student, me.gid, m.user_id, 'admin')
  group by m.user_id, p.full_name
$function$;

-- student new chat: permitted administration of the student's current school
create or replace function public.student_contacts()
 returns table(user_id uuid, full_name text, label text, school_id uuid, school_name text)
 language sql stable security definer set search_path to 'public' as $function$
  select m.user_id, coalesce(p.full_name,'—'), string_agg(distinct _contact_label(m.role), ' / '), e.school_id, sc.name
  from students st join enrollments e on e.student_id=st.id and e.status='active' join schools sc on sc.id=e.school_id
    join memberships m on m.school_id=e.school_id and m.is_active and m.role = any(_family_admin_roles(e.school_id))
    left join profiles p on p.id=m.user_id
  where st.user_id=auth.uid() and m.user_id<>auth.uid() and _student_admin_ok(st.id, m.user_id)
  group by m.user_id, p.full_name, e.school_id, sc.name
$function$;

create or replace function public.start_student_admin_conversation(_staff uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare st record; cid uuid; key text; begin
  perform _bt_guard('bt_chat_direct','use');
  select s.* into st from students s join enrollments e on e.student_id=s.id and e.status='active'
    where s.user_id=auth.uid() and _student_admin_ok(s.id, _staff) limit 1;
  if st.id is null then raise exception 'لا يمكنك مراسلة هذه الجهة؛ المتاح إدارة مدرستك والمرشد الطلابي فقط'; end if;
  key := 'student-admin:' || st.id || ':' || _staff;
  insert into conversations(org_id, school_id, kind, student_id, staff_user_id, staff_kind, dedupe_key, created_by)
    values (school_org(st.school_id), st.school_id, 'student', st.id, _staff, 'admin', key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select c.id into cid from conversations c where c.dedupe_key=key; update conversations set status='active' where id=cid; end if;
  perform _add_member(cid, _staff, 'member', 'relation', '-infinity');
  perform _add_member(cid, auth.uid(), 'member', 'relation', '-infinity');
  return cid;
end $$;
revoke all on function public.start_student_admin_conversation(uuid) from public, anon;
grant execute on function public.start_student_admin_conversation(uuid) to authenticated;
revoke all on function public.student_contacts() from public, anon;
grant execute on function public.student_contacts() to authenticated;

-- guardians may start only administration chats; staff keep their existing paths
create or replace function public._start_family_conversation_v0(_student uuid, _guardian uuid, _staff_user uuid)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare g record; _k text; st record; cid uuid; key text; begin
  select * into g from guardians where id=_guardian;
  select * into st from students where id=_student;
  if g is null or st is null then raise exception 'بيانات غير صالحة'; end if;
  if auth.uid() not in (_staff_user, g.user_id) then raise exception 'لا يمكنك بدء محادثة باسم مستخدم آخر'; end if;
  if auth.uid() = g.user_id and auth.uid() <> _staff_user then
    if not _family_ok(_student, _guardian, _staff_user, 'admin') then
      raise exception 'مراسلة المعلم مباشرة غير متاحة لولي الأمر؛ تواصل مع إدارة مدرسة الابن أو المرشد الطلابي'; end if;
    _k := 'admin';
  else
    _k := case when _family_ok(_student, _guardian, _staff_user, 'teacher') then 'teacher' when _family_ok(_student, _guardian, _staff_user, 'admin') then 'admin' else null end;
  end if;
  if _k is null then raise exception 'لا توجد علاقة تعليمية أو أسرية سارية تسمح بهذه المحادثة'; end if;
  key := 'family:' || _student || ':' || _guardian || ':' || _staff_user;
  insert into conversations(org_id, school_id, kind, student_id, guardian_id, staff_user_id, staff_kind, dedupe_key, created_by)
    values (school_org(st.school_id), st.school_id, 'family', _student, _guardian, _staff_user, _k, key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select c.id into cid from conversations c where c.dedupe_key=key; update conversations set staff_kind=_k, status='active' where id=cid; end if;
  perform _add_member(cid, _staff_user, 'member', 'relation', '-infinity');
  perform _add_member(cid, g.user_id, 'member', 'relation', '-infinity');
  return cid;
end $function$;

-- sending: guardian/student never send in a private chat with a teacher (kept read-only); admin chats follow the admin rule
create or replace function public._conv_send_block_v1(_conv uuid)
 returns text language plpgsql stable security definer set search_path to 'public' as $function$
declare c record; m record; begin
  select * into c from conversations where id=_conv;
  if c is null then return 'المحادثة غير موجودة'; end if;
  select * into m from conversation_members where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  if m is null or not conv_access_ok(_conv) then return 'لست عضوًا في هذه المحادثة'; end if;
  if c.status='archived' then return case when c.group_type in ('section','course') then 'مجموعة مؤرشفة للقراءة؛ تواصل عبر مجموعة الشعبة' when c.group_type='class' then 'أُرشف العام الدراسي؛ الإرسال متوقف' else 'المحادثة مؤرشفة؛ الإرسال متوقف' end; end if;
  if c.expires_at is not null and c.expires_at < current_date then return 'انتهت مدة هذه المجموعة'; end if;
  if c.kind='group' and c.post_policy='moderators' and m.role not in ('owner','moderator') then
    return case when c.group_type='class' then 'النشر في هذه المجموعة للمعلمين والمشرفين فقط' else 'النشر في هذه المجموعة للمشرفين فقط' end; end if;
  if c.kind='group' and c.post_policy='staff_guardians' and m.role not in ('owner','moderator') and not (m.reasons && array['guardian','manual']) then
    return 'النشر في هذه المجموعة للمعلمين والمشرفين وأولياء الأمور فقط'; end if;
  if c.kind='family' and auth.uid() <> c.staff_user_id and coalesce(c.staff_kind,'teacher') <> 'admin'
     and not _family_ok(c.student_id, c.guardian_id, c.staff_user_id, 'admin') then
    return 'مراسلة المعلم مباشرة متوقفة؛ المحادثة للقراءة فقط. تواصل مع إدارة المدرسة أو المرشد الطلابي'; end if;
  if c.kind='family' and not _family_ok(c.student_id, c.guardian_id, c.staff_user_id, c.staff_kind) then return 'انتهت العلاقة التعليمية أو الأسرية التي قامت عليها المحادثة؛ متاحة للقراءة فقط'; end if;
  if c.kind='student' and coalesce(c.staff_kind,'teacher')='admin' then
    if not _student_admin_ok(c.student_id, c.staff_user_id) then return 'هذه الجهة لم تعد ضمن إدارة مدرسة الطالب الحالية؛ المحادثة للقراءة فقط'; end if;
  elsif c.kind='student' then
    if auth.uid() <> c.staff_user_id then return 'مراسلة المعلم مباشرة متوقفة؛ المحادثة للقراءة فقط. تواصل مع إدارة المدرسة أو المرشد الطلابي'; end if;
    if not _student_ok(c.student_id, c.staff_user_id) then return 'انتهت العلاقة التعليمية بين المعلم والطالب؛ المحادثة للقراءة فقط'; end if;
  end if;
  if c.kind='direct' then
    if not coalesce((select staff_direct_enabled from comm_settings where school_id=c.school_id), true) and not can_manage_school(c.school_id) then return 'أوقفت الإدارة الرسائل الخاصة بين الموظفين؛ مجموعات العمل متاحة'; end if;
    if exists(select 1 from conversation_members o where o.conversation_id=_conv and o.left_at is null and not _eligible_staff(c.org_id, c.school_id, o.user_id)) then return 'الطرف الآخر لم يعد عضوًا ساريًا في المدرسة'; end if;
  end if;
  return null;
end $function$;

-- ===== Class group lives inside the digital classroom =====
create or replace function public._class_group_room(_conv uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select sr.id from conversations c join section_rooms sr on sr.section_id=c.section_id and sr.year_id=c.year_id
  where c.id=_conv and c.group_type='class' order by sr.created_at limit 1
$$;

-- room of a class group, only for its active members or the school principal/owner (used to redirect old links)
create or replace function public.class_group_room(_conv uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select _class_group_room(c.id) from conversations c
  where c.id=_conv and c.group_type='class'
    and ((exists(select 1 from conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null) and conv_access_ok(c.id))
      or is_school_principal(c.school_id))
$$;
revoke all on function public.class_group_room(uuid) from public, anon;
grant execute on function public.class_group_room(uuid) to authenticated;

create or replace function public._conv_link(_conv uuid) returns text
language sql stable security definer set search_path to 'public' as $function$
  select coalesce('/app/classrooms/section/' || _class_group_room(_conv) || '?tab=group', '/app/communication?c=' || _conv)
$function$;

-- one class group per digital classroom: prepared when the room is created (reuses an existing group via dedupe key)
create or replace function public._section_room_group_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sync_class_group(new.section_id, new.year_id);
  return null;
end $$;
drop trigger if exists section_room_group on public.section_rooms;
create trigger section_room_group after insert on public.section_rooms for each row execute function public._section_room_group_trg();

create or replace function public.section_room_get(_room uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare sr section_rooms; staff boolean; teach boolean; conv uuid; mgr boolean;
begin
  select * into sr from section_rooms where id = _room;
  if sr.id is null or not can_view_section_room(_room) then raise exception 'not_allowed' using errcode = '42501'; end if;
  staff := staff_view(sr.school_id);
  teach := exists(select 1 from classrooms cl where cl.section_room_id = sr.id and is_course_teacher(cl.course_id));
  mgr := is_school_principal(sr.school_id);
  -- class group: its own active members (students, guardians, assigned teachers, principal) or the principal/owner who manages it
  select c.id into conv from conversations c
   where c.kind = 'group' and c.group_type = 'class' and c.section_id = sr.section_id and c.year_id = sr.year_id and c.status = 'active'
     and ((exists(select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid() and m.left_at is null) and conv_access_ok(c.id)) or mgr)
   order by c.created_at limit 1;
  return jsonb_build_object(
    'id', sr.id, 'title', sr.title, 'school_id', sr.school_id,
    'view', case when staff then 'staff' when teach then 'teacher' else 'family' end,
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('classroom_id', cl.id, 'course_id', cl.course_id, 'subject', sj.name,
        'can_post', is_course_teacher(cl.course_id),
        'teachers', coalesce((select jsonb_agg(t.full_name order by t.full_name) from teacher_assignments a join teachers t on t.id = a.teacher_id
           where a.course_id = cl.course_id and a.status = 'approved' and assignment_live(a.start_date, a.end_date)), '[]'::jsonb)) order by sj.name)
      from classrooms cl join courses co on co.id = cl.course_id join subjects sj on sj.id = co.subject_id
      where cl.section_room_id = sr.id and can_view_course(cl.course_id, cl.school_id)), '[]'::jsonb),
    'students', case when staff or teach then coalesce((select jsonb_agg(s.full_name order by s.full_name) from enrollments e join students s on s.id = e.student_id
      where e.section_id = sr.section_id and e.status = 'active'), '[]'::jsonb) end,
    'guardians', case when staff then coalesce((select jsonb_agg(jsonb_build_object('name', g.full_name, 'child', s.full_name, 'relationship', sg.relationship,
        'verified', sg.verified, 'account', g.user_id is not null) order by g.full_name, s.full_name)
      from enrollments e join students s on s.id = e.student_id join student_guardians sg on sg.student_id = s.id join guardians g on g.id = sg.guardian_id
      where e.section_id = sr.section_id and e.status = 'active'), '[]'::jsonb) end,
    'class_group', conv);
end $function$;

-- existing rooms: prepare/refresh their class group now
select public.sync_class_group(sr.section_id, sr.year_id) from public.section_rooms sr join public.academic_years y on y.id = sr.year_id and y.is_current;

-- old notification links to class groups now open the classroom tab
update public.notifications n set link = public._conv_link(substring(n.link from '/app/communication\?c=([0-9a-f-]{36})')::uuid)
 where n.link ~ '^/app/communication\?c=[0-9a-f-]{36}$'
   and exists(select 1 from public.conversations c where c.id = substring(n.link from '/app/communication\?c=([0-9a-f-]{36})')::uuid and c.group_type = 'class');
