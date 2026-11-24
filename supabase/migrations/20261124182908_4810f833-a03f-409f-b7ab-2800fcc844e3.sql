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