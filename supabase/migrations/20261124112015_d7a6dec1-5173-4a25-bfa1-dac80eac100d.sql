create or replace function public.sf_siblings(_student uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare s uuid; yname text; begin
 select school_id into s from students where id=_student; perform _sf_guard(s,'view');
 select name into yname from academic_years where id=_year;
 return coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'name',st.full_name,'national_id',st.national_id,'school',sc.name,'status',st.status,
  'grade',(select gr.name from enrollments en join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id join academic_years y on y.id=en.year_id where en.student_id=st.id and en.status='active' and y.name=yname limit 1),
  'stage',(select sg.name from enrollments en join sections se on se.id=en.section_id join grades gr on gr.id=se.grade_id join stages sg on sg.id=gr.stage_id join academic_years y on y.id=en.year_id where en.student_id=st.id and en.status='active' and y.name=yname limit 1),
  'rank',f.rank,
  'sibling_discount',(select coalesce(sum(a.amount),0)::text from sf_applied a join sf_obligations b on b.id=a.obligation_id join sf_discounts d on d.id=a.discount_id join academic_years y on y.id=b.year_id where b.student_id=st.id and y.name=yname and a.active and d.sibling_min is not null))
  order by f.rank,st.full_name)
 from (select student_id,min(rank) rank from (select * from _sf_siblings(_student,_year,1) union all select * from _sf_siblings(_student,_year,2)) u group by student_id) f
 join students st on st.id=f.student_id join schools sc on sc.id=st.school_id),'[]'); end$$;