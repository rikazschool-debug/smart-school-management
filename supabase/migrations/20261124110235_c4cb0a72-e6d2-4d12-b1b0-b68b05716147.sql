-- Additive operational finance, unapplied until backup/restore of shared test DB is verified.
-- No backfill, accounting documents, outbound requests, secret changes or production writes.
create table public.sf_prices (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 year_id uuid not null references public.academic_years(id), kind text not null, grade_id uuid references public.grades(id),
 transport_type text not null default '', term1 numeric(14,2) not null, term2 numeric(14,2) not null,
 status text not null default 'draft', notes text, created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant all on public.sf_prices to service_role;
alter table public.sf_prices enable row level security;
create unique index sf_price_unique on public.sf_prices(school_id,year_id,kind,coalesce(grade_id,'00000000-0000-0000-0000-000000000000'::uuid),transport_type);
create table public.sf_discounts (
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),year_key text not null,
 name text not null, description text, value_type text not null,value numeric(14,2) not null,
 starts date not null,ends date not null,kind text not null,terms integer[] not null default '{1,2}',
 school_ids uuid[] not null default '{}',stage_ids uuid[] not null default '{}',grade_ids uuid[] not null default '{}',
 automatic boolean not null default false,stackable boolean not null default false,priority integer not null default 0,
 cap numeric(14,2),fixed_scope text not null default 'per_item',sibling_min integer,sibling_mode text not null default 'all',
 sibling_tiers jsonb not null default '[]',active boolean not null default true,notes text,
 created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(org_id,year_key,name)
);
grant all on public.sf_discounts to service_role;
alter table public.sf_discounts enable row level security;
create table public.sf_obligations (
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students(id),school_id uuid not null references public.schools(id),
 year_id uuid not null references public.academic_years(id),term integer not null,kind text not null,
 price_id uuid references public.sf_prices(id),price_snapshot jsonb not null,original numeric(14,2) not null,amount numeric(14,2) not null,
 status text not null default 'pending',manual_override boolean not null default false,wafeq_id text,accounting_confirmed boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(student_id,year_id,term,kind)
);
grant all on public.sf_obligations to service_role;
alter table public.sf_obligations enable row level security;
create table public.sf_applied (
 id uuid primary key default gen_random_uuid(),obligation_id uuid not null references public.sf_obligations(id),discount_id uuid not null references public.sf_discounts(id),
 snapshot jsonb not null,amount numeric(14,2) not null,active boolean not null default true,manual_override boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(obligation_id,discount_id)
);
grant all on public.sf_applied to service_role;
alter table public.sf_applied enable row level security;
create table public.sf_transport (
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students(id),school_id uuid not null references public.schools(id),
 year_id uuid not null references public.academic_years(id),term integer not null,bus_id uuid references public.mt_buses(id),transport_type text,
 starts date not null,active boolean not null default false,exempt boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(student_id,year_id,term)
);
grant all on public.sf_transport to service_role;
alter table public.sf_transport enable row level security;
create index sf_bus_roster on public.sf_transport(bus_id,year_id,term) where active;
create table public.sf_collections (
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),student_id uuid not null references public.students(id),school_id uuid not null references public.schools(id),
 request_key uuid not null,payload jsonb not null,amount numeric(14,2) not null,method text not null,paid_at date not null,ref text,payer text,notes text,
 status text not null default 'pending_accounting',wafeq_id text,accounting_confirmed boolean not null default false,
 created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,request_key)
);
grant all on public.sf_collections to service_role;
alter table public.sf_collections enable row level security;
create table public.sf_allocations (
 collection_id uuid not null references public.sf_collections(id),obligation_id uuid not null references public.sf_obligations(id),amount numeric(14,2) not null,
 created_at timestamptz not null default now(),primary key(collection_id,obligation_id)
);
grant all on public.sf_allocations to service_role;
alter table public.sf_allocations enable row level security;
create table public.sf_events (
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),school_id uuid not null references public.schools(id),student_id uuid references public.students(id),
 action text not null,subject_id uuid,before_data jsonb,after_data jsonb,reason text,actor uuid default auth.uid(),created_at timestamptz not null default now()
);
grant select,insert on public.sf_events to service_role;
alter table public.sf_events enable row level security;
create index sf_student_events on public.sf_events(student_id,created_at);
create table public.sf_outbox (
 id uuid primary key default gen_random_uuid(),event_id uuid not null unique references public.sf_events(id),state text not null default 'blocked',
 origin text not null default 'rikaz',attempts integer not null default 0,payload jsonb not null,error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
grant all on public.sf_outbox to service_role;
alter table public.sf_outbox enable row level security;
create table public.sf_settings (
 org_id uuid primary key references public.organizations(id),mode text not null default 'disabled',mappings jsonb not null default '{}',
 updated_by uuid default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
grant all on public.sf_settings to service_role;
alter table public.sf_settings enable row level security;

create function public._sf_today() returns date language sql stable set search_path=public as $$select (now() at time zone 'Asia/Riyadh')::date$$;
create function public._sf_ok(_school uuid,_action text) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(auth.uid() is not null and sc.is_active and org.is_active and section_enabled(sc.org_id,'finance') and
 (is_org_owner(sc.org_id) or (_action in ('view','collect','discount','transport','export') and perm_allows(sc.id,'student_finance',_action))),false)
 from schools sc join organizations org on org.id=sc.org_id where sc.id=_school$$;
create function public._sf_guard(_school uuid,_action text) returns void language plpgsql security definer set search_path=public as $$begin
 if not coalesce(_sf_ok(_school,_action),false) then raise exception 'ليست لديك صلاحية مالية لهذا الفرع' using errcode='42501'; end if; end$$;
create function public._sf_immutable() returns trigger language plpgsql set search_path=public as $$begin raise exception 'السجل المالي التاريخي محمي'; end$$;
create trigger sf_events_immutable before update or delete on public.sf_events for each row execute function public._sf_immutable();
create function public._sf_event(_school uuid,_student uuid,_action text,_subject uuid,_before jsonb,_after jsonb,_reason text default null)
 returns uuid language plpgsql security definer set search_path=public as $$declare eid uuid; begin
 insert into sf_events(org_id,school_id,student_id,action,subject_id,before_data,after_data,reason)
 values((select org_id from schools where id=_school),_school,_student,_action,_subject,_before,_after,_reason) returning id into eid;
 insert into sf_outbox(event_id,payload) values(eid,jsonb_build_object('event_id',eid,'action',_action,'subject_id',_subject));
 return eid; end$$;
create function public._sf_validate() returns trigger language plpgsql set search_path=public as $$begin
 if tg_table_name='sf_prices' then
  if new.kind not in ('tuition','transport') or new.status not in ('draft','approved','inactive') or new.term1<0 or new.term2<0 or new.term1='NaN'::numeric or new.term2='NaN'::numeric then raise exception 'تهيئة رسوم غير صالحة'; end if;
  if not exists(select 1 from academic_years where id=new.year_id and school_id=new.school_id) then raise exception 'العام خارج الفرع'; end if;
  if new.kind='tuition' then
   if new.transport_type<>'' or not exists(select 1 from grades where id=new.grade_id and school_id=new.school_id) then raise exception 'اختر صفاً من الفرع'; end if;
  elsif new.grade_id is not null or new.transport_type not in ('round_trip','outbound','return') then raise exception 'نوع نقل غير صالح'; end if;
 elsif tg_table_name='sf_discounts' then
  if length(btrim(new.name))=0 or length(new.name)>160 or length(btrim(new.year_key))=0 or new.value_type not in ('percent','fixed') or new.kind not in ('tuition','transport','both') or new.value<0 or new.value='NaN'::numeric or (new.value_type='percent' and new.value>100) or new.starts>new.ends or (new.cap is not null and (new.cap<0 or new.cap='NaN'::numeric)) or new.fixed_scope not in ('per_item','per_term','total') or new.sibling_mode not in ('all','second','tiers') or (new.sibling_min is not null and new.sibling_min<2) or cardinality(new.terms)=0 or not new.terms <@ array[1,2] then raise exception 'تهيئة خصم غير صالحة'; end if;
  if exists(select 1 from unnest(new.school_ids) x where not exists(select 1 from schools where id=x and org_id=new.org_id)) or exists(select 1 from unnest(new.grade_ids) x where not exists(select 1 from grades g join schools sc on sc.id=g.school_id where g.id=x and sc.org_id=new.org_id)) or exists(select 1 from unnest(new.stage_ids) x where not exists(select 1 from stages g join schools sc on sc.id=g.school_id where g.id=x and sc.org_id=new.org_id)) then raise exception 'نطاق الخصم خارج المجموعة'; end if;
 elsif tg_table_name='sf_obligations' then
  if new.term not in (1,2) or new.kind not in ('tuition','transport') or new.amount<0 or new.original<0 or new.amount='NaN'::numeric or new.original='NaN'::numeric or new.status not in ('pending','exempt','void') then raise exception 'مستحق غير صالح'; end if;
  if not exists(select 1 from students where id=new.student_id and school_id=new.school_id) or not exists(select 1 from academic_years where id=new.year_id and school_id=new.school_id) then raise exception 'نطاق مستحق غير صالح'; end if;
 elsif tg_table_name='sf_applied' then
  if new.amount<0 or new.amount='NaN'::numeric then raise exception 'خصم غير صالح'; end if;
 elsif tg_table_name='sf_transport' then
  if new.term not in (1,2) or (new.active and (new.bus_id is null or new.transport_type not in ('round_trip','outbound','return'))) then raise exception 'اشتراك غير صالح'; end if;
 elsif tg_table_name='sf_settings' then
  if new.mode<>'disabled' or new.mappings::text ~* '(api.?key|secret|password|token)' then raise exception 'الاتصال بوافق معطل؛ لا تحفظ مفاتيح هنا'; end if;
 end if;
 if tg_op='UPDATE' then new.updated_at=now(); end if;
 return new; end$$;
create trigger sf_prices_validate before insert or update on public.sf_prices for each row execute function public._sf_validate();
create trigger sf_discounts_validate before insert or update on public.sf_discounts for each row execute function public._sf_validate();
create trigger sf_obligations_validate before insert or update on public.sf_obligations for each row execute function public._sf_validate();
create trigger sf_applied_validate before insert or update on public.sf_applied for each row execute function public._sf_validate();
create trigger sf_transport_validate before insert or update on public.sf_transport for each row execute function public._sf_validate();
create trigger sf_settings_validate before insert or update on public.sf_settings for each row execute function public._sf_validate();

create function public.sf_setup_save(_school uuid,_kind text,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
 declare v uuid; old jsonb; o uuid; begin
 perform _sf_guard(_school,'setup'); select org_id into o from schools where id=_school;
 v:=nullif(_p->>'id','')::uuid;
 if _kind='price' then
  if v is not null then select to_jsonb(p) into old from sf_prices p where id=v and school_id=_school for update; if old is null then raise exception 'غير مصرح' using errcode='42501'; end if; end if;
  if v is null then insert into sf_prices(school_id,year_id,kind,grade_id,transport_type,term1,term2,status,notes)
   values(_school,(_p->>'year_id')::uuid,_p->>'kind',nullif(_p->>'grade_id','')::uuid,coalesce(_p->>'transport_type',''),(_p->>'term1')::numeric,(_p->>'term2')::numeric,coalesce(_p->>'status','draft'),_p->>'notes') returning id into v;
  else update sf_prices set term1=(_p->>'term1')::numeric,term2=(_p->>'term2')::numeric,status=_p->>'status',notes=_p->>'notes' where id=v; end if;
 elsif _kind='discount' then
  if v is not null then select to_jsonb(d) into old from sf_discounts d where id=v and org_id=o for update; if old is null then raise exception 'غير مصرح' using errcode='42501'; end if; end if;
  if v is null then v:=gen_random_uuid(); end if;
  insert into sf_discounts(id,org_id,year_key,name,description,value_type,value,starts,ends,kind,terms,school_ids,stage_ids,grade_ids,automatic,stackable,priority,cap,fixed_scope,sibling_min,sibling_mode,sibling_tiers,active,notes)
   values(v,o,_p->>'year_key',_p->>'name',_p->>'description',_p->>'value_type',(_p->>'value')::numeric,(_p->>'starts')::date,(_p->>'ends')::date,_p->>'kind',
   array(select jsonb_array_elements_text(coalesce(_p->'terms','[1,2]'))::integer),array(select jsonb_array_elements_text(coalesce(_p->'school_ids','[]'))::uuid),array(select jsonb_array_elements_text(coalesce(_p->'stage_ids','[]'))::uuid),array(select jsonb_array_elements_text(coalesce(_p->'grade_ids','[]'))::uuid),
   coalesce((_p->>'automatic')::boolean,false),coalesce((_p->>'stackable')::boolean,false),coalesce((_p->>'priority')::integer,0),nullif(_p->>'cap','')::numeric,coalesce(_p->>'fixed_scope','per_item'),nullif(_p->>'sibling_min','')::integer,coalesce(_p->>'sibling_mode','all'),coalesce(_p->'sibling_tiers','[]'),coalesce((_p->>'active')::boolean,true),_p->>'notes')
   on conflict(id) do update set name=excluded.name,description=excluded.description,value_type=excluded.value_type,value=excluded.value,starts=excluded.starts,ends=excluded.ends,kind=excluded.kind,terms=excluded.terms,school_ids=excluded.school_ids,stage_ids=excluded.stage_ids,grade_ids=excluded.grade_ids,automatic=excluded.automatic,stackable=excluded.stackable,priority=excluded.priority,cap=excluded.cap,fixed_scope=excluded.fixed_scope,sibling_min=excluded.sibling_min,sibling_mode=excluded.sibling_mode,sibling_tiers=excluded.sibling_tiers,active=excluded.active,notes=excluded.notes;
 else raise exception 'نوع تهيئة غير صالح'; end if;
 perform _sf_event(_school,null,'setup_'||_kind,v,old,_p);
 return v; end$$;
create function public.sf_setup(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$declare o uuid; begin
 perform _sf_guard(_school,'setup'); select org_id into o from schools where id=_school;
 return jsonb_build_object('prices',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from sf_prices p where school_id=_school),'[]'),
 'discounts',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('date_status',case when not active then 'disabled' when _sf_today()<starts then 'scheduled' when _sf_today()>ends then 'expired' else 'active' end)) from sf_discounts d where org_id=o),'[]'),
 'years',coalesce((select jsonb_agg(to_jsonb(y)) from academic_years y where school_id=_school),'[]'),
 'grades',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'stage_id',g.stage_id,'stage',(select name from stages where id=g.stage_id))) from grades g where school_id=_school),'[]'),
 'schools',coalesce((select jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name)) from schools sc where org_id=o),'[]'),
 'integration',jsonb_build_object('mode','disabled','mappings',coalesce((select mappings from sf_settings where org_id=o),'{}'))); end$$;
