-- lock new duty RPCs away from signed-out callers
do $$ declare f text; begin
  foreach f in array array['adm_duty_save_settings(uuid,int,int)','adm_duty_save_post(uuid,uuid,jsonb)','adm_duty_set_exempt(uuid,uuid,text,date,boolean)','adm_duty_roster_open(uuid,date)',
    'adm_duty_suggest(uuid,int)','adm_duty_assign(uuid,uuid,date,uuid,uuid)','adm_duty_remove(uuid,text)','adm_duty_substitute(uuid,uuid,text,uuid)','adm_duty_coverage(uuid)','adm_duty_preview(uuid)',
    'adm_duty_publish(uuid,int)','adm_duty_ack(uuid)','adm_duty_exec(uuid,text,text,int)','adm_duty_request_change(uuid,text,text)','adm_duty_decide_change(uuid,boolean,text)',
    'adm_duty_list(uuid,text,text,date,date,text,uuid,int,int)','adm_duty_load(uuid,date,date)','adm_duty_change_list(uuid,text)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;
revoke execute on function public._duty_study_days(uuid) from public, anon, authenticated;

create table public.adm_meetings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  title text not null check (length(btrim(title)) between 2 and 200),
  purpose text,
  organizer uuid not null default auth.uid(),
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 5 and 600),
  location text,
  link text check (link is null or link ~* '^https?://'),
  agenda text,
  privacy text not null default 'normal' check (privacy in ('normal','restricted')),
  needs_rsvp boolean not null default true,
  status text not null default 'draft' check (status in ('draft','scheduled','cancelled','held')),
  minutes_writer uuid,
  cancel_reason text,
  rev int not null default 1,
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index adm_meet_client on public.adm_meetings(organizer, client_id) where client_id is not null;
create index on public.adm_meetings(school_id, starts_at);
grant select on public.adm_meetings to authenticated; grant all on public.adm_meetings to service_role;
alter table public.adm_meetings enable row level security;

create table public.adm_meeting_members (
  meeting_id uuid not null references public.adm_meetings(id) on delete cascade,
  user_id uuid not null,
  rsvp text not null default 'pending' check (rsvp in ('pending','accepted','declined')),
  rsvp_note text,
  rsvp_at timestamptz,
  attended boolean,
  attendance_note text,
  marked_by uuid,
  marked_at timestamptz,
  primary key (meeting_id, user_id)
);
create index on public.adm_meeting_members(user_id);
grant select on public.adm_meeting_members to authenticated; grant all on public.adm_meeting_members to service_role;
alter table public.adm_meeting_members enable row level security;

create table public.adm_minutes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  meeting_id uuid not null references public.adm_meetings(id) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft','confirmed')),
  topics jsonb not null default '[]',
  present uuid[] not null default '{}',
  absent uuid[] not null default '{}',
  notes text,
  change_note text,
  based_on uuid references public.adm_minutes(id),
  written_by uuid default auth.uid(),
  saved_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  rev int not null default 1,
  created_at timestamptz not null default now(),
  unique (meeting_id, version)
);
create unique index adm_minutes_one_draft on public.adm_minutes(meeting_id) where status = 'draft';
grant select on public.adm_minutes to authenticated; grant all on public.adm_minutes to service_role;
alter table public.adm_minutes enable row level security;

create table public.adm_decisions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  meeting_id uuid not null references public.adm_meetings(id) on delete cascade,
  minutes_id uuid references public.adm_minutes(id) on delete set null,
  body text not null check (length(btrim(body)) between 2 and 1000),
  assignee uuid not null,
  due_date date not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  task_id uuid not null references public.adm_tasks(id),
  created_by uuid not null default auth.uid(),
  client_id uuid,
  created_at timestamptz not null default now()
);
create unique index adm_dec_client on public.adm_decisions(created_by, client_id) where client_id is not null;
grant select on public.adm_decisions to authenticated; grant all on public.adm_decisions to service_role;
alter table public.adm_decisions enable row level security;

create or replace function public.adm_can_read_meeting(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from adm_meetings m where m.id=_id and (
    m.organizer=auth.uid() or m.minutes_writer=auth.uid()
    or (m.status <> 'draft' and (exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid())
      or (m.privacy='normal' and (_adm_lead(m.school_id) or _adm_dept(m.school_id, m.department_id)))))))
$$;
create or replace function public.adm_can_read_minutes(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from adm_minutes x join adm_meetings m on m.id=x.meeting_id where x.id=_id and adm_can_read_meeting(m.id)
    and (x.status='confirmed' or m.organizer=auth.uid() or m.minutes_writer=auth.uid()))
$$;
create or replace function public.adm_can_read_decision(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from adm_decisions d where d.id=_id and (d.assignee=auth.uid() or adm_can_read_meeting(d.meeting_id)))
$$;
create policy adm_meet_read on public.adm_meetings for select to authenticated using (adm_can_read_meeting(id));
create policy adm_meet_mem_read on public.adm_meeting_members for select to authenticated using (adm_can_read_meeting(meeting_id));
create policy adm_minutes_read on public.adm_minutes for select to authenticated using (adm_can_read_minutes(id));
create policy adm_dec_read on public.adm_decisions for select to authenticated using (adm_can_read_decision(id));

