-- Student finance phase 3 (additive): price versions + selective re-pricing, pending-creation list, internal receipts.
create table public.sf_price_versions (
 id uuid primary key default gen_random_uuid(), price_id uuid not null references public.sf_prices(id), data jsonb not null,
 changed_by uuid default auth.uid(), created_at timestamptz not null default now());
grant select,insert on public.sf_price_versions to service_role;
alter table public.sf_price_versions enable row level security;
create trigger sf_price_versions_immutable before update or delete on public.sf_price_versions for each row execute function public._sf_immutable();
create function public._sf_price_version_trg() returns trigger language plpgsql security definer set search_path=public as $$begin
 if (old.term1,old.term2,old.status) is distinct from (new.term1,new.term2,new.status) then insert into sf_price_versions(price_id,data) values(old.id,to_jsonb(old)); end if; return new; end$$;
create trigger sf_price_version after update on public.sf_prices for each row execute function public._sf_price_version_trg();

-- Rows affected by applying the price's current values to existing obligations.
create function public._sf_reprice_rows(_price uuid,_mode text,_students uuid[]) returns table(obligation_id uuid,student_id uuid,name text,school text,term integer,old_amount numeric,new_amount numeric,discount numeric,recorded numeric,remaining_before numeric,remaining_after numeric,credit_after numeric,eligible boolean,reason text)
 language sql stable security definer set search_path=public as $$
 with p as (select * from sf_prices where id=_price), b as (
  select o.*, (_sf_balance(o.id)->>'discount')::numeric d,(_sf_balance(o.id)->>'recorded')::numeric r,(_sf_balance(o.id)->>'remaining')::numeric rem,
   case when o.term=1 then p.term1 else p.term2 end na
  from sf_obligations o, p where o.price_id=p.id and o.kind=p.kind and o.status='pending' and (_mode='unpaid' or o.student_id=any(coalesce(_students,'{}'))))
 select b.id,b.student_id,st.full_name,sc.name,b.term,b.amount,b.na,b.d,b.r,b.rem,greatest(0,b.na-b.d-b.r),greatest(0,b.r-greatest(0,b.na-b.d)),
  (b.na<>b.amount and not b.accounting_confirmed and not b.manual_override and b.d<=b.na and (_mode<>'unpaid' or b.r=0)),
  case when b.na=b.amount then 'السعر مطابق' when b.accounting_confirmed then 'معتمد في وافق' when b.manual_override then 'معدل يدويًا' when b.d>b.na then 'الخصومات أكبر من السعر الجديد' when _mode='unpaid' and b.r>0 then 'لديه سداد' else null end
 from b join students st on st.id=b.student_id join schools sc on sc.id=b.school_id order by st.full_name,b.term$$;

