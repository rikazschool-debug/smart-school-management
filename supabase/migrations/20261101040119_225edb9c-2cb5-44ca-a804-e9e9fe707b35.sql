create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ===== schema additions =====
alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('family','direct','group','student'));
alter table public.conversations drop constraint conversations_group_type_check;
alter table public.conversations add constraint conversations_group_type_check check (group_type in ('committee','department','team','custom','section'));
alter table public.conversations add column section_id uuid references public.sections(id) on delete set null;
alter table public.conversations add column allow_replies boolean not null default true;
create unique index conversations_one_section_group on public.conversations(section_id) where kind='group' and group_type='section';
alter table public.messages add column pinned_at timestamptz, add column pinned_by uuid;
alter table public.comm_settings add column report_reviewer_roles public.app_role[] not null default '{principal,vice_principal}';

alter table public.files add column cleanup_attempts integer not null default 0, add column cleanup_last_at timestamptz, add column cleanup_error text;
alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type in ('post','message','message_pending','circular','cleanup_due'));

create table public.file_cleanup_config (
  id boolean primary key default true check (id),
  retention_minutes integer not null default 60 check (retention_minutes between 10 and 10080),
  max_attempts integer not null default 5 check (max_attempts between 1 and 50),
  updated_at timestamptz not null default now()
);
insert into public.file_cleanup_config default values;
grant select on public.file_cleanup_config to authenticated;
grant all on public.file_cleanup_config to service_role;
alter table public.file_cleanup_config enable row level security;
create policy "cleanup config read" on public.file_cleanup_config for select to authenticated using (true);

create table public.file_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  marked integer not null default 0,
  rows_removed integer not null default 0,
  delete_requests integer not null default 0,
  failed integer not null default 0,
  skipped_linked integer not null default 0,
  note text
);
grant select on public.file_cleanup_runs to authenticated;
grant all on public.file_cleanup_runs to service_role;
alter table public.file_cleanup_runs enable row level security;
create policy "cleanup runs read" on public.file_cleanup_runs for select to authenticated using (is_platform_admin());

-- ===== teacher <-> student relation =====
create or replace function public._student_ok(_student uuid, _teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from students st
      join enrollments e on e.student_id=st.id and e.status='active'
      join courses c on c.section_id=e.section_id and c.year_id=e.year_id
      join teacher_assignments a on a.course_id=c.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
      join teachers t on t.id=a.teacher_id and t.status='active' and t.user_id=_teacher
    where st.id=_student and st.user_id is not null
      and exists(select 1 from memberships m where m.user_id=_teacher and m.school_id=st.school_id and m.is_active)
      and exists(select 1 from memberships m where m.user_id=st.user_id and m.school_id=st.school_id and m.is_active))
$$;

create or replace function public.conv_access_ok(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversations c where c.id=_conv and (
      (c.school_id is not null and exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and (m.school_id=c.school_id or (m.role='org_owner' and m.org_id=c.org_id))))
      or (c.school_id is null and exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id=c.org_id)))
    and (c.kind<>'family' or c.staff_user_id=auth.uid() or exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
         where sg.guardian_id=c.guardian_id and sg.student_id=c.student_id and g.user_id=auth.uid() and sg.verified and sg.can_follow))
    and (c.kind<>'student' or c.staff_user_id=auth.uid() or exists(select 1 from students st where st.id=c.student_id and st.user_id=auth.uid())))
$$;

-- ===== class (section) groups =====
create or replace function public._section_title(_section uuid) returns text language sql stable security definer set search_path=public as $$
  select 'مجموعة الفصل: ' || g.name || ' / ' || s.name || ' — ' || y.name || ' — ' || sc.name
  from sections s join grades g on g.id=s.grade_id join academic_years y on y.id=s.year_id join schools sc on sc.id=s.school_id where s.id=_section
$$;

