CREATE OR REPLACE FUNCTION public._au_pick_ok(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
 select auth.uid() is null
  or exists (select 1 from memberships m where m.user_id=_uid and m.is_active and is_org_owner(m.org_id))
  or exists (select 1 from au_delegations dl join memberships m on m.user_id=_uid and m.is_active and m.org_id=dl.org_id
              where dl.user_id=auth.uid() and _au_dlive(dl)
                and (m.school_id = any(coalesce(dl.school_ids,'{}')) or (dl.include_central and m.school_id is null)))
$$;
REVOKE ALL ON FUNCTION public._au_pick_ok(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._au_check_group(_ev au_events, _g jsonb, _nofam boolean, _fb boolean)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare sb text := _g->>'by'; begin
 if jsonb_typeof(_g) <> 'object' then raise exception 'recipient group invalid'; end if;
 if sb is null or sb not in ('person','role','title','category','dept','manager','record','step') then raise exception 'unknown recipient selection %', coalesce(sb,'—'); end if;
 if _g ? 'schools' and (jsonb_typeof(_g->'schools') <> 'array' or jsonb_array_length(_g->'schools') not between 1 and 50
     or exists (select 1 from jsonb_array_elements_text(_g->'schools') e where _au_uuid(e) is null)) then raise exception 'recipient schools invalid'; end if;
 if _g ? 'users' and (jsonb_typeof(_g->'users') <> 'array' or jsonb_array_length(_g->'users') not between 1 and 50
     or exists (select 1 from jsonb_array_elements_text(_g->'users') e where _au_uuid(e) is null)) then raise exception 'recipient people list invalid (1..50)'; end if;
 if _g ? 'users' and exists (select 1 from jsonb_array_elements_text(_g->'users') e where not _au_pick_ok(_au_uuid(e))) then raise exception 'a chosen person is outside your automation scope' using errcode='42501'; end if;
 if _g ? 'of_user' and _au_uuid(_g->>'of_user') is not null and not _au_pick_ok(_au_uuid(_g->>'of_user')) then raise exception 'a chosen person is outside your automation scope' using errcode='42501'; end if;
 if coalesce((_g->>'central')::boolean,false) and sb not in ('person','role') then raise exception 'central administration applies to named people or roles'; end if;
 if sb='person' and not (_g ? 'users') then raise exception 'choose at least one person'; end if;
 if sb='role' then
   if coalesce(_g->>'role','') not in ('owner','org_owner','principal','vice','vice_principal','counselor','nurse','student_affairs','dept_head','teacher','supervisor','accountant','hr_officer','transport_officer','maint_officer') then raise exception 'role % not supported', coalesce(_g->>'role','—'); end if;
   if coalesce(_g->>'mode','all') not in ('all','specific','linked') then raise exception 'role mode all/specific/linked'; end if;
   if _g->>'mode'='specific' and not (_g ? 'users') then raise exception 'choose the specific people for this role'; end if;
   if _g->>'mode'='linked' and not (case _g->>'role' when 'accountant' then 'school_accountant' when 'maint_officer' then 'school_maint' when 'transport_officer' then case when _ev.code='ds.api.buses' then 'bus_owner' else 'school_transport' end when 'hr_officer' then 'school_hr' when 'dept_head' then 'dept_owner' when 'org_owner' then 'owner' when 'vice_principal' then 'vice' else _g->>'role' end) = any(_au_rec_codes(_ev))
     then raise exception 'no record-linked % for this event', _g->>'role'; end if;
 end if;
 if sb='title' and coalesce(length(btrim(_g->>'title')),0) not between 2 and 120 then raise exception 'job title required'; end if;
 if sb='category' and _au_uuid(_g->>'category') is null then raise exception 'job category required'; end if;
 if sb='dept' and nullif(btrim(coalesce(_g->>'department','')),'') is null and _au_uuid(_g->>'academic') is null then raise exception 'department required'; end if;
 if sb='manager' and (coalesce((_g->>'level')::int,1) not between 1 and 3 or (_g ? 'of_user' and _au_uuid(_g->>'of_user') is null)) then raise exception 'manager level 1..3'; end if;
 if sb='manager' and not (_g ? 'of_user') and not 'manager' = any(_au_rec_codes(_ev)) then raise exception 'this event has no employee to find a manager for'; end if;
 if sb='record' and not coalesce(_g->>'code','') = any(_au_rec_codes(_ev)) then raise exception 'responsibility % not available for this event', coalesce(_g->>'code','—'); end if;
 if sb='step' and coalesce(length(_g->>'step'),0) not between 1 and 40 then raise exception 'previous step required'; end if;
 if (sb='record' and _g->>'code'='guardian') then
   if _nofam then raise exception 'guardians cannot be assigned tasks or escalations'; end if;
   if not 'guardian' = any(_ev.recipients) or _ev.sensitivity='restricted' then raise exception 'guardian not allowed for this event'; end if;
 end if;
 if _g ? 'fallback' then
   if not _fb then raise exception 'a fallback cannot have its own fallback'; end if;
   perform _au_check_group(_ev, _g->'fallback', _nofam, false);
 end if;
end $function$;

CREATE OR REPLACE FUNCTION public.au_people_titles(_org uuid, _ids uuid[])
 RETURNS TABLE(user_id uuid, title text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_full boolean := _au_full(_org); begin
 if not (v_full or exists(select 1 from au_delegations dl where dl.org_id=_org and dl.user_id=auth.uid() and _au_dlive(dl))) then raise exception 'forbidden' using errcode='42501'; end if;
 return query select distinct on (e.user_id) e.user_id, coalesce(nullif(h.job_title,''), e.job_title) from hr_employees e
   left join hr_assignments h on h.employee_id=e.id and (h.end_date is null or h.end_date >= school_today())
   where e.org_id=_org and e.user_id = any(coalesce(_ids,'{}')) and e.status='active'
     and (v_full or exists (select 1 from au_delegations dl join memberships m on m.user_id=e.user_id and m.is_active and m.org_id=_org
            where dl.org_id=_org and dl.user_id=auth.uid() and _au_dlive(dl)
              and (m.school_id = any(coalesce(dl.school_ids,'{}')) or (dl.include_central and m.school_id is null))))
   order by e.user_id, h.is_primary desc nulls last, h.start_date desc nulls last;
end $function$;