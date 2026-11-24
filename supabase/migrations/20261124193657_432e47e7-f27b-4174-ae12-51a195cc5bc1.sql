create or replace function public._sf_siblings(_student uuid, _year uuid, _term integer)
 returns table(student_id uuid, rank bigint) language sql stable security definer set search_path to 'public' as $function$
 with recursive family(id) as (
 select _student union
 select sg2.student_id from family f join student_guardians sg on sg.student_id=f.id and sg.verified
 join guardians g on g.id=sg.guardian_id join guardians g2 on g2.id=g.id or (g.user_id is not null and g.user_id=g2.user_id) or (g.national_id is not null and length(g.national_id)>0 and g.national_id=g2.national_id)
 join student_guardians sg2 on sg2.guardian_id=g2.id and sg2.verified
 join students st2 on st2.id=sg2.student_id join schools sc2 on sc2.id=st2.school_id
 where sc2.org_id=(select sc.org_id from students st join schools sc on sc.id=st.school_id where st.id=_student)
 ), eligible as (select distinct st.id,st.birth_date,st.created_at from family f join students st on st.id=f.id join schools sc on sc.id=st.school_id and sc.is_active
 where st.status='active' and exists(select 1 from enrollments en join academic_years y on y.id=en.year_id join sections se on se.id=en.section_id left join terms t on t.id=se.term_id
 where en.student_id=st.id and en.status in('active','ended') and y.name=(select name from academic_years where id=_year)
 and (t.id is null or t.name=(select name from terms where year_id=_year order by start_date,name offset (_term-1) limit 1))))
 select id,row_number() over(order by birth_date nulls last,created_at,id) from eligible$function$;

create or replace function public._sf_create_tuition2(_student uuid,_year uuid,_source text) returns integer language plpgsql security definer set search_path=public as $$
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
 -- A new sibling may change the family's sibling discounts in every term it is placed in.
 if n>0 then perform _sf_refresh(s.student_id) from (select distinct x.student_id from unnest(terms) tt cross join lateral _sf_siblings(st.id,_year,tt) x) s where s.student_id<>st.id; end if;
 return n; end$$;

revoke all on function public._sf_siblings(uuid,uuid,integer), public._sf_create_tuition2(uuid,uuid,text) from public, anon, authenticated;