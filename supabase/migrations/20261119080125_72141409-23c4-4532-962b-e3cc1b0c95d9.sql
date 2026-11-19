alter table public.timetables
  add column if not exists kind text not null default 'basic',
  add column if not exists lineage uuid,
  add column if not exists is_active boolean not null default false,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid;
alter table public.timetables drop constraint if exists timetables_kind_chk;
alter table public.timetables add constraint timetables_kind_chk check (kind in ('basic','prep','summer','winter','ramadan'));

-- lineage: root of the based_on chain
with recursive ch as (
  select id, id as root from public.timetables where based_on is null
  union all select t.id, ch.root from public.timetables t join ch on t.based_on = ch.id)
update public.timetables t set lineage = ch.root from ch where ch.id = t.id and t.lineage is null;
update public.timetables set lineage = id where lineage is null;

create unique index if not exists timetables_one_active on public.timetables(school_id) where is_active;

create table if not exists public.timetable_activations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  previous_id uuid,
  activated_by uuid,
  activated_at timestamptz not null default now()
);
grant select on public.timetable_activations to authenticated;
grant all on public.timetable_activations to service_role;
alter table public.timetable_activations enable row level security;
create policy "tt act read" on public.timetable_activations for select to authenticated
  using (school_id = any((select _ws_view_schools('schedule_drafts'))::uuid[]));

create or replace function public._tt_defaults_trg() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.lineage is null then
      new.lineage := coalesce((select lineage from timetables where id = new.based_on), new.id);
    end if;
    if new.based_on is not null then new.kind := (select kind from timetables where id = new.based_on); end if;
    if new.is_active and current_setting('rikaz.activating', true) is distinct from 'on' then raise exception 'الاعتماد يتم عبر «اعتماد الجدول» فقط'; end if;
  else
    if (new.is_active is distinct from old.is_active or new.activated_at is distinct from old.activated_at or new.activated_by is distinct from old.activated_by or new.lineage is distinct from old.lineage)
       and current_setting('rikaz.activating', true) is distinct from 'on' then raise exception 'الاعتماد يتم عبر «اعتماد الجدول» فقط'; end if;
    if new.status <> 'published' and new.is_active then raise exception 'لا يُعتمد إلا جدول منشور'; end if;
  end if;
  return new;
end $$;
drop trigger if exists tt_defaults on public.timetables;
create trigger tt_defaults before insert or update on public.timetables for each row execute function public._tt_defaults_trg();

-- backfill: active = what operations use today
do $$ declare s uuid; c uuid; begin
  perform set_config('rikaz.activating','on',true);
  for s in select distinct school_id from timetables where status='published' loop
    select t.id into c from timetables t join academic_years y on y.id=t.year_id left join terms tr on tr.id=t.term_id
      where t.school_id=s and t.status='published' and t.effective_from<=current_date and current_date between y.start_date and y.end_date
        and (tr.id is null or ((tr.start_date is null or tr.start_date<=current_date) and (tr.end_date is null or tr.end_date>=current_date)))
      order by t.effective_from desc, t.version desc limit 1;
    if c is null then select id into c from timetables where school_id=s and status='published' order by published_at desc nulls last limit 1; end if;
    update timetables set is_active=true, activated_at=coalesce(published_at,now()), activated_by=published_by where id=c;
  end loop;
  perform set_config('rikaz.activating','off',true);
end $$;

-- operational source = the approved timetable only
create or replace function public.current_timetable(_school uuid, _date date)
 returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from timetables where school_id=_school and is_active and status='published' limit 1 $$;

create or replace function public.tt_activate(_id uuid) returns uuid
 language plpgsql security definer set search_path to 'public' as $$
declare t record; prev uuid; begin
  select * into t from timetables where id=_id for update;
  if t is null or not _ws_ok(t.school_id,'schedule_drafts','publish') then raise exception 'غير مصرح'; end if;
  if t.status <> 'published' then raise exception 'انشر الجدول أولًا ثم اعتمده'; end if;
  perform pg_advisory_xact_lock(hashtext('tt-act:' || t.school_id));
  select id into prev from timetables where school_id=t.school_id and is_active;
  if prev = _id then return _id; end if;
  perform set_config('rikaz.activating','on',true);
  update timetables set is_active=false where id=prev;
  update timetables set is_active=true, activated_at=now(), activated_by=auth.uid() where id=_id;
  perform set_config('rikaz.activating','off',true);
  insert into timetable_activations(school_id, timetable_id, previous_id, activated_by) values (t.school_id, _id, prev, auth.uid());
  perform _duty_check_conflicts(t.school_id, 'tt:' || _id);
  return _id;
