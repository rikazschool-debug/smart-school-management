CREATE OR REPLACE FUNCTION public.mt_candidates(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r mt_requests; me uuid := auth.uid();
begin
  select * into r from mt_requests where id=_id;
  if r.id is null or not (_perm_owner(me, r.org_id)
     or (r.kind <> 'bus' and _mt_ok(me, r.school_id, r.kind, 'follow'))
     or (r.kind = 'bus' and _mt_ok(me, r.school_id, 'bus', 'execute') and (r.assignee_id = me or r.status='awaiting_assign'))) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',u,'name',_adm_name(u),
      'open',(select count(*) from mt_requests x where x.assignee_id=u and x.status not in ('closed','cancelled'))) order by _adm_name(u))
    from _mt_users(r.school_id, r.kind, 'execute') u),'[]');
end $function$;
revoke execute on function public.mt_candidates(uuid) from public, anon;
grant execute on function public.mt_candidates(uuid) to authenticated;