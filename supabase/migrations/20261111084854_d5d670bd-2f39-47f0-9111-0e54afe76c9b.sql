CREATE OR REPLACE FUNCTION public.wa_codes()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o uuid := _wa_org();
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'operators', coalesce((select jsonb_agg(r order by (r->>'count')::int desc) from (
      select jsonb_build_object('code', c.wati_assignee, 'count', count(*),
        'user_id', l.user_id, 'user_name', case when l.user_id is not null then _adm_name(l.user_id) end,
        'samples', (array_agg(coalesce(c.contact_name, c.wa_id) order by c.last_at desc nulls last))[1:4],
        'owners', (select jsonb_agg(z) from (select c2.contact_owner n, count(*) k from wa_conversations c2 where c2.org_id=o and c2.wati_assignee=c.wati_assignee and c2.contact_owner is not null group by 1 order by 2 desc limit 3) z),
        'operators', (select jsonb_agg(z) from (select m.operator_name n, count(*) k from wa_messages m join wa_conversations c3 on c3.id=m.conversation_id where c3.org_id=o and c3.wati_assignee=c.wati_assignee and m.direction='out' and coalesce(m.operator_name,'')<>'' group by 1 order by 2 desc limit 3) z)) r
      from wa_conversations c left join wa_operator_links l on l.org_id=o and l.wati_id=c.wati_assignee
      where c.org_id=o and c.wati_assignee is not null group by c.wati_assignee, l.user_id) q), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(r order by (r->>'count')::int desc) from (
      select jsonb_build_object('code', u.t, 'count', count(*), 'school_id', l.school_id, 'school_name', s.name, 'label', l.label,
        'samples', (array_agg(coalesce(c.contact_name, c.wa_id) order by c.last_at desc nulls last))[1:4],
        'names', (select jsonb_agg(z) from (select x n, count(*) k from wa_conversations c2, unnest(c2.contact_teams) x where c2.org_id=o and u.t = any(c2.wati_team_ids) and cardinality(c2.wati_team_ids)=1 group by 1 order by 2 desc limit 3) z)) r
      from wa_conversations c cross join lateral unnest(c.wati_team_ids) u(t)
      left join wa_team_links l on l.org_id=o and l.wati_id=u.t left join schools s on s.id=l.school_id
      where c.org_id=o group by u.t, l.school_id, s.name, l.label) q), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', _adm_name(x.user_id),
        'school', concat_ws(' · ', nullif(h.job_title,''), coalesce(h.hs, x.sn))) order by _adm_name(x.user_id)) from (
      select distinct on (m.user_id) m.user_id, s.name sn from memberships m join schools s on s.id=m.school_id
      where s.org_id=o and m.is_active and m.role not in ('student','guardian') order by m.user_id, s.name) x
      left join lateral (
        select a.job_title, case when a.school_id is null then 'الإدارة المركزية' else hs.name end hs
        from hr_employees e join hr_assignments a on a.employee_id=e.id left join schools hs on hs.id=a.school_id
        where e.user_id=x.user_id and e.org_id=o and a.is_primary and a.start_date<=current_date and (a.end_date is null or a.end_date>=current_date)
        order by a.start_date desc limit 1) h on true), '[]'::jsonb),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=o and s.is_active), '[]'::jsonb));
end $function$;