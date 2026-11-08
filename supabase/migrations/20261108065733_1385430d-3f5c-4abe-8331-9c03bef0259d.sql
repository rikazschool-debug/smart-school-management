
alter table public.conversations drop constraint conversations_group_type_check;
alter table public.conversations add constraint conversations_group_type_check check (group_type = any (array['committee','department','team','custom','section','course','class']));
alter table public.conversations drop constraint conversations_post_policy_check;
alter table public.conversations add constraint conversations_post_policy_check check (post_policy = any (array['all','moderators','staff_guardians']));
create unique index if not exists conversations_one_class_group on public.conversations(section_id, year_id) where kind='group' and group_type='class';
alter table public.conversation_members add column if not exists reasons text[] not null default '{}';

create table public.conv_member_overrides (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null,
  added boolean not null default false,
  removed boolean not null default false,
  role text check (role in ('moderator','member')),
  reason text,
  actor uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
grant select on public.conv_member_overrides to authenticated;
grant all on public.conv_member_overrides to service_role;
alter table public.conv_member_overrides enable row level security;
create policy "class admins read overrides" on public.conv_member_overrides for select to authenticated
  using (exists(select 1 from conversations c where c.id=conversation_id and is_school_principal(c.school_id)));

create table public.class_group_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  action text not null check (action in ('migrate','rollback')),
  before jsonb not null,
  after jsonb not null,
  actor uuid,
  created_at timestamptz not null default now()
);
grant select on public.class_group_runs to authenticated;
grant all on public.class_group_runs to service_role;
alter table public.class_group_runs enable row level security;
create policy "principals read runs" on public.class_group_runs for select to authenticated using (is_school_principal(school_id));

-- who should be in a section group, with all reasons
create or replace function public._class_want(_section uuid, _year uuid)
returns table(uid uuid, r text, reasons text[]) language sql stable security definer set search_path to 'public' as $$
  with se as (select s.id, s.school_id from sections s where s.id=_section),
  raw as (
    select st.user_id uid, 'student'::text why from se join enrollments e on e.section_id=se.id and e.year_id=_year and e.status='active'
      join students st on st.id=e.student_id where st.user_id is not null
    union all
    select t.user_id, 'teacher' from se join courses co on co.section_id=se.id and co.year_id=_year
      join teacher_assignments a on a.course_id=co.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date)
      join teachers t on t.id=a.teacher_id and t.status='active' and t.user_id is not null
    union all
    select g.user_id, 'guardian' from se join enrollments e on e.section_id=se.id and e.year_id=_year and e.status='active'
      join student_guardians sg on sg.student_id=e.student_id and sg.verified and sg.can_follow
      join guardians g on g.id=sg.guardian_id and g.user_id is not null
    union all
    select m.user_id, 'principal' from se join memberships m on m.school_id=se.school_id and m.role='principal' and m.is_active
  )
  select raw.uid, case when bool_or(why in ('teacher','principal')) then 'moderator' else 'member' end, array_agg(distinct why order by why)
  from raw join se on true
  where exists(select 1 from memberships m where m.user_id=raw.uid and m.school_id=se.school_id and m.is_active)
  group by raw.uid
$$;

create or replace function public._cg_label(_reasons text[]) returns text language sql immutable as $$
  select case when 'principal'=any(_reasons) then 'مدير المدرسة' when 'teacher'=any(_reasons) then 'معلم'
    when 'guardian'=any(_reasons) then 'ولي أمر' when 'student'=any(_reasons) then 'طالب' when 'manual'=any(_reasons) then 'موظف مخول' else null end $$;

create or replace function public._cg_title(_section uuid, _year uuid) returns text language sql stable security definer set search_path to 'public' as $$
  select g.name || ' — شعبة ' || s.name || ' — ' || y.name || ' — ' || sc.name
  from sections s join grades g on g.id=s.grade_id join academic_years y on y.id=_year join schools sc on sc.id=s.school_id where s.id=_section $$;

