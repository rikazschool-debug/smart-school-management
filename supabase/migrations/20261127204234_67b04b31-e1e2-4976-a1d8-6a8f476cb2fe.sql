create or replace function public.au_tpl_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform _au_need(_org,'au_view','center');
 return coalesce((select jsonb_agg(x order by x->>'scope' desc, x->>'category', x->>'name') from (
   select jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'description',t.description,'goal',t.goal,'category',t.category,
     'section',t.section,'section_label',(select s.label from au_sections s where s.key=t.section),
     'event',t.event_code,'event_label',e.label,
     'risk',coalesce((select _au_risk(t.event_code, _au_tpl_fill(t.def, t.params, _au_tpl_defaults(_org, t.params)), null) where _au_tpl_problem(_org, t) is null), t.risk),
     'def',t.def,'params',t.params,'status',t.status,'version',t.version,
     'scope',case when t.org_id is null then 'platform' else 'org' end,'updated_at',t.updated_at,
     'used',(select count(*) from au_rules r where r.org_id=_org and r.template_id=t.id),
     'problem',_au_tpl_problem(_org, t),
     'letters',case when exists (select 1 from jsonb_array_elements(t.params) p where p->>'type'='letter_template')
        then (select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name),'[]') from hr_letter_templates l where l.org_id=_org and l.is_active) end,
     'changelog',(select coalesce(jsonb_agg(jsonb_build_object('v',v.version,'note',v.note,'at',v.created_at) order by v.version desc),'[]') from au_template_versions v where v.template_id=t.id)) x
   from au_templates t join au_events e on e.code=t.event_code where _au_tpl_vis(_org, t)) q), '[]');
end $$;
update public.au_templates t set risk = coalesce(_au_risk(t.event_code, _au_tpl_fill(t.def, t.params, '{}'), null), t.risk)
  where org_id is null and not exists (select 1 from jsonb_array_elements(t.params) p where p->>'type'='letter_template');