create or replace function public.sync_section_group(_section uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare s record; cid uuid; c record; u record; cur boolean; begin
  select se.*, y.is_current into s from sections se join academic_years y on y.id=se.year_id where se.id=_section;
  if s is null then return null; end if;
  perform set_config('rikaz.sync', '1', true);
  insert into conversations(org_id, school_id, kind, group_type, title, section_id, year_id, membership_mode, post_policy, history_policy, dedupe_key, created_by)
    values (school_org(s.school_id), s.school_id, 'group', 'section', _section_title(_section), _section, s.year_id, 'derived', 'all', 'from_join', 'section:' || _section, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select id into cid from conversations where dedupe_key='section:' || _section; end if;
  select * into c from conversations where id=cid;
  cur := coalesce(s.is_current, false);
  update conversations set title=_section_title(_section),
    status=case when not cur then 'archived' else status end
  where id=cid and (title is distinct from _section_title(_section) or (not cur and status<>'archived'));
  -- desired members: active enrolled students with accounts, and teachers with a live approved assignment in this section
  for u in
    with want as (
      select st.user_id uid, 'member'::text r from enrollments e join students st on st.id=e.student_id
        where e.section_id=_section and e.year_id=s.year_id and e.status='active' and st.user_id is not null
          and exists(select 1 from memberships m where m.user_id=st.user_id and m.school_id=s.school_id and m.is_active)
      union
      select t.user_id, 'moderator' from courses co join teacher_assignments a on a.course_id=co.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
        join teachers t on t.id=a.teacher_id and t.status='active' and t.user_id is not null
        where co.section_id=_section and co.year_id=s.year_id
          and exists(select 1 from memberships m where m.user_id=t.user_id and m.school_id=s.school_id and m.is_active))
    select distinct on (uid) uid, r from want order by uid, r desc
  loop
    if exists(select 1 from conversation_members x where x.conversation_id=cid and x.user_id=u.uid and x.left_at is null) then
      update conversation_members set role=u.r, updated_at=now() where conversation_id=cid and user_id=u.uid and left_at is null and role<>u.r and role<>'owner';
    else
      insert into conversation_members(conversation_id, user_id, role, source, visible_from) values (cid, u.uid, u.r, 'derived', case when c.history_policy='full' then '-infinity'::timestamptz else now() end);
      perform _notify(u.uid, s.school_id, 'group', 'أُضفت إلى ' || _section_title(_section), 'عضوية تلقائية من التسكين أو التكليف', _conv_link(cid), 'sec-add:' || cid || ':' || u.uid || ':' || extract(epoch from now())::bigint);
      insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, s.school_id, cid, 'derived_add', jsonb_build_object('user', u.uid));
    end if;
  end loop;
  for u in update conversation_members x set left_at=now(), left_reason='انتهى التسكين أو التكليف', updated_at=now()
      where x.conversation_id=cid and x.left_at is null and x.source='derived'
        and x.user_id not in (
          select st.user_id from enrollments e join students st on st.id=e.student_id
            where e.section_id=_section and e.year_id=s.year_id and e.status='active' and st.user_id is not null
              and exists(select 1 from memberships m where m.user_id=st.user_id and m.school_id=s.school_id and m.is_active)
          union
          select t.user_id from courses co join teacher_assignments a on a.course_id=co.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
            join teachers t on t.id=a.teacher_id and t.status='active' and t.user_id is not null
            where co.section_id=_section and co.year_id=s.year_id
              and exists(select 1 from memberships m where m.user_id=t.user_id and m.school_id=s.school_id and m.is_active))
      returning x.user_id uid loop
    insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, s.school_id, cid, 'derived_remove', jsonb_build_object('user', u.uid));
  end loop;
  perform set_config('rikaz.sync', '0', true);
  return cid;
end $$;

create or replace function public.sync_derived_group(_conv uuid) returns integer language plpgsql security definer set search_path=public as $$
declare c record; n int := 0; u uuid; begin
  select * into c from conversations where id=_conv;
  if c is null or c.membership_mode<>'derived' then return 0; end if;
  if c.group_type='section' then
    if c.section_id is not null then perform sync_section_group(c.section_id); end if;
    return 0;
  end if;
  if c.department_id is null then return 0; end if;
  for u in select t.user_id from teachers t where t.school_id=c.school_id and t.department_id=c.department_id and t.status='active' and t.user_id is not null
      and exists(select 1 from memberships m where m.user_id=t.user_id and m.school_id=c.school_id and m.is_active)
      and not exists(select 1 from conversation_members x where x.conversation_id=_conv and x.user_id=t.user_id and x.left_at is null) loop
    insert into conversation_members(conversation_id, user_id, role, source, visible_from) values (_conv, u, 'member', 'derived', case when c.history_policy='full' then '-infinity'::timestamptz else now() end);
    perform _notify(u, c.school_id, 'group', 'أُضفت إلى مجموعة: ' || c.title, 'عضوية تلقائية من القسم', _conv_link(_conv), 'grp-add:' || _conv || ':' || u || ':' || extract(epoch from now())::bigint);
    insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, c.school_id, _conv, 'derived_add', jsonb_build_object('user', u));
    n := n + 1;
  end loop;
  for u in update conversation_members x set left_at=now(), left_reason='خرج من نطاق القسم'
      where x.conversation_id=_conv and x.left_at is null and x.source='derived'
        and not exists(select 1 from teachers t where t.user_id=x.user_id and t.school_id=c.school_id and t.department_id=c.department_id and t.status='active'
          and exists(select 1 from memberships m where m.user_id=t.user_id and m.school_id=c.school_id and m.is_active))
      returning x.user_id loop
    insert into comm_audit(org_id, school_id, conversation_id, action, details) values (c.org_id, c.school_id, _conv, 'derived_remove', jsonb_build_object('user', u));
    n := n + 1;
  end loop;
  return n;
