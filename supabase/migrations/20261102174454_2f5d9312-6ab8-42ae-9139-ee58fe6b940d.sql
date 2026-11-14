
alter table public.adm_meetings
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists mode text not null default 'in_person' check (mode in ('in_person','virtual')),
  add column if not exists scope text not null default 'school' check (scope in ('school','org')),
  add column if not exists live_status text not null default 'idle' check (live_status in ('idle','live','ended')),
  add column if not exists live_started_at timestamptz,
  add column if not exists live_ended_at timestamptz,
  add column if not exists screen_sharer uuid,
  add column if not exists screen_since timestamptz,
  add column if not exists sent_at timestamptz;
update public.adm_meetings m set org_id = s.org_id from public.schools s where s.id = m.school_id and m.org_id is null;
alter table public.adm_meetings alter column org_id set not null;
create index if not exists adm_meetings_org on public.adm_meetings(org_id, starts_at);

create or replace function public._adm_meet_org_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin new.org_id := (select org_id from schools where id=new.school_id); return new; end $$;
drop trigger if exists adm_meet_org on public.adm_meetings;
create trigger adm_meet_org before insert or update of school_id on public.adm_meetings for each row execute function public._adm_meet_org_trg();

alter table public.adm_meeting_members
  add column if not exists school_id uuid references public.schools(id) on delete set null,
  add column if not exists can_share boolean not null default false,
  add column if not exists share_req_at timestamptz,
  add column if not exists hand_at timestamptz,
  add column if not exists host_muted boolean not null default false,
  add column if not exists mute_rule text,
  add column if not exists mic_req_at timestamptz,
  add column if not exists banned boolean not null default false,
  add column if not exists ban_rule text;
update public.adm_meeting_members x set school_id = m.school_id from public.adm_meetings m where m.id=x.meeting_id and x.school_id is null;

create table public.adm_meeting_presence (
  meeting_id uuid not null references public.adm_meetings(id) on delete cascade,
  user_id uuid not null,
  uid int not null,
  first_joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  joins int not null default 1,
  primary key (meeting_id, user_id),
  unique (meeting_id, uid)
);
grant select on public.adm_meeting_presence to authenticated; grant all on public.adm_meeting_presence to service_role;
alter table public.adm_meeting_presence enable row level security;

create table public.adm_meeting_revocations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.adm_meetings(id) on delete cascade,
  user_id uuid,
  uid int,
  kind text not null check (kind in ('remove','suspend','screen','end','mute','unmute','unban')),
  rule_id text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  attempts int not null default 0,
  error text
);
create index on public.adm_meeting_revocations(meeting_id) where done_at is null;
grant all on public.adm_meeting_revocations to service_role;
alter table public.adm_meeting_revocations enable row level security;

-- read paths
create or replace function public.adm_can_read_meeting(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from adm_meetings m where m.id=_id and (
    m.organizer=auth.uid() or m.minutes_writer=auth.uid()
    or (m.status <> 'draft' and (exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid())
      or (m.privacy='normal' and m.scope='school' and (_adm_lead(m.school_id) or _adm_dept(m.school_id, m.department_id)))))))
$$;
create policy adm_meet_presence_read on public.adm_meeting_presence for select to authenticated using (adm_can_read_meeting(meeting_id));

