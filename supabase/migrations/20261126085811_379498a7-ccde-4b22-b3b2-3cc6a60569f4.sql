CREATE OR REPLACE FUNCTION public.au_query(_org uuid, _event text, _schools uuid[] DEFAULT NULL::uuid[], _params jsonb DEFAULT NULL::jsonb, _where jsonb DEFAULT NULL::jsonb, _group text DEFAULT NULL::text, _aggs jsonb DEFAULT NULL::jsonb, _sort text DEFAULT NULL::text, _desc boolean DEFAULT false, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t0 timestamptz := clock_timestamp(); ev au_events; prm jsonb; cap int; scanned int; arr jsonb; a jsonb; f text; op text; vt text; aggs jsonb := '[]'::jsonb;
  res jsonb := '{}'::jsonb; grp jsonb; items jsonb; nm int; st text; begin
 perform _au_need_on(_org,'au_manage','simulate',_schools,_event,null);
 if not (_au_full(_org) or _au_ev_vis(_org,_event,auth.uid())) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into ev from au_events where code=_event;
 if ev.code is null or ev.status not in ('wired','tested') or ev.source_kind <> 'scan' then raise exception 'source not available for queries'; end if;
 if _schools is not null then perform _au_check_schools(_org, _schools); end if;
 prm := _au_check_params(_event, _params);
 if _where is not null and _where <> 'null'::jsonb then perform _au_check_cond(_event, _where); end if;
 if _group is not null and not exists (select 1 from au_variables v where v.event_code=_event and v.key=_group and ('group' = any(v.flags) or v.type in ('status','bool'))) then raise exception 'cannot group by %', _group; end if;
 if _sort is not null and not exists (select 1 from au_variables v where v.event_code=_event and v.key=_sort and v.type in ('number','percent','date','text','status')) then raise exception 'cannot sort by %', _sort; end if;
 if coalesce(_limit,50) not between 0 and 200 then raise exception 'limit 0..200'; end if;
 if coalesce(_offset,0) < 0 then raise exception 'offset >= 0'; end if;
 if _aggs is not null and (jsonb_typeof(_aggs) <> 'array' or jsonb_array_length(_aggs) > 8) then raise exception 'up to 8 calculations'; end if;
 for a in select jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) loop
   op := a->>'op'; f := a->>'field';
   if op not in ('count','sum','avg','min','max') then raise exception 'unknown calculation %', op; end if;
   if op <> 'count' then
     select v.type into vt from au_variables v where v.event_code=_event and v.key=f;
     if vt is null or not (vt in ('number','percent') or (op in ('min','max') and vt='date')) then raise exception 'calculation % not valid for %', op, coalesce(f,'—'); end if;
   end if;
 end loop;
 cap := case when _event like 'ds.%' then coalesce((select max_rows from au_sources where event_code=_event),20000) else 5000 end;
 select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('e',y.entity,'s',y.school,'c',y.ctx)) filter (where _au_eval(nullif(_where,'null'::jsonb), y.ctx)),'[]'::jsonb)
   into scanned, arr
   from _au_srcp(_event, _org, _schools, cap, null, prm) y where (_schools is null or y.school = any(_schools));
 nm := jsonb_array_length(arr);
 for a in select jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) loop
   op := a->>'op'; f := a->>'field';
   select vt2.type into vt from au_variables vt2 where vt2.event_code=_event and vt2.key=f;
   aggs := aggs || jsonb_build_object('op',op,'field',f,'value',
     case op when 'count' then (select to_jsonb(count(*)) from jsonb_array_elements(arr) r where f is null or (r->'c'->f) is not null and r->'c'->f <> 'null'::jsonb)
       when 'sum' then (select to_jsonb(round(coalesce(sum((r->'c'->>f)::numeric),0),2)) from jsonb_array_elements(arr) r)
       when 'avg' then (select to_jsonb(round(avg((r->'c'->>f)::numeric),2)) from jsonb_array_elements(arr) r)
       when 'min' then (select case when vt='date' then to_jsonb(min((r->'c'->>f)::date)) else to_jsonb(min((r->'c'->>f)::numeric)) end from jsonb_array_elements(arr) r)
       when 'max' then (select case when vt='date' then to_jsonb(max((r->'c'->>f)::date)) else to_jsonb(max((r->'c'->>f)::numeric)) end from jsonb_array_elements(arr) r) end);
 end loop;
 if _group is not null then
   select coalesce(jsonb_agg(g order by g->>'label'),'[]'::jsonb) into grp from (
     select jsonb_build_object('key',q0.k,'label',coalesce(q0.lbl,q0.k,'—'),'count',q0.cnt,
       'pct',case when nm>0 then round(q0.cnt*100.0/nm,2) else 0 end,
       'sums',(select coalesce(jsonb_object_agg(x->>'field',(select round(coalesce(sum((r2->'c'->>(x->>'field'))::numeric),0),2) from jsonb_array_elements(arr) r2 where r2->'c'->>_group is not distinct from q0.k)),'{}'::jsonb)
               from jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) x where x->>'op'='sum')) g
     from (select r->'c'->>_group k, max(r->'c'->>(_group||'_name')) lbl, count(*)::int cnt from jsonb_array_elements(arr) r group by 1) q0) q;
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