end $$;

-- section group membership is automatic only; manual changes (role/left_at/new rows) outside sync are rejected
create or replace function public._guard_section_members() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(current_setting('rikaz.sync', true), '0') = '1' then return new; end if;
  if not exists(select 1 from conversations c where c.id=new.conversation_id and c.group_type='section') then return new; end if;
  if tg_op='INSERT' or new.role is distinct from old.role or new.left_at is distinct from old.left_at or new.visible_from is distinct from old.visible_from then
    raise exception 'عضوية مجموعة الفصل تلقائية من التسكين والتكليف ولا تُعدّل يدويًا';
  end if;
  return new;
end $$;
create trigger conversation_members_section_guard before insert or update on public.conversation_members for each row execute function public._guard_section_members();

create or replace function public._sync_section_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare sid uuid; begin
  if tg_table_name='sections' then
    perform sync_section_group(new.id);
  elsif tg_table_name='enrollments' then
    if tg_op<>'INSERT' then perform sync_section_group(old.section_id); end if;
    if tg_op<>'DELETE' and (tg_op='INSERT' or new.section_id is distinct from old.section_id or new.status is distinct from old.status) then perform sync_section_group(new.section_id);
    elsif tg_op='UPDATE' then perform sync_section_group(new.section_id); end if;
  elsif tg_table_name='teacher_assignments' then
    for sid in select section_id from courses where id in (coalesce(new.course_id, old.course_id), coalesce(old.course_id, new.course_id)) loop
      perform sync_section_group(sid);
    end loop;
  elsif tg_table_name='students' then
    for sid in select section_id from enrollments where student_id=new.id and status='active' loop perform sync_section_group(sid); end loop;
  end if;
  return null;
end $$;
create trigger sections_sync_group after insert or update of name, grade_id, year_id on public.sections for each row execute function public._sync_section_trg();
create trigger enrollments_sync_group after insert or update or delete on public.enrollments for each row execute function public._sync_section_trg();
create trigger assignments_sync_group after insert or update or delete on public.teacher_assignments for each row execute function public._sync_section_trg();
create trigger students_sync_group after update of user_id, status on public.students for each row execute function public._sync_section_trg();
create or replace function public._sync_year_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare sid uuid; begin
  for sid in select id from sections where year_id=new.id loop perform sync_section_group(sid); end loop;
  return null;
end $$;
create trigger years_sync_groups after update of is_current, name on public.academic_years for each row execute function public._sync_year_trg();

-- memberships/teachers changes already call _sync_school_derived which covers derived groups incl. section groups
create or replace function public._sync_school_derived() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid; sch uuid := coalesce(new.school_id, old.school_id); begin
  for cid in select id from conversations where school_id=sch and kind='group' and membership_mode='derived' loop
    perform sync_derived_group(cid);
  end loop;
  return null;
end $$;

-- backfill one group per existing section
do $$ declare sid uuid; begin for sid in select id from public.sections loop perform public.sync_section_group(sid); end loop; end $$;

-- ===== send rules =====
create or replace function public.conv_send_block(_conv uuid) returns text language plpgsql stable security definer set search_path=public as $$
declare c record; m record; begin
  select * into c from conversations where id=_conv;
  if c is null then return 'المحادثة غير موجودة'; end if;
  select * into m from conversation_members where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  if m is null or not conv_access_ok(_conv) then return 'لست عضوًا في هذه المحادثة'; end if;
  if c.status='archived' then return case when c.group_type='section' then 'أُرشف العام الدراسي أو المجموعة؛ الإرسال متوقف' else 'المحادثة مؤرشفة؛ الإرسال متوقف' end; end if;
  if c.expires_at is not null and c.expires_at < current_date then return 'انتهت مدة هذه المجموعة'; end if;
  if c.kind='group' and c.post_policy='moderators' and m.role not in ('owner','moderator') then
    return case when c.group_type='section' then 'المجموعة لإعلانات المعلمين فقط' else 'النشر في هذه المجموعة للمشرفين فقط' end; end if;
  if c.kind='family' and not _family_ok(c.student_id, c.guardian_id, c.staff_user_id, c.staff_kind) then return 'انتهت العلاقة التعليمية أو الأسرية التي قامت عليها المحادثة؛ متاحة للقراءة فقط'; end if;
  if c.kind='student' and not _student_ok(c.student_id, c.staff_user_id) then return 'انتهت العلاقة التعليمية بين المعلم والطالب؛ المحادثة للقراءة فقط'; end if;
  if c.kind='direct' then
    if not coalesce((select staff_direct_enabled from comm_settings where school_id=c.school_id), true) and not can_manage_school(c.school_id) then return 'أوقفت الإدارة الرسائل الخاصة بين الموظفين؛ مجموعات العمل متاحة'; end if;
    if exists(select 1 from conversation_members o where o.conversation_id=_conv and o.left_at is null and not _eligible_staff(c.org_id, c.school_id, o.user_id)) then return 'الطرف الآخر لم يعد عضوًا ساريًا في المدرسة'; end if;
  end if;
  return null;
