create or replace function public.sf_receipts(_school uuid,_q text,_from date,_to date,_method text,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare yk text; begin
 perform _sf_guard(_school,'view'); yk:=(select name from academic_years where id=_year);
 return coalesce((select jsonb_agg(_sf_receipt_json(r) || jsonb_build_object(
   'fee_years',(select coalesce(jsonb_agg(distinct y.name),'[]') from sf_allocations a join sf_obligations b on b.id=a.obligation_id join academic_years y on y.id=b.year_id where a.collection_id=r.collection_id),
   'collection_year',(select y.name from academic_years y where y.school_id=r.school_id and (r.snapshot->>'paid_at')::date between y.start_date and y.end_date order by y.start_date desc limit 1))
   order by r.issued_at desc) from (select * from sf_receipts r where r.school_id=_school
  and (_q is null or r.number ilike '%'||_q||'%' or coalesce(r.snapshot->>'ref','') ilike '%'||_q||'%' or r.snapshot->'student'->>'name' ilike '%'||_q||'%')
  and (_from is null or (r.snapshot->>'paid_at')::date>=_from) and (_to is null or (r.snapshot->>'paid_at')::date<=_to) and (_method is null or r.snapshot->>'method'=_method)
  -- year scope: paid this year's fees, or a balance carried into this year after its carry (one row per receipt, never duplicated)
  and (_year is null or exists(select 1 from sf_allocations a join sf_obligations b on b.id=a.obligation_id join sf_collections c on c.id=a.collection_id
        where a.collection_id=r.collection_id and (b.year_id=_year or exists(select 1 from sf_carries ca where ca.obligation_id=b.id and ca.to_key=yk and c.created_at>=ca.created_at))))
  order by r.issued_at desc limit 500) r),'[]'); end$function$;
revoke all on function public.sf_receipts(uuid,text,date,date,text,uuid) from public,anon;
grant execute on function public.sf_receipts(uuid,text,date,date,text,uuid) to authenticated;