create function public.sf_copy_prices(_school uuid,_from uuid,_to uuid) returns integer language plpgsql security definer set search_path=public as $$declare n integer; begin
 perform _sf_guard(_school,'setup');
 if _from=_to or not exists(select 1 from academic_years where id=_from and school_id=_school) or not exists(select 1 from academic_years where id=_to and school_id=_school) then raise exception 'اختر عامين مختلفين من الفرع'; end if;
 insert into sf_prices(school_id,year_id,kind,grade_id,transport_type,term1,term2,notes) select school_id,_to,kind,grade_id,transport_type,term1,term2,notes from sf_prices where school_id=_school and year_id=_from on conflict do nothing;
 get diagnostics n=row_count; perform _sf_event(_school,null,'copy_prices',_to,null,jsonb_build_object('from',_from,'count',n)); return n; end$$;

-- Verified guardian graph across branches; year equality uses the existing central academic year name.
create function public._sf_siblings(_student uuid,_year uuid,_term integer) returns table(student_id uuid,rank bigint) language sql stable security definer set search_path=public as $$
 with recursive family(id) as (
 select _student union
 select sg2.student_id from family f join student_guardians sg on sg.student_id=f.id and sg.verified
 join guardians g on g.id=sg.guardian_id join guardians g2 on g2.id=g.id or (g.user_id is not null and g.user_id=g2.user_id) or (g.national_id is not null and length(g.national_id)>0 and g.national_id=g2.national_id)
 join student_guardians sg2 on sg2.guardian_id=g2.id and sg2.verified
 join students st2 on st2.id=sg2.student_id join schools sc2 on sc2.id=st2.school_id
 where sc2.org_id=(select sc.org_id from students st join schools sc on sc.id=st.school_id where st.id=_student)
 ), eligible as (select distinct st.id,st.birth_date,st.created_at from family f join students st on st.id=f.id join schools sc on sc.id=st.school_id and sc.is_active
 where st.status='active' and exists(select 1 from enrollments en join academic_years y on y.id=en.year_id join sections se on se.id=en.section_id left join terms t on t.id=se.term_id
 where en.student_id=st.id and en.status='active' and y.name=(select name from academic_years where id=_year)
 and (t.id is null or t.name=(select name from terms where year_id=_year order by start_date,name offset (_term-1) limit 1))))
 select id,row_number() over(order by birth_date nulls last,created_at,id) from eligible$$;