end $$;

create or replace function public.send_message(_conv uuid, _body text, _client_id uuid, _reply_to uuid default null, _files uuid[] default '{}')
returns table(id uuid, seq bigint, created_at timestamptz) language plpgsql security definer set search_path=public as $$
declare c record; ex record; blk text; r record; reply_sender uuid; nseq bigint; mid uuid := gen_random_uuid(); b text := btrim(coalesce(_body,'')); f uuid; mem record; title text; myrole text; locked int; begin
  select m.id, m.seq, m.created_at into ex from messages m where m.sender_id=auth.uid() and m.client_id=_client_id;
  if ex.id is not null then return query select ex.id, ex.seq, ex.created_at; return; end if;
  blk := conv_send_block(_conv);
  if blk is not null then raise exception '%', blk; end if;
  if length(b) > 4000 then raise exception 'الرسالة أطول من 4000 حرف'; end if;
  if b = '' and coalesce(array_length(_files,1),0)=0 then raise exception 'الرسالة فارغة'; end if;
  if coalesce(array_length(_files,1),0) > 5 then raise exception 'الحد 5 مرفقات للرسالة'; end if;
  if (select count(*) from messages m where m.sender_id=auth.uid() and m.created_at > now()-interval '1 minute') >= 20 then raise exception 'أرسلت رسائل كثيرة في وقت قصير، انتظر قليلًا'; end if;
  if _reply_to is not null then
    select cm.role into myrole from conversation_members cm where cm.conversation_id=_conv and cm.user_id=auth.uid() and cm.left_at is null;
    if not (select allow_replies from conversations where conversations.id=_conv) and myrole not in ('owner','moderator') then raise exception 'الردود مغلقة في هذه المجموعة'; end if;
    select * into r from messages m where m.id=_reply_to;
    if r.id is null or r.conversation_id<>_conv or r.deleted_at is not null or not can_read_conv_at(_conv, r.created_at) then raise exception 'لا يمكن الرد على هذه الرسالة'; end if;
    reply_sender := r.sender_id;
  end if;
  -- lock attachments so the cleanup job (skip locked) can never remove a file being linked
  select count(*) into locked from (select x.id from files x where x.id = any(coalesce(_files,'{}')) and x.source_type='message_pending' and x.source_id=_conv and x.uploaded_by=auth.uid() for update) q;
  if locked <> coalesce(array_length(_files,1),0) then raise exception 'مرفق غير صالح لهذه المحادثة أو انتهت مهلته؛ أعد رفعه'; end if;
  foreach f in array coalesce(_files,'{}') loop
    if not exists(select 1 from storage.objects o join files x on x.storage_path=o.name where x.id=f and o.bucket_id='rikaz-files') then raise exception 'المرفق لم يكتمل رفعه؛ أعد المحاولة'; end if;
  end loop;
  update conversations set last_seq=last_seq+1, last_message_at=now() where conversations.id=_conv returning * into c;
  nseq := c.last_seq;
  insert into messages(id, conversation_id, school_id, seq, sender_id, body, reply_to, client_id) values (mid, _conv, c.school_id, nseq, auth.uid(), b, _reply_to, _client_id);
  update files set source_type='message', source_id=mid where files.id = any(coalesce(_files,'{}'));
  update conversation_members set last_read_seq=nseq where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  title := case when c.kind='group' then 'رسالة جديدة في ' || c.title else 'رسالة جديدة من ' || coalesce((select p.full_name from profiles p where p.id=auth.uid()),'مستخدم') end;
  begin
    for mem in select cm.user_id from conversation_members cm where cm.conversation_id=_conv and cm.left_at is null and not cm.muted and cm.user_id<>auth.uid() loop
      perform _notify(mem.user_id, c.school_id, 'message', title, null, _conv_link(_conv), 'msg:' || mid);
    end loop;
    if reply_sender is not null and reply_sender<>auth.uid() then
      perform _notify(reply_sender, c.school_id, 'reply', 'رد على رسالتك', null, _conv_link(_conv), 'reply:' || mid);
    end if;
  exception when others then null;
  end;
  return query select m.id, m.seq, m.created_at from messages m where m.id=mid;
end $$;