create or replace function public.sync_class_group(_section uuid, _year uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare s record; y record; cid uuid; c record; u record; key text := 'class:' || _section || ':' || _year; begin
  select * into s from sections where id=_section;
  select * into y from academic_years where id=_year;
  if s is null or y is null or y.school_id<>s.school_id then return null; end if;
  select id into cid from conversations where dedupe_key=key;
  if cid is null and not coalesce(y.is_current,false) then return null; end if;
  perform set_config('rikaz.sync', '1', true);
  if cid is null then
    insert into conversations(org_id, school_id, kind, group_type, title, section_id, year_id, membership_mode, post_policy, history_policy, dedupe_key, created_by)
      values (school_org(s.school_id), s.school_id, 'group', 'class', _cg_title(_section,_year), _section, _year, 'derived', 'all', 'from_join', key, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
      on conflict do nothing returning id into cid;
    if cid is null then select id into cid from conversations where dedupe_key=key; end if;
    if cid is null then perform set_config('rikaz.sync','0',true); return null; end if;
    insert into comm_audit(org_id, school_id, conversation_id, action, details) values (school_org(s.school_id), s.school_id, cid, 'class_group_create', jsonb_build_object('section', _section, 'year', _year));
  end if;
  select * into c from conversations where id=cid for update;
  update conversations set title=_cg_title(_section,_year), status=case when not coalesce(y.is_current,false) then 'archived' else status end
    where id=cid and (title is distinct from _cg_title(_section,_year) or (not coalesce(y.is_current,false) and status<>'archived'));
  if not coalesce(y.is_current,false) then perform set_config('rikaz.sync','0',true); return cid; end if;
  for u in
    with auto as (select * from _class_want(_section,_year)),
    man as (select o.user_id uid from conv_member_overrides o where o.conversation_id=cid and o.added and not o.removed
              and exists(select 1 from memberships m where m.user_id=o.user_id and m.school_id=s.school_id and m.is_active and m.role not in ('student','guardian'))),
    alls as (
      select coalesce(a.uid, mm.uid) uid,
        coalesce(a.reasons,'{}') || case when mm.uid is not null then array['manual'] else '{}'::text[] end reasons,
        coalesce(a.r, 'member') r
      from auto a full join man mm on mm.uid=a.uid)
    select x.uid, x.reasons, case when 'principal'=any(x.reasons) then 'moderator' else coalesce(o.role, x.r) end r
    from alls x left join conv_member_overrides o on o.conversation_id=cid and o.user_id=x.uid
    where not coalesce(o.removed,false)
  loop
    if exists(select 1 from conversation_members m where m.conversation_id=cid and m.user_id=u.uid and m.left_at is null) then
      update conversation_members set role=u.r, reasons=u.reasons, source=case when u.reasons='{manual}' then 'manual' else 'derived' end, updated_at=now()
        where conversation_id=cid and user_id=u.uid and left_at is null and (role is distinct from u.r or reasons is distinct from u.reasons);
    else
      insert into conversation_members(conversation_id, user_id, role, source, reasons, visible_from)
        values (cid, u.uid, u.r, case when u.reasons='{manual}' then 'manual' else 'derived' end, u.reasons, case when c.history_policy='full' then '-infinity'::timestamptz else now() end);
      perform _notify(u.uid, s.school_id, 'group', 'أُضفت إلى مجموعة الفصل: ' || c.title, 'عضوية تلقائية من التسكين أو التكليف أو العلاقة', _conv_link(cid), 'cls-add:' || cid || ':' || u.uid || ':' || extract(epoch from now())::bigint);
      insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, s.school_id, cid, 'derived_add', jsonb_build_object('user', u.uid, 'reasons', u.reasons));
    end if;
  end loop;
  for u in
    update conversation_members x set left_at=now(), left_reason=case when exists(select 1 from conv_member_overrides o where o.conversation_id=cid and o.user_id=x.user_id and o.removed) then 'أزاله مدير المدرسة' else 'انتهى سبب العضوية' end, updated_at=now()
    where x.conversation_id=cid and x.left_at is null
      and (exists(select 1 from conv_member_overrides o where o.conversation_id=cid and o.user_id=x.user_id and o.removed)
        or (x.user_id not in (select w.uid from _class_want(_section,_year) w)
            and not exists(select 1 from conv_member_overrides o where o.conversation_id=cid and o.user_id=x.user_id and o.added
                and exists(select 1 from memberships m where m.user_id=o.user_id and m.school_id=s.school_id and m.is_active and m.role not in ('student','guardian')))))
    returning x.user_id uid
  loop
    insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, s.school_id, cid, 'derived_remove', jsonb_build_object('user', u.uid));
  end loop;
  perform set_config('rikaz.sync', '0', true);
  return cid;
end $$;
revoke execute on function public.sync_class_group(uuid,uuid) from public, anon, authenticated;
revoke execute on function public._class_want(uuid,uuid) from public, anon, authenticated;

