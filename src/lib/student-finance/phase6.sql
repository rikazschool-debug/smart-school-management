-- Phase 6 (additive): previous-year balances carried forward as pointers to the original obligation, approved credit use/refund.
create table public.sf_carry_runs (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), request_key uuid not null,
 from_key text not null, to_key text not null, scope jsonb not null, counts jsonb not null default '{}', reason text not null,
 actor uuid default auth.uid(), created_at timestamptz not null default now(), unique(org_id,request_key)
);
grant all on public.sf_carry_runs to service_role;
alter table public.sf_carry_runs enable row level security;
create table public.sf_carries (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), run_id uuid not null references public.sf_carry_runs(id),
 student_id uuid not null references public.students(id), obligation_id uuid not null references public.sf_obligations(id),
 source_school_id uuid not null references public.schools(id), source_year_id uuid not null references public.academic_years(id),
 to_key text not null, direction text not null check (direction in ('debit','credit')), amount numeric(14,2) not null, due_date date,
 created_at timestamptz not null default now(), unique(obligation_id,to_key)
);
grant all on public.sf_carries to service_role;
alter table public.sf_carries enable row level security;
create index sf_carries_student on public.sf_carries(student_id,to_key);
create table public.sf_credit_moves (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), request_key uuid not null,
 student_id uuid not null references public.students(id), source_obligation_id uuid not null references public.sf_obligations(id),
 target_obligation_id uuid references public.sf_obligations(id), kind text not null check (kind in ('apply','refund')),
 amount numeric(14,2) not null check (amount>0), method text, reason text not null, actor uuid default auth.uid(),
 created_at timestamptz not null default now(), unique(org_id,request_key),
 check ((kind='apply' and target_obligation_id is not null and target_obligation_id<>source_obligation_id) or (kind='refund' and target_obligation_id is null))
);
grant all on public.sf_credit_moves to service_role;
alter table public.sf_credit_moves enable row level security;
create index sf_credit_src on public.sf_credit_moves(source_obligation_id);
create index sf_credit_tgt on public.sf_credit_moves(target_obligation_id);
create trigger sf_carries_immutable before update or delete on public.sf_carries for each row execute function public._sf_immutable();
create trigger sf_credit_moves_immutable before update or delete on public.sf_credit_moves for each row execute function public._sf_immutable();
create trigger sf_carry_runs_immutable before delete on public.sf_carry_runs for each row execute function public._sf_immutable();