-- ===== attachments (incl. cross-branch groups) =====
create or replace function public.create_message_file(_conv uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path=public as $$
declare c record; pol record; blk text; fid uuid := gen_random_uuid(); path text; sch uuid; begin
  select * into c from conversations where conversations.id=_conv;
  blk := conv_send_block(_conv);
  if blk is not null then raise exception '%', blk; end if;
  if not c.allow_attachments then raise exception 'المرفقات غير مسموحة في هذه المحادثة'; end if;
  -- cross-branch groups: the file is owned by the uploader's own branch in the same organization and follows that branch's file policy
  sch := coalesce(c.school_id, (select m.school_id from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id=c.org_id and m.school_id is not null order by m.created_at limit 1));
  if sch is null then raise exception 'لا يوجد فرع سارٍ لك في هذه المؤسسة لحفظ المرفق'; end if;
  select * into pol from _file_policy(sch);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size <= 0 or _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  if (select count(*) from files f where f.uploaded_by=auth.uid() and f.source_type='message_pending' and f.created_at > now()-interval '1 hour') >= 30 then raise exception 'تجاوزت حد المرفقات المؤقتة، حاول لاحقًا'; end if;
  path := sch || '/m/' || _conv || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id) values (fid, sch, path, left(_name,200), _mime, _size, 'message_pending', _conv);
  return query select fid, path;
end $$;

create or replace function public.update_group_settings(_conv uuid, _expected timestamptz, _title text, _description text, _post_policy text, _allow_attachments boolean, _history_policy text, _expires_at date) returns timestamptz
language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or not _group_admin(_conv) then raise exception 'غير مصرح'; end if;
  if c.updated_at <> _expected then raise exception 'عدّل مستخدم آخر الإعدادات للتو؛ حدّث الصفحة وأعد المحاولة'; end if;
  if length(btrim(coalesce(_title,''))) < 2 then raise exception 'اسم المجموعة مطلوب'; end if;
  if _post_policy not in ('all','moderators') or _history_policy not in ('from_join','full') then raise exception 'إعداد غير صالح'; end if;
  update conversations set title=case when group_type='section' then title else btrim(_title) end, description=_description, post_policy=_post_policy, allow_attachments=coalesce(_allow_attachments,false),
    history_policy=_history_policy, expires_at=case when group_type='section' then null else _expires_at end where id=_conv returning * into c;
  perform _audit(c.org_id, c.school_id, _conv, null, 'settings_update', jsonb_build_object('post_policy', _post_policy, 'history_policy', _history_policy, 'attachments', _allow_attachments));
  return c.updated_at;
end $$;

create or replace function public.set_class_group_settings(_conv uuid, _post_policy text, _allow_replies boolean, _allow_attachments boolean) returns void
language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or c.group_type<>'section' or not _group_admin(_conv) then raise exception 'إعدادات مجموعة الفصل للمعلم المكلف أو الإدارة فقط'; end if;
  if _post_policy not in ('all','moderators') then raise exception 'إعداد غير صالح'; end if;
  update conversations set post_policy=_post_policy, allow_replies=coalesce(_allow_replies, true), allow_attachments=coalesce(_allow_attachments, true) where id=_conv;
  perform _audit(c.org_id, c.school_id, _conv, null, 'settings_update', jsonb_build_object('post_policy', _post_policy, 'replies', _allow_replies, 'attachments', _allow_attachments));
end $$;

create or replace function public.pin_message(_id uuid, _pin boolean) returns void language plpgsql security definer set search_path=public as $$
declare m record; begin
  select * into m from messages where id=_id;
  if m is null or m.deleted_at is not null or not _group_admin(m.conversation_id) then raise exception 'التثبيت للمعلم المكلف أو مشرف المجموعة فقط'; end if;
  update messages set pinned_at=case when _pin then now() else null end, pinned_by=case when _pin then auth.uid() else null end where id=_id;
end $$;

-- ===== roster & private teacher->student chats =====
create or replace function public._teaches_section(_section uuid, _user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from courses co join teacher_assignments a on a.course_id=co.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
    join teachers t on t.id=a.teacher_id and t.status='active' and t.user_id=_user where co.section_id=_section)
$$;

create or replace function public.my_class_groups(_school uuid) returns table(section_id uuid, conversation_id uuid, title text, students bigint, subjects text)
language sql stable security definer set search_path=public as $$
  select se.id, c.id, c.title,
    (select count(*) from enrollments e where e.section_id=se.id and e.year_id=se.year_id and e.status='active'),
    (select string_agg(distinct su.name, '، ') from courses co join subjects su on su.id=co.subject_id join teacher_assignments a on a.course_id=co.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
       join teachers t on t.id=a.teacher_id where co.section_id=se.id and t.user_id=auth.uid())
  from sections se join academic_years y on y.id=se.year_id left join conversations c on c.dedupe_key='section:' || se.id
  where se.school_id=_school and y.is_current and (_teaches_section(se.id, auth.uid()) or can_manage_school(_school))
  order by c.title
$$;

