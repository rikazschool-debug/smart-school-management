create or replace function pg_temp.patch(_fn regprocedure, _pairs text[]) returns void language plpgsql as $$
declare d text := pg_get_functiondef(_fn); i int; begin
  for i in 1 .. array_length(_pairs, 1) / 2 loop
    if position(_pairs[2*i-1] in d) = 0 then raise exception 'patch anchor not found in %: %', _fn, left(_pairs[2*i-1], 60); end if;
    d := replace(d, _pairs[2*i-1], _pairs[2*i]);
  end loop;
  execute d;
end $$;

select pg_temp.patch('public._evt_check_fields(jsonb)', array[
  'opts jsonb; lbl text; aud text; begin', 'opts jsonb; lbl text; aud text; acc jsonb; begin',
  '''multi'',''checkbox'') then raise exception', '''multi'',''checkbox'',''file'') then raise exception',
  $a$    aud := coalesce(nullif(e->>'audience',''), 'all');$a$,
  $a$    acc := null;
    if k = 'file' then
      if jsonb_typeof(e->'accept') = 'array' then
        select coalesce(jsonb_agg(distinct x), '[]') into acc from jsonb_array_elements_text(e->'accept') x where x in ('pdf','image','doc','sheet');
      end if;
      if acc is null or jsonb_array_length(acc) = 0 then acc := '["pdf","image"]'; end if;
    end if;
    aud := coalesce(nullif(e->>'audience',''), 'all');$a$,
  $a$      'maxlen', case$a$,
  $a$      'accept', acc,
      'max_mb', case when k='file' then greatest(1, least(coalesce(case when coalesce(e->>'max_mb','') ~ '^\d{1,3}$' then (e->>'max_mb')::int end, 5), 20)) end,
      'max_files', case when k='file' then greatest(1, least(coalesce(case when coalesce(e->>'max_files','') ~ '^\d{1,2}$' then (e->>'max_files')::int end, 1), 5)) end,
      'maxlen', case$a$]);

select pg_temp.patch('public._evt_check_answers(jsonb,jsonb,text)', array[
  $a$    if k = 'multi' then$a$,
  $a$    if k = 'file' then
      if v is null or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) = 0 then
        if req then raise exception 'أرفق ملفًا في «%»', lbl; end if;
        continue;
      end if;
      if jsonb_array_length(v) > coalesce((f->>'max_files')::int, 1) then raise exception 'عدد الملفات في «%» أكبر من المسموح (%)', lbl, coalesce((f->>'max_files')::int, 1); end if;
      if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or (x#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'ملف غير صالح في «%»', lbl; end if;
      if (select count(distinct x#>>'{}') from jsonb_array_elements(v) x) <> jsonb_array_length(v) then raise exception 'ملف مكرر في «%»', lbl; end if;
      outp := outp || jsonb_build_object(fid, v);
      continue;
    end if;
    if k = 'multi' then$a$]);

select pg_temp.patch('public.run_file_cleanup()', array[
  $a$('support_pending','org_doc_pending')$a$, $a$('support_pending','org_doc_pending','evt_pending')$a$,
  $a$'feedback','pickup','admin')$a$, $a$'feedback','pickup','admin','evt_item','evt_app')$a$]);

alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','support_pending','pc','maint','hr','notice','org_doc','org_doc_pending','evt_item','evt_app','evt_pending']));

create or replace function public._evt_mimes(_accept jsonb) returns text[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(m), '{}') from (
    select unnest(case x when 'pdf' then array['application/pdf'] when 'image' then array['image/png','image/jpeg','image/webp']
      when 'doc' then array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      when 'sheet' then array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] end) m
    from jsonb_array_elements_text(coalesce(_accept, '["pdf","image"]')) x) s $$;

create or replace function public._evt_file_field(_fields jsonb, _fid text) returns jsonb language sql immutable set search_path to 'public' as $$
  select e from jsonb_array_elements(coalesce(_fields,'[]')) e where e->>'id' = _fid and e->>'kind' = 'file' limit 1 $$;

