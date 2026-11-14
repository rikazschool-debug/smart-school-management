CREATE OR REPLACE FUNCTION public.pc_branch_overview(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
declare me uuid := auth.uid(); sc text := perm_scope(_org, me, 'procurement', 'view');
begin
  if sc is null or sc not in ('branch','org') then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.name) from (
    select s.id, s.name,
      (select count(*) from pc_requests r where r.school_id=s.id and r.kind='need' and r.status in ('submitted','awaiting_assignment','in_progress')) needs_open,
      (select count(*) from pc_requests r where r.school_id=s.id and r.kind='need' and r.status in ('done','closed_partial')) needs_done,
      (select count(*) from pc_expenses e where e.school_id=s.id and e.status='approved') inv_approved,
      (select coalesce(sum(total),0) from pc_expenses e where e.school_id=s.id and e.status='approved') spent,
      (select count(*) from pc_expenses e where e.school_id=s.id and e.status in ('submitted','in_review')) inv_pending,
      (select coalesce(sum(total),0) from pc_expenses e where e.school_id=s.id and e.status in ('submitted','in_review')) pending_total,
      (select count(*) from pc_expenses e where e.school_id=s.id and e.status in ('draft','returned')) inv_draft,
      (select count(*) from pc_custodies c where c.school_id=s.id and c.status in ('disbursed','settling')) custodies_open,
      (select coalesce(sum(b.book),0) from pc_custodies c cross join lateral _pc_bal(c.id, null) b where c.school_id=s.id and c.status in ('disbursed','settling')) balance
    from schools s where s.org_id=_org and _pc_ok(_org, me, 'view', s.id, null, null)) t), '[]'::jsonb);
end $f$;
REVOKE ALL ON FUNCTION public.pc_branch_overview(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pc_branch_overview(uuid) TO authenticated, service_role;