create or replace function public.class_roster(_section uuid) returns table(student_id uuid, full_name text, has_account boolean, can_message boolean, conversation_id uuid, unread bigint)
language plpgsql stable security definer set search_path=public as $$
declare s record; begin
  select * into s from sections where id=_section;
  if s is null or not (_teaches_section(_section, auth.uid()) or can_manage_school(s.school_id)) then raise exception 'قائمة الفصل للمعلم المكلف أو الإدارة فقط'; end if;
  return query
    select st.id, st.full_name, st.user_id is not null, _student_ok(st.id, auth.uid()), c.id,
      coalesce((select count(*) from messages x join conversation_members m on m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null
         where x.conversation_id=c.id and x.seq>m.last_read_seq and x.sender_id<>auth.uid() and x.deleted_at is null), 0)
    from enrollments e join students st on st.id=e.student_id
      left join conversations c on c.dedupe_key='student:' || st.id || ':' || auth.uid()
    where e.section_id=_section and e.year_id=s.year_id and e.status='active'
    order by st.full_name;
end $$;

create or replace function public.start_student_conversation(_student uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare st record; cid uuid; key text; sec uuid; begin
  select * into st from students where id=_student;
  if st is null then raise exception 'بيانات غير صالحة'; end if;
  if st.user_id is null then raise exception 'المراسلة المباشرة غير متاحة حتى تفعيل حساب الطالب وربطه'; end if;
  if not _student_ok(_student, auth.uid()) then raise exception 'لا يمكنك مراسلة طالب خارج نطاق تكليفك'; end if;
  select e.section_id into sec from enrollments e where e.student_id=_student and e.status='active' and _teaches_section(e.section_id, auth.uid()) limit 1;
  key := 'student:' || _student || ':' || auth.uid();
  insert into conversations(org_id, school_id, kind, student_id, staff_user_id, staff_kind, section_id, dedupe_key, created_by)
    values (school_org(st.school_id), st.school_id, 'student', _student, auth.uid(), 'teacher', sec, key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select c.id into cid from conversations c where c.dedupe_key=key; update conversations set section_id=sec, status='active' where id=cid; end if;
  perform _add_member(cid, auth.uid(), 'member', 'relation', '-infinity');
  perform _add_member(cid, st.user_id, 'member', 'relation', '-infinity');
  return cid;
end $$;

drop function public.my_conversations(uuid);
create function public.my_conversations(_school uuid default null) returns table(
  id uuid, kind text, group_type text, title text, school_id uuid, school_name text, student_name text, counterpart text,
  last_body text, last_at timestamptz, last_seq bigint, unread bigint, muted boolean, archived boolean, status text, my_role text, send_block text,
  section_id uuid, section_label text, allow_replies boolean, post_policy text, allow_attachments boolean)
language sql stable security definer set search_path=public as $$
  select c.id, c.kind, c.group_type,
    case when c.kind='group' then c.title else coalesce(
      (select string_agg(p.full_name, '، ') from conversation_members o join profiles p on p.id=o.user_id where o.conversation_id=c.id and o.left_at is null and o.user_id<>auth.uid()),
      (select string_agg(p.full_name, '، ') from conversation_members o join profiles p on p.id=o.user_id where o.conversation_id=c.id and o.user_id<>auth.uid()), 'محادثة') end,
    c.school_id, s.name,
    (select st.full_name from students st where st.id=c.student_id),
    case when c.kind='family' then case when c.staff_user_id=auth.uid() then 'ولي الأمر' else case c.staff_kind when 'teacher' then 'المعلم' else 'الإدارة' end end
         when c.kind='student' then case when c.staff_user_id=auth.uid() then 'الطالب' else 'المعلم' end else null end,
    (select case when x.deleted_at is not null then 'رسالة محذوفة' when x.body='' then '📎 مرفق' else left(x.body, 80) end from messages x where x.conversation_id=c.id and x.created_at>=m.visible_from order by x.seq desc limit 1),
    coalesce(c.last_message_at, c.created_at), c.last_seq,
    (select count(*) from messages x where x.conversation_id=c.id and x.seq>m.last_read_seq and x.sender_id<>auth.uid() and x.deleted_at is null and x.created_at>=m.visible_from),
    m.muted, m.archived, c.status, m.role, conv_send_block(c.id),
    c.section_id, (select g.name || ' / ' || se.name from sections se join grades g on g.id=se.grade_id where se.id=c.section_id),
    c.allow_replies, c.post_policy, c.allow_attachments
  from conversation_members m join conversations c on c.id=m.conversation_id left join schools s on s.id=c.school_id
  where m.user_id=auth.uid() and m.left_at is null and conv_access_ok(c.id) and (_school is null or c.school_id=_school or c.school_id is null)
  order by coalesce(c.last_message_at, c.created_at) desc
$$;

-- ===== report reviewers: explicit roles per school (not every admin, not org owner/platform admin automatically) =====
create or replace function public._report_reviewer(_org uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case when _school is not null then exists(select 1 from memberships m left join comm_settings cs on cs.school_id=_school
      where m.user_id=auth.uid() and m.is_active and m.school_id=_school and m.role = any(coalesce(cs.report_reviewer_roles, '{principal,vice_principal}'::app_role[])))
    else exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id=_org and m.role='org_owner') end
$$;
drop policy "reports read" on public.message_reports;
create policy "reports read" on public.message_reports for select to authenticated using (reporter_id=auth.uid() or _report_reviewer(org_id, school_id));

create or replace function public.report_message(_message uuid, _reason text, _file uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare m record; c record; rid uuid; u uuid; roles app_role[]; begin
  select * into m from messages where id=_message;
  if m is null or not can_read_conv_at(m.conversation_id, m.created_at) then raise exception 'غير مصرح'; end if;
  if m.sender_id=auth.uid() then raise exception 'لا يمكنك الإبلاغ عن رسالتك'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب البلاغ'; end if;
  if _file is not null and not exists(select 1 from files f where f.id=_file and f.source_type='message' and f.source_id=_message) then raise exception 'المرفق لا يتبع الرسالة'; end if;
  select * into c from conversations where id=m.conversation_id;
  insert into message_reports(org_id, school_id, message_id, file_id, reason) values (c.org_id, c.school_id, _message, _file, left(btrim(_reason), 500))
    on conflict (message_id, reporter_id) do nothing returning id into rid;
  if rid is null then raise exception 'سبق أن أبلغت عن هذه الرسالة'; end if;
  roles := coalesce((select report_reviewer_roles from comm_settings where school_id=c.school_id), '{principal,vice_principal}');
  for u in select distinct mm.user_id from memberships mm where mm.is_active and mm.user_id<>m.sender_id and
      ((c.school_id is not null and mm.school_id=c.school_id and mm.role = any(roles)) or (c.school_id is null and mm.org_id=c.org_id and mm.role='org_owner')) loop
    perform _notify(u, c.school_id, 'report', 'بلاغ محتوى جديد بانتظار المراجعة', null, '/app/communication?tab=manage', 'report:' || rid);
  end loop;
  return rid;
end $$;

create or replace function public.report_detail(_id uuid) returns table(body text, sender text, conversation_title text, sent_at timestamptz, deleted boolean)
language plpgsql security definer set search_path=public as $$
declare r record; begin
  select * into r from message_reports where id=_id;
  if r is null or not _report_reviewer(r.org_id, r.school_id) then raise exception 'مراجعة البلاغات للجهة المخولة فقط'; end if;
  perform _audit(r.org_id, r.school_id, null, null, 'report_view', jsonb_build_object('report', _id, 'message', r.message_id, 'reason', 'مراجعة بلاغ'));
  -- only the reported message itself; never the rest of the conversation
  return query select coalesce(nullif(m.body,''), (select rv.body from message_revisions rv where rv.message_id=m.id order by rv.created_at desc limit 1), ''),
    coalesce(p.full_name,'—'), coalesce(nullif(c.title,''), case c.kind when 'family' then 'محادثة أسرة' when 'student' then 'محادثة معلم وطالب' else 'محادثة خاصة' end), m.created_at, m.deleted_at is not null
    from messages m join conversations c on c.id=m.conversation_id left join profiles p on p.id=m.sender_id where m.id=r.message_id;
end $$;

create or replace function public.decide_report(_id uuid, _status text, _decision text, _hide boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare r record; m record; begin
  select * into r from message_reports where id=_id for update;
  if r is null or not _report_reviewer(r.org_id, r.school_id) then raise exception 'غير مصرح'; end if;
  if _status not in ('resolved','dismissed','open') then raise exception 'حالة غير صالحة'; end if;
  if length(btrim(coalesce(_decision,''))) < 3 then raise exception 'اذكر سبب القرار'; end if;
  update message_reports set status=_status, decision=_decision, reviewed_by=auth.uid(), reviewed_at=now() where id=_id;
  if _hide and _status<>'open' then
    select * into m from messages where id=r.message_id;
    if m.deleted_at is null then
      insert into message_revisions(message_id, body, action, actor) values (m.id, m.body, 'moderate', auth.uid());
      update messages set body='', deleted_at=now(), deleted_by=auth.uid() where id=m.id;
    end if;
  end if;
  perform _audit(r.org_id, r.school_id, null, null, case when _status='open' then 'report_reopen' else 'report_decide' end, jsonb_build_object('report', _id, 'status', _status, 'hidden', _hide, 'reason', _decision));
  if _status<>'open' then perform _notify(r.reporter_id, r.school_id, 'report', 'تمت مراجعة بلاغك', _decision, '/app/communication', 'report-done:' || _id || ':' || extract(epoch from now())::bigint); end if;
end $$;

-- ===== storage: uploader may only delete objects not yet linked to a message =====
drop policy "rikaz files delete" on storage.objects;
create policy "rikaz files delete" on storage.objects for delete to authenticated using (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=objects.name and f.uploaded_by=auth.uid() and f.source_type in ('post','message_pending','circular')));

-- ===== server-side cleanup of unlinked files (pg_cron + pg_net -> Storage API) =====
create or replace function public.set_cleanup_credentials(_url text, _key text) returns void language plpgsql security definer set search_path=public, vault as $$
declare i uuid; begin
  select id into i from vault.secrets where name='rikaz_storage_url';
  if i is null then perform vault.create_secret(_url, 'rikaz_storage_url'); else perform vault.update_secret(i, _url); end if;
  select id into i from vault.secrets where name='rikaz_service_key';
  if i is null then perform vault.create_secret(_key, 'rikaz_service_key'); else perform vault.update_secret(i, _key); end if;
end $$;

create or replace function public.run_file_cleanup() returns jsonb language plpgsql security definer set search_path=public, storage as $$
declare cfg record; f record; url text; key text; n_mark int := 0; n_rm int := 0; n_req int := 0; n_fail int := 0; has_obj boolean; begin
  select * into cfg from file_cleanup_config;
  select decrypted_secret into url from vault.decrypted_secrets where name='rikaz_storage_url';
  select decrypted_secret into key from vault.decrypted_secrets where name='rikaz_service_key';
  -- 1) expired, never linked files -> cleanup_due (row lock; rows being linked by send_message are skipped)
  for f in select x.id from files x where x.source_type='message_pending' and x.created_at < now() - make_interval(mins => cfg.retention_minutes) for update skip locked loop
    update files set source_type='cleanup_due' where id=f.id; n_mark := n_mark + 1;
  end loop;
  -- post/circular rows whose upload never completed are also unreferenced
  for f in select x.id from files x where x.source_type in ('post','circular') and x.created_at < now() - make_interval(mins => cfg.retention_minutes)
      and not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=x.storage_path) for update skip locked loop
    delete from files where id=f.id; n_rm := n_rm + 1;
  end loop;
  -- 2) process due rows: object gone -> remove row; else request deletion through the Storage API (retry with cap)
  for f in select x.* from files x where x.source_type='cleanup_due' for update skip locked loop
    has_obj := exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path);
    if not has_obj then delete from files where id=f.id; n_rm := n_rm + 1;
    elsif f.cleanup_attempts >= cfg.max_attempts then
      if f.cleanup_error is distinct from 'max_attempts' then update files set cleanup_error='max_attempts' where id=f.id; end if; n_fail := n_fail + 1;
    elsif url is null or key is null then
      update files set cleanup_error='missing_credentials' where id=f.id; n_fail := n_fail + 1;
    elsif f.cleanup_last_at is null or f.cleanup_last_at < now() - interval '5 minutes' then
      perform net.http_delete(url := url || '/storage/v1/object/rikaz-files/' || f.storage_path,
        headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'apikey', key));
      update files set cleanup_attempts=cleanup_attempts+1, cleanup_last_at=now(), cleanup_error=null where id=f.id; n_req := n_req + 1;
    end if;
  end loop;
  insert into file_cleanup_runs(marked, rows_removed, delete_requests, failed) values (n_mark, n_rm, n_req, n_fail);
  delete from file_cleanup_runs where started_at < now() - interval '30 days';
  return jsonb_build_object('marked', n_mark, 'removed', n_rm, 'requests', n_req, 'failed', n_fail);
