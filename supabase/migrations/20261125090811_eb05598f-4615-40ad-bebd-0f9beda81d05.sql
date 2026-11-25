
create index api_inbox_key on public.api_inbox(key_id);
create index api_key_changes_org on public.api_key_changes(org_id);
create index api_webhooks_key on public.api_webhooks(key_id);

-- explicit deny for app users: these tables are reached only through the api_* functions
create policy "no direct access" on public.api_keys as restrictive for all to authenticated, anon using (false) with check (false);
create policy "no direct access" on public.api_key_changes as restrictive for all to authenticated, anon using (false) with check (false);
create policy "no direct access" on public.api_requests as restrictive for all to authenticated, anon using (false) with check (false);
create policy "no direct access" on public.api_idem as restrictive for all to authenticated, anon using (false) with check (false);
create policy "no direct access" on public.api_inbox as restrictive for all to authenticated, anon using (false) with check (false);
create policy "no direct access" on public.api_webhooks as restrictive for all to authenticated, anon using (false) with check (false);
create policy "no direct access" on public.api_deliveries as restrictive for all to authenticated, anon using (false) with check (false);

create or replace function public._api_err(_status int, _code text, _msg text) returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('status', _status, 'body', jsonb_build_object('error', jsonb_build_object('code', _code, 'message', _msg)))
$$;
create or replace function public._api_num(_t text) returns numeric language plpgsql immutable set search_path = public as $$
begin return _t::numeric; exception when others then return null; end $$;

