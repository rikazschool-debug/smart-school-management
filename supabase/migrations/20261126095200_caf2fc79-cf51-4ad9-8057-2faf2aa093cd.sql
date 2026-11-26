CREATE OR REPLACE FUNCTION public.automation_tick(_budget_ms integer DEFAULT 3000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; cn int := 0; df int := 0; sc int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs;
  run bigint; res text; ids bigint[]; lat bigint[] := '{}'; dd jsonb; x record; bs int; n int; mx uuid; sch uuid[];
begin
 if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
 if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
 if not exists (select 1 from au_rules where active and next_run_at is not null and next_run_at <= now())
    and not exists (select 1 from au_outbox where status='pending')
    and not exists (select 1 from au_jobs where status='queued' and next_at <= now()) then
   return jsonb_build_object('skipped','idle'); end if;
 for r in select ru.* from au_rules ru join au_events e on e.code=ru.event_code left join au_settings s on s.org_id=ru.org_id
          where ru.active and ru.approved_version is not null and e.source_kind='scan' and e.status in ('wired','tested') and not coalesce(s.kill_switch,false)
            and ru.next_run_at is not null and ru.next_run_at <= now() order by ru.next_run_at limit 200 loop
   begin
   select * into v from au_rule_versions where rule_id=r.id and version=r.approved_version; dd := _au_def(v.definition);
   sch := (select array_agg(e::uuid) from jsonb_array_elements_text(nullif(v.definition->'schools','null')) e);
   if r.event_code like 'ds.%' then
     bs := coalesce((select batch from au_sources where event_code=r.event_code),1000); n := 0; mx := null;
     for x in select * from _au_srcp(r.event_code, r.org_id, coalesce(sch, r.school_ids), bs, null,
                coalesce(nullif(dd->'params','null'::jsonb),'{}'::jsonb) || case when r.scan_cursor is null then '{}'::jsonb else jsonb_build_object('_after', r.scan_cursor) end) loop
       n := n + 1; mx := x.entity;
       if _au_eval(dd->'when', x.ctx) then
         insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
           values (r.org_id, x.school, r.event_code, x.entity, x.ctx || jsonb_build_object('_period',x.period), r.id||':'||r.event_code||':'||x.entity||':'||coalesce(x.school::text,'')||':'||x.period, r.id)
           on conflict (dedupe_key) do nothing;
       end if;
     end loop;
     if n >= bs then update au_rules set scan_cursor=mx, last_run_at=now() where id=r.id;
     else update au_rules set scan_cursor=null, last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id; end if;
   else
     insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
       select r.org_id, x2.school, r.event_code, x2.entity, x2.ctx || jsonb_build_object('_period',x2.period), r.id||':'||r.event_code||':'||x2.entity||':'||coalesce(x2.school::text,'')||':'||x2.period, r.id
       from _au_src(r.event_code, r.org_id, sch, 5000, null) x2
       where _au_eval(dd->'when', x2.ctx)
       on conflict (dedupe_key) do nothing;
     update au_rules set last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id;
   end if;
   exception when others then
     insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id, r.id, null,
       case when sqlerrm like 'finance balance check failed%' then 'fin_mismatch' else 'scan_error' end,
       jsonb_build_object('event', r.event_code, 'error', left(sqlerrm,300)));
     update au_rules set next_run_at = now() + interval '15 minutes' where id=r.id;
   end;
   sc := sc + 1;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/3000.0);
 end loop;
 ids := array(select z.id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn from au_outbox q where q.status='pending') z where z.rn <= 200 order by z.rn, z.id limit 1000);
 for o in select * from au_outbox where id = any(ids) and status='pending' order by id for update skip locked loop
   ev := ev + 1;
   for r in select ru.*, rv.definition from au_rules ru join au_rule_versions rv on rv.rule_id=ru.id and rv.version=ru.approved_version left join au_settings s on s.org_id=ru.org_id
            where ru.org_id=o.org_id and ru.event_code=o.event_code and ru.active and not coalesce(s.kill_switch,false) and (o.rule_id is null or ru.id=o.rule_id)
              and (ru.school_ids is null or o.school_id = any(ru.school_ids)) order by ru.priority, ru.created_at loop
     dd := _au_def(r.definition);
     if _au_eval(dd->'when', o.payload) then
       insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path) values (o.org_id,r.id,r.approved_version,o.id,'workflow',
         case when o.rule_id is null then r.id||':'||o.dedupe_key else o.dedupe_key end, dd->'steps','0') on conflict (idem_key) do nothing;
     end if;
   end loop;
   update au_outbox set status='done', processed_at=now() where id=o.id;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1500.0);
 end loop;
 ids := array(select id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn, coalesce(s.per_org_batch,100) lim
          from au_jobs q left join au_settings s on s.org_id=q.org_id where q.status='queued' and q.next_at <= now()) z where rn <= lim order by rn, id limit 1000);
 for j in select * from au_jobs where id = any(ids) and status='queued' order by id for update skip locked loop
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
   begin
     res := _au_exec(j);
     if res='done' then update au_jobs set status='done', attempts=attempts+1, done_at=now() where id=j.id; ok := ok + 1;
       lat := lat || (extract(epoch from (clock_timestamp() - greatest(j.created_at, j.next_at)))*1000)::bigint;
     elsif res='deferred' then df := df + 1;
     else update au_jobs set status='cancelled', done_at=now(), last_error=substr(res,11) where id=j.id; cn := cn + 1; end if;
   exception when others then
     bad := bad + 1; perform set_config('au.depth','0',true);
     update au_jobs set attempts=attempts+1, last_error=left(sqlerrm,300), status=case when attempts+1>=5 then 'dead' else 'queued' end,
       next_at=now()+make_interval(mins=>power(2,attempts+1)::int) where id=j.id;
   end;
 end loop;
 insert into au_runs(ms,events,jobs_done,jobs_failed,scanned,cancelled,deferred,lat_avg_ms,lat_max_ms)
   values (extract(milliseconds from clock_timestamp()-t0)::int, ev, ok, bad, sc, cn, df, (select avg(x3)::int from unnest(lat) x3), (select max(x3)::int from unnest(lat) x3)) returning id into run;
 return jsonb_build_object('run',run,'events',ev,'done',ok,'failed',bad,'scanned',sc,'cancelled',cn,'deferred',df);
