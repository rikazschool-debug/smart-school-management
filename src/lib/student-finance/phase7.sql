-- Phase 7 mirror (applied to the TEST DB on 2026-11-24 during the full finance-cycle test).
-- 1) sf_reprice_apply refreshes automatic (e.g. sibling %) discounts at once; sf_reprice_preview simulates apply in a rolled-back subtransaction.
-- 2) sf_override refreshes automatic discounts after a manual transport edit.
-- 3) sf_dashboard / sf_collection_lines: cash collected in a year = allocations to that year's items + to carried items after their carry; credit use is never cash.

-- Reprice keeps automatic (e.g. sibling %) discounts in step with the new obligation amount.
create or replace function public.sf_reprice_apply(_price uuid,_mode text,_students uuid[],_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
 declare p sf_prices; r record; n integer:=0; touched uuid[]:='{}'; begin
 select * into p from sf_prices where id=_price for update;
 perform _sf_guard(p.school_id,'setup');
 if not is_org_owner((select org_id from schools where id=p.school_id)) then raise exception 'تعديل رسوم الطلاب لمدير النظام فقط' using errcode='42501'; end if;
 if p.status<>'approved' then raise exception 'اعتمد السعر الجديد أولًا'; end if;
 if length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب التعديل مطلوب'; end if;
 if _mode not in('unpaid','selected') then raise exception 'خيار غير صالح'; end if;
 perform 1 from students where id in(select student_id from sf_obligations where price_id=_price) order by id for update;
 for r in select * from _sf_reprice_rows(_price,_mode,_students) where eligible loop
  update sf_obligations set original=r.new_amount,amount=r.new_amount,price_snapshot=to_jsonb(p),updated_at=now() where id=r.obligation_id;
  perform _sf_event(p.school_id,r.student_id,'reprice',r.obligation_id,jsonb_build_object('amount',r.old_amount),jsonb_build_object('amount',r.new_amount,'mode',_mode,'term',r.term),_reason);
  if not r.student_id=any(touched) then touched:=touched||r.student_id; end if;
  n:=n+1;
 end loop;
 -- automatic discounts (percent/sibling) follow the new amount now, not at some later unrelated refresh
 perform _sf_refresh(x) from unnest(touched) x;
 return jsonb_build_object('updated',n); end$$;

-- Preview = the same apply inside a sub-transaction that is always rolled back, so discount/remaining/credit match the result.
create or replace function public.sf_reprice_preview(_price uuid,_mode text,_students uuid[] default null) returns jsonb language plpgsql volatile security definer set search_path=public as $$
 declare s uuid; p sf_prices; rows jsonb; r record; touched uuid[]:='{}'; begin
 select * into p from sf_prices where id=_price; s:=p.school_id; perform _sf_guard(s,'setup');
 if _mode not in('unpaid','selected') then raise exception 'خيار غير صالح'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from _sf_reprice_rows(_price,_mode,_students) x;
 begin
  for r in select * from _sf_reprice_rows(_price,_mode,_students) where eligible loop
   update sf_obligations set original=r.new_amount,amount=r.new_amount where id=r.obligation_id;
   if not r.student_id=any(touched) then touched:=touched||r.student_id; end if;
  end loop;
  perform _sf_refresh(x) from unnest(touched) x;
  select coalesce(jsonb_agg(case when (x->>'eligible')::boolean then x||jsonb_build_object('discount',(_sf_balance((x->>'obligation_id')::uuid)->>'discount')::numeric,
     'remaining_after',(_sf_balance((x->>'obligation_id')::uuid)->>'remaining')::numeric,'credit_after',(_sf_balance((x->>'obligation_id')::uuid)->>'credit')::numeric) else x end),'[]')
   into rows from jsonb_array_elements(rows) x;
  raise exception 'sf_preview_rollback' using errcode='P0R01';
 exception when sqlstate 'P0R01' then null;
 end;
 return jsonb_build_object('rows',rows,'affected',(select count(distinct x->>'student_id') from jsonb_array_elements(rows) x where (x->>'eligible')::boolean),
  'difference',(select coalesce(sum((x->>'new_amount')::numeric-(x->>'old_amount')::numeric),0)::text from jsonb_array_elements(rows) x where (x->>'eligible')::boolean),
  'credit',(select coalesce(sum((x->>'credit_after')::numeric),0)::text from jsonb_array_elements(rows) x where (x->>'eligible')::boolean)); end$$;
revoke all on function public.sf_reprice_preview(uuid,text,uuid[]),public.sf_reprice_apply(uuid,text,uuid[],text) from public,anon;
grant execute on function public.sf_reprice_preview(uuid,text,uuid[]),public.sf_reprice_apply(uuid,text,uuid[],text) to authenticated;
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
create or replace function public.sf_collection_lines(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare ystart date; yk text;
begin
 perform _sf_guard(_school,'view');
 select start_date,name into ystart,yk from academic_years where id=_year;
 return coalesce((select jsonb_agg(jsonb_build_object('collection_id',c.id,'paid_at',c.paid_at,'created_at',c.created_at,'method',c.method,'status',c.status,'actor',coalesce(_adm_name(c.created_by),''),
   'student_id',st.id,'name',st.full_name,'cls',private._sf_cls(st.id),'school',sc.name,'kind',b.kind,'term',b.term,'year',y.name,
   'previous',_year is not null and b.year_id<>_year and y.start_date<ystart,'amount',a.amount,'receipt',(select r.number from sf_receipts r where r.collection_id=c.id)) order by c.paid_at desc, c.created_at desc)
  from sf_collections c join sf_allocations a on a.collection_id=c.id join sf_obligations b on b.id=a.obligation_id join academic_years y on y.id=b.year_id
  join students st on st.id=c.student_id join schools sc on sc.id=c.school_id
  -- a previous-year item counts in this year only for payments made after it was carried into this year (no double counting across years)
  where c.school_id=_school and (_year is null or b.year_id=_year or (y.start_date<ystart and exists(select 1 from sf_carries cr where cr.obligation_id=b.id and cr.to_key=yk and c.created_at>=cr.created_at)))),'[]'::jsonb);
end $function$;

create or replace function public.sf_dashboard(_school uuid,_year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare r jsonb; yk text; begin
 perform _sf_guard(_school,'view'); yk:=(select name from academic_years where id=_year);
 with ob as (select b.*, _sf_balance(b.id) bal from sf_obligations b where b.school_id=_school and (_year is null or b.year_id=_year) and b.status<>'void'),
 prev as (select distinct b.id,b.student_id,b.due_date,b.status,ca.created_at carried_at,_sf_balance(b.id) bal from sf_carries ca join sf_obligations b on b.id=ca.obligation_id where yk is not null and ca.to_key=yk and b.school_id=_school),
 per as (select student_id, sum((bal->>'net')::numeric) net, sum((bal->>'recorded')::numeric) rec, sum((bal->>'remaining')::numeric) rem, bool_and(status='exempt' or (bal->>'net')::numeric=0) ex from ob group by student_id),
 -- cash received in this year: allocations to this year's items + to carried items after their carry (credit use is not a collection)
 col as (select c.id,c.paid_at,sum(a.amount) amt from sf_collections c join sf_allocations a on a.collection_id=c.id
   where c.status<>'reversed' and (a.obligation_id in(select id from ob) or exists(select 1 from prev where prev.id=a.obligation_id and c.created_at>=prev.carried_at)) group by c.id,c.paid_at)
 select jsonb_build_object(
  'tuition',coalesce((select sum((bal->>'gross')::numeric) from ob where kind='tuition'),0),
  'transport',coalesce((select sum((bal->>'gross')::numeric) from ob where kind='transport'),0),
  'discount',coalesce((select sum((bal->>'discount')::numeric) from ob),0),
  'sibling',coalesce((select sum(a.amount) from sf_applied a join ob on ob.id=a.obligation_id join sf_discounts d on d.id=a.discount_id where a.active and d.sibling_min is not null),0),
  'net',coalesce((select sum((bal->>'net')::numeric) from ob),0),
  'recorded',coalesce((select sum((bal->>'recorded')::numeric) from ob),0),
  'cash',coalesce((select sum((bal->>'cash')::numeric) from ob),0),
  'remaining',coalesce((select sum((bal->>'remaining')::numeric) from ob),0),
  'overdue',coalesce((select sum((bal->>'remaining')::numeric) from ob where status='pending' and due_date is not null and due_date<_sf_today()),0),
  'credit',coalesce((select sum((bal->>'credit')::numeric) from ob),0),
  'previous_remaining',coalesce((select sum((bal->>'remaining')::numeric) from prev),0),
  'previous_credit',coalesce((select sum((bal->>'credit')::numeric) from prev),0),
  'previous_overdue',coalesce((select sum((bal->>'remaining')::numeric) from prev where status='pending' and due_date<_sf_today()),0),
  'previous_students',(select count(distinct student_id) from prev where (bal->>'remaining')::numeric>0),
  'previous_collected',coalesce((select sum(a.amount) from sf_allocations a join sf_collections c on c.id=a.collection_id and c.status<>'reversed' join prev on prev.id=a.obligation_id where c.created_at>=prev.carried_at),0),
  'paid_full',(select count(*) from per where not ex and rem=0),
  'paid_partial',(select count(*) from per where not ex and rem>0 and rec>0),
  'unpaid',(select count(*) from per where not ex and rec=0 and rem>0),
  'exempt',(select count(*) from per where ex),
  'today',coalesce((select sum(amt) from col where paid_at=_sf_today()),0),
  'month',coalesce((select sum(amt) from col where date_trunc('month',paid_at)=date_trunc('month',_sf_today())),0),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('day',d,'amount',s) order by d desc) from (select paid_at d,sum(amt) s from col where paid_at>=_sf_today()-30 group by paid_at) x),'[]'),
  'monthly',coalesce((select jsonb_agg(jsonb_build_object('month',m,'amount',s) order by m desc) from (select to_char(paid_at,'YYYY-MM') m,sum(amt) s from col group by 1) x),'[]'),
  'updated_at',now()) into r;
 return r; end$function$;
-- 4) sf_adjustments: a credit used for another year's fee is listed in both the source and the target year (see migration 2026-11-24 report test).
