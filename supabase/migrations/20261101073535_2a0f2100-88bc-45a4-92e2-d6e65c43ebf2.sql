-- ===== Subject (course) groups replace general section groups as the default teaching channel =====
alter table public.conversations add column if not exists course_id uuid references public.courses(id);
alter table public.conversations drop constraint conversations_group_type_check;
alter table public.conversations add constraint conversations_group_type_check check (group_type in ('committee','department','team','custom','section','course'));
create unique index if not exists conversations_one_course_group on public.conversations(course_id) where kind='group' and group_type='course';

create or replace function public._course_title(_course uuid) returns text language sql stable security definer set search_path=public as $$
  select su.name || ' — ' || g.name || ' — شعبة ' || s.name || ' — ' || y.name
  from courses co join subjects su on su.id=co.subject_id join sections s on s.id=co.section_id join grades g on g.id=s.grade_id join academic_years y on y.id=co.year_id
  where co.id=_course
$$;

-- desired members: active enrolled students (with accounts) of the course's section, and teachers with a live approved assignment on THIS course
create or replace function public._course_members(_course uuid) returns table(uid uuid, r text) language sql stable security definer set search_path=public as $$
  with co as (select * from courses where id=_course), want as (
    select st.user_id uid, 'member'::text r from co join enrollments e on e.section_id=co.section_id and e.year_id=co.year_id and e.status='active'
      join students st on st.id=e.student_id
      where st.user_id is not null and exists(select 1 from memberships m where m.user_id=st.user_id and m.school_id=co.school_id and m.is_active)
    union
    select t.user_id, 'moderator' from co join teacher_assignments a on a.course_id=co.id and a.status='approved' and a.start_date<=current_date and (a.end_date is null or a.end_date>=current_date)
      join teachers t on t.id=a.teacher_id and t.status='active' and t.user_id is not null
      where exists(select 1 from memberships m where m.user_id=t.user_id and m.school_id=co.school_id and m.is_active))
  select distinct on (uid) uid, r from want order by uid, r desc
$$;

create or replace function public.sync_course_group(_course uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare co record; cid uuid; c record; u record; cur boolean; key text := 'course:' || _course; begin
  select x.*, y.is_current into co from courses x join academic_years y on y.id=x.year_id where x.id=_course;
  if co is null then return null; end if;
  cur := coalesce(co.is_current, false);
  select id into cid from conversations where dedupe_key=key;
  if cid is null and not cur then return null; end if; -- never create groups for past years
  perform set_config('rikaz.sync', '1', true);
  if cid is null then
    insert into conversations(org_id, school_id, kind, group_type, title, section_id, course_id, year_id, membership_mode, post_policy, history_policy, dedupe_key, created_by)
      values (school_org(co.school_id), co.school_id, 'group', 'course', _course_title(_course), co.section_id, _course, co.year_id, 'derived', 'all', 'from_join', key, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
      on conflict (dedupe_key) do nothing returning id into cid;
    if cid is null then select id into cid from conversations where dedupe_key=key; end if;
  end if;
  select * into c from conversations where id=cid;
  update conversations set title=_course_title(_course), section_id=co.section_id,
    status=case when not cur then 'archived' else status end
  where id=cid and (title is distinct from _course_title(_course) or section_id is distinct from co.section_id or (not cur and status<>'archived'));
  for u in select * from _course_members(_course) loop
    if exists(select 1 from conversation_members x where x.conversation_id=cid and x.user_id=u.uid and x.left_at is null) then
      update conversation_members set role=u.r, updated_at=now() where conversation_id=cid and user_id=u.uid and left_at is null and role<>u.r and role<>'owner';
    else
      insert into conversation_members(conversation_id, user_id, role, source, visible_from) values (cid, u.uid, u.r, 'derived', case when c.history_policy='full' then '-infinity'::timestamptz else now() end);
      perform _notify(u.uid, co.school_id, 'group', 'أُضفت إلى مجموعة المادة: ' || _course_title(_course), 'عضوية تلقائية من التسكين أو التكليف', _conv_link(cid), 'crs-add:' || cid || ':' || u.uid || ':' || extract(epoch from now())::bigint);
      insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, co.school_id, cid, 'derived_add', jsonb_build_object('user', u.uid));
    end if;
  end loop;
  for u in update conversation_members x set left_at=now(), left_reason='انتهى التسكين أو التكليف', updated_at=now()
      where x.conversation_id=cid and x.left_at is null and x.source='derived'
        and x.user_id not in (select m.uid from _course_members(_course) m)
      returning x.user_id uid loop
    insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, co.school_id, cid, 'derived_remove', jsonb_build_object('user', u.uid));
  end loop;
  perform set_config('rikaz.sync', '0', true);
  return cid;