-- every section of the school in the current year that has students or courses
create or replace function public._sync_school_classes(_school uuid) returns integer language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0; begin
  for r in select distinct s.id sid, y.id yid from sections s join academic_years y on y.school_id=s.school_id and y.is_current
      where s.school_id=_school and (s.year_id is null or s.year_id=y.id)
        and (exists(select 1 from enrollments e where e.section_id=s.id and e.year_id=y.id) or exists(select 1 from courses co where co.section_id=s.id and co.year_id=y.id))
  loop perform sync_class_group(r.sid, r.yid); n := n + 1; end loop;
  for r in select section_id sid, year_id yid from conversations c where c.school_id=_school and c.group_type='class' and c.status='active'
      and not exists(select 1 from academic_years y where y.id=c.year_id and y.is_current)
  loop perform sync_class_group(r.sid, r.yid); end loop;
  return n;
end $$;
revoke execute on function public._sync_school_classes(uuid) from public, anon, authenticated;

-- old subject groups: never created again, frozen as a read-only archive
create or replace function public.sync_course_group(_course uuid) returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from conversations where dedupe_key='course:' || _course $$;

create or replace function public._sync_section_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record; begin
  if tg_table_name='courses' then
    perform sync_class_group(new.section_id, new.year_id);
  elsif tg_table_name='sections' then
    for r in select id from academic_years where school_id=new.school_id and is_current loop perform sync_class_group(new.id, r.id); end loop;
  elsif tg_table_name='enrollments' then
    for r in select distinct a, b from (values (case when tg_op<>'INSERT' then old.section_id end, case when tg_op<>'INSERT' then old.year_id end),
                                               (case when tg_op<>'DELETE' then new.section_id end, case when tg_op<>'DELETE' then new.year_id end)) v(a,b) where a is not null loop
      perform sync_class_group(r.a, r.b);
    end loop;
  elsif tg_table_name='teacher_assignments' then
    for r in select distinct co.section_id a, co.year_id b from courses co where co.id in (case when tg_op<>'INSERT' then old.course_id end, case when tg_op<>'DELETE' then new.course_id end) loop
      perform sync_class_group(r.a, r.b);
    end loop;
  elsif tg_table_name='students' then
    for r in select distinct section_id a, year_id b from enrollments where student_id=coalesce(new.id, old.id) loop perform sync_class_group(r.a, r.b); end loop;
  elsif tg_table_name in ('student_guardians','guardians') then
    for r in select distinct e.section_id a, e.year_id b from enrollments e join academic_years y on y.id=e.year_id and y.is_current
      where e.student_id in (
        select coalesce(new_sid, old_sid) from (select case when tg_table_name='student_guardians' and tg_op<>'DELETE' then (to_jsonb(new)->>'student_id')::uuid end new_sid,
                                                       case when tg_table_name='student_guardians' and tg_op<>'INSERT' then (to_jsonb(old)->>'student_id')::uuid end old_sid) q
        union select sg.student_id from student_guardians sg where tg_table_name='guardians' and sg.guardian_id=coalesce(new.id, old.id)
        union select (to_jsonb(old)->>'student_id')::uuid where tg_table_name='student_guardians' and tg_op='UPDATE')
    loop perform sync_class_group(r.a, r.b); end loop;
  end if;
  return null;
end $$;

drop trigger if exists student_guardians_sync_group on public.student_guardians;
create trigger student_guardians_sync_group after insert or update or delete on public.student_guardians for each row execute function public._sync_section_trg();
drop trigger if exists guardians_sync_group on public.guardians;
create trigger guardians_sync_group after update of user_id on public.guardians for each row execute function public._sync_section_trg();

create or replace function public._sync_school_derived() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare cid uuid; sch uuid := coalesce(new.school_id, old.school_id); begin
  for cid in select id from conversations where school_id=sch and kind='group' and membership_mode='derived' and group_type not in ('course','section','class') loop
    perform sync_derived_group(cid);
  end loop;
  perform _sync_school_classes(sch);
  return null;
end $$;

create or replace function public._sync_year_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin perform _sync_school_classes(new.school_id); return null; end $$;