create function public._sf_discount_amount(_ob uuid,_discount uuid) returns numeric language plpgsql stable security definer set search_path=public as $$
 declare b sf_obligations; d sf_discounts; g uuid; stg uuid; n integer; r bigint; base numeric; used numeric; val numeric; tier jsonb; begin
 select * into b from sf_obligations where id=_ob; select * into d from sf_discounts where id=_discount;
 if b.id is null or d.id is null or b.status<>'pending' or b.accounting_confirmed or not d.active or _sf_today()<d.starts or _sf_today()>d.ends or not b.term=any(d.terms) or (d.kind<>'both' and d.kind<>b.kind) or d.org_id<>(select org_id from schools where id=b.school_id) or d.year_key<>(select name from academic_years where id=b.year_id) or (cardinality(d.school_ids)>0 and not b.school_id=any(d.school_ids)) then return null; end if;
 select se.grade_id,gr.stage_id into g,stg from enrollments en join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id where en.student_id=b.student_id and en.year_id=b.year_id and en.status='active' order by en.created_at desc limit 1;
 if (cardinality(d.grade_ids)>0 and not coalesce(g=any(d.grade_ids),false)) or (cardinality(d.stage_ids)>0 and not coalesce(stg=any(d.stage_ids),false)) then return null; end if;
 if b.kind='transport' and not exists(select 1 from sf_transport where student_id=b.student_id and year_id=b.year_id and term=b.term and active) then return null; end if;
 val:=d.value;
 if d.sibling_min is not null then
  select count(*),max(rank) filter(where student_id=b.student_id) into n,r from _sf_siblings(b.student_id,b.year_id,b.term);
  if n<d.sibling_min or r is null or (d.sibling_mode='second' and r=1) then return null; end if;
  if d.sibling_mode='tiers' then select x into tier from jsonb_array_elements(d.sibling_tiers) x where (x->>'rank')::integer<=r order by (x->>'rank')::integer desc limit 1; if tier is null then return null; end if; val:=(tier->>'value')::numeric; end if;
 end if;
 select coalesce(sum(a.amount),0) into used from sf_applied a where a.obligation_id=b.id and a.active and a.discount_id<>d.id;
 if exists(select 1 from sf_applied a join sf_discounts x on x.id=a.discount_id where a.obligation_id=b.id and a.active and a.discount_id<>d.id and (not d.stackable or not coalesce((a.snapshot->>'stackable')::boolean,x.stackable))) then return null; end if;
 base:=greatest(0,b.amount-used);
 if d.value_type='percent' then val:=round(base*val/100,2); end if;
 if d.cap is not null then val:=least(val,d.cap); end if;
 if d.value_type='fixed' and d.fixed_scope<>'per_item' then
  -- A fixed total is a budget, never copied to every selected item/term.
  select coalesce(sum(a.amount),0) into used from sf_applied a join sf_obligations x on x.id=a.obligation_id where x.student_id=b.student_id and x.year_id=b.year_id and a.discount_id=d.id and a.active and x.id<>b.id and (d.fixed_scope='total' or x.term=b.term);
  val:=greatest(0,val-used);
 end if;
 return least(base,val); end$$;