-- Balance = cash collections + approved credit received − credit moved out. Without credit moves it equals the previous formula.
create or replace function public._sf_balance(_ob uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with a as(select b.amount,
  coalesce((select sum(x.amount) from sf_applied x where x.obligation_id=b.id and x.active),0) discount,
  coalesce((select sum(x.amount) from sf_allocations x join sf_collections c on c.id=x.collection_id where x.obligation_id=b.id and c.status<>'reversed'),0) cash,
  coalesce((select sum(m.amount) from sf_credit_moves m where m.target_obligation_id=b.id),0) cin,
  coalesce((select sum(m.amount) from sf_credit_moves m where m.source_obligation_id=b.id),0) cout
  from sf_obligations b where b.id=_ob)
 select jsonb_build_object('gross',amount,'discount',discount,'net',greatest(0,amount-discount),'recorded',cash+cin-cout,'cash',cash,'credit_in',cin,'credit_out',cout,
  'remaining',greatest(0,greatest(0,amount-discount)-(cash+cin-cout)),'credit',greatest(0,(cash+cin-cout)-greatest(0,amount-discount))) from a $$;

create or replace function public._sf_year_start(_org uuid,_name text) returns date language sql stable security definer set search_path=public as $$
 select min(y.start_date) from academic_years y join schools sc on sc.id=y.school_id where sc.org_id=_org and y.name=_name $$;

-- Rows eligible for carrying: obligations of the source year plus earlier ones already carried into it (same debt, never a new one).
create or replace function public._sf_carry_rows(_org uuid,_from text,_to text,_schools uuid[],_students uuid[],_dirs text[])
 returns table(obligation_id uuid,student_id uuid,name text,school_id uuid,school text,year_id uuid,year text,term integer,kind text,due_date date,net numeric,recorded numeric,remaining numeric,credit numeric,direction text,carried boolean)
 language sql stable security definer set search_path=public as $$
 select b.id,st.id,st.full_name,sc.id,sc.name,y.id,y.name,b.term,b.kind,b.due_date,(z.bal->>'net')::numeric,(z.bal->>'recorded')::numeric,(z.bal->>'remaining')::numeric,(z.bal->>'credit')::numeric,
  case when (z.bal->>'remaining')::numeric>0 then 'debit' else 'credit' end,
  exists(select 1 from sf_carries c where c.obligation_id=b.id and c.to_key=_to)
 from sf_obligations b join academic_years y on y.id=b.year_id join schools sc on sc.id=b.school_id and sc.org_id=_org join students st on st.id=b.student_id
 cross join lateral (select _sf_balance(b.id) bal) z
 where (y.name=_from or exists(select 1 from sf_carries c where c.obligation_id=b.id and c.to_key=_from))
  and (coalesce(cardinality(_schools),0)=0 or b.school_id=any(_schools)) and (coalesce(cardinality(_students),0)=0 or b.student_id=any(_students))
  and ((b.status='pending' and (z.bal->>'remaining')::numeric>0 and 'debit'=any(_dirs)) or ((z.bal->>'credit')::numeric>0 and 'credit'=any(_dirs))) $$;

create or replace function public._sf_carry_check(_org uuid,_from text,_to text,_dirs text[]) returns void language plpgsql stable security definer set search_path=public as $$begin
 if auth.uid() is null or not coalesce(is_org_owner(_org),false) or not section_enabled(_org,'finance') then raise exception 'ترحيل الأرصدة لمدير النظام فقط' using errcode='42501'; end if;
 if _from is null or _to is null or _from=_to or _sf_year_start(_org,_from) is null or _sf_year_start(_org,_to) is null then raise exception 'اختر عامين دراسيين مختلفين من الهيكل الأكاديمي'; end if;
 if _sf_year_start(_org,_to)<=_sf_year_start(_org,_from) then raise exception 'العام المستهدف يجب أن يكون بعد العام المصدر'; end if;
 if coalesce(cardinality(_dirs),0)=0 or not _dirs <@ array['debit','credit'] then raise exception 'اختر نوع الأرصدة'; end if; end$$;

create or replace function public.sf_org_years(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if auth.uid() is null or not (coalesce(is_org_owner(_org),false) or exists(select 1 from schools sc where sc.org_id=_org and coalesce(_sf_ok(sc.id,'view'),false))) then raise exception 'غير مصرح' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('name',name,'start',st,'current',cur) order by st desc) from (select y.name,min(y.start_date) st,bool_or(y.is_current) cur from academic_years y join schools sc on sc.id=y.school_id where sc.org_id=_org group by y.name) q),'[]'); end$$;

create or replace function public.sf_carry_preview(_org uuid,_from text,_to text,_schools uuid[],_students uuid[],_dirs text[]) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 perform _sf_carry_check(_org,_from,_to,_dirs);
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.year,r.term,r.kind) from _sf_carry_rows(_org,_from,_to,_schools,_students,_dirs) r),'[]'); end$$;

