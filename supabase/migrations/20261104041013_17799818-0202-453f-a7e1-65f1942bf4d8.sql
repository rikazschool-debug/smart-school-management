create or replace function public.mt_create(_school uuid, _kind text, _data jsonb, _key text) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); org uuid := school_org(_school); rid uuid; cat mt_categories; sub mt_categories; b mt_buses; v_yr int; v_n int; v_ref text; ex uuid[]; r mt_requests;
begin
  if _kind not in ('school','bus') then raise exception 'نوع غير معروف'; end if;
  if not _mt_ok(me,_school,_kind,'request') then raise exception 'لا تملك تقديم طلبات % لهذا الفرع', case _kind when 'school' then 'صيانة المدارس' else 'صيانة الباصات' end using errcode='42501'; end if;
  if _key is not null then select x.id into rid from mt_requests x where x.requested_by=me and x.client_key=_key; if rid is not null then return rid; end if; end if;
  if length(trim(coalesce(_data->>'title',''))) < 3 then raise exception 'العنوان مطلوب'; end if;
  if length(trim(coalesce(_data->>'description',''))) < 5 then raise exception 'وصف العطل مطلوب'; end if;
  if coalesce(_data->>'priority','normal') not in ('low','normal','high','urgent') then raise exception 'أولوية غير صالحة'; end if;
  select * into cat from mt_categories c where c.id=nullif(_data->>'category_id','')::uuid and c.kind=_kind and c.parent_id is null and c.active and (c.org_id is null or c.org_id=org);
  if cat.id is null then raise exception 'اختر التصنيف الرئيسي'; end if;
  if nullif(_data->>'subcategory_id','') is not null then
    select * into sub from mt_categories c where c.id=(_data->>'subcategory_id')::uuid and c.parent_id=cat.id and c.active;
    if sub.id is null then raise exception 'التصنيف الفرعي لا يتبع التصنيف الرئيسي'; end if;
  end if;
  if cat.is_other and length(trim(coalesce(_data->>'other_text',''))) < 3 then raise exception 'صف نوع العطل عند اختيار «أخرى»'; end if;
  if _kind='bus' then
    select * into b from mt_buses x where x.id=nullif(_data->>'bus_id','')::uuid and x.school_id=_school and x.active for update;
    if b.id is null then raise exception 'اختر باصًا من باصات الفرع'; end if;
    if nullif(_data->>'odometer','') is not null and b.odometer is not null and (_data->>'odometer')::int < b.odometer then raise exception 'قراءة العداد أقل من آخر قراءة مسجلة (%)', b.odometer; end if;
  else
    if length(trim(coalesce(_data->>'place',''))) < 2 then raise exception 'حدد المكان'; end if;
  end if;
  v_yr := extract(year from now() at time zone 'Asia/Riyadh');
  insert into mt_counters as k (org_id,kind,yr,n) values (org,_kind,v_yr,1) on conflict (org_id,kind,yr) do update set n=k.n+1 returning k.n into v_n;
  v_ref := case _kind when 'school' then 'MS-' else 'MB-' end || v_yr || '-' || lpad(v_n::text,4,'0');
  insert into mt_requests(org_id,school_id,kind,ref,title,description,impact,priority,category_id,subcategory_id,other_text,building,floor,place_type,place,asset,
      bus_id,odometer,bus_location,visit_window,contact,requested_by,client_key,status)
  values (org,_school,_kind,v_ref,trim(_data->>'title'),trim(_data->>'description'),nullif(trim(_data->>'impact'),''),coalesce(_data->>'priority','normal'),cat.id,sub.id,
      nullif(trim(_data->>'other_text'),''),nullif(trim(_data->>'building'),''),nullif(trim(_data->>'floor'),''),nullif(trim(_data->>'place_type'),''),nullif(trim(_data->>'place'),''),
      nullif(trim(_data->>'asset'),''),b.id,nullif(_data->>'odometer','')::int,nullif(trim(_data->>'bus_location'),''),nullif(trim(_data->>'visit_window'),''),
      nullif(trim(_data->>'contact'),''),me,_key,'new') returning id into rid;
  perform _mt_ev(rid,'create','public',null,null,jsonb_build_object('priority',coalesce(_data->>'priority','normal')));
  if _kind='bus' then
    if nullif(_data->>'odometer','') is not null then update mt_buses set odometer=(_data->>'odometer')::int, updated_at=now() where id=b.id; end if;
    if coalesce((_data->>'stop_bus')::boolean,false) and b.op_status='available' then
      update mt_buses set op_status='stopped', updated_at=now() where id=b.id;
      insert into mt_bus_events(bus_id,actor,action,before,after,note,request_id) values (b.id,me,'status','{"op_status":"available"}','{"op_status":"stopped"}','متوقف للصيانة — '||v_ref,rid);
    end if;
  end if;
  select array_agg(u) into ex from _mt_users(_school,_kind,'execute') u where u <> me;
  if coalesce(array_length(ex,1),0) = 1 then
    update mt_requests set status='assigned', assignee_id=ex[1] where id=rid returning * into r;
    perform _mt_ev(rid,'auto_assign','public',null,null,jsonb_build_object('assignee',ex[1]));
    perform _mt_note(r, ex[1], 'أُسند إليك طلب صيانة', 'assign:'||ex[1]);
  else
    update mt_requests set status='awaiting_assign' where id=rid returning * into r;
    perform _mt_notify_follow(r, case when ex is null then 'طلب جديد ولا يوجد مسؤول صيانة للفرع' else 'طلب جديد بانتظار الإسناد' end, 'new');
  end if;
  if r.priority='urgent' then perform _mt_notify_follow(r,'طلب عاجل','urgent'); end if;
  return rid;
end $$;