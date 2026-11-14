
-- ===== settings =====
create table public.comm_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  staff_direct_enabled boolean not null default true,
  edit_window_minutes integer not null default 15,
  dept_head_groups boolean not null default false,
  family_admin_roles public.app_role[] not null default '{principal,vice_principal,student_affairs}',
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.comm_settings to authenticated;
grant all on public.comm_settings to service_role;
alter table public.comm_settings enable row level security;
create policy "comm settings read" on public.comm_settings for select to authenticated using (is_school_member(school_id));
create policy "comm settings insert" on public.comm_settings for insert to authenticated with check (can_manage_school(school_id));
create policy "comm settings update" on public.comm_settings for update to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id) and edit_window_minutes between 0 and 1440);

-- ===== conversations =====
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  school_id uuid references public.schools(id),
  kind text not null check (kind in ('family','direct','group')),
  group_type text check (group_type in ('committee','department','team','custom')),
  title text not null default '',
  description text,
  student_id uuid references public.students(id),
  guardian_id uuid references public.guardians(id),
  staff_user_id uuid,
  staff_kind text check (staff_kind in ('teacher','admin')),
  department_id uuid references public.departments(id),
  membership_mode text not null default 'manual' check (membership_mode in ('manual','derived')),
  post_policy text not null default 'all' check (post_policy in ('all','moderators')),
  allow_attachments boolean not null default true,
  history_policy text not null default 'from_join' check (history_policy in ('from_join','full')),
  expires_at date,
  year_id uuid references public.academic_years(id),
  status text not null default 'active' check (status in ('active','archived')),
  dedupe_key text unique,
  last_seq bigint not null default 0,
  last_message_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create trigger conv_touch before update on public.conversations for each row execute function public.touch_updated_at();

create table public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner','moderator','member')),
  source text not null default 'manual' check (source in ('manual','derived','relation')),
  visible_from timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text,
  muted boolean not null default false,
  archived boolean not null default false,
  last_read_seq bigint not null default 0,
  added_by uuid,
  updated_at timestamptz not null default now()
);
create unique index conversation_members_active on public.conversation_members(conversation_id, user_id) where left_at is null;
create index conversation_members_user on public.conversation_members(user_id) where left_at is null;
grant select on public.conversation_members to authenticated;
grant all on public.conversation_members to service_role;
alter table public.conversation_members enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  school_id uuid references public.schools(id),
  seq bigint not null,
  sender_id uuid not null,
  body text not null default '',
  reply_to uuid references public.messages(id),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  unique (conversation_id, seq),
  unique (sender_id, client_id)
);
grant select on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create table public.message_revisions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  body text not null,
  action text not null,
  actor uuid not null,
  created_at timestamptz not null default now()
);
grant all on public.message_revisions to service_role;
alter table public.message_revisions enable row level security;

create table public.comm_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  school_id uuid,
  conversation_id uuid references public.conversations(id) on delete cascade,
  circular_id uuid,
  actor uuid,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant select on public.comm_audit to authenticated;
grant all on public.comm_audit to service_role;
alter table public.comm_audit enable row level security;

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  school_id uuid,
  message_id uuid not null references public.messages(id) on delete cascade,
  file_id uuid references public.files(id),
  reporter_id uuid not null default auth.uid(),
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  decision text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
grant select on public.message_reports to authenticated;
grant all on public.message_reports to service_role;
alter table public.message_reports enable row level security;

-- ===== circulars =====
create table public.circulars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  school_id uuid not null references public.schools(id),
  title text not null,
  body text not null default '',
  publisher_label text not null default 'إدارة المدرسة',
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  requires_ack boolean not null default false,
  ack_due date,
  audience jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 0,
  created_by uuid not null default auth.uid(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.circulars to authenticated;
grant all on public.circulars to service_role;
alter table public.circulars enable row level security;
create trigger circ_touch before update on public.circulars for each row execute function public.touch_updated_at();

create table public.circular_versions (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  requires_ack boolean not null,
  ack_due date,
  audience jsonb not null,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  unique (circular_id, version)
);
grant select on public.circular_versions to authenticated;
grant all on public.circular_versions to service_role;
alter table public.circular_versions enable row level security;

create table public.circular_recipients (
  circular_id uuid not null references public.circulars(id) on delete cascade,
  user_id uuid not null,
  first_version integer not null,
  ack_required_version integer,
  opened_at timestamptz,
  primary key (circular_id, user_id)
);
grant select on public.circular_recipients to authenticated;
grant all on public.circular_recipients to service_role;
alter table public.circular_recipients enable row level security;

create table public.circular_acks (
  id uuid primary key default gen_random_uuid(),
  circular_id uuid not null references public.circulars(id) on delete cascade,
  user_id uuid not null,
  version integer not null,
  acked_at timestamptz not null default now(),
  unique (circular_id, user_id, version)
);
grant select on public.circular_acks to authenticated;
grant all on public.circular_acks to service_role;
alter table public.circular_acks enable row level security;

-- ===== access helpers =====
create or replace function public.conv_access_ok(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversations c where c.id=_conv and (
      (c.school_id is not null and exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and (m.school_id=c.school_id or (m.role='org_owner' and m.org_id=c.org_id))))
      or (c.school_id is null and exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id=c.org_id)))
    and (c.kind<>'family' or c.staff_user_id=auth.uid() or exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
         where sg.guardian_id=c.guardian_id and sg.student_id=c.student_id and g.user_id=auth.uid() and sg.verified and sg.can_follow)))
$$;

create or replace function public.is_conv_member(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversation_members m where m.conversation_id=_conv and m.user_id=auth.uid() and m.left_at is null) and conv_access_ok(_conv)
$$;

create or replace function public.can_read_conv_at(_conv uuid, _at timestamptz) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversation_members m where m.conversation_id=_conv and m.user_id=auth.uid() and m.left_at is null and _at >= m.visible_from) and conv_access_ok(_conv)
$$;

create or replace function public._eligible_staff(_org uuid, _school uuid, _user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships m where m.user_id=_user and m.is_active and m.role not in ('guardian','student')
    and ((_school is not null and (m.school_id=_school or (m.role='org_owner' and m.org_id=_org))) or (_school is null and m.org_id=_org)))
$$;