create or replace function public._evt_file_slot(_item evt_items, _field jsonb, _key text, _user uuid, _name text, _mime text, _size bigint) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare pol record; lim bigint; fid uuid := gen_random_uuid(); p text; n int; nm text := left(btrim(coalesce(_name,'')), 200); begin
  if _field is null then return jsonb_build_object('error', 'invalid', 'message', 'حقل المرفق غير موجود في النموذج'); end if;
  if nm = '' then return jsonb_build_object('error', 'invalid', 'message', 'اسم الملف مطلوب'); end if;
  select * into pol from _file_policy(_item.school_id);
  if not (_mime = any(_evt_mimes(_field->'accept'))) or not (_mime = any(pol.allowed_types)) then
    return jsonb_build_object('error', 'invalid', 'message', 'نوع الملف غير مسموح في «' || (_field->>'label') || '»'); end if;
  lim := least(coalesce((_field->>'max_mb')::int, 5)::bigint * 1048576, pol.max_bytes);
  if _size is null or _size <= 0 or _size > lim then
    return jsonb_build_object('error', 'invalid', 'message', 'حجم الملف يتجاوز الحد المسموح (' || (lim / 1048576) || ' ميغابايت)'); end if;
  select count(*) into n from files where source_type='evt_pending' and source_id=_item.id and category=_key;
  if n >= coalesce((_field->>'max_files')::int, 1) * 3 + 2 then return jsonb_build_object('error', 'rate'); end if;
  p := _item.school_id || '/evt/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by)
  values (fid, _item.school_id, p, nm, _mime, _size, 'evt_pending', _item.id, _key, _user);
  return jsonb_build_object('id', fid, 'path', p);
end $$;

create or replace function public._evt_public_file(_token text, _ip text, _client_key uuid, _field text, _name text, _mime text, _size bigint) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; f evt_forms; fl jsonb; begin
  if not _evt_hit('up:' || coalesce(_ip,'?'), interval '1 hour', 60) then return jsonb_build_object('error', 'rate'); end if;
  select * into i from evt_items where public_token = _token and kind = 'course';
  if i.id is null or not i.link_active or i.audience = 'internal' or _evt_reg_state(i.id) <> 'open' or _client_key is null then return jsonb_build_object('error', 'closed'); end if;
  select * into f from evt_forms where item_id = i.id;
  fl := _evt_file_field(_evt_fields_for((select fields from evt_form_versions where form_id=f.id and version=f.version), 'external'), _field);
  return _evt_file_slot(i, fl, 'k:' || _client_key || ':' || _field, null, _name, _mime, _size);
end $$;

create or replace function public._evt_public_file_track(_code text, _ip text, _field text, _name text, _mime text, _size bigint) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare a evt_applications; i evt_items; begin
  if not _evt_hit('up:' || coalesce(_ip,'?'), interval '1 hour', 60) then return jsonb_build_object('error', 'rate'); end if;
  if coalesce(_code,'') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('error', 'invalid'); end if;
  select * into a from evt_applications where track_hash = encode(extensions.digest(_code, 'sha256'), 'hex');
  if a.id is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into i from evt_items where id = a.item_id;
  if a.status <> 'info_needed' or i.status <> 'published' then return jsonb_build_object('error', 'closed'); end if;
  return _evt_file_slot(i, _evt_file_field(a.fields, _field), 'a:' || a.id || ':' || _field, null, _name, _mime, _size);
end $$;