create function public._sf_apply(_ob uuid,_discount uuid) returns void language plpgsql security definer set search_path=public as $$declare b sf_obligations; d sf_discounts; v numeric; old jsonb; aid uuid; begin
 select * into b from sf_obligations where id=_ob for update; select * into d from sf_discounts where id=_discount;
 select to_jsonb(a) into old from sf_applied a where obligation_id=_ob and discount_id=_discount;
 if coalesce((old->>'manual_override')::boolean,false) then return; end if;
 v:=_sf_discount_amount(_ob,_discount); if v is null then
 if d.sibling_min is not null and d.automatic and old is not null and (old->>'active')::boolean and not b.accounting_confirmed and _sf_today() between d.starts and d.ends then
  update sf_applied set active=false where obligation_id=b.id and discount_id=d.id;
  perform _sf_event(b.school_id,b.student_id,'sibling_ineligible',(old->>'id')::uuid,old,jsonb_build_object('amount',0,'term',b.term,'kind',b.kind));
 end if;
 return; end if;
 insert into sf_applied(obligation_id,discount_id,snapshot,amount) values(_ob,_discount,to_jsonb(d),v)
 on conflict(obligation_id,discount_id) do update set amount=excluded.amount,active=true,snapshot=excluded.snapshot,updated_at=now() where not sf_applied.manual_override and not (select accounting_confirmed from sf_obligations where id=_ob) returning id into aid;
 if aid is not null and (old is null or (old->>'amount')::numeric<>v or not (old->>'active')::boolean) then perform _sf_event(b.school_id,b.student_id,'discount_apply',aid,old,jsonb_build_object('obligation_id',_ob,'amount',v,'discount',d.name)); end if; end$$;