create or replace function public._adm_can_read(_entity text, _id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case _entity when 'task' then adm_can_read_task(_id) when 'request' then adm_can_read_request(_id)
    when 'form' then exists(select 1 from adm_forms f where f.id=_id and _adm_lead(f.school_id))
    when 'duty' then exists(select 1 from adm_duty_rosters r where r.id=_id and _adm_lead(r.school_id))
      or exists(select 1 from adm_duty_assignments a join adm_duty_rosters r on r.id=a.roster_id where a.id=_id and (_adm_lead(a.school_id) or (a.user_id=auth.uid() and r.status='published')))
    when 'meeting' then adm_can_read_meeting(_id)
    when 'minutes' then adm_can_read_minutes(_id)
    when 'decision' then adm_can_read_decision(_id)
    else false end
$$;

create or replace function public.adm_party_names(_entity text, _id uuid) returns table(user_id uuid, full_name text) language sql stable security definer set search_path=public as $$
  with ids as (
    select unnest(array[t.assignee, t.assigner] || coalesce(t.participants,'{}')) u from adm_tasks t where _entity='task' and t.id=_id
    union select unnest(array[r.submitted_by, r.handler_user]) from adm_requests r where _entity='request' and r.id=_id
    union select unnest(array[m.organizer, m.minutes_writer]) from adm_meetings m where _entity='meeting' and m.id=_id
    union select x.user_id from adm_meeting_members x where _entity='meeting' and x.meeting_id=_id
    union select d.assignee from adm_decisions d where _entity='meeting' and d.meeting_id=_id
    union select e.actor from adm_events e where e.entity=_entity and e.entity_id=_id
    union select f.uploaded_by from files f where f.source_type='admin' and f.source_id=_id
  )
  select i.u, p.full_name from ids i join profiles p on p.id=i.u
  where i.u is not null and _entity in ('task','request','meeting') and _adm_can_read(_entity, _id)
$$;

create or replace function public.create_admin_file(_entity text, _id uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare sch uuid; ok boolean := false; pol record; fid uuid := gen_random_uuid(); p text; begin
  if _entity='task' then
    select t.school_id, (t.status not in ('cancelled') and (t.assignee=auth.uid() or t.assigner=auth.uid() or _adm_lead(t.school_id))) into sch, ok from adm_tasks t where t.id=_id;
  elsif _entity='request' then
    select r.school_id, ((r.submitted_by=auth.uid() and r.status in ('draft','returned')) or (r.handler_user=auth.uid() and r.status in ('submitted','in_progress'))) into sch, ok from adm_requests r where r.id=_id;
    if ok and not exists(select 1 from adm_requests r join adm_forms f on f.id=r.form_id where r.id=_id and (f.allow_files or exists(select 1 from jsonb_array_elements(r.fields) x where x->>'type'='file'))) then ok := false; end if;
  elsif _entity='meeting' then
    select m.school_id, (m.status <> 'cancelled' and (m.organizer=auth.uid() or m.minutes_writer=auth.uid())) into sch, ok from adm_meetings m where m.id=_id;
  elsif _entity='duty' then
    select a.school_id, (a.status='assigned' and r.status='published' and (a.user_id=auth.uid() or _adm_lead(a.school_id))) into sch, ok from adm_duty_assignments a join adm_duty_rosters r on r.id=a.roster_id where a.id=_id;
  else raise exception 'نوع غير مدعوم'; end if;
  if not coalesce(ok,false) then raise exception 'غير مصرح بإرفاق ملف هنا'; end if;
  select * into pol from _file_policy(sch);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := sch || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by) values (fid, sch, p, left(_name,200), _mime, _size, 'admin', _id, _entity, auth.uid());
  perform _adm_log(sch, _entity, _id, 'file_added', jsonb_build_object('name', left(_name,200)));
  return query select fid, p;
end $$;

create or replace function public.remove_admin_file(_file uuid) returns void language plpgsql security definer set search_path=public as $$
declare f files; begin
  select * into f from files where files.id=_file for update;
  if f.id is null or f.source_type<>'admin' or f.uploaded_by<>auth.uid() then raise exception 'يحذف الملف من رفعه فقط'; end if;
  if f.category='request' and exists(select 1 from adm_requests r where r.id=f.source_id and r.status not in ('draft','returned')) then raise exception 'لا تُحذف مرفقات طلب مقدم'; end if;
  if f.category='task' and exists(select 1 from adm_tasks t where t.id=f.source_id and t.status in ('done','awaiting_confirmation')) then raise exception 'لا تُحذف مرفقات تكليف منجز'; end if;
  if f.category='meeting' and exists(select 1 from adm_minutes x where x.meeting_id=f.source_id and x.status='confirmed') then raise exception 'لا تُحذف مرفقات اجتماع ثُبّت محضره'; end if;
  if f.category='duty' and exists(select 1 from adm_duty_assignments a where a.id=f.source_id and a.exec_status<>'pending') then raise exception 'لا تُحذف مرفقات مناوبة وُثّق تنفيذها'; end if;
  update files set source_type='cleanup_due' where id=_file;
  perform _adm_log(f.school_id, f.category, f.source_id, 'file_removed', jsonb_build_object('name', f.name));
end $$;

-- Conflicts for a person at a local time window: classes, substitute periods, duties, other meetings. Internal only.
create or replace function public._meet_busy(_school uuid, _user uuid, _date date, _s time, _e time, _meeting uuid) returns text
language plpgsql stable security definer set search_path=public as $$
declare r text; tt uuid; dw int := extract(dow from _date)::int; begin
  tt := current_timetable(_school, _date);
  if tt is not null then
    select 'حصة: ' || p.name into r from timetable_slots sl join teachers t on t.id=sl.teacher_id join periods p on p.id=sl.period_id
      where sl.timetable_id=tt and t.user_id=_user and sl.day=dw and p.start_time < _e and p.end_time > _s
        and not exists(select 1 from substitutions sb where sb.slot_id=sl.id and sb.date=_date and sb.status='active') limit 1;
    if r is not null then return r; end if;
  end if;
  select 'حصة انتظار: ' || p.name into r from substitutions sb join teachers t on t.id=sb.substitute_teacher_id join timetable_slots sl on sl.id=sb.slot_id join periods p on p.id=sl.period_id
    where sb.school_id=_school and sb.date=_date and sb.status='active' and t.user_id=_user and p.start_time < _e and p.end_time > _s limit 1;
  if r is not null then return r; end if;
  select 'مناوبة: ' || po.name into r from adm_duty_assignments a join adm_duty_posts po on po.id=a.post_id join adm_duty_rosters ro on ro.id=a.roster_id
    where a.school_id=_school and a.user_id=_user and a.date=_date and a.status='assigned' and ro.status='published' and a.start_time < _e and a.end_time > _s limit 1;
  if r is not null then return r; end if;
  select 'اجتماع آخر في الوقت نفسه' into r from adm_meetings m
    where m.school_id=_school and m.id <> _meeting and m.status='scheduled'
      and (m.organizer=_user or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=_user and x.rsvp <> 'declined'))
      and (m.starts_at at time zone 'Asia/Riyadh')::date=_date
      and (m.starts_at at time zone 'Asia/Riyadh')::time < _e and ((m.starts_at + make_interval(mins => m.duration_min)) at time zone 'Asia/Riyadh')::time > _s limit 1;
  return r;
