create function public._sf_terms(_student uuid,_year uuid) returns integer[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(distinct x order by x),'{}') from (
  select case when se.term_id is null then t.n else (select k from (select id,row_number() over(order by start_date,name) k from terms where year_id=_year) o where o.id=se.term_id) end x
  from enrollments en join sections se on se.id=en.section_id cross join (values(1),(2)) t(n)
  where en.student_id=_student and en.year_id=_year and en.status='active' and (se.term_id is null or t.n=1)) z where x in(1,2)$$;

create function public._sf_create_tuition2(_student uuid,_year uuid,_source text) returns integer language plpgsql security definer set search_path=public as $$
 declare p sf_prices; st students; g uuid; t integer; bid uuid; n integer:=0; terms integer[]; begin
 select * into st from students where id=_student for update;
 select se.grade_id into g from enrollments en join sections se on se.id=en.section_id where en.student_id=_student and en.year_id=_year and en.status='active' order by en.created_at desc limit 1;
 select * into p from sf_prices where school_id=st.school_id and year_id=_year and grade_id=g and kind='tuition' and status='approved';
 if p.id is null then return null; end if;
 terms:=_sf_terms(_student,_year);
 foreach t in array terms loop
  insert into sf_obligations(student_id,school_id,year_id,term,kind,price_id,price_snapshot,original,amount) values(st.id,st.school_id,_year,t,'tuition',p.id,to_jsonb(p),case when t=1 then p.term1 else p.term2 end,case when t=1 then p.term1 else p.term2 end) on conflict do nothing returning id into bid;
  if bid is not null then n:=n+1; perform _sf_event(st.school_id,st.id,'obligation_create',bid,null,jsonb_build_object('term',t,'kind','tuition','amount',case when t=1 then p.term1 else p.term2 end,'source',_source)); end if;
 end loop;
 perform _sf_refresh(st.id);
 if n>0 then perform _sf_refresh(s.student_id) from _sf_siblings(st.id,_year,coalesce(terms[1],1)) s where s.student_id<>st.id; end if;
 return n; end$$;

