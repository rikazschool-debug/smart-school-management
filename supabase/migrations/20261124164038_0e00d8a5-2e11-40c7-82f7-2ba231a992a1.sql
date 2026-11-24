-- Obligation-level lines for the finance reports catalog (balances only from _sf_balance — the same source as accounts/dashboard).
create or replace function public.sf_obligation_lines(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ystart date;
begin
 perform _sf_guard(_school,'view');
 select start_date into ystart from academic_years where id=_year;
 return coalesce((select jsonb_agg(jsonb_build_object('obligation_id',b.id,'student_id',st.id,'name',st.full_name,'student_status',st.status,'placed',exists(select 1 from enrollments e where e.student_id=st.id and e.status='active'),
   'cls',private._sf_cls(st.id),'school',sc.name,'year',y.name,'kind',b.kind,'term',b.term,'status',b.status,'due_date',b.due_date,'manual_override',b.manual_override,
   'original',b.original,'amount',b.amount,'balance',_sf_balance(b.id),'previous',_year is not null and b.year_id<>_year,
   'carried',exists(select 1 from sf_carries cr where cr.obligation_id=b.id),
   'overdue',b.status='pending' and b.due_date is not null and b.due_date<school_today() and (_sf_balance(b.id)->>'remaining')::numeric>0,
   'days_late',case when b.due_date is not null and b.due_date<school_today() then school_today()-b.due_date end) order by st.full_name,y.start_date,b.term,b.kind)
  from sf_obligations b join students st on st.id=b.student_id join schools sc on sc.id=b.school_id join academic_years y on y.id=b.year_id
  where b.school_id=_school and (_year is null or b.year_id=_year or (y.start_date<ystart and b.status='pending' and ((_sf_balance(b.id)->>'remaining')::numeric>0 or (_sf_balance(b.id)->>'credit')::numeric>0)))),'[]'::jsonb);
end $$;
revoke all on function public.sf_obligation_lines(uuid,uuid) from public, anon;
grant execute on function public.sf_obligation_lines(uuid,uuid) to authenticated;