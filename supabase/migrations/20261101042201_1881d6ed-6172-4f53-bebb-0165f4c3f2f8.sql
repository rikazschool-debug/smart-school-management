alter table public.circulars add column if not exists scope text not null default 'school',
  add column if not exists target_schools uuid[] not null default '{}';
alter table public.circulars add constraint circulars_scope_chk check (scope in ('school','branches','org'));
alter table public.circular_versions add column if not exists scope text, add column if not exists target_schools uuid[];
alter table public.circular_recipients add column if not exists school_id uuid references public.schools(id) on delete set null,
  add column if not exists roles text, add column if not exists added_reason text not null default 'publish',
  add column if not exists added_at timestamptz not null default now(), add column if not exists added_by uuid;
update public.circulars set target_schools = array[school_id] where target_schools = '{}';
update public.circular_recipients r set school_id = c.school_id from public.circulars c where c.id=r.circular_id and r.school_id is null;
create index if not exists circulars_targets_gin on public.circulars using gin (target_schools);

-- targets resolved from scope; org scope = all active branches of the org right now
create or replace function public._circ_targets(_org uuid, _scope text, _home uuid, _schools uuid[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select case _scope
    when 'school' then array[_home]
    when 'org' then (select coalesce(array_agg(id order by name), '{}') from schools where org_id=_org and is_active)
    else (select coalesce(array_agg(s.id order by s.name), '{}') from schools s where s.org_id=_org and s.id = any(coalesce(_schools,'{}')))
  end $$;

-- who may create/publish/manage: school scope = owner or principal/vp of that school; wider = org owner only. Platform admins get nothing implicitly.
create or replace function public._can_circ_scope(_org uuid, _scope text, _home uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when _scope='school' then school_org(_home)=_org and (is_org_owner(_org) or has_school_role(_home, array['principal','vice_principal']::app_role[]))
              else is_org_owner(_org) end $$;

create or replace function public.can_manage_circular(_c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from circulars c where c.id=_c and _can_circ_scope(c.org_id, c.scope, c.school_id)) $$;

-- branch principal of a target school (view own-branch report only)
create or replace function public._circ_branch_viewer(_c uuid, _school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from circulars c where c.id=_c and c.status<>'draft' and _school = any(c.target_schools)
    and has_school_role(_school, array['principal','vice_principal']::app_role[])) $$;

create or replace function public.can_read_circular(_c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from circulars c where c.id=_c and (
    _can_circ_scope(c.org_id, c.scope, c.school_id)
    or (c.status<>'draft' and exists(select 1 from circular_recipients r where r.circular_id=c.id and r.user_id=auth.uid()
          and exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=coalesce(r.school_id, c.school_id) and m.is_active)))
    or (c.status<>'draft' and exists(select 1 from unnest(c.target_schools) t where has_school_role(t, array['principal','vice_principal']::app_role[])))
  )) $$;

-- audience across targets; one row per user (first branch by name)
create or replace function public._circ_audience_multi(_targets uuid[], _aud jsonb)
returns table(user_id uuid, school_id uuid) language sql stable security definer set search_path = public as $$
  select distinct on (a) a, t from unnest(_targets) with ordinality as x(t, o), lateral _circular_audience(x.t, _aud) a order by a, x.o $$;

drop function if exists public.save_circular(uuid, uuid, text, text, text, text, boolean, date, jsonb);
create or replace function public.save_circular(_id uuid, _school uuid, _title text, _body text, _publisher text, _priority text, _requires_ack boolean, _ack_due date, _aud jsonb, _scope text default 'school', _schools uuid[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid := _id; c record; org uuid := school_org(_school); sc text := coalesce(_scope,'school'); tg uuid[]; begin
  if sc not in ('school','branches','org') then raise exception 'نطاق غير صالح'; end if;
  if org is null or not _can_circ_scope(org, sc, _school) then raise exception 'لا تملك صلاحية النشر بهذا النطاق'; end if;
  if sc='branches' and exists(select 1 from unnest(coalesce(_schools,'{}')) s where school_org(s) is distinct from org) then raise exception 'فرع خارج المؤسسة'; end if;
  tg := _circ_targets(org, sc, _school, _schools);
  if coalesce(array_length(tg,1),0)=0 then raise exception 'اختر فرعًا واحدًا على الأقل'; end if;
  if length(btrim(coalesce(_title,''))) < 3 then raise exception 'عنوان التعميم مطلوب'; end if;
  if length(coalesce(_body,'')) > 20000 then raise exception 'المحتوى طويل جدًا'; end if;
  if cid is null then
    insert into circulars(org_id, school_id, title, body, publisher_label, priority, requires_ack, ack_due, audience, scope, target_schools, created_by)
      values (org, _school, btrim(_title), coalesce(_body,''), coalesce(nullif(btrim(_publisher),''), case when sc='school' then 'إدارة المدرسة' else 'إدارة المؤسسة' end), coalesce(_priority,'normal'), coalesce(_requires_ack,false), _ack_due, coalesce(_aud,'{}'), sc, tg, auth.uid())
      returning id into cid;
  else
    select * into c from circulars where id=cid for update;
    if c is null or c.org_id<>org or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير موجود'; end if;
    if c.status<>'draft' then raise exception 'التعميم منشور؛ استخدم «إصدار معدّل»'; end if;
    update circulars set school_id=_school, title=btrim(_title), body=coalesce(_body,''), publisher_label=coalesce(nullif(btrim(_publisher),''),c.publisher_label), priority=coalesce(_priority,'normal'), requires_ack=coalesce(_requires_ack,false), ack_due=_ack_due, audience=coalesce(_aud,'{}'), scope=sc, target_schools=tg where id=cid;
  end if;
  return cid;
end $$;

drop function if exists public.preview_circular_audience(uuid, jsonb);
create or replace function public.preview_circular_audience(_school uuid, _aud jsonb, _scope text default 'school', _schools uuid[] default null)
returns table(user_id uuid, full_name text, role text, school_id uuid, school_name text, included boolean, reason text)
language plpgsql stable security definer set search_path = public as $$
declare org uuid := school_org(_school); tg uuid[]; begin
  if org is null or not _can_circ_scope(org, coalesce(_scope,'school'), _school) then raise exception 'غير مصرح'; end if;
  tg := _circ_targets(org, coalesce(_scope,'school'), _school, _schools);
  return query
  with inc as (select * from _circ_audience_multi(tg, _aud))
  select i.user_id, coalesce(p.full_name,'—'),
    (select string_agg(distinct m.role::text, ',') from memberships m where m.user_id=i.user_id and m.school_id=i.school_id and m.is_active),
    i.school_id, s.name, true,
    case when (select count(*) from memberships m where m.user_id=i.user_id and m.school_id = any(tg) and m.is_active) > 1 then 'أكثر من عضوية — يُحسب مرة واحدة' else null end
  from inc i left join profiles p on p.id=i.user_id left join schools s on s.id=i.school_id
  union all
  select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—'), m.role::text, m.school_id, s.name, false, 'عضوية غير مفعّلة'
  from memberships m left join profiles p on p.id=m.user_id left join schools s on s.id=m.school_id
  where m.school_id = any(tg) and not m.is_active and m.role::text in (select jsonb_array_elements_text(coalesce(_aud->'roles','[]')))
    and not exists(select 1 from inc where inc.user_id=m.user_id)
  order by 6 desc, 5, 2;
end $$;

create or replace function public.publish_circular(_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c record; n int; r record; tg uuid[]; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'draft' then raise exception 'التعميم منشور مسبقًا'; end if;
  tg := _circ_targets(c.org_id, c.scope, c.school_id, c.target_schools);
  insert into circular_recipients(circular_id, user_id, first_version, ack_required_version, school_id, roles, added_reason, added_by)
    select _id, a.user_id, 1, case when c.requires_ack then 1 else null end, a.school_id,
      (select string_agg(distinct m.role::text, ',') from memberships m where m.user_id=a.user_id and m.school_id=a.school_id and m.is_active), 'publish', auth.uid()
    from _circ_audience_multi(tg, c.audience) a on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'لا يوجد مستلمون مطابقون للجمهور المحدد'; end if;
  insert into circular_versions(circular_id, version, title, body, requires_ack, ack_due, audience, published_by, scope, target_schools) values (_id, 1, c.title, c.body, c.requires_ack, c.ack_due, c.audience, auth.uid(), c.scope, tg);
  update circulars set status='published', version=1, published_at=now(), target_schools=tg where id=_id;
  for r in select user_id, school_id from circular_recipients where circular_id=_id and user_id<>auth.uid() loop
    perform _notify(r.user_id, r.school_id, 'circular', case when c.requires_ack then 'تعميم يتطلب إقرارك: ' else 'تعميم جديد: ' end || c.title, c.publisher_label, '/app/communication?tab=circulars&circular=' || _id, 'circ:' || _id || ':1');
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_publish', jsonb_build_object('version', 1, 'recipients', n, 'scope', c.scope, 'schools', tg));
  return n;
end $$;

create or replace function public.revise_circular(_id uuid, _title text, _body text, _requires_new_ack boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare c record; v int; r record; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'published' then raise exception 'الإصدار المعدّل للتعاميم المنشورة فقط'; end if;
  v := c.version + 1;
  insert into circular_versions(circular_id, version, title, body, requires_ack, ack_due, audience, published_by, scope, target_schools) values (_id, v, btrim(_title), coalesce(_body,''), c.requires_ack or coalesce(_requires_new_ack,false), c.ack_due, c.audience, auth.uid(), c.scope, c.target_schools);
  update circulars set title=btrim(_title), body=coalesce(_body,''), version=v, requires_ack=c.requires_ack or coalesce(_requires_new_ack,false) where id=_id;
  if coalesce(_requires_new_ack,false) then update circular_recipients set ack_required_version=v where circular_id=_id; end if;
  for r in select x.user_id, x.school_id from circular_recipients x where x.circular_id=_id and x.user_id<>auth.uid()
      and exists(select 1 from memberships m where m.user_id=x.user_id and m.school_id=x.school_id and m.is_active) loop
    perform _notify(r.user_id, r.school_id, 'circular', 'تحديث تعميم (الإصدار ' || v || '): ' || btrim(_title), case when _requires_new_ack then 'يتطلب إقرارًا جديدًا' else 'تغيّر المحتوى؛ إقرارك السابق محفوظ' end, '/app/communication?tab=circulars&circular=' || _id, 'circ:' || _id || ':' || v);
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_revise', jsonb_build_object('version', v, 'new_ack', _requires_new_ack));
  return v;
end $$;

create or replace function public.remind_circular_ack(_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; r record; begin
  select * into c from circulars where id=_id;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) or c.status<>'published' then raise exception 'غير مصرح'; end if;
  for r in select x.user_id, x.school_id from circular_recipients x where x.circular_id=_id and x.ack_required_version is not null
      and exists(select 1 from memberships m where m.user_id=x.user_id and m.school_id=x.school_id and m.is_active)
      and not exists(select 1 from circular_acks a where a.circular_id=_id and a.user_id=x.user_id and a.version>=x.ack_required_version) loop
    perform _notify(r.user_id, r.school_id, 'circular', 'تذكير: إقرار مطلوب على تعميم ' || c.title, null, '/app/communication?tab=circulars&circular=' || _id, 'circ-remind:' || _id || ':' || c.version || ':' || current_date);
    n := n + 1;
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_remind', jsonb_build_object('count', n));
  return n;
end $$;

create or replace function public.archive_circular(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'published' then raise exception 'الأرشفة للتعاميم المنشورة فقط'; end if;
  update circulars set status='archived' where id=_id;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_archive', '{}');
end $$;

-- reopen: back to published, same version, same ack due; no notifications are re-sent
create or replace function public.reopen_circular(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'archived' then raise exception 'إعادة الفتح للمؤرشف فقط'; end if;
  update circulars set status='published' where id=_id;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_reopen', '{}');
end $$;
grant execute on function public.reopen_circular(uuid) to authenticated;

-- explicit, audited addition of recipients after publish
create or replace function public.add_circular_recipients(_id uuid, _users uuid[], _require_ack boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare c record; n int; r record; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status<>'published' then raise exception 'الإضافة للتعاميم المنشورة فقط'; end if;
  insert into circular_recipients(circular_id, user_id, first_version, ack_required_version, school_id, roles, added_reason, added_by)
    select distinct on (m.user_id) _id, m.user_id, c.version, case when c.requires_ack and coalesce(_require_ack,true) then c.version else null end, m.school_id,
      (select string_agg(distinct x.role::text, ',') from memberships x where x.user_id=m.user_id and x.school_id=m.school_id and x.is_active), 'manual', auth.uid()
    from memberships m where m.user_id = any(coalesce(_users,'{}')) and m.is_active and m.school_id = any(c.target_schools)
    order by m.user_id, m.school_id
    on conflict do nothing;
  get diagnostics n = row_count;
  for r in select user_id, school_id from circular_recipients where circular_id=_id and added_reason='manual' and user_id = any(_users) loop
    perform _notify(r.user_id, r.school_id, 'circular', 'تعميم: ' || c.title, c.publisher_label, '/app/communication?tab=circulars&circular=' || _id, 'circ:' || _id || ':' || c.version);
  end loop;
  perform _audit(c.org_id, c.school_id, null, _id, 'circular_add_recipients', jsonb_build_object('added', n, 'requested', coalesce(array_length(_users,1),0), 'ack', _require_ack));
  return n;
end $$;
grant execute on function public.add_circular_recipients(uuid, uuid[], boolean) to authenticated;

drop function if exists public.circular_stats(uuid);
create or replace function public.circular_stats(_id uuid)
returns table(user_id uuid, full_name text, role text, opened_at timestamptz, acked_at timestamptz, acked_version integer, ack_required_version integer, school_id uuid, school_name text, eligible boolean, added_reason text)
language plpgsql stable security definer set search_path = public as $$
declare c record; full_access boolean; begin
  select * into c from circulars where id=_id;
  if c is null then raise exception 'غير مصرح'; end if;
  full_access := _can_circ_scope(c.org_id, c.scope, c.school_id);
  if not full_access and not exists(select 1 from unnest(c.target_schools) t where _circ_branch_viewer(_id, t)) then raise exception 'غير مصرح'; end if;
  return query select r.user_id, coalesce(p.full_name,'—'), r.roles, r.opened_at, a.acked_at, a.version, r.ack_required_version, r.school_id, s.name,
      exists(select 1 from memberships m where m.user_id=r.user_id and m.school_id=r.school_id and m.is_active), r.added_reason
    from circular_recipients r left join profiles p on p.id=r.user_id left join schools s on s.id=r.school_id
    left join lateral (select x.acked_at, x.version from circular_acks x where x.circular_id=_id and x.user_id=r.user_id order by x.version desc limit 1) a on true
    where r.circular_id=_id and (full_access or _circ_branch_viewer(_id, r.school_id)) order by s.name, p.full_name;
end $$;
grant execute on function public.circular_stats(uuid) to authenticated;

create or replace function public.create_circular_file(_circular uuid, _name text, _mime text, _size bigint)
returns table(id uuid, storage_path text) language plpgsql security definer set search_path = public as $$
declare c record; pol record; fid uuid := gen_random_uuid(); path text; begin
  select * into c from circulars where circulars.id=_circular;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) or c.status<>'draft' then raise exception 'المرفقات تضاف للمسودة من الإدارة'; end if;
  select * into pol from _file_policy(c.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size <= 0 or _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح'; end if;
  path := c.school_id || '/c/' || _circular || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id) values (fid, c.school_id, path, left(_name,200), _mime, _size, 'circular', _circular);
  return query select fid, path;
end $$;

grant execute on function public.save_circular(uuid, uuid, text, text, text, text, boolean, date, jsonb, text, uuid[]) to authenticated;
grant execute on function public.preview_circular_audience(uuid, jsonb, text, uuid[]) to authenticated;
grant execute on function public.can_manage_circular(uuid) to authenticated;

drop policy if exists "circ recipients read" on public.circular_recipients;
create policy "circ recipients read" on public.circular_recipients for select to authenticated
  using (user_id = auth.uid() or can_manage_circular(circular_id) or (school_id is not null and _circ_branch_viewer(circular_id, school_id)));
drop policy if exists "circ acks read" on public.circular_acks;
create policy "circ acks read" on public.circular_acks for select to authenticated
  using (user_id = auth.uid() or can_manage_circular(circular_id)
    or exists(select 1 from circular_recipients r where r.circular_id=circular_acks.circular_id and r.user_id=circular_acks.user_id and r.school_id is not null and _circ_branch_viewer(r.circular_id, r.school_id)));