create or replace function public._sf_create_tuition(_student uuid,_year uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if _sf_create_tuition2(_student,_year,'manual') is null then raise exception 'الرسوم الدراسية غير مهيأة أو غير معتمدة'; end if; end$$;

create function public._sf_enroll_trg() returns trigger language plpgsql security definer set search_path=public as $$
 declare o uuid; r integer; u uuid; sname text; begin
 if new.status<>'active' then return new; end if;
 select org_id into o from schools where id=new.school_id;
 if not section_enabled(o,'finance') or not exists(select 1 from sf_prices where school_id=new.school_id and year_id=new.year_id and kind='tuition') then return new; end if;
 begin
  r:=_sf_create_tuition2(new.student_id,new.year_id,'placement');
  if r is null then
   select full_name into sname from students where id=new.student_id;
   for u in select user_id from memberships where org_id=o and role='org_owner' and is_active loop
    perform _notify(u,new.school_id,'finance','رسوم غير مهيأة','لم تُنشأ رسوم الطالب '||coalesce(sname,'')||' لأن رسوم صفه غير معتمدة.','/app/finance','sf_noprice:'||new.student_id||':'||new.year_id);
   end loop;
  end if;
 exception when others then
  perform _sf_event(new.school_id,new.student_id,'auto_create_failed',new.id,null,jsonb_build_object('error',sqlerrm));
 end;
 return new; end$$;
create trigger sf_enroll_after after insert on public.enrollments for each row execute function public._sf_enroll_trg();

create function public._sf_bulk_rows(_school uuid,_year uuid,_grade uuid,_students uuid[]) returns table(student_id uuid,name text,grade text,section text,terms integer[],price numeric,existing integer,priced boolean) language sql stable security definer set search_path=public as $$
 select st.id,st.full_name,gr.name,se.name,_sf_terms(st.id,_year),
  (select sum(case when t=1 then p.term1 else p.term2 end) from unnest(_sf_terms(st.id,_year)) t),
  (select count(*)::integer from sf_obligations b where b.student_id=st.id and b.year_id=_year and b.kind='tuition'),
  p.id is not null
 from enrollments en join students st on st.id=en.student_id join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id
 left join sf_prices p on p.school_id=en.school_id and p.year_id=_year and p.grade_id=se.grade_id and p.kind='tuition' and p.status='approved'
 where en.school_id=_school and en.year_id=_year and en.status='active' and st.status='active'
  and (_grade is null or se.grade_id=_grade) and (_students is null or st.id=any(_students))
 order by gr.name,se.name,st.full_name$$;

create function public.sf_bulk_preview(_school uuid,_year uuid,_grade uuid default null,_students uuid[] default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare rows jsonb; begin perform _sf_guard(_school,'setup');
 select coalesce(jsonb_agg(jsonb_build_object('student_id',r.student_id,'name',r.name,'grade',r.grade,'section',r.section,'terms',r.terms,'price',coalesce(r.price,0)::text,
  'state',case when not r.priced then 'no_price' when r.existing>=cardinality(r.terms) then 'exists' when r.existing>0 then 'partial' else 'new' end)),'[]') into rows
 from _sf_bulk_rows(_school,_year,_grade,_students) r;
 return jsonb_build_object('rows',rows,
  'selected',jsonb_array_length(rows),
  'existing',(select count(*) from jsonb_array_elements(rows) x where x->>'state' in('exists','partial')),
  'no_price',(select count(*) from jsonb_array_elements(rows) x where x->>'state'='no_price'),
  'new_total',(select coalesce(sum((x->>'price')::numeric),0)::text from jsonb_array_elements(rows) x where x->>'state'='new'),
  'note','الخصومات التلقائية تُحسب عند الإنشاء وتظهر في ملف كل طالب.'); end$$;

create function public.sf_bulk_apply(_school uuid,_year uuid,_grade uuid default null,_students uuid[] default null) returns jsonb language plpgsql security definer set search_path=public as $$
 declare r record; n integer; created integer:=0; students_n integer:=0; begin
 perform _sf_guard(_school,'setup');
 if not is_org_owner((select org_id from schools where id=_school)) then raise exception 'تهيئة المستحقات جماعيًا لمدير النظام فقط' using errcode='42501'; end if;
 for r in select * from _sf_bulk_rows(_school,_year,_grade,_students) where priced and existing=0 loop
  n:=_sf_create_tuition2(r.student_id,_year,'bulk'); if coalesce(n,0)>0 then created:=created+n; students_n:=students_n+1; end if;
 end loop;
 perform _sf_event(_school,null,'bulk_create',_year,null,jsonb_build_object('grade',_grade,'students',students_n,'obligations',created));
 return jsonb_build_object('students',students_n,'obligations',created); end$$;

create function public._sf_dirs(_type text) returns text[] language sql immutable as $$
 select case _type when 'round_trip' then array['out','ret'] when 'outbound' then array['out'] when 'return' then array['ret'] else '{}'::text[] end$$;

create function public.sf_bus_occupancy(_school uuid,_year uuid,_term integer) returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 perform _sf_guard(_school,'view');
 return coalesce((select jsonb_agg(jsonb_build_object('bus_id',b.id,'code',b.code,'plate',b.plate,'capacity',b.capacity,'op_status',b.op_status,'active',b.active,
  'students',c.total,'round_trip',c.rt,'outbound',c.ob,'return',c.rt2,
  'free_out',greatest(0,b.capacity-c.rt-c.ob),'free_ret',greatest(0,b.capacity-c.rt-c.rt2),
  'occupancy',case when b.capacity>0 then round(greatest(c.rt+c.ob,c.rt+c.rt2)*100.0/b.capacity)::int else 0 end) order by b.code)
 from mt_buses b cross join lateral (select count(distinct tr.student_id)::int total,
  count(*) filter(where tr.transport_type='round_trip')::int rt,count(*) filter(where tr.transport_type='outbound')::int ob,count(*) filter(where tr.transport_type='return')::int rt2
  from sf_transport tr where tr.bus_id=b.id and tr.year_id=_year and tr.term=_term and tr.active) c
 where b.school_id=_school),'[]'); end$$;

create or replace function public.sf_transport_save(_student uuid,_year uuid,_term integer,_p jsonb) returns void language plpgsql security definer set search_path=public as $$
 declare st students; b mt_buses; old sf_transport; price sf_prices; ob sf_obligations; a boolean; val numeric; n integer; d text; begin
 select * into st from students where id=_student for update; perform _sf_guard(st.school_id,'transport');
 if _term not in(1,2) or not exists(select 1 from enrollments where student_id=st.id and year_id=_year and status='active') then raise exception 'تسجيل الطالب أو الفصل غير صالح'; end if;
 select * into old from sf_transport where student_id=st.id and year_id=_year and term=_term;
 a:=coalesce((_p->>'active')::boolean,false);
 if a then
  select * into b from mt_buses where id=(_p->>'bus_id')::uuid and school_id=st.school_id and active and op_status='available' for update;
  if b.id is null then raise exception 'الباص غير متاح لهذا الفرع'; end if;
  if cardinality(_sf_dirs(_p->>'transport_type'))=0 then raise exception 'نوع نقل غير صالح'; end if;
  foreach d in array _sf_dirs(_p->>'transport_type') loop
   select count(*) into n from sf_transport tr join academic_years y on y.id=tr.year_id where tr.bus_id=b.id and tr.term=_term and tr.active and tr.student_id<>st.id and y.name=(select name from academic_years where id=_year) and d=any(_sf_dirs(tr.transport_type));
   if n>=b.capacity then raise exception 'سعة الباص مكتملة في %', case d when 'out' then 'الذهاب' else 'العودة' end; end if;
  end loop;
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

create function public.sf_siblings(_student uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare s uuid; yname text; begin
 select school_id into s from students where id=_student; perform _sf_guard(s,'view');
 select name into yname from academic_years where id=_year;
 return coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.full_name,'national_id',st.national_id,'school',sc.name,'status',st.status,
  'grade',(select gr.name from enrollments en join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id join academic_years y on y.id=en.year_id where en.student_id=st.id and en.status='active' and y.name=yname limit 1),
  'stage',(select sg.name from enrollments en join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id join stages sg on sg.id=gr.stage_id join academic_years y on y.id=en.year_id where en.student_id=st.id and en.status='active' and y.name=yname limit 1),
  'rank',f.rank,
  'sibling_discount',(select coalesce(sum(a.amount),0)::text from sf_applied a join sf_obligations b on b.id=a.obligation_id join sf_discounts d on d.id=a.discount_id join academic_years y on y.id=b.year_id where b.student_id=st.id and y.name=yname and a.active and d.sibling_min is not null))
  order by f.rank) from _sf_siblings(_student,_year,1) f join students st on st.id=f.student_id join schools sc on sc.id=st.school_id),'[]'); end$$;