create or replace function public.evt_file_prepare(_item uuid, _client_key uuid, _field text, _name text, _mime text, _size bigint) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; f evt_forms; r jsonb; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
  select * into i from evt_items where id = _item;
  if i.id is null or i.kind <> 'course' or i.audience = 'external' or _evt_reg_state(i.id) <> 'open' or _client_key is null then raise exception 'التسجيل غير متاح لهذه الدورة'; end if;
  if not (exists(select 1 from students st where st.user_id = auth.uid() and school_org(st.school_id) = i.org_id)
      or exists(select 1 from students st where _evt_guardian_of(st.id, auth.uid()) and school_org(st.school_id) = i.org_id)) then
    raise exception 'التسجيل لنفسك أو لابنك الموثق فقط' using errcode='42501'; end if;
  select * into f from evt_forms where item_id = i.id;
  r := _evt_file_slot(i, _evt_file_field(_evt_fields_for((select fields from evt_form_versions where form_id=f.id and version=f.version), 'internal'), _field),
    'k:' || _client_key || ':' || _field, auth.uid(), _name, _mime, _size);
  if r ? 'error' then raise exception '%', coalesce(r->>'message', 'محاولات كثيرة؛ انتظر قليلًا'); end if;
  return r;
end $$;

create or replace function public._evt_app_files_trg() returns trigger language plpgsql security definer set search_path to 'public', 'storage' as $$
declare fl jsonb; fid text; x text; fr files; lim bigint; obj record; keep uuid[] := '{}'; begin
  for fl in select e from jsonb_array_elements(coalesce(new.fields,'[]')) e where e->>'kind' = 'file' loop
    fid := fl->>'id';
    if jsonb_typeof(new.answers->fid) <> 'array' then continue; end if;
    lim := least(coalesce((fl->>'max_mb')::int, 5)::bigint * 1048576, (select max_bytes from _file_policy(new.school_id)));
    for x in select jsonb_array_elements_text(new.answers->fid) loop
      select * into fr from files where id = x::uuid for update;
      if fr.id is null or not (
          (fr.source_type = 'evt_app' and fr.source_id = new.id and fr.category = fid)
          or (fr.source_type = 'evt_pending' and fr.source_id = new.item_id
              and fr.category in ('k:' || coalesce(new.client_key::text, '-') || ':' || fid, 'a:' || new.id || ':' || fid)
              and (fr.uploaded_by is null or fr.uploaded_by = new.applicant_user))) then
        raise exception 'ملف غير صالح في «%»؛ أعد رفعه', fl->>'label'; end if;
      select o.metadata into obj from storage.objects o where o.bucket_id = 'rikaz-files' and o.name = fr.storage_path;
      if obj is null then raise exception 'لم يكتمل رفع الملف «%»؛ أعد المحاولة', fr.name; end if;
      if coalesce(obj.metadata->>'size','') = '' or (obj.metadata->>'size')::bigint > lim then raise exception 'حجم الملف «%» يتجاوز الحد المسموح', fr.name; end if;
      if fr.source_type = 'evt_pending' then
        update files set source_type = 'evt_app', source_id = new.id, category = fid, size_bytes = (obj.metadata->>'size')::bigint where id = fr.id;
      end if;
      keep := keep || fr.id;
    end loop;
  end loop;
  if tg_op = 'UPDATE' then
    update files set source_type = 'cleanup_due' where source_type = 'evt_app' and source_id = new.id and not (id = any(keep));
  end if;
  return new;
end $$;
drop trigger if exists evt_app_files on public.evt_applications;
create trigger evt_app_files after insert or update of answers on public.evt_applications for each row execute function public._evt_app_files_trg();

create or replace function public._evt_item_file_ok(_item uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select _evt_ok(i.id, 'view')
    or (i.kind <> 'course' and i.status in ('published','completed') and exists(select 1 from _evt_targets(i.id) t join students st on st.id = t.student_id
          where st.user_id = auth.uid() or _evt_guardian_of(st.id, auth.uid())))
    or (i.kind = 'course' and i.status in ('published','completed') and (
          exists(select 1 from evt_applications a where a.item_id = i.id and a.applicant_user = auth.uid())
          or (i.audience in ('internal','both') and exists(select 1 from students st where school_org(st.school_id) = i.org_id and (st.user_id = auth.uid() or _evt_guardian_of(st.id, auth.uid()))))))
    from evt_items i where i.id = _item), false) $$;

