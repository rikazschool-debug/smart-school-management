-- 1) Whole-category meeting invitations + 2) platform switch for the comm hub
alter table public.adm_meetings add column if not exists audience jsonb, add column if not exists audience_fp text;
alter table public.adm_meeting_members add column if not exists via text not null default 'pick', add column if not exists category text;

create or replace function public._adm_member_ok(_org uuid, _school uuid, _scope text, _user uuid, _cat text)
returns boolean language sql stable security definer set search_path=public as $$
  select _adm_invitee_school(_org, _school, _scope, _user) is not null
    or (_cat = 'guardian' and exists(select 1 from memberships ms join schools s on s.id=ms.school_id
         where ms.user_id=_user and ms.is_active and ms.role='guardian'
           and ((_scope='school' and ms.school_id=_school) or (_scope='org' and s.org_id=_org))))
$$;
revoke all on function public._adm_member_ok(uuid,uuid,text,uuid,text) from public, anon, authenticated;

create or replace function public._adm_meet_target(_org uuid, _school uuid, _scope text, _t jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sch uuid[]; cats text[]; deps uuid[]; begin
  if _t is null or coalesce(_t->>'mode','') <> 'all' then return null; end if;
  if _scope = 'school' then sch := array[_school];
  elsif coalesce((_t->>'all_schools')::boolean,false) then select array_agg(id order by name) into sch from schools where org_id=_org and is_active;
  else
    select array_agg(distinct x::uuid) into sch from jsonb_array_elements_text(coalesce(_t->'schools','[]')) x;
    if exists(select 1 from unnest(coalesce(sch,'{}')) z where not exists(select 1 from schools s where s.id=z and s.org_id=_org and s.is_active)) then
      raise exception 'فرع خارج نطاق صلاحيتك' using errcode='42501'; end if;
  end if;
  if coalesce(array_length(sch,1),0)=0 then raise exception 'اختر فرعًا واحدًا على الأقل'; end if;
  select array_agg(distinct x) into cats from jsonb_array_elements_text(coalesce(_t->'categories','[]')) x;
  if coalesce(array_length(cats,1),0)=0 then raise exception 'اختر فئة واحدة على الأقل'; end if;
  if exists(select 1 from unnest(cats) c where c not in ('guardian','teacher','staff')) then raise exception 'فئة غير مسموحة في الاجتماعات (الطلاب لا يُدعون)'; end if;
  select array_agg(distinct x::uuid) into deps from jsonb_array_elements_text(coalesce(_t->'departments','[]')) x;
  if exists(select 1 from unnest(coalesce(deps,'{}')) d where not exists(select 1 from departments z where z.id=d and z.school_id = any(sch))) then raise exception 'قسم غير صالح'; end if;
  return jsonb_build_object('mode','all','schools',to_jsonb(sch),'categories',to_jsonb(cats),'departments',to_jsonb(coalesce(deps,'{}')),'all_schools',coalesce((_t->>'all_schools')::boolean,false) and _scope='org');
end $$;
revoke all on function public._adm_meet_target(uuid,uuid,text,jsonb) from public, anon, authenticated;

create or replace function public._adm_meet_resolve(_t jsonb, _picks uuid[])
returns table(user_id uuid, school_id uuid, cat text) language sql stable security definer set search_path=public as $$
  select p.user_id, p.school_id, p.category from _bc_pool(_t) p where _t is not null and not (p.user_id = any(coalesce(_picks,'{}')))
$$;
revoke all on function public._adm_meet_resolve(jsonb,uuid[]) from public, anon, authenticated;

create or replace function public._adm_meet_fp(_t jsonb, _picks uuid[])
returns text language sql stable security definer set search_path=public as $$
  select md5(coalesce(string_agg(u::text, ',' order by u), '')) from (
    select unnest(coalesce(_picks,'{}')) u union select user_id from _adm_meet_resolve(_t, _picks)) z
$$;
revoke all on function public._adm_meet_fp(jsonb,uuid[]) from public, anon, authenticated;

create or replace function public._adm_meet_summary(_t jsonb, _picks uuid[])
returns jsonb language sql stable security definer set search_path=public as $$
  with r as (select user_id, school_id, cat from _adm_meet_resolve(_t, _picks)),
  a as (select user_id from r union select unnest(coalesce(_picks,'{}')))
  select jsonb_build_object('count', (select count(*) from a), 'picked', coalesce(array_length(_picks,1),0), 'audience', (select count(*) from r),
    'fingerprint', _adm_meet_fp(_t, _picks),
    'by_school', coalesce((select jsonb_object_agg(n,k) from (select s.name n, count(*) k from r join schools s on s.id=r.school_id group by s.name) z), '{}'),
    'by_category', coalesce((select jsonb_object_agg(c,k) from (select cat c, count(*) k from r group by cat) z), '{}'),
    'sample', coalesce((select jsonb_agg(x) from (select jsonb_build_object('name', coalesce(p.full_name,'—'), 'school', s.name, 'category', r.cat) x
       from r left join profiles p on p.id=r.user_id join schools s on s.id=r.school_id order by p.full_name limit 30) q), '[]'))
$$;
revoke all on function public._adm_meet_summary(jsonb,uuid[]) from public, anon, authenticated;

create or replace function public.adm_meeting_audience_preview(_school uuid, _scope text, _t jsonb, _picks uuid[])
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare org uuid := school_org(_school); t jsonb; picks uuid[]; begin
  if auth.uid() is null or _school is null or not _adm_can_organize(_school) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if _scope not in ('school','org') then raise exception 'نطاق غير صالح'; end if;
  if _scope='org' and not (is_org_owner(org) and section_enabled(org,'comm_hub')) then raise exception 'غير مصرح' using errcode='42501'; end if;
  t := _adm_meet_target(org, _school, _scope, _t);
  select coalesce(array_agg(distinct p),'{}') into picks from unnest(coalesce(_picks,'{}')) p where p <> auth.uid() and _adm_invitee_school(org,_school,_scope,p) is not null;
  return _adm_meet_summary(t, picks) || jsonb_build_object('target', t);
end $$;
revoke all on function public.adm_meeting_audience_preview(uuid,text,jsonb,uuid[]) from public, anon;
grant execute on function public.adm_meeting_audience_preview(uuid,text,jsonb,uuid[]) to authenticated;

create or replace function public.adm_meeting_set_audience(_id uuid, _rev int, _t jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m adm_meetings; t jsonb; picks uuid[]; fp text; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or m.organizer <> auth.uid() or m.course_id is not null then raise exception 'تعديل المدعوين لمنظم الاجتماع فقط' using errcode='42501'; end if;
  if m.status <> 'draft' then raise exception 'تُحدد الفئات قبل إرسال الدعوات فقط'; end if;
  if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
  if m.scope='org' and not section_enabled(m.org_id,'comm_hub') then raise exception 'بوابة الإشعارات والاجتماعات معلّقة لهذه المؤسسة' using errcode='42501'; end if;
  t := _adm_meet_target(m.org_id, m.school_id, m.scope, _t);
  select coalesce(array_agg(user_id),'{}') into picks from adm_meeting_members where meeting_id=_id and via='pick';
  delete from adm_meeting_members where meeting_id=_id and via='audience';
  if t is not null then
    insert into adm_meeting_members(meeting_id, user_id, school_id, via, category)
      select _id, r.user_id, r.school_id, 'audience', r.cat from _adm_meet_resolve(t, picks) r where r.user_id <> m.organizer
      on conflict (meeting_id, user_id) do nothing;
    fp := _adm_meet_fp(t, picks);
  end if;
  update adm_meetings set audience=t, audience_fp=fp, updated_at=now() where id=_id;
  perform _adm_log(m.school_id, 'meeting', _id, 'audience', jsonb_build_object('target', t));
  return _adm_meet_summary(t, picks) || jsonb_build_object('target', t);
end $$;
revoke all on function public.adm_meeting_set_audience(uuid,int,jsonb) from public, anon;
grant execute on function public.adm_meeting_set_audience(uuid,int,jsonb) to authenticated;

create or replace function public.adm_meeting_audience_get(_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m adm_meetings; picks uuid[]; begin
  select * into m from adm_meetings where id=_id;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'غير مصرح' using errcode='42501'; end if;
  if m.audience is null then return null; end if;
  select coalesce(array_agg(user_id),'{}') into picks from adm_meeting_members where meeting_id=_id and via='pick';
  return _adm_meet_summary(m.audience, picks) || jsonb_build_object('target', m.audience, 'changed', _adm_meet_fp(m.audience, picks) is distinct from m.audience_fp);
end $$;
revoke all on function public.adm_meeting_audience_get(uuid) from public, anon;
grant execute on function public.adm_meeting_audience_get(uuid) to authenticated;

create or replace function public.adm_meeting_send(_id uuid, _rev integer)
returns integer language plpgsql security definer set search_path=public as $$
declare m adm_meetings; x record; picks uuid[]; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or m.organizer <> auth.uid() then raise exception 'إرسال الدعوة لمنظم الاجتماع فقط'; end if;
  if m.status = 'scheduled' and m.rev = coalesce(_rev,-1) + 1 then return m.rev; end if;
  if m.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الاجتماع من نافذة أخرى؛ أعد التحميل'; end if;
  if m.status <> 'draft' then raise exception 'أُرسلت الدعوة مسبقًا'; end if;
  if m.scope='org' and not section_enabled(m.org_id,'comm_hub') then raise exception 'بوابة الإشعارات والاجتماعات معلّقة لهذه المؤسسة' using errcode='42501'; end if;
  if m.audience is not null then
    select coalesce(array_agg(user_id),'{}') into picks from adm_meeting_members where meeting_id=_id and via='pick';
    if _adm_meet_fp(m.audience, picks) is distinct from m.audience_fp then raise exception 'تغيّرت قائمة المدعوين منذ المعاينة؛ أعد المعاينة ثم أرسل'; end if;
  end if;
  if not exists(select 1 from adm_meeting_members where meeting_id=_id) then raise exception 'أضف مشاركًا واحدًا على الأقل'; end if;
  update adm_meetings set status='scheduled', sent_at=now(), rev=rev + 1, updated_at=now() where id=_id;
  for x in select user_id, school_id from adm_meeting_members where meeting_id=_id loop
    perform _notify(x.user_id, coalesce(x.school_id, m.school_id), 'admin', 'دعوة لاجتماع' || case when m.mode='virtual' then ' افتراضي' else '' end || ': ' || m.title,
      to_char(m.starts_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':inv:' || x.user_id);
  end loop;
  perform _adm_log(m.school_id, 'meeting', _id, 'invited', '{}');
  return m.rev + 1;
end $$;

create or replace function public._adm_live_role(_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select case
    when m.course_id is not null then case
      when m.organizer=auth.uid() and _vc_teacher(m.course_id, auth.uid()) then 'host'
      when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned) and _vc_student(m.course_id, auth.uid()) then 'member' end
    when m.scope='org' and not section_enabled(m.org_id,'comm_hub') then null
    when m.organizer=auth.uid() and (is_org_owner(m.org_id) or has_school_role(m.school_id, array['principal','vice_principal','dept_head']::app_role[]) or _adm_hub(m.school_id,'start')) then 'host'
    when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned
      and _adm_member_ok(m.org_id, m.school_id, m.scope, auth.uid(), x.category)) then 'member'
  end from adm_meetings m where m.id=_id
$$;

create or replace function public._adm_live_cut_suspend_trg()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.is_active and not new.is_active then
    insert into adm_meeting_revocations(meeting_id, user_id, uid, kind)
      select p.meeting_id, p.user_id, p.uid, 'suspend' from adm_meeting_presence p join adm_meetings m on m.id=p.meeting_id
      where p.user_id=new.user_id and m.live_status='live' and p.left_at is null and m.org_id = coalesce(new.org_id, school_org(new.school_id))
        and not _adm_member_ok(m.org_id, m.school_id, m.scope, new.user_id, (select x.category from adm_meeting_members x where x.meeting_id=m.id and x.user_id=new.user_id))
        and not (m.organizer=new.user_id and exists(select 1 from memberships z where z.user_id=new.user_id and z.is_active and ((z.role='org_owner' and z.org_id=m.org_id) or (z.school_id=m.school_id and z.role in ('principal','vice_principal','dept_head')))))
        and not exists(select 1 from adm_meeting_revocations r where r.meeting_id=p.meeting_id and r.user_id=p.user_id and r.kind='suspend' and r.done_at is null);
    update adm_meetings m set screen_sharer=null, screen_since=null where m.screen_sharer=new.user_id and m.live_status='live'
      and not _adm_member_ok(m.org_id, m.school_id, m.scope, new.user_id, (select x.category from adm_meeting_members x where x.meeting_id=m.id and x.user_id=new.user_id));
  end if;
  return new;
end $$;

create or replace function public.platform_set_section(_org uuid, _section text, _enabled boolean, _reason text)
returns void language plpgsql security definer set search_path=public as $$
declare prev boolean;
begin
  if not is_platform_admin() then raise exception 'إتاحة الأقسام لمالك المنصة فقط' using errcode='42501'; end if;
  if _section not in ('school_admin','finance','hr','operations','admissions','comm_hub') then raise exception 'قسم غير معروف'; end if;
  if length(trim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  prev := section_enabled(_org, _section);
  if prev = _enabled then return; end if;
  insert into org_sections(org_id, section, enabled, reason, changed_by, changed_at)
    values (_org, _section, _enabled, trim(_reason), auth.uid(), now())
    on conflict (org_id, section) do update set enabled=excluded.enabled, reason=excluded.reason, changed_by=excluded.changed_by, changed_at=now();
  insert into org_section_log(org_id, section, before_enabled, after_enabled, reason, actor)
    values (_org, _section, prev, _enabled, trim(_reason), auth.uid());
end $$;

create or replace function public.org_sections_get(_org uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_platform_admin() or exists(select 1 from memberships where user_id=auth.uid() and org_id=_org and is_active)) then
    raise exception 'forbidden' using errcode='42501'; end if;
  return (select jsonb_agg(jsonb_build_object('section', s,
      'enabled', section_enabled(_org, s),
      'reason', (select reason from org_sections where org_id=_org and section=s),
      'changed_at', (select changed_at from org_sections where org_id=_org and section=s),
      'changed_by_name', (select _adm_name(changed_by) from org_sections where org_id=_org and section=s)))
    from unnest(array['school_admin','finance','hr','admissions','comm_hub']) s);
end $$;

create or replace function public._bc_ok(_school uuid, _action text)
returns boolean language sql stable security definer set search_path=public as $$
  select _school is not null and exists(select 1 from schools where id=_school and is_active)
    and section_enabled(school_org(_school),'comm_hub')
    and (_perm_owner(auth.uid(), school_org(_school)) or _perm_allows_user(_school, auth.uid(), 'notices', _action))
$$;

create or replace function public._can_circ_scope(_org uuid, _scope text, _home uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select case when _scope='school' then school_org(_home)=_org and perm_allows(_home,'circulars','publish') else is_org_owner(_org) and section_enabled(_org,'comm_hub') end
$$;

create or replace function public.adm_meeting_save(_id uuid, _school uuid, _d jsonb, _rev integer, _client uuid)
returns jsonb language plpgsql security definer set search_path=public as $fn$
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
  if sc = 'org' and not section_enabled(org,'comm_hub') then raise exception 'بوابة الإشعارات والاجتماعات معلّقة لهذه المؤسسة' using errcode='42501'; end if;
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
  select coalesce(array_agg(user_id), '{}') into old from adm_meeting_members where meeting_id=nid and via='pick';
  delete from adm_meeting_members where meeting_id=nid and via='pick' and not (user_id = any(mem));
  foreach p in array mem loop
    bs := _adm_invitee_school(org, _school, sc, p);
    insert into adm_meeting_members(meeting_id, user_id, school_id) values (nid, p, bs) on conflict (meeting_id, user_id) do update set school_id=excluded.school_id, via='pick', category=null;
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
end $fn$;