end $function$;

DROP FUNCTION IF EXISTS public.au_query(uuid, text, uuid[], jsonb, jsonb, text, jsonb, text, boolean, integer, integer);
CREATE FUNCTION public.au_query(_org uuid, _event text, _schools uuid[] DEFAULT NULL::uuid[], _params jsonb DEFAULT NULL::jsonb, _where jsonb DEFAULT NULL::jsonb, _group text DEFAULT NULL::text, _aggs jsonb DEFAULT NULL::jsonb, _sort text DEFAULT NULL::text, _desc boolean DEFAULT false, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _entity uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t0 timestamptz := clock_timestamp(); ev au_events; prm jsonb; cap int; scanned int; arr jsonb; a jsonb; f text; op text; vt text; aggs jsonb := '[]'::jsonb;
  res jsonb := '{}'::jsonb; grp jsonb; items jsonb; nm int; st text; gf text; gran text; gt text; begin
 perform _au_need_on(_org,'au_manage','simulate',_schools,_event,null);
 if not (_au_full(_org) or _au_ev_vis(_org,_event,auth.uid())) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into ev from au_events where code=_event;
 if ev.code is null or ev.status not in ('wired','tested') or ev.source_kind <> 'scan' then raise exception 'source not available for queries'; end if;
 if _schools is not null then perform _au_check_schools(_org, _schools); end if;
 prm := _au_check_params(_event, _params);
 if _where is not null and _where <> 'null'::jsonb then perform _au_check_cond(_event, _where); end if;
 gf := split_part(coalesce(_group,''),':',1); gran := nullif(split_part(coalesce(_group,''),':',2),'');
 if _group is not null then
   select v.type into gt from au_variables v where v.event_code=_event and v.key=gf;
   if gran is not null then
     if gran not in ('day','week','month','year') or gt is distinct from 'date' then raise exception 'cannot group by %', _group; end if;
   elsif not exists (select 1 from au_variables v where v.event_code=_event and v.key=gf and ('group' = any(v.flags) or v.type in ('status','bool'))) then raise exception 'cannot group by %', _group; end if;
 end if;
 if _sort is not null and not exists (select 1 from au_variables v where v.event_code=_event and v.key=_sort and v.type in ('number','percent','date','text','status')) then raise exception 'cannot sort by %', _sort; end if;
 if coalesce(_limit,50) not between 0 and 200 then raise exception 'limit 0..200'; end if;
 if coalesce(_offset,0) < 0 then raise exception 'offset >= 0'; end if;
 if _aggs is not null and (jsonb_typeof(_aggs) <> 'array' or jsonb_array_length(_aggs) > 8) then raise exception 'up to 8 calculations'; end if;
 for a in select jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) loop
   op := a->>'op'; f := a->>'field';
   if op not in ('count','count_distinct','sum','avg','min','max','pct') then raise exception 'unknown calculation %', op; end if;
   if op = 'count_distinct' then
     if not exists (select 1 from au_variables v where v.event_code=_event and v.key=f) then raise exception 'calculation % not valid for %', op, coalesce(f,'—'); end if;
   elsif op = 'pct' then
     select v.type into vt from au_variables v where v.event_code=_event and v.key=f;
     if vt is distinct from 'bool' then raise exception 'calculation % not valid for %', op, coalesce(f,'—'); end if;
   elsif op <> 'count' then
     select v.type into vt from au_variables v where v.event_code=_event and v.key=f;
     if vt is null or not (vt in ('number','percent') or (op in ('min','max') and vt='date')) then raise exception 'calculation % not valid for %', op, coalesce(f,'—'); end if;
   end if;
 end loop;
 cap := case when _event like 'ds.%' then coalesce((select max_rows from au_sources where event_code=_event),20000) else 5000 end;
 select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('e',y.entity,'s',y.school,'c',y.ctx)) filter (where _au_eval(nullif(_where,'null'::jsonb), y.ctx)),'[]'::jsonb)
   into scanned, arr
   from _au_srcp(_event, _org, _schools, case when _entity is null then cap else 1 end, _entity, prm) y where (_schools is null or y.school = any(_schools));
 nm := jsonb_array_length(arr);
 for a in select jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) loop
   op := a->>'op'; f := a->>'field';
   select vt2.type into vt from au_variables vt2 where vt2.event_code=_event and vt2.key=f;
   aggs := aggs || jsonb_build_object('op',op,'field',f,'value',
     case op when 'count_distinct' then (select to_jsonb(count(distinct r->'c'->>f)) from jsonb_array_elements(arr) r)
       when 'pct' then (select to_jsonb(case when nm>0 then round(count(*) filter (where r->'c'->>f = 'true')*100.0/nm,2) else 0 end) from jsonb_array_elements(arr) r)
       when 'count' then (select to_jsonb(count(*)) from jsonb_array_elements(arr) r where f is null or (r->'c'->f) is not null and r->'c'->f <> 'null'::jsonb)
       when 'sum' then (select to_jsonb(round(coalesce(sum((r->'c'->>f)::numeric),0),2)) from jsonb_array_elements(arr) r)
       when 'avg' then (select to_jsonb(round(avg((r->'c'->>f)::numeric),2)) from jsonb_array_elements(arr) r)
       when 'min' then (select case when vt='date' then to_jsonb(min((r->'c'->>f)::date)) else to_jsonb(min((r->'c'->>f)::numeric)) end from jsonb_array_elements(arr) r)
       when 'max' then (select case when vt='date' then to_jsonb(max((r->'c'->>f)::date)) else to_jsonb(max((r->'c'->>f)::numeric)) end from jsonb_array_elements(arr) r) end);
 end loop;
 if _group is not null then
   select coalesce(jsonb_agg(g order by g->>'key'),'[]'::jsonb) into grp from (
     select jsonb_build_object('key',q0.k,'label',coalesce(q0.lbl,q0.k,'—'),'count',q0.cnt,
       'pct',case when nm>0 then round(q0.cnt*100.0/nm,2) else 0 end,
       'sums',(select coalesce(jsonb_object_agg(x->>'field',(select round(coalesce(sum((r2->'c'->>(x->>'field'))::numeric),0),2) from jsonb_array_elements(q0.rs) r2)),'{}'::jsonb)
               from jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) x where x->>'op'='sum')) g
     from (select w.k, max(w.lbl) lbl, count(*)::int cnt, jsonb_agg(w.r) rs from (
             select case when gran is null then r->'c'->>gf
                         when gran='day' then (r->'c'->>gf)
                         when gran='week' then to_char((r->'c'->>gf)::date,'IYYY-"W"IW')
                         when gran='month' then to_char((r->'c'->>gf)::date,'YYYY-MM')
                         else to_char((r->'c'->>gf)::date,'YYYY') end k,
                    case when gran is null then r->'c'->>(gf||'_name') end lbl, r
             from jsonb_array_elements(arr) r) w group by w.k) q0) q;
 end if;
 select v.type into st from au_variables v where v.event_code=_event and v.key=_sort;
 select coalesce(jsonb_agg(jsonb_build_object('entity',r->>'e','school',(select name from schools where id=(r->>'s')::uuid),'label',r->'c'->>'label',
     'fields',(r->'c') - 'link' - 'label' - 'teacher_users' - 'manager_user' - 'employee_user' - 'auto_rule')),'[]'::jsonb) into items
   from (select r from jsonb_array_elements(arr) r
         order by case when _sort is null then null when st in ('number','percent') then (case when _desc then -1 else 1 end) * (r->'c'->>_sort)::numeric end nulls last,
                  case when st='date' and not _desc then (r->'c'->>_sort)::date end nulls last, case when st='date' and _desc then (r->'c'->>_sort)::date end desc nulls last,
                  case when st in ('text','status') and not _desc then r->'c'->>_sort end, case when st in ('text','status') and _desc then r->'c'->>_sort end desc,
                  r->>'e'
         offset coalesce(_offset,0) limit coalesce(_limit,50)) q;
 return jsonb_build_object('ok',true,'side_effects',false,'source',_event,'params',prm,'scanned',scanned,'matched',nm,'truncated',scanned >= cap,'cap',cap,
   'match_pct',case when scanned>0 then round(nm*100.0/scanned,2) else 0 end,'aggregates',aggs,'groups',grp,'items',items,
   'offset',coalesce(_offset,0),'limit',coalesce(_limit,50),'ms',(extract(epoch from clock_timestamp()-t0)*1000)::int);