create or replace function public._evt_app_file_ok(_app uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select _evt_ok(a.item_id, 'files') or _evt_ok(a.item_id, 'apps') or a.applicant_user = auth.uid()
    or (a.student_id is not null and _evt_guardian_of(a.student_id, auth.uid())) from evt_applications a where a.id = _app), false) $$;

create or replace function public.create_evt_file(_item uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; pol record; fid uuid := gen_random_uuid(); p text; begin
  select * into i from evt_items x where x.id = _item;
  if i.id is null or not _evt_ok(i.id, 'edit') then raise exception 'ليست لديك صلاحية إرفاق ملف هنا' using errcode='42501'; end if;
  if i.status in ('cancelled','archived') then raise exception 'لا يمكن الإرفاق في فعالية ملغاة أو مؤرشفة'; end if;
  if (select count(*) from files f where f.source_type = 'evt_item' and f.source_id = i.id) >= 10 then raise exception 'الحد الأقصى 10 مرفقات'; end if;
  if btrim(coalesce(_name,'')) = '' then raise exception 'اسم الملف مطلوب'; end if;
  select * into pol from _file_policy(i.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size is null or _size <= 0 or _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := i.school_id || '/evt/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, uploaded_by)
    values (fid, i.school_id, p, left(_name,200), _mime, _size, 'evt_item', i.id, auth.uid());
  perform _evt_log(i.id, null, 'file', jsonb_build_object('name', left(_name,200)));
  return query select fid, p;
end $$;

create or replace function public.evt_file_remove(_file uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare f files; begin
  select * into f from files where id = _file and source_type = 'evt_item';
  if f.id is null or not _evt_ok(f.source_id, 'edit') then raise exception 'ليست لديك صلاحية حذف هذا المرفق' using errcode='42501'; end if;
  update files set source_type = 'cleanup_due' where id = f.id;
  perform _evt_log(f.source_id, null, 'file_remove', jsonb_build_object('name', f.name));
end $$;

create or replace function public.evt_files(_item uuid) returns jsonb language plpgsql stable security definer set search_path to 'public', 'storage' as $$
begin
  if not _evt_item_file_ok(_item) then raise exception 'المرفقات غير متاحة' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes, 'storage_path', f.storage_path, 'created_at', f.created_at) order by f.created_at)
    from files f where f.source_type = 'evt_item' and f.source_id = _item
      and exists(select 1 from storage.objects o where o.bucket_id = 'rikaz-files' and o.name = f.storage_path)), '[]');
end $$;

create or replace function public.evt_app_files(_app uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not _evt_app_file_ok(_app) then raise exception 'المرفقات غير متاحة' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'field', f.category, 'name', f.name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes, 'storage_path', f.storage_path) order by f.created_at)
    from files f where f.source_type = 'evt_app' and f.source_id = _app), '[]');
end $$;

create or replace function public._evt_public_files(_token text) returns jsonb language plpgsql stable security definer set search_path to 'public', 'storage' as $$
declare i evt_items; begin
  select * into i from evt_items where public_token = _token and kind = 'course';
  if i.id is null or not i.link_active or i.status = 'draft' or i.audience = 'internal' then return '[]'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size_bytes', f.size_bytes, 'path', f.storage_path) order by f.created_at)
    from files f where f.source_type = 'evt_item' and f.source_id = i.id
      and exists(select 1 from storage.objects o where o.bucket_id = 'rikaz-files' and o.name = f.storage_path)), '[]');
end $$;

create or replace function public._evt_public_app_files(_code text) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare a evt_applications; begin
  if coalesce(_code,'') !~ '^[0-9a-f]{48}$' then return '[]'; end if;
  select * into a from evt_applications where track_hash = encode(extensions.digest(_code, 'sha256'), 'hex');
  if a.id is null then return '[]'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'field', f.category, 'name', f.name, 'size_bytes', f.size_bytes, 'path', f.storage_path) order by f.created_at)
    from files f where f.source_type = 'evt_app' and f.source_id = a.id), '[]');
