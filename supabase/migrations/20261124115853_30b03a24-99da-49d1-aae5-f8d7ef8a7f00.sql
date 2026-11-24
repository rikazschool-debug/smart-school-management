create or replace function public.sf_dashboard(_school uuid,_year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb; begin
 perform _sf_guard(_school,'view');
 with ob as (select b.*, _sf_balance(b.id) bal from sf_obligations b where b.school_id=_school and (_year is null or b.year_id=_year) and b.status<>'void'),
 per as (select student_id, sum((bal->>'net')::numeric) net, sum((bal->>'recorded')::numeric) rec, sum((bal->>'remaining')::numeric) rem, bool_and(status='exempt' or (bal->>'net')::numeric=0) ex from ob group by student_id),
 col as (select c.id,c.paid_at,sum(a.amount) amt from sf_collections c join sf_allocations a on a.collection_id=c.id join ob on ob.id=a.obligation_id where c.status<>'reversed' group by c.id,c.paid_at)
 select jsonb_build_object(
  'tuition',coalesce((select sum((bal->>'gross')::numeric) from ob where kind='tuition'),0),
  'transport',coalesce((select sum((bal->>'gross')::numeric) from ob where kind='transport'),0),
  'discount',coalesce((select sum((bal->>'discount')::numeric) from ob),0),
  'sibling',coalesce((select sum(a.amount) from sf_applied a join ob on ob.id=a.obligation_id join sf_discounts d on d.id=a.discount_id where a.active and d.kind='sibling'),0),
  'net',coalesce((select sum((bal->>'net')::numeric) from ob),0),
  'recorded',coalesce((select sum((bal->>'recorded')::numeric) from ob),0),
  'remaining',coalesce((select sum((bal->>'remaining')::numeric) from ob),0),
  'overdue',coalesce((select sum((bal->>'remaining')::numeric) from ob where status='pending' and due_date is not null and due_date<_sf_today()),0),
  'credit',coalesce((select sum((bal->>'credit')::numeric) from ob),0),
  'paid_full',(select count(*) from per where not ex and rem=0),
  'paid_partial',(select count(*) from per where not ex and rem>0 and rec>0),
  'unpaid',(select count(*) from per where not ex and rec=0 and rem>0),
  'exempt',(select count(*) from per where ex),
  'today',coalesce((select sum(amt) from col where paid_at=_sf_today()),0),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('day',d,'amount',s) order by d desc) from (select paid_at d,sum(amt) s from col where paid_at>=_sf_today()-30 group by paid_at) x),'[]'),
  'monthly',coalesce((select jsonb_agg(jsonb_build_object('month',m,'amount',s) order by m desc) from (select to_char(paid_at,'YYYY-MM') m,sum(amt) s from col group by 1) x),'[]'),
  'updated_at',now()) into r;
 return r; end$$;
revoke all on function public.sf_dashboard(uuid,uuid) from public,anon;
grant execute on function public.sf_dashboard(uuid,uuid) to authenticated;