-- who may organize in a school / org
create or replace function public._adm_can_organize(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select has_school_role(_school, array['principal','vice_principal','dept_head']::app_role[]) or is_org_owner(school_org(_school))
$$;
-- eligible invitee: active staff membership (no student/guardian/owner) in the meeting scope; returns the branch used
create or replace function public._adm_invitee_school(_org uuid, _school uuid, _scope text, _user uuid) returns uuid language sql stable security definer set search_path=public as $$
  select ms.school_id from memberships ms join schools s on s.id=ms.school_id
  where ms.user_id=_user and ms.is_active and ms.role not in ('student','guardian','org_owner')
    and ((_scope='school' and ms.school_id=_school) or (_scope='org' and s.org_id=_org))
  order by (ms.school_id=_school) desc, ms.school_id limit 1
$$;

create or replace function public.adm_meeting_candidates(_school uuid, _scope text, _q text, _branch uuid, _role text, _dept uuid)
returns table(user_id uuid, full_name text, school_id uuid, school_name text, roles text, dept_name text)
language plpgsql stable security definer set search_path=public as $$
declare org uuid := school_org(_school); begin
  if _school is null or not _adm_can_organize(_school) then raise exception 'اختيار المدعوين لمنظمي الاجتماعات فقط'; end if;
  if coalesce(_scope,'school') = 'org' and not is_org_owner(org) then raise exception 'الاجتماع بين الفروع لمالك المؤسسة فقط'; end if;
  return query
  with ms as (
    select m.user_id, m.school_id, m.role::text r from memberships m join schools s on s.id=m.school_id
    where m.is_active and m.role not in ('student','guardian','org_owner') and m.user_id <> auth.uid()
      and ((coalesce(_scope,'school')='school' and m.school_id=_school) or (_scope='org' and s.org_id=org))
      and (_branch is null or m.school_id=_branch) and (_role is null or m.role::text=_role)
  ), u as (
    select ms.user_id, (array_agg(ms.school_id order by (ms.school_id=_school) desc, ms.school_id))[1] sid, string_agg(distinct ms.r, ',') rs
    from ms group by ms.user_id
  )
  select u.user_id, p.full_name, u.sid, sc.name, u.rs, d.name
  from u join profiles p on p.id=u.user_id join schools sc on sc.id=u.sid
  left join lateral (select t.department_id from teachers t where t.user_id=u.user_id and t.school_id=u.sid limit 1) t on true
  left join departments d on d.id=t.department_id
  where (_q is null or p.full_name ilike '%' || _q || '%') and (_dept is null or t.department_id=_dept)
  order by sc.name, p.full_name limit 500;
end $$;

create or replace function public.adm_meeting_save(_id uuid, _school uuid, _d jsonb, _rev int, _client uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m adm_meetings; mem uuid[]; old uuid[]; nid uuid; p uuid; ts timestamptz; dur int; wr uuid; dep uuid; moved boolean := false; nr int;
  org uuid; sc text; md text; reason text; bs uuid; begin
  if _id is null then
    if _client is not null then select * into m from adm_meetings where organizer=auth.uid() and client_id=_client; if m.id is not null then return jsonb_build_object('id', m.id, 'rev', m.rev); end if; end if;
    if _school is null or not _adm_can_organize(_school) then raise exception 'تنظيم الاجتماعات لمالك المؤسسة ومدير المدرسة والوكيل ورؤساء الأقسام'; end if;
    sc := coalesce(_d->>'scope','school');
  else
    select * into m from adm_meetings where id=_id for update;
    if m.id is null or m.organizer <> auth.uid() then raise exception 'تعديل الاجتماع لمنظمه فقط'; end if;
    if m.status in ('cancelled','held') then raise exception 'لا يُعدّل اجتماع ملغى أو منعقد'; end if;
    if m.live_status = 'live' then raise exception 'لا يُعدّل الاجتماع أثناء البث'; end if;
    if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
    if m.scope = 'org' and _school is not null and _school <> m.school_id and is_org_owner(m.org_id) and school_org(_school) = m.org_id then null; else _school := m.school_id; end if;
    sc := coalesce(_d->>'scope', m.scope);
  end if;
  org := school_org(_school);
  if sc not in ('school','org') then raise exception 'نطاق غير صالح'; end if;
  if sc = 'org' and not is_org_owner(org) then raise exception 'الاجتماع بين الفروع لمالك المؤسسة فقط'; end if;
  md := coalesce(_d->>'mode', m.mode, 'in_person');
  if md not in ('in_person','virtual') then raise exception 'نوع اجتماع غير صالح'; end if;
  if coalesce(btrim(_d->>'title'),'') = '' then raise exception 'اكتب عنوان الاجتماع'; end if;
  ts := (_d->>'starts_at')::timestamptz; if ts is null then raise exception 'حدد موعد الاجتماع'; end if;
  dur := coalesce((_d->>'duration_min')::int, 60);
  if _d ? 'ends_at' and nullif(_d->>'ends_at','') is not null then
    dur := (extract(epoch from ((_d->>'ends_at')::timestamptz - ts)) / 60)::int;
    if dur < 5 then raise exception 'وقت النهاية يجب أن يكون بعد البداية بخمس دقائق على الأقل'; end if;
  end if;
  if md = 'in_person' and _d ? 'mode' and coalesce(btrim(_d->>'location'),'') = '' then raise exception 'حدد القاعة أو المكان للاجتماع الحضوري'; end if;
  if coalesce(_d->>'privacy','normal') not in ('normal','restricted') then raise exception 'مستوى خصوصية غير صالح'; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into mem from jsonb_array_elements_text(coalesce(_d->'members','[]')) x where x::uuid <> auth.uid();
  foreach p in array mem loop
    if _adm_invitee_school(org, _school, sc, p) is null then
      raise exception '%', case when sc='school' then 'مشارك من خارج المدرسة أو حسابه غير نشط' else 'مشارك من خارج المؤسسة أو حسابه غير نشط' end;
    end if;
  end loop;
  wr := nullif(_d->>'minutes_writer','')::uuid;
  if wr is not null and wr <> auth.uid() and not (wr = any(mem)) then raise exception 'كاتب المحضر يجب أن يكون من المشاركين'; end if;
  dep := nullif(_d->>'department_id','')::uuid;
  if dep is not null and not exists(select 1 from departments where id=dep and school_id=_school) then raise exception 'قسم غير صالح'; end if;
  reason := nullif(btrim(coalesce(_d->>'change_reason','')),'');
  if m.id is not null and m.status = 'scheduled' and reason is null then raise exception 'اكتب سبب التعديل؛ سيُبلغ به المدعوون'; end if;
  if _id is null then
    insert into adm_meetings(school_id, department_id, title, purpose, starts_at, duration_min, location, link, agenda, privacy, needs_rsvp, minutes_writer, client_id, mode, scope)
    values (_school, dep, btrim(_d->>'title'), nullif(btrim(_d->>'purpose'),''), ts, dur, nullif(btrim(_d->>'location'),''), nullif(btrim(_d->>'link'),''), nullif(btrim(_d->>'agenda'),''),
      coalesce(_d->>'privacy','normal'), coalesce((_d->>'needs_rsvp')::boolean, true), wr, _client, md, sc) returning id into nid;
    perform _adm_log(_school, 'meeting', nid, 'created', '{}');
    nr := 1;
  else
    nid := _id;
    moved := m.starts_at <> ts or m.duration_min <> dur or coalesce(m.location,'') <> coalesce(nullif(btrim(_d->>'location'),''),'') or m.mode <> md or m.school_id <> _school;
    update adm_meetings set school_id=_school, department_id=dep, title=btrim(_d->>'title'), purpose=nullif(btrim(_d->>'purpose'),''), starts_at=ts, duration_min=dur, location=nullif(btrim(_d->>'location'),''),
      link=nullif(btrim(_d->>'link'),''), agenda=nullif(btrim(_d->>'agenda'),''), privacy=coalesce(_d->>'privacy','normal'), needs_rsvp=coalesce((_d->>'needs_rsvp')::boolean, true),
      minutes_writer=wr, mode=md, scope=sc, rev=rev + 1, updated_at=now() where id=_id;
    nr := m.rev + 1;
    perform _adm_log(_school, 'meeting', nid, 'updated', jsonb_strip_nulls(jsonb_build_object('reason', reason, 'note', case when moved then 'الموعد السابق ' || to_char(m.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' (' || m.duration_min || ' دقيقة)' || coalesce(' — ' || m.location, '') end)));
  end if;
  select coalesce(array_agg(user_id), '{}') into old from adm_meeting_members where meeting_id=nid;
  delete from adm_meeting_members where meeting_id=nid and not (user_id = any(mem));
  foreach p in array mem loop
    bs := _adm_invitee_school(org, _school, sc, p);
    insert into adm_meeting_members(meeting_id, user_id, school_id) values (nid, p, bs) on conflict (meeting_id, user_id) do update set school_id=excluded.school_id;
  end loop;
  if m.id is not null and m.status = 'scheduled' then
    foreach p in array mem loop
      if not (p = any(old)) then perform _notify(p, (select school_id from adm_meeting_members where meeting_id=nid and user_id=p), 'admin', 'دعوة لاجتماع: ' || btrim(_d->>'title'), to_char(ts at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), '/app/admin/meetings/' || nid, 'adm:meet:' || nid || ':inv:' || p);
      else
        if moved then update adm_meeting_members set rsvp=case when rsvp='accepted' then 'pending' else rsvp end where meeting_id=nid and user_id=p; end if;
        perform _notify(p, (select school_id from adm_meeting_members where meeting_id=nid and user_id=p), 'admin', 'تعديل اجتماع: ' || btrim(_d->>'title'),
          to_char(ts at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || ' — السبب: ' || reason, '/app/admin/meetings/' || nid, 'adm:meet:' || nid || ':mv' || nr || ':' || p);
      end if;
    end loop;
    foreach p in array old loop
      if not (p = any(mem)) then perform _notify(p, _school, 'admin', 'أُزلت من دعوة اجتماع', case when m.privacy='restricted' then '' else m.title end, '/app/admin/meetings', 'adm:meet:' || nid || ':rm' || nr || ':' || p); end if;
    end loop;
  end if;
  return jsonb_build_object('id', nid, 'rev', nr);
end $$;

create or replace function public.adm_meeting_send(_id uuid, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare m adm_meetings; x record; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'إرسال الدعوة لمنظم الاجتماع فقط'; end if;
  if m.status = 'scheduled' and m.rev = coalesce(_rev,-1) + 1 then return m.rev; end if;
  if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
  if m.status <> 'draft' then raise exception 'أُرسلت الدعوة مسبقًا'; end if;
  if not exists(select 1 from adm_meeting_members where meeting_id=_id) then raise exception 'أضف مشاركًا واحدًا على الأقل'; end if;
  update adm_meetings set status='scheduled', sent_at=now(), rev=rev + 1, updated_at=now() where id=_id;
  for x in select user_id, school_id from adm_meeting_members where meeting_id=_id loop
    perform _notify(x.user_id, coalesce(x.school_id, m.school_id), 'admin', 'دعوة لاجتماع' || case when m.mode='virtual' then ' افتراضي' else '' end || ': ' || m.title,
      to_char(m.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':inv:' || x.user_id);
  end loop;
  perform _adm_log(m.school_id, 'meeting', _id, 'invited', '{}');
  return m.rev + 1;
end $$;

create or replace function public.adm_meeting_cancel(_id uuid, _reason text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare m adm_meetings; x record; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'إلغاء الاجتماع لمنظمه فقط'; end if;
  if m.status = 'cancelled' then return m.rev; end if;
  if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
  if m.status = 'held' or m.live_status <> 'idle' then raise exception 'لا يُلغى اجتماع منعقد أو بدأ بثه'; end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'اكتب سبب الإلغاء'; end if;
  update adm_meetings set status='cancelled', cancel_reason=btrim(_reason), rev=rev + 1, updated_at=now() where id=_id;
  if m.status = 'scheduled' then
    for x in select user_id, school_id from adm_meeting_members where meeting_id=_id loop
      perform _notify(x.user_id, coalesce(x.school_id, m.school_id), 'admin', 'أُلغي اجتماع: ' || m.title, btrim(_reason), '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':cancel:' || x.user_id);
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
  if m.status <> 'scheduled' or m.live_status = 'ended' then raise exception 'الاجتماع غير متاح للرد'; end if;
  if _rsvp not in ('accepted','declined') then raise exception 'رد غير صالح'; end if;
  if x.rsvp = _rsvp and coalesce(x.rsvp_note,'') = coalesce(nullif(btrim(_note),''),'') then return; end if;
  update adm_meeting_members set rsvp=_rsvp, rsvp_note=nullif(btrim(_note),''), rsvp_at=now() where meeting_id=_id and user_id=auth.uid();
  perform _adm_log(m.school_id, 'meeting', _id, case when _rsvp='accepted' then 'rsvp_accepted' else 'rsvp_declined' end, jsonb_build_object('note', nullif(btrim(_note),'')));
  if _rsvp = 'declined' then perform _notify(m.organizer, m.school_id, 'admin', 'اعتذار عن اجتماع: ' || m.title, _adm_name(auth.uid()), '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':decl:' || auth.uid() || ':' || md5(coalesce(_note,''))); end if;
end $$;

create or replace function public.adm_meeting_conflicts(_id uuid) returns table(user_id uuid, full_name text, reason text) language sql stable security definer set search_path=public as $$
  with m as (select *, (starts_at at time zone 'Asia/Riyadh') ls, ((starts_at + make_interval(mins => duration_min)) at time zone 'Asia/Riyadh') le from adm_meetings where id=_id),
  ppl as (select x.user_id u, x.school_id s from adm_meeting_members x where x.meeting_id=_id union select organizer, school_id from m)
  select p.u, _adm_name(p.u), r.reason
  from ppl p cross join m cross join lateral (select _meet_busy(coalesce(p.s, m.school_id), p.u, m.ls::date, m.ls::time, m.le::time, m.id) reason) r
  where adm_can_read_meeting(_id) and r.reason is not null
$$;

drop function if exists public.adm_meeting_list(uuid,text,text,text,date,date,int,int);
create or replace function public.adm_meeting_list(_school uuid, _org uuid, _scope text, _q text, _status text, _mode text, _from date, _to date, _limit int, _offset int)
returns table(id uuid, title text, starts_at timestamptz, duration_min int, location text, status text, privacy text, mode text, scope text, live_status text, school_name text,
  organizer_name text, members bigint, my_rsvp text, am_organizer boolean, total bigint)
language sql stable security definer set search_path=public as $$
  with base as (
    select m.* from adm_meetings m where adm_can_read_meeting(m.id)
      and ((_school is not null and (m.school_id=_school or (m.scope='org' and m.org_id=school_org(_school) and (m.organizer=auth.uid() or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid())))))
        or (_school is null and _org is not null and m.org_id=_org))
      and (_scope is distinct from 'mine' or m.organizer=auth.uid() or m.minutes_writer=auth.uid() or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid()))
      and (_q is null or m.title ilike '%' || _q || '%' or coalesce(m.purpose,'') ilike '%' || _q || '%' or coalesce(m.agenda,'') ilike '%' || _q || '%')
      and (_status is null
        or (_status='upcoming' and m.status='scheduled' and m.live_status <> 'ended' and m.starts_at + make_interval(mins => m.duration_min) >= now())
        or (_status='invites' and m.status='scheduled' and m.live_status <> 'ended' and exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and x.rsvp='pending'))
        or (_status='ended' and (m.status='held' or m.live_status='ended' or (m.status='scheduled' and m.starts_at + make_interval(mins => m.duration_min) < now())))
        or (_status not in ('upcoming','invites','ended') and m.status=_status))
      and (_mode is null or m.mode=_mode)
      and (_from is null or (m.starts_at at time zone 'Asia/Riyadh')::date >= _from) and (_to is null or (m.starts_at at time zone 'Asia/Riyadh')::date <= _to)
  )
  select b.id, b.title, b.starts_at, b.duration_min, b.location, b.status, b.privacy, b.mode, b.scope, b.live_status, (select name from schools where id=b.school_id), _adm_name(b.organizer),
    (select count(*) from adm_meeting_members x where x.meeting_id=b.id),
    (select x.rsvp from adm_meeting_members x where x.meeting_id=b.id and x.user_id=auth.uid()),
    b.organizer=auth.uid(), count(*) over ()
  from base b order by b.starts_at desc, b.id limit least(coalesce(_limit, 25), 100) offset coalesce(_offset, 0)
$$;

-- virtual meetings for the communication tab (one record; staff only)
create or replace function public.adm_my_virtual_meetings() returns table(id uuid, title text, starts_at timestamptz, duration_min int, status text, live_status text, organizer_name text, school_name text, am_organizer boolean, my_rsvp text)
language sql stable security definer set search_path=public as $$
  select m.id, m.title, m.starts_at, m.duration_min, m.status, m.live_status, _adm_name(m.organizer), (select name from schools where id=m.school_id), m.organizer=auth.uid(),
    (select x.rsvp from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid())
  from adm_meetings m
  where m.mode='virtual' and m.status in ('scheduled','held')
    and (m.organizer=auth.uid() or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned))
    and m.starts_at > now() - interval '30 days'
  order by (m.live_status='live') desc, (m.live_status='ended' or m.status='held'), m.starts_at
  limit 100
$$;

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
    select 'meeting', m.id, m.title || case when m.mode='virtual' then ' (افتراضي)' else '' end, (m.starts_at at time zone 'Asia/Riyadh')::date, (m.starts_at at time zone 'Asia/Riyadh')::time,
      ((m.starts_at + make_interval(mins => m.duration_min)) at time zone 'Asia/Riyadh')::time, m.status, '/app/admin/meetings/' || m.id
    from adm_meetings m where (m.school_id=_school or (m.scope='org' and m.org_id=school_org(_school))) and m.status in ('scheduled','held') and (m.starts_at at time zone 'Asia/Riyadh')::date between _from and _to
      and (m.organizer=auth.uid() or m.minutes_writer=auth.uid() or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and x.rsvp <> 'declined'))
  ) z where _to - _from <= 62 order by 4, 5 nulls first, 3
$$;

-- decisions: cross-branch meetings choose the execution branch; assignee must be staff there
create or replace function public.adm_decision_create(_meeting uuid, _d jsonb, _client uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare m adm_meetings; did uuid; tid uuid; mid uuid; due date; who uuid; body text; ex uuid; begin
  if _client is not null then select id into did from adm_decisions where created_by=auth.uid() and client_id=_client; if did is not null then return did; end if; end if;
  select * into m from adm_meetings where id=_meeting;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'تسجيل القرارات لمنظم الاجتماع فقط'; end if;
  if m.status not in ('scheduled','held') then raise exception 'القرارات لاجتماع منعقد أو مجدول'; end if;
  body := btrim(coalesce(_d->>'body',''));
  if length(body) < 2 then raise exception 'اكتب نص القرار'; end if;
  ex := coalesce(nullif(_d->>'school_id','')::uuid, m.school_id);
  if ex <> m.school_id and (m.scope <> 'org' or school_org(ex) <> m.org_id) then raise exception 'فرع التنفيذ يجب أن يكون فرع الاجتماع'; end if;
  who := (_d->>'assignee')::uuid;
  if not _adm_staff(ex, who) then raise exception 'مسؤول التنفيذ يجب أن يكون من موظفي فرع التنفيذ'; end if;
  due := (_d->>'due_date')::date;
  if due is null or due < school_today() then raise exception 'حدد موعدًا من اليوم فصاعدًا'; end if;
  if coalesce(_d->>'priority','normal') not in ('low','normal','high') then raise exception 'أولوية غير صالحة'; end if;
  select id into mid from adm_minutes where meeting_id=_meeting order by version desc limit 1;
  did := gen_random_uuid();
  insert into adm_tasks(school_id, department_id, title, description, assignee, assigner, due_date, priority, decision_id)
    values (ex, case when ex=m.school_id then m.department_id end, left('قرار: ' || body, 200),
      body || E'\n\nمرجع القرار: ' || case when m.privacy='restricted' then 'اجتماع مقيد' else 'اجتماع «' || m.title || '» بتاريخ ' || to_char(m.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD') end,
      who, auth.uid(), due, coalesce(_d->>'priority','normal'), did) returning id into tid;
  insert into adm_decisions(id, school_id, meeting_id, minutes_id, body, assignee, due_date, priority, task_id, client_id)
    values (did, m.school_id, _meeting, mid, body, who, due, coalesce(_d->>'priority','normal'), tid, _client);
  perform _adm_log(m.school_id, 'meeting', _meeting, 'decision_added', jsonb_build_object('note', left(body, 200) || ' — ' || _adm_name(who)));
  perform _adm_log(ex, 'task', tid, 'created', jsonb_build_object('note', 'من قرار اجتماع'));
  perform _notify(who, ex, 'admin', 'قرار مسند إليك', left(body, 120) || ' — الموعد ' || due, '/app/admin/tasks/' || tid, 'adm:dec:' || did);
  return did;
end $$;

-- ===== live (virtual) meetings =====
-- caller's live role: 'host' | 'member' | null (re-checks active membership in scope every call)
create or replace function public._adm_live_role(_id uuid) returns text language sql stable security definer set search_path=public as $$
  select case
    when m.organizer=auth.uid() and (is_org_owner(m.org_id) or has_school_role(m.school_id, array['principal','vice_principal','dept_head']::app_role[])) then 'host'
    when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned)
      and _adm_invitee_school(m.org_id, m.school_id, m.scope, auth.uid()) is not null then 'member'
  end from adm_meetings m where m.id=_id
$$;

create or replace function public.adm_live_start(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m adm_meetings; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or _adm_live_role(_id) is distinct from 'host' then raise exception 'بدء الاجتماع لمضيفه فقط'; end if;
  if m.mode <> 'virtual' then raise exception 'الاجتماع الحضوري لا يملك غرفة صوت'; end if;
  if m.status <> 'scheduled' then raise exception 'أرسل الدعوات قبل بدء الاجتماع'; end if;
  if m.live_status = 'ended' then raise exception 'انتهى هذا الاجتماع'; end if;
  if m.live_status = 'live' then return; end if;
  if now() < m.starts_at - interval '30 minutes' then raise exception 'يمكن البدء قبل الموعد بثلاثين دقيقة فقط'; end if;
  update adm_meetings set live_status='live', live_started_at=now(), updated_at=now() where id=_id;
  perform _adm_log(m.school_id, 'meeting', _id, 'live_started', '{}');
end $$;

-- join/renew: validates and returns the channel identity used to mint a short-lived token on the server
create or replace function public.adm_live_join(_id uuid, _kind text) returns jsonb language plpgsql security definer set search_path=public as $$
declare m adm_meetings; r text; u int; x adm_meeting_members; pr adm_meeting_presence; begin
  select * into m from adm_meetings where id=_id;
  r := _adm_live_role(_id);
  if m.id is null or r is null then raise exception 'لست مدعوًا لهذا الاجتماع أو أُوقف وصولك'; end if;
  if m.mode <> 'virtual' or m.status <> 'scheduled' then raise exception 'الاجتماع غير متاح للانضمام'; end if;
  if m.live_status = 'ended' then raise exception 'انتهى الاجتماع'; end if;
  if m.live_status <> 'live' then raise exception 'لم يبدأ المضيف الاجتماع بعد'; end if;
  if _kind not in ('join','renew','screen') then raise exception 'طلب غير صالح'; end if;
  select * into x from adm_meeting_members where meeting_id=_id and user_id=auth.uid();
  if _kind = 'screen' and m.screen_sharer is distinct from auth.uid() then raise exception 'لا تملك مشاركة الشاشة الآن'; end if;
  select * into pr from adm_meeting_presence where meeting_id=_id and user_id=auth.uid() for update;
  if pr.user_id is null then
    if _kind <> 'join' then raise exception 'انضم إلى الاجتماع أولًا'; end if;
    perform pg_advisory_xact_lock(hashtext('admlive' || _id::text));
    select coalesce(max(uid), 0) + 1 into u from adm_meeting_presence where meeting_id=_id;
    insert into adm_meeting_presence(meeting_id, user_id, uid) values (_id, auth.uid(), u) returning * into pr;
    perform _adm_log(m.school_id, 'meeting', _id, 'live_joined', '{}');
  elsif _kind = 'join' then
    update adm_meeting_presence set joins = joins + case when left_at is not null or last_seen_at < now() - interval '60 seconds' then 1 else 0 end, left_at=null, last_seen_at=now()
      where meeting_id=_id and user_id=auth.uid() returning * into pr;
  else
    update adm_meeting_presence set last_seen_at=now(), left_at=null where meeting_id=_id and user_id=auth.uid() returning * into pr;
  end if;
  return jsonb_build_object('channel', 'rikaz-' || replace(_id::text, '-', ''), 'uid', pr.uid, 'screen_uid', pr.uid + 100000,
    'host', r = 'host', 'publish_audio', r = 'host' or not coalesce(x.host_muted, false), 'screen', m.screen_sharer = auth.uid());
end $$;

create or replace function public.adm_live_leave(_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update adm_meeting_presence set left_at=now(), last_seen_at=now() where meeting_id=_id and user_id=auth.uid() and left_at is null;
  update adm_meetings set screen_sharer=null, screen_since=null where id=_id and screen_sharer=auth.uid();
  update adm_meeting_members set hand_at=null where meeting_id=_id and user_id=auth.uid();
end $$;

-- heartbeat: refreshes presence and tells the client whether it may stay
create or replace function public.adm_live_beat(_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m adm_meetings; r text; begin
  select * into m from adm_meetings where id=_id;
  r := _adm_live_role(_id);
  if m.id is null or r is null then return jsonb_build_object('ok', false, 'reason', 'removed'); end if;
  if m.live_status = 'ended' or m.status <> 'scheduled' then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  update adm_meeting_presence set last_seen_at=now() where meeting_id=_id and user_id=auth.uid() and left_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- participant actions: hand | lower | request_share | share_start | share_stop | ack_mic
create or replace function public.adm_live_self(_id uuid, _action text) returns void language plpgsql security definer set search_path=public as $$
declare m adm_meetings; r text; x adm_meeting_members; begin
  select * into m from adm_meetings where id=_id for update;
  r := _adm_live_role(_id);
  if m.id is null or r is null then raise exception 'لست مشاركًا في هذا الاجتماع'; end if;
  if m.live_status <> 'live' then raise exception 'الاجتماع غير مباشر الآن'; end if;
  select * into x from adm_meeting_members where meeting_id=_id and user_id=auth.uid();
  if _action = 'hand' then update adm_meeting_members set hand_at=now() where meeting_id=_id and user_id=auth.uid();
  elsif _action = 'lower' then update adm_meeting_members set hand_at=null where meeting_id=_id and user_id=auth.uid();
  elsif _action = 'ack_mic' then update adm_meeting_members set mic_req_at=null where meeting_id=_id and user_id=auth.uid();
  elsif _action = 'request_share' then
    if r = 'host' or x.can_share then return; end if;
    update adm_meeting_members set share_req_at=now() where meeting_id=_id and user_id=auth.uid();
  elsif _action = 'share_start' then
    if r <> 'host' and not coalesce(x.can_share, false) then raise exception 'اطلب إذن المضيف لمشاركة الشاشة'; end if;
    if m.screen_sharer is not null and m.screen_sharer <> auth.uid() then raise exception 'يشارك % شاشته الآن؛ انتظر حتى يتوقف', _adm_name(m.screen_sharer); end if;
    update adm_meetings set screen_sharer=auth.uid(), screen_since=now() where id=_id;
  elsif _action = 'share_stop' then
    update adm_meetings set screen_sharer=null, screen_since=null where id=_id and screen_sharer=auth.uid();
  else raise exception 'إجراء غير صالح'; end if;
end $$;

-- host actions: mute | ask_unmute | remove | allow_back | grant_share | revoke_share | stop_share | end
create or replace function public.adm_live_host(_id uuid, _action text, _user uuid) returns void language plpgsql security definer set search_path=public as $$
declare m adm_meetings; x adm_meeting_members; pu int; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or _adm_live_role(_id) is distinct from 'host' then raise exception 'هذا الإجراء لمضيف الاجتماع فقط'; end if;
  if m.live_status <> 'live' then raise exception 'الاجتماع غير مباشر الآن'; end if;
  if _action = 'end' then
    update adm_meetings set live_status='ended', live_ended_at=now(), status='held', screen_sharer=null, screen_since=null, updated_at=now() where id=_id;
    update adm_meeting_presence set left_at=coalesce(left_at, now()) where meeting_id=_id;
    update adm_meeting_members x2 set attended = true, marked_at = coalesce(x2.marked_at, now()) where x2.meeting_id=_id and x2.attended is null and exists(select 1 from adm_meeting_presence p where p.meeting_id=_id and p.user_id=x2.user_id);
    insert into adm_meeting_revocations(meeting_id, kind) values (_id, 'end');
    perform _adm_log(m.school_id, 'meeting', _id, 'live_ended', '{}');
    return;
  end if;
  select * into x from adm_meeting_members where meeting_id=_id and user_id=_user for update;
  if x.user_id is null then raise exception 'المستخدم ليس من المدعوين'; end if;
  select uid into pu from adm_meeting_presence where meeting_id=_id and user_id=_user;
  if _action = 'mute' then
    if x.host_muted then return; end if;
    update adm_meeting_members set host_muted=true, mic_req_at=null where meeting_id=_id and user_id=_user;
    if pu is not null then insert into adm_meeting_revocations(meeting_id, user_id, uid, kind) values (_id, _user, pu, 'mute'); end if;
  elsif _action = 'ask_unmute' then
    update adm_meeting_members set host_muted=false, mic_req_at=now() where meeting_id=_id and user_id=_user;
    if x.mute_rule is not null then insert into adm_meeting_revocations(meeting_id, user_id, uid, kind, rule_id) values (_id, _user, pu, 'unmute', x.mute_rule); end if;
  elsif _action = 'remove' then
    update adm_meeting_members set banned=true, can_share=false, share_req_at=null, hand_at=null where meeting_id=_id and user_id=_user;
    update adm_meetings set screen_sharer=null, screen_since=null where id=_id and screen_sharer=_user;
    update adm_meeting_presence set left_at=now() where meeting_id=_id and user_id=_user and left_at is null;
    if pu is not null then insert into adm_meeting_revocations(meeting_id, user_id, uid, kind) values (_id, _user, pu, 'remove'); end if;
    perform _adm_log(m.school_id, 'meeting', _id, 'live_removed', jsonb_build_object('note', _adm_name(_user)));
  elsif _action = 'allow_back' then
    update adm_meeting_members set banned=false where meeting_id=_id and user_id=_user;
    if x.ban_rule is not null then insert into adm_meeting_revocations(meeting_id, user_id, uid, kind, rule_id) values (_id, _user, pu, 'unban', x.ban_rule); end if;
    perform _adm_log(m.school_id, 'meeting', _id, 'live_allowed_back', jsonb_build_object('note', _adm_name(_user)));
  elsif _action = 'grant_share' then
    update adm_meeting_members set can_share=true, share_req_at=null where meeting_id=_id and user_id=_user;
  elsif _action in ('revoke_share','stop_share') then
    if _action = 'revoke_share' then update adm_meeting_members set can_share=false, share_req_at=null where meeting_id=_id and user_id=_user; end if;
    if m.screen_sharer = _user then
      update adm_meetings set screen_sharer=null, screen_since=null where id=_id;
      if pu is not null then insert into adm_meeting_revocations(meeting_id, user_id, uid, kind) values (_id, _user, pu + 100000, 'screen'); end if;
    end if;
  else raise exception 'إجراء غير صالح'; end if;
end $$;

-- roster for the room (participants only)
create or replace function public.adm_live_roster(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m adm_meetings; r text; begin
  select * into m from adm_meetings where id=_id;
  r := _adm_live_role(_id);
  if m.id is null or r is null then raise exception 'لست مشاركًا في هذا الاجتماع'; end if;
  return jsonb_build_object(
    'meeting', jsonb_build_object('id', m.id, 'title', m.title, 'live_status', m.live_status, 'status', m.status, 'screen_sharer', m.screen_sharer, 'organizer', m.organizer,
      'starts_at', m.starts_at, 'duration_min', m.duration_min, 'mode', m.mode, 'school_name', (select name from schools where id=m.school_id)),
    'me', jsonb_build_object('role', r, 'user_id', auth.uid()),
    'people', coalesce((select jsonb_agg(z order by z.is_host desc, z.full_name) from (
      select m.organizer user_id, _adm_name(m.organizer) full_name, (select name from schools where id=m.school_id) school_name, true is_host, null::text rsvp,
        p.uid, (p.user_id is not null and p.left_at is null and p.last_seen_at > now() - interval '45 seconds') present, null::timestamptz hand_at, true can_share, null::timestamptz share_req_at,
        false host_muted, null::timestamptz mic_req_at, false banned
      from (select 1) o left join adm_meeting_presence p on p.meeting_id=m.id and p.user_id=m.organizer
      union all
      select x.user_id, _adm_name(x.user_id), (select name from schools where id=x.school_id), false, x.rsvp,
        p.uid, (p.user_id is not null and p.left_at is null and p.last_seen_at > now() - interval '45 seconds'), x.hand_at, x.can_share, x.share_req_at,
        x.host_muted, x.mic_req_at, x.banned
      from adm_meeting_members x left join adm_meeting_presence p on p.meeting_id=x.meeting_id and p.user_id=x.user_id
      where x.meeting_id=m.id
    ) z), '[]'::jsonb));
end $$;

-- cut live access when an invitee is removed or a membership is suspended
create or replace function public._adm_live_cut_member_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare pu int; begin
  select p.uid into pu from adm_meeting_presence p join adm_meetings m on m.id=p.meeting_id where p.meeting_id=old.meeting_id and p.user_id=old.user_id and m.live_status='live';
  if pu is not null then
    insert into adm_meeting_revocations(meeting_id, user_id, uid, kind) values (old.meeting_id, old.user_id, pu, 'remove');
    update adm_meeting_presence set left_at=now() where meeting_id=old.meeting_id and user_id=old.user_id and left_at is null;
    update adm_meetings set screen_sharer=null, screen_since=null where id=old.meeting_id and screen_sharer=old.user_id;
  end if;
  return old;
end $$;
drop trigger if exists adm_live_cut_member on public.adm_meeting_members;
create trigger adm_live_cut_member after delete on public.adm_meeting_members for each row execute function public._adm_live_cut_member_trg();

create or replace function public._adm_live_cut_suspend_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.is_active and not new.is_active then
    insert into adm_meeting_revocations(meeting_id, user_id, uid, kind)
      select p.meeting_id, p.user_id, p.uid, 'suspend' from adm_meeting_presence p join adm_meetings m on m.id=p.meeting_id
      where p.user_id=new.user_id and m.live_status='live' and p.left_at is null and m.org_id = coalesce(new.org_id, school_org(new.school_id));
    update adm_meetings m set screen_sharer=null, screen_since=null where m.screen_sharer=new.user_id and m.live_status='live';
  end if;
  return new;
end $$;
drop trigger if exists adm_live_cut_suspend on public.memberships;
create trigger adm_live_cut_suspend after update of is_active on public.memberships for each row execute function public._adm_live_cut_suspend_trg();

-- realtime: room state changes reach participants (RLS still applies)
do $$ begin
  begin alter publication supabase_realtime add table public.adm_meetings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.adm_meeting_members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.adm_meeting_presence; exception when duplicate_object then null; end;
end $$;

do $$ declare f text; begin
  foreach f in array array['adm_meeting_candidates(uuid,text,text,uuid,text,uuid)','adm_meeting_list(uuid,uuid,text,text,text,text,date,date,int,int)','adm_my_virtual_meetings()',
    'adm_live_start(uuid)','adm_live_join(uuid,text)','adm_live_leave(uuid)','adm_live_beat(uuid)','adm_live_self(uuid,text)','adm_live_host(uuid,text,uuid)','adm_live_roster(uuid)',
    'adm_meeting_save(uuid,uuid,jsonb,int,uuid)','adm_meeting_send(uuid,int)','adm_meeting_cancel(uuid,text,int)','adm_meeting_rsvp(uuid,text,text)','adm_meeting_conflicts(uuid)',
    'adm_calendar(uuid,date,date)','adm_decision_create(uuid,jsonb,uuid)','adm_can_read_meeting(uuid)'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
  foreach f in array array['_adm_can_organize(uuid)','_adm_invitee_school(uuid,uuid,text,uuid)','_adm_live_role(uuid)','_adm_meet_org_trg()','_adm_live_cut_member_trg()','_adm_live_cut_suspend_trg()'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon, authenticated';
  end loop;
end $$;