end $$;
revoke execute on function public._meet_busy(uuid, uuid, date, time, time, uuid) from public, anon, authenticated;

create or replace function public.adm_meeting_conflicts(_id uuid) returns table(user_id uuid, full_name text, reason text) language sql stable security definer set search_path=public as $$
  with m as (select *, (starts_at at time zone 'Asia/Riyadh') ls, ((starts_at + make_interval(mins => duration_min)) at time zone 'Asia/Riyadh') le from adm_meetings where id=_id),
  ppl as (select x.user_id u from adm_meeting_members x where x.meeting_id=_id union select organizer from m)
  select p.u, _adm_name(p.u), _meet_busy(m.school_id, p.u, m.ls::date, m.ls::time, m.le::time, m.id)
  from ppl p cross join m
  where adm_can_read_meeting(_id) and _meet_busy(m.school_id, p.u, m.ls::date, m.ls::time, m.le::time, m.id) is not null
$$;

create or replace function public.adm_meeting_save(_id uuid, _school uuid, _d jsonb, _rev int, _client uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m adm_meetings; mem uuid[]; old uuid[]; nid uuid; p uuid; ts timestamptz; dur int; wr uuid; dep uuid; moved boolean := false; nr int; begin
  if _id is null then
    if _client is not null then select * into m from adm_meetings where organizer=auth.uid() and client_id=_client; if m.id is not null then return jsonb_build_object('id', m.id, 'rev', m.rev); end if; end if;
    if _school is null or not has_school_role(_school, array['principal','vice_principal','dept_head']::app_role[]) then raise exception 'تنظيم الاجتماعات لمدير المدرسة والوكيل ورؤساء الأقسام'; end if;
  else
    select * into m from adm_meetings where id=_id for update;
    if m.id is null or m.organizer <> auth.uid() then raise exception 'تعديل الاجتماع لمنظمه فقط'; end if;
    if m.status in ('cancelled','held') then raise exception 'لا يُعدّل اجتماع ملغى أو منعقد'; end if;
    if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
    _school := m.school_id;
  end if;
  if coalesce(btrim(_d->>'title'),'') = '' then raise exception 'اكتب عنوان الاجتماع'; end if;
  ts := (_d->>'starts_at')::timestamptz; if ts is null then raise exception 'حدد موعد الاجتماع'; end if;
  dur := coalesce((_d->>'duration_min')::int, 60);
  if coalesce(_d->>'privacy','normal') not in ('normal','restricted') then raise exception 'مستوى خصوصية غير صالح'; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into mem from jsonb_array_elements_text(coalesce(_d->'members','[]')) x where x::uuid <> auth.uid();
  foreach p in array mem loop if not _adm_staff(_school, p) then raise exception 'مشارك من خارج المدرسة'; end if; end loop;
  wr := nullif(_d->>'minutes_writer','')::uuid;
  if wr is not null and wr <> auth.uid() and not (wr = any(mem)) then raise exception 'كاتب المحضر يجب أن يكون من المشاركين'; end if;
  dep := nullif(_d->>'department_id','')::uuid;
  if dep is not null and not exists(select 1 from departments where id=dep and school_id=_school) then raise exception 'قسم غير صالح'; end if;
  if _id is null then
    insert into adm_meetings(school_id, department_id, title, purpose, starts_at, duration_min, location, link, agenda, privacy, needs_rsvp, minutes_writer, client_id)
    values (_school, dep, btrim(_d->>'title'), nullif(btrim(_d->>'purpose'),''), ts, dur, nullif(btrim(_d->>'location'),''), nullif(btrim(_d->>'link'),''), nullif(btrim(_d->>'agenda'),''),
      coalesce(_d->>'privacy','normal'), coalesce((_d->>'needs_rsvp')::boolean, true), wr, _client) returning id into nid;
    perform _adm_log(_school, 'meeting', nid, 'created', '{}');
    nr := 1;
  else
    nid := _id;
    moved := m.starts_at <> ts or m.duration_min <> dur or coalesce(m.location,'') <> coalesce(nullif(btrim(_d->>'location'),''),'');
    update adm_meetings set department_id=dep, title=btrim(_d->>'title'), purpose=nullif(btrim(_d->>'purpose'),''), starts_at=ts, duration_min=dur, location=nullif(btrim(_d->>'location'),''),
      link=nullif(btrim(_d->>'link'),''), agenda=nullif(btrim(_d->>'agenda'),''), privacy=coalesce(_d->>'privacy','normal'), needs_rsvp=coalesce((_d->>'needs_rsvp')::boolean, true),
      minutes_writer=wr, rev=rev + 1, updated_at=now() where id=_id;
    nr := m.rev + 1;
    perform _adm_log(_school, 'meeting', nid, 'updated', case when moved then jsonb_build_object('note', 'الموعد السابق ' || to_char(m.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (' || m.duration_min || ' دقيقة)' || coalesce(' — ' || m.location, '')) else '{}' end);
  end if;
  select coalesce(array_agg(user_id), '{}') into old from adm_meeting_members where meeting_id=nid;
  delete from adm_meeting_members where meeting_id=nid and not (user_id = any(mem));
  insert into adm_meeting_members(meeting_id, user_id) select nid, u from unnest(mem) u on conflict do nothing;
  if m.id is not null and m.status = 'scheduled' then
    foreach p in array mem loop
      if not (p = any(old)) then perform _notify(p, _school, 'admin', 'دعوة لاجتماع: ' || btrim(_d->>'title'), to_char(ts at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), '/app/admin/meetings/' || nid, 'adm:meet:' || nid || ':inv:' || p);
      elsif moved then
        update adm_meeting_members set rsvp=case when rsvp='accepted' then 'pending' else rsvp end where meeting_id=nid and user_id=p;
        perform _notify(p, _school, 'admin', 'تغيّر موعد اجتماع: ' || btrim(_d->>'title'), to_char(ts at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), '/app/admin/meetings/' || nid, 'adm:meet:' || nid || ':mv' || nr || ':' || p);
      end if;
    end loop;
    foreach p in array old loop
      if not (p = any(mem)) then perform _notify(p, _school, 'admin', 'أُزلت من دعوة اجتماع', case when m.privacy='restricted' then '' else m.title end, '/app/admin/meetings', 'adm:meet:' || nid || ':rm' || nr || ':' || p); end if;
    end loop;
  end if;
  return jsonb_build_object('id', nid, 'rev', nr);
end $$;

create or replace function public.adm_meeting_send(_id uuid, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare m adm_meetings; p uuid; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'إرسال الدعوة لمنظم الاجتماع فقط'; end if;
  if m.status = 'scheduled' and m.rev = coalesce(_rev,-1) + 1 then return m.rev; end if;
  if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
  if m.status <> 'draft' then raise exception 'أُرسلت الدعوة مسبقًا'; end if;
  if not exists(select 1 from adm_meeting_members where meeting_id=_id) then raise exception 'أضف مشاركًا واحدًا على الأقل'; end if;
  update adm_meetings set status='scheduled', rev=rev + 1, updated_at=now() where id=_id;
  for p in select user_id from adm_meeting_members where meeting_id=_id loop
    perform _notify(p, m.school_id, 'admin', 'دعوة لاجتماع: ' || m.title, to_char(m.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':inv:' || p);
  end loop;
  perform _adm_log(m.school_id, 'meeting', _id, 'invited', '{}');
  return m.rev + 1;
end $$;

create or replace function public.adm_meeting_cancel(_id uuid, _reason text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare m adm_meetings; p uuid; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'إلغاء الاجتماع لمنظمه فقط'; end if;
  if m.status = 'cancelled' then return m.rev; end if;
  if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
  if m.status = 'held' then raise exception 'لا يُلغى اجتماع منعقد'; end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'اكتب سبب الإلغاء'; end if;
  update adm_meetings set status='cancelled', cancel_reason=btrim(_reason), rev=rev + 1, updated_at=now() where id=_id;
  if m.status = 'scheduled' then
    for p in select user_id from adm_meeting_members where meeting_id=_id loop
      perform _notify(p, m.school_id, 'admin', 'أُلغي اجتماع: ' || m.title, btrim(_reason), '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':cancel:' || p);
    end loop;
  end if;
  perform _adm_log(m.school_id, 'meeting', _id, 'cancelled', jsonb_build_object('reason', btrim(_reason)));
  return m.rev + 1;
end $$;

create or replace function public.adm_meeting_rsvp(_id uuid, _rsvp text, _note text) returns void language plpgsql security definer set search_path=public as $$
declare m adm_meetings; x adm_meeting_members; begin
  select * into m from adm_meetings where id=_id;
  select * into x from adm_meeting_members where meeting_id=_id and user_id=auth.uid() for update;
  if m.id is null or x.user_id is null then raise exception 'الرد على الدعوة للمدعوين فقط'; end if;
  if m.status <> 'scheduled' then raise exception 'الاجتماع غير متاح للرد'; end if;
  if _rsvp not in ('accepted','declined') then raise exception 'رد غير صالح'; end if;
  if x.rsvp = _rsvp and coalesce(x.rsvp_note,'') = coalesce(nullif(btrim(_note),''),'') then return; end if;
  update adm_meeting_members set rsvp=_rsvp, rsvp_note=nullif(btrim(_note),''), rsvp_at=now() where meeting_id=_id and user_id=auth.uid();
  perform _adm_log(m.school_id, 'meeting', _id, case when _rsvp='accepted' then 'rsvp_accepted' else 'rsvp_declined' end, jsonb_build_object('note', nullif(btrim(_note),'')));
  if _rsvp = 'declined' then perform _notify(m.organizer, m.school_id, 'admin', 'اعتذار عن اجتماع: ' || m.title, _adm_name(auth.uid()), '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':decl:' || auth.uid() || ':' || md5(coalesce(_note,''))); end if;
end $$;

create or replace function public.adm_meeting_attendance(_id uuid, _marks jsonb) returns void language plpgsql security definer set search_path=public as $$
declare m adm_meetings; e jsonb; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or not (m.organizer=auth.uid() or m.minutes_writer=auth.uid()) then raise exception 'تسجيل الحضور للمنظم أو كاتب المحضر'; end if;
  if m.status not in ('scheduled','held') then raise exception 'الاجتماع غير منعقد'; end if;
  if now() < m.starts_at - interval '15 minutes' then raise exception 'يُسجّل الحضور عند بدء الاجتماع'; end if;
  for e in select * from jsonb_array_elements(coalesce(_marks,'[]')) loop
    update adm_meeting_members set attended=(e->>'attended')::boolean, attendance_note=nullif(btrim(e->>'note'),''), marked_by=auth.uid(), marked_at=now()
      where meeting_id=_id and user_id=(e->>'user_id')::uuid;
    if not found then raise exception 'المسجل ليس من المدعوين'; end if;
  end loop;
  update adm_meetings set status='held', updated_at=now() where id=_id and status='scheduled';
  perform _adm_log(m.school_id, 'meeting', _id, 'attendance', jsonb_build_object('count', jsonb_array_length(coalesce(_marks,'[]'))));
end $$;

create or replace function public.adm_minutes_save(_meeting uuid, _d jsonb, _rev int) returns jsonb language plpgsql security definer set search_path=public as $$
declare m adm_meetings; x adm_minutes; c adm_minutes; allowed uuid[]; pr uuid[]; ab uuid[]; nid uuid; begin
  select * into m from adm_meetings where id=_meeting;
  if m.id is null or not (m.organizer=auth.uid() or m.minutes_writer=auth.uid()) then raise exception 'تحرير المحضر للمنظم أو كاتب المحضر المعيّن'; end if;
  if m.status in ('draft','cancelled') then raise exception 'يُكتب المحضر بعد إرسال الدعوة'; end if;
  if jsonb_typeof(coalesce(_d->'topics','[]')) <> 'array' then raise exception 'صيغة الموضوعات غير صالحة'; end if;
  select array_agg(user_id) || m.organizer into allowed from adm_meeting_members where meeting_id=_meeting;
  select coalesce(array_agg(distinct v::uuid), '{}') into pr from jsonb_array_elements_text(coalesce(_d->'present','[]')) v;
  select coalesce(array_agg(distinct v::uuid), '{}') into ab from jsonb_array_elements_text(coalesce(_d->'absent','[]')) v;
  if not (pr <@ allowed and ab <@ allowed) then raise exception 'الحاضرون والمعتذرون من المدعوين فقط'; end if;
  select * into x from adm_minutes where meeting_id=_meeting and status='draft' for update;
  if x.id is null then
    select * into c from adm_minutes where meeting_id=_meeting and status='confirmed' order by version desc limit 1;
    if c.id is not null and coalesce(btrim(_d->>'change_note'),'') = '' then raise exception 'المحضر مثبت؛ اكتب سبب الإصدار الجديد أو الملحق'; end if;
    insert into adm_minutes(school_id, meeting_id, version, topics, present, absent, notes, change_note, based_on)
      values (m.school_id, _meeting, coalesce(c.version, 0) + 1, coalesce(_d->'topics','[]'), pr, ab, nullif(btrim(_d->>'notes'),''), nullif(btrim(_d->>'change_note'),''), c.id) returning * into x;
    perform _adm_log(m.school_id, 'meeting', _meeting, case when c.id is null then 'minutes_started' else 'minutes_new_version' end, jsonb_build_object('note', 'إصدار ' || x.version || coalesce(' — ' || nullif(btrim(_d->>'change_note'),''), '')));
    return jsonb_build_object('id', x.id, 'rev', x.rev, 'version', x.version);
  end if;
  if x.rev <> coalesce(_rev,-1) then raise exception 'عُدّل المحضر من نافذة أخرى؛ أعد التحميل'; end if;
  update adm_minutes set topics=coalesce(_d->'topics','[]'), present=pr, absent=ab, notes=nullif(btrim(_d->>'notes'),''), change_note=coalesce(nullif(btrim(_d->>'change_note'),''), change_note),
    written_by=auth.uid(), saved_at=now(), rev=rev + 1 where id=x.id;
  return jsonb_build_object('id', x.id, 'rev', x.rev + 1, 'version', x.version);
end $$;

create or replace function public.adm_minutes_confirm(_id uuid, _rev int) returns void language plpgsql security definer set search_path=public as $$
declare x adm_minutes; m adm_meetings; p uuid; begin
  select * into x from adm_minutes where id=_id for update;
  select * into m from adm_meetings where id=x.meeting_id;
  if x.id is null or m.organizer <> auth.uid() then raise exception 'تثبيت المحضر لمنظم الاجتماع فقط'; end if;
  if x.status = 'confirmed' then return; end if;
  if x.rev <> coalesce(_rev,-1) then raise exception 'عُدّل المحضر من نافذة أخرى؛ أعد التحميل'; end if;
  if jsonb_array_length(x.topics) = 0 and coalesce(x.notes,'') = '' then raise exception 'المحضر فارغ'; end if;
  update adm_minutes set status='confirmed', confirmed_by=auth.uid(), confirmed_at=now() where id=_id;
  update adm_meetings set status='held', updated_at=now() where id=m.id and status='scheduled';
  perform _adm_log(m.school_id, 'meeting', m.id, 'minutes_confirmed', jsonb_build_object('note', 'إصدار ' || x.version));
  for p in select user_id from adm_meeting_members where meeting_id=m.id loop
    perform _notify(p, m.school_id, 'admin', 'ثُبّت محضر اجتماع: ' || m.title, 'إصدار ' || x.version, '/app/admin/meetings/' || m.id, 'adm:min:' || x.id || ':' || p);
  end loop;
end $$;

create or replace function public.adm_decision_create(_meeting uuid, _d jsonb, _client uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare m adm_meetings; did uuid; tid uuid; mid uuid; due date; who uuid; body text; begin
  if _client is not null then select id into did from adm_decisions where created_by=auth.uid() and client_id=_client; if did is not null then return did; end if; end if;
  select * into m from adm_meetings where id=_meeting;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'تسجيل القرارات لمنظم الاجتماع فقط'; end if;
  if m.status not in ('scheduled','held') then raise exception 'القرارات لاجتماع منعقد أو مجدول'; end if;
  body := btrim(coalesce(_d->>'body',''));
  if length(body) < 2 then raise exception 'اكتب نص القرار'; end if;
  who := (_d->>'assignee')::uuid;
  if not _adm_staff(m.school_id, who) then raise exception 'مسؤول التنفيذ يجب أن يكون من موظفي المدرسة'; end if;
  due := (_d->>'due_date')::date;
  if due is null or due < school_today() then raise exception 'حدد موعدًا من اليوم فصاعدًا'; end if;
  if coalesce(_d->>'priority','normal') not in ('low','normal','high') then raise exception 'أولوية غير صالحة'; end if;
  select id into mid from adm_minutes where meeting_id=_meeting order by version desc limit 1;
  did := gen_random_uuid();
  insert into adm_tasks(school_id, department_id, title, description, assignee, assigner, due_date, priority, decision_id)
    values (m.school_id, m.department_id, left('قرار: ' || body, 200),
      body || E'\n\nمرجع القرار: ' || case when m.privacy='restricted' then 'اجتماع مقيد' else 'اجتماع «' || m.title || '» بتاريخ ' || to_char(m.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD') end,
      who, auth.uid(), due, coalesce(_d->>'priority','normal'), did) returning id into tid;
  insert into adm_decisions(id, school_id, meeting_id, minutes_id, body, assignee, due_date, priority, task_id, client_id)
    values (did, m.school_id, _meeting, mid, body, who, due, coalesce(_d->>'priority','normal'), tid, _client);
  perform _adm_log(m.school_id, 'meeting', _meeting, 'decision_added', jsonb_build_object('note', left(body, 200) || ' — ' || _adm_name(who)));
  perform _adm_log(m.school_id, 'task', tid, 'created', jsonb_build_object('note', 'من قرار اجتماع'));
  perform _notify(who, m.school_id, 'admin', 'قرار مسند إليك', left(body, 120) || ' — الموعد ' || due, '/app/admin/tasks/' || tid, 'adm:dec:' || did);
  return did;
end $$;

create or replace function public.adm_meeting_list(_school uuid, _scope text, _q text, _status text, _from date, _to date, _limit int, _offset int)
returns table(id uuid, title text, starts_at timestamptz, duration_min int, location text, status text, privacy text, organizer_name text, members bigint, my_rsvp text, am_organizer boolean, total bigint)
language sql stable security definer set search_path=public as $$
  with base as (
    select m.* from adm_meetings m where m.school_id=_school and adm_can_read_meeting(m.id)
      and (_scope is distinct from 'mine' or m.organizer=auth.uid() or m.minutes_writer=auth.uid() or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid()))
      and (_q is null or m.title ilike '%' || _q || '%' or coalesce(m.purpose,'') ilike '%' || _q || '%' or coalesce(m.agenda,'') ilike '%' || _q || '%')
      and (_status is null or (_status='upcoming' and m.status='scheduled' and m.starts_at >= now()) or m.status=_status)
      and (_from is null or (m.starts_at at time zone 'Asia/Riyadh')::date >= _from) and (_to is null or (m.starts_at at time zone 'Asia/Riyadh')::date <= _to)
  )
  select b.id, b.title, b.starts_at, b.duration_min, b.location, b.status, b.privacy, _adm_name(b.organizer),
    (select count(*) from adm_meeting_members x where x.meeting_id=b.id),
    (select x.rsvp from adm_meeting_members x where x.meeting_id=b.id and x.user_id=auth.uid()),
    b.organizer=auth.uid(), count(*) over ()
  from base b order by b.starts_at desc, b.id limit least(coalesce(_limit, 25), 100) offset coalesce(_offset, 0)
$$;

create or replace function public.adm_decision_list(_school uuid, _scope text, _meeting uuid, _q text, _status text, _limit int, _offset int)
returns table(id uuid, body text, assignee_name text, due_date date, priority text, status text, task_id uuid, meeting_id uuid, meeting_title text, can_open_meeting boolean, overdue boolean, created_at timestamptz, total bigint)
language sql stable security definer set search_path=public as $$
  with base as (
    select d.*, t.status ts, mt.title mtitle, mt.privacy mp, adm_can_read_meeting(mt.id) cr from adm_decisions d join adm_tasks t on t.id=d.task_id join adm_meetings mt on mt.id=d.meeting_id
    where d.school_id=_school and (d.assignee=auth.uid() or adm_can_read_meeting(d.meeting_id))
      and (_scope is distinct from 'mine' or d.assignee=auth.uid())
      and (_meeting is null or d.meeting_id=_meeting)
      and (_q is null or d.body ilike '%' || _q || '%')
      and (_status is null or t.status=_status or (_status='open' and t.status in ('new','in_progress','returned','awaiting_confirmation'))
        or (_status='overdue' and t.status in ('new','in_progress','returned') and t.due_date < school_today()))
  )
  select b.id, b.body, _adm_name(b.assignee), b.due_date, b.priority, b.ts, b.task_id, b.meeting_id,
    case when b.cr or b.mp='normal' then b.mtitle else 'اجتماع مقيد' end, b.cr,
    b.ts in ('new','in_progress','returned') and b.due_date < school_today(), b.created_at, count(*) over ()
  from base b order by b.due_date, b.created_at, b.id limit least(coalesce(_limit, 25), 100) offset coalesce(_offset, 0)
$$;

-- Personal calendar: only the caller's own items.
create or replace function public.adm_calendar(_school uuid, _from date, _to date)
returns table(kind text, id uuid, title text, day date, start_time time, end_time time, status text, link text)
language sql stable security definer set search_path=public as $$
  select * from (
    select case when t.decision_id is not null then 'decision' else 'task' end, t.id, t.title, t.due_date, null::time, null::time, t.status, '/app/admin/tasks/' || t.id
    from adm_tasks t where t.school_id=_school and t.due_date between _from and _to and t.status <> 'cancelled'
      and (t.assignee=auth.uid() or t.assigner=auth.uid() or auth.uid() = any(t.participants))
    union all
    select 'duty', a.id, po.name, a.date, a.start_time, a.end_time, a.exec_status, '/app/admin/duties'
    from adm_duty_assignments a join adm_duty_posts po on po.id=a.post_id join adm_duty_rosters r on r.id=a.roster_id
    where a.school_id=_school and a.user_id=auth.uid() and a.status='assigned' and r.status='published' and a.date between _from and _to
    union all
    select 'meeting', m.id, m.title, (m.starts_at at time zone 'Asia/Riyadh')::date, (m.starts_at at time zone 'Asia/Riyadh')::time,
      ((m.starts_at + make_interval(mins => m.duration_min)) at time zone 'Asia/Riyadh')::time, m.status, '/app/admin/meetings/' || m.id
    from adm_meetings m where m.school_id=_school and m.status in ('scheduled','held') and (m.starts_at at time zone 'Asia/Riyadh')::date between _from and _to
      and (m.organizer=auth.uid() or m.minutes_writer=auth.uid() or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and x.rsvp <> 'declined'))
  ) z where _to - _from <= 62 order by 4, 5 nulls first, 3
$$;

-- Evening-before reminders; restricted meetings never put their title in the notification.
create or replace function public.adm_daily_reminders() returns jsonb language plpgsql security definer set search_path=public as $$
declare tmr date := school_today() + 1; n int := 0; r record; begin
  for r in select t.* from adm_tasks t where t.due_date=tmr and t.status in ('new','in_progress','returned') loop
    perform _notify(r.assignee, r.school_id, 'admin', 'تذكير: تكليف مستحق غدًا', r.title, '/app/admin/tasks/' || r.id, 'adm:rem:task:' || r.id || ':' || tmr); n := n + 1;
  end loop;
  for r in select a.*, po.name pn from adm_duty_assignments a join adm_duty_posts po on po.id=a.post_id join adm_duty_rosters ro on ro.id=a.roster_id
      where a.date=tmr and a.status='assigned' and ro.status='published' loop
    perform _notify(r.user_id, r.school_id, 'admin', 'تذكير: لديك مناوبة غدًا', r.pn || ' — ' || to_char(r.start_time, 'HH24:MI'), '/app/admin/duties', 'adm:rem:duty:' || r.id); n := n + 1;
  end loop;
  for r in select m.*, u.u uid from adm_meetings m cross join lateral (select x.user_id u from adm_meeting_members x where x.meeting_id=m.id and x.rsvp <> 'declined' union select m.organizer) u
      where m.status='scheduled' and (m.starts_at at time zone 'Asia/Riyadh')::date=tmr loop
    perform _notify(r.uid, r.school_id, 'admin', 'تذكير: اجتماع غدًا', case when r.privacy='restricted' then to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') else r.title || ' — ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') end,
      '/app/admin/meetings/' || r.id, 'adm:rem:meet:' || r.id || ':' || r.uid || ':' || tmr); n := n + 1;
  end loop;
  return jsonb_build_object('sent', n, 'for', tmr);
end $$;
revoke execute on function public.adm_daily_reminders() from public, anon, authenticated;
select cron.schedule('rikaz-admin-reminders', '0 15 * * *', 'select public.adm_daily_reminders()');

create or replace function public._duty_gaps(_school uuid, _from date, _to date) returns bigint language sql stable security definer set search_path=public as $$
  select coalesce(sum(greatest(po.required - (select count(*) from adm_duty_assignments a join adm_duty_rosters r on r.id=a.roster_id
      where a.post_id=po.id and a.date=g::date and a.status='assigned' and r.status='published'), 0)), 0)::bigint
  from generate_series(_from::timestamp, _to::timestamp, interval '1 day') g join adm_duty_posts po on po.school_id=_school and po.active and extract(dow from g)::int = any(po.days)
  where extract(dow from g)::int = any(_duty_study_days(_school))
$$;
revoke execute on function public._duty_gaps(uuid, date, date) from public, anon, authenticated;

create or replace function public.adm_summary(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'tasks_today', (select count(*) from adm_tasks t where t.school_id=_school and adm_can_read_task(t.id) and t.status in ('new','in_progress','returned') and t.due_date=school_today()),
    'tasks_overdue', (select count(*) from adm_tasks t where t.school_id=_school and adm_can_read_task(t.id) and t.status in ('new','in_progress','returned') and t.due_date<school_today()),
    'tasks_needs_action', (select count(*) from adm_tasks t where t.school_id=_school and adm_can_read_task(t.id) and ((t.assignee=auth.uid() and t.status in ('new','returned')) or ((t.assigner=auth.uid() or _adm_lead(t.school_id)) and (t.status='awaiting_confirmation' or t.blocked_reason is not null)))),
    'requests_new', (select count(*) from adm_requests r where r.school_id=_school and adm_can_read_request(r.id) and r.status='submitted' and (r.handler_user=auth.uid() or _adm_principal(_school))),
    'requests_open_mine', (select count(*) from adm_requests r where r.school_id=_school and r.submitted_by=auth.uid() and r.status in ('submitted','in_progress','returned')),
    'duties_today_mine', (select count(*) from adm_duty_assignments a join adm_duty_rosters r on r.id=a.roster_id where a.school_id=_school and a.user_id=auth.uid() and a.status='assigned' and r.status='published' and a.date=school_today()),
    'duty_gaps_week', case when _adm_lead(_school) then _duty_gaps(_school, school_today() - extract(dow from school_today())::int, school_today() - extract(dow from school_today())::int + 6) end,
    'duty_changes_open', case when _adm_lead(_school) then (select count(*) from adm_duty_changes c where c.school_id=_school and c.status='open') end,
    'meetings_upcoming_mine', (select count(*) from adm_meetings m where m.school_id=_school and m.status='scheduled' and m.starts_at between now() and now() + interval '7 days'
      and (m.organizer=auth.uid() or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and x.rsvp <> 'declined'))),
    'decisions_open_mine', (select count(*) from adm_tasks t where t.school_id=_school and t.decision_id is not null and t.assignee=auth.uid() and t.status in ('new','in_progress','returned')))
  where _adm_staff(_school, auth.uid()) or can_manage_school(_school)
$$;

drop function public.adm_org_summary(uuid);
create function public.adm_org_summary(_org uuid)
returns table(school_id uuid, school text, tasks_open bigint, tasks_overdue bigint, tasks_done_30d bigint, requests_open bigint, requests_closed_30d bigint,
  duties_week bigint, duty_gaps_week bigint, meetings_upcoming bigint, decisions_open bigint)
language sql stable security definer set search_path=public as $$
  select s.id, s.name,
    (select count(*) from adm_tasks t where t.school_id=s.id and t.status in ('new','in_progress','returned','awaiting_confirmation')),
    (select count(*) from adm_tasks t where t.school_id=s.id and t.status in ('new','in_progress','returned') and t.due_date<school_today()),
    (select count(*) from adm_tasks t where t.school_id=s.id and t.status='done' and t.done_at > now() - interval '30 days'),
    (select count(*) from adm_requests r where r.school_id=s.id and r.status in ('submitted','in_progress')),
    (select count(*) from adm_requests r where r.school_id=s.id and r.status in ('completed','rejected') and r.closed_at > now() - interval '30 days'),
    (select count(*) from adm_duty_assignments a join adm_duty_rosters r on r.id=a.roster_id where a.school_id=s.id and a.status='assigned' and r.status='published'
      and a.date between school_today() - extract(dow from school_today())::int and school_today() - extract(dow from school_today())::int + 6),
    _duty_gaps(s.id, school_today() - extract(dow from school_today())::int, school_today() - extract(dow from school_today())::int + 6),
    (select count(*) from adm_meetings m where m.school_id=s.id and m.status='scheduled' and m.starts_at between now() and now() + interval '7 days'),
    (select count(*) from adm_tasks t where t.school_id=s.id and t.decision_id is not null and t.status in ('new','in_progress','returned','awaiting_confirmation'))
  from schools s where s.org_id=_org and is_org_owner(_org) order by s.name
$$;

do $$ declare f text; begin
  foreach f in array array['adm_can_read_meeting(uuid)','adm_can_read_minutes(uuid)','adm_can_read_decision(uuid)','adm_meeting_conflicts(uuid)','adm_meeting_save(uuid,uuid,jsonb,int,uuid)',
    'adm_meeting_send(uuid,int)','adm_meeting_cancel(uuid,text,int)','adm_meeting_rsvp(uuid,text,text)','adm_meeting_attendance(uuid,jsonb)','adm_minutes_save(uuid,jsonb,int)',
    'adm_minutes_confirm(uuid,int)','adm_decision_create(uuid,jsonb,uuid)','adm_meeting_list(uuid,text,text,text,date,date,int,int)','adm_decision_list(uuid,text,uuid,text,text,int,int)',
    'adm_calendar(uuid,date,date)','adm_summary(uuid)','adm_org_summary(uuid)','adm_party_names(text,uuid)','create_admin_file(text,uuid,text,text,bigint)','remove_admin_file(uuid)','_adm_can_read(text,uuid)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;