end $$;
revoke execute on function public.sync_course_group(uuid) from public, anon, authenticated;
revoke execute on function public._course_members(uuid) from public, anon, authenticated;

-- general section groups: never created anymore; existing ones only keep membership removals (read-only archive)
create or replace function public.sync_section_group(_section uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; c record; u record; begin
  select id into cid from conversations where dedupe_key='section:' || _section;
  if cid is null then return null; end if;
  select * into c from conversations where id=cid;
  perform set_config('rikaz.sync', '1', true);
  for u in update conversation_members x set left_at=now(), left_reason='انتهى التسكين أو التكليف', updated_at=now()
      where x.conversation_id=cid and x.left_at is null and x.source='derived'
        and x.user_id not in (
          select st.user_id from enrollments e join students st on st.id=e.student_id
            where e.section_id=_section and e.year_id=c.year_id and e.status='active' and st.user_id is not null
              and exists(select 1 from memberships m where m.user_id=st.user_id and m.school_id=c.school_id and m.is_active)
          union
          select t.user_id from courses co join teacher_assignments a on a.course_id=co.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
            join teachers t on t.id=a.teacher_id and t.status='active' and t.user_id is not null
            where co.section_id=_section and co.year_id=c.year_id
              and exists(select 1 from memberships m where m.user_id=t.user_id and m.school_id=c.school_id and m.is_active))
      returning x.user_id uid loop
    insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, c.school_id, cid, 'derived_remove', jsonb_build_object('user', u.uid));
  end loop;
  perform set_config('rikaz.sync', '0', true);
  return cid;
end $$;

-- archive existing general section groups (no deletion; history stays readable by members, posting stops)
insert into comm_audit(org_id, school_id, conversation_id, action, details)
  select org_id, school_id, id, 'section_group_archived', jsonb_build_object('reason', 'استُبدلت بمجموعات المواد حسب المقرر والشعبة؛ الرسائل محفوظة للقراءة')
  from conversations where kind='group' and group_type='section' and status<>'archived';
update conversations set status='archived' where kind='group' and group_type='section' and status<>'archived';

create or replace function public._guard_section_members() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(current_setting('rikaz.sync', true), '0') = '1' then return new; end if;
  if not exists(select 1 from conversations c where c.id=new.conversation_id and c.group_type in ('section','course')) then return new; end if;
  if tg_op='INSERT' or new.role is distinct from old.role or new.left_at is distinct from old.left_at or new.visible_from is distinct from old.visible_from then
    raise exception 'عضوية مجموعة المادة تلقائية من التسكين والتكليف ولا تُعدّل يدويًا';
  end if;
  return new;
end $$;

create or replace function public._sync_section_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare sid uuid; cid uuid; begin
  if tg_table_name='courses' then
    perform sync_course_group(new.id);
  elsif tg_table_name='sections' then
    for cid in select id from courses where section_id=new.id loop perform sync_course_group(cid); end loop;
  elsif tg_table_name='enrollments' then
    for sid in select distinct x from unnest(array[case when tg_op<>'INSERT' then old.section_id end, case when tg_op<>'DELETE' then new.section_id end]) x where x is not null loop
      perform sync_section_group(sid);
      for cid in select id from courses where section_id=sid loop perform sync_course_group(cid); end loop;
    end loop;
  elsif tg_table_name='teacher_assignments' then
    for cid in select distinct x from unnest(array[case when tg_op<>'INSERT' then old.course_id end, case when tg_op<>'DELETE' then new.course_id end]) x where x is not null loop
      perform sync_course_group(cid);
      for sid in select section_id from courses where id=cid loop perform sync_section_group(sid); end loop;
    end loop;
  elsif tg_table_name='students' then
    for sid in select section_id from enrollments where student_id=new.id loop
      perform sync_section_group(sid);
      for cid in select id from courses where section_id=sid loop perform sync_course_group(cid); end loop;
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists courses_sync_group on public.courses;
create trigger courses_sync_group after insert or update of subject_id, section_id, year_id on public.courses for each row execute function public._sync_section_trg();

