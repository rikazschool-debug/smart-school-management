alter table public.pickup_requests
  add column if not exists delegate_mode text not null default 'self' check (delegate_mode in ('self','authorized','one_time')),
  add column if not exists delegate_relationship text,
  add column if not exists delegate_phone text,
  add column if not exists delegate_id_last4 text,
  add column if not exists delegate_ack_at timestamptz,
  add column if not exists delegate_status text check (delegate_status in ('pending','approved','rejected')),
  add column if not exists delegate_decided_by uuid,
  add column if not exists delegate_decided_at timestamptz,
  add column if not exists delegate_note text,
  add column if not exists delegate_valid_until timestamptz,
  add column if not exists delegate_used_at timestamptz;
update public.pickup_requests set delegate_mode='authorized' where pickup_person_id is not null and delegate_mode='self';

-- sensitive delegate columns are not readable directly (only through pickup_delegate_detail)
revoke select on public.pickup_requests from authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(column_name), ',') into cols from information_schema.columns
  where table_schema='public' and table_name='pickup_requests' and column_name not in ('delegate_phone','delegate_id_last4');
  execute format('grant select (%s) on public.pickup_requests to authenticated', cols);
end $$;

create or replace function public._pickup_delegate_set(_id uuid, _mode text, _person uuid, _d jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests; ap authorized_pickups; g guardians; nm text; ph text; l4 text; rel text;
begin
  select * into r from pickup_requests where id=_id;
  select * into g from guardians where id=r.guardian_id;
  if _mode='self' then
    update pickup_requests set delegate_mode='self', pickup_person_id=null, pickup_name=g.full_name, delegate_relationship=null, delegate_phone=null, delegate_id_last4=null,
      delegate_ack_at=null, delegate_status=null, delegate_decided_by=null, delegate_decided_at=null, delegate_note=null, delegate_valid_until=null where id=_id;
  elsif _mode='authorized' then
    select * into ap from authorized_pickups where id=_person and student_id=r.student_id and active;
    if ap.id is null then raise exception 'المستلم غير مفوض لهذا الطالب'; end if;
    update pickup_requests set delegate_mode='authorized', pickup_person_id=ap.id, pickup_name=ap.full_name, delegate_relationship=ap.relationship, delegate_phone=null, delegate_id_last4=null,
      delegate_ack_at=null, delegate_status=null, delegate_decided_by=null, delegate_decided_at=null, delegate_note=null, delegate_valid_until=null where id=_id;
  elsif _mode='one_time' then
    nm := regexp_replace(trim(coalesce(_d->>'name','')), '\s+', ' ', 'g'); rel := trim(coalesce(_d->>'relationship',''));
    ph := regexp_replace(coalesce(_d->>'phone',''), '[\s-]', '', 'g'); l4 := trim(coalesce(_d->>'id_last4',''));
    if array_length(string_to_array(nm, ' '), 1) is null or array_length(string_to_array(nm, ' '), 1) < 3 then raise exception 'اكتب الاسم الكامل للمفوَّض (ثلاثي على الأقل)'; end if;
    if rel = '' then raise exception 'صلة القرابة أو العلاقة مطلوبة'; end if;
    if ph !~ '^\+?[0-9]{9,15}$' then raise exception 'رقم الجوال غير صحيح'; end if;
    if l4 !~ '^[0-9]{4}$' then raise exception 'آخر 4 أرقام من هوية المفوَّض مطلوبة'; end if;
    if coalesce((_d->>'ack')::boolean, false) is not true then raise exception 'إقرار ولي الأمر بالتفويض مطلوب'; end if;
    update pickup_requests set delegate_mode='one_time', pickup_person_id=null, pickup_name=nm, delegate_relationship=left(rel,60), delegate_phone=ph, delegate_id_last4=l4,
      delegate_ack_at=now(), delegate_status='pending', delegate_decided_by=null, delegate_decided_at=null, delegate_note=null,
      delegate_valid_until=((r.req_date + 1)::timestamp at time zone 'Asia/Riyadh'), delegate_used_at=null where id=_id;
    perform public._notify(m.user_id, r.school_id, 'pickup', 'تفويض استلام بانتظار الاعتماد', (select full_name from students where id=r.student_id), '/app/attendance', 'pickup-deleg:' || _id || ':' || extract(epoch from now())::bigint || ':' || m.user_id)
    from memberships m where m.school_id=r.school_id and m.is_active and m.role = any((public._att_default_policy(r.school_id)).approver_roles);
  else raise exception 'نوع المستلم غير صحيح'; end if;
end $$;
revoke execute on function public._pickup_delegate_set(uuid,text,uuid,jsonb) from public, anon, authenticated;

create or replace function public.submit_pickup_request(_student uuid, _kind text, _reason text, _planned_at timestamptz, _mode text, _person uuid, _delegate jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare nid uuid;
begin
  if _mode not in ('self','authorized','one_time') then raise exception 'اختر المستلم'; end if;
  nid := public.create_pickup_request(_student, _kind, _reason, _planned_at, case when _mode='authorized' then _person else null end);
  if _mode='one_time' then perform public._pickup_delegate_set(nid, 'one_time', null, _delegate); end if;
  if _mode<>'self' then perform public._att_event((select school_id from pickup_requests where id=nid), 'pickup', nid, 'delegate_set', null, jsonb_build_object('mode', _mode), null); end if;
  return nid;
end $$;

create or replace function public.update_pickup_delegate(_id uuid, _mode text, _person uuid, _delegate jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or r.requested_by <> auth.uid() then raise exception 'غير مصرح'; end if;
  if r.status not in ('submitted','under_review','approved') then raise exception 'لا يمكن تعديل المستلم بعد بدء التنفيذ أو إغلاق الطلب'; end if;
  perform public._pickup_delegate_set(_id, _mode, _person, _delegate);
  if r.kind='permission' and r.status='approved' then
    update pickup_requests set status='under_review', decided_by=null, decided_at=null, updated_at=now() where id=_id;
  else update pickup_requests set updated_at=now() where id=_id; end if;
  perform public._att_event(r.school_id, 'pickup', _id, 'delegate_change', jsonb_build_object('mode', r.delegate_mode, 'name', r.pickup_name, 'status', r.status), jsonb_build_object('mode', _mode), null);
end $$;

create or replace function public.decide_delegate(_id uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or not public.att_approver(r.school_id) then raise exception 'اعتماد التفويض للمخولين فقط'; end if;
  if r.delegate_mode <> 'one_time' or r.delegate_status <> 'pending' then raise exception 'لا يوجد تفويض بانتظار القرار'; end if;
  if r.status in ('handed_over','cancelled','rejected') then raise exception 'الطلب مغلق'; end if;
  if not _approve and coalesce(trim(_note),'')='' then raise exception 'سبب رفض التفويض مطلوب'; end if;
  update pickup_requests set delegate_status=case when _approve then 'approved' else 'rejected' end, delegate_decided_by=auth.uid(), delegate_decided_at=now(), delegate_note=_note, updated_at=now() where id=_id;
  perform public._att_event(r.school_id, 'pickup', _id, case when _approve then 'delegate_approve' else 'delegate_reject' end, null, null, _note);
  perform public._notify(r.requested_by, r.school_id, 'pickup', case when _approve then 'اعتُمد التفويض' else 'رُفض التفويض' end, r.pickup_name || coalesce(' — ' || _note, ''), '/app/pickup', 'pickup-deldec:' || _id || ':' || extract(epoch from now())::bigint);
end $$;

create or replace function public.pickup_delegate_detail(_id uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('mode', r.delegate_mode, 'name', r.pickup_name, 'relationship', r.delegate_relationship, 'phone', r.delegate_phone, 'id_last4', r.delegate_id_last4,
    'status', r.delegate_status, 'note', r.delegate_note, 'valid_until', r.delegate_valid_until, 'used_at', r.delegate_used_at, 'ack_at', r.delegate_ack_at)
  from pickup_requests r where r.id=_id and (r.requested_by=auth.uid() or public.att_approver(r.school_id)) $$;

create or replace function public.delegate_reviews(_school uuid) returns table(id uuid, student_name text, section text, kind text, status text, guardian_name text, pickup_name text, relationship text, phone text, id_last4 text, valid_until timestamptz, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select r.id, s.full_name, public._att_section(s.id), r.kind, r.status, g.full_name, r.pickup_name, r.delegate_relationship, r.delegate_phone, r.delegate_id_last4, r.delegate_valid_until, r.created_at
  from pickup_requests r join students s on s.id=r.student_id join guardians g on g.id=r.guardian_id
  where r.school_id=_school and public.att_approver(_school) and r.delegate_mode='one_time' and r.delegate_status='pending' and r.status not in ('handed_over','cancelled','rejected')
  order by r.created_at $$;

drop function if exists public.pickup_arrived(uuid);
create or replace function public.pickup_arrived(_id uuid, _id_last4 text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare r pickup_requests; p attendance_policies;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or not public.att_gate(r.school_id) then raise exception 'غير مصرح'; end if;
  if r.status <> 'approved' then raise exception 'لا يبدأ التجهيز قبل اعتماد الطلب (الحالة الحالية: %)', r.status; end if;
  if r.delegate_mode='authorized' and not exists(select 1 from authorized_pickups where id=r.pickup_person_id and active) then raise exception 'المستلم لم يعد مفوضًا'; end if;
  if r.delegate_mode='one_time' then
    if r.delegate_status is distinct from 'approved' then raise exception 'تفويض المستلم لم يُعتمد بعد'; end if;
    if r.delegate_used_at is not null then raise exception 'استُخدم هذا التفويض مسبقًا'; end if;
    if r.delegate_valid_until < now() then raise exception 'انتهت صلاحية التفويض'; end if;
    if coalesce(trim(_id_last4),'') <> r.delegate_id_last4 then
      perform public._att_event(r.school_id, 'pickup', _id, 'delegate_mismatch', null, null, 'بيانات المستلم غير مطابقة');
      return jsonb_build_object('ok', false, 'message', 'المستلم غير مطابق لبيانات التفويض — لا تسلّم الطالب');
    end if;
  end if;
  p := public._att_default_policy(r.school_id);
  update pickup_requests set status='arrived', arrived_at=now(), arrived_by=auth.uid(), updated_at=now() where id=_id;
  insert into call_queue(school_id, pickup_id, announce)
  select r.school_id, _id, 'الطالب ' || s.full_name || '، ' || public._att_announce_section(s.id) || '، يتوجه إلى ' || p.call_point from students s where s.id=r.student_id
  on conflict (pickup_id) do update set status='queued', last_error=null;
  perform public._notify(t.user_id, r.school_id, 'pickup', 'تجهيز طالب للاستلام', s.full_name || ' — ' || public._att_section(s.id), '/app/attendance', 'pickup-prep:' || _id)
    from students s, enrollments e join courses co on co.section_id=e.section_id and co.year_id=e.year_id
    join teacher_assignments a on a.course_id=co.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date) join teachers t on t.id=a.teacher_id
    where s.id=r.student_id and e.student_id=s.id and e.status='active' and t.user_id is not null;
  perform public._att_event(r.school_id, 'pickup', _id, 'arrived', null, jsonb_build_object('verified', r.delegate_mode='one_time'), null);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.pickup_arrived(uuid,text) from public, anon;

do $$ declare src text; begin
  select pg_get_functiondef('public.handover_pickup(uuid)'::regprocedure) into src;
  src := replace(src, $q$handed_by=auth.uid(), updated_at=now() where id=_id;$q$, $q$handed_by=auth.uid(), updated_at=now(), delegate_used_at=case when delegate_mode='one_time' then now() end where id=_id;$q$);
  src := replace(src, $q$if r.status <> 'ready' then$q$, $q$if r.delegate_mode='one_time' and (r.delegate_used_at is not null or r.delegate_status is distinct from 'approved') then raise exception 'التفويض غير صالح للتسليم'; end if;
  if r.status <> 'ready' then$q$);
  execute src;
end $$;

drop function if exists public.pickup_queue(uuid);
create function public.pickup_queue(_school uuid) returns table(id uuid, student_id uuid, student_name text, section text, kind text, status text, pickup_name text, pickup_national_id text, planned_at timestamptz, created_at timestamptz, delegate_mode text, delegate_status text, relationship text, phone_hint text)
language sql stable security definer set search_path=public as $$
  select r.id, r.student_id, s.full_name, public._att_section(s.id), r.kind, r.status, r.pickup_name, ap.national_id, r.planned_at, r.created_at,
    r.delegate_mode, r.delegate_status, coalesce(r.delegate_relationship, ap.relationship),
    case when public.att_gate(_school) and r.delegate_phone is not null then '••••' || right(r.delegate_phone, 3) end
  from pickup_requests r join students s on s.id=r.student_id left join authorized_pickups ap on ap.id=r.pickup_person_id
  where r.school_id=_school and r.req_date=public.school_today() and r.status in ('approved','arrived','preparing','ready')
    and (public.att_gate(_school) or public.is_teacher_of_student(r.student_id))
  order by r.created_at $$;
revoke execute on function public.pickup_queue(uuid) from public, anon;

-- ---------- permission attachments ----------
alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup']));
do $$ declare src text; begin
  src := pg_get_functiondef('public.can_read_file'::regproc);
  src := replace(src, $q$(f.uploaded_by=auth.uid() and f.source_type in ('post',$q$, $q$(f.source_type='pickup' and exists(select 1 from pickup_requests r where r.id=f.source_id and (r.requested_by=auth.uid() or att_approver(r.school_id))))
    or (f.uploaded_by=auth.uid() and f.source_type in ('pickup','post',$q$);
  execute src;
  execute replace(pg_get_functiondef('public.run_file_cleanup'::regproc), $q$in ('post','circular','homework','submission','feedback')$q$, $q$in ('post','circular','homework','submission','feedback','pickup')$q$);
end $$;
create or replace function public.create_pickup_file(_pickup uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare r pickup_requests; pol record; fid uuid := gen_random_uuid(); p text; begin
  select * into r from pickup_requests where pickup_requests.id=_pickup;
  if r.id is null or r.requested_by <> auth.uid() then raise exception 'غير مصرح'; end if;
  if r.kind <> 'permission' or r.status not in ('submitted','under_review') then raise exception 'يُرفق الملف قبل البت في الاستئذان فقط'; end if;
  if (select count(*) from files f where f.source_type='pickup' and f.source_id=_pickup) >= 3 then raise exception 'الحد الأقصى 3 مرفقات'; end if;
  select * into pol from _file_policy(r.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := r.school_id || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category) values (fid, r.school_id, p, left(_name,200), _mime, _size, 'pickup', _pickup, 'pickup');
  perform public._att_event(r.school_id, 'pickup', _pickup, 'attach', null, jsonb_build_object('file', fid), null);
  return query select fid, p;
end $$;
revoke execute on function public.create_pickup_file(uuid,text,text,bigint) from public, anon;

-- ---------- branch comparison (org owner) ----------
create or replace function public.attendance_compare(_org uuid, _from date, _to date) returns table(school_id uuid, school_name text, records bigint, present bigint, late bigint, absent bigint, excused bigint, pending bigint, early_out bigint, attendance_rate numeric)
language sql stable security definer set search_path=public as $$
  select sc.id, sc.name, count(a.id), count(*) filter (where a.status='present'), count(*) filter (where a.status='late'), count(*) filter (where a.status='absent'),
    count(*) filter (where a.status='excused'), count(*) filter (where a.status='pending_review'),
    (select count(distinct (m.student_id, m.date)) from gate_movements m where m.school_id=sc.id and m.date between _from and _to and m.kind='out'),
    case when count(a.id) filter (where a.status <> 'pending_review') = 0 then null
      else round(100.0 * count(*) filter (where a.status in ('present','late')) / count(a.id) filter (where a.status <> 'pending_review'), 1) end
  from schools sc left join attendance_days a on a.school_id=sc.id and a.date between _from and _to
  where sc.org_id=_org and public.is_org_owner(_org) and _to >= _from and _to - _from <= 366
  group by sc.id, sc.name order by sc.name $$;
revoke execute on function public.attendance_compare(uuid,date,date) from public, anon;
revoke execute on function public.submit_pickup_request(uuid,text,text,timestamptz,text,uuid,jsonb), public.update_pickup_delegate(uuid,text,uuid,jsonb), public.decide_delegate(uuid,boolean,text), public.pickup_delegate_detail(uuid), public.delegate_reviews(uuid) from public, anon;