create function public._sf_refresh(_student uuid) returns void language plpgsql security definer set search_path=public as $$declare b record; d record; begin
 perform 1 from students where id=_student for update;
 for b in select * from sf_obligations where student_id=_student and status='pending' and not accounting_confirmed order by year_id,term,kind,id loop
  for d in select id from sf_discounts where automatic and active and org_id=(select org_id from schools where id=b.school_id) order by priority desc,id loop perform _sf_apply(b.id,d.id); end loop;
 end loop; end$$;
create function public._sf_create_tuition(_student uuid,_year uuid) returns void language plpgsql security definer set search_path=public as $$declare p sf_prices; st students; g uuid; t integer; bid uuid; begin
 select * into st from students where id=_student for update;
 select se.grade_id into g from enrollments en join sections se on se.id=en.section_id where en.student_id=_student and en.year_id=_year and en.status='active' order by en.created_at desc limit 1;
 select * into p from sf_prices where school_id=st.school_id and year_id=_year and grade_id=g and kind='tuition' and status='approved';
 if p.id is null then raise exception 'الرسوم الدراسية غير مهيأة أو غير معتمدة'; end if;
 for t in 1..2 loop
  insert into sf_obligations(student_id,school_id,year_id,term,kind,price_id,price_snapshot,original,amount) values(st.id,st.school_id,_year,t,'tuition',p.id,to_jsonb(p),case when t=1 then p.term1 else p.term2 end,case when t=1 then p.term1 else p.term2 end) on conflict do nothing returning id into bid;
  if bid is not null then perform _sf_event(st.school_id,st.id,'obligation_create',bid,null,jsonb_build_object('term',t,'kind','tuition','amount',case when t=1 then p.term1 else p.term2 end)); end if;
 end loop;
 perform _sf_refresh(st.id); end$$;
create function public.sf_create_tuition(_student uuid,_year uuid) returns void language plpgsql security definer set search_path=public as $$declare s uuid; begin select school_id into s from students where id=_student; perform _sf_guard(s,'setup'); perform _sf_create_tuition(_student,_year); end$$;

create function public.sf_transport_save(_student uuid,_year uuid,_term integer,_p jsonb) returns void language plpgsql security definer set search_path=public as $$
 declare st students; b mt_buses; old sf_transport; price sf_prices; ob sf_obligations; a boolean; val numeric; n integer; begin
 select * into st from students where id=_student for update; perform _sf_guard(st.school_id,'transport');
 if _term not in(1,2) or not exists(select 1 from enrollments where student_id=st.id and year_id=_year and status='active') then raise exception 'تسجيل الطالب أو الفصل غير صالح'; end if;
 select * into old from sf_transport where student_id=st.id and year_id=_year and term=_term;
 a:=coalesce((_p->>'active')::boolean,false);
 if a then
  select * into b from mt_buses where id=(_p->>'bus_id')::uuid and school_id=st.school_id and active and op_status='available' for update;
  if b.id is null then raise exception 'الباص غير متاح لهذا الفرع'; end if;
  select count(*) into n from sf_transport tr join academic_years y on y.id=tr.year_id where tr.bus_id=b.id and tr.term=_term and tr.active and tr.student_id<>st.id and y.name=(select name from academic_years where id=_year);
  if n>=b.capacity then raise exception 'سعة الباص مكتملة'; end if;
  select * into price from sf_prices where school_id=st.school_id and year_id=_year and kind='transport' and transport_type=_p->>'transport_type' and status='approved';
  if price.id is null then raise exception 'رسوم النقل غير مهيأة أو غير معتمدة'; end if;
 end if;
 select * into ob from sf_obligations where student_id=st.id and year_id=_year and term=_term and kind='transport' for update;
 if ob.accounting_confirmed then raise exception 'المستحق مرتبط بوافق؛ يتطلب تسوية معتمدة'; end if;
 insert into sf_transport(student_id,school_id,year_id,term,bus_id,transport_type,starts,active,exempt) values(st.id,st.school_id,_year,_term,case when a then b.id end,case when a then _p->>'transport_type' end,coalesce((_p->>'starts')::date,_sf_today()),a,coalesce(old.exempt,false))
 on conflict(student_id,year_id,term) do update set bus_id=excluded.bus_id,transport_type=excluded.transport_type,starts=excluded.starts,active=excluded.active;
 if a and not coalesce(old.exempt,false) and not coalesce(ob.manual_override,false) then
  val:=case when _term=1 then price.term1 else price.term2 end;
  insert into sf_obligations(student_id,school_id,year_id,term,kind,price_id,price_snapshot,original,amount) values(st.id,st.school_id,_year,_term,'transport',price.id,to_jsonb(price),val,val)
  on conflict(student_id,year_id,term,kind) do update set amount=excluded.amount,price_id=excluded.price_id,price_snapshot=excluded.price_snapshot,status='pending',updated_at=now();
 elsif not a and ob.id is not null then update sf_obligations set status='void',amount=0 where id=ob.id; end if;
 perform _sf_event(st.school_id,st.id,'transport_save',coalesce(ob.id,b.id),to_jsonb(old),_p||jsonb_build_object('term',_term)); perform _sf_refresh(st.id); end$$;

