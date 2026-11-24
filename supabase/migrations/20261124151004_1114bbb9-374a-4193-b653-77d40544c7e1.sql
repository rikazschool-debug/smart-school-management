CREATE OR REPLACE FUNCTION public.sf_bus_roster(_bus uuid, _year uuid, _term integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$declare s uuid; begin
 select school_id into s from mt_buses where id=_bus; perform _sf_guard(s,'transport');
 return coalesce((select jsonb_agg(jsonb_build_object('student_id',st.id,'name',st.full_name,'exempt',t.exempt,'transport_type',t.transport_type,
   'obligation_status',o.status,'balance',case when o.id is null then null else _sf_balance(o.id) end) order by st.full_name)
  from sf_transport t join students st on st.id=t.student_id
  left join lateral (select ob.id, ob.status from sf_obligations ob where ob.student_id=t.student_id and ob.year_id=_year and ob.term=_term and ob.kind='transport' and ob.status<>'void' order by ob.created_at desc limit 1) o on true
  where t.bus_id=_bus and t.year_id=_year and t.term=_term and t.active),'[]'); end$function$;