end $function$;
REVOKE ALL ON FUNCTION public.au_query(uuid, text, uuid[], jsonb, jsonb, text, jsonb, text, boolean, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.au_query(uuid, text, uuid[], jsonb, jsonb, text, jsonb, text, boolean, integer, integer, uuid) TO authenticated;

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
               'date_field',s.date_field,'org_section',s.org_section,'covered_by',s.covered_by,'batch',s.batch,'max_rows',s.max_rows) order by s.menu, s.sub, s.label) from au_sources s),
    'gaps', au_registry_gaps());
end $function$;

UPDATE public.au_sources SET covered_by = CASE key
  WHEN 'api:admin_tasks' THEN 'ds.admin_tasks' WHEN 'api:attendance' THEN 'ds.student_absence'
  WHEN 'api:building_maintenance' THEN 'ds.maintenance' WHEN 'api:bus_maintenance' THEN 'ds.maintenance'
  WHEN 'api:org_documents' THEN 'ds.org_docs' WHEN 'api:hr_assignments' THEN 'ds.api.hr_employees'
  WHEN 'api:staff' THEN 'ds.api.hr_employees' WHEN 'api:enrollments' THEN 'ds.api.students' WHEN 'api:guardians' THEN 'ds.api.students'
  WHEN 'api:fin_obligations' THEN 'ds.student_accounts' WHEN 'api:fin_summary' THEN 'ds.student_accounts' WHEN 'api:payment_requests' THEN 'ds.student_accounts'
  WHEN 'api:payments' THEN 'ds.student_accounts' WHEN 'api:receipts' THEN 'ds.student_accounts' WHEN 'api:fee_prices' THEN 'ds.student_accounts'
  WHEN 'api:org_summary' THEN 'au_query (aggregates)'
  ELSE 'au_lookup (قائمة اختيار)' END
 WHERE status='covered';