end $$;

create or replace function public._evt_consent_reset(_item uuid, _why text) returns void language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; prior jsonb; n int; begin
  select * into i from evt_items where id = _item;
  if i.id is null or i.kind <> 'trip' or i.status <> 'published' or not i.consent_required then return; end if;
  select count(*), jsonb_agg(jsonb_build_object('student', (select full_name from students where id = c.student_id), 'decision', c.decision, 'at', c.decided_at))
    into n, prior from evt_consents c where c.item_id = _item;
  if n = 0 then return; end if;
  delete from evt_consents where item_id = _item;
  insert into evt_log(item_id, action, actor, internal, details) values (_item, 'consent_reset', auth.uid(), false, jsonb_build_object('reason', _why, 'count', n, 'prior', prior));
  perform _evt_tell_family(_item, 'تغيّرت تفاصيل الرحلة؛ مطلوب تجديد الموافقة', 'evt-renew:' || _item || ':' || i.rev);
end $$;

create or replace function public._evt_items_material_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.kind = 'trip' and old.status = 'published' and new.status = 'published' and (
      new.location is distinct from old.location or new.mode is distinct from old.mode or new.conditions is distinct from old.conditions
      or new.need_emergency is distinct from old.need_emergency or new.need_medical is distinct from old.need_medical) then
    perform _evt_consent_reset(new.id, 'details');
  end if;
  return new;
end $$;
drop trigger if exists evt_items_material on public.evt_items;
create trigger evt_items_material after update on public.evt_items for each row execute function public._evt_items_material_trg();

create or replace function public._evt_sessions_material_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at and new.location is not distinct from old.location then return new; end if;
  perform _evt_consent_reset(case when tg_op = 'DELETE' then old.item_id else new.item_id end, 'schedule');
  return null;
end $$;
drop trigger if exists evt_sessions_material on public.evt_sessions;
create trigger evt_sessions_material after insert or update or delete on public.evt_sessions for each row execute function public._evt_sessions_material_trg();