create function public.sf_discount_preview(_student uuid,_discount uuid,_obligations uuid[]) returns jsonb language plpgsql security definer set search_path=public as $$declare result jsonb; begin
 -- Preview runs the exact transactional write path, then rolls it back including audit/outbox.
 begin
  perform sf_discount_apply(_student,_discount,_obligations);
  select coalesce(jsonb_agg(jsonb_build_object('obligation_id',b.id,'original',b.amount,'discount',a.amount,'balance',_sf_balance(b.id),'term',b.term,'kind',b.kind)),'[]') into result
  from sf_obligations b join sf_applied a on a.obligation_id=b.id and a.discount_id=_discount where b.student_id=_student and b.id=any(_obligations);
  raise exception 'preview_rollback' using errcode='P9001';
 exception when sqlstate 'P9001' then return result; end;
 end$$;
create function public.sf_discount_apply(_student uuid,_discount uuid,_obligations uuid[]) returns void language plpgsql security definer set search_path=public as $$declare s uuid; b record; begin
 select school_id into s from students where id=_student for update; perform _sf_guard(s,'discount');
 if cardinality(_obligations)=0 or cardinality(_obligations)>4 or exists(select 1 from unnest(_obligations) x where not exists(select 1 from sf_obligations where id=x and student_id=_student)) then raise exception 'اختر مستحقات الطالب'; end if;
 for b in select id from sf_obligations where id=any(_obligations) order by term,kind,id loop
  if exists(select 1 from sf_applied where obligation_id=b.id and discount_id=_discount) then raise exception 'الخصم مطبق مسبقاً أو مستثنى'; end if;
  if _sf_discount_amount(b.id,_discount) is null then raise exception 'الخصم غير متاح أو يخالف شروط الجمع'; end if;
  perform _sf_apply(b.id,_discount);
 end loop; end$$;
create function public.sf_override(_student uuid,_action text,_id uuid,_amount numeric,_reason text) returns void language plpgsql security definer set search_path=public as $$
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
 elsif _action in('transport_exempt','transport_cancel') then
  update sf_obligations set amount=0,status=case when _action='transport_exempt' then 'exempt' else 'void' end,manual_override=true where id=b.id;
  update sf_applied set active=false where obligation_id=b.id;
  update sf_transport set exempt=true,active=case when _action='transport_cancel' then false else active end where student_id=_student and year_id=b.year_id and term=b.term;
 else raise exception 'إجراء غير صالح'; end if;
 perform _sf_event(s,_student,_action,_id,old,jsonb_build_object('amount',_amount,'term',b.term,'kind',b.kind),_reason); end$$;