create or replace function public._sync_year_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
  for cid in select id from courses where year_id=new.id loop perform sync_course_group(cid); end loop;
  return null;
end $$;

-- memberships/teachers changes: refresh derived department groups and course groups of the school
create or replace function public._sync_school_derived() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid; sch uuid := coalesce(new.school_id, old.school_id); begin
  for cid in select id from conversations where school_id=sch and kind='group' and membership_mode='derived' and group_type not in ('course','section') loop
    perform sync_derived_group(cid);
  end loop;
  for cid in select co.id from courses co join academic_years y on y.id=co.year_id where co.school_id=sch and (y.is_current or exists(select 1 from conversations x where x.dedupe_key='course:' || co.id)) loop
    perform sync_course_group(cid);
  end loop;
  for cid in select section_id from conversations where school_id=sch and group_type='section' and section_id is not null loop
    perform sync_section_group(cid);
  end loop;
  return null;
end $$;

-- backfill one group per current course
do $$ declare cid uuid; begin
  for cid in select co.id from public.courses co join public.academic_years y on y.id=co.year_id where y.is_current loop perform public.sync_course_group(cid); end loop;
end $$;

-- teacher/student/manager view of subject groups (one row per course)
drop function if exists public.my_class_groups(uuid);
create function public.my_class_groups(_school uuid) returns table(course_id uuid, section_id uuid, conversation_id uuid, title text, subject text, section_label text, teachers text, students bigint, last_at timestamptz, unread bigint)
language sql stable security definer set search_path=public as $$
  select co.id, co.section_id, c.id, c.title, su.name, g.name || ' / ' || se.name,
    (select string_agg(distinct p.full_name, '، ') from teacher_assignments a join teachers t on t.id=a.teacher_id left join profiles p on p.id=t.user_id
       where a.course_id=co.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)),
    (select count(*) from enrollments e where e.section_id=co.section_id and e.year_id=co.year_id and e.status='active'),
    coalesce(c.last_message_at, c.created_at),
    (select count(*) from conversation_members m join messages x on x.conversation_id=m.conversation_id
       where m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null and x.seq>m.last_read_seq and x.sender_id<>auth.uid() and x.deleted_at is null and x.created_at>=m.visible_from)
  from courses co join academic_years y on y.id=co.year_id join subjects su on su.id=co.subject_id join sections se on se.id=co.section_id join grades g on g.id=se.grade_id
    join conversations c on c.dedupe_key='course:' || co.id
  where co.school_id=_school and y.is_current
    and (exists(select 1 from conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null) or can_manage_school(_school))
  order by su.name, g.name, se.name
$$;
grant execute on function public.my_class_groups(uuid) to authenticated;

-- roster per course group: teachers of the course (or managers); never phones or family data
create or replace function public.course_roster(_course uuid) returns table(student_id uuid, full_name text, has_account boolean, can_message boolean, conversation_id uuid, unread bigint)
language plpgsql stable security definer set search_path=public as $$
declare co record; begin
  select * into co from courses where id=_course;
  if co is null or not (is_course_teacher(_course) or can_manage_school(co.school_id)) then raise exception 'قائمة طلاب المادة للمعلم المكلف أو الإدارة فقط'; end if;
  return query
    select st.id, st.full_name, st.user_id is not null, _student_ok(st.id, auth.uid()), c.id,
      coalesce((select count(*) from messages x join conversation_members m on m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null
         where x.conversation_id=c.id and x.seq>m.last_read_seq and x.sender_id<>auth.uid() and x.deleted_at is null), 0)
    from enrollments e join students st on st.id=e.student_id
      left join conversations c on c.dedupe_key='student:' || st.id || ':' || auth.uid()
    where e.section_id=co.section_id and e.year_id=co.year_id and e.status='active'
    order by st.full_name;
end $$;
grant execute on function public.course_roster(uuid) to authenticated;

