create or replace function public.hr_att_corr_request(_org uuid, _date date, _kind text, _at timestamptz, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); nid uuid;
begin
  if emp is null or not _hr_lv_self(emp) then raise exception 'غير مصرح'; end if;
  if _kind not in ('punch','excuse') then raise exception 'نوع غير صالح'; end if;
  if _date is null or _date > _hr_today() or _date < _hr_today() - 60 then raise exception 'التاريخ خارج المدة المسموحة (60 يومًا)'; end if;
  if _kind='punch' and (_at is null or _at > now() or abs(extract(epoch from (_at - ((_date)::timestamp at time zone 'Asia/Riyadh'))))/3600 > 36) then raise exception 'وقت البصمة لا يطابق اليوم'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'السبب مطلوب'; end if;
  if _hr_at_closed(_hr_emp_school(emp),_date) then raise exception 'يوم الحضور مغلق؛ تواصل مع الموارد البشرية'; end if;
  if exists(select 1 from hr_att_corrections where employee_id=emp and date=_date and kind=_kind and status='pending' and (_kind='excuse' or at=_at)) then raise exception 'يوجد طلب مماثل قيد المراجعة'; end if;
  insert into hr_att_corrections(org_id,employee_id,date,kind,at,reason,requested_by) values(_org,emp,_date,_kind,case when _kind='punch' then _at end,btrim(_reason),auth.uid()) returning id into nid;
  perform _hr_log(_org,'att_correction',nid,'request',null,jsonb_build_object('date',_date,'kind',_kind,'at',_at),_reason);
  return nid;
end $$;