create function public._sf_balance(_ob uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with amounts as(select b.amount,coalesce((select sum(a.amount) from sf_applied a where a.obligation_id=b.id and a.active),0) discount,
 coalesce((select sum(a.amount) from sf_allocations a join sf_collections c on c.id=a.collection_id where a.obligation_id=b.id and c.status<>'reversed'),0) collected from sf_obligations b where b.id=_ob)
 select jsonb_build_object('gross',amount,'discount',discount,'net',greatest(0,amount-discount),'recorded',collected,'remaining',greatest(0,amount-discount-collected),'credit',greatest(0,collected-greatest(0,amount-discount))) from amounts$$;
create function public.sf_collect(_student uuid,_request_key uuid,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
 declare st students; o uuid; old sf_collections; item jsonb; b sf_obligations; v numeric; total numeric:=0; cid uuid; n integer; begin
 select * into st from students where id=_student for update; perform _sf_guard(st.school_id,'collect'); select org_id into o from schools where id=st.school_id;
 select * into old from sf_collections where org_id=o and request_key=_request_key;
 if old.id is not null then if old.student_id<>_student or old.payload<>_p then raise exception 'مفتاح إعادة المحاولة مستخدم لعملية أخرى'; end if; return old.id; end if;
 if _request_key is null or _p->>'method' not in ('cash','bank','mada','credit_card','electronic','other') or not coalesce(jsonb_typeof(_p->'allocations')='array',false) or jsonb_array_length(_p->'allocations') not between 1 and 4 then raise exception 'بيانات سداد غير صالحة'; end if;
 select count(distinct x->>'obligation_id') into n from jsonb_array_elements(_p->'allocations') x; if n<>jsonb_array_length(_p->'allocations') then raise exception 'المستحق مكرر'; end if;
 for item in select x from jsonb_array_elements(_p->'allocations') x order by x->>'obligation_id' loop
  select * into b from sf_obligations where id=(item->>'obligation_id')::uuid and student_id=_student for update;
  v:=(item->>'amount')::numeric;
  if b.id is null or b.status<>'pending' or v is null or v<=0 or v='NaN'::numeric or v<>(round(v,2)) or v>( _sf_balance(b.id)->>'remaining')::numeric then raise exception 'مبلغ السداد غير صالح أو أكبر من المتبقي'; end if;
  total:=total+v;
 end loop;
 insert into sf_collections(org_id,student_id,school_id,request_key,payload,amount,method,paid_at,ref,payer,notes) values(o,st.id,st.school_id,_request_key,_p,total,_p->>'method',(_p->>'paid_at')::date,_p->>'ref',_p->>'payer',_p->>'notes') returning id into cid;
 for item in select * from jsonb_array_elements(_p->'allocations') loop insert into sf_allocations(collection_id,obligation_id,amount) values(cid,(item->>'obligation_id')::uuid,(item->>'amount')::numeric); end loop;
 perform _sf_event(st.school_id,st.id,'collection_record',cid,null,jsonb_build_object('amount',total,'allocations',_p->'allocations','status','pending_accounting'));
 return cid; end$$;
create function public.sf_reverse(_student uuid,_collection uuid,_reason text) returns void language plpgsql security definer set search_path=public as $$declare c sf_collections; s uuid; begin
 select school_id into s from students where id=_student for update; perform _sf_guard(s,'setup');
 select * into c from sf_collections where id=_collection and student_id=_student for update;
 if c.id is null or length(btrim(coalesce(_reason,'')))<3 then raise exception 'اختر العملية وأدخل السبب'; end if;
 if c.accounting_confirmed then raise exception 'العكس المحاسبي يتطلب اعتماد وافق'; end if;
 if c.status='reversed' then return; end if;
 update sf_collections set status='reversed',updated_at=now() where id=c.id;
 perform _sf_event(s,_student,'collection_reverse',c.id,to_jsonb(c),jsonb_build_object('amount',c.amount),_reason); end$$;

create function public._sf_summary(_student uuid,_year uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with sums as(select b.term,sum(b.original) original,sum(b.amount) gross,
 sum((_sf_balance(b.id)->>'discount')::numeric) discount,sum((_sf_balance(b.id)->>'net')::numeric) net,
 sum((_sf_balance(b.id)->>'recorded')::numeric) recorded,sum((_sf_balance(b.id)->>'remaining')::numeric) remaining,sum((_sf_balance(b.id)->>'credit')::numeric) credit
 from sf_obligations b where b.student_id=_student and (_year is null or b.year_id=_year) group by grouping sets((b.term),()))
 select coalesce(jsonb_object_agg(coalesce(term::text,'annual'),jsonb_build_object('original',coalesce(original,0)::text,'gross',coalesce(gross,0)::text,'discount',coalesce(discount,0)::text,'net',coalesce(net,0)::text,'recorded',coalesce(recorded,0)::text,'remaining',coalesce(remaining,0)::text,'credit',coalesce(credit,0)::text,'collection_percent',case when net>0 then round(least(recorded,net)*100/net,2)::text else '0' end)), '{}') from sums$$;
create function public.sf_get(_student uuid,_year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare st students; s schools; family boolean; staff boolean; r jsonb; begin
 select * into st from students where id=_student; select * into s from schools where id=st.school_id;
 staff:=coalesce(_sf_ok(st.school_id,'view'),false); family:=auth.uid() is not null and coalesce(is_guardian_of(st.id),false) and exists(select 1 from enrollments where student_id=st.id and status='active');
 if st.id is null or not s.is_active or not section_enabled(s.org_id,'finance') or not (staff or family) then raise exception 'غير مصرح' using errcode='42501'; end if;
 r:=jsonb_build_object('student',jsonb_build_object('id',st.id,'name',st.full_name,'school_id',s.id,'school',s.name),'mode','operational','accounting_status','disabled','updated_at',now(),
 'caps',jsonb_build_object('setup',staff and _sf_ok(s.id,'setup'),'collect',staff and _sf_ok(s.id,'collect'),'discount',staff and _sf_ok(s.id,'discount'),'transport',staff and _sf_ok(s.id,'transport'),'export',staff and _sf_ok(s.id,'export')),
 'years',coalesce((select jsonb_agg(jsonb_build_object('id',y.id,'name',y.name)) from academic_years y where y.school_id=s.id),'[]'),
 'obligations',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('balance',_sf_balance(b.id)) order by b.term,b.kind) from sf_obligations b where b.student_id=st.id and (_year is null or b.year_id=_year)),'[]'),
 'transport',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('bus',jsonb_build_object('code',bus.code,'plate',bus.plate,'capacity',bus.capacity))) from sf_transport t left join mt_buses bus on bus.id=t.bus_id where t.student_id=st.id and (_year is null or t.year_id=_year)),'[]'),
 'discounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',a.snapshot->>'name','term',b.term,'kind',b.kind)) from sf_applied a join sf_obligations b on b.id=a.obligation_id where b.student_id=st.id and (_year is null or b.year_id=_year)),'[]'),
 'collections',coalesce((select jsonb_agg((to_jsonb(c)-'payload'-'created_by')||jsonb_build_object('allocations',(select jsonb_agg(to_jsonb(a)) from sf_allocations a where a.collection_id=c.id)) order by c.created_at desc) from sf_collections c where c.student_id=st.id and (_year is null or exists(select 1 from sf_allocations a join sf_obligations b on b.id=a.obligation_id where a.collection_id=c.id and b.year_id=_year))),'[]'),
 'summary',_sf_summary(st.id,_year),'invoices','[]'::jsonb,
 'events',case when staff then coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from sf_events e where e.student_id=st.id),'[]') else '[]'::jsonb end,
 'available_discounts',case when staff then coalesce((select jsonb_agg(to_jsonb(d)) from sf_discounts d where d.org_id=s.org_id and d.active and _sf_today() between d.starts and d.ends),'[]') else '[]'::jsonb end,
 'buses',case when staff then coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'plate',b.plate,'capacity',b.capacity,'op_status',b.op_status)) from mt_buses b where b.school_id=s.id and active),'[]') else '[]'::jsonb end);
 return r; end$$;