create or replace function public._guard_section_members() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('rikaz.sync', true), '0') = '1' then return new; end if;
  if not exists(select 1 from conversations c where c.id=new.conversation_id and c.group_type in ('section','course','class')) then return new; end if;
  if tg_op='INSERT' or new.role is distinct from old.role or new.left_at is distinct from old.left_at or new.visible_from is distinct from old.visible_from or new.reasons is distinct from old.reasons then
    raise exception 'عضوية مجموعة الفصل تُدار من التسكين والتكليف وقرارات مدير المدرسة فقط';
  end if;
  return new;
end $$;

-- posting: staff_guardians blocks pure students
create or replace function public.conv_send_block(_conv uuid) returns text language plpgsql stable security definer set search_path to 'public' as $$
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
  if c.kind='family' and not _family_ok(c.student_id, c.guardian_id, c.staff_user_id, c.staff_kind) then return 'انتهت العلاقة التعليمية أو الأسرية التي قامت عليها المحادثة؛ متاحة للقراءة فقط'; end if;
  if c.kind='student' and not _student_ok(c.student_id, c.staff_user_id) then return 'انتهت العلاقة التعليمية بين المعلم والطالب؛ المحادثة للقراءة فقط'; end if;
  if c.kind='direct' then
    if not coalesce((select staff_direct_enabled from comm_settings where school_id=c.school_id), true) and not can_manage_school(c.school_id) then return 'أوقفت الإدارة الرسائل الخاصة بين الموظفين؛ مجموعات العمل متاحة'; end if;
    if exists(select 1 from conversation_members o where o.conversation_id=_conv and o.left_at is null and not _eligible_staff(c.org_id, c.school_id, o.user_id)) then return 'الطرف الآخر لم يعد عضوًا ساريًا في المدرسة'; end if;
  end if;
  return null;
end $$;