create or replace function public._scope_manager(_org uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case when _school is not null then can_manage_school(_school) else (is_platform_admin() or is_org_owner(_org)) end
$$;

create or replace function public._family_ok(_student uuid, _guardian uuid, _staff uuid, _kind text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
      where sg.student_id=_student and sg.guardian_id=_guardian and sg.verified and sg.can_follow and g.user_id is not null
        and exists(select 1 from memberships m where m.user_id=g.user_id and m.school_id=sg.school_id and m.is_active))
  and case _kind
    when 'teacher' then exists(select 1 from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
        join teacher_assignments a on a.course_id=c.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
        join teachers t on t.id=a.teacher_id
        where e.student_id=_student and e.status='active' and t.user_id=_staff and t.status='active'
          and exists(select 1 from memberships m where m.user_id=_staff and m.school_id=e.school_id and m.is_active))
    when 'admin' then exists(select 1 from enrollments e join memberships m on m.school_id=e.school_id left join comm_settings cs on cs.school_id=e.school_id
        where e.student_id=_student and e.status='active' and m.user_id=_staff and m.is_active
          and m.role = any(coalesce(cs.family_admin_roles, '{principal,vice_principal,student_affairs}'::app_role[])))
    else false end
$$;

-- why sending is blocked (null = allowed)
create or replace function public.conv_send_block(_conv uuid) returns text language plpgsql stable security definer set search_path=public as $$
declare c record; m record; begin
  select * into c from conversations where id=_conv;
  if c is null then return 'المحادثة غير موجودة'; end if;
  select * into m from conversation_members where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  if m is null or not conv_access_ok(_conv) then return 'لست عضوًا في هذه المحادثة'; end if;
  if c.status='archived' then return 'المحادثة مؤرشفة؛ الإرسال متوقف'; end if;
  if c.expires_at is not null and c.expires_at < current_date then return 'انتهت مدة هذه المجموعة'; end if;
  if c.kind='group' and c.post_policy='moderators' and m.role not in ('owner','moderator') then return 'النشر في هذه المجموعة للمشرفين فقط'; end if;
  if c.kind='family' and not _family_ok(c.student_id, c.guardian_id, c.staff_user_id, c.staff_kind) then return 'انتهت العلاقة التعليمية أو الأسرية التي قامت عليها المحادثة؛ متاحة للقراءة فقط'; end if;
  if c.kind='direct' then
    if not coalesce((select staff_direct_enabled from comm_settings where school_id=c.school_id), true) and not can_manage_school(c.school_id) then return 'أوقفت الإدارة الرسائل الخاصة بين الموظفين؛ مجموعات العمل متاحة'; end if;
    if exists(select 1 from conversation_members o where o.conversation_id=_conv and o.left_at is null and not _eligible_staff(c.org_id, c.school_id, o.user_id)) then return 'الطرف الآخر لم يعد عضوًا ساريًا في المدرسة'; end if;
  end if;
  return null;
end $$;

-- ===== policies =====
create policy "conv read" on public.conversations for select to authenticated using (is_conv_member(id) or (kind='group' and _scope_manager(org_id, school_id)));
create policy "conv members read" on public.conversation_members for select to authenticated using (user_id=auth.uid() or is_conv_member(conversation_id) or exists(select 1 from conversations c where c.id=conversation_id and c.kind='group' and _scope_manager(c.org_id, c.school_id)));
create policy "messages read" on public.messages for select to authenticated using (can_read_conv_at(conversation_id, created_at));
create policy "audit read" on public.comm_audit for select to authenticated using (_scope_manager(org_id, school_id) or (conversation_id is not null and action not like 'report%' and exists(select 1 from conversation_members m where m.conversation_id=comm_audit.conversation_id and m.user_id=auth.uid() and m.left_at is null and m.role in ('owner','moderator'))));
create policy "reports read" on public.message_reports for select to authenticated using (reporter_id=auth.uid() or _scope_manager(org_id, school_id));

create or replace function public.can_read_circular(_c uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from circulars c where c.id=_c and (can_manage_school(c.school_id)
    or (c.status<>'draft' and is_school_member(c.school_id) and exists(select 1 from circular_recipients r where r.circular_id=c.id and r.user_id=auth.uid()))))
$$;
create policy "circ read" on public.circulars for select to authenticated using (can_read_circular(id));
create policy "circ versions read" on public.circular_versions for select to authenticated using (can_read_circular(circular_id));
create policy "circ recipients read" on public.circular_recipients for select to authenticated using (user_id=auth.uid() or exists(select 1 from circulars c where c.id=circular_id and can_manage_school(c.school_id)));
create policy "circ acks read" on public.circular_acks for select to authenticated using (user_id=auth.uid() or exists(select 1 from circulars c where c.id=circular_id and can_manage_school(c.school_id)));

-- ===== files: extend to messages & circulars =====
create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (
    (f.uploaded_by=auth.uid() and f.source_type in ('post','message_pending','circular'))
    or (f.source_type='post' and can_read_post(f.source_id))
    or (f.source_type='message' and exists(select 1 from messages m where m.id=f.source_id and m.deleted_at is null and can_read_conv_at(m.conversation_id, m.created_at)))
    or (f.source_type='circular' and can_read_circular(f.source_id))))
$$;
drop policy "files read" on public.files;
create policy "files read" on public.files for select to authenticated using (can_read_file(id));
drop policy "files delete" on public.files;
create policy "files delete" on public.files for delete to authenticated using (uploaded_by=auth.uid() and source_type in ('post','message_pending','circular'));

create or replace function public._file_policy(_school uuid) returns table(max_bytes bigint, allowed_types text[]) language sql stable security definer set search_path=public as $$
  select coalesce((select p.max_bytes from file_policies p where p.school_id=_school), 10485760),
         coalesce((select p.allowed_types from file_policies p where p.school_id=_school), '{application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain}'::text[])
$$;