create or replace function public.sf_carry_apply(_org uuid,_request_key uuid,_from text,_to text,_schools uuid[],_students uuid[],_dirs text[],_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
 declare p jsonb; old sf_carry_runs; rid uuid; r record; n integer:=0; d numeric:=0; c numeric:=0; x record; begin
 perform _sf_carry_check(_org,_from,_to,_dirs);
 if _request_key is null or length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب الترحيل مطلوب'; end if;
 p:=jsonb_build_object('from',_from,'to',_to,'schools',coalesce(to_jsonb(_schools),'[]'),'students',coalesce(to_jsonb(_students),'[]'),'dirs',to_jsonb(_dirs));
 select * into old from sf_carry_runs where org_id=_org and request_key=_request_key;
 if old.id is not null then if old.scope<>p then raise exception 'مفتاح إعادة المحاولة مستخدم لعملية أخرى'; end if; return to_jsonb(old); end if;
 -- Lock the students first (same lock as collection), then re-read live balances.
 perform 1 from students where id in (select q.student_id from _sf_carry_rows(_org,_from,_to,_schools,_students,_dirs) q) order by id for update;
 insert into sf_carry_runs(org_id,request_key,from_key,to_key,scope,reason) values(_org,_request_key,_from,_to,p,_reason) returning id into rid;
 for r in select * from _sf_carry_rows(_org,_from,_to,_schools,_students,_dirs) q where not q.carried order by q.student_id,q.year,q.term,q.kind loop
  insert into sf_carries(org_id,run_id,student_id,obligation_id,source_school_id,source_year_id,to_key,direction,amount,due_date)
  values(_org,rid,r.student_id,r.obligation_id,r.school_id,r.year_id,_to,r.direction,case when r.direction='debit' then r.remaining else r.credit end,r.due_date) on conflict do nothing;
  if found then n:=n+1; if r.direction='debit' then d:=d+r.remaining; else c:=c+r.credit; end if; end if;
 end loop;
 for x in select ca.student_id,min(ca.source_school_id::text)::uuid school,sum(ca.amount) filter(where direction='debit') debit,sum(ca.amount) filter(where direction='credit') credit,count(*) cnt from sf_carries ca where ca.run_id=rid group by ca.student_id loop
  perform _sf_event(x.school,x.student_id,'carry_apply',rid,null,jsonb_build_object('from',_from,'to',_to,'debit',coalesce(x.debit,0),'credit',coalesce(x.credit,0),'count',x.cnt),_reason);
 end loop;
 update sf_carry_runs set counts=jsonb_build_object('items',n,'debit',d,'credit',c,'students',(select count(distinct student_id) from sf_carries where run_id=rid)) where id=rid;
 select to_jsonb(cr) into p from sf_carry_runs cr where cr.id=rid;
 return p; end$$;

create or replace function public.sf_carry_runs_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if auth.uid() is null or not coalesce(is_org_owner(_org),false) then raise exception 'غير مصرح' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('actor_name',coalesce(_adm_name(r.actor),'')) order by r.created_at desc) from sf_carry_runs r where r.org_id=_org),'[]'); end$$;

create or replace function public._sf_credit_move(_student uuid,_request_key uuid,_kind text,_source uuid,_target uuid,_amount numeric,_method text,_reason text) returns uuid language plpgsql security definer set search_path=public as $$
 declare st students; o uuid; old sf_credit_moves; src sf_obligations; tg sf_obligations; v uuid; begin
 select * into st from students where id=_student for update; if st.id is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 perform _sf_guard(st.school_id,'setup'); select org_id into o from schools where id=st.school_id;
 select * into old from sf_credit_moves where org_id=o and request_key=_request_key;
 if old.id is not null then if old.student_id<>_student or old.kind<>_kind or old.source_obligation_id<>_source or old.target_obligation_id is distinct from _target or old.amount<>_amount then raise exception 'مفتاح إعادة المحاولة مستخدم لعملية أخرى'; end if; return old.id; end if;
 if _request_key is null or length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب العملية مطلوب'; end if;
 if _amount is null or _amount<=0 or _amount='NaN'::numeric or _amount<>round(_amount,2) then raise exception 'مبلغ غير صالح'; end if;
 select * into src from sf_obligations where id=_source and student_id=_student for update; if src.id is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 perform _sf_guard(src.school_id,'setup');
 if _amount>(_sf_balance(src.id)->>'credit')::numeric then raise exception 'المبلغ يتجاوز الرصيد الدائن المتاح'; end if;
 if _kind='apply' then
  select * into tg from sf_obligations where id=_target and student_id=_student for update;
  if tg.id is null or tg.id=src.id or tg.status<>'pending' then raise exception 'اختر مستحقًا قائمًا للطالب'; end if;
  if _amount>(_sf_balance(tg.id)->>'remaining')::numeric then raise exception 'المبلغ يتجاوز المتبقي على المستحق'; end if;
 end if;
 insert into sf_credit_moves(org_id,request_key,student_id,source_obligation_id,target_obligation_id,kind,amount,method,reason) values(o,_request_key,_student,_source,case when _kind='apply' then _target end,_kind,_amount,_method,_reason) returning id into v;
 perform _sf_event(st.school_id,_student,'credit_'||_kind,v,null,jsonb_build_object('amount',_amount,'source',_source,'source_year',(select name from academic_years where id=src.year_id),'target',_target,'kind',tg.kind,'term',tg.term,'method',_method),_reason);
 return v; end$$;
