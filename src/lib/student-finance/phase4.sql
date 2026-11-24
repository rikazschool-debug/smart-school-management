alter table public.sf_prices add column if not exists due1 date, add column if not exists due2 date;
alter table public.sf_obligations add column if not exists due_date date;

create or replace function public._sf_due_default() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.due_date is null and new.price_id is not null then
  select case when new.term=1 then p.due1 else p.due2 end into new.due_date from sf_prices p where p.id=new.price_id;
 end if; return new; end$$;
drop trigger if exists sf_obligations_due on public.sf_obligations;
create trigger sf_obligations_due before insert on public.sf_obligations for each row execute function public._sf_due_default();

create or replace function public.sf_price_due_save(_price uuid,_due1 date,_due2 date) returns void language plpgsql security definer set search_path=public as $$
 declare p sf_prices; begin
 select * into p from sf_prices where id=_price for update;
 if p.id is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 perform _sf_guard(p.school_id,'setup');
 update sf_prices set due1=_due1,due2=_due2,updated_at=now() where id=_price;
 perform _sf_event(p.school_id,null,'due_save',_price,jsonb_build_object('due1',p.due1,'due2',p.due2),jsonb_build_object('due1',_due1,'due2',_due2)); end$$;

create or replace function public.sf_due_apply(_price uuid,_reason text) returns integer language plpgsql security definer set search_path=public as $$
 declare p sf_prices; r record; n integer:=0; nd date; begin
 select * into p from sf_prices where id=_price for update;
 if p.id is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 perform _sf_guard(p.school_id,'setup');
 if coalesce(btrim(_reason),'')='' then raise exception 'السبب مطلوب'; end if;
 for r in select b.* from sf_obligations b where b.price_id=_price and b.status='pending' and not b.accounting_confirmed and (_sf_balance(b.id)->>'remaining')::numeric>0 for update loop
  nd:=case when r.term=1 then p.due1 else p.due2 end;
  if nd is distinct from r.due_date then
   update sf_obligations set due_date=nd,updated_at=now() where id=r.id;
   perform _sf_event(r.school_id,r.student_id,'due_apply',r.id,jsonb_build_object('due_date',r.due_date),jsonb_build_object('due_date',nd),_reason); n:=n+1;
  end if; end loop;
 return n; end$$;

