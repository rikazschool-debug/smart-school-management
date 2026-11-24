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