create or replace function public.sf_credit_use(_student uuid,_request_key uuid,_source uuid,_target uuid,_amount numeric,_reason text) returns uuid language sql security definer set search_path=public as $$ select _sf_credit_move(_student,_request_key,'apply',_source,_target,_amount,null,_reason) $$;
create or replace function public.sf_credit_refund(_student uuid,_request_key uuid,_source uuid,_amount numeric,_method text,_reason text) returns uuid language plpgsql security definer set search_path=public as $$begin
 if _method not in ('cash','bank','other') then raise exception 'طريقة الاسترداد غير صالحة'; end if;
 return _sf_credit_move(_student,_request_key,'refund',_source,null,_amount,_method,_reason); end$$;

-- Student finance: year view + previous balances carried into it (live balance of the original obligation).
create or replace function public.sf_get(_student uuid, _year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare st students; s schools; family boolean; staff boolean; r jsonb; yk text; begin
 select * into st from students where id=_student; select * into s from schools where id=st.school_id;
 staff:=coalesce(_sf_ok(st.school_id,'view'),false); family:=auth.uid() is not null and coalesce(is_guardian_of(st.id),false);
 if st.id is null or not s.is_active or not section_enabled(s.org_id,'finance') or not (staff or family) then raise exception 'غير مصرح' using errcode='42501'; end if;
 yk:=(select name from academic_years where id=_year);
 r:=jsonb_build_object('student',jsonb_build_object('id',st.id,'name',st.full_name,'school_id',s.id,'school',s.name,'placed',exists(select 1 from enrollments where student_id=st.id and status='active')),'mode','operational','accounting_status','disabled','updated_at',now(),
 'caps',jsonb_build_object('setup',staff and _sf_ok(s.id,'setup'),'collect',staff and _sf_ok(s.id,'collect'),'discount',staff and _sf_ok(s.id,'discount'),'transport',staff and _sf_ok(s.id,'transport'),'export',staff and _sf_ok(s.id,'export')),
 'years',coalesce((select jsonb_agg(jsonb_build_object('id',y.id,'name',y.name,'is_current',y.is_current) order by y.start_date desc) from academic_years y where y.school_id=s.id),'[]'),
 'year_key',yk,
 'obligations',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('balance',_sf_balance(b.id)) order by b.term,b.kind) from sf_obligations b where b.student_id=st.id and (_year is null or b.year_id=_year)),'[]'),
 'previous',case when yk is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('carry_id',c.id,'direction',c.direction,'carried_amount',c.amount,'carried_at',c.created_at,'year',y.name,'school',sc.name,
   'days_late',case when b.due_date<_sf_today() and (_sf_balance(b.id)->>'remaining')::numeric>0 then _sf_today()-b.due_date end,'obligation',to_jsonb(b)||jsonb_build_object('balance',_sf_balance(b.id))) order by y.start_date,b.term,b.kind)
   from sf_carries c join sf_obligations b on b.id=c.obligation_id join academic_years y on y.id=b.year_id join schools sc on sc.id=b.school_id where c.student_id=st.id and c.to_key=yk),'[]') end,
 'credit_moves',coalesce((select jsonb_agg(to_jsonb(m)-'request_key'-'actor' order by m.created_at desc) from sf_credit_moves m where m.student_id=st.id),'[]'),
 'transport',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('bus',jsonb_build_object('code',bus.code,'plate',bus.plate,'capacity',bus.capacity))) from sf_transport t left join mt_buses bus on bus.id=t.bus_id where t.student_id=st.id and (_year is null or t.year_id=_year)),'[]'),
 'discounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',a.snapshot->>'name','term',b.term,'kind',b.kind)) from sf_applied a join sf_obligations b on b.id=a.obligation_id where b.student_id=st.id and (_year is null or b.year_id=_year)),'[]'),
 'collections',coalesce((select jsonb_agg((to_jsonb(c)-'payload'-'created_by')||jsonb_build_object('allocations',(select jsonb_agg(to_jsonb(a)) from sf_allocations a where a.collection_id=c.id)) order by c.created_at desc) from sf_collections c where c.student_id=st.id and (_year is null or exists(select 1 from sf_allocations a join sf_obligations b on b.id=a.obligation_id where a.collection_id=c.id and (b.year_id=_year or exists(select 1 from sf_carries ca where ca.obligation_id=b.id and ca.to_key=yk))))),'[]'),
 'summary',_sf_summary(st.id,_year),'invoices','[]'::jsonb,
 'events',case when staff then coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from sf_events e where e.student_id=st.id),'[]') else '[]'::jsonb end,
 'available_discounts',case when staff then coalesce((select jsonb_agg(to_jsonb(d)) from sf_discounts d where d.org_id=s.org_id and d.active and _sf_today() between d.starts and d.ends),'[]') else '[]'::jsonb end,
 'buses',case when staff then coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'plate',b.plate,'capacity',b.capacity,'op_status',b.op_status)) from mt_buses b where b.school_id=s.id and active),'[]') else '[]'::jsonb end);
 return r; end$$;

