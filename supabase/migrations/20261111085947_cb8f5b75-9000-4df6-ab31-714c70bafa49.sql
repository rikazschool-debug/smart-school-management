CREATE OR REPLACE FUNCTION public._wa_operator_emails(_ops jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o uuid := _wa_org(); n int := 0; it jsonb;
begin
  for it in select * from jsonb_array_elements(coalesce(_ops,'[]'::jsonb)) loop
    update wa_operator_links set wati_email = lower(nullif(it->>'email',''))
      where org_id=o and wati_id=it->>'id' and wati_email is distinct from lower(nullif(it->>'email',''));
    if found then n := n + 1; end if;
  end loop;
  -- bots / codes WATI no longer lists cannot be assigned by email
  update wa_operator_links set wati_email=null where org_id=o and wati_email is not null
    and not exists(select 1 from jsonb_array_elements(coalesce(_ops,'[]'::jsonb)) x where x->>'id'=wati_id and coalesce(x->>'email','')<>'');
  return n;
end $function$;
REVOKE ALL ON FUNCTION public._wa_operator_emails(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._wa_operator_emails(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.wa_link_operator_email(text,text) FROM authenticated;