create or replace function public.create_message_file(_conv uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path=public as $$
declare c record; pol record; blk text; fid uuid := gen_random_uuid(); path text; begin
  select * into c from conversations where conversations.id=_conv;
  blk := conv_send_block(_conv);
  if blk is not null then raise exception '%', blk; end if;
  if not c.allow_attachments then raise exception 'المرفقات غير مسموحة في هذه المحادثة'; end if;
  if c.school_id is null then raise exception 'المرفقات غير متاحة في المجموعات العابرة للفروع حاليًا'; end if;
  select * into pol from _file_policy(c.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size <= 0 or _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  if (select count(*) from files f where f.uploaded_by=auth.uid() and f.source_type='message_pending' and f.created_at > now()-interval '1 hour') >= 30 then raise exception 'تجاوزت حد المرفقات المؤقتة، حاول لاحقًا'; end if;
  path := c.school_id || '/m/' || _conv || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id) values (fid, c.school_id, path, left(_name,200), _mime, _size, 'message_pending', _conv);
  return query select fid, path;
end $$;

create or replace function public._audit(_org uuid, _school uuid, _conv uuid, _circ uuid, _action text, _details jsonb) returns void language sql security definer set search_path=public as $$
  insert into comm_audit(org_id, school_id, conversation_id, circular_id, actor, action, details) values (_org, _school, _conv, _circ, auth.uid(), _action, coalesce(_details,'{}'))
$$;

create or replace function public._conv_link(_conv uuid) returns text language sql immutable as $$ select '/app/communication?c=' || _conv $$;

-- ===== messages =====
create or replace function public.send_message(_conv uuid, _body text, _client_id uuid, _reply_to uuid default null, _files uuid[] default '{}')
returns table(id uuid, seq bigint, created_at timestamptz) language plpgsql security definer set search_path=public as $$
declare c record; ex record; blk text; r record; nseq bigint; mid uuid := gen_random_uuid(); b text := btrim(coalesce(_body,'')); f uuid; mem record; title text; begin
  select m.id, m.seq, m.created_at into ex from messages m where m.sender_id=auth.uid() and m.client_id=_client_id;
  if ex.id is not null then return query select ex.id, ex.seq, ex.created_at; return; end if;
  blk := conv_send_block(_conv);
  if blk is not null then raise exception '%', blk; end if;
  if length(b) > 4000 then raise exception 'الرسالة أطول من 4000 حرف'; end if;
  if b = '' and coalesce(array_length(_files,1),0)=0 then raise exception 'الرسالة فارغة'; end if;
  if coalesce(array_length(_files,1),0) > 5 then raise exception 'الحد 5 مرفقات للرسالة'; end if;
  if (select count(*) from messages m where m.sender_id=auth.uid() and m.created_at > now()-interval '1 minute') >= 20 then raise exception 'أرسلت رسائل كثيرة في وقت قصير، انتظر قليلًا'; end if;
  if _reply_to is not null then
    select * into r from messages m where m.id=_reply_to;
    if r is null or r.conversation_id<>_conv or r.deleted_at is not null or not can_read_conv_at(_conv, r.created_at) then raise exception 'لا يمكن الرد على هذه الرسالة'; end if;
  end if;
  foreach f in array coalesce(_files,'{}') loop
    if not exists(select 1 from files x where x.id=f and x.source_type='message_pending' and x.source_id=_conv and x.uploaded_by=auth.uid()) then raise exception 'مرفق غير صالح لهذه المحادثة'; end if;
    if not exists(select 1 from storage.objects o join files x on x.storage_path=o.name where x.id=f and o.bucket_id='rikaz-files') then raise exception 'المرفق لم يكتمل رفعه؛ أعد المحاولة'; end if;
  end loop;
  update conversations set last_seq=last_seq+1, last_message_at=now() where conversations.id=_conv returning * into c;
  nseq := c.last_seq;
  insert into messages(id, conversation_id, school_id, seq, sender_id, body, reply_to, client_id) values (mid, _conv, c.school_id, nseq, auth.uid(), b, _reply_to, _client_id);
  update files set source_type='message', source_id=mid where files.id = any(coalesce(_files,'{}'));
  update conversation_members set last_read_seq=nseq where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  title := case when c.kind='group' then 'رسالة جديدة في ' || c.title else 'رسالة جديدة من ' || coalesce((select full_name from profiles where profiles.id=auth.uid()),'مستخدم') end;
  begin
    for mem in select user_id from conversation_members where conversation_id=_conv and left_at is null and not muted and user_id<>auth.uid() loop
      perform _notify(mem.user_id, c.school_id, 'message', title, null, _conv_link(_conv), 'msg:' || mid);
    end loop;
    if r.id is not null and r.sender_id<>auth.uid() then
      perform _notify(r.sender_id, c.school_id, 'reply', 'رد على رسالتك', null, _conv_link(_conv), 'reply:' || mid);
    end if;
  exception when others then null; -- notification failure never undoes or duplicates the message
  end;
  return query select m.id, m.seq, m.created_at from messages m where m.id=mid;
end $$;

create or replace function public.edit_message(_id uuid, _body text) returns void language plpgsql security definer set search_path=public as $$
declare m record; win int; b text := btrim(coalesce(_body,'')); begin
  select * into m from messages where id=_id;
  if m is null or m.sender_id<>auth.uid() or not can_read_conv_at(m.conversation_id, m.created_at) then raise exception 'لا يمكنك تعديل هذه الرسالة'; end if;
  if m.deleted_at is not null then raise exception 'الرسالة محذوفة'; end if;
  if conv_send_block(m.conversation_id) is not null then raise exception '%', conv_send_block(m.conversation_id); end if;
  win := coalesce((select edit_window_minutes from comm_settings where school_id=m.school_id), 15);
  if m.created_at < now() - make_interval(mins => win) then raise exception 'انتهت مهلة التعديل (% دقيقة)', win; end if;
  if b='' or length(b)>4000 then raise exception 'نص غير صالح'; end if;
  insert into message_revisions(message_id, body, action, actor) values (_id, m.body, 'edit', auth.uid());
  update messages set body=b, edited_at=now() where id=_id;
end $$;

create or replace function public.delete_message(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m record; win int; is_mod boolean; begin
  select * into m from messages where id=_id;
  if m is null or not can_read_conv_at(m.conversation_id, m.created_at) then raise exception 'غير مصرح'; end if;
  if m.deleted_at is not null then return; end if;
  is_mod := exists(select 1 from conversation_members x join conversations c on c.id=x.conversation_id where x.conversation_id=m.conversation_id and x.user_id=auth.uid() and x.left_at is null and x.role in ('owner','moderator') and c.kind='group');
  win := coalesce((select edit_window_minutes from comm_settings where school_id=m.school_id), 15);
  if not ((m.sender_id=auth.uid() and m.created_at >= now() - make_interval(mins => win)) or is_mod) then raise exception 'لا يمكنك حذف هذه الرسالة (مهلة الحذف % دقيقة لصاحبها، أو مشرف المجموعة)', win; end if;
  insert into message_revisions(message_id, body, action, actor) values (_id, m.body, 'delete', auth.uid());
  update messages set body='', deleted_at=now(), deleted_by=auth.uid() where id=_id;
  if is_mod and m.sender_id<>auth.uid() then
    perform _audit((select org_id from conversations where id=m.conversation_id), m.school_id, m.conversation_id, null, 'moderate_delete', jsonb_build_object('message', _id));
  end if;
end $$;

create or replace function public.mark_conversation_read(_conv uuid, _seq bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_conv_member(_conv) then return; end if;
  update conversation_members set last_read_seq=greatest(last_read_seq, least(_seq, (select last_seq from conversations where id=_conv)))
    where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  if not exists(select 1 from conversation_members m join messages x on x.conversation_id=m.conversation_id and x.seq>m.last_read_seq and x.sender_id<>auth.uid() and x.deleted_at is null and x.created_at>=m.visible_from
      where m.conversation_id=_conv and m.user_id=auth.uid() and m.left_at is null) then
    update notifications set read_at=now() where user_id=auth.uid() and link=_conv_link(_conv) and read_at is null;
  end if;
end $$;

create or replace function public.set_member_prefs(_conv uuid, _muted boolean, _archived boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_conv_member(_conv) then raise exception 'لست عضوًا'; end if;
  update conversation_members set muted=coalesce(_muted, muted), archived=coalesce(_archived, archived), updated_at=now() where conversation_id=_conv and user_id=auth.uid() and left_at is null;
end $$;

-- ===== list =====
create or replace function public.my_conversations(_school uuid default null) returns table(
  id uuid, kind text, group_type text, title text, school_id uuid, school_name text, student_name text, counterpart text,
  last_body text, last_at timestamptz, last_seq bigint, unread bigint, muted boolean, archived boolean, status text, my_role text, send_block text)
language sql stable security definer set search_path=public as $$
  select c.id, c.kind, c.group_type,
    case when c.kind='group' then c.title else coalesce(
      (select string_agg(p.full_name, '، ') from conversation_members o join profiles p on p.id=o.user_id where o.conversation_id=c.id and o.left_at is null and o.user_id<>auth.uid()),
      (select string_agg(p.full_name, '، ') from conversation_members o join profiles p on p.id=o.user_id where o.conversation_id=c.id and o.user_id<>auth.uid()), 'محادثة') end,
    c.school_id, s.name,
    (select st.full_name from students st where st.id=c.student_id),
    case when c.kind='family' then case when c.staff_user_id=auth.uid() then 'ولي الأمر' else case c.staff_kind when 'teacher' then 'المعلم' else 'الإدارة' end end else null end,
    (select case when x.deleted_at is not null then 'رسالة محذوفة' when x.body='' then '📎 مرفق' else left(x.body, 80) end from messages x where x.conversation_id=c.id and x.created_at>=m.visible_from order by x.seq desc limit 1),
    coalesce(c.last_message_at, c.created_at), c.last_seq,
    (select count(*) from messages x where x.conversation_id=c.id and x.seq>m.last_read_seq and x.sender_id<>auth.uid() and x.deleted_at is null and x.created_at>=m.visible_from),
    m.muted, m.archived, c.status, m.role, conv_send_block(c.id)
  from conversation_members m join conversations c on c.id=m.conversation_id left join schools s on s.id=c.school_id
  where m.user_id=auth.uid() and m.left_at is null and conv_access_ok(c.id) and (_school is null or c.school_id=_school or c.school_id is null)
  order by coalesce(c.last_message_at, c.created_at) desc
$$;

create or replace function public.search_messages(_q text, _school uuid default null) returns table(message_id uuid, conversation_id uuid, seq bigint, body text, created_at timestamptz, conv_title text)
language sql stable security definer set search_path=public as $$
  select x.id, x.conversation_id, x.seq, left(x.body, 200), x.created_at, coalesce(nullif(c.title,''), 'محادثة')
  from conversation_members m join conversations c on c.id=m.conversation_id join messages x on x.conversation_id=c.id and x.created_at>=m.visible_from
  where m.user_id=auth.uid() and m.left_at is null and conv_access_ok(c.id) and x.deleted_at is null
    and length(btrim(_q))>=2 and x.body ilike '%' || replace(replace(btrim(_q),'%','\%'),'_','\_') || '%'
    and (_school is null or c.school_id=_school or c.school_id is null)
  order by x.created_at desc limit 50
$$;

create or replace function public.conversation_people(_conv uuid) returns table(user_id uuid, full_name text, role text, source text, joined_at timestamptz, last_read_seq bigint)
language sql stable security definer set search_path=public as $$
  select m.user_id, coalesce(p.full_name,'مستخدم'), m.role, m.source, m.joined_at, m.last_read_seq
  from conversation_members m left join profiles p on p.id=m.user_id
  where m.conversation_id=_conv and m.left_at is null
    and (is_conv_member(_conv) or exists(select 1 from conversations c where c.id=_conv and c.kind='group' and _scope_manager(c.org_id, c.school_id)))
  order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end, p.full_name
$$;

-- ===== starting conversations =====
create or replace function public.teacher_students(_school uuid) returns table(student_id uuid, full_name text, section text, subject text)
language sql stable security definer set search_path=public as $$
  select distinct st.id, st.full_name, se.name, su.name
  from teachers t join teacher_assignments a on a.teacher_id=t.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date)
    join courses c on c.id=a.course_id join subjects su on su.id=c.subject_id join sections se on se.id=c.section_id
    join enrollments e on e.section_id=c.section_id and e.year_id=c.year_id and e.status='active' join students st on st.id=e.student_id
  where t.user_id=auth.uid() and t.school_id=_school and t.status='active'
  order by se.name, st.full_name
$$;

create or replace function public.family_contacts(_student uuid) returns table(guardian_id uuid, full_name text, relationship text)
language sql stable security definer set search_path=public as $$
  select g.id, g.full_name, sg.relationship from student_guardians sg join guardians g on g.id=sg.guardian_id
  where sg.student_id=_student and _family_ok(_student, g.id, auth.uid(), 'teacher') order by g.full_name
$$;

create or replace function public.guardian_contacts(_student uuid) returns table(user_id uuid, full_name text, label text, kind text)
language sql stable security definer set search_path=public as $$
  with me as (select g.id gid from guardians g join student_guardians sg on sg.guardian_id=g.id where g.user_id=auth.uid() and sg.student_id=_student and sg.verified and sg.can_follow limit 1)
  select distinct t.user_id, t.full_name, 'معلم ' || su.name, 'teacher'
  from me, enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id join subjects su on su.id=c.subject_id
    join teacher_assignments a on a.course_id=c.id and a.status='approved' and (a.end_date is null or a.end_date>=current_date) join teachers t on t.id=a.teacher_id
  where e.student_id=_student and e.status='active' and t.user_id is not null and _family_ok(_student, me.gid, t.user_id, 'teacher')
  union
  select distinct m.user_id, coalesce(p.full_name,'—'), case m.role when 'principal' then 'مدير المدرسة' when 'vice_principal' then 'الوكيل' when 'student_affairs' then 'شؤون الطلاب' when 'counselor' then 'المرشد الطلابي' else m.role::text end, 'admin'
  from me, enrollments e join memberships m on m.school_id=e.school_id and m.is_active left join profiles p on p.id=m.user_id
  where e.student_id=_student and e.status='active' and _family_ok(_student, me.gid, m.user_id, 'admin')
$$;

create or replace function public._add_member(_conv uuid, _user uuid, _role text, _source text, _visible timestamptz) returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into conversation_members(conversation_id, user_id, role, source, visible_from, added_by) values (_conv, _user, _role, _source, _visible, auth.uid())
  on conflict (conversation_id, user_id) where left_at is null do nothing;
  return found;
end $$;

create or replace function public.start_family_conversation(_student uuid, _guardian uuid, _staff_user uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare g record; kind text; st record; cid uuid; key text; begin
  select * into g from guardians where id=_guardian;
  select * into st from students where id=_student;
  if g is null or st is null then raise exception 'بيانات غير صالحة'; end if;
  if auth.uid() not in (_staff_user, g.user_id) then raise exception 'لا يمكنك بدء محادثة باسم مستخدم آخر'; end if;
  kind := case when _family_ok(_student, _guardian, _staff_user, 'teacher') then 'teacher' when _family_ok(_student, _guardian, _staff_user, 'admin') then 'admin' else null end;
  if kind is null then raise exception 'لا توجد علاقة تعليمية أو أسرية سارية تسمح بهذه المحادثة'; end if;
  key := 'family:' || _student || ':' || _guardian || ':' || _staff_user;
  insert into conversations(org_id, school_id, kind, student_id, guardian_id, staff_user_id, staff_kind, dedupe_key, created_by)
    values (school_org(st.school_id), st.school_id, 'family', _student, _guardian, _staff_user, kind, key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select id into cid from conversations where dedupe_key=key; update conversations set staff_kind=kind, status='active' where id=cid; end if;
  perform _add_member(cid, _staff_user, 'member', 'relation', '-infinity');
  perform _add_member(cid, g.user_id, 'member', 'relation', '-infinity');
  return cid;
end $$;

create or replace function public.staff_directory(_school uuid, _org uuid default null) returns table(user_id uuid, full_name text, role app_role, school_name text, department text, department_id uuid)
language sql stable security definer set search_path=public as $$
  select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—'), m.role, s.name, d.name, coalesce(m.department_id, t.department_id)
  from memberships m left join profiles p on p.id=m.user_id left join schools s on s.id=m.school_id
    left join teachers t on t.user_id=m.user_id and t.school_id=m.school_id
    left join departments d on d.id=coalesce(m.department_id, t.department_id)
  where m.is_active and m.role not in ('guardian','student')
    and ((_school is not null and m.school_id=_school and _eligible_staff(school_org(_school), _school, auth.uid()))
      or (_school is null and _org is not null and m.org_id=_org and (is_org_owner(_org) or is_platform_admin())))
  order by m.user_id, m.role
$$;

create or replace function public.start_direct_conversation(_school uuid, _other uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; key text; org uuid := school_org(_school); begin
  if _other = auth.uid() then raise exception 'لا يمكن مراسلة نفسك'; end if;
  if not _eligible_staff(org, _school, auth.uid()) or not _eligible_staff(org, _school, _other) then raise exception 'المراسلة الداخلية متاحة بين موظفي المدرسة الساريين فقط'; end if;
  if not coalesce((select staff_direct_enabled from comm_settings where school_id=_school), true) and not can_manage_school(_school) then raise exception 'أوقفت الإدارة الرسائل الخاصة بين الموظفين؛ استخدم مجموعات العمل'; end if;
  key := 'direct:' || _school || ':' || least(auth.uid(), _other) || ':' || greatest(auth.uid(), _other);
  insert into conversations(org_id, school_id, kind, dedupe_key, created_by) values (org, _school, 'direct', key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select id into cid from conversations where dedupe_key=key; end if;
  perform _add_member(cid, auth.uid(), 'member', 'relation', '-infinity');
  perform _add_member(cid, _other, 'member', 'relation', '-infinity');
  return cid;
end $$;

-- ===== groups =====
create or replace function public._group_admin(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversations c where c.id=_conv and c.kind='group' and (
    _scope_manager(c.org_id, c.school_id)
    or (exists(select 1 from conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null and m.role in ('owner','moderator')) and conv_access_ok(c.id))))
$$;

create or replace function public.sync_derived_group(_conv uuid) returns integer language plpgsql security definer set search_path=public as $$
declare c record; n int := 0; u uuid; begin
  select * into c from conversations where id=_conv;
  if c is null or c.membership_mode<>'derived' or c.department_id is null then return 0; end if;
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

create or replace function public._sync_school_derived() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid; sch uuid := coalesce(new.school_id, old.school_id); begin
  for cid in select id from conversations where school_id=sch and kind='group' and membership_mode='derived' loop
    perform sync_derived_group(cid);
  end loop;
  return null;
end $$;
create trigger teachers_sync_groups after insert or update of department_id, status, user_id or delete on public.teachers for each row execute function public._sync_school_derived();
create trigger memberships_sync_groups after update of is_active on public.memberships for each row execute function public._sync_school_derived();

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
            coalesce(_allow_attachments,true) and _school is not null, coalesce(_history_policy,'from_join'), _expires_at, _year,
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

create or replace function public.add_group_members(_conv uuid, _users uuid[]) returns integer language plpgsql security definer set search_path=public as $$
declare c record; u uuid; n int := 0; begin
  select * into c from conversations where id=_conv for update;
  if c is null or not _group_admin(_conv) then raise exception 'غير مصرح بإدارة أعضاء هذه المجموعة'; end if;
  if c.status='archived' then raise exception 'المجموعة مؤرشفة'; end if;
  foreach u in array coalesce(_users,'{}') loop
    if not _eligible_staff(c.org_id, c.school_id, u) then raise exception 'لا يمكن إضافة مستخدم خارج نطاق المجموعة'; end if;
    if _add_member(_conv, u, 'member', 'manual', case when c.history_policy='full' then '-infinity'::timestamptz else now() end) then
      n := n + 1;
      perform _notify(u, c.school_id, 'group', 'أُضفت إلى مجموعة: ' || c.title, null, _conv_link(_conv), 'grp-add:' || _conv || ':' || u || ':' || extract(epoch from now())::bigint);
      perform _audit(c.org_id, c.school_id, _conv, null, 'member_add', jsonb_build_object('user', u));
    end if;
  end loop;
  return n;
end $$;

create or replace function public.remove_group_member(_conv uuid, _user uuid) returns void language plpgsql security definer set search_path=public as $$
declare c record; m record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or not _group_admin(_conv) then raise exception 'غير مصرح'; end if;
  select * into m from conversation_members where conversation_id=_conv and user_id=_user and left_at is null;
  if m is null then return; end if;
  if m.role='owner' then raise exception 'انقل الملكية أولًا؛ لا تُترك المجموعة بلا مالك'; end if;
  if m.source='derived' then raise exception 'العضو مشتق من القسم؛ غيّر قسمه أو قاعدة المجموعة'; end if;
  update conversation_members set left_at=now(), left_reason='أزاله المسؤول', updated_at=now() where id=m.id;
  perform _audit(c.org_id, c.school_id, _conv, null, 'member_remove', jsonb_build_object('user', _user));
end $$;

create or replace function public.set_group_role(_conv uuid, _user uuid, _role text) returns void language plpgsql security definer set search_path=public as $$
declare c record; m record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or not (_scope_manager(c.org_id, c.school_id) or exists(select 1 from conversation_members x where x.conversation_id=_conv and x.user_id=auth.uid() and x.left_at is null and x.role='owner')) then raise exception 'تعيين المشرفين للمالك أو الإدارة فقط'; end if;
  if _role not in ('moderator','member') then raise exception 'دور غير صالح'; end if;
  select * into m from conversation_members where conversation_id=_conv and user_id=_user and left_at is null;
  if m is null then raise exception 'ليس عضوًا'; end if;
  if m.role='owner' then raise exception 'لا يمكن تغيير دور المالك؛ انقل الملكية'; end if;
  update conversation_members set role=_role, updated_at=now() where id=m.id;
  perform _audit(c.org_id, c.school_id, _conv, null, 'role_change', jsonb_build_object('user', _user, 'role', _role));
end $$;

create or replace function public.transfer_group_owner(_conv uuid, _user uuid) returns void language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or not (_scope_manager(c.org_id, c.school_id) or exists(select 1 from conversation_members x where x.conversation_id=_conv and x.user_id=auth.uid() and x.left_at is null and x.role='owner')) then raise exception 'نقل الملكية للمالك أو الإدارة فقط'; end if;
  if not exists(select 1 from conversation_members where conversation_id=_conv and user_id=_user and left_at is null) or not _eligible_staff(c.org_id, c.school_id, _user) then raise exception 'المالك الجديد يجب أن يكون عضوًا ساريًا ضمن النطاق'; end if;
  update conversation_members set role='moderator', updated_at=now() where conversation_id=_conv and left_at is null and role='owner';
  update conversation_members set role='owner', updated_at=now() where conversation_id=_conv and user_id=_user and left_at is null;
  perform _audit(c.org_id, c.school_id, _conv, null, 'owner_transfer', jsonb_build_object('user', _user));
end $$;

create or replace function public.leave_group(_conv uuid) returns void language plpgsql security definer set search_path=public as $$
declare c record; m record; begin
  select * into c from conversations where id=_conv for update;
  select * into m from conversation_members where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  if c is null or c.kind<>'group' or m is null then raise exception 'لست عضوًا في هذه المجموعة'; end if;
  if m.role='owner' then raise exception 'انقل الملكية قبل المغادرة'; end if;
  if m.source='derived' then raise exception 'عضويتك مشتقة من القسم؛ يمكنك كتم المجموعة بدل مغادرتها'; end if;
  update conversation_members set left_at=now(), left_reason='غادر', updated_at=now() where id=m.id;
  perform _audit(c.org_id, c.school_id, _conv, null, 'member_leave', '{}');
end $$;

create or replace function public.set_group_status(_conv uuid, _status text) returns void language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or c.kind<>'group' or not (_scope_manager(c.org_id, c.school_id) or exists(select 1 from conversation_members x where x.conversation_id=_conv and x.user_id=auth.uid() and x.left_at is null and x.role='owner')) then raise exception 'الأرشفة وإعادة الفتح للمالك أو الإدارة'; end if;
  if _status not in ('active','archived') then raise exception 'حالة غير صالحة'; end if;
  update conversations set status=_status where id=_conv;
  perform _audit(c.org_id, c.school_id, _conv, null, case when _status='archived' then 'group_archive' else 'group_reopen' end, '{}');
end $$;

create or replace function public.update_group_settings(_conv uuid, _expected timestamptz, _title text, _description text, _post_policy text, _allow_attachments boolean, _history_policy text, _expires_at date) returns timestamptz
language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from conversations where id=_conv for update;
  if c is null or not _group_admin(_conv) then raise exception 'غير مصرح'; end if;
  if c.updated_at <> _expected then raise exception 'عدّل مستخدم آخر الإعدادات للتو؛ حدّث الصفحة وأعد المحاولة'; end if;
  if length(btrim(coalesce(_title,''))) < 2 then raise exception 'اسم المجموعة مطلوب'; end if;
  if _post_policy not in ('all','moderators') or _history_policy not in ('from_join','full') then raise exception 'إعداد غير صالح'; end if;
  update conversations set title=btrim(_title), description=_description, post_policy=_post_policy, allow_attachments=coalesce(_allow_attachments,false) and school_id is not null,
    history_policy=_history_policy, expires_at=_expires_at where id=_conv returning * into c;
  perform _audit(c.org_id, c.school_id, _conv, null, 'settings_update', jsonb_build_object('post_policy', _post_policy, 'history_policy', _history_policy, 'attachments', _allow_attachments));
  return c.updated_at;
end $$;

-- ===== reports =====
create or replace function public.report_message(_message uuid, _reason text, _file uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare m record; c record; rid uuid; u uuid; begin
  select * into m from messages where id=_message;
  if m is null or not can_read_conv_at(m.conversation_id, m.created_at) then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب البلاغ'; end if;
  if _file is not null and not exists(select 1 from files f where f.id=_file and f.source_type='message' and f.source_id=_message) then raise exception 'المرفق لا يتبع الرسالة'; end if;
  select * into c from conversations where id=m.conversation_id;
  insert into message_reports(org_id, school_id, message_id, file_id, reason) values (c.org_id, c.school_id, _message, _file, left(btrim(_reason), 500))
    on conflict (message_id, reporter_id) do nothing returning id into rid;
  if rid is null then raise exception 'سبق أن أبلغت عن هذه الرسالة'; end if;
  for u in select distinct mm.user_id from memberships mm where mm.is_active and ((mm.school_id=c.school_id and mm.role in ('principal','vice_principal')) or (mm.org_id=c.org_id and mm.role='org_owner')) loop
    perform _notify(u, c.school_id, 'report', 'بلاغ محتوى جديد بانتظار المراجعة', null, '/app/communication?tab=manage', 'report:' || rid);
  end loop;
  return rid;
end $$;

create or replace function public.report_detail(_id uuid) returns table(body text, sender text, conversation_title text, sent_at timestamptz, deleted boolean)
language plpgsql security definer set search_path=public as $$
declare r record; begin
  select * into r from message_reports where id=_id;
  if r is null or not _scope_manager(r.org_id, r.school_id) then raise exception 'مراجعة البلاغات للجهة المخولة فقط'; end if;
  perform _audit(r.org_id, r.school_id, null, null, 'report_view', jsonb_build_object('report', _id, 'message', r.message_id, 'reason', 'مراجعة بلاغ'));
  return query select coalesce(nullif(m.body,''), (select rv.body from message_revisions rv where rv.message_id=m.id order by rv.created_at desc limit 1), ''),
    coalesce(p.full_name,'—'), coalesce(nullif(c.title,''), case c.kind when 'family' then 'محادثة أسرة' else 'محادثة خاصة' end), m.created_at, m.deleted_at is not null
    from messages m join conversations c on c.id=m.conversation_id left join profiles p on p.id=m.sender_id where m.id=r.message_id;
end $$;

create or replace function public.decide_report(_id uuid, _status text, _decision text, _hide boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare r record; m record; begin
  select * into r from message_reports where id=_id for update;
  if r is null or not _scope_manager(r.org_id, r.school_id) then raise exception 'غير مصرح'; end if;
  if _status not in ('resolved','dismissed') then raise exception 'حالة غير صالحة'; end if;
  update message_reports set status=_status, decision=_decision, reviewed_by=auth.uid(), reviewed_at=now() where id=_id;
  if _hide then
    select * into m from messages where id=r.message_id;
    if m.deleted_at is null then
      insert into message_revisions(message_id, body, action, actor) values (m.id, m.body, 'moderate', auth.uid());
      update messages set body='', deleted_at=now(), deleted_by=auth.uid() where id=m.id;
    end if;
  end if;
  perform _audit(r.org_id, r.school_id, null, null, 'report_decide', jsonb_build_object('report', _id, 'status', _status, 'hidden', _hide));
  perform _notify(r.reporter_id, r.school_id, 'report', 'تمت مراجعة بلاغك', _decision, '/app/communication', 'report-done:' || _id);
end $$;

-- ===== circulars =====
create or replace function public._circular_audience(_school uuid, _aud jsonb) returns setof uuid language sql stable security definer set search_path=public as $$
  select distinct u from (
    select m.user_id u from memberships m where m.school_id=_school and m.is_active and m.role::text in (select jsonb_array_elements_text(coalesce(_aud->'roles','[]')))
    union select t.user_id from teachers t where t.school_id=_school and t.status='active' and t.user_id is not null and t.department_id::text in (select jsonb_array_elements_text(coalesce(_aud->'departments','[]')))
    union select cm.user_id from conversation_members cm join conversations c on c.id=cm.conversation_id where c.school_id=_school and c.kind='group' and cm.left_at is null and c.id::text in (select jsonb_array_elements_text(coalesce(_aud->'groups','[]')))
    union select m.user_id from memberships m where m.school_id=_school and m.is_active and m.user_id::text in (select jsonb_array_elements_text(coalesce(_aud->'users','[]')))
  ) q where u is not null and exists(select 1 from memberships m where m.user_id=q.u and m.school_id=_school and m.is_active)
$$;

create or replace function public.preview_circular_audience(_school uuid, _aud jsonb) returns table(user_id uuid, full_name text, role text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not can_manage_school(_school) then raise exception 'غير مصرح'; end if;
  return query select a, coalesce(p.full_name,'—'), (select string_agg(m.role::text, ',') from memberships m where m.user_id=a and m.school_id=_school and m.is_active)
    from _circular_audience(_school, _aud) a left join profiles p on p.id=a order by 2;
end $$;

create or replace function public.save_circular(_id uuid, _school uuid, _title text, _body text, _publisher text, _priority text, _requires_ack boolean, _ack_due date, _aud jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid := _id; c record; begin
  if not can_manage_school(_school) then raise exception 'إنشاء التعاميم للإدارة المخولة'; end if;
  if length(btrim(coalesce(_title,''))) < 3 then raise exception 'عنوان التعميم مطلوب'; end if;
  if length(coalesce(_body,'')) > 20000 then raise exception 'المحتوى طويل جدًا'; end if;
  if cid is null then
    insert into circulars(org_id, school_id, title, body, publisher_label, priority, requires_ack, ack_due, audience)
      values (school_org(_school), _school, btrim(_title), coalesce(_body,''), coalesce(nullif(btrim(_publisher),''),'إدارة المدرسة'), coalesce(_priority,'normal'), coalesce(_requires_ack,false), _ack_due, coalesce(_aud,'{}'))
      returning id into cid;
  else
    select * into c from circulars where id=cid for update;
    if c is null or c.school_id<>_school then raise exception 'غير موجود'; end if;
    if c.status<>'draft' then raise exception 'التعميم منشور؛ استخدم «إصدار معدّل»'; end if;
    update circulars set title=btrim(_title), body=coalesce(_body,''), publisher_label=coalesce(nullif(btrim(_publisher),''),'إدارة المدرسة'), priority=coalesce(_priority,'normal'), requires_ack=coalesce(_requires_ack,false), ack_due=_ack_due, audience=coalesce(_aud,'{}') where id=cid;
  end if;
  return cid;
end $$;

create or replace function public.publish_circular(_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare c record; n int; u uuid; begin
  select * into c from circulars where id=_id for update;
  if c is null or not can_manage_school(c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'draft' then raise exception 'التعميم منشور مسبقًا'; end if;
  insert into circular_recipients(circular_id, user_id, first_version, ack_required_version)
    select _id, a, 1, case when c.requires_ack then 1 else null end from _circular_audience(c.school_id, c.audience) a on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'لا يوجد مستلمون مطابقون للجمهور المحدد'; end if;
  insert into circular_versions(circular_id, version, title, body, requires_ack, ack_due, audience, published_by) values (_id, 1, c.title, c.body, c.requires_ack, c.ack_due, c.audience, auth.uid());
  update circulars set status='published', version=1, published_at=now() where id=_id;
  for u in select user_id from circular_recipients where circular_id=_id and user_id<>auth.uid() loop
    perform _notify(u, c.school_id, 'circular', case when c.requires_ack then 'تعميم يتطلب إقرارك: ' else 'تعميم جديد: ' end || c.title, c.publisher_label, '/app/communication?tab=circulars&circular=' || _id, 'circ:' || _id || ':1');
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_publish', jsonb_build_object('version', 1, 'recipients', n));
  return n;
end $$;

create or replace function public.revise_circular(_id uuid, _title text, _body text, _requires_new_ack boolean) returns integer language plpgsql security definer set search_path=public as $$
declare c record; v int; u uuid; begin
  select * into c from circulars where id=_id for update;
  if c is null or not can_manage_school(c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'published' then raise exception 'الإصدار المعدّل للتعاميم المنشورة فقط'; end if;
  v := c.version + 1;
  insert into circular_versions(circular_id, version, title, body, requires_ack, ack_due, audience, published_by) values (_id, v, btrim(_title), coalesce(_body,''), c.requires_ack or coalesce(_requires_new_ack,false), c.ack_due, c.audience, auth.uid());
  update circulars set title=btrim(_title), body=coalesce(_body,''), version=v, requires_ack=c.requires_ack or coalesce(_requires_new_ack,false) where id=_id;
  if coalesce(_requires_new_ack,false) then update circular_recipients set ack_required_version=v where circular_id=_id; end if;
  for u in select user_id from circular_recipients where circular_id=_id and user_id<>auth.uid() loop
    perform _notify(u, c.school_id, 'circular', 'تحديث تعميم (الإصدار ' || v || '): ' || btrim(_title), case when _requires_new_ack then 'يتطلب إقرارًا جديدًا' else null end, '/app/communication?tab=circulars&circular=' || _id, 'circ:' || _id || ':' || v);
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_revise', jsonb_build_object('version', v, 'new_ack', _requires_new_ack));
  return v;
end $$;

create or replace function public.archive_circular(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from circulars where id=_id;
  if c is null or not can_manage_school(c.school_id) then raise exception 'غير مصرح'; end if;
  update circulars set status='archived' where id=_id;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_archive', '{}');
end $$;

create or replace function public.open_circular(_id uuid) returns void language sql security definer set search_path=public as $$
  update circular_recipients set opened_at=now() where circular_id=_id and user_id=auth.uid() and opened_at is null and can_read_circular(_id)
$$;

create or replace function public.ack_circular(_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare c record; r record; begin
  select * into c from circulars where id=_id;
  select * into r from circular_recipients where circular_id=_id and user_id=auth.uid();
  if c is null or r is null or not can_read_circular(_id) then raise exception 'لست ضمن مستلمي هذا التعميم'; end if;
  if c.status<>'published' then raise exception 'التعميم غير منشور'; end if;
  if r.ack_required_version is null then raise exception 'هذا التعميم لا يتطلب إقرارًا'; end if;
  insert into circular_acks(circular_id, user_id, version) values (_id, auth.uid(), c.version) on conflict do nothing;
  update circular_recipients set opened_at=coalesce(opened_at, now()) where circular_id=_id and user_id=auth.uid();
  update notifications set read_at=now() where user_id=auth.uid() and link='/app/communication?tab=circulars&circular=' || _id and read_at is null;
  return c.version;
end $$;

create or replace function public.circular_stats(_id uuid) returns table(user_id uuid, full_name text, role text, opened_at timestamptz, acked_at timestamptz, acked_version integer, ack_required_version integer)
language plpgsql stable security definer set search_path=public as $$
declare c record; begin
  select * into c from circulars where id=_id;
  if c is null or not can_manage_school(c.school_id) then raise exception 'غير مصرح'; end if;
  return query select r.user_id, coalesce(p.full_name,'—'), (select string_agg(m.role::text, ',') from memberships m where m.user_id=r.user_id and m.school_id=c.school_id and m.is_active),
    r.opened_at, a.acked_at, a.version, r.ack_required_version
    from circular_recipients r left join profiles p on p.id=r.user_id
    left join lateral (select x.acked_at, x.version from circular_acks x where x.circular_id=_id and x.user_id=r.user_id and x.version >= coalesce(r.ack_required_version, 0) order by x.version desc limit 1) a on true
    where r.circular_id=_id order by p.full_name;
end $$;

create or replace function public.remind_circular_ack(_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare c record; n int := 0; u uuid; begin
  select * into c from circulars where id=_id;
  if c is null or not can_manage_school(c.school_id) or c.status<>'published' then raise exception 'غير مصرح'; end if;
  for u in select r.user_id from circular_recipients r where r.circular_id=_id and r.ack_required_version is not null
      and not exists(select 1 from circular_acks a where a.circular_id=_id and a.user_id=r.user_id and a.version>=r.ack_required_version) loop
    perform _notify(u, c.school_id, 'circular', 'تذكير: إقرار مطلوب على تعميم ' || c.title, null, '/app/communication?tab=circulars&circular=' || _id, 'circ-remind:' || _id || ':' || c.version || ':' || current_date);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.create_circular_file(_circular uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path=public as $$
declare c record; pol record; fid uuid := gen_random_uuid(); path text; begin
  select * into c from circulars where circulars.id=_circular;
  if c is null or not can_manage_school(c.school_id) or c.status<>'draft' then raise exception 'المرفقات تضاف للمسودة من الإدارة'; end if;
  select * into pol from _file_policy(c.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size <= 0 or _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح'; end if;
  path := c.school_id || '/c/' || _circular || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id) values (fid, c.school_id, path, left(_name,200), _mime, _size, 'circular', _circular);
  return query select fid, path;
end $$;

-- internal helpers are not callable directly
revoke execute on function public._add_member(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public._audit(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public._sync_school_derived() from public, anon, authenticated;
revoke execute on function public.sync_derived_group(uuid) from public, anon, authenticated;
revoke execute on function public._circular_audience(uuid, jsonb) from public, anon, authenticated;

-- realtime (RLS still applies)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversation_members;
