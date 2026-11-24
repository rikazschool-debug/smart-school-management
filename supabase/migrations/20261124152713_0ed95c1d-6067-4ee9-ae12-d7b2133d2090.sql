-- Receipt snapshot now also freezes the student's class placement and guardian at issue time (new receipts only; existing snapshots stay unchanged).
create or replace function public._sf_receipt_trg() returns trigger language plpgsql security definer set search_path=public as $$
 declare c sf_collections; k bigint; yr uuid; snap jsonb; begin
 select * into c from sf_collections where id=new.id;
 if c.id is null or exists(select 1 from sf_receipts where collection_id=c.id) then return null; end if;
 insert into sf_counters(org_id,kind,n) values(c.org_id,'receipt',1) on conflict(org_id,kind) do update set n=sf_counters.n+1 returning n into k;
 select b.year_id into yr from sf_allocations a join sf_obligations b on b.id=a.obligation_id join academic_years y on y.id=b.year_id where a.collection_id=c.id order by y.start_date desc limit 1;
 snap:=jsonb_build_object('school',(select name from schools where id=c.school_id),
  'student',(select jsonb_build_object('name',st.full_name,'national_id',st.national_id,'csmart_no',st.csmart_no,
     'stage',(select sg.name from enrollments e join sections se on se.id=e.section_id join grades g on g.id=se.grade_id left join stages sg on sg.id=g.stage_id where e.student_id=st.id and e.status='active' order by e.created_at desc limit 1),
     'grade',(select g.name from enrollments e join sections se on se.id=e.section_id join grades g on g.id=se.grade_id where e.student_id=st.id and e.status='active' order by e.created_at desc limit 1),
     'section',(select se.name from enrollments e join sections se on se.id=e.section_id where e.student_id=st.id and e.status='active' order by e.created_at desc limit 1),
     'guardian',(select gu.full_name from student_guardians sgu join guardians gu on gu.id=sgu.guardian_id where sgu.student_id=st.id and sgu.verified order by sgu.created_at limit 1))
   from students st where st.id=c.student_id),
  'year',(select name from academic_years where id=yr),'amount',c.amount::text,'method',c.method,'paid_at',c.paid_at,'ref',c.ref,'payer',c.payer,'notes',c.notes,
  'actor',coalesce(_adm_name(c.created_by),''),'created_at',c.created_at,
  'allocations',(select coalesce(jsonb_agg(jsonb_build_object('term',b.term,'kind',b.kind,'amount',a.amount::text,'year',y.name,'school',sc.name) order by y.start_date,b.term,b.kind),'[]') from sf_allocations a join sf_obligations b on b.id=a.obligation_id join academic_years y on y.id=b.year_id join schools sc on sc.id=b.school_id where a.collection_id=c.id),
  'after',_sf_summary(c.student_id,yr)->'annual');
 insert into sf_receipts(org_id,school_id,student_id,collection_id,number,snapshot) values(c.org_id,c.school_id,c.student_id,c.id,'RC-'||lpad(k::text,6,'0'),snap);
 return null; end$$;

-- The payer on a recorded payment is always the signed-in employee (not typed by hand).
create or replace function public._sf_collect_payer_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin new.payer:=coalesce(nullif(_adm_name(new.created_by),''),new.payer); return new; end $$;
revoke all on function public._sf_collect_payer_trg() from public, anon, authenticated;
drop trigger if exists sf_collect_payer on public.sf_collections;
create trigger sf_collect_payer before insert on public.sf_collections for each row execute function public._sf_collect_payer_trg();