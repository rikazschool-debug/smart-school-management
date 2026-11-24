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