end $$;

select cron.schedule('rikaz-file-cleanup', '7 * * * *', 'select public.run_file_cleanup()');

-- ===== grants =====
do $$ declare f text; begin
  foreach f in array array['_student_ok(uuid,uuid)','conv_access_ok(uuid)','conv_send_block(uuid)','send_message(uuid,text,uuid,uuid,uuid[])','create_message_file(uuid,text,text,bigint)',
    'update_group_settings(uuid,timestamptz,text,text,text,boolean,text,date)','set_class_group_settings(uuid,text,boolean,boolean)','pin_message(uuid,boolean)','_teaches_section(uuid,uuid)',
    'my_class_groups(uuid)','class_roster(uuid)','start_student_conversation(uuid)','my_conversations(uuid)','_report_reviewer(uuid,uuid)','report_message(uuid,text,uuid)','report_detail(uuid)','decide_report(uuid,text,text,boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['sync_section_group(uuid)','_section_title(uuid)','_guard_section_members()','_sync_section_trg()','_sync_year_trg()','sync_derived_group(uuid)','_sync_school_derived()','set_cleanup_credentials(text,text)','run_file_cleanup()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  execute 'grant execute on function public.set_cleanup_credentials(text,text) to service_role';
  execute 'grant execute on function public.run_file_cleanup() to service_role';
end $$;