-- Family view per academic year name (default: each child's current year); includes unplaced children (no fees shown as zero).
create or replace function public.sf_family(_year text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare r jsonb:='[]'; st record; yk text; y uuid; begin
 if auth.uid() is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 for st in select distinct s.id,s.school_id,s.full_name from students s join student_guardians sg on sg.student_id=s.id and sg.verified and sg.can_follow join guardians g on g.id=sg.guardian_id and g.user_id=auth.uid() join schools sc on sc.id=s.school_id and sc.is_active and section_enabled(sc.org_id,'finance') where s.status='active' order by s.full_name loop
  yk:=coalesce(_year,(select name from academic_years where school_id=st.school_id and is_current order by start_date desc limit 1),(select name from academic_years where school_id=st.school_id order by start_date desc limit 1));
  y:=(select id from academic_years where school_id=st.school_id and name=yk limit 1);
  r:=r||jsonb_build_array(sf_get(st.id,y)||jsonb_build_object('year_key',yk,'year_missing',y is null));
 end loop;
 return jsonb_build_object('children',r,'years',coalesce((select jsonb_agg(distinct (x->>'name')) from jsonb_array_elements(r) c cross join lateral jsonb_array_elements(c->'years') x),'[]'),'year',_year); end$$;

create or replace function public.sf_report(_school uuid,_year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$declare yk text; begin
 perform _sf_guard(_school,'export'); yk:=(select name from academic_years where id=_year);
 return jsonb_build_object('mode','operational','accounting_status','disabled',
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.full_name,'national_id',st.national_id,
   'grade',(select g.name from enrollments en join sections se on se.id=en.section_id join grades g on g.id=se.grade_id where en.student_id=st.id and en.status='active' order by en.created_at desc limit 1),
   'placed',exists(select 1 from enrollments where student_id=st.id and status='active'),
   'exempt_transport',exists(select 1 from sf_transport t where t.student_id=st.id and t.exempt and (_year is null or t.year_id=_year)),
   'transport_active',exists(select 1 from sf_transport t where t.student_id=st.id and t.active and (_year is null or t.year_id=_year)),
   'overdue',exists(select 1 from sf_obligations b where b.student_id=st.id and b.status='pending' and b.due_date<_sf_today() and (_sf_balance(b.id)->>'remaining')::numeric>0 and (_year is null or b.year_id=_year or exists(select 1 from sf_carries ca where ca.obligation_id=b.id and ca.to_key=yk))),
   'previous',case when yk is null then 0 else coalesce((select sum((_sf_balance(c.obligation_id)->>'remaining')::numeric) from sf_carries c where c.student_id=st.id and c.to_key=yk),0) end,
   'previous_credit',case when yk is null then 0 else coalesce((select sum((_sf_balance(c.obligation_id)->>'credit')::numeric) from sf_carries c where c.student_id=st.id and c.to_key=yk),0) end,
   'obligations',(select jsonb_agg(jsonb_build_object('term',b.term,'kind',b.kind,'status',b.status,'balance',_sf_balance(b.id))) from sf_obligations b where b.student_id=st.id and (_year is null or b.year_id=_year))))
  from students st where st.school_id=_school and (exists(select 1 from sf_obligations where student_id=st.id and (_year is null or year_id=_year)) or (yk is not null and exists(select 1 from sf_carries c where c.student_id=st.id and c.to_key=yk)))),'[]'),
 'collections',coalesce((select jsonb_agg(to_jsonb(c)-'payload') from sf_collections c where c.school_id=_school and (_year is null or exists(select 1 from sf_allocations a join sf_obligations b on b.id=a.obligation_id where a.collection_id=c.id and b.year_id=_year))),'[]'),
 'outbox',case when _sf_ok(_school,'setup') then coalesce((select jsonb_agg(to_jsonb(q)) from sf_outbox q join sf_events e on e.id=q.event_id where e.school_id=_school),'[]') else '[]'::jsonb end);
 end$$;