create function public.sf_reprice_preview(_price uuid,_mode text,_students uuid[] default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare s uuid; rows jsonb; begin select school_id into s from sf_prices where id=_price; perform _sf_guard(s,'setup');
 if _mode not in('unpaid','selected') then raise exception 'خيار غير صالح'; end if;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from _sf_reprice_rows(_price,_mode,_students) r;
 return jsonb_build_object('rows',rows,'affected',(select count(distinct x->>'student_id') from jsonb_array_elements(rows) x where (x->>'eligible')::boolean),
  'difference',(select coalesce(sum((x->>'new_amount')::numeric-(x->>'old_amount')::numeric),0)::text from jsonb_array_elements(rows) x where (x->>'eligible')::boolean),
  'credit',(select coalesce(sum((x->>'credit_after')::numeric),0)::text from jsonb_array_elements(rows) x where (x->>'eligible')::boolean)); end$$;

create function public.sf_reprice_apply(_price uuid,_mode text,_students uuid[],_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
 declare p sf_prices; r record; n integer:=0; begin
 select * into p from sf_prices where id=_price for update;
 perform _sf_guard(p.school_id,'setup');
 if not is_org_owner((select org_id from schools where id=p.school_id)) then raise exception 'تعديل رسوم الطلاب لمدير النظام فقط' using errcode='42501'; end if;
 if p.status<>'approved' then raise exception 'اعتمد السعر الجديد أولًا'; end if;
 if length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب التعديل مطلوب'; end if;
 if _mode not in('unpaid','selected') then raise exception 'خيار غير صالح'; end if;
 -- Lock the students first, then re-check eligibility against concurrent payments.
 perform 1 from students where id in(select student_id from sf_obligations where price_id=_price) order by id for update;
 for r in select * from _sf_reprice_rows(_price,_mode,_students) where eligible loop
  update sf_obligations set original=r.new_amount,amount=r.new_amount,price_snapshot=to_jsonb(p),updated_at=now() where id=r.obligation_id;
  perform _sf_event(p.school_id,r.student_id,'reprice',r.obligation_id,jsonb_build_object('amount',r.old_amount),jsonb_build_object('amount',r.new_amount,'mode',_mode,'term',r.term),_reason);
  n:=n+1;
 end loop;
 return jsonb_build_object('updated',n); end$$;

-- Students placed this year whose tuition obligations are missing, with the reason.
create function public.sf_pending_creation(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 perform _sf_guard(_school,'setup');
 return coalesce((select jsonb_agg(jsonb_build_object('student_id',r.student_id,'name',r.name,'grade',r.grade,'section',r.section,'terms',r.terms,
  'reason',case when not r.priced then 'no_price' when exists(select 1 from sf_events e where e.student_id=r.student_id and e.action='auto_create_failed') then 'failed' else 'not_created' end,
  'error',(select e.after_data->>'error' from sf_events e where e.student_id=r.student_id and e.action='auto_create_failed' order by e.created_at desc limit 1)) order by r.grade,r.name)
  from _sf_bulk_rows(_school,_year,null,null) r where r.existing<cardinality(r.terms)),'[]'); end$$;

-- Internal receipts: one per collection, numbered per group, snapshot fixed at the end of the paying transaction.
create table public.sf_counters (org_id uuid not null references public.organizations(id), kind text not null, n bigint not null default 0, primary key(org_id,kind));
grant all on public.sf_counters to service_role; alter table public.sf_counters enable row level security;
create table public.sf_receipts (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), school_id uuid not null references public.schools(id),
 student_id uuid not null references public.students(id), collection_id uuid not null unique references public.sf_collections(id), number text not null,
 snapshot jsonb not null, issued_at timestamptz not null default now(), unique(org_id,number));
grant select,insert on public.sf_receipts to service_role; alter table public.sf_receipts enable row level security;
create trigger sf_receipts_immutable before update or delete on public.sf_receipts for each row execute function public._sf_immutable();
create index sf_receipts_school on public.sf_receipts(school_id,issued_at desc);

create function public._sf_receipt_trg() returns trigger language plpgsql security definer set search_path=public as $$
 declare c sf_collections; k bigint; yr uuid; snap jsonb; begin
 select * into c from sf_collections where id=new.id;
 if c.id is null or exists(select 1 from sf_receipts where collection_id=c.id) then return null; end if;
 insert into sf_counters(org_id,kind,n) values(c.org_id,'receipt',1) on conflict(org_id,kind) do update set n=sf_counters.n+1 returning n into k;
 select b.year_id into yr from sf_allocations a join sf_obligations b on b.id=a.obligation_id where a.collection_id=c.id limit 1;
 snap:=jsonb_build_object('school',(select name from schools where id=c.school_id),
  'student',(select jsonb_build_object('name',full_name,'national_id',national_id) from students where id=c.student_id),
  'year',(select name from academic_years where id=yr),'amount',c.amount::text,'method',c.method,'paid_at',c.paid_at,'ref',c.ref,'payer',c.payer,'notes',c.notes,
  'actor',coalesce(_adm_name(c.created_by),''),'created_at',c.created_at,
  'allocations',(select coalesce(jsonb_agg(jsonb_build_object('term',b.term,'kind',b.kind,'amount',a.amount::text) order by b.term,b.kind),'[]') from sf_allocations a join sf_obligations b on b.id=a.obligation_id where a.collection_id=c.id),
  'after',_sf_summary(c.student_id,yr)->'annual');
 insert into sf_receipts(org_id,school_id,student_id,collection_id,number,snapshot) values(c.org_id,c.school_id,c.student_id,c.id,'RC-'||lpad(k::text,6,'0'),snap);
 return null; end$$;
create constraint trigger sf_receipt_issue after insert on public.sf_collections deferrable initially deferred for each row execute function public._sf_receipt_trg();

create function public._sf_receipt_json(r sf_receipts) returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(r)||jsonb_build_object('status',(select case when status='reversed' then 'cancelled' else 'valid' end from sf_collections where id=r.collection_id),'official',false)$$;

create function public.sf_receipts(_school uuid,_q text default null,_from date default null,_to date default null,_method text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 perform _sf_guard(_school,'view');
 return coalesce((select jsonb_agg(_sf_receipt_json(r) order by r.issued_at desc) from (select * from sf_receipts r where r.school_id=_school
  and (_q is null or r.number ilike '%'||_q||'%' or coalesce(r.snapshot->>'ref','') ilike '%'||_q||'%' or r.snapshot->'student'->>'name' ilike '%'||_q||'%')
  and (_from is null or (r.snapshot->>'paid_at')::date>=_from) and (_to is null or (r.snapshot->>'paid_at')::date<=_to) and (_method is null or r.snapshot->>'method'=_method)
  order by r.issued_at desc limit 500) r),'[]'); end$$;

create function public.sf_student_receipts(_student uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare s uuid; begin select school_id into s from students where id=_student;
 if not (coalesce(_sf_ok(s,'view'),false) or (auth.uid() is not null and coalesce(is_guardian_of(_student),false))) then raise exception 'غير مصرح' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(_sf_receipt_json(r) order by r.issued_at desc) from sf_receipts r where r.student_id=_student),'[]'); end$$;

revoke all on function public._sf_price_version_trg(),public._sf_reprice_rows(uuid,text,uuid[]),public._sf_receipt_trg(),public._sf_receipt_json(sf_receipts) from public,anon,authenticated;
revoke all on function public.sf_reprice_preview(uuid,text,uuid[]),public.sf_reprice_apply(uuid,text,uuid[],text),public.sf_pending_creation(uuid,uuid),public.sf_receipts(uuid,text,date,date,text),public.sf_student_receipts(uuid) from public,anon;
grant execute on function public.sf_reprice_preview(uuid,text,uuid[]),public.sf_reprice_apply(uuid,text,uuid[],text),public.sf_pending_creation(uuid,uuid),public.sf_receipts(uuid,text,date,date,text),public.sf_student_receipts(uuid) to authenticated;

-- Placement trigger now also records a permanent «no price» event.
create or replace function public._sf_enroll_trg() returns trigger language plpgsql security definer set search_path=public as $$
 declare o uuid; r integer; u uuid; sname text; begin
 if new.status<>'active' then return new; end if;
 select org_id into o from schools where id=new.school_id;
 if not section_enabled(o,'finance') or not exists(select 1 from sf_prices where school_id=new.school_id and year_id=new.year_id and kind='tuition') then return new; end if;
 begin
  r:=_sf_create_tuition2(new.student_id,new.year_id,'placement');
  if r is null then
   perform _sf_event(new.school_id,new.student_id,'auto_no_price',new.id,null,jsonb_build_object('year',new.year_id));
   select full_name into sname from students where id=new.student_id;
   for u in select user_id from memberships where org_id=o and role='org_owner' and is_active loop
    perform _notify(u,new.school_id,'finance','رسوم غير مهيأة','لم تُنشأ رسوم الطالب '||coalesce(sname,'')||' لأن رسوم صفه غير معتمدة.','/app/finance','sf_noprice:'||new.student_id||':'||new.year_id);
   end loop;
  end if;
 exception when others then
  perform _sf_event(new.school_id,new.student_id,'auto_create_failed',new.id,null,jsonb_build_object('error',sqlerrm));
 end;
 return new; end$$;
