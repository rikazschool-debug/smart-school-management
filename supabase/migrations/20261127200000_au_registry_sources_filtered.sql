-- Phase G: the registry's "sources" list was returned unfiltered to everyone with au_view (labels and permission names only, no data).
-- It now follows the same rule as "events"/"variables": full access or a live delegation for the source's event, and for operational sources
-- the caller's own data permission. Only the sources part changes; everything else is identical.
CREATE OR REPLACE FUNCTION public.au_registry(_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform _au_need(_org,'au_view','center');
  return jsonb_build_object(
    'sections',(select jsonb_agg(to_jsonb(s) order by s.area, s.parent, s.key) from au_sections s),
    'events',(select jsonb_agg(to_jsonb(e) order by e.section, e.code) from au_events e where ((select _au_full(_org)) or _au_ev_vis(_org, e.code, auth.uid()))
              and (e.code not like 'ds.%' or _au_ds_ok(_org, auth.uid(), e.code, null, true))),
    'variables',(select jsonb_agg(to_jsonb(v)) from au_variables v where ((select _au_full(_org)) or _au_ev_vis(_org, v.event_code, auth.uid()))
              and (v.event_code not like 'ds.%' or _au_ds_ok(_org, auth.uid(), v.event_code, null, true))),
    'operators',(select jsonb_agg(to_jsonb(o)) from au_operators o),
    'actions',(select jsonb_agg(to_jsonb(a) order by a.readiness, a.code) from au_actions a),
    'recipients',(select jsonb_agg(to_jsonb(r)) from au_recipients r),
    'triggers',(select jsonb_agg(to_jsonb(t)) from au_trigger_types t),
    'sources',(select jsonb_agg(jsonb_build_object('key',s.key,'event_code',s.event_code,'menu',s.menu,'sub',s.sub,'label',s.label,'area',s.area,'status',s.status,'reason',s.reason,
               'params',s.params,'relations',s.relations,'aggs',s.aggs,'excluded',s.excluded,'perm_sections',s.perm_sections,
               'date_field',s.date_field,'org_section',s.org_section,'covered_by',s.covered_by,'batch',s.batch,'max_rows',s.max_rows) order by s.menu, s.sub, s.label) from au_sources s
               where (select _au_full(_org)) or (s.event_code is not null and _au_ev_vis(_org, s.event_code, auth.uid())
                 and (s.event_code not like 'ds.%' or _au_ds_ok(_org, auth.uid(), s.event_code, null, true)))),
    'gaps', au_registry_gaps());
end $function$;