create function public.sf_children() returns jsonb language plpgsql stable security definer set search_path=public as $$declare r jsonb:='[]'; st record; begin
 if auth.uid() is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 for st in select distinct s.id from students s join student_guardians sg on sg.student_id=s.id and sg.verified and sg.can_follow join guardians g on g.id=sg.guardian_id and g.user_id=auth.uid() join schools sc on sc.id=s.school_id and sc.is_active where s.status='active' and exists(select 1 from enrollments where student_id=s.id and status='active') loop r:=r||jsonb_build_array(sf_get(st.id)); end loop;
 return r; end$$;
create function public.sf_report(_school uuid,_year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 perform _sf_guard(_school,'export');
 return jsonb_build_object('mode','operational','accounting_status','disabled',
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.full_name,'obligations',(select jsonb_agg(jsonb_build_object('term',b.term,'kind',b.kind,'balance',_sf_balance(b.id))) from sf_obligations b where b.student_id=st.id and (_year is null or b.year_id=_year)))) from students st where st.school_id=_school and exists(select 1 from sf_obligations where student_id=st.id and (_year is null or year_id=_year))),'[]'),
 'collections',coalesce((select jsonb_agg(to_jsonb(c)-'payload') from sf_collections c where c.school_id=_school and (_year is null or exists(select 1 from sf_allocations a join sf_obligations b on b.id=a.obligation_id where a.collection_id=c.id and b.year_id=_year))),'[]'),
 'outbox',case when _sf_ok(_school,'setup') then coalesce((select jsonb_agg(to_jsonb(q)) from sf_outbox q join sf_events e on e.id=q.event_id where e.school_id=_school),'[]') else '[]'::jsonb end);
 end$$;
create function public.sf_mapping_save(_school uuid,_mappings jsonb) returns void language plpgsql security definer set search_path=public as $$declare o uuid; begin
 perform _sf_guard(_school,'setup'); select org_id into o from schools where id=_school;
 insert into sf_settings(org_id,mappings) values(o,_mappings) on conflict(org_id) do update set mappings=excluded.mappings,updated_by=auth.uid();
 perform _sf_event(_school,null,'mapping_save',o,null,_mappings); end$$;
create function public.sf_bus_roster(_bus uuid,_year uuid,_term integer) returns jsonb language plpgsql stable security definer set search_path=public as $$declare s uuid; begin
 select school_id into s from mt_buses where id=_bus; perform _sf_guard(s,'transport');
 return coalesce((select jsonb_agg(jsonb_build_object('student_id',st.id,'name',st.full_name,'exempt',t.exempt,'transport_type',t.transport_type)) from sf_transport t join students st on st.id=t.student_id where t.bus_id=_bus and t.year_id=_year and t.term=_term and t.active),'[]'); end$$;
-- Internal helpers are never direct browser endpoints.
revoke all on function public._sf_today(),public._sf_ok(uuid,text),public._sf_guard(uuid,text),public._sf_immutable(),public._sf_event(uuid,uuid,text,uuid,jsonb,jsonb,text),public._sf_validate(),public._sf_siblings(uuid,uuid,integer),public._sf_discount_amount(uuid,uuid),public._sf_apply(uuid,uuid),public._sf_refresh(uuid),public._sf_create_tuition(uuid,uuid),public._sf_balance(uuid),public._sf_summary(uuid,uuid) from public,anon,authenticated;
revoke all on function public.sf_setup_save(uuid,text,jsonb),public.sf_setup(uuid),public.sf_copy_prices(uuid,uuid,uuid),public.sf_create_tuition(uuid,uuid),public.sf_transport_save(uuid,uuid,integer,jsonb),public.sf_discount_preview(uuid,uuid,uuid[]),public.sf_discount_apply(uuid,uuid,uuid[]),public.sf_override(uuid,text,uuid,numeric,text),public.sf_collect(uuid,uuid,jsonb),public.sf_reverse(uuid,uuid,text),public.sf_get(uuid,uuid),public.sf_children(),public.sf_report(uuid,uuid),public.sf_mapping_save(uuid,jsonb),public.sf_bus_roster(uuid,uuid,integer) from public,anon;
grant execute on function public.sf_setup_save(uuid,text,jsonb),public.sf_setup(uuid),public.sf_copy_prices(uuid,uuid,uuid),public.sf_create_tuition(uuid,uuid),public.sf_transport_save(uuid,uuid,integer,jsonb),public.sf_discount_preview(uuid,uuid,uuid[]),public.sf_discount_apply(uuid,uuid,uuid[]),public.sf_override(uuid,text,uuid,numeric,text),public.sf_collect(uuid,uuid,jsonb),public.sf_reverse(uuid,uuid,text),public.sf_get(uuid,uuid),public.sf_children(),public.sf_report(uuid,uuid),public.sf_mapping_save(uuid,jsonb),public.sf_bus_roster(uuid,uuid,integer) to authenticated;