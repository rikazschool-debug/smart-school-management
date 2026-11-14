create or replace function public.evt_save(_p jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; sid uuid; nsid uuid; v_kind text; t text; s jsonb; keep uuid[] := '{}'; n int := 0; sa timestamptz; se timestamptz; cap int; tg jsonb; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
  if nullif(_p->>'id','') is not null then
    select * into i from evt_items where id=(_p->>'id')::uuid for update;
    if i.id is null or not _evt_ok(i.id, 'edit') then raise exception 'ليست لديك صلاحية تعديل هذه الفعالية' using errcode='42501'; end if;
    if i.rev <> coalesce((_p->>'rev')::int, -1) then raise exception 'تغيّرت الفعالية من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة'; end if;
    if i.status in ('cancelled','archived','completed') then raise exception 'لا يمكن تعديل فعالية ملغاة أو مكتملة أو مؤرشفة'; end if;
    v_kind := i.kind; sid := i.school_id;
  else
    v_kind := _p->>'kind'; sid := nullif(_p->>'school_id','')::uuid;
    if v_kind not in ('trip','general','course') then raise exception 'نوع الفعالية غير معروف'; end if;
    if sid is null or not _evt_school_ok(sid, v_kind, 'create') then raise exception 'ليست لديك صلاحية الإنشاء في هذه المدرسة' using errcode='42501'; end if;
  end if;
  t := _evt_clean(_p->>'title', 150, 'الاسم');
  if t is null or length(t) < 3 then raise exception 'اكتب اسمًا واضحًا (3 أحرف على الأقل)'; end if;
  cap := case when coalesce(_p->>'capacity','') ~ '^\d{1,6}$' and (_p->>'capacity')::int > 0 then (_p->>'capacity')::int end;
  if v_kind = 'course' and cap is not null and i.id is not null and cap < (select count(*) from evt_applications where item_id=i.id and status='accepted') then
    raise exception 'السعة أقل من عدد المقبولين الحاليين'; end if;
  tg := coalesce(_p->'target', '{"all":true}');
  if v_kind <> 'course' and not (coalesce(tg->>'all','false')='true' or jsonb_array_length(coalesce(tg->'sections','[]')) > 0 or jsonb_array_length(coalesce(tg->'grades','[]')) > 0) then
    raise exception 'حدد الجمهور (كل الطلاب أو صفوف أو شعب)'; end if;
  if v_kind <> 'course' and jsonb_typeof(tg->'sections') = 'array' and exists(select 1 from jsonb_array_elements_text(tg->'sections') x where not exists(select 1 from sections where id::text=x and school_id=sid)) then
    raise exception 'شعبة غير تابعة لهذه المدرسة'; end if;
  if nullif(_p->>'reg_opens','') is not null and nullif(_p->>'reg_closes','') is not null and (_p->>'reg_closes')::timestamptz <= (_p->>'reg_opens')::timestamptz then
    raise exception 'نهاية التسجيل يجب أن تكون بعد بدايته'; end if;
  if i.id is null then
    insert into evt_items(org_id, school_id, kind, title, created_by) values (school_org(sid), sid, v_kind, t, auth.uid()) returning * into i;
    perform _evt_log(i.id, null, 'create', jsonb_build_object('kind', v_kind));
  end if;
  update evt_items set title=t,
    description=_evt_clean(_p->>'description', 4000, 'الوصف'), category=_evt_clean(_p->>'category', 80, 'التصنيف'),
    location=_evt_clean(_p->>'location', 200, 'المكان'),
    mode=case when _p->>'mode' in ('in_person','online','hybrid') then _p->>'mode' else 'in_person' end,
    trainer=case when v_kind='course' then _evt_clean(_p->>'trainer', 120, 'المدرب') end,
    audience=case when v_kind='course' and _p->>'audience' in ('internal','external','both') then _p->>'audience' else 'internal' end,
    target=case when v_kind='course' then '{"all":true}'::jsonb else jsonb_strip_nulls(jsonb_build_object('all', case when coalesce(tg->>'all','false')='true' then true end, 'sections', tg->'sections', 'grades', tg->'grades')) end,
    reg_opens=case when v_kind='course' then nullif(_p->>'reg_opens','')::timestamptz end,
    reg_closes=case when v_kind='course' then nullif(_p->>'reg_closes','')::timestamptz end,
    capacity=cap, conditions=_evt_clean(_p->>'conditions', 4000, 'الشروط'),
    consent_required=v_kind='trip' and coalesce(_p->>'consent_required','false')='true',
    consent_deadline=case when v_kind='trip' then nullif(_p->>'consent_deadline','')::timestamptz end,
    need_emergency=v_kind='trip' and coalesce(_p->>'need_emergency','false')='true',
    need_medical=v_kind='trip' and coalesce(_p->>'need_medical','false')='true',
    rev=rev+1, updated_at=now()
  where id=i.id returning * into i;
  if i.consent_required and i.consent_deadline is null then raise exception 'حدد آخر موعد لرد أولياء الأمور'; end if;
  if jsonb_typeof(_p->'sessions') = 'array' then
    for s in select * from jsonb_array_elements(_p->'sessions') loop
      n := n + 1;
      if n > 200 then raise exception 'عدد الجلسات كبير'; end if;
      sa := nullif(s->>'starts_at','')::timestamptz; se := nullif(s->>'ends_at','')::timestamptz;
      if sa is null then raise exception 'حدد موعد بداية الجلسة %', n; end if;
      if se is not null and se <= sa then raise exception 'نهاية الجلسة % يجب أن تكون بعد بدايتها', n; end if;
      if nullif(s->>'id','') is not null and exists(select 1 from evt_sessions where id=(s->>'id')::uuid and item_id=i.id) then
        update evt_sessions set seq=n, title=_evt_clean(s->>'title',120,'عنوان الجلسة'), starts_at=sa, ends_at=se, location=_evt_clean(s->>'location',200,'مكان الجلسة') where id=(s->>'id')::uuid;
        keep := keep || (s->>'id')::uuid;
      else
        insert into evt_sessions(item_id, seq, title, starts_at, ends_at, location) values (i.id, n, _evt_clean(s->>'title',120,'عنوان الجلسة'), sa, se, _evt_clean(s->>'location',200,'مكان الجلسة')) returning id into nsid;
        keep := keep || nsid;
      end if;
    end loop;
    if exists(select 1 from evt_sessions es where es.item_id=i.id and not (es.id = any(keep)) and exists(select 1 from evt_attendance a where a.session_id=es.id)) then
      raise exception 'لا يمكن حذف جلسة سُجّل فيها حضور'; end if;
    delete from evt_sessions where item_id=i.id and not (id = any(keep));
  end if;
  perform _evt_log(i.id, null, 'edit', jsonb_build_object('rev', i.rev));
  return jsonb_build_object('id', i.id, 'rev', i.rev);
end $$;
revoke all on function public.evt_save(jsonb) from public, anon;
grant execute on function public.evt_save(jsonb) to authenticated;