end $$;
revoke all on function public.tt_activate(uuid) from public, anon;
grant execute on function public.tt_activate(uuid) to authenticated;

create or replace function public.start_timetable_revision(_id uuid)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare t record; nid uuid; begin
  select * into t from timetables where id=_id;
  if t is null or not _ws_ok(t.school_id,'schedule_drafts','revise') then raise exception 'غير مصرح'; end if;
  if t.status <> 'published' then raise exception 'النسخ يكون من جدول منشور'; end if;
  select id into nid from timetables where based_on=_id and status='draft' limit 1;
  if nid is not null then return nid; end if;
  insert into timetables(school_id, year_id, term_id, name, based_on, kind, lineage) values (t.school_id, t.year_id, t.term_id, t.name, _id, t.kind, t.lineage) returning id into nid;
  alter table timetable_slots disable trigger slot_check;
  insert into timetable_slots(school_id, timetable_id, day, period_id, course_id, section_id, teacher_id, room_id, pinned) select school_id, nid, day, period_id, course_id, section_id, teacher_id, room_id, pinned from timetable_slots where timetable_id=_id;
  alter table timetable_slots enable trigger slot_check;
  return nid;
end $function$;

-- publish per lineage (several timetables per year/term); a new version of the approved timetable stays approved
create or replace function public.publish_timetable(_id uuid, _effective_from date)
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare t record; latest uuid; latest_active boolean; v int; pr record; u uuid;
begin
  select * into t from timetables where id=_id for update;
  if t is null or not _ws_ok(t.school_id,'schedule_drafts','publish') then raise exception 'غير مصرح'; end if;
  if t.status <> 'draft' then raise exception 'هذا الجدول ليس مسودة (ربما نُشر مسبقًا)'; end if;
  if _effective_from is null then raise exception 'حدد تاريخ السريان'; end if;
  perform pg_advisory_xact_lock(hashtext('tt:' || t.lineage));
  select id, is_active into latest, latest_active from timetables where lineage=t.lineage and status='published' order by version desc limit 1;
  if latest is distinct from t.based_on then raise exception 'نُشر إصدار أحدث بعد إنشاء هذه النسخة؛ أنشئ نسخة تعديل من الإصدار الأخير'; end if;
  if latest is not null and _effective_from < (select effective_from from timetables where id=latest) then raise exception 'تاريخ السريان قبل سريان الإصدار السابق'; end if;
  if not exists(select 1 from timetable_slots where timetable_id=_id) then raise exception 'الجدول فارغ'; end if;
  update timetables set effective_from=_effective_from where id=_id;
  select * into pr from tt_validate(_id) limit 1;
  if pr.code is not null then raise exception 'لا يمكن النشر: %', pr.message; end if;
  select coalesce(max(version),0)+1 into v from timetables where lineage=t.lineage and status='published';
  perform set_config('rikaz.publishing','on',true);
  update timetables set status='published', version=v, effective_from=_effective_from, published_at=now(), published_by=auth.uid() where id=_id;
  perform set_config('rikaz.publishing','off',true);
  if coalesce(latest_active,false) then
    perform set_config('rikaz.activating','on',true);
    update timetables set is_active=false where id=latest;
    update timetables set is_active=true, activated_at=now(), activated_by=auth.uid() where id=_id;
    perform set_config('rikaz.activating','off',true);
    insert into timetable_activations(school_id, timetable_id, previous_id, activated_by) values (t.school_id, _id, latest, auth.uid());
    for u in select distinct te.user_id from timetable_slots s join teachers te on te.id=s.teacher_id where s.timetable_id=_id
             union select x from (select distinct section_id from timetable_slots where timetable_id=_id) q, lateral _section_users(q.section_id, t.year_id, true) x loop
      perform _notify(u, t.school_id, 'timetable', 'تحديث على الجدول المدرسي', 'يسري من ' || _effective_from, '/app/schedule', 'tt:' || _id);
    end loop;
  end if;
  return v;
end $function$;