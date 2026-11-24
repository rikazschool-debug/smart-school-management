-- Allocation-level collection lines for the finance reports catalog (same sf_collections/sf_allocations as receipts; no separate balances).
create or replace function public.sf_collection_lines(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ystart date;
begin
 perform _sf_guard(_school,'view');
 select start_date into ystart from academic_years where id=_year;
 return coalesce((select jsonb_agg(jsonb_build_object('collection_id',c.id,'paid_at',c.paid_at,'created_at',c.created_at,'method',c.method,'status',c.status,'actor',coalesce(_adm_name(c.created_by),''),
   'student_id',st.id,'name',st.full_name,'cls',private._sf_cls(st.id),'school',sc.name,'kind',b.kind,'term',b.term,'year',y.name,
   'previous',_year is not null and b.year_id<>_year and y.start_date<ystart,'amount',a.amount,'receipt',(select r.number from sf_receipts r where r.collection_id=c.id)) order by c.paid_at desc, c.created_at desc)
  from sf_collections c join sf_allocations a on a.collection_id=c.id join sf_obligations b on b.id=a.obligation_id join academic_years y on y.id=b.year_id
  join students st on st.id=c.student_id join schools sc on sc.id=c.school_id
  where c.school_id=_school and (_year is null or b.year_id=_year or (y.start_date<ystart and exists(select 1 from sf_carries cr where cr.obligation_id=b.id)))),'[]'::jsonb);
end $$;
revoke all on function public.sf_collection_lines(uuid,uuid) from public, anon;
grant execute on function public.sf_collection_lines(uuid,uuid) to authenticated;