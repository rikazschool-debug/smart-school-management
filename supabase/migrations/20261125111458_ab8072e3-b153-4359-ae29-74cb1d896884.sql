create or replace function public._api_catalog_ext4() returns jsonb language sql immutable set search_path = public as $c$
select $j$[
{"key":"guardian_rating_stats","label":"متوسط تقييمات أولياء الأمور لكل مدرسة","area":"school","menu":"التقارير","sub":"إحصائيات المدارس","sens":"مجمّع","psec":"evaluation","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"year_id","l":"العام الدراسي"},{"k":"ratings","l":"عدد التقييمات"},{"k":"avg_score","l":"المتوسط (من 1 إلى 5)"},{"k":"suppressed","l":"محجوب لقلة العدد"}],"sortable":["ratings"],"filters":["school_id","year_id"],"note":"متوسط عام لكل مدرسة وعام دراسي فقط؛ لا يظهر أي معلم أو ولي أمر أو طالب أو تعليق، ويحجب المتوسط والعدد إذا قلت التقييمات عن 5","ord":35.6}
]$j$::jsonb
$c$;

alter function public._api_catalog() rename to _api_catalog_v3;
create or replace function public._api_catalog() returns jsonb language sql immutable set search_path = public as $c$
select jsonb_agg(z.x order by (z.x->>'ord')::numeric) from (
  select x from jsonb_array_elements(public._api_catalog_v3()) x
  union all select e || jsonb_build_object('group', e->>'menu') from jsonb_array_elements(public._api_catalog_ext4()) e
) z(x)
$c$;

alter function public._api_coverage() rename to _api_coverage_v3;
create or replace function public._api_coverage() returns jsonb language sql immutable set search_path = public as $c$
select jsonb_agg(case when c->>'section' = 'ev_guardian'
    then (c - 'excluded') || jsonb_build_object('resources', coalesce(c->'resources', '[]'::jsonb) || '["guardian_rating_stats"]'::jsonb,
      'withheld', 'اسم المعلم ومعرّفه وأولياء الأمور والطلاب والتعليقات والإجابات لكل سؤال، وأي مدرسة لديها أقل من 5 تقييمات')
    else c end order by a.ord)
from jsonb_array_elements(public._api_coverage_v3()) with ordinality a(c, ord)
$c$;

create or replace function public._api_rows_v5(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(v) from (select md5('gr' || g.school_id || g.year_id)::uuid as id, g.school_id, g.year_id,
      case when g.n >= 5 then g.n end as ratings, case when g.n >= 5 then g.av end as avg_score, g.n < 5 as suppressed
    from (select e.school_id, e.year_id, count(*)::int as n, round(avg((public._ev_score(e.form_snapshot->'items', e.answers)->>'avg')::numeric), 2) as av
      from ev_guardian e join schools s on s.id = e.school_id
      where _res = 'guardian_rating_stats' and s.org_id = _org and e.school_id = any(_sch) and (_yrs is null or e.year_id = any(_yrs))
      group by 1, 2) g
    where _id is null or md5('gr' || g.school_id || g.year_id)::uuid = _id) v
$$;

create or replace function public._api_rows_all(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select x from public._api_rows(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all select x from public._api_rows_v2(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all select x from public._api_rows_v3(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all select x from public._api_rows_v4(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all select x from public._api_rows_v5(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
$$;

revoke all on function public._api_catalog_ext4(), public._api_catalog(), public._api_catalog_v3(), public._api_coverage(), public._api_coverage_v3(),
  public._api_rows_v5(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public._api_catalog_ext4(), public._api_catalog(), public._api_catalog_v3(), public._api_coverage(), public._api_coverage_v3(),
  public._api_rows_v5(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid) to service_role;