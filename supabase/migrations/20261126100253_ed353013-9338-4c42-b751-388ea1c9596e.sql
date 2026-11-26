CREATE OR REPLACE FUNCTION public.au_lookup(_org uuid, _event text, _key text, _q text DEFAULT NULL::text, _schools uuid[] DEFAULT NULL::uuid[],
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
 if _schools is not null then perform _au_check_schools(_org, _schools); end if;
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