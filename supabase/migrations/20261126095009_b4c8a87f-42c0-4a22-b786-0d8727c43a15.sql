ALTER TABLE public.au_sources ADD COLUMN IF NOT EXISTS date_field text;
ALTER TABLE public.au_sources ADD COLUMN IF NOT EXISTS org_section text;
ALTER TABLE public.au_sources ADD COLUMN IF NOT EXISTS covered_by text;
ALTER TABLE public.au_sources DROP CONSTRAINT IF EXISTS au_sources_status_check;
ALTER TABLE public.au_sources ADD CONSTRAINT au_sources_status_check CHECK (status = ANY (ARRAY['tested','wired','eligible','needs_service','deferred','excluded','covered']));

CREATE OR REPLACE FUNCTION public._au_ps_ok(_school uuid, _uid uuid, _ps text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select _perm_allows_user(_school, _uid, split_part(_ps,':',1), coalesce(nullif(split_part(_ps,':',2),''),'view')) $f$;
REVOKE ALL ON FUNCTION public._au_ps_ok(uuid,uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._au_ds_ok(_org uuid, _uid uuid, _event text, _schools uuid[], _any boolean)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 select _uid is not null and (_perm_owner(_uid,_org) or (exists(select 1 from au_sources so where so.event_code=_event) and
  case when _any then exists(select 1 from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
         and not exists(select 1 from au_sources so, unnest(so.perm_sections) ps where so.event_code=_event and not _au_ps_ok(s.id,_uid,ps)))
  else exists(select 1 from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools)))
       and not exists(select 1 from schools s, au_sources so, unnest(so.perm_sections) ps where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
                      and so.event_code=_event and not _au_ps_ok(s.id,_uid,ps)) end))
$function$;

CREATE OR REPLACE FUNCTION public._au_api_date(_t text)
 RETURNS date LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$ select case when _t ~ '^\d{4}-\d{2}-\d{2}$' then _t::date
                   when _t ~ '^\d{4}-\d{2}-\d{2}[T ]' then ((_t::timestamptz) at time zone 'Asia/Riyadh')::date end $f$;

