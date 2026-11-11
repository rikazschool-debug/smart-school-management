CREATE OR REPLACE FUNCTION public.wa_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o uuid := _wa_org(); s wa_sync_state; nm text;
begin
  if not wa_org_ok(o) then raise exception 'forbidden'; end if;
  select * into s from wa_sync_state where org_id=o;
  select coalesce(nullif(trim(e.display_name),''), nullif(trim(e.full_name),'')) into nm
    from hr_employees e where e.user_id=auth.uid() and e.org_id=o order by e.created_at desc limit 1;
  nm := coalesce(nm, nullif(trim((select full_name from profiles where id=auth.uid())),''));
  return jsonb_build_object('owner', _wa_can(o), 'mine', _wa_perm_any(o, auth.uid(), 'mine'), 'branch', _wa_perm_any(o, auth.uid(), 'branch'),
    'synced_at', s.assign_at, 'sync_error', s.assign_error, 'name', nm);
end $function$;