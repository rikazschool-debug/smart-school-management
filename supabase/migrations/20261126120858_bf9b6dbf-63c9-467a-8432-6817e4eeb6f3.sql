CREATE OR REPLACE FUNCTION public._au_pick_ok(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
 select auth.uid() is null
  or exists (select 1 from memberships m where m.user_id=_uid and is_org_owner(m.org_id))
  or exists (select 1 from au_delegations dl join memberships m on m.user_id=_uid and m.org_id=dl.org_id
              where dl.user_id=auth.uid() and _au_dlive(dl)
                and (m.school_id = any(coalesce(dl.school_ids,'{}')) or (dl.include_central and m.school_id is null)))
$$;
REVOKE ALL ON FUNCTION public._au_pick_ok(uuid) FROM PUBLIC, anon, authenticated;