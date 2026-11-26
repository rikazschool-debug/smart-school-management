CREATE OR REPLACE FUNCTION public._au_uuid(_t text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $f$ select case when _t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then _t::uuid end $f$;

CREATE OR REPLACE FUNCTION public._au_rec_codes(_ev au_events) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select array(select distinct c from (
   select unnest(coalesce(_ev.recipients,'{}')) c
   union all select 'owner'
   union all select unnest(array['school_accountant','school_maint','school_transport','school_hr','school_docs','principal','vice','counselor','nurse','student_affairs']) where coalesce(_ev.area,'school') <> 'central'
   union all select 'doc_owner' where _ev.code in ('ds.org_docs','adm.doc.expiring')
   union all select 'bus_owner' where _ev.code in ('ds.api.buses')
   union all select 'dept_owner' where exists (select 1 from au_variables v where v.event_code=_ev.code and v.key in ('department_id','academic_department'))
   union all select 'manager' where exists (select 1 from au_variables v where v.event_code=_ev.code and v.key in ('employee','employee_id'))
 ) z where c <> 'staff' and not c = any(coalesce(_ev.covered,'{}')) and exists (select 1 from au_recipients r where r.code=z.c and r.available)) $f$;

CREATE OR REPLACE FUNCTION public._au_emp_of(_org uuid, _ctx jsonb) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select coalesce(
   (select e.id from hr_employees e where e.org_id=_org and e.id = coalesce(_au_uuid(_ctx->>'employee_id'), _au_uuid(_ctx->>'employee'))),
   (select e.id from hr_employees e where e.org_id=_org and e.user_id = _au_uuid(_ctx->>'employee_user') limit 1)) $f$;

CREATE OR REPLACE FUNCTION public._au_mgr_emp(_emp uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select h.manager_id from hr_assignments h where h.employee_id=_emp and (h.end_date is null or h.end_date >= school_today()) and h.manager_id is not null
   order by h.is_primary desc nulls last, h.start_date desc nulls last limit 1 $f$;

CREATE OR REPLACE FUNCTION public._au_people(_g jsonb, _org uuid, _school uuid, _ev au_events, _ctx jsonb, _entity uuid, _ob bigint, _rule uuid)
 RETURNS TABLE(user_id uuid, code text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare sb text := _g->>'by'; sch uuid[]; us uuid[]; rl text; md text; emp uuid; lvl int; rc text; ac uuid; hd text;
begin
 sch := case when jsonb_typeof(_g->'schools')='array' then array(select e::uuid from jsonb_array_elements_text(_g->'schools') e) end;
 us := array(select e::uuid from jsonb_array_elements_text(case when jsonb_typeof(_g->'users')='array' then _g->'users' else '[]'::jsonb end) e);
 if coalesce((_g->>'central')::boolean,false) then
   if sb in ('person','role') then
     return query select distinct m.user_id, 'g:staff'::text from memberships m where m.org_id=_org and m.role='org_owner' and m.is_active
       and (sb='role' or m.user_id = any(us));
   end if;
   return;
 end if;
 if sch is not null and (_school is null or not _school = any(sch)) then return; end if;
 if sb='person' then
   return query select x, 'g:staff'::text from unnest(us) x;
 elsif sb='role' then
   rl := _g->>'role'; md := coalesce(_g->>'mode','all');
   if md='linked' then
     return query select * from _au_people(jsonb_build_object('by','record','code',
       case rl when 'accountant' then 'school_accountant' when 'maint_officer' then 'school_maint'
               when 'transport_officer' then case when _ev.code='ds.api.buses' then 'bus_owner' else 'school_transport' end
               when 'hr_officer' then 'school_hr' when 'dept_head' then 'dept_owner' when 'org_owner' then 'owner' when 'vice_principal' then 'vice' else rl end), _org,_school,_ev,_ctx,_entity,_ob,_rule);
     return;
   end if;
   return query select distinct r, 'g:staff'::text from _au_rcpt(case rl when 'org_owner' then 'owner' when 'vice_principal' then 'vice' else rl end, _org, _school, _ev.section, _ctx, null) r
     where r is not null and (md='all' or r = any(us));
 elsif sb in ('title','category','dept') then
   ac := _au_uuid(_g->>'academic'); hd := nullif(btrim(coalesce(_g->>'department','')),'');
   if sb='dept' and ac is not null and hd is null then
     return query select distinct m.user_id, 'g:staff'::text from memberships m where m.school_id=_school and m.department_id=ac and m.is_active
       union select distinct t.user_id, 'g:staff'::text from teachers t where t.school_id=_school and t.department_id=ac and t.user_id is not null;
     return;
   end if;
   return query select distinct e.user_id, 'g:staff'::text from hr_assignments h join hr_employees e on e.id=h.employee_id
     where h.org_id=_org and e.user_id is not null and e.status='active' and (h.end_date is null or h.end_date >= school_today())
       and (_school is null or h.school_id=_school)
       and case sb when 'title' then h.job_title = _g->>'title' when 'category' then h.category_id = _au_uuid(_g->>'category')
                   else (hd is null or h.department = hd) and (ac is null or exists (select 1 from memberships m where m.user_id=e.user_id and m.school_id=h.school_id and m.department_id=ac)) end;
 elsif sb='manager' then
   lvl := least(greatest(coalesce((_g->>'level')::int,1),1),3);
   emp := case when _au_uuid(_g->>'of_user') is not null then (select e.id from hr_employees e where e.org_id=_org and e.user_id=_au_uuid(_g->>'of_user') limit 1) else _au_emp_of(_org,_ctx) end;
   if emp is null then
     if lvl = 1 and _au_uuid(_g->>'of_user') is null and _au_uuid(_ctx->>'manager_user') is not null then return query select _au_uuid(_ctx->>'manager_user'), 'manager'::text; end if;
     return;
   end if;
   for i in 1..lvl loop emp := _au_mgr_emp(emp); exit when emp is null; end loop;
   if emp is not null then
     return query select e.user_id, (case when _school is not null and lvl=1 and _au_uuid(_g->>'of_user') is null then 'manager' else 'g:staff' end)::text
       from hr_employees e where e.id=emp and e.user_id is not null and e.status='active';
   end if;
 elsif sb='record' then
   rc := _g->>'code';
   if rc in ('school_accountant','school_maint','school_transport','school_hr','school_docs') then
     return query select r.user_id, 'g:staff'::text from school_responsibilities r where r.school_id=_school
       and r.kind = case rc when 'school_accountant' then 'accountant' when 'school_maint' then 'maintenance' when 'school_transport' then 'transport' when 'school_hr' then 'hr' else 'documents' end;
   elsif rc='doc_owner' then
     return query select d.responsible_user, 'g:staff'::text from org_docs d where d.org_id=_org and d.responsible_user is not null
       and d.id = coalesce(case when _ev.code in ('ds.org_docs','adm.doc.expiring') then _entity end, _au_uuid(_ctx->>'doc'));
   elsif rc='bus_owner' then
     return query select b.responsible_user, 'g:staff'::text from mt_buses b where b.org_id=_org and b.responsible_user is not null
       and b.id = coalesce(case when _ev.code='ds.api.buses' then _entity end, _au_uuid(_ctx->>'bus_id'));
   elsif rc='dept_owner' then
     return query select distinct m.user_id, 'dept_head'::text from memberships m where m.school_id=_school and m.role='dept_head' and m.is_active
       and m.department_id = coalesce(_au_uuid(_ctx->>'department_id'), _au_uuid(_ctx->>'academic_department'));
   elsif rc='manager' then
     return query select * from _au_people(jsonb_build_object('by','manager','level',1), _org,_school,_ev,_ctx,_entity,_ob,_rule);
   else
     return query select distinct r, rc from _au_rcpt(rc, _org, _school, _ev.section, _ctx, null) r where r is not null;
   end if;
 elsif sb='step' then
   return query select p.user_id, p.code from au_step_people p where p.outbox_id=_ob and p.rule_id=_rule and p.step=_g->>'step';
 end if;
end $f$;

CREATE OR REPLACE FUNCTION public._au_groups(_gs jsonb, _org uuid, _school uuid, _ev au_events, _ctx jsonb, _entity uuid, _ob bigint, _rule uuid)
 RETURNS TABLE(user_id uuid, code text, grp int, via text, ok boolean, reason text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare g jsonb; gi int := 0; n int; r record; good uuid[] := '{}'; bad uuid[] := '{}'; sel jsonb; tries int; okk boolean;
begin
 for g in select jsonb_array_elements(coalesce(_gs,'[]'::jsonb)) loop
   n := 0; tries := 0;
   loop
     sel := case when tries = 0 then g else g->'fallback' end;
     for r in select distinct on (p.user_id) p.user_id u, p.code c from _au_people(sel, _org, _school, _ev, _ctx, _entity, _ob, _rule) p where p.user_id is not null order by p.user_id, (p.code='g:staff') loop
       okk := _au_rcpt_allowed(r.c, _org, _school, r.u, _ev, _ctx);
       if okk then
         n := n + 1;
         if not r.u = any(good) then good := good || r.u; user_id := r.u; code := r.c; grp := gi; via := case when tries=0 then sel->>'by' else 'fallback:'||(sel->>'by') end; ok := true; reason := null; return next; end if;
       elsif not r.u = any(good) and not r.u = any(bad) then
         bad := bad || r.u; user_id := r.u; code := r.c; grp := gi; via := sel->>'by'; ok := false; reason := 'not_allowed:'||r.c; return next;
       end if;
     end loop;
     tries := tries + 1;
     exit when n > 0 or tries > 1 or not (g ? 'fallback');
   end loop;
   if n = 0 then user_id := null; code := null; grp := gi; via := g->>'by'; ok := false; reason := 'no_recipient:group'||(gi+1); return next; end if;
   gi := gi + 1;
 end loop;
end $f$;

DO $do$ declare d text; begin
 d := pg_get_functiondef('public._au_rcpt_allowed(text,uuid,uuid,uuid,au_events,jsonb)'::regprocedure);
 if position('g:staff' in d) = 0 then
   d := replace(d, 'if _uid is null then return false; end if;',
$x$if _uid is null then return false; end if;
 if _code = 'g:staff' then
   return _au_rcpt_ok(_org, _school, _uid, _ev.section, _ev.sensitivity)
     or (_school is null and exists (select 1 from memberships m join schools s on s.id=m.school_id and s.org_id=_org and s.is_active
          where m.user_id=_uid and m.org_id=_org and m.is_active and not coalesce(m.branch_suspended,false) and m.role::text not in ('student','guardian')
            and (coalesce(_ev.sensitivity,'normal')='normal' or _ev.section is null or left(_ev.section,1)='_' or _perm_allows_user(m.school_id,_uid,_ev.section,'view'))));
 end if;$x$);
   execute d;
 end if;
end $do$;

CREATE OR REPLACE FUNCTION public._au_check_group(_ev au_events, _g jsonb, _nofam boolean, _fb boolean)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare sb text := _g->>'by'; begin
 if jsonb_typeof(_g) <> 'object' then raise exception 'recipient group invalid'; end if;
 if sb is null or sb not in ('person','role','title','category','dept','manager','record','step') then raise exception 'unknown recipient selection %', coalesce(sb,'—'); end if;
 if _g ? 'schools' and (jsonb_typeof(_g->'schools') <> 'array' or jsonb_array_length(_g->'schools') not between 1 and 50
     or exists (select 1 from jsonb_array_elements_text(_g->'schools') e where _au_uuid(e) is null)) then raise exception 'recipient schools invalid'; end if;
 if _g ? 'users' and (jsonb_typeof(_g->'users') <> 'array' or jsonb_array_length(_g->'users') not between 1 and 50
     or exists (select 1 from jsonb_array_elements_text(_g->'users') e where _au_uuid(e) is null)) then raise exception 'recipient people list invalid (1..50)'; end if;
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
end $f$;

CREATE OR REPLACE FUNCTION public._au_check_groups(_ev au_events, _gs jsonb, _nofam boolean)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ declare g jsonb; begin
 if jsonb_typeof(_gs) <> 'array' or jsonb_array_length(_gs) not between 1 and 5 then raise exception 'recipient groups 1..5'; end if;
 for g in select jsonb_array_elements(_gs) loop perform _au_check_group(_ev, g, _nofam, true); end loop;
end $f$;

DO $do$ declare d text; begin
 d := pg_get_functiondef('public._au_check_steps(au_events,jsonb,integer)'::regprocedure);
 if position('_au_check_groups' in d) = 0 then
   d := replace(d, $s$if jsonb_typeof(st->'recipients') <> 'array' or jsonb_array_length(st->'recipients') not between 1 and 6 then raise exception 'recipients required'; end if;$s$,
     $s$if st ? 'groups' then perform _au_check_groups(_ev, st->'groups', false);
     elsif jsonb_typeof(st->'recipients') <> 'array' or jsonb_array_length(st->'recipients') not between 1 and 6 then raise exception 'recipients required'; end if;$s$);
   d := replace(d, $s$fam := st->'recipients' ? 'guardian';$s$,
     $s$fam := coalesce(st->'recipients' ? 'guardian', false) or jsonb_path_exists(coalesce(st->'groups','[]'::jsonb), 'strict $.** ? (@.code == "guardian")');$s$);
   d := replace(d, $s$if coalesce(st->>'to','') not in ('principal','owner')$s$, $s$if st ? 'groups' then perform _au_check_groups(_ev, st->'groups', true); elsif coalesce(st->>'to','') not in ('principal','owner')$s$);
   d := replace(d, $s$if r is null or r='guardian' or$s$, $s$if st ? 'groups' then perform _au_check_groups(_ev, st->'groups', true); elsif r is null or r='guardian' or$s$);
   d := replace(d, $s$  t := st->>'type'; n := n + 1;$s$, $s$  t := st->>'type'; n := n + 1;
  if st ? 'key' and coalesce(length(st->>'key'),0) not between 1 and 40 then raise exception 'step name 1..40'; end if;$s$);
   if (select count(*) from regexp_matches(d, '_au_check_groups', 'g')) <> 3 then raise exception 'check_steps rewrite incomplete'; end if;
   execute d;
 end if;
end $do$;

CREATE OR REPLACE FUNCTION public._au_notify_groups(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, sett au_settings)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ declare r record; k text := coalesce(st->>'key', p); begin
 for r in select * from _au_groups(st->'groups', o.org_id, o.school_id, ev, ctx, o.entity_id, o.id, ru.id) loop
   if r.user_id is null then perform _au_skip(j, null, p, r.reason);
   elsif not r.ok then perform _au_skip(j, r.user_id, p, r.reason);
   else
     insert into au_step_people(outbox_id, rule_id, step, user_id, code) values (o.id, ru.id, k, r.user_id, r.code) on conflict do nothing;
     perform _au_deliver(j, o, ru, ev, ctx, st, p, r.code, r.user_id, sett);
   end if;
 end loop;
end $f$;

CREATE OR REPLACE FUNCTION public._au_task_groups(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, boss uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ declare r record; t text := st->>'type'; tid uuid; n int := 0; k text := coalesce(st->>'key', p); begin
 if o.school_id is null then perform _au_skip(j, null, p, t||':no_school'); return; end if;
 for r in select * from _au_groups(st->'groups', o.org_id, o.school_id, ev, ctx, o.entity_id, o.id, ru.id) loop
   if r.user_id is null then perform _au_skip(j, null, p, r.reason); continue; end if;
   if not r.ok or r.code='guardian' then perform _au_skip(j, r.user_id, p, coalesce(r.reason,'not_allowed:guardian')); continue; end if;
   n := n + 1;
   if n > 10 then perform _au_skip(j, r.user_id, p, t||':over_10_assignees'); continue; end if;
   insert into au_step_people(outbox_id, rule_id, step, user_id, code) values (o.id, ru.id, k, r.user_id, r.code) on conflict do nothing;
   tid := null;
   insert into adm_tasks(school_id,title,description,assignee,assigner,start_date,due_date,priority,status,needs_confirmation,client_id,auto_rule_id)
     values (o.school_id,
             case when t='review' then 'طلب مراجعة: ' else '' end || _au_render(st->>'title', ctx, o.event_code),
             case when t='review' then 'أنشأه النظام آليًا بموجب قاعدة الأتمتة «'||ru.name||'» (الإصدار '||j.version||').'||E'\n'||'السبب: '||coalesce(nullif(btrim(st->>'reason'),''),'—')
                  ||E'\n'||'المرجع: '||coalesce(ctx->>'label','')||' '||coalesce(ctx->>'link','')
                  else coalesce(ctx->>'label','')||E'\n'||'أنشئت آليًا بموجب قاعدة «'||ru.name||'».' end,
             r.user_id, boss, school_today(), school_today() + coalesce((st->>'due_in_days')::int, 3),
             case when t='review' then 'high' else 'normal' end, 'new', t='review', md5(j.idem_key||p||r.user_id::text)::uuid, ru.id)
     on conflict (assigner, client_id) where client_id is not null do nothing returning id into tid;
   if tid is not null then
     perform _adm_log(o.school_id, 'task', tid, 'create', jsonb_build_object('source','automation','kind',t,'rule',ru.id,'version',j.version,'via',r.via));
     perform _notify(r.user_id, o.school_id, 'admin', case when t='review' then 'طلب مراجعة من النظام' else 'تكليف جديد' end, _au_render(st->>'title', ctx, o.event_code), '/app/admin/tasks/'||tid, 'au:'||t||':'||tid);
   end if;
 end loop;
end $f$;

DO $do$ declare d text; begin
 d := pg_get_functiondef('public._au_steps(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,au_settings)'::regprocedure);
 if position('_au_notify_groups' in d) = 0 then
   d := replace(d, $s$  p := _path||'.'||i; t := st->>'type';$s$, $s$  p := _path||'.'||i; t := st->>'type';
  if st ? 'groups' and not st ? '_to' and t in ('notify','reminder','escalate') then
    perform _au_notify_groups(j,o,ru,ev,ctx,st,p,sett); perform _au_tr(j, p, t, 'done'); i := i + 1; continue;
  end if;
  if st ? 'groups' and t in ('task','review') then
    if (ctx->>'auto_rule') is not null then perform _au_skip(j,null,p,'loop_guard:automated_source'); perform _au_tr(j, p, t, 'skipped');
    else perform _au_task_groups(j,o,ru,ev,ctx,st,p,boss); perform _au_tr(j, p, t, 'done'); end if;
    i := i + 1; continue;
  end if;$s$);
   if position('_au_notify_groups' in d) = 0 then raise exception 'steps rewrite failed'; end if;
   execute d;
 end if;
end $do$;

DO $do$ declare d text; begin
 d := pg_get_functiondef('public.au_simulate_def(uuid,text,uuid[],jsonb)'::regprocedure);
 if position('_au_groups' in d) = 0 then
   d := replace(d, $s$   for st in select s from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate" || @.type == "task" || @.type == "review")') s loop
     for c in$s$, $s$   for st in select s from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate" || @.type == "task" || @.type == "review")') s loop
     if st ? 'groups' then
       rcs := rcs || (select coalesce(jsonb_agg(jsonb_build_object('step',st->>'type','group',g.grp+1,'via',g.via,
           'eligible',g.n_ok,'excluded',g.n_bad,'none',g.none,'names',g.names,'reasons',g.reasons) order by g.grp), '[]'::jsonb)
         from (select z.grp, min(z.via) via, count(*) filter (where z.ok) n_ok, count(*) filter (where not z.ok and z.user_id is not null) n_bad,
                 bool_or(z.user_id is null) none,
                 (select jsonb_agg(coalesce(pf.full_name,'—')) from (select z2.user_id from _au_groups(st->'groups', _org, x.school, ev, x.ctx, x.entity, null, null) z2 where z2.grp=z.grp and z2.ok limit 10) q left join profiles pf on pf.id=q.user_id) names,
                 jsonb_agg(distinct z.reason) filter (where z.reason is not null) reasons
               from _au_groups(st->'groups', _org, x.school, ev, x.ctx, x.entity, null, null) z group by z.grp) g);
       continue;
     end if;
     for c in$s$);
   if position('_au_groups' in d) = 0 then raise exception 'simulate rewrite failed'; end if;
   execute d;
 end if;
end $do$;

CREATE OR REPLACE FUNCTION public.au_rcpt_options(_org uuid, _kind text, _event text DEFAULT NULL, _q text DEFAULT NULL, _limit int DEFAULT 50, _offset int DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare ev au_events; q text := nullif(btrim(coalesce(_q,'')),''); lim int := least(greatest(coalesce(_limit,50),1),200); off int := greatest(coalesce(_offset,0),0); sc uuid[]; isfull boolean; begin
 perform _au_need_any(_org,'au_manage',array['designer','create','edit','simulate']);
 isfull := _au_full(_org);
 sc := array(select s.id from schools s where s.org_id=_org and s.is_active and (isfull or exists(select 1 from au_delegations dl where dl.org_id=_org and dl.user_id=auth.uid() and _au_dlive(dl) and (dl.school_ids is null or s.id = any(dl.school_ids)))));
 if q is not null and length(q) > 60 then raise exception 'search too long'; end if;
 if _kind='record' then
   select * into ev from au_events where code=_event; if ev.code is null then raise exception 'unknown event'; end if;
   return coalesce((select jsonb_agg(jsonb_build_object('v',r.code,'l',r.label) order by r.label) from au_recipients r where r.code = any(_au_rec_codes(ev))),'[]'::jsonb);
 elsif _kind='role' then
   return (select jsonb_agg(jsonb_build_object('v',t.v,'l',t.l,'linked',t.k) order by t.o) from (values
     (1,'owner','مدير النظام',false),(2,'principal','مدير المدرسة',true),(3,'vice','وكيل المدرسة',true),(4,'accountant','المحاسب',true),(5,'hr_officer','مسؤول الموارد البشرية',true),
     (6,'maint_officer','مسؤول الصيانة',true),(7,'transport_officer','مسؤول النقل',true),(8,'dept_head','رئيس القسم',true),(9,'counselor','المرشد الطلابي',true),
     (10,'student_affairs','شؤون الطلاب',true),(11,'nurse','التوجيه الصحي',true),(12,'teacher','المعلم',true),(13,'supervisor','المشرف التربوي',true)) t(o,v,l,k));
 elsif _kind='title' then
   return coalesce((select jsonb_agg(jsonb_build_object('v',z.t,'l',z.t) order by z.t) from (select distinct h.job_title t from hr_assignments h
     where h.org_id=_org and h.job_title is not null and btrim(h.job_title)<>'' and (h.end_date is null or h.end_date >= school_today()) and (h.school_id is null or h.school_id = any(sc))
       and (q is null or h.job_title ilike '%'||q||'%') order by 1 offset off limit lim) z),'[]'::jsonb);
 elsif _kind='category' then
   return coalesce((select jsonb_agg(jsonb_build_object('v',c.id,'l',c.name) order by c.name) from (select * from hr_job_categories c0 where c0.org_id=_org and c0.is_active and (q is null or c0.name ilike '%'||q||'%') order by c0.name offset off limit lim) c),'[]'::jsonb);
 elsif _kind='dept' then
   return coalesce((select jsonb_agg(z.j order by z.o, z.l) from (
       select distinct jsonb_build_object('v',h.department,'l',h.department,'kind','main') j, 1 o, h.department l from hr_assignments h
         where h.org_id=_org and nullif(btrim(h.department),'') is not null and (h.end_date is null or h.end_date >= school_today()) and (q is null or h.department ilike '%'||q||'%')
       union select jsonb_build_object('v',d.id,'l',d.name||' — '||s.name,'kind','academic','school',s.id), 2, d.name from departments d join schools s on s.id=d.school_id
         where s.id = any(sc) and (q is null or d.name ilike '%'||q||'%')) z),'[]'::jsonb);
 else raise exception 'unknown list %', _kind; end if;
end $f$;
REVOKE ALL ON FUNCTION public.au_rcpt_options(uuid,text,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.au_rcpt_options(uuid,text,text,text,int,int) TO authenticated;

REVOKE ALL ON FUNCTION public._au_people(jsonb,uuid,uuid,au_events,jsonb,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_groups(jsonb,uuid,uuid,au_events,jsonb,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_notify_groups(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,au_settings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_task_groups(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_check_group(au_events,jsonb,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_check_groups(au_events,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_rec_codes(au_events) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_emp_of(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_mgr_emp(uuid) FROM PUBLIC, anon, authenticated;