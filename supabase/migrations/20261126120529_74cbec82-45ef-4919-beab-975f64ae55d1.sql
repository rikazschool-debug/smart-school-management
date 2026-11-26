CREATE OR REPLACE FUNCTION public.au_simulate(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r au_rules; d jsonb; ev au_events; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','simulate',r.school_ids,r.event_code,r.draft); select * into ev from au_events where code=r.event_code;
 d := _au_def(r.draft);
 if exists (select 1 from jsonb_array_elements(coalesce(d->'steps','[]')) s where s ? 'groups') then
   return au_simulate_def(r.org_id, r.event_code, r.school_ids, r.draft) || jsonb_build_object('rule', r.id, 'side_effects', false);
 end if;
 return jsonb_build_object('rule',r.id,'side_effects',false,'schedule',d->'schedule','next_run',_au_next_run(d->'schedule', now()),'steps',d->'steps',
  'items',coalesce((select jsonb_agg(jsonb_build_object('entity',x.entity,'task',x.entity,'school',x.school,'label',x.ctx->>'label','due',x.ctx->>'due','title',x.ctx->>'title','ctx',x.ctx - 'label' - 'link' - 'teacher_users' - 'manager_user' - 'employee_user' - 'student',
     'recipients',(select jsonb_agg(distinct u) from jsonb_array_elements(d->'steps') s, jsonb_array_elements_text(case when s->>'type'='escalate' then jsonb_build_array(s->>'to') else coalesce(s->'recipients','[]') end) c,
        lateral _au_rcpt(c, r.org_id, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(s->'users','[]')) q)) u
        where s->>'type' in ('notify','reminder','escalate') and _au_rcpt_allowed(c, r.org_id, x.school, u, ev, x.ctx))))
   from (select * from _au_srcp(r.event_code, r.org_id, r.school_ids, case when r.event_code like 'ds.%' then 5000 else 200 end, null, d->'params') y
         where (r.school_ids is null or y.school = any(r.school_ids)) and _au_eval(d->'when', y.ctx) limit 200) x),'[]'));
end $function$;