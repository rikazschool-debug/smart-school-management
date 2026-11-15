CREATE OR REPLACE FUNCTION public.ad_students(_org uuid, _f jsonb DEFAULT '{}'::jsonb, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare me uuid := auth.uid(); q text := nullif(trim(coalesce(_f->>'q','')),''); tot int; rows jsonb;
begin
  if not section_enabled(_org,'admissions') then raise exception 'القسم معلّق لمؤسستك' using errcode='42501'; end if;
  if not exists(select 1 from schools where org_id=_org and _ad_ok(me,id,'students')) then raise exception 'لا تملك عرض الطلاب الحاليين' using errcode='42501'; end if;
  _limit := least(greatest(_limit,1), case when coalesce((_f->>'export')::boolean,false) then 5000 else 200 end);
  _offset := greatest(coalesce(_offset,0),0);
  with v as (
    select s.id, s.full_name, s.school_id, sc.name school_name, s.user_id is not null has_login, e.status enr_status, y.name year_name, g.name grade_name, stg.name stage_name, sec.name section_name, ap.ref app_ref
    from students s join schools sc on sc.id=s.school_id and sc.org_id=_org
    join lateral (select ref from ad_applications a where a.student_id=s.id and a.org_id=_org and a.school_id=s.school_id and a.status='accepted' order by a.linked_at desc nulls last, a.id limit 1) ap on true
    left join lateral (select * from enrollments where student_id=s.id order by start_date desc, created_at desc limit 1) e on true
    left join sections sec on sec.id=e.section_id left join grades g on g.id=sec.grade_id left join stages stg on stg.id=g.stage_id left join academic_years y on y.id=e.year_id
    where _ad_ok(me, s.school_id, 'students') and (q is null or s.full_name ilike '%'||q||'%')
      and (_f->>'school' is null or s.school_id::text=_f->>'school') and (_f->>'status' is null or coalesce(e.status,'none')=_f->>'status')
      and (_f->>'year' is null or y.name=_f->>'year') and (_f->>'grade' is null or g.name=_f->>'grade'))
  select count(*)::int, coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name,x.id) from (select * from v order by full_name,id limit _limit offset _offset) x),'[]') into tot, rows from v;
  return jsonb_build_object('total',tot,'rows',rows);
end $function$;
REVOKE ALL ON FUNCTION public.ad_students(uuid,jsonb,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_students(uuid,jsonb,integer,integer) TO authenticated, service_role;