CREATE OR REPLACE FUNCTION public._au_api_ctx(_ev text, x jsonb, td date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
 select coalesce(jsonb_object_agg(v.key, case
    when v.source like 'days:%' then to_jsonb(_au_api_date(x->>substr(v.source,6)) - td)
    when v.type = 'date' then to_jsonb(_au_api_date(x->>substr(v.source,5)))
    when v.type in ('number','percent') then case when jsonb_typeof(x->substr(v.source,5))='number' then x->substr(v.source,5)
                                                  when (x->>substr(v.source,5)) ~ '^-?\d+(\.\d+)?$' then to_jsonb((x->>substr(v.source,5))::numeric) end
    when v.type = 'bool' then case when jsonb_typeof(x->substr(v.source,5))='boolean' then x->substr(v.source,5) end
    else case when jsonb_typeof(x->substr(v.source,5)) in ('string','number') then to_jsonb(x->>substr(v.source,5)) end end)
  filter (where v.source like 'api:%' or v.source like 'days:%'), '{}'::jsonb)
 from au_variables v where v.event_code=_ev
$f$;

CREATE OR REPLACE FUNCTION public._au_api_extra(_res text, x jsonb, td date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
 select jsonb_strip_nulls(jsonb_build_object(
   'school_name', (select s.name from schools s where s.id = nullif(x->>'school_id','')::uuid),
   'label', coalesce(x->>'title', x->>'name', x->>'form_name', x->>'display_name', x->>'full_name', x->>'student_name', x->>'job_title', x->>'ref', x->>'plate', x->>'code', x->>'date', 'سجل')))
 || case _res
   when 'events' then (select jsonb_build_object('applications', z.n, 'accepted', z.a,
        'fill_pct', case when (x->>'capacity') ~ '^\d+$' and (x->>'capacity')::int > 0 then least(100, round(z.n*100.0/(x->>'capacity')::int,2)) end,
        'reg_open', coalesce(_au_api_date(x->>'reg_opens') <= td,true) and coalesce(_au_api_date(x->>'reg_closes') >= td,true) and x->>'status'='published')
      from (select count(*) filter (where a.status not in ('rejected','cancelled')) n, count(*) filter (where a.status='accepted') a from evt_applications a where a.item_id=(x->>'id')::uuid) z)
   when 'buses' then (select jsonb_build_object('riders', z.n,
        'fill_pct', case when (x->>'capacity') ~ '^\d+$' and (x->>'capacity')::int > 0 then round(z.n*100.0/(x->>'capacity')::int,2) end)
      from (select count(*) n from sf_transport t where t.bus_id=(x->>'id')::uuid and t.active and not t.exempt) z)
   when 'homework' then (select jsonb_build_object('targets', z.t, 'submitted', z.s, 'graded', z.g, 'avg_score', z.av,
        'submit_pct', case when z.t > 0 then round(z.s*100.0/z.t,2) end)
      from (select (select count(*) from homework_targets ht where ht.homework_id=h.id and ht.removed_at is null) t,
                   (select count(*) from homework_submissions hs where hs.homework_id=h.id and hs.status in ('submitted','resubmitted','paper')) s,
                   (select count(distinct hg.student_id) from homework_grades hg where hg.homework_id=h.id and hg.score is not null and hg.published_at is not null) g,
                   (select round(avg(hg.score),2) from homework_grades hg where hg.homework_id=h.id and hg.score is not null and hg.published_at is not null) av
            from (select (x->>'id')::uuid id) h) z)
   when 'support_tickets' then (select jsonb_build_object('open', x->>'status' not in ('resolved','closed','cancelled'),
        'days_open', td - _au_api_date(x->>'created_at'),
        'awaiting_response', x->>'first_response_at' is null and x->>'status' not in ('resolved','closed','cancelled'),
        'response_late', x->>'first_response_at' is null and x->>'status' not in ('resolved','closed','cancelled') and t.response_due is not null and t.response_due < now())
      from (select (select st.response_due from support_tickets st where st.id=(x->>'id')::uuid) response_due) t)
   when 'admissions' then jsonb_build_object('open', x->>'status' not in ('accepted','rejected','withdrawn','closed'), 'days_waiting', td - _au_api_date(x->>'submitted_at'))
   when 'admin_requests' then jsonb_build_object('open', x->>'status' in ('submitted','in_progress','returned'), 'days_waiting', td - _au_api_date(x->>'submitted_at'))
   when 'procurement_requests' then jsonb_build_object('open', x->>'status' in ('submitted','approved','awaiting_assignment','in_progress'), 'days_waiting', td - _au_api_date(x->>'submitted_at'))
   when 'custodies' then jsonb_build_object('settle_overdue', x->>'status' in ('disbursed','settling') and _au_api_date(x->>'settle_due') < td)
   when 'teacher_assignments' then jsonb_build_object('live', coalesce(_au_api_date(x->>'start_date') <= td,true) and coalesce(_au_api_date(x->>'end_date') >= td,true) and coalesce(x->>'status','') not in ('cancelled','rejected','ended','pending'))
   when 'hr_leaves' then jsonb_build_object('pending', x->>'status' like 'pending%')
   else '{}'::jsonb end
$f$;

CREATE OR REPLACE FUNCTION public._au_ds_api(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid, _params jsonb)
 RETURNS TABLE(entity uuid, school uuid, period text, ctx jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare td date := school_today(); p jsonb; aft uuid; rep text; bk text; src au_sources; res text; sc uuid[]; lim int;
begin
 select * into src from au_sources where event_code=_ev;
 if src.key is null or src.api_key is null then raise exception 'unknown data source %', _ev; end if;
 if src.org_section is not null and not section_enabled(_org, src.org_section) then return; end if;
 res := src.api_key;
 aft := nullif(coalesce(_params,'{}'::jsonb)->>'_after','')::uuid;
 p := coalesce(_au_check_params(_ev, coalesce(nullif(_params,'null'::jsonb),'{}'::jsonb) - '_after'), '{}'::jsonb);
 rep := coalesce(p->>'repeat','once');
 bk := case rep when 'daily' then '@'||td::text when 'weekly' then '@'||to_char(td,'IYYY-IW') when 'monthly' then '@'||to_char(td,'YYYY-MM') else '' end;
 lim := least(greatest(coalesce(_lim,100),1), least(src.max_rows,20000));
 sc := array(select s.id from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools)));
 return query
  with r as (select y.x from (select x from _api_rows_all(res, _org, sc, _schools is null, null, null, null, null, null, null, _entity, null) x) y
             where y.x ? 'id' and (y.x->>'id') ~* '^[0-9a-f-]{36}$' and (aft is null or (y.x->>'id')::uuid > aft)
               and (case when nullif(y.x->>'school_id','') is null then _schools is null else (y.x->>'school_id')::uuid = any(sc) end)
             order by (y.x->>'id')::uuid limit lim)
  select (r.x->>'id')::uuid, nullif(r.x->>'school_id','')::uuid,
         coalesce(case when src.date_field is not null then r.x->>src.date_field end, 'rec')||bk,
         _au_api_ctx(_ev, r.x, td) || _au_api_extra(res, r.x, td)
  from r order by (r.x->>'id')::uuid;
end $function$;
REVOKE ALL ON FUNCTION public._au_ds_api(text,uuid,uuid[],integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_api_ctx(text,jsonb,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._au_api_extra(text,jsonb,date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._au_fin_guard(_org uuid, _schools uuid[])
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare bad int; begin
 with ids as (select b.id from sf_obligations b join schools s on s.id=b.school_id and s.org_id=_org
              where (_schools is null or b.school_id = any(_schools)) and b.status='pending' order by b.updated_at desc, b.id limit 25),
      tw as (select * from _sf_balances(array(select id from ids)))
 select count(*) into bad from ids left join tw on tw.obligation_id=ids.id where tw.bal is distinct from _sf_balance(ids.id);
 if bad > 0 then raise exception 'finance balance check failed: % sampled balances differ from the finance service; results blocked', bad using errcode='P0001'; end if;
end $f$;
REVOKE ALL ON FUNCTION public._au_fin_guard(uuid,uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._au_srcp(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid, _params jsonb)
 RETURNS TABLE(entity uuid, school uuid, period text, ctx jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
 if _ev like 'ds.api.%' then return query select * from _au_ds_api(_ev,_org,_schools,_lim,_entity,_params);
 elsif _ev like 'ds.%' then
   if _ev = 'ds.student_accounts' then perform _au_fin_guard(_org,_schools); end if;
   return query select * from _au_ds(_ev,_org,_schools,_lim,_entity,_params);
 else return query select * from _au_src(_ev,_org,_schools,_lim,_entity); end if;
end $function$;

DROP FUNCTION IF EXISTS public.au_lookup(uuid, text, text, text, uuid[]);
CREATE FUNCTION public.au_lookup(_org uuid, _event text, _key text, _q text DEFAULT NULL::text, _schools uuid[] DEFAULT NULL::uuid[],
  _parent jsonb DEFAULT NULL::jsonb, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); lk text; sc uuid[]; q text := nullif(btrim(coalesce(_q,'')),''); isfull boolean; pat text;
  pst uuid[]; pgr uuid[]; pyr uuid[]; lim int := least(greatest(coalesce(_limit,50),1),200); off int := greatest(coalesce(_offset,0),0);
begin
 perform _au_need_any(_org,'au_manage',array['designer','create','edit','simulate']);
 isfull := _au_full(_org);
 if not (isfull or _au_ev_vis(_org,_event,uid)) then raise exception 'forbidden' using errcode='42501'; end if;
 if _event like 'ds.%' and not _au_ds_ok(_org, uid, _event, _schools, true) then raise exception 'forbidden' using errcode='42501'; end if;
 select v.lookup into lk from au_variables v where v.event_code=_event and v.key=_key;
 if lk is null then raise exception 'no list for this field'; end if;
 if q is not null and length(q) > 60 then raise exception 'search too long'; end if;
 if _parent is not null and jsonb_typeof(_parent) <> 'object' then raise exception 'invalid parent filter'; end if;
 pst := (select array_agg(e::uuid) from jsonb_array_elements_text(case when jsonb_typeof(_parent->'stage')='array' then _parent->'stage' else '[]' end) e);
 pgr := (select array_agg(e::uuid) from jsonb_array_elements_text(case when jsonb_typeof(_parent->'grade')='array' then _parent->'grade' else '[]' end) e);
 pyr := (select array_agg(e::uuid) from jsonb_array_elements_text(case when jsonb_typeof(_parent->'year')='array' then _parent->'year' else '[]' end) e);
 pat := '%'||replace(replace(replace(coalesce(q,''),'\','\\'),'%','\%'),'_','\_')||'%';
 sc := array(select s.id from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and (isfull or exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=uid and _au_dlive(d) and (d.school_ids is null or s.id = any(d.school_ids))))
   and (_event not like 'ds.%' or _perm_owner(uid,_org)
        or not exists(select 1 from au_sources so, unnest(so.perm_sections) ps where so.event_code=_event and not _au_ps_ok(s.id, uid, ps))));
 if lk in ('students','employees','staff','teachers') and q is null then return '[]'::jsonb; end if;
 if lk = 'values' then
   return coalesce((select jsonb_agg(jsonb_build_object('v',z.v,'l',z.v,'s',null) order by z.v) from (
     select distinct y.ctx->>_key v from _au_srcp(_event,_org,case when _schools is null and isfull then null else sc end,5000,null,'{}'::jsonb) y
     where y.ctx->>_key is not null and (q is null or y.ctx->>_key ilike pat) order by 1 offset off limit lim) z),'[]'::jsonb);
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('v',z.v,'l',z.l,'s',z.s) order by z.l) from (
   select * from (
    (select s.id::text v, s.name l, null::text s from schools s where lk='schools' and s.id = any(sc))
    union all (select distinct y.name, y.name, null from academic_years y where lk='years' and y.school_id = any(sc))
    union all (select y.id::text, y.name, sch.name from academic_years y join schools sch on sch.id=y.school_id where lk='year_ids' and y.school_id = any(sc))
    union all (select t.id::text, t.name||coalesce(' — '||y.name,''), sch.name from terms t join schools sch on sch.id=t.school_id left join academic_years y on y.id=t.year_id
               where lk='terms' and t.school_id = any(sc) and (pyr is null or t.year_id = any(pyr)))
    union all (select st.id::text, st.name, sch.name from stages st join schools sch on sch.id=st.school_id where lk='stages' and st.school_id = any(sc))
    union all (select g.id::text, g.name, sch.name from grades g join schools sch on sch.id=g.school_id where lk='grades' and g.school_id = any(sc) and (pst is null or g.stage_id = any(pst)))
    union all (select se.id::text, se.name||coalesce(' — '||g.name,''), sch.name from sections se join schools sch on sch.id=se.school_id left join grades g on g.id=se.grade_id
               join academic_years y on y.id=se.year_id and (y.is_current or school_today() between y.start_date and y.end_date)
               where lk='sections' and se.school_id = any(sc) and (pgr is null or se.grade_id = any(pgr)) and (pst is null or g.stage_id = any(pst)))
    union all (select d.id::text, d.name, sch.name from departments d join schools sch on sch.id=d.school_id where lk='departments' and d.school_id = any(sc))
    union all (select su.id::text, su.name, sch.name from subjects su join schools sch on sch.id=su.school_id where lk='subjects' and su.school_id = any(sc))
    union all (select x.id::text, coalesce(x.display_name,x.full_name), sch.name from students x join schools sch on sch.id=x.school_id
               where lk='students' and x.school_id = any(sc) and (x.full_name ilike pat or x.display_name ilike pat) limit 200)
    union all (select x.id::text, coalesce(x.display_name,x.full_name), sch.name from teachers x join schools sch on sch.id=x.school_id
               where lk='teachers' and x.school_id = any(sc) and (x.full_name ilike pat or x.display_name ilike pat) limit 200)
    union all (select distinct d.kind, d.kind, null from org_docs d where lk='org_doc_kinds' and d.org_id=_org and d.archived_at is null and d.kind is not null and (d.school_id is null or d.school_id = any(sc)))
    union all (select d.id::text, d.name, coalesce(sch.name,'الإدارة المركزية') from org_docs d left join schools sch on sch.id=d.school_id
               where lk='org_docs' and d.org_id=_org and d.archived_at is null and (d.school_id is null or d.school_id = any(sc)))
    union all (select t.id::text, t.name, null from hr_doc_types t where lk='hr_doc_types' and t.org_id=_org and t.is_active and not t.confidential)
    union all (select c.id::text, c.name, null from hr_job_categories c where lk='hr_categories' and c.org_id=_org and c.is_active)
    union all (select distinct a.job_title, a.job_title, null from hr_assignments a where lk='hr_job_titles' and a.org_id=_org and a.job_title is not null and a.school_id = any(sc))
    union all (select distinct a.department, a.department, null from hr_assignments a where lk='hr_departments' and a.org_id=_org and a.department is not null and a.school_id = any(sc))
    union all (select e.id::text, coalesce(e.display_name,e.full_name), null from hr_employees e
               where lk='employees' and e.org_id=_org and e.status <> 'archived' and (e.full_name ilike pat or e.display_name ilike pat)
                 and exists(select 1 from hr_assignments a where a.employee_id=e.id and a.school_id = any(sc)) limit 200)
    union all (select t.id::text, t.name, null from hr_leave_types t where lk='leave_types' and t.org_id=_org and t.is_active)
    union all (select c.id::text, c.name, case c.kind when 'bus' then 'المركبات' else 'المباني' end from mt_categories c where lk='mt_categories' and c.org_id=_org and c.active)
    union all (select b.id::text, coalesce(b.code||' — ','')||coalesce(b.plate,''), sch.name from mt_buses b left join schools sch on sch.id=b.school_id
               where lk='buses' and b.org_id=_org and (b.school_id is null or b.school_id = any(sc)))
    union all (select i.id::text, i.title, coalesce(sch.name,'الإدارة المركزية') from evt_items i left join schools sch on sch.id=i.school_id
               where lk='evt_items' and i.org_id=_org and i.status <> 'archived' and (i.school_id = any(sc) or (i.school_id is null and _schools is null)))
    union all (select f.id::text, f.name, sch.name from adm_forms f join schools sch on sch.id=f.school_id where lk='adm_forms' and f.school_id = any(sc))
    union all (select p.id::text, p.name, sch.name from adm_duty_posts p join schools sch on sch.id=p.school_id where lk='duty_posts' and p.school_id = any(sc) and p.active)
    union all (select m.user_id::text, max(_adm_name(m.user_id)), max(sch.name) from memberships m join schools sch on sch.id=m.school_id
               where lk='staff' and m.org_id=_org and m.is_active and m.school_id = any(sc) and m.role::text not in ('student','guardian') group by m.user_id)
   ) u where q is null or u.l ilike pat order by u.l offset off limit lim) z), '[]'::jsonb);
end $function$;
REVOKE ALL ON FUNCTION public.au_lookup(uuid, text, text, text, uuid[], jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.au_lookup(uuid, text, text, text, uuid[], jsonb, integer, integer) TO authenticated;