create or replace function public.sf_arrears(_school uuid, _year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$declare yk text; begin
 perform _sf_guard(_school,'view'); yk:=(select name from academic_years where id=_year);
 return coalesce((select jsonb_agg(x order by (x->>'days_late')::int desc nulls last, x->>'name') from (
  select jsonb_build_object('obligation_id',b.id,'student_id',st.id,'name',st.full_name,'school',sc.name,'grade',g.name,'section',se.name,
   'year',y.name,'term',b.term,'kind',b.kind,'due_date',b.due_date,'balance',bal,'previous',_year is not null and b.year_id<>_year,
   'days_late',case when b.due_date is not null and b.due_date<_sf_today() then _sf_today()-b.due_date end,
   'state',case when b.due_date is null then 'no_due' when b.due_date<_sf_today() then 'overdue' else 'upcoming' end) x
  from sf_obligations b cross join lateral (select _sf_balance(b.id) bal) z
  join students st on st.id=b.student_id join schools sc on sc.id=b.school_id join academic_years y on y.id=b.year_id
  left join lateral (select e.section_id from enrollments e where e.student_id=st.id and e.status='active' limit 1) en on true
  left join sections se on se.id=en.section_id left join grades g on g.id=se.grade_id
  where b.school_id=_school and (_year is null or b.year_id=_year or exists(select 1 from sf_carries ca where ca.obligation_id=b.id and ca.to_key=yk)) and b.status='pending' and (bal->>'remaining')::numeric>0 limit 2000) q),'[]'); end$$;

create or replace function public.sf_dashboard(_school uuid, _year uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb; yk text; begin
 perform _sf_guard(_school,'view'); yk:=(select name from academic_years where id=_year);
 with ob as (select b.*, _sf_balance(b.id) bal from sf_obligations b where b.school_id=_school and (_year is null or b.year_id=_year) and b.status<>'void'),
 prev as (select distinct b.id,b.student_id,b.due_date,b.status,ca.created_at carried_at,_sf_balance(b.id) bal from sf_carries ca join sf_obligations b on b.id=ca.obligation_id where yk is not null and ca.to_key=yk and b.school_id=_school),
 per as (select student_id, sum((bal->>'net')::numeric) net, sum((bal->>'recorded')::numeric) rec, sum((bal->>'remaining')::numeric) rem, bool_and(status='exempt' or (bal->>'net')::numeric=0) ex from ob group by student_id),
 col as (select c.id,c.paid_at,sum(a.amount) amt from sf_collections c join sf_allocations a on a.collection_id=c.id join ob on ob.id=a.obligation_id where c.status<>'reversed' group by c.id,c.paid_at)
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
 return r; end$$;

-- Receipts name the original academic year of every allocated item (previous balances included).
create or replace function public._sf_receipt_trg() returns trigger language plpgsql security definer set search_path=public as $$
 declare c sf_collections; k bigint; yr uuid; snap jsonb; begin
 select * into c from sf_collections where id=new.id;
 if c.id is null or exists(select 1 from sf_receipts where collection_id=c.id) then return null; end if;
 insert into sf_counters(org_id,kind,n) values(c.org_id,'receipt',1) on conflict(org_id,kind) do update set n=sf_counters.n+1 returning n into k;
 select b.year_id into yr from sf_allocations a join sf_obligations b on b.id=a.obligation_id join academic_years y on y.id=b.year_id where a.collection_id=c.id order by y.start_date desc limit 1;
 snap:=jsonb_build_object('school',(select name from schools where id=c.school_id),
  'student',(select jsonb_build_object('name',full_name,'national_id',national_id) from students where id=c.student_id),
  'year',(select name from academic_years where id=yr),'amount',c.amount::text,'method',c.method,'paid_at',c.paid_at,'ref',c.ref,'payer',c.payer,'notes',c.notes,
  'actor',coalesce(_adm_name(c.created_by),''),'created_at',c.created_at,
  'allocations',(select coalesce(jsonb_agg(jsonb_build_object('term',b.term,'kind',b.kind,'amount',a.amount::text,'year',y.name,'school',sc.name) order by y.start_date,b.term,b.kind),'[]') from sf_allocations a join sf_obligations b on b.id=a.obligation_id join academic_years y on y.id=b.year_id join schools sc on sc.id=b.school_id where a.collection_id=c.id),
  'after',_sf_summary(c.student_id,yr)->'annual');
 insert into sf_receipts(org_id,school_id,student_id,collection_id,number,snapshot) values(c.org_id,c.school_id,c.student_id,c.id,'RC-'||lpad(k::text,6,'0'),snap);
 return null; end$$;

-- Notifications for the new events (same trigger, one notice per event).
create or replace function public._sf_event_notify_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare nm text; a jsonb:=coalesce(new.after_data,'{}'); b jsonb:=coalesce(new.before_data,'{}'); ob sf_obligations; t text; m text; k text:='sf_ev:'||new.id; begin
 if new.student_id is null then return null; end if;
 select full_name into nm from students where id=new.student_id; nm:=coalesce(nm,'');
 if new.action in ('discount_apply','discount_edit','discount_remove','sibling_ineligible','reprice','due_apply','transport_edit','transport_exempt','transport_cancel','obligation_create') then
  select * into ob from sf_obligations where id=coalesce((a->>'obligation_id')::uuid,(select obligation_id from sf_applied where id=new.subject_id),new.subject_id);
 elsif new.action='credit_apply' then select * into ob from sf_obligations where id=(a->>'target')::uuid;
 end if;
 case new.action
  when 'obligation_create' then t:='إنشاء المستحقات المالية'; m:='أُنشئت '||case when a->>'kind'='transport' then 'رسوم النقل' else 'الرسوم الدراسية' end||' للطالب '||nm||' للعام الدراسي '||coalesce((select name from academic_years where id=ob.year_id),'')||'.';
   k:='sf_new:'||new.student_id||':'||coalesce(ob.year_id::text,'')||':'||coalesce(a->>'kind','');
  when 'discount_apply' then t:=case when a->>'discount' like '%الإخوة%' then 'تطبيق خصم الإخوة' else 'تطبيق خصم' end;
   m:='طُبّق '||coalesce(a->>'discount','خصم')||' بمبلغ '||_sf_money((a->>'amount')::numeric)||' على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||'.';
  when 'sibling_ineligible' then t:='إيقاف خصم الإخوة'; m:='توقف خصم الإخوة على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||' لعدم استيفاء شروطه.';
  when 'discount_edit' then t:='تعديل خصم'; m:='عُدّل الخصم على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||' إلى '||_sf_money((a->>'amount')::numeric)||'.';
  when 'discount_remove' then t:='إلغاء خصم'; m:='أُلغي خصم على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||'.';
  when 'reprice' then t:='تعديل الرسوم الدراسية'; m:='عُدّلت '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||' من '||_sf_money((b->>'amount')::numeric)||' إلى '||_sf_money((a->>'amount')::numeric)||'.';
  when 'due_apply' then t:='تعديل تاريخ الاستحقاق'; m:='أصبح تاريخ استحقاق '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||': '||coalesce(a->>'due_date','بلا تاريخ')||'.';
  when 'transport_edit' then t:='تعديل اشتراك النقل'; m:='عُدّلت '||_sf_lbl('transport',ob.term)||' للطالب '||nm||' إلى '||_sf_money((a->>'amount')::numeric)||'.';
  when 'transport_exempt' then t:='إعفاء من رسوم النقل'; m:='أُعفي الطالب '||nm||' من '||_sf_lbl('transport',ob.term)||'.';
  when 'transport_cancel' then t:='إلغاء اشتراك النقل'; m:='أُلغي اشتراك النقل للطالب '||nm||' في '||case when ob.term=1 then 'الفصل الأول' else 'الفصل الثاني' end||'.';
  when 'transport_save' then
   if coalesce((a->>'active')::boolean,false) and coalesce((b->>'active')::boolean,false) then t:='تعديل اشتراك النقل';
   elsif coalesce((a->>'active')::boolean,false) then t:='تسجيل اشتراك النقل';
   elsif coalesce((b->>'active')::boolean,false) then t:='إلغاء اشتراك النقل'; end if;
   if t is not null then m:=t||' للطالب '||nm||' في '||case when (a->>'term')='1' then 'الفصل الأول' else 'الفصل الثاني' end||'.'; end if;
  when 'carry_apply' then t:='ترحيل رصيد سابق';
   m:='يظهر للطالب '||nm||' في العام الدراسي '||coalesce(a->>'to','')||' رصيد سابق من العام '||coalesce(a->>'from','')
    ||case when coalesce((a->>'debit')::numeric,0)>0 then ': مستحق '||_sf_money((a->>'debit')::numeric) else '' end
    ||case when coalesce((a->>'credit')::numeric,0)>0 then ' — رصيد دائن '||_sf_money((a->>'credit')::numeric) else '' end||'.';
  when 'credit_apply' then t:='استخدام رصيد دائن'; m:='استُخدم رصيد دائن بمبلغ '||_sf_money((a->>'amount')::numeric)||' لسداد '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||'.';
  when 'credit_refund' then t:='استرداد رصيد دائن'; m:='سُجّل استرداد رصيد دائن بمبلغ '||_sf_money((a->>'amount')::numeric)||' للطالب '||nm||'.';
  else null;
 end case;
 if t is not null then perform _sf_notify_guardians(new.student_id,new.school_id,t,m,k); end if;
 if new.action='auto_create_failed' then
  perform _sf_owners_notify(new.school_id,null,'تعذر إنشاء رسوم طالب','تعذر إنشاء رسوم الطالب '||nm||' تلقائيًا عند التسكين. راجع «طلاب بانتظار إنشاء الرسوم».','sf_fail:'||new.student_id||':'||_sf_today());
 elsif new.action in ('collection_reverse','discount_edit','discount_remove','transport_edit','transport_exempt','transport_cancel','credit_apply','credit_refund') then
  perform _sf_owners_notify(new.school_id,new.actor,case when new.action='collection_reverse' then 'إلغاء دفعة' else 'تسوية مالية' end,
   'عملية «'||case new.action when 'collection_reverse' then 'إلغاء دفعة' when 'discount_edit' then 'تعديل خصم' when 'discount_remove' then 'إلغاء خصم' when 'transport_edit' then 'تعديل رسوم النقل' when 'transport_exempt' then 'إعفاء من النقل' when 'credit_apply' then 'استخدام رصيد دائن' when 'credit_refund' then 'استرداد رصيد دائن' else 'إلغاء النقل' end||'» للطالب '||nm||coalesce(' — السبب: '||new.reason,'')||'.','sf_adm:'||new.id);
 end if;
 return null; end$$;

revoke all on function public._sf_year_start(uuid,text),public._sf_carry_rows(uuid,text,text,uuid[],uuid[],text[]),public._sf_carry_check(uuid,text,text,text[]),public._sf_credit_move(uuid,uuid,text,uuid,uuid,numeric,text,text) from public,anon,authenticated;
revoke all on function public.sf_org_years(uuid),public.sf_carry_preview(uuid,text,text,uuid[],uuid[],text[]),public.sf_carry_apply(uuid,uuid,text,text,uuid[],uuid[],text[],text),public.sf_carry_runs_list(uuid),public.sf_credit_use(uuid,uuid,uuid,uuid,numeric,text),public.sf_credit_refund(uuid,uuid,uuid,numeric,text,text),public.sf_family(text) from public,anon;
grant execute on function public.sf_org_years(uuid),public.sf_carry_preview(uuid,text,text,uuid[],uuid[],text[]),public.sf_carry_apply(uuid,uuid,text,text,uuid[],uuid[],text[],text),public.sf_carry_runs_list(uuid),public.sf_credit_use(uuid,uuid,uuid,uuid,numeric,text),public.sf_credit_refund(uuid,uuid,uuid,numeric,text,text),public.sf_family(text) to authenticated;