-- Every exposed record, already limited to the key's organization/schools/years/sections/students.
create or replace function public._api_rows(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(v) from (select s.id, s.name, s.code, s.city, s.stage_type, s.student_gender, s.address, s.phone, s.is_active, s.updated_at
    from schools s where _res = 'schools' and s.id = any(_sch) and (_id is null or s.id = _id)) v
  union all
  select to_jsonb(v) from (select y.id, y.school_id, y.name, y.start_date, y.end_date, y.is_current, y.updated_at
    from academic_years y where _res = 'academic_years' and y.school_id = any(_sch) and (_yrs is null or y.id = any(_yrs)) and (_id is null or y.id = _id)) v
  union all
  select to_jsonb(v) from (select st.id, st.school_id, st.name, st.sort_order, st.updated_at
    from stages st where _res = 'stages' and st.school_id = any(_sch) and (_stages is null or st.id = any(_stages)) and (_id is null or st.id = _id)) v
  union all
  select to_jsonb(v) from (select g.id, g.school_id, g.stage_id, g.name, g.sort_order, g.updated_at
    from grades g where _res = 'grades' and g.school_id = any(_sch) and (_stages is null or g.stage_id = any(_stages)) and (_grades is null or g.id = any(_grades)) and (_id is null or g.id = _id)) v
  union all
  select to_jsonb(v) from (select sec.id, sec.school_id, g.stage_id, sec.grade_id, sec.year_id, sec.term_id, sec.name, sec.capacity, sec.updated_at
    from sections sec join grades g on g.id = sec.grade_id
    where _res = 'sections' and sec.school_id = any(_sch) and (_secs is null or sec.id = any(_secs)) and (_id is null or sec.id = _id)) v
  union all
  select to_jsonb(v) from (select s.id, s.school_id, s.full_name, s.display_name, s.gender, s.status, g.stage_id, sec.grade_id, e.section_id, e.year_id,
      s.birth_date, s.national_id, s.email, s.csmart_no, s.updated_at
    from students s
    left join lateral (select e.section_id, e.year_id from enrollments e where e.student_id = s.id and e.status = 'active' order by e.start_date desc nulls last limit 1) e on true
    left join sections sec on sec.id = e.section_id left join grades g on g.id = sec.grade_id
    where _res = 'students' and s.school_id = any(_sch) and (_stu is null or s.id = any(_stu)) and (_id is null or s.id = _id)) v
  union all
  select to_jsonb(v) from (select gd.id, gd.school_id, gd.full_name, gd.display_name,
      (select coalesce(array_agg(sg.student_id), '{}') from student_guardians sg where sg.guardian_id = gd.id and (_stu is null or sg.student_id = any(_stu))) student_ids,
      gd.phone, gd.email, gd.national_id, gd.updated_at
    from guardians gd where _res = 'guardians' and gd.school_id = any(_sch)
      and (_stu is null or exists (select 1 from student_guardians sg where sg.guardian_id = gd.id and sg.student_id = any(_stu))) and (_id is null or gd.id = _id)) v
  union all
  select to_jsonb(v) from (select t.id, t.school_id, t.full_name, t.display_name, t.specialization, t.status, t.phone, t.email, t.national_id, t.updated_at
    from teachers t where _res = 'staff' and t.school_id = any(_sch) and (_id is null or t.id = _id)) v
  union all
  select to_jsonb(v) from (select a.id, a.school_id, a.student_id, a.date, a.status, a.late_minutes, a.first_in_at, a.source, a.updated_at
    from attendance_days a where _res = 'attendance' and a.school_id = any(_sch) and (_stu is null or a.student_id = any(_stu)) and (_id is null or a.id = _id)) v
  union all
  select to_jsonb(v) from (select tr.id, tr.school_id, tr.student_id, tr.year_id, tr.term, tr.transport_type, tr.bus_id, tr.starts, tr.active, tr.exempt, tr.updated_at
    from sf_transport tr where _res = 'transport' and tr.school_id = any(_sch) and (_stu is null or tr.student_id = any(_stu)) and (_yrs is null or tr.year_id = any(_yrs)) and (_id is null or tr.id = _id)) v
  union all
  select to_jsonb(v) from (select t.id, t.school_id, t.year_id, t.term_id, t.name, t.version, t.effective_from, t.is_active, t.published_at, t.updated_at
    from timetables t where _res = 'timetables' and t.status = 'published' and t.school_id = any(_sch) and (_yrs is null or t.year_id = any(_yrs))
      and (_terms is null or t.term_id is null or t.term_id = any(_terms)) and (_id is null or t.id = _id)) v
  union all
  select to_jsonb(v) from (select ts.id, ts.school_id, ts.timetable_id, ts.day, ts.period_id, ts.course_id, ts.section_id, ts.teacher_id, ts.updated_at
    from timetable_slots ts join timetables t on t.id = ts.timetable_id and t.status = 'published'
    where _res = 'timetable_slots' and ts.school_id = any(_sch) and (_secs is null or ts.section_id = any(_secs)) and (_yrs is null or t.year_id = any(_yrs)) and (_id is null or ts.id = _id)) v
  union all
  select to_jsonb(v) from (select h.id, h.school_id, h.section_id, h.year_id, h.term_id, h.kind, h.title, h.available_from, h.due_at, h.max_score, h.status, h.updated_at
    from homework h where _res = 'homework' and h.status in ('published', 'closed') and h.school_id = any(_sch) and (_secs is null or h.section_id = any(_secs))
      and (_yrs is null or h.year_id = any(_yrs)) and (_terms is null or h.term_id is null or h.term_id = any(_terms)) and (_id is null or h.id = _id)) v
  union all
  select to_jsonb(v) from (select a.id, a.ref, a.school_id,
      case when a.source_key like 'api:' || _key || ':%' then substr(a.source_key, length('api:' || _key || ':') + 1) end external_id,
      a.student_name, a.guardian_name, a.guardian_phone, a.email, a.stage, a.grade, a.notes, a.status, a.decision, a.rev, a.submitted_at, a.updated_at
    from ad_applications a where _res = 'admissions' and a.org_id = _org and (a.school_id = any(_sch) or (a.school_id is null and _all)) and (_id is null or a.id = _id)) v
  union all
  select to_jsonb(v) from (select n.id, n.ref, n.title, n.body, n.sent_at, n.updated_at
    from bc_notices n where _res = 'notices' and _all and n.org_id = _org and n.status = 'sent' and (_id is null or n.id = _id)) v
  union all
  select to_jsonb(v) from (select e.id, e.school_id, e.kind, e.title, e.description, e.category, e.location, e.mode, e.audience, e.reg_opens, e.reg_closes, e.capacity, e.status, e.published_at, e.updated_at
    from evt_items e where _res = 'events' and e.status in ('published', 'completed') and e.org_id = _org and (e.school_id = any(_sch) or (e.school_id is null and _all)) and (_id is null or e.id = _id)) v
  union all
  select to_jsonb(v) from (select o.id, o.school_id, o.student_id, o.year_id, o.term, o.kind, o.amount, (_sf_balance(o.id)->>'remaining')::numeric remaining, o.status, o.due_date, o.updated_at
    from sf_obligations o where _res = 'fin_obligations' and o.school_id = any(_sch) and (_stu is null or o.student_id = any(_stu)) and (_yrs is null or o.year_id = any(_yrs)) and (_id is null or o.id = _id)) v
  union all
  select to_jsonb(v) from (select c.id, c.school_id, c.student_id, c.amount, c.method, c.paid_at, c.ref, c.payer, c.notes, c.status,
      (select r.number from sf_receipts r where r.collection_id = c.id order by r.issued_at limit 1) receipt_number, c.created_at, c.updated_at
    from sf_collections c where _res = 'payments' and c.school_id = any(_sch) and (_stu is null or c.student_id = any(_stu)) and (_id is null or c.id = _id)) v
  union all
  select to_jsonb(v) from (select i.id, i.school_id, i.student_id, i.amount, i.status, i.result->>'collection_id' collection_id, i.reason, i.created_at, i.decided_at
    from api_inbox i where _res = 'payment_requests' and i.key_id = _key and i.resource = 'payments' and (_id is null or i.id = _id)) v
  union all
  select to_jsonb(v) from (select s.id, s.id school_id, s.name school_name,
      (select count(*) from students x where x.school_id = s.id and x.status = 'active') students_active,
      (select count(*) from teachers t where t.school_id = s.id and t.status = 'active') staff,
      (select count(*) from sections sc where sc.school_id = s.id and (_yrs is null or sc.year_id = any(_yrs))) sections,
      school_today() attendance_date,
      (select count(*) from attendance_days a where a.school_id = s.id and a.date = school_today() and a.status = 'present') present,
      (select count(*) from attendance_days a where a.school_id = s.id and a.date = school_today() and a.status = 'late') late,
      (select count(*) from attendance_days a where a.school_id = s.id and a.date = school_today() and a.status in ('absent', 'in_school_absent')) absent
    from schools s where _res = 'reports' and s.id = any(_sch) and (_id is null or s.id = _id)) v
$$;

-- Owner alert, at most once per key, reason and hour.
create or replace function public._api_alert(_org uuid, _key uuid, _code text, _title text, _body text) returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select distinct user_id from memberships where org_id = _org and role = 'org_owner' and is_active loop
    perform _notify(u, null, 'integrations', _title, left(_body, 400), '/app/integrations?tab=security',
      'api:' || _code || ':' || coalesce(_key::text, '-') || ':' || to_char(now() at time zone 'Asia/Riyadh', 'YYYYMMDDHH24') || ':' || u);
  end loop;
exception when others then null;
end $$;

-- Writes allowed through the API; each one follows the same business rules as the screens.
create or replace function public._api_write(k public.api_keys, _res text, _r jsonb, _sc jsonb, _f text[], _sch uuid[], _all boolean, _stu uuid[], _id uuid, _op text, _body jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fld jsonb; allowed text[]; reqd text[]; wf text[]; x text; bad text[];
  a ad_applications; st ad_settings; sch uuid; dflt uuid; owner uuid; skey text; ext text; sname text; phone text; gname text; em text; stg text; grd text; nts text;
  changed text[] := '{}'; v int; stu students; meth text; paid date; allocs jsonb; it jsonb; ob sf_obligations; amt numeric; total numeric := 0; n int; inbox uuid; one jsonb;
begin
  wf := array(select jsonb_array_elements_text(coalesce(_sc->'write_fields', '[]')));
  if _op = 'create' then
    allowed := array(select f->>'k' from jsonb_array_elements(_r->'fields') f where coalesce((f->>'c')::boolean, false));
    reqd := array(select f->>'k' from jsonb_array_elements(_r->'fields') f where coalesce((f->>'r')::boolean, false));
  else
    allowed := array(select f->>'k' from jsonb_array_elements(_r->'fields') f where coalesce((f->>'u')::boolean, false)) || array['rev'];
    reqd := '{}';
  end if;
  if jsonb_typeof(_body) <> 'object' then return _api_err(400, 'bad_body', 'جسم الطلب يجب أن يكون كائن JSON'); end if;
  bad := array(select key from jsonb_object_keys(_body) key where not exists (select 1 from jsonb_array_elements(_r->'fields') f where f->>'k' = key) and key <> 'rev');
  if cardinality(bad) > 0 then return _api_err(422, 'unknown_field', 'حقول غير معروفة: ' || array_to_string(bad, '، ')); end if;
  bad := array(select key from jsonb_object_keys(_body) key where not key = any(allowed));
  if cardinality(bad) > 0 then return _api_err(403, 'protected_field', 'حقول محمية لا يمكن إرسالها: ' || array_to_string(bad, '، ')); end if;
  bad := array(select key from jsonb_object_keys(_body) key where key <> 'rev' and not key = any(reqd) and not key = any(wf));
  if cardinality(bad) > 0 then return _api_err(403, 'forbidden_write_field', 'لا يملك المفتاح صلاحية كتابة: ' || array_to_string(bad, '، ')); end if;
  bad := array(select y from unnest(reqd) y where not _body ? y or nullif(btrim(coalesce(_body->>y, '')), '') is null);
  if cardinality(bad) > 0 then return _api_err(422, 'missing_field', 'حقول مطلوبة: ' || array_to_string(bad, '، ')); end if;

  if _res = 'admissions' and _op = 'create' then
    ext := btrim(_body->>'external_id'); sname := btrim(_body->>'student_name'); phone := btrim(_body->>'guardian_phone');
    gname := nullif(btrim(coalesce(_body->>'guardian_name', '')), ''); em := nullif(btrim(coalesce(_body->>'email', '')), '');
    stg := nullif(btrim(coalesce(_body->>'stage', '')), ''); grd := nullif(btrim(coalesce(_body->>'grade', '')), ''); nts := nullif(btrim(coalesce(_body->>'notes', '')), '');
    if ext !~ '^[A-Za-z0-9_.:-]{1,80}$' then return _api_err(422, 'invalid_field', 'external_id: حروف إنجليزية وأرقام و _ . : - حتى 80 خانة'); end if;
    if length(sname) not between 2 and 120 then return _api_err(422, 'invalid_field', 'student_name: من 2 إلى 120 حرفًا'); end if;
    if length(phone) not between 5 and 40 then return _api_err(422, 'invalid_field', 'guardian_phone: من 5 إلى 40 خانة'); end if;
    if length(coalesce(gname, '')) > 120 or length(coalesce(stg, '')) > 60 or length(coalesce(grd, '')) > 60 or length(coalesce(nts, '')) > 2000 then return _api_err(422, 'invalid_field', 'أحد الحقول أطول من المسموح'); end if;
    if em is not null and (length(em) > 160 or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then return _api_err(422, 'invalid_field', 'email: صيغة بريد غير صحيحة'); end if;
    if _body ? 'school_id' then
      sch := _api_uuid(_body->>'school_id');
      if sch is null or not sch = any(_sch) then return _api_err(403, 'out_of_scope', 'المدرسة خارج نطاق المفتاح'); end if;
    elsif not _all and cardinality(_sch) = 1 then sch := _sch[1];
    elsif not _all then return _api_err(422, 'school_required', 'school_id مطلوب لهذا المفتاح');
    end if;
    if not section_enabled(k.org_id, 'admissions') then return _api_err(503, 'section_paused', 'قسم القبول معلّق حاليًا'); end if;
    skey := 'api:' || k.id || ':' || ext;
    select * into a from ad_applications where org_id = k.org_id and source_key = skey;
    if a.id is not null then
      select x2 into one from _api_rows('admissions', k.org_id, _sch, _all, null, null, null, null, null, null, a.id, k.id) x2;
      return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', _api_pick(one, _f), 'duplicate', true), 'rid', a.id, 'sid', a.school_id);
    end if;
    select * into st from ad_settings where org_id = k.org_id;
    if sch is not null then
      dflt := _api_uuid(st.defaults->>sch::text);
      if dflt is not null and not (_ad_ok(dflt, sch, 'view') or _ad_ok(dflt, sch, 'view_branch')) then dflt := null; end if;
    end if;
    insert into ad_applications(org_id, school_id, ref, source, source_key, student_name, guardian_name, guardian_phone, phone_raw, email, stage, grade, year_label, notes, assignee, submitted_at)
    values (k.org_id, sch, _ad_new_ref(k.org_id), 'api', skey, sname, gname, _ad_phone(phone), left(phone, 40), em, stg, grd, st.year_label, nts, dflt, now())
    returning * into a;
    insert into ad_events(app_id, actor, action, body) values (a.id, null, 'create', 'ورد عبر التكامل (' || k.system_name || ' — ' || k.name || ')' || case when sch is null then ' — بانتظار تحديد الفرع' else '' end);
    if dflt is not null then perform _ad_notify(a, dflt, 'طلب قبول جديد مسند إليك', 'ad-assign:' || a.id || ':' || dflt); end if;
    if sch is null then
      for owner in select user_id from memberships where org_id = k.org_id and role = 'org_owner' and is_active loop
        perform _notify(owner, null, 'admissions', 'طلب قبول بانتظار تحديد الفرع', a.ref || ' — ' || k.system_name, '/app/admissions?r=' || a.id, 'ad-pending:' || a.id || ':' || owner);
      end loop;
    end if;
    select x2 into one from _api_rows('admissions', k.org_id, _sch, _all, null, null, null, null, null, null, a.id, k.id) x2;
    return jsonb_build_object('status', 201, 'body', jsonb_build_object('data', _api_pick(one, _f)), 'rid', a.id, 'sid', a.school_id, 'changes', jsonb_build_object('created', a.id));
  end if;

  if _res = 'admissions' and _op = 'update' then
    select * into a from ad_applications where id = _id and org_id = k.org_id and (school_id = any(_sch) or (school_id is null and _all)) for update;
    if a.id is null then return _api_err(404, 'not_found', 'السجل غير موجود أو خارج نطاق المفتاح'); end if;
    if a.decision is not null or a.student_id is not null then return _api_err(409, 'record_locked', 'اتُّخذ قرار في الطلب؛ لا يمكن تعديله من النظام الخارجي'); end if;
    if k.master = 'rikaz' or k.on_conflict = 'reject' then
      v := _api_int(_body->>'rev');
      if v is null then return _api_err(422, 'rev_required', 'أرسل rev من آخر قراءة للسجل'); end if;
      if v <> a.rev then return _api_err(409, 'stale_record', 'تغيّر السجل في ركاز منذ آخر قراءة؛ أعد القراءة ثم أرسل التعديل'); end if;
    end if;
    if _body ? 'guardian_name' then gname := nullif(btrim(coalesce(_body->>'guardian_name', '')), ''); if length(coalesce(gname, '')) > 120 then return _api_err(422, 'invalid_field', 'guardian_name أطول من المسموح'); end if; changed := changed || 'guardian_name'; end if;
    if _body ? 'email' then em := nullif(btrim(coalesce(_body->>'email', '')), ''); if em is not null and (length(em) > 160 or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then return _api_err(422, 'invalid_field', 'email: صيغة بريد غير صحيحة'); end if; changed := changed || 'email'; end if;
    if _body ? 'notes' then nts := nullif(btrim(coalesce(_body->>'notes', '')), ''); if length(coalesce(nts, '')) > 2000 then return _api_err(422, 'invalid_field', 'notes أطول من المسموح'); end if; changed := changed || 'notes'; end if;
    if cardinality(changed) = 0 then return _api_err(422, 'nothing_to_update', 'لا توجد حقول للتعديل'); end if;
    update ad_applications set
      guardian_name = case when 'guardian_name' = any(changed) then gname else guardian_name end,
      email = case when 'email' = any(changed) then em else email end,
      notes = case when 'notes' = any(changed) then nts else notes end,
      rev = rev + 1, updated_at = now()
    where id = a.id returning * into a;
    insert into ad_events(app_id, actor, action, body) values (a.id, null, 'edit', 'تحديث عبر التكامل (' || k.system_name || '): ' || array_to_string(changed, '، '));
    select x2 into one from _api_rows('admissions', k.org_id, _sch, _all, null, null, null, null, null, null, a.id, k.id) x2;
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', _api_pick(one, _f)), 'rid', a.id, 'sid', a.school_id, 'changes', jsonb_build_object('updated', a.id, 'fields', to_jsonb(changed)));
  end if;

  if _res = 'payments' and _op = 'create' then
    select * into stu from students where id = _api_uuid(_body->>'student_id') and school_id = any(_sch) and (_stu is null or id = any(_stu));
    if stu.id is null then return _api_err(403, 'out_of_scope', 'الطالب غير موجود أو خارج نطاق المفتاح'); end if;
    meth := _body->>'method';
    if meth not in ('cash', 'bank', 'mada', 'credit_card', 'electronic', 'other') then return _api_err(422, 'invalid_field', 'method: cash|bank|mada|credit_card|electronic|other'); end if;
    paid := _api_date(_body->>'paid_at');
    if paid is null or paid > school_today() or paid < school_today() - 365 then return _api_err(422, 'invalid_field', 'paid_at: تاريخ صحيح خلال السنة الماضية وليس في المستقبل'); end if;
    if length(coalesce(_body->>'ref', '')) > 60 or length(coalesce(_body->>'payer', '')) > 120 or length(coalesce(_body->>'notes', '')) > 500 then return _api_err(422, 'invalid_field', 'أحد الحقول أطول من المسموح'); end if;
    allocs := _body->'allocations';
    if jsonb_typeof(allocs) <> 'array' or jsonb_array_length(allocs) not between 1 and 4 then return _api_err(422, 'invalid_field', 'allocations: من 1 إلى 4 مستحقات'); end if;
    select count(distinct y->>'obligation_id') into n from jsonb_array_elements(allocs) y;
    if n <> jsonb_array_length(allocs) then return _api_err(422, 'invalid_field', 'allocations: مستحق مكرر'); end if;
    for it in select y from jsonb_array_elements(allocs) y loop
      select * into ob from sf_obligations where id = _api_uuid(it->>'obligation_id') and student_id = stu.id;
      amt := _api_num(it->>'amount');
      if ob.id is null or ob.status <> 'pending' then return _api_err(422, 'invalid_field', 'allocations: مستحق غير موجود لهذا الطالب أو غير قائم'); end if;
      if amt is null or amt <= 0 or amt <> round(amt, 2) or amt > (_sf_balance(ob.id)->>'remaining')::numeric then return _api_err(422, 'invalid_amount', 'allocations: المبلغ غير صالح أو أكبر من المتبقي'); end if;
      total := total + amt;
    end loop;
    insert into api_inbox(org_id, key_id, resource, school_id, student_id, amount, payload)
    values (k.org_id, k.id, 'payments', stu.school_id, stu.id, total, jsonb_build_object('method', meth, 'paid_at', paid, 'ref', nullif(_body->>'ref', ''), 'payer', nullif(_body->>'payer', ''), 'notes', nullif(_body->>'notes', ''),
      'allocations', (select jsonb_agg(jsonb_build_object('obligation_id', y->>'obligation_id', 'amount', _api_num(y->>'amount'))) from jsonb_array_elements(allocs) y)))
    returning id into inbox;
    for owner in select user_id from memberships where org_id = k.org_id and role = 'org_owner' and is_active loop
      perform _notify(owner, null, 'integrations', 'عملية سداد واردة بانتظار الاعتماد', k.system_name || ' — ' || total || ' ر.س', '/app/integrations?tab=inbox', 'api-inbox:' || inbox || ':' || owner);
    end loop;
    return jsonb_build_object('status', 202, 'body', jsonb_build_object('data', jsonb_build_object('id', inbox, 'status', 'pending_approval', 'amount', total),
      'message', 'استُلمت العملية وتنتظر اعتماد الإدارة؛ تابع حالتها عبر payment_requests'), 'rid', inbox, 'sid', stu.school_id, 'changes', jsonb_build_object('queued', inbox));
  end if;
  return _api_err(405, 'operation_not_supported', 'هذه العملية غير مدعومة لهذا المورد');
end $$;

-- Scope + validation + dispatch for one request (no authentication here; callers authenticate the key first).
create or replace function public._api_exec(k public.api_keys, _method text, _path text[], _q jsonb, _body jsonb, _dry boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  res text := _path[1]; rid uuid; r jsonb; op text; sc jsonb; f text[]; cat_f text[]; req_f text[]; bad text[];
  _sch uuid[]; _all boolean; _yrs uuid[]; _terms uuid[]; _secs uuid[]; _stu uuid[]; vs uuid; vy uuid;
  page int; per int; srt text; dsc boolean; qtext text; upd timestamptz; dfrom date; dto date; filt text[]; known text[];
  items jsonb; total bigint; one jsonb; out jsonb;
begin
  _q := coalesce(_q, '{}'::jsonb); _body := coalesce(_body, '{}'::jsonb);
  if cardinality(_path) > 2 then return _api_err(404, 'not_found', 'المسار غير موجود'); end if;
  if res is null or res = '' or res = 'me' then
    if _method <> 'GET' then return _api_err(405, 'method_not_allowed', 'العملية غير مدعومة'); end if;
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', jsonb_build_object('name', k.name, 'system', k.system_name, 'env', k.env, 'direction', k.direction,
      'expires_at', k.expires_at, 'rate_limit', jsonb_build_object('per_minute', k.rate_min, 'per_day', k.rate_day),
      'resources', (select coalesce(jsonb_object_agg(e.key, jsonb_build_object('read', coalesce((e.value->>'read')::boolean, false), 'create', coalesce((e.value->>'create')::boolean, false), 'update', coalesce((e.value->>'update')::boolean, false))), '{}'::jsonb) from jsonb_each(k.scopes) e))));
  end if;
  r := _api_res(res);
  if r is null then return _api_err(404, 'unknown_resource', 'المورد غير موجود'); end if;
  op := case _method when 'GET' then 'read' when 'POST' then 'create' when 'PATCH' then 'update' when 'PUT' then 'update' when 'DELETE' then 'delete' end;
  if op is null then return _api_err(405, 'method_not_allowed', 'العملية غير مدعومة'); end if;
  if op = 'delete' then return _api_err(405, 'delete_not_supported', 'الحذف غير متاح عبر API؛ الإلغاء والتسويات تتم داخل ركاز بالإجراءات المعتمدة'); end if;
  if not coalesce((r->'ops'->>op)::boolean, false) then return _api_err(405, 'operation_not_supported', 'هذه العملية غير مدعومة لهذا المورد'); end if;
  if op = 'create' and _path[2] is not null then return _api_err(405, 'method_not_allowed', 'الإضافة تتم على المورد دون معرّف'); end if;
  if op = 'update' and _path[2] is null then return _api_err(405, 'method_not_allowed', 'التعديل يتطلب معرّف السجل'); end if;
  if op = 'read' and k.direction = 'in' then return _api_err(403, 'direction_denied', 'المفتاح مخصص لاستقبال البيانات في ركاز فقط'); end if;
  if op <> 'read' and k.direction = 'out' then return _api_err(403, 'direction_denied', 'المفتاح مخصص لإرسال البيانات من ركاز فقط'); end if;
  sc := coalesce(k.scopes->res, '{}'::jsonb);
  if not coalesce((sc->>op)::boolean, false) then return _api_err(403, 'forbidden_operation', 'لا يملك المفتاح صلاحية هذه العملية على هذا المورد'); end if;
  cat_f := array(select x->>'k' from jsonb_array_elements(r->'fields') x);
  f := array(select distinct x from jsonb_array_elements_text(coalesce(sc->'fields', '[]'::jsonb)) x where x = any(cat_f));
  if not 'id' = any(f) then f := array['id'] || f; end if;

  _all := k.school_ids is null;
  _sch := array(select s.id from schools s where s.org_id = k.org_id and (_all or s.id = any(k.school_ids)));
  if coalesce((r->>'all_schools_only')::boolean, false) and not _all then return _api_err(403, 'out_of_scope', 'هذا المورد متاح فقط لمفاتيح جميع المدارس'); end if;
  if _q ? 'school_id' then
    vs := _api_uuid(_q->>'school_id');
    if vs is null or not vs = any(_sch) then return _api_err(403, 'out_of_scope', 'المدرسة خارج نطاق المفتاح'); end if;
    _sch := array[vs]; _all := false;
  end if;
  _yrs := k.year_ids;
  if _q ? 'year_id' then
    vy := _api_uuid(_q->>'year_id');
    if vy is null or (_yrs is not null and not vy = any(_yrs)) or not exists (select 1 from academic_years y where y.id = vy and y.school_id = any(_sch)) then return _api_err(403, 'out_of_scope', 'العام الدراسي خارج نطاق المفتاح'); end if;
    _yrs := array[vy];
  end if;
  _terms := k.term_ids;
  if k.stage_ids is not null or k.grade_ids is not null or k.section_ids is not null or _yrs is not null or _terms is not null then
    _secs := array(select sec.id from sections sec join grades g on g.id = sec.grade_id where sec.school_id = any(_sch)
      and (k.section_ids is null or sec.id = any(k.section_ids)) and (k.grade_ids is null or sec.grade_id = any(k.grade_ids)) and (k.stage_ids is null or g.stage_id = any(k.stage_ids))
      and (_yrs is null or sec.year_id = any(_yrs)) and (_terms is null or sec.term_id is null or sec.term_id = any(_terms)));
    _stu := array(select distinct e.student_id from enrollments e where e.status = 'active' and e.section_id = any(_secs));
  end if;

  if op in ('create', 'update') then
    if op = 'update' then rid := _api_uuid(_path[2]); if rid is null then return _api_err(404, 'not_found', 'السجل غير موجود'); end if; end if;
    if not _dry then return _api_write(k, res, r, sc, f, _sch, _all, _stu, rid, op, _body); end if;
    begin
      out := _api_write(k, res, r, sc, f, _sch, _all, _stu, rid, op, _body);
      raise exception using errcode = 'RZ001';
    exception when sqlstate 'RZ001' then null;
    end;
    return jsonb_set(out - 'changes', '{body}', coalesce(out->'body', '{}'::jsonb) || jsonb_build_object('dry_run', true, 'note', 'مفتاح اختبار أو مستكشف: تحقق كامل دون حفظ'));
  end if;

  if _path[2] is not null then
    rid := _api_uuid(_path[2]);
    if rid is null then return _api_err(404, 'not_found', 'السجل غير موجود'); end if;
    select x into one from _api_rows(res, k.org_id, _sch, _all, _yrs, _terms, _secs, k.stage_ids, k.grade_ids, _stu, rid, k.id) x limit 1;
    if one is null then return _api_err(404, 'not_found', 'السجل غير موجود أو خارج نطاق المفتاح'); end if;
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', _api_pick(one, f)), 'rid', rid, 'sid', one->>'school_id');
  end if;

  known := array['page', 'per_page', 'sort', 'order', 'q', 'fields', 'school_id', 'year_id', 'updated_since', 'date_from', 'date_to'] || array(select jsonb_array_elements_text(coalesce(r->'filters', '[]'::jsonb)));
  bad := array(select key from jsonb_object_keys(_q) key where not key = any(known));
  if cardinality(bad) > 0 then return _api_err(400, 'unknown_parameter', 'معاملات غير معروفة: ' || array_to_string(bad, '، ')); end if;
  if _q ? 'fields' then
    req_f := array(select distinct btrim(x) from unnest(string_to_array(_q->>'fields', ',')) x where btrim(x) <> '');
    bad := array(select x from unnest(req_f) x where not x = any(f));
    if cardinality(bad) > 0 then return _api_err(403, 'forbidden_fields', 'حقول غير مصرح بها: ' || array_to_string(bad, '، ')); end if;
    f := array['id'] || array(select x from unnest(req_f) x where x <> 'id');
  end if;
  page := case when _q ? 'page' then _api_int(_q->>'page') else 1 end;
  per := case when _q ? 'per_page' then _api_int(_q->>'per_page') else 25 end;
  if page is null or page < 1 or page > 100000 then return _api_err(400, 'bad_parameter', 'page: رقم صفحة صحيح'); end if;
  if per is null or per < 1 or per > 100 then return _api_err(400, 'bad_parameter', 'per_page: من 1 إلى 100'); end if;
  if _q ? 'sort' then
    srt := _q->>'sort';
    if not exists (select 1 from jsonb_array_elements_text(r->'sortable') s where s = srt) then return _api_err(400, 'bad_parameter', 'sort: غير مدعوم لهذا المورد'); end if;
    if not srt = any(f) then return _api_err(403, 'forbidden_fields', 'لا يمكن الفرز بحقل غير مصرح به'); end if;
  else
    srt := coalesce((select s from jsonb_array_elements_text(r->'sortable') s where s = any(f) limit 1), 'id');
  end if;
  if _q ? 'order' and lower(_q->>'order') not in ('asc', 'desc') then return _api_err(400, 'bad_parameter', 'order: asc أو desc'); end if;
  dsc := lower(coalesce(_q->>'order', case when srt like '%_at' or srt like '%date%' then 'desc' else 'asc' end)) = 'desc';
  if _q ? 'q' then
    qtext := btrim(_q->>'q');
    if r->>'search' is null then return _api_err(400, 'bad_parameter', 'البحث غير مدعوم لهذا المورد'); end if;
    if not (r->>'search') = any(f) then return _api_err(403, 'forbidden_fields', 'لا يمكن البحث بحقل غير مصرح به'); end if;
    if length(qtext) > 100 then return _api_err(400, 'bad_parameter', 'q: حتى 100 حرف'); end if;
    qtext := replace(replace(replace(qtext, '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  if _q ? 'updated_since' then
    if not 'updated_at' = any(cat_f) then return _api_err(400, 'bad_parameter', 'updated_since غير مدعوم لهذا المورد'); end if;
    upd := _api_tstz(_q->>'updated_since'); if upd is null then return _api_err(400, 'bad_parameter', 'updated_since: تاريخ ووقت ISO 8601'); end if;
  end if;
  if _q ? 'date_from' or _q ? 'date_to' then
    if r->>'date' is null then return _api_err(400, 'bad_parameter', 'الفلترة بالتاريخ غير مدعومة لهذا المورد'); end if;
    if _q ? 'date_from' then dfrom := _api_date(_q->>'date_from'); if dfrom is null then return _api_err(400, 'bad_parameter', 'date_from: YYYY-MM-DD'); end if; end if;
    if _q ? 'date_to' then dto := _api_date(_q->>'date_to'); if dto is null then return _api_err(400, 'bad_parameter', 'date_to: YYYY-MM-DD'); end if; end if;
  end if;
  filt := array(select x from jsonb_array_elements_text(coalesce(r->'filters', '[]'::jsonb)) x where _q ? x and x not in ('school_id', 'year_id'));
  bad := array(select x from unnest(filt) x where not x = any(f));
  if cardinality(bad) > 0 then return _api_err(403, 'forbidden_fields', 'لا يمكن الفلترة بحقل غير مصرح به: ' || array_to_string(bad, '، ')); end if;

  select coalesce(jsonb_agg(_api_pick(z.j, f) order by z.rn), '[]'::jsonb), max(z.tot) into items, total from (
    select w.j, row_number() over (order by case when not dsc then w.j->srt end asc nulls last, case when dsc then w.j->srt end desc nulls last, w.j->>'id') rn, count(*) over () tot
    from _api_rows(res, k.org_id, _sch, _all, _yrs, _terms, _secs, k.stage_ids, k.grade_ids, _stu, null, k.id) w(j)
    where (qtext is null or (w.j->>(r->>'search')) ilike '%' || qtext || '%')
      and (upd is null or _api_tstz(w.j->>'updated_at') >= upd)
      and (dfrom is null or _api_date(left(w.j->>(r->>'date'), 10)) >= dfrom)
      and (dto is null or _api_date(left(w.j->>(r->>'date'), 10)) <= dto)
      and not exists (select 1 from unnest(filt) fk where (w.j->>fk) is distinct from (_q->>fk))
  ) z where z.rn > (page - 1) * per and z.rn <= page * per;
  return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', items, 'meta', jsonb_build_object('page', page, 'per_page', per, 'total', total, 'has_more', coalesce(total > page * per, false), 'sort', srt, 'order', case when dsc then 'desc' else 'asc' end)));
end $$;

-- Gateway entry (service role only): authenticate the key, enforce status/dates/IP/rate/idempotency, run, log.
create or replace function public._api_call(_hash text, _env text, _ip text, _method text, _path text[], _q jsonb, _body jsonb, _idem text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  k api_keys; t0 timestamptz := clock_timestamp(); out jsonb; n int := 0; res text := _path[1]; op text; ipx inet; h text; idm api_idem; new_idem boolean := false; err text; st int;
begin
  _method := upper(coalesce(_method, ''));
  op := case _method when 'GET' then 'read' when 'POST' then 'create' when 'PATCH' then 'update' when 'PUT' then 'update' when 'DELETE' then 'delete' else 'other' end;
  _ip := left(_ip, 64);
  begin ipx := _ip::inet; exception when others then ipx := null; end;
  if _ip is not null and (select count(*) from api_requests where key_id is null and ip = _ip and at > now() - interval '1 minute') >= 20 then
    return _api_err(429, 'too_many_failures', 'محاولات مصادقة فاشلة كثيرة؛ أعد المحاولة بعد دقيقة');
  end if;
  if _hash ~ '^[0-9a-f]{64}$' then
    select * into k from api_keys where key_hash = _hash;
    if k.id is null then select * into k from api_keys where prev_hash = _hash and prev_until > now(); end if;
  end if;
  if k.id is null or k.env is distinct from _env then
    insert into api_requests(env, ip, method, resource, op, status, outcome, code, ms) values (_env, _ip, _method, left(res, 40), op, 401, 'denied', 'invalid_key', 0);
    return _api_err(401, 'invalid_key', 'مفتاح API غير صالح');
  end if;
  if k.status = 'revoked' then out := _api_err(401, 'key_revoked', 'المفتاح ملغى');
  elsif k.status = 'paused' then out := _api_err(401, 'key_paused', 'المفتاح موقوف مؤقتًا');
  elsif k.starts_at > now() then out := _api_err(401, 'key_not_active', 'لم يبدأ سريان المفتاح بعد');
  elsif k.expires_at is not null and k.expires_at <= now() then out := _api_err(401, 'key_expired', 'انتهت صلاحية المفتاح');
  elsif not exists (select 1 from organizations o where o.id = k.org_id and o.is_active) then out := _api_err(403, 'org_inactive', 'المجموعة غير نشطة');
  elsif cardinality(coalesce(k.ip_allow, '{}')) > 0 and (ipx is null or not ipx <<= any(k.ip_allow)) then
    out := _api_err(403, 'ip_not_allowed', 'عنوان الاتصال غير مسموح لهذا المفتاح');
    perform _api_alert(k.org_id, k.id, 'ip', 'اتصال من عنوان غير مسموح', k.name || ' — ' || coalesce(_ip, 'عنوان غير معروف'));
  end if;
  if out is not null and k.status in ('paused', 'revoked') then perform _api_alert(k.org_id, k.id, 'blocked', 'محاولة استخدام مفتاح موقوف أو ملغى', k.name); end if;
  if out is null then
    select count(*) into n from api_requests where key_id = k.id and at > now() - interval '1 minute' and outcome <> 'rate_limited';
    if n >= k.rate_min then
      out := _api_err(429, 'rate_limited', 'تجاوزت حد الطلبات في الدقيقة');
      perform _api_alert(k.org_id, k.id, 'rate', 'تجاوز حد الطلبات', k.name || ' — ' || k.rate_min || ' طلب/دقيقة');
    elsif (select count(*) from api_requests where key_id = k.id and at > now() - interval '1 day' and outcome <> 'rate_limited') >= k.rate_day then
      out := _api_err(429, 'rate_limited_daily', 'تجاوزت حد الطلبات اليومي');
      perform _api_alert(k.org_id, k.id, 'rate_day', 'تجاوز الحد اليومي للطلبات', k.name || ' — ' || k.rate_day || ' طلب/يوم');
    end if;
  end if;
  if out is null and _idem is not null and op in ('create', 'update') then
    if _idem !~ '^[A-Za-z0-9_.:-]{8,100}$' then out := _api_err(400, 'bad_idempotency_key', 'Idempotency-Key: من 8 إلى 100 خانة (حروف إنجليزية وأرقام و _ . : -)');
    else
      h := encode(digest(_method || ' ' || array_to_string(_path, '/') || ' ' || coalesce(_body::text, ''), 'sha256'), 'hex');
      insert into api_idem(key_id, idem_key, req_hash) values (k.id, _idem, h) on conflict do nothing;
      if found then new_idem := true;
      else
        select * into idm from api_idem where key_id = k.id and idem_key = _idem;
        if idm.req_hash <> h then out := _api_err(422, 'idempotency_conflict', 'Idempotency-Key مستخدم لطلب مختلف');
        elsif idm.response is null then out := _api_err(409, 'in_progress', 'طلب بنفس Idempotency-Key قيد التنفيذ');
        else out := idm.response || jsonb_build_object('replay', true);
        end if;
      end if;
    end if;
  end if;
  if out is null and res = 'payments' and op = 'create' and _idem is null then
    out := _api_err(400, 'idempotency_required', 'عمليات السداد تتطلب ترويسة Idempotency-Key');
  end if;
  if out is null then
    begin
      out := _api_exec(k, _method, _path, _q, _body, k.env = 'test');
    exception when others then
      err := sqlstate;
      out := _api_err(500, 'internal_error', 'تعذر تنفيذ الطلب');
    end;
    if new_idem then
      if (out->>'status')::int < 300 then update api_idem set response = out - 'changes' where key_id = k.id and idem_key = _idem;
      else delete from api_idem where key_id = k.id and idem_key = _idem; end if;
    end if;
    update api_keys set last_used_at = now(), request_count = request_count + 1 where id = k.id;
  end if;
  st := (out->>'status')::int;
  insert into api_requests(org_id, key_id, env, ip, method, resource, op, record_id, school_id, status, outcome, code, ms, params, changes)
  values (k.org_id, k.id, k.env, _ip, _method, left(res, 40), op, left(out->>'rid', 64), _api_uuid(out->>'sid'), st,
    case when coalesce((out->>'replay')::boolean, false) then 'replay' when st < 300 then 'ok' when st = 429 then 'rate_limited' when st in (401, 403) then 'denied' when st >= 500 then 'error' else 'rejected' end,
    coalesce(out->'body'->'error'->>'code', err), (extract(epoch from clock_timestamp() - t0) * 1000)::int,
    array(select left(key, 40) from jsonb_object_keys(coalesce(_q, '{}'::jsonb)) key limit 20), out->'changes');
  if random() < 0.01 then
    delete from api_requests where id in (select id from api_requests where at < now() - interval '180 days' limit 5000);
    delete from api_idem where created_at < now() - interval '7 days';
    delete from api_deliveries where id in (select id from api_deliveries where status in ('delivered', 'dead') and created_at < now() - interval '90 days' limit 5000);
  end if;
  return jsonb_build_object('status', st, 'body', out->'body', 'headers', jsonb_build_object('X-RateLimit-Limit', k.rate_min, 'X-RateLimit-Remaining', greatest(0, k.rate_min - n - 1), 'X-Rikaz-Env', k.env));
end $$;

revoke all on function public._api_err(int, text, text), public._api_num(text),
  public._api_rows(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid),
  public._api_alert(uuid, uuid, text, text, text),
  public._api_write(public.api_keys, text, jsonb, jsonb, text[], uuid[], boolean, uuid[], uuid, text, jsonb),
  public._api_exec(public.api_keys, text, text[], jsonb, jsonb, boolean),
  public._api_call(text, text, text, text, text[], jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public._api_err(int, text, text), public._api_num(text),
  public._api_rows(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid),
  public._api_alert(uuid, uuid, text, text, text),
  public._api_write(public.api_keys, text, jsonb, jsonb, text[], uuid[], boolean, uuid[], uuid, text, jsonb),
  public._api_exec(public.api_keys, text, text[], jsonb, jsonb, boolean),
  public._api_call(text, text, text, text, text[], jsonb, jsonb, text) to service_role;
