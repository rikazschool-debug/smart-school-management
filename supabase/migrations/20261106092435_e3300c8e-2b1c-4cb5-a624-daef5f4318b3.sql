create or replace function public._hr_open_check(_org uuid, _kind text, _rows jsonb, _stage text default 'prepare') returns jsonb language plpgsql stable security definer set search_path=public as $$
declare x jsonb; i int := 0; out jsonb := '[]'; errs text[]; e hr_employees; ty uuid; yr int; dy numeric; am numeric; rm numeric; ia numeric; sm date;
  seen text[] := '{}'; k text; st text; okc int := 0; erc int := 0; dpc int := 0; tot numeric := 0; bys jsonb := '{}'; sn text; cm date := date_trunc('month',_hr_today())::date;
begin
  if jsonb_typeof(_rows) <> 'array' then raise exception 'صيغة الصفوف غير صحيحة'; end if;
  if jsonb_array_length(_rows) = 0 then raise exception 'لا توجد صفوف'; end if;
  if jsonb_array_length(_rows) > 2000 then raise exception 'الحد الأقصى 2000 صف'; end if;
  for x in select * from jsonb_array_elements(_rows) loop
    i := i + 1; errs := '{}'; st := 'ok'; e := null; ty := null; k := null; sn := null;
    select * into e from hr_employees where org_id=_org and lower(btrim(employee_no)) = lower(btrim(coalesce(x->>'employee_no',''))) and btrim(coalesce(x->>'employee_no','')) <> '';
    if e.id is null then errs := errs || 'الرقم الوظيفي غير موجود في المؤسسة'::text;
    elsif not _hr_open_row_ok(_kind, e.id, _stage) then errs := errs || 'الموظف خارج نطاق صلاحيتك'::text; e := null;
    elsif e.user_id = auth.uid() then errs := errs || 'لا يُدخل الموظف رصيده'::text; 
    elsif e.status = 'ended' then errs := errs || 'خدمة الموظف منتهية'::text; end if;
    if e.id is not null then sn := coalesce((select name from schools where id=_hr_emp_school(e.id)),'بلا مدرسة'); end if;
    if _kind='leave' then
      select id into ty from hr_leave_types where org_id=_org and is_active and btrim(name)=btrim(coalesce(x->>'type',''));
      if ty is null then errs := errs || 'نوع الإجازة غير معروف'::text; end if;
      begin yr := nullif(x->>'year','')::int; exception when others then yr := null; end;
      if yr is null or yr < 2000 or yr > extract(year from _hr_today())::int + 1 then errs := errs || 'السنة غير صحيحة'::text; end if;
      begin dy := round(nullif(x->>'days','')::numeric,2); exception when others then dy := null; end;
      if dy is null or dy <= 0 or dy > 365 then errs := errs || 'الأيام بين 0.5 و365'::text; end if;
      if e.id is not null and ty is not null and yr is not null then
        k := 'open:' || e.id || ':' || ty || ':' || yr;
        if k = any(seen) then errs := errs || 'مكرر في الملف (الموظف والنوع والسنة)'::text; end if;
        if exists(select 1 from hr_leave_moves m where m.org_id=_org and m.key=k) then st := 'dup'; end if;
        if exists(select 1 from hr_open_batches b, jsonb_array_elements(b.rows) r where b.org_id=_org and b.kind='leave' and b.status='draft' and r->>'key'=k and _stage='prepare') then errs := errs || 'الصف موجود في دفعة أخرى بانتظار الاعتماد'::text; end if;
      end if;
    else
      begin am := round(nullif(x->>'amount','')::numeric,2); rm := round(nullif(x->>'remaining','')::numeric,2); ia := round(nullif(x->>'installment_amount','')::numeric,2);
        sm := _hr_month(x->>'start_month'); exception when others then sm := null; end;
      if am is null or am <= 0 then errs := errs || 'مبلغ السلفة الأصلي غير صحيح'::text; end if;
      if rm is null or rm <= 0 then errs := errs || 'الرصيد المتبقي غير صحيح'::text;
      elsif am is not null and rm > am then errs := errs || 'المتبقي أكبر من مبلغ السلفة'::text; end if;
      if ia is null or ia <= 0 then errs := errs || 'قيمة القسط غير صحيحة'::text; end if;
      if sm is null then errs := errs || 'شهر بداية الاستقطاع غير صحيح'::text; elsif sm < cm then errs := errs || 'شهر بداية الاستقطاع مضى'::text; end if;
      if e.id is not null then
        k := 'open-adv:' || e.id;
        if k = any(seen) then errs := errs || 'الموظف مكرر في الملف'::text; end if;
        if exists(select 1 from hr_advances a where a.employee_id=e.id and a.payment_ref like 'opening:%') then st := 'dup'; end if;
        if exists(select 1 from hr_open_batches b, jsonb_array_elements(b.rows) r where b.org_id=_org and b.kind='advance' and b.status='draft' and r->>'key'=k and _stage='prepare') then errs := errs || 'الصف موجود في دفعة أخرى بانتظار الاعتماد'::text; end if;
      end if;
    end if;
    if k is not null then seen := seen || k; end if;
    if array_length(errs,1) is not null then st := 'error'; erc := erc + 1; elsif st='dup' then dpc := dpc + 1; else okc := okc + 1; end if;
    if st='ok' then
      tot := tot + case when _kind='leave' then dy else rm end;
      bys := jsonb_set(bys, array[sn], jsonb_build_object('rows', coalesce((bys->sn->>'rows')::int,0) + 1, 'total', coalesce((bys->sn->>'total')::numeric,0) + case when _kind='leave' then dy else rm end));
    end if;
    out := out || jsonb_build_object('i', coalesce((x->>'i')::int, i), 'employee_no', x->>'employee_no', 'employee_id', e.id, 'employee', e.full_name, 'school', sn, 'status', st, 'errors', to_jsonb(errs), 'key', k)
      || case when _kind='leave' then jsonb_build_object('type', x->>'type', 'type_id', ty, 'year', yr, 'days', dy)
              else jsonb_build_object('amount', am, 'remaining', rm, 'installment_amount', ia, 'start_month', sm) end;
  end loop;
  return jsonb_build_object('rows',out,'input_rows',i,'ok',okc,'errors',erc,'duplicates',dpc,'total',tot,'by_school',bys);
end $$;
revoke all on function public._hr_open_check(uuid,text,jsonb,text) from public, anon, authenticated;