CREATE OR REPLACE FUNCTION public._au_mt_ev(_req uuid, _actor uuid, _action text, _after jsonb)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ insert into mt_events(request_id, actor, action, visibility, body, before, after) values (_req, _actor, _action, 'public', null, null, _after) $$;
REVOKE ALL ON FUNCTION public._au_mt_ev(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._au_act_mt(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, boss uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare k text := coalesce(st->>'key', p); rid uuid; cat mt_categories; v_yr int; v_n int; v_ref text; ex uuid[]; r mt_requests; u uuid; ck text := md5(j.idem_key||p);
begin
 if exists (select 1 from au_step_out where outbox_id=o.id and rule_id=ru.id and step=k) then return null; end if;
 if o.school_id is null then return 'no_school'; end if;
 if not _mt_ok(boss, o.school_id, 'school', 'request') then return 'approver_cannot_request'; end if;
 select x.id into rid from mt_requests x where x.requested_by=boss and x.client_key=ck;
 if rid is null then
   select * into cat from mt_categories c where c.id=_au_uuid(st->>'category') and c.kind='school' and c.parent_id is null and c.active and (c.org_id is null or c.org_id=o.org_id);
   if cat.id is null then return 'category_unavailable'; end if;
   v_yr := extract(year from now() at time zone 'Asia/Riyadh');
   insert into mt_counters as q (org_id,kind,yr,n) values (o.org_id,'school',v_yr,1) on conflict (org_id,kind,yr) do update set n=q.n+1 returning q.n into v_n;
   v_ref := 'MS-' || v_yr || '-' || lpad(v_n::text,4,'0');
   insert into mt_requests(org_id,school_id,kind,ref,title,description,priority,category_id,place,requested_by,client_key,status)
   values (o.org_id, o.school_id, 'school', v_ref, left(btrim(_au_render(st->>'title', ctx, o.event_code)),120),
           left(btrim(_au_render(st->>'description', ctx, o.event_code)) || E'\n' || 'أنشئ آليًا بموجب قاعدة «'||ru.name||'» (الإصدار '||j.version||').', 1000),
           coalesce(st->>'priority','normal'), cat.id, btrim(st->>'place'), boss, ck, 'new') returning id into rid;
   perform _au_mt_ev(rid, boss, 'create', jsonb_build_object('priority',coalesce(st->>'priority','normal'),'source','automation','rule',ru.id,'version',j.version));
   if st ? 'assign' then
     select g.user_id into u from _au_groups(st->'assign', o.org_id, o.school_id, ev, ctx, o.entity_id, o.id, ru.id) g
      where g.ok and g.user_id is not null and g.user_id in (select x from _mt_users(o.school_id,'school','execute') x) limit 1;
     if u is null then perform _au_skip(j, null, p, 'mt_request:assignee_not_executor'); end if;
   end if;
   if u is null then
     select array_agg(x) into ex from _mt_users(o.school_id,'school','execute') x where x <> boss;
     if coalesce(array_length(ex,1),0) = 1 then u := ex[1]; end if;
   end if;
   if u is not null then
     update mt_requests set status='assigned', assignee_id=u where id=rid returning * into r;
     perform _au_mt_ev(rid, boss, 'auto_assign', jsonb_build_object('assignee',u,'source','automation'));
     perform _mt_note(r, u, 'أُسند إليك طلب صيانة', 'assign:'||u);
   else
     update mt_requests set status='awaiting_assign' where id=rid returning * into r;
     perform _mt_notify_follow(r, 'طلب جديد بانتظار الإسناد', 'new');
   end if;
 end if;
 perform _au_out_put(o.id, ru.id, k, 'mt_request', rid, '{}');
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public._au_act_set(j au_jobs, o au_outbox, ru au_rules, st jsonb, p text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare f au_update_fields; v text := st->>'value'; hit uuid; boss uuid;
begin
 boss := coalesce((select approved_by from au_rule_versions where rule_id=ru.id and version=j.version), ru.created_by);
 select * into f from au_update_fields where event_code=o.event_code and field=st->>'field';
 if f.field is null or not v = any(f.allowed) then return 'field_not_allowed'; end if;
 if f.target='adm_tasks' then
   update adm_tasks set priority=v where id=o.entity_id and school_id=o.school_id and status not in ('done','cancelled') and priority is distinct from v returning id into hit;
   if hit is not null then perform _adm_log(o.school_id,'task',hit,'update',jsonb_build_object('source','automation','field','priority','value',v,'rule',ru.id,'version',j.version)); end if;
 elsif f.target='mt_requests' then
   update mt_requests set priority=v, updated_at=now() where id=o.entity_id and org_id=o.org_id and status not in ('closed','cancelled') and priority is distinct from v returning id into hit;
   if hit is not null then perform _au_mt_ev(hit, boss, 'priority', jsonb_build_object('priority',v,'source','automation','rule',ru.id)); end if;
 else return 'field_not_allowed'; end if;
 return null;
end $function$;
REVOKE ALL ON FUNCTION public._au_act_mt(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,uuid), public._au_act_set(au_jobs,au_outbox,au_rules,jsonb,text) FROM PUBLIC, anon, authenticated;