alter function public.perm_catalog() rename to _perm_catalog_v_sf;
revoke all on function public._perm_catalog_v_sf() from public, anon, authenticated;
grant execute on function public._perm_catalog_v_sf() to service_role;
create function public.perm_catalog() returns jsonb language sql stable security definer set search_path=public as $$
 with b as (select _perm_catalog_v_sf() c offset 0)
 select jsonb_set(c,'{sections}',(select coalesce(jsonb_agg(case when s->>'key'='accounting_info' then s||jsonb_build_object('locked_reason','المحاسبة العامة تبقى في وافق؛ رسوم الطلاب تُمنح من «رسوم الطلاب والنقل».') else s end),'[]') from jsonb_array_elements(c->'sections') s)
  || $j$[{"key":"student_finance","label":"رسوم الطلاب والنقل","parent":"finance","actions":["view","collect","discount","transport","export"],"scopes":["branch","org"],
  "labels":{"view":"عرض الحسابات المالية للطلاب","collect":"تسجيل السداد","discount":"تطبيق الخصومات المعتمدة","transport":"تسجيل اشتراكات النقل","export":"كشوف الحساب والتصدير"}}]$j$::jsonb) from b $$;

revoke all on function public._sf_terms(uuid,uuid),public._sf_create_tuition2(uuid,uuid,text),public._sf_enroll_trg(),public._sf_bulk_rows(uuid,uuid,uuid,uuid[]),public._sf_dirs(text) from public,anon,authenticated;
revoke all on function public.sf_bulk_preview(uuid,uuid,uuid,uuid[]),public.sf_bulk_apply(uuid,uuid,uuid,uuid[]),public.sf_bus_occupancy(uuid,uuid,integer),public.sf_siblings(uuid,uuid),public.perm_catalog() from public,anon;
grant execute on function public.sf_bulk_preview(uuid,uuid,uuid,uuid[]),public.sf_bulk_apply(uuid,uuid,uuid,uuid[]),public.sf_bus_occupancy(uuid,uuid,integer),public.sf_siblings(uuid,uuid),public.perm_catalog() to authenticated;