UPDATE public.au_sources SET status='deferred', reason='مؤجل لمرحلة التقارير (D)' WHERE key='api:reports';

INSERT INTO public.au_sources(key, api_key, event_code, menu, sub, label, service, perm_sections, area, relations, aggs, params, excluded, status, reason, batch, max_rows)
VALUES
 ('int:remedial_plans', null, null, 'الشؤون التعليمية', 'الخطط العلاجية', 'الخطط العلاجية', 'edu_programs', '{remedial_plans}', 'school', '{}', '{}', '[]', '[]', 'needs_service', 'لا يوجد قارئ معتمد مغلق بعد؛ يحتاج خدمة تراعي سرية الإرشاد قبل الربط', 1000, 20000),
 ('int:circular_acks', null, null, 'إدارة المدرسة', 'التعاميم', 'إقرارات استلام التعاميم', 'circular_recipients/circular_acks', '{circulars:publish}', 'school', '{}', '{}', '[]', '[]', 'needs_service', 'يحتاج قارئًا لنسبة الإقرار لكل تعميم؛ الحدث القائم adm.circular.unacked يغطي التذكير', 1000, 20000),
 ('int:class_visits', null, null, 'الإشراف', 'زيارات صفية', 'الزيارات الصفية', 'cv_visits', '{ev_visits}', 'school', '{}', '{}', '[]', '[]', 'needs_service', 'التقييم سري؛ تجميع فقط عبر خدمة إحصاءات بحد أدنى', 1000, 20000),
 ('int:gifted_nominations', null, null, 'الشؤون التعليمية', 'الموهوبون', 'ترشيحات الموهوبين', 'gt_nominations', '{gifted_care}', 'school', '{}', '{}', '[]', '[]', 'excluded', 'مخفية عن الأسرة؛ لا تُتاح للأتمتة في هذه المرحلة', 1000, 20000),
 ('int:counseling_records', null, null, 'الإرشاد', 'السجلات', 'سجلات الإرشاد', 'edu_records', '{student_guidance}', 'school', '{}', '{}', '[]', '[]', 'excluded', 'سرية — مستبعدة', 1000, 20000),
 ('int:health_records', null, null, 'الصحة المدرسية', 'الملفات', 'الملفات الصحية', 'health_profiles/health_events', '{health}', 'school', '{}', '{}', '[]', '[]', 'excluded', 'بيانات صحية مقيدة — مستبعدة', 1000, 20000),
 ('int:payroll', null, null, 'الموارد البشرية', 'الرواتب', 'مسيرات الرواتب', 'hr_payroll', '{hr_payroll}', 'central', '{}', '{}', '[]', '[]', 'excluded', 'رواتب — مستبعدة', 1000, 20000),
 ('int:conversations', null, null, 'التواصل', 'المحادثات', 'المحادثات والرسائل', 'conversations', '{}', 'school', '{}', '{}', '[]', '[]', 'excluded', 'محتوى خاص — مستبعد', 1000, 20000)
ON CONFLICT (key) DO NOTHING;