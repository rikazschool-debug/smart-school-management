-- ===================== P2: users / roles / invitations = organization owner only =====================
create table public.access_audit(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  actor uuid,
  action text not null,
  target_user uuid,
  target_membership uuid,
  target_invitation uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now());
grant select on public.access_audit to authenticated;
grant all on public.access_audit to service_role;
alter table public.access_audit enable row level security;
create policy "access audit owner read" on public.access_audit for select to authenticated using (is_org_owner(org_id));

create or replace function public._access_audit(_org uuid, _school uuid, _action text, _user uuid, _mem uuid, _inv uuid, _before jsonb, _after jsonb, _reason text) returns void
language sql security definer set search_path=public as $$
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, target_invitation, before, after, reason)
  values (_org, _school, auth.uid(), _action, _user, _mem, _inv, _before, _after, _reason) $$;
revoke execute on function public._access_audit(uuid,uuid,text,uuid,uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;

alter table public.invitations add column needs_review boolean not null default false,
  add column reviewed_by uuid, add column reviewed_at timestamptz;

-- an invitation grants a membership only if issued (or re-approved) by an active owner of that organization
create or replace function public._invite_valid(r public.invitations) returns boolean language sql stable security definer set search_path=public as $$
  select not r.needs_review and (r.reviewed_by is not null
    or exists(select 1 from memberships m where m.user_id=r.invited_by and m.org_id=r.org_id and m.role='org_owner' and m.is_active)) $$;
revoke execute on function public._invite_valid(public.invitations) from public, anon, authenticated;

-- pending invitations issued by non-owners now wait for owner review
update public.invitations i set needs_review=true
where i.accepted_at is null and i.revoked_at is null
  and not exists(select 1 from memberships m where m.user_id=i.invited_by and m.org_id=i.org_id and m.role='org_owner' and m.is_active);
insert into public.access_audit(org_id, school_id, actor, action, target_invitation, before, after, reason)
select org_id, school_id, null, 'invite_flag_review', id, jsonb_build_object('invited_by', invited_by, 'role', role), jsonb_build_object('needs_review', true), 'inviter is no longer authorized (owner-only rule)'
from public.invitations where needs_review;

create or replace function public.can_invite(_school uuid, _role app_role) returns boolean language sql stable security definer set search_path=public as $$
  select _school is not null and _role not in ('org_owner') and is_org_owner(school_org(_school)) $$;

create or replace function public.invite_member(_email text, _school uuid, _role app_role, _department uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare oid uuid; iid uuid; em text := lower(trim(_email));
begin
  oid := school_org(_school);
  if oid is null then raise exception 'مدرسة غير موجودة'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'بريد غير صالح'; end if;
  if not can_invite(_school, _role) then raise exception 'إدارة المستخدمين والدعوات لمالك المؤسسة فقط'; end if;
  if _department is not null and not exists(select 1 from departments where id=_department and school_id=_school) then raise exception 'القسم لا يتبع المدرسة'; end if;
  select id into iid from invitations where lower(email)=em and school_id=_school and role=_role and accepted_at is null and revoked_at is null and expires_at>now() and not needs_review;
  if iid is not null then return iid; end if;
  insert into invitations(email, org_id, school_id, department_id, role, invited_by) values (em, oid, _school, _department, _role, auth.uid()) returning id into iid;
  perform _access_audit(oid, _school, 'invite_create', null, null, iid, null, jsonb_build_object('email', em, 'role', _role, 'department', _department), null);
  return iid;
end $$;

create or replace function public.resend_invitation(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r record; t uuid := gen_random_uuid(); begin
  select * into r from invitations where id=_id for update;
  if r is null or not is_org_owner(r.org_id) then raise exception 'غير مصرح: الدعوات لمالك المؤسسة فقط'; end if;
  if r.accepted_at is not null then raise exception 'الدعوة مقبولة مسبقًا'; end if;
  update invitations set token=t, expires_at=now()+interval '7 days', revoked_at=null, resent_count=resent_count+1,
    needs_review=false, reviewed_by=case when r.needs_review then auth.uid() else reviewed_by end, reviewed_at=case when r.needs_review then now() else reviewed_at end where id=_id;
  perform _access_audit(r.org_id, r.school_id, case when r.needs_review then 'invite_review_reissue' else 'invite_resend' end, null, null, _id,
    jsonb_build_object('needs_review', r.needs_review, 'revoked', r.revoked_at is not null), jsonb_build_object('needs_review', false), null);
  return t;
end $$;

create or replace function public.revoke_invitation(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
  select * into r from invitations where id=_id for update;
  if r is null or not is_org_owner(r.org_id) then raise exception 'غير مصرح: الدعوات لمالك المؤسسة فقط'; end if;
  if r.accepted_at is not null then raise exception 'الدعوة مقبولة مسبقًا'; end if;
  update invitations set revoked_at=coalesce(revoked_at, now()) where id=_id;
  perform _access_audit(r.org_id, r.school_id, 'invite_revoke', null, null, _id, jsonb_build_object('needs_review', r.needs_review), jsonb_build_object('revoked', true), null);
end $$;

create or replace function public.accept_invitation(_token uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.invitations; em text; conf timestamptz;
begin
  select lower(email), email_confirmed_at into em, conf from auth.users where id=auth.uid();
  if em is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into r from invitations where token=_token for update;
  if r.id is null then raise exception 'الدعوة غير موجودة'; end if;
  if r.accepted_at is not null then raise exception 'تم استخدام هذه الدعوة مسبقًا'; end if;
  if r.revoked_at is not null then raise exception 'الدعوة ملغاة'; end if;
  if r.expires_at <= now() then raise exception 'انتهت صلاحية الدعوة'; end if;
  if lower(r.email) <> em then raise exception 'هذه الدعوة موجهة إلى بريد آخر'; end if;
  if conf is null then raise exception 'يجب تأكيد البريد الإلكتروني أولًا'; end if;
  if not _invite_valid(r) then raise exception 'الدعوة بانتظار مراجعة مالك المؤسسة'; end if;
  perform _apply_invitation(r, auth.uid(), em);
  return r.school_id;
end $$;

create or replace function public.accept_my_invitations() returns int language plpgsql security definer set search_path=public as $$
declare r public.invitations; n int := 0; em text; conf timestamptz;
begin
  select lower(email), email_confirmed_at into em, conf from auth.users where id=auth.uid();
  if em is null or conf is null then return 0; end if;
  for r in select * from invitations where lower(email)=em and accepted_at is null and revoked_at is null and expires_at>now() for update loop
    if _invite_valid(r) then perform _apply_invitation(r, auth.uid(), em); n := n+1;
    elsif not r.needs_review then
      update invitations set needs_review=true where id=r.id;
      insert into access_audit(org_id, school_id, actor, action, target_invitation, after, reason) values (r.org_id, r.school_id, null, 'invite_flag_review', r.id, jsonb_build_object('needs_review', true), 'inviter no longer an active owner');
    end if;
  end loop;
  return n;
end $$;

drop policy if exists "inv read" on public.invitations;
create policy "inv read" on public.invitations for select to authenticated using (is_org_owner(org_id));
drop policy if exists "inv delete" on public.invitations;
create policy "inv delete" on public.invitations for delete to authenticated using (accepted_at is null and is_org_owner(org_id));

-- memberships: no direct updates; only owner RPCs
drop policy if exists "membership deactivate" on public.memberships;
revoke update on public.memberships from authenticated;

create or replace function public.set_membership_active(_id uuid, _active boolean, _reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare m record; begin
  select * into m from memberships where id=_id for update;
  if m is null or not is_org_owner(m.org_id) then raise exception 'إدارة العضويات لمالك المؤسسة فقط'; end if;
  if m.is_active = _active then return; end if;
  if m.role='org_owner' and not _active and not exists(select 1 from memberships x where x.org_id=m.org_id and x.role='org_owner' and x.is_active and x.id<>m.id) then
    raise exception 'لا يمكن إيقاف آخر مالك فعال للمؤسسة'; end if;
  update memberships set is_active=_active, updated_at=now() where id=_id;
  perform _access_audit(m.org_id, m.school_id, case when _active then 'membership_activate' else 'membership_deactivate' end, m.user_id, _id,
    jsonb_build_object('is_active', m.is_active, 'role', m.role), jsonb_build_object('is_active', _active), _reason);
end $$;

create or replace function public.change_member_role(_id uuid, _role app_role, _department uuid default null, _reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare m record; begin
  select * into m from memberships where id=_id for update;
  if m is null or not is_org_owner(m.org_id) then raise exception 'إدارة الأدوار لمالك المؤسسة فقط'; end if;
  if m.role='org_owner' or _role='org_owner' then raise exception 'تغيير الملكية يتم عبر مسار نقل الملكية المحمي فقط'; end if;
  if m.school_id is null then raise exception 'عضوية بلا مدرسة'; end if;
  if _role='dept_head' and _department is null then raise exception 'حدد القسم لرئيس القسم'; end if;
  if _department is not null and not exists(select 1 from departments d where d.id=_department and d.school_id=m.school_id) then raise exception 'القسم لا يتبع المدرسة'; end if;
  if exists(select 1 from memberships x where x.user_id=m.user_id and x.school_id=m.school_id and x.role=_role and x.id<>m.id and x.is_active
            and x.department_id is not distinct from case when _role='dept_head' then _department else null end) then raise exception 'لدى المستخدم هذا الدور مسبقًا'; end if;
  update memberships set role=_role, department_id=case when _role='dept_head' then _department else null end, updated_at=now() where id=_id;
  perform _access_audit(m.org_id, m.school_id, 'membership_role_change', m.user_id, _id,
    jsonb_build_object('role', m.role, 'department', m.department_id), jsonb_build_object('role', _role, 'department', case when _role='dept_head' then _department end), _reason);
end $$;

-- academic staff request accounts from the owner instead of inviting
create table public.account_requests(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  kind text not null check (kind in ('teacher','guardian','student')),
  record_id uuid not null,
  email text not null,
  full_name text,
  requested_by uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid, decided_at timestamptz, note text, invitation_id uuid references public.invitations(id) on delete set null,
  created_at timestamptz not null default now());
create unique index account_requests_pending on public.account_requests(kind, record_id) where status='pending';
grant select on public.account_requests to authenticated;
grant all on public.account_requests to service_role;
alter table public.account_requests enable row level security;
create policy "acct req read" on public.account_requests for select to authenticated using (requested_by=auth.uid() or is_org_owner(org_id));

create or replace function public.request_account(_kind text, _record uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare sch uuid; em text; nm text; rid uuid; uid uuid; begin
  if _kind='teacher' then select school_id, lower(email), full_name, user_id into sch, em, nm, uid from teachers where id=_record;
  elsif _kind='guardian' then select school_id, lower(email), full_name, user_id into sch, em, nm, uid from guardians where id=_record;
  elsif _kind='student' then select school_id, lower(email), full_name, user_id into sch, em, nm, uid from students where id=_record;
  else raise exception 'نوع غير صالح'; end if;
  if sch is null then raise exception 'السجل غير موجود'; end if;
  if not (case when _kind='teacher' then can_manage_school(sch) else can_manage_students(sch) end) then raise exception 'غير مصرح'; end if;
  if uid is not null then raise exception 'السجل مرتبط بحساب مسبقًا'; end if;
  if em is null or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'أضف بريدًا صحيحًا للسجل أولًا'; end if;
  select id into rid from account_requests where kind=_kind and record_id=_record and status='pending';
  if rid is not null then return rid; end if;
  insert into account_requests(org_id, school_id, kind, record_id, email, full_name, requested_by) values (school_org(sch), sch, _kind, _record, em, nm, auth.uid()) returning id into rid;
  for uid in select m.user_id from memberships m where m.org_id=school_org(sch) and m.role='org_owner' and m.is_active loop
    perform _notify(uid, sch, 'account', 'طلب حساب جديد: ' || coalesce(nm, em), 'بانتظار مراجعتك في المستخدمين والأدوار', '/app/members', 'acct:' || rid || ':' || uid);
  end loop;
  return rid;
end $$;

create or replace function public.decide_account_request(_id uuid, _approve boolean, _note text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare r record; iid uuid; rl app_role; begin
  select * into r from account_requests where id=_id for update;
  if r is null or not is_org_owner(r.org_id) then raise exception 'مراجعة طلبات الحسابات لمالك المؤسسة فقط'; end if;
  if r.status<>'pending' then raise exception 'تمت مراجعة الطلب مسبقًا'; end if;
  if _approve then
    rl := r.kind::app_role;
    iid := invite_member(r.email, r.school_id, rl);
  end if;
  update account_requests set status=case when _approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), note=_note, invitation_id=iid where id=_id;
  perform _access_audit(r.org_id, r.school_id, case when _approve then 'account_request_approve' else 'account_request_reject' end, null, null, iid, jsonb_build_object('kind', r.kind, 'email', r.email, 'requested_by', r.requested_by), null, _note);
  perform _notify(r.requested_by, r.school_id, 'account', case when _approve then 'اعتُمد طلب الحساب: ' else 'رُفض طلب الحساب: ' end || coalesce(r.full_name, r.email), _note, null, 'acct-dec:' || _id);
  return iid;
end $$;

-- ===================== P1: manual groups = org owner (org/branches) or principal (own school) =====================
create or replace function public._can_create_group(_org uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case when _school is null then is_org_owner(_org)
    else school_org(_school) = _org and (is_org_owner(_org) or has_school_role(_school, array['principal']::app_role[])) end $$;

create or replace function public.create_group(_org uuid, _school uuid, _title text, _description text, _group_type text, _membership_mode text, _department uuid, _post_policy text, _allow_attachments boolean, _history_policy text, _expires_at date, _year uuid, _members uuid[], _moderators uuid[], _owner uuid default null, _request_key text default null)
 returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; org uuid := coalesce(school_org(_school), _org); owner uuid := coalesce(_owner, auth.uid()); u uuid; begin
  if _school is not null and _org is not null and school_org(_school)<>_org then raise exception 'المدرسة لا تتبع المؤسسة'; end if;
  if org is null or not _can_create_group(org, _school) then raise exception 'إنشاء المجموعات لمالك المؤسسة أو مدير المدرسة فقط'; end if;
  if coalesce(_group_type,'custom')='class' then raise exception 'مجموعات الفصول ينشئها النظام تلقائيًا'; end if;
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

-- adding members manually is an administrative act too (moderators/teachers cannot widen a group)
create or replace function public.add_group_members(_conv uuid, _users uuid[]) returns integer language plpgsql security definer set search_path=public as $$
declare c record; u uuid; n int := 0; begin
  select * into c from conversations where id=_conv for update;
  if c is null or c.kind<>'group' or not _can_create_group(c.org_id, c.school_id) then raise exception 'إضافة الأعضاء لمالك المؤسسة أو مدير المدرسة فقط'; end if;
  if c.section_id is not null then raise exception 'عضوية مجموعة الفصل تلقائية'; end if;
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

-- legacy manual groups whose creator is not an authorized creator: hand admin to an authorized admin (none exist today; kept for completeness)
do $$ declare g record; adm uuid; begin
  for g in select c.* from conversations c where c.kind='group' and c.membership_mode='manual' and c.section_id is null
    and not exists(select 1 from memberships m where m.user_id=c.created_by and m.is_active and m.org_id=c.org_id
                   and (m.role='org_owner' or (c.school_id is not null and m.school_id=c.school_id and m.role='principal'))) loop
    select m.user_id into adm from memberships m where m.is_active and m.org_id=g.org_id
      and ((g.school_id is not null and m.school_id=g.school_id and m.role='principal') or m.role='org_owner')
      order by (m.role='principal') desc, m.created_at limit 1;
    if adm is null then continue; end if;
    update conversation_members set role='member', updated_at=now() where conversation_id=g.id and role='owner' and user_id<>adm and left_at is null;
    if exists(select 1 from conversation_members where conversation_id=g.id and user_id=adm and left_at is null) then
      update conversation_members set role='owner', updated_at=now() where conversation_id=g.id and user_id=adm and left_at is null;
    else insert into conversation_members(conversation_id, user_id, role, source, visible_from, added_by) values (g.id, adm, 'owner', 'manual', '-infinity', null); end if;
    insert into comm_audit(org_id, school_id, conversation_id, actor, action, details) values (g.org_id, g.school_id, g.id, null, 'group_admin_handoff', jsonb_build_object('original_creator', g.created_by, 'new_owner', adm, 'reason', 'creator role no longer authorized to create groups'));
  end loop;
end $$;

-- ===================== P3: department heads limited to their assigned department(s) =====================
create or replace function public.my_dept_ids() returns setof uuid language sql stable security definer set search_path=public as $$
  select m.department_id from memberships m where m.user_id=auth.uid() and m.role='dept_head' and m.is_active and m.department_id is not null $$;
create or replace function public.is_dept_course(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from courses c join subjects s on s.id=c.subject_id where c.id=_course and s.department_id in (select my_dept_ids())) $$;
create or replace function public.dept_teacher_ids() returns setof uuid language sql stable security definer set search_path=public as $$
  select t.id from teachers t where t.department_id in (select my_dept_ids())
  union select a.teacher_id from teacher_assignments a where a.status='approved' and is_dept_course(a.course_id) $$;
revoke execute on function public.my_dept_ids(), public.is_dept_course(uuid), public.dept_teacher_ids(), public._can_create_group(uuid,uuid) from public, anon;
grant execute on function public.my_dept_ids(), public.is_dept_course(uuid), public.dept_teacher_ids(), public._can_create_group(uuid,uuid) to authenticated;
revoke execute on function public.set_membership_active(uuid,boolean,text), public.change_member_role(uuid,app_role,uuid,text), public.request_account(text,uuid), public.decide_account_request(uuid,boolean,text) from public, anon;
grant execute on function public.set_membership_active(uuid,boolean,text), public.change_member_role(uuid,app_role,uuid,text), public.request_account(text,uuid), public.decide_account_request(uuid,boolean,text) to authenticated;

-- school-wide staff read = managers + student affairs only
create or replace function public.staff_view(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_students(_school) $$;

create or replace function public.can_view_course(_course uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.staff_view(_school)
   or public.is_supervised_course(_course)
   or public.is_dept_course(_course)
   or exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=_course and a.status='approved' and t.user_id=auth.uid())
   or exists(select 1 from courses c join enrollments e on e.section_id=c.section_id and e.year_id=c.year_id and e.status='active'
       where c.id=_course and (public.is_student_self(e.student_id) or public.is_guardian_of(e.student_id))) $$;

create or replace function public.can_view_slot(_slot uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from timetable_slots s join timetables t on t.id=s.timetable_id where s.id=_slot and (
    can_manage_school(s.school_id)
    or (t.status='published' and (staff_view(s.school_id) or s.teacher_id in (select my_teacher_ids()) or s.teacher_id in (select supervised_teacher_ids())
        or is_dept_course(s.course_id)
        or in_section(s.section_id, t.year_id)
        or exists(select 1 from substitutions x where x.slot_id=s.id and x.substitute_teacher_id in (select my_teacher_ids()))))
  )) $$;

create or replace function public.can_read_post(_post uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from classroom_posts p join classrooms c on c.id=p.classroom_id join courses co on co.id=c.course_id where p.id=_post and (
    p.author_user_id=auth.uid() or is_course_teacher(c.course_id)
    or (p.status<>'draft' and (staff_view(p.school_id) or is_supervised_course(c.course_id) or is_dept_course(c.course_id)))
    or (p.status='published' and exists(select 1 from enrollments e where e.section_id=co.section_id and e.year_id=co.year_id and e.status='active'
         and (is_student_self(e.student_id) or (p.audience='students_guardians' and is_guardian_of(e.student_id)))))
  )) $$;

drop policy "teacher read" on public.teachers;
create policy "teacher read" on public.teachers for select to authenticated using (public.staff_view(school_id) or user_id=auth.uid()
  or id in (select public.supervised_teacher_ids()) or id in (select public.dept_teacher_ids())
  or exists(select 1 from teacher_assignments a join courses c on c.id=a.course_id where a.teacher_id=teachers.id and a.status='approved' and public.can_view_course(c.id, c.school_id)));

drop policy "assign read" on public.teacher_assignments;
create policy "assign read" on public.teacher_assignments for select to authenticated using (public.staff_view(school_id) or teacher_id in (select public.my_teacher_ids())
  or teacher_id in (select public.supervised_teacher_ids()) or public.is_dept_course(course_id));

drop policy "assign insert" on public.teacher_assignments;
create policy "assign insert" on public.teacher_assignments for insert to authenticated with check ((public.can_manage_school(school_id) or public.is_dept_course(course_id)) and status='pending');

drop policy "unav read" on public.teacher_unavailability;
create policy "unav read" on public.teacher_unavailability for select to authenticated using (staff_view(school_id) or teacher_id in (select my_teacher_ids()) or teacher_id in (select supervised_teacher_ids()) or teacher_id in (select dept_teacher_ids()));
drop policy "abs read" on public.teacher_absences;
create policy "abs read" on public.teacher_absences for select to authenticated using (staff_view(school_id) or teacher_id in (select my_teacher_ids()) or teacher_id in (select supervised_teacher_ids()) or teacher_id in (select dept_teacher_ids()));

-- ===================== P4: circular publisher identity from scope, snapshotted per version =====================
alter table public.circular_versions add column publisher_label text;
update public.circular_versions v set publisher_label=c.publisher_label from public.circulars c where c.id=v.circular_id and v.publisher_label is null;

create or replace function public._circ_label(_scope text, _school uuid, _org uuid) returns text language sql stable security definer set search_path=public as $$
  select case when coalesce(_scope,'school')='school'
    then 'إدارة المدرسة — ' || coalesce((select name from schools where id=_school), '')
    else 'إدارة المؤسسة — ' || coalesce((select name from organizations where id=_org), '') end $$;
revoke execute on function public._circ_label(text,uuid,uuid) from public, anon, authenticated;

update public.circulars set publisher_label=_circ_label(scope, school_id, org_id) where status='draft';

create or replace function public.save_circular(_id uuid, _school uuid, _title text, _body text, _publisher text, _priority text, _requires_ack boolean, _ack_due date, _aud jsonb, _scope text default 'school', _schools uuid[] default null)
 returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid := _id; c record; org uuid := school_org(_school); sc text := coalesce(_scope,'school'); tg uuid[]; begin
  -- _publisher is ignored: the publishing body is derived from the scope (no impersonation of another body)
  if sc not in ('school','branches','org') then raise exception 'نطاق غير صالح'; end if;
  if org is null or not _can_circ_scope(org, sc, _school) then raise exception 'لا تملك صلاحية النشر بهذا النطاق'; end if;
  if sc='branches' and exists(select 1 from unnest(coalesce(_schools,'{}')) s where school_org(s) is distinct from org) then raise exception 'فرع خارج المؤسسة'; end if;
  tg := _circ_targets(org, sc, _school, _schools);
  if coalesce(array_length(tg,1),0)=0 then raise exception 'اختر فرعًا واحدًا على الأقل'; end if;
  if length(btrim(coalesce(_title,''))) < 3 then raise exception 'عنوان التعميم مطلوب'; end if;
  if length(coalesce(_body,'')) > 20000 then raise exception 'المحتوى طويل جدًا'; end if;
  if cid is null then
    insert into circulars(org_id, school_id, title, body, publisher_label, priority, requires_ack, ack_due, audience, scope, target_schools, created_by)
      values (org, _school, btrim(_title), coalesce(_body,''), _circ_label(sc, _school, org), coalesce(_priority,'normal'), coalesce(_requires_ack,false), _ack_due, coalesce(_aud,'{}'), sc, tg, auth.uid())
      returning id into cid;
  else
    select * into c from circulars where id=cid for update;
    if c is null or c.org_id<>org or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير موجود'; end if;
    if c.status<>'draft' then raise exception 'التعميم منشور؛ استخدم «إصدار معدّل»'; end if;
    update circulars set school_id=_school, title=btrim(_title), body=coalesce(_body,''), publisher_label=_circ_label(sc, _school, org), priority=coalesce(_priority,'normal'), requires_ack=coalesce(_requires_ack,false), ack_due=_ack_due, audience=coalesce(_aud,'{}'), scope=sc, target_schools=tg where id=cid;
  end if;
  return cid;
end $$;

create or replace function public.publish_circular(_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare c record; n int; r record; tg uuid[]; lbl text; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'draft' then raise exception 'التعميم منشور مسبقًا'; end if;
  lbl := _circ_label(c.scope, c.school_id, c.org_id);
  tg := _circ_targets(c.org_id, c.scope, c.school_id, c.target_schools);
  insert into circular_recipients(circular_id, user_id, first_version, ack_required_version, school_id, roles, added_reason, added_by)
    select _id, a.user_id, 1, case when c.requires_ack then 1 else null end, a.school_id,
      (select string_agg(distinct m.role::text, ',') from memberships m where m.user_id=a.user_id and m.school_id=a.school_id and m.is_active), 'publish', auth.uid()
    from _circ_audience_multi(tg, c.audience) a on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'لا يوجد مستلمون مطابقون للجمهور المحدد'; end if;
  insert into circular_versions(circular_id, version, title, body, requires_ack, ack_due, audience, published_by, scope, target_schools, publisher_label) values (_id, 1, c.title, c.body, c.requires_ack, c.ack_due, c.audience, auth.uid(), c.scope, tg, lbl);
  update circulars set status='published', version=1, published_at=now(), target_schools=tg, publisher_label=lbl where id=_id;
  for r in select user_id, school_id from circular_recipients where circular_id=_id and user_id<>auth.uid() loop
    perform _notify(r.user_id, r.school_id, 'circular', case when c.requires_ack then 'تعميم يتطلب إقرارك: ' else 'تعميم جديد: ' end || c.title, lbl, '/app/communication?tab=circulars&circular=' || _id, 'circ:' || _id || ':1');
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_publish', jsonb_build_object('version', 1, 'recipients', n, 'scope', c.scope, 'schools', tg, 'publisher_label', lbl));
  return n;
end $$;

create or replace function public.revise_circular(_id uuid, _title text, _body text, _requires_new_ack boolean) returns integer language plpgsql security definer set search_path=public as $$
declare c record; v int; r record; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'published' then raise exception 'الإصدار المعدّل للتعاميم المنشورة فقط'; end if;
  v := c.version + 1;
  -- the publishing body stays as published (history is never rewritten silently)
  insert into circular_versions(circular_id, version, title, body, requires_ack, ack_due, audience, published_by, scope, target_schools, publisher_label) values (_id, v, btrim(_title), coalesce(_body,''), c.requires_ack or coalesce(_requires_new_ack,false), c.ack_due, c.audience, auth.uid(), c.scope, c.target_schools, c.publisher_label);
  update circulars set title=btrim(_title), body=coalesce(_body,''), version=v, requires_ack=c.requires_ack or coalesce(_requires_new_ack,false) where id=_id;
  if coalesce(_requires_new_ack,false) then update circular_recipients set ack_required_version=v where circular_id=_id; end if;
  for r in select x.user_id, x.school_id from circular_recipients x where x.circular_id=_id and x.user_id<>auth.uid()
      and exists(select 1 from memberships m where m.user_id=x.user_id and m.school_id=x.school_id and m.is_active) loop
    perform _notify(r.user_id, r.school_id, 'circular', 'تحديث تعميم (الإصدار ' || v || '): ' || btrim(_title), case when _requires_new_ack then 'يتطلب إقرارًا جديدًا' else 'تغيّر المحتوى؛ إقرارك السابق محفوظ' end, '/app/communication?tab=circulars&circular=' || _id, 'circ:' || _id || ':' || v);
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_revise', jsonb_build_object('version', v, 'new_ack', _requires_new_ack));
  return v;
end $$;