create table public.evt_outbox (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.evt_applications(id) on delete cascade,
  item_id uuid not null,
  kind text not null,
  dedupe_key text not null unique,
  phone text not null,
  params jsonb not null default '{}',
  status text not null default 'pending',
  attempts int not null default 0,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
grant all on public.evt_outbox to service_role;
alter table public.evt_outbox enable row level security;
create index evt_outbox_pending on public.evt_outbox(status, updated_at);

create or replace function public._evt_outbox_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare k text; txt text; begin
  if new.applicant_user is not null or new.source <> 'link' or new.phone is null then return new; end if;
  if tg_op = 'INSERT' then k := 'receipt';
  elsif new.status is distinct from old.status then
    k := case new.status when 'info_needed' then 'info' when 'accepted' then 'accept' when 'rejected' then 'reject'
      when 'cancelled' then case when new.decided_at is distinct from old.decided_at then 'cancel' end end;
  end if;
  if k is null then return new; end if;
  txt := case k when 'receipt' then 'استلمنا طلبك وهو قيد المراجعة' when 'info' then 'مطلوب استكمال بيانات: ' || left(coalesce(new.applicant_message,''), 300)
    when 'accept' then 'تم قبول طلبك' when 'reject' then 'نعتذر، لم يُقبل طلبك' else 'أُلغي تسجيلك' end;
  insert into evt_outbox(app_id, item_id, kind, dedupe_key, phone, params)
  values (new.id, new.item_id, k, 'evt:' || new.id || ':' || k || ':' || new.rev, new.phone,
    jsonb_build_object('name', new.participant_name, 'ref', new.ref, 'title', (select title from evt_items where id = new.item_id), 'status', txt))
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
drop trigger if exists evt_outbox_enqueue on public.evt_applications;
create trigger evt_outbox_enqueue after insert or update of status on public.evt_applications for each row execute function public._evt_outbox_trg();

create or replace function public._evt_outbox_claim(_limit int, _ready boolean) returns setof evt_outbox language plpgsql security definer set search_path to 'public' as $$
begin
  return query update evt_outbox o set status = 'sending', attempts = o.attempts + 1, updated_at = now()
  where o.id in (select x.id from evt_outbox x where
      x.status = 'pending' or (_ready and x.status = 'waiting_template')
      or (x.status = 'failed' and x.attempts < 3 and x.updated_at < now() - interval '5 minutes')
      or (x.status = 'sending' and x.updated_at < now() - interval '10 minutes')
    order by x.created_at limit greatest(1, least(_limit, 50)) for update skip locked)
  returning o.*;
end $$;

create or replace function public._evt_outbox_done(_id uuid, _status text, _detail text) returns void language plpgsql security definer set search_path to 'public' as $$
declare o evt_outbox; begin
  if _status not in ('accepted','failed','waiting_template') then raise exception 'bad status'; end if;
  update evt_outbox set status = _status, detail = left(_detail, 300), updated_at = now(), sent_at = case when _status = 'accepted' then now() else sent_at end
  where id = _id returning * into o;
  if o.id is null then return; end if;
  insert into evt_log(item_id, app_id, action, details) values (o.item_id, o.app_id, 'notify',
    jsonb_build_object('kind', o.kind, 'channel', 'whatsapp', 'status', case _status when 'accepted' then 'sent' when 'waiting_template' then 'no_template' else 'failed' end, 'attempt', o.attempts));
end $$;

create or replace function public._evt_outbox_status(_id uuid, _status text, _detail text) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare cur text; rk int; nr int; begin
  select status into cur from evt_outbox where id = _id for update;
  if cur is null then return false; end if;
  rk := case cur when 'accepted' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 else 0 end;
  nr := case _status when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 else 0 end;
  if _status = 'failed' or nr > rk then
    update evt_outbox set status = case when _status = 'failed' then 'undelivered' else _status end, detail = coalesce(left(_detail,300), detail), updated_at = now() where id = _id;
  end if;
  return true;
end $$;

revoke all on function public._evt_public_file(text,text,uuid,text,text,text,bigint), public._evt_public_file_track(text,text,text,text,text,bigint),
  public._evt_public_files(text), public._evt_public_app_files(text), public._evt_outbox_claim(int,boolean), public._evt_outbox_done(uuid,text,text),
  public._evt_outbox_status(uuid,text,text), public._evt_file_slot(evt_items,jsonb,text,uuid,text,text,bigint), public._evt_consent_reset(uuid,text) from public, anon, authenticated;
grant execute on function public._evt_public_file(text,text,uuid,text,text,text,bigint), public._evt_public_file_track(text,text,text,text,text,bigint),
  public._evt_public_files(text), public._evt_public_app_files(text), public._evt_outbox_claim(int,boolean), public._evt_outbox_done(uuid,text,text),
  public._evt_outbox_status(uuid,text,text) to service_role;
revoke all on function public.evt_file_prepare(uuid,uuid,text,text,text,bigint), public.create_evt_file(uuid,text,text,bigint), public.evt_file_remove(uuid),
  public.evt_files(uuid), public.evt_app_files(uuid) from public, anon;
grant execute on function public.evt_file_prepare(uuid,uuid,text,text,text,bigint), public.create_evt_file(uuid,text,text,bigint), public.evt_file_remove(uuid),
  public.evt_files(uuid), public.evt_app_files(uuid) to authenticated;

select pg_temp.patch('public.can_read_file(uuid)', array[
  $a$'support_pending','org_doc_pending'))$a$, $a$'support_pending','org_doc_pending','evt_pending'))$a$,
  $a$    or (f.source_type='hr'$a$, $a$    or (f.source_type='evt_item' and _evt_item_file_ok(f.source_id))
    or (f.source_type='evt_app' and _evt_app_file_ok(f.source_id))
    or (f.source_type='hr'$a$]);