create or replace function public.set_class_group_settings(_conv uuid, _post_policy text, _allow_replies boolean, _allow_attachments boolean) returns void
language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or c.group_type not in ('section','course') or not _group_admin(_conv) then raise exception 'إعدادات مجموعة المادة للمعلم المكلف أو الإدارة فقط'; end if;
  if _post_policy not in ('all','moderators') then raise exception 'إعداد غير صالح'; end if;
  update conversations set post_policy=_post_policy, allow_replies=coalesce(_allow_replies, true), allow_attachments=coalesce(_allow_attachments, true) where id=_conv;
  perform _audit(c.org_id, c.school_id, _conv, null, 'settings_update', jsonb_build_object('post_policy', _post_policy, 'replies', _allow_replies, 'attachments', _allow_attachments));
end $$;

-- group moderators no longer remove members; only the owner/principal who may create groups
create or replace function public.remove_group_member(_conv uuid, _user uuid) returns void language plpgsql security definer set search_path=public as $$
declare c record; m record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or c.kind<>'group' or not _can_create_group(c.org_id, c.school_id) then raise exception 'إدارة أعضاء المجموعة لمالك المؤسسة أو مدير المدرسة فقط'; end if;
  if c.group_type in ('section','course') then raise exception 'عضوية مجموعة المادة تلقائية'; end if;
  select * into m from conversation_members where conversation_id=_conv and user_id=_user and left_at is null;
  if m is null then return; end if;
  if m.role='owner' then raise exception 'انقل الملكية أولًا؛ لا تُترك المجموعة بلا مالك'; end if;
  if m.source='derived' then raise exception 'العضو مشتق من القسم؛ غيّر قسمه أو قاعدة المجموعة'; end if;
  update conversation_members set left_at=now(), left_reason='أزاله المسؤول', updated_at=now() where id=m.id;
  perform _audit(c.org_id, c.school_id, _conv, null, 'member_remove', jsonb_build_object('user', _user));
end $$;

-- ===== Administrative circulars never reach students =====
create or replace function public._circular_audience(_school uuid, _aud jsonb) returns setof uuid language sql stable security definer set search_path=public as $$
  select distinct u from (
    select m.user_id u from memberships m where m.school_id=_school and m.is_active and m.role<>'student' and m.role::text in (select jsonb_array_elements_text(coalesce(_aud->'roles','[]')))
    union select t.user_id from teachers t where t.school_id=_school and t.status='active' and t.user_id is not null and t.department_id::text in (select jsonb_array_elements_text(coalesce(_aud->'departments','[]')))
    union select cm.user_id from conversation_members cm join conversations c on c.id=cm.conversation_id where c.school_id=_school and c.kind='group' and cm.left_at is null and c.id::text in (select jsonb_array_elements_text(coalesce(_aud->'groups','[]')))
    union select m.user_id from memberships m where m.school_id=_school and m.is_active and m.user_id::text in (select jsonb_array_elements_text(coalesce(_aud->'users','[]')))
  ) q where u is not null and exists(select 1 from memberships m where m.user_id=q.u and m.school_id=_school and m.is_active and m.role<>'student')
$$;

create or replace function public.can_read_circular(_c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from circulars c where c.id=_c and (
    _can_circ_scope(c.org_id, c.scope, c.school_id)
    or (c.status<>'draft' and exists(select 1 from circular_recipients r where r.circular_id=c.id and r.user_id=auth.uid()
          and exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=coalesce(r.school_id, c.school_id) and m.is_active and m.role<>'student')))
    or (c.status<>'draft' and exists(select 1 from unnest(c.target_schools) t where has_school_role(t, array['principal','vice_principal']::app_role[])))
  )) $$;

-- inventory: student-only recipients of past circulars lose access (rows kept, reason audited)
insert into comm_audit(org_id, school_id, conversation_id, action, details)
  select c.org_id, coalesce(r.school_id, c.school_id), null, 'circular_student_access_revoked',
    jsonb_build_object('circular', c.id, 'user', r.user_id, 'reason', 'التعاميم الإدارية لا تُعرض للطلاب')
  from circular_recipients r join circulars c on c.id=r.circular_id
  where not exists(select 1 from memberships m where m.user_id=r.user_id and m.school_id=coalesce(r.school_id, c.school_id) and m.is_active and m.role<>'student')
    and exists(select 1 from memberships m where m.user_id=r.user_id and m.school_id=coalesce(r.school_id, c.school_id) and m.role='student');