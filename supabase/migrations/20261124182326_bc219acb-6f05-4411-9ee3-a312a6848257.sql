create or replace function public.sf_override(_student uuid,_action text,_id uuid,_amount numeric,_reason text) returns void language plpgsql security definer set search_path=public as $$
 declare s uuid; b sf_obligations; a sf_applied; old jsonb; used numeric; begin
 select school_id into s from students where id=_student for update; perform _sf_guard(s,'setup');
 if length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب العملية مطلوب'; end if;
 if _action in ('discount_edit','discount_remove','exception_clear') then
  select * into a from sf_applied where id=_id for update; select * into b from sf_obligations where id=a.obligation_id and student_id=_student for update; old:=to_jsonb(a);
 else select * into b from sf_obligations where id=_id and student_id=_student and kind='transport' for update; old:=to_jsonb(b); end if;
 if b.id is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 if b.accounting_confirmed then raise exception 'المستند معتمد في وافق؛ التسوية مؤجلة لحين الربط'; end if;
 if _action='discount_edit' then
  select coalesce(sum(amount),0) into used from sf_applied where obligation_id=b.id and active and id<>a.id;
  if _amount is null or _amount<0 or _amount='NaN'::numeric or _amount+used>b.amount then raise exception 'الخصم يتجاوز الرسوم'; end if;
  update sf_applied set amount=_amount,manual_override=true,active=true where id=a.id;
 elsif _action='discount_remove' then update sf_applied set active=false,manual_override=true where id=a.id;
 elsif _action='exception_clear' then update sf_applied set manual_override=false,active=false where id=a.id; perform _sf_apply(b.id,a.discount_id);
 elsif _action='transport_edit' then
  select coalesce(sum(amount),0) into used from sf_applied where obligation_id=b.id and active;
  if _amount is null or _amount<used or _amount='NaN'::numeric then raise exception 'المبلغ أقل من الخصومات'; end if;
  update sf_obligations set amount=_amount,manual_override=true where id=b.id;
  -- automatic (percent) discounts follow the edited amount at once; manually edited discounts keep their value
  perform _sf_refresh(_student);
 elsif _action in('transport_exempt','transport_cancel') then
  update sf_obligations set amount=0,status=case when _action='transport_exempt' then 'exempt' else 'void' end,manual_override=true where id=b.id;
  update sf_applied set active=false where obligation_id=b.id;
  update sf_transport set exempt=true,active=case when _action='transport_cancel' then false else active end where student_id=_student and year_id=b.year_id and term=b.term;
 else raise exception 'إجراء غير صالح'; end if;
 perform _sf_event(s,_student,_action,_id,old,jsonb_build_object('amount',_amount,'term',b.term,'kind',b.kind),_reason); end$$;