create or replace function public.set_class_group_settings(_conv uuid, _post_policy text, _allow_replies boolean, _allow_attachments boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or c.group_type not in ('section','course','class') then raise exception 'مجموعة غير صالحة'; end if;
  if c.group_type='class' and not is_school_principal(c.school_id) then raise exception 'إعدادات مجموعة الفصل لمدير المدرسة أو المالك فقط'; end if;
  if c.group_type<>'class' and not _group_admin(_conv) then raise exception 'إعدادات المجموعة للمعلم المكلف أو الإدارة فقط'; end if;
  if _post_policy not in ('all','moderators','staff_guardians') or (_post_policy='staff_guardians' and c.group_type<>'class') then raise exception 'إعداد غير صالح'; end if;
  update conversations set post_policy=_post_policy, allow_replies=coalesce(_allow_replies, true), allow_attachments=coalesce(_allow_attachments, true), updated_at=now() where id=_conv;
  perform _audit(c.org_id, c.school_id, _conv, null, 'settings_update', jsonb_build_object('post_policy', _post_policy, 'replies', _allow_replies, 'attachments', _allow_attachments));
end $$;

-- principal / owner member management
create or replace function public._cg_admin(_conv uuid) returns conversations language plpgsql security definer set search_path to 'public' as $$
declare c conversations; begin
  select * into c from conversations where id=_conv for update;
  if c.id is null or c.group_type<>'class' then raise exception 'مجموعة فصل غير موجودة'; end if;
  if not is_school_principal(c.school_id) then raise exception 'إدارة مجموعة الفصل لمدير المدرسة أو المالك فقط'; end if;
  if c.status<>'active' then raise exception 'المجموعة مؤرشفة'; end if;
  return c;
end $$;
revoke execute on function public._cg_admin(uuid) from public, anon, authenticated;

create or replace function public.class_group_add_member(_conv uuid, _user uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c conversations; staff boolean; auto boolean; begin
  c := _cg_admin(_conv);
  staff := exists(select 1 from memberships m where m.user_id=_user and m.school_id=c.school_id and m.is_active and m.role not in ('student','guardian'));
  auto := exists(select 1 from _class_want(c.section_id, c.year_id) w where w.uid=_user);
  if not staff and not auto then raise exception 'لا يمكن إضافة هذا المستخدم: الطالب أو ولي الأمر يحتاج علاقة معتمدة بالشعبة، والموظف يجب أن يكون عضوًا نشطًا في المدرسة'; end if;
  if not auto and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اكتب سبب إضافة الموظف'; end if;
  insert into conv_member_overrides(conversation_id, user_id, added, removed, reason, actor) values (_conv, _user, not auto, false, _reason, auth.uid())
    on conflict (conversation_id, user_id) do update set added = conv_member_overrides.added or not auto, removed=false, reason=excluded.reason, actor=auth.uid(), updated_at=now();
  perform _audit(c.org_id, c.school_id, _conv, null, 'class_member_add', jsonb_build_object('user', _user, 'reason', _reason));
  perform sync_class_group(c.section_id, c.year_id);
end $$;

create or replace function public.class_group_remove_member(_conv uuid, _user uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c conversations; begin
  c := _cg_admin(_conv);
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اكتب سبب الإزالة'; end if;
  if exists(select 1 from conversation_members m where m.conversation_id=_conv and m.user_id=_user and m.left_at is null and 'principal'=any(m.reasons)) then raise exception 'مدير المدرسة مشرف دائم على مجموعات شعب مدرسته'; end if;
  insert into conv_member_overrides(conversation_id, user_id, removed, reason, actor) values (_conv, _user, true, _reason, auth.uid())
    on conflict (conversation_id, user_id) do update set removed=true, added=false, reason=excluded.reason, actor=auth.uid(), updated_at=now();
  perform _audit(c.org_id, c.school_id, _conv, null, 'class_member_remove', jsonb_build_object('user', _user, 'reason', _reason));
  perform sync_class_group(c.section_id, c.year_id);
end $$;

create or replace function public.class_group_restore_auto(_conv uuid, _user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c conversations; begin
  c := _cg_admin(_conv);
  delete from conv_member_overrides where conversation_id=_conv and user_id=_user;
  perform _audit(c.org_id, c.school_id, _conv, null, 'class_member_restore', jsonb_build_object('user', _user));
  perform sync_class_group(c.section_id, c.year_id);
end $$;

create or replace function public.class_group_set_role(_conv uuid, _user uuid, _role text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c conversations; begin
  c := _cg_admin(_conv);
  if _role not in ('moderator','member') then raise exception 'دور غير صالح'; end if;
  if not exists(select 1 from conversation_members m where m.conversation_id=_conv and m.user_id=_user and m.left_at is null) then raise exception 'ليس عضوًا'; end if;
  insert into conv_member_overrides(conversation_id, user_id, role, actor) values (_conv, _user, _role, auth.uid())
    on conflict (conversation_id, user_id) do update set role=_role, actor=auth.uid(), updated_at=now();
  perform _audit(c.org_id, c.school_id, _conv, null, 'role_change', jsonb_build_object('user', _user, 'role', _role));
  perform sync_class_group(c.section_id, c.year_id);
end $$;

create or replace function public.class_group_set_description(_conv uuid, _description text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c conversations; begin
  c := _cg_admin(_conv);
  update conversations set description=nullif(btrim(coalesce(_description,'')),''), updated_at=now() where id=_conv;
  perform _audit(c.org_id, c.school_id, _conv, null, 'description_update', '{}'::jsonb);
end $$;

create or replace function public.class_group_delete_message(_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m record; begin
  select x.*, c.org_id from messages x join conversations c on c.id=x.conversation_id into m where x.id=_id;
  if m.id is null then raise exception 'غير مصرح'; end if;
  if m.sender_id<>auth.uid() and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اكتب سبب حذف رسالة غيرك'; end if;
  perform delete_message(_id);
  perform _audit(m.org_id, m.school_id, m.conversation_id, null, 'message_delete_reason', jsonb_build_object('message', _id, 'reason', _reason));
end $$;

-- member list for members and admins, names + role label only
create or replace function public.class_group_members(_conv uuid)
returns table(user_id uuid, full_name text, role text, reasons text[], label text, overridden boolean, removed boolean, override_reason text)
language sql stable security definer set search_path to 'public' as $$
  with c as (select * from conversations where id=_conv and group_type='class'),
  ok as (select is_school_principal(c.school_id) adm from c where is_school_principal(c.school_id) or is_conv_member(_conv))
  select m.user_id, coalesce(p.full_name,'مستخدم'), m.role, m.reasons, _cg_label(m.reasons),
    (select adm from ok) and o.id is not null, false, case when (select adm from ok) then o.reason end
  from c join ok on true join conversation_members m on m.conversation_id=c.id and m.left_at is null left join profiles p on p.id=m.user_id
    left join conv_member_overrides o on o.conversation_id=c.id and o.user_id=m.user_id
  union all
  select o.user_id, coalesce(p.full_name,'مستخدم'), null, '{}', null, true, true, o.reason
  from c join ok on ok.adm join conv_member_overrides o on o.conversation_id=c.id and o.removed left join profiles p on p.id=o.user_id
  order by 7, 3 nulls last, 2
$$;

create or replace function public.class_group_candidates(_conv uuid, _q text default '')
returns table(user_id uuid, full_name text, label text) language sql stable security definer set search_path to 'public' as $$
  with c as (select * from conversations where id=_conv and group_type='class' and is_school_principal(school_id))
  select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'مستخدم'),
    case m.role when 'principal' then 'مدير' when 'vice_principal' then 'وكيل' when 'teacher' then 'معلم' when 'student_affairs' then 'شؤون الطلاب' when 'counselor' then 'موجه' when 'supervisor' then 'مشرف' else 'موظف' end
  from c join memberships m on m.school_id=c.school_id and m.is_active and m.role not in ('student','guardian') left join profiles p on p.id=m.user_id
  where not exists(select 1 from conversation_members x where x.conversation_id=c.id and x.user_id=m.user_id and x.left_at is null)
    and (coalesce(_q,'')='' or p.full_name ilike '%' || _q || '%')
  order by m.user_id limit 30
$$;

create or replace function public.class_group_log(_conv uuid)
returns table(action text, actor_name text, details jsonb, created_at timestamptz) language sql stable security definer set search_path to 'public' as $$
  select a.action, coalesce(p.full_name, 'النظام'), a.details, a.created_at from comm_audit a
    join conversations c on c.id=a.conversation_id and c.group_type='class' and is_school_principal(c.school_id)
    left join profiles p on p.id=a.actor where a.conversation_id=_conv order by a.created_at desc limit 200 $$;

create or replace function public.my_section_groups(_school uuid)
returns table(conversation_id uuid, section_id uuid, title text, section_label text, teachers text, students bigint, members bigint, children text, post_policy text, can_manage boolean, last_at timestamptz, unread bigint)
language sql stable security definer set search_path to 'public' as $$
  select c.id, c.section_id, c.title, g.name || ' / ' || se.name,
    (select string_agg(distinct p.full_name, '، ') from conversation_members m join profiles p on p.id=m.user_id where m.conversation_id=c.id and m.left_at is null and 'teacher'=any(m.reasons)),
    (select count(*) from enrollments e where e.section_id=c.section_id and e.year_id=c.year_id and e.status='active'),
    (select count(*) from conversation_members m where m.conversation_id=c.id and m.left_at is null),
    (select string_agg(distinct st.full_name, '، ') from enrollments e join students st on st.id=e.student_id
       join student_guardians sg on sg.student_id=st.id and sg.verified and sg.can_follow join guardians gu on gu.id=sg.guardian_id and gu.user_id=auth.uid()
       where e.section_id=c.section_id and e.year_id=c.year_id and e.status='active'),
    c.post_policy, is_school_principal(_school), coalesce(c.last_message_at, c.created_at),
    (select count(*) from conversation_members m join messages x on x.conversation_id=m.conversation_id
       where m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null and x.seq>m.last_read_seq and x.sender_id<>auth.uid() and x.deleted_at is null and x.created_at>=m.visible_from)
  from conversations c join academic_years y on y.id=c.year_id and y.is_current join sections se on se.id=c.section_id join grades g on g.id=se.grade_id
  where c.school_id=_school and c.group_type='class' and c.status='active'
    and ((exists(select 1 from conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null) and conv_access_ok(c.id)) or is_school_principal(_school))
  order by g.name, se.name
$$;

-- link from an old subject group to its active section group
create or replace function public.class_group_successor(_conv uuid) returns uuid language sql stable security definer set search_path to 'public' as $$
  select n.id from conversations o join courses co on co.id=o.course_id
    join conversations n on n.group_type='class' and n.section_id=co.section_id and n.year_id=co.year_id and n.status='active'
  where o.id=_conv and o.group_type='course'
    and (exists(select 1 from conversation_members m where m.conversation_id=n.id and m.user_id=auth.uid() and m.left_at is null) or is_school_principal(n.school_id)) $$;

-- migration preview / run / rollback (principal or owner)
create or replace function public._cg_counts(_school uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'course_groups', (select count(*) from conversations where school_id=_school and group_type='course'),
    'course_active', (select count(*) from conversations where school_id=_school and group_type='course' and status='active'),
    'class_groups', (select count(*) from conversations where school_id=_school and group_type='class'),
    'course_messages', (select count(*) from messages m join conversations c on c.id=m.conversation_id where c.school_id=_school and c.group_type='course'),
    'course_files', (select count(*) from files f join messages m on m.id=f.source_id and f.source_type='message' join conversations c on c.id=m.conversation_id where c.school_id=_school and c.group_type='course'),
    'course_members', (select count(*) from conversation_members x join conversations c on c.id=x.conversation_id where c.school_id=_school and c.group_type='course' and x.left_at is null),
    'class_members', (select count(*) from conversation_members x join conversations c on c.id=x.conversation_id where c.school_id=_school and c.group_type='class' and x.left_at is null)) $$;

create or replace function public.class_group_preview(_school uuid)
returns table(course_conv uuid, course_title text, section_label text, status text, messages bigint, files bigint, class_conv uuid, class_title text)
language sql stable security definer set search_path to 'public' as $$
  select o.id, o.title, g.name || ' / ' || se.name, o.status,
    (select count(*) from messages m where m.conversation_id=o.id),
    (select count(*) from files f join messages m on m.id=f.source_id and f.source_type='message' where m.conversation_id=o.id),
    n.id, coalesce(n.title, _cg_title(co.section_id, co.year_id))
  from conversations o join courses co on co.id=o.course_id join sections se on se.id=co.section_id join grades g on g.id=se.grade_id
    left join conversations n on n.group_type='class' and n.section_id=co.section_id and n.year_id=co.year_id
  where o.school_id=_school and o.group_type='course' and is_school_principal(_school)
  order by 3, 2 $$;

create or replace function public.class_group_migrate(_school uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b jsonb; a jsonb; begin
  if not is_school_principal(_school) then raise exception 'الانتقال لمدير المدرسة أو المالك فقط'; end if;
  b := _cg_counts(_school);
  perform _sync_school_classes(_school);
  update conversations set status='archived', updated_at=now() where school_id=_school and group_type='course' and status='active';
  a := _cg_counts(_school);
  insert into class_group_runs(school_id, action, before, after, actor) values (_school, 'migrate', b, a, auth.uid());
  return jsonb_build_object('before', b, 'after', a);
end $$;

create or replace function public.class_group_rollback(_school uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b jsonb; a jsonb; begin
  if not is_school_principal(_school) then raise exception 'التراجع لمدير المدرسة أو المالك فقط'; end if;
  b := _cg_counts(_school);
  update conversations c set status='active', updated_at=now() from courses co join academic_years y on y.id=co.year_id and y.is_current
    where c.school_id=_school and c.group_type='course' and c.status='archived' and co.id=c.course_id;
  update conversations set status='archived', updated_at=now() where school_id=_school and group_type='class' and status='active';
  a := _cg_counts(_school);
  insert into class_group_runs(school_id, action, before, after, actor) values (_school, 'rollback', b, a, auth.uid());
  return jsonb_build_object('before', b, 'after', a);
end $$;

-- sender role label in every conversation
drop function if exists public.conversation_people(uuid);
create function public.conversation_people(_conv uuid)
returns table(user_id uuid, full_name text, role text, source text, joined_at timestamptz, last_read_seq bigint, label text)
language sql stable security definer set search_path to 'public' as $$
  select m.user_id, coalesce(p.full_name,'مستخدم'), m.role, m.source, m.joined_at, m.last_read_seq, _cg_label(m.reasons)
  from conversation_members m left join profiles p on p.id=m.user_id
  where m.conversation_id=_conv and m.left_at is null
    and (is_conv_member(_conv) or exists(select 1 from conversations c where c.id=_conv and c.kind='group' and _scope_manager(c.org_id, c.school_id)))
  order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end, p.full_name $$;

grant execute on function public.class_group_add_member(uuid,uuid,text), public.class_group_remove_member(uuid,uuid,text), public.class_group_restore_auto(uuid,uuid),
  public.class_group_set_role(uuid,uuid,text), public.class_group_set_description(uuid,text), public.class_group_delete_message(uuid,text),
  public.class_group_members(uuid), public.class_group_candidates(uuid,text), public.class_group_log(uuid), public.my_section_groups(uuid),
  public.class_group_successor(uuid), public.class_group_preview(uuid), public.class_group_migrate(uuid), public.class_group_rollback(uuid), public.conversation_people(uuid) to authenticated;
revoke execute on function public._cg_counts(uuid) from public, anon, authenticated;
