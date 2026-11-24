create or replace function public._sf_terms(_student uuid,_year uuid) returns integer[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(distinct x order by x),'{}') from (
  select case when se.term_id is null then t.n else (select k from (select id,row_number() over(order by start_date,name) k from terms where year_id=_year) o where o.id=se.term_id) end x
  from enrollments en join sections se on se.id=en.section_id cross join (values(1),(2)) t(n)
  where en.student_id=_student and en.year_id=_year and en.status in('active','ended') and (se.term_id is null or t.n=1)) z where x in(1,2)$$;
revoke all on function public._sf_terms(uuid,uuid) from public,anon,authenticated;