create or replace function public.sf_arrears(_school uuid,_year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 perform _sf_guard(_school,'view');
 return coalesce((select jsonb_agg(x order by (x->>'days_late')::int desc nulls last, x->>'name') from (
  select jsonb_build_object('obligation_id',b.id,'student_id',st.id,'name',st.full_name,'school',sc.name,'grade',g.name,'section',se.name,
   'year',y.name,'term',b.term,'kind',b.kind,'due_date',b.due_date,'balance',bal,
   'days_late',case when b.due_date is not null and b.due_date<_sf_today() then _sf_today()-b.due_date end,
   'state',case when b.due_date is null then 'no_due' when b.due_date<_sf_today() then 'overdue' else 'upcoming' end) x
  from sf_obligations b cross join lateral (select _sf_balance(b.id) bal) z
  join students st on st.id=b.student_id join schools sc on sc.id=b.school_id join academic_years y on y.id=b.year_id
  left join lateral (select e.section_id from enrollments e where e.student_id=st.id and e.status='active' limit 1) en on true
  left join sections se on se.id=en.section_id left join grades g on g.id=se.grade_id
  where b.school_id=_school and (_year is null or b.year_id=_year) and b.status='pending' and (bal->>'remaining')::numeric>0 limit 2000) q),'[]'); end$$;

revoke all on function public._sf_due_default() from public,anon,authenticated;
revoke all on function public.sf_price_due_save(uuid,date,date),public.sf_due_apply(uuid,text),public.sf_arrears(uuid,uuid) from public,anon;
grant execute on function public.sf_price_due_save(uuid,date,date),public.sf_due_apply(uuid,text),public.sf_arrears(uuid,uuid) to authenticated;
-- reactivated transport obligations take the price due date only when they have none
create or replace function public._sf_due_reactivate() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.due_date is null and new.price_id is not null and old.status='void' and new.status='pending' then
  select case when new.term=1 then p.due1 else p.due2 end into new.due_date from sf_prices p where p.id=new.price_id;
 end if; return new; end$$;
drop trigger if exists sf_obligations_due_reactivate on public.sf_obligations;
create trigger sf_obligations_due_reactivate before update on public.sf_obligations for each row execute function public._sf_due_reactivate();
revoke all on function public._sf_due_reactivate() from public,anon,authenticated;
-- finance KPIs (sf_dashboard) from the same obligation balances
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
-- siblings list shows verified family even when unplaced
create or replace function public._sf_family(_student uuid) returns table(student_id uuid) language sql stable security definer set search_path=public as $$
 with recursive family(id) as (
 select _student union
 select sg2.student_id from family f join student_guardians sg on sg.student_id=f.id and sg.verified
 join guardians g on g.id=sg.guardian_id join guardians g2 on g2.id=g.id or (g.user_id is not null and g.user_id=g2.user_id) or (g.national_id is not null and length(g.national_id)>0 and g.national_id=g2.national_id)
 join student_guardians sg2 on sg2.guardian_id=g2.id and sg2.verified
 join students st2 on st2.id=sg2.student_id join schools sc2 on sc2.id=st2.school_id
 where sc2.org_id=(select sc.org_id from students st join schools sc on sc.id=st.school_id where st.id=_student))
 select f.id from family f join students st on st.id=f.id where st.status='active'$$;
revoke all on function public._sf_family(uuid) from public,anon,authenticated;

create or replace function public.sf_siblings(_student uuid, _year uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
 declare s uuid; yname text; begin
 select school_id into s from students where id=_student; perform _sf_guard(s,'view');
 select name into yname from academic_years where id=_year;
 return coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.full_name,'national_id',st.national_id,'school',sc.name,'status',st.status,
  'placed',f.rank is not null,
  'grade',(select gr.name from enrollments en join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id join academic_years y on y.id=en.year_id where en.student_id=st.id and en.status='active' and y.name=yname limit 1),
  'stage',(select sg.name from enrollments en join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id join stages sg on sg.id=gr.stage_id join academic_years y on y.id=en.year_id where en.student_id=st.id and en.status='active' and y.name=yname limit 1),
  'rank',f.rank,
  'sibling_discount',(select coalesce(sum(a.amount),0)::text from sf_applied a join sf_obligations b on b.id=a.obligation_id join sf_discounts d on d.id=a.discount_id join academic_years y on y.id=b.year_id where b.student_id=st.id and y.name=yname and a.active and d.sibling_min is not null))
  order by f.rank nulls last,st.full_name)
 from (select fm.student_id, r.rank from _sf_family(_student) fm left join (select student_id,min(rank) rank from (select * from _sf_siblings(_student,_year,1) union all select * from _sf_siblings(_student,_year,2)) u group by student_id) r on r.student_id=fm.student_id) f
 join students st on st.id=f.student_id join schools sc on sc.id=st.school_id),'[]'); end$function$;
-- Phase 5 (applied to test DB): in-app financial notifications to verified guardians (can_follow, with a login).
-- _sf_notify_guardians(student,school,title,body,key) → notifications kind 'finance', link /app, dedupe key per guardian.
-- Trigger sf_receipt_notify (after insert on sf_receipts): «تسجيل دفعة» with amount + internal receipt number, never called official.
-- Trigger sf_reverse_notify (status → reversed on sf_collections): «إلغاء دفعة».
-- sf_remind(_school,_obligations[]): guard 'collect'; only pending, past approved due date, remaining > 0; dedupe 'sf_due:<ob>:<day>' (once per day); logs sf_events 'reminder' without outbox.
