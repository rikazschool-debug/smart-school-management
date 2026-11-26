CREATE OR REPLACE FUNCTION public._api_coverage()
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
select (select jsonb_agg(case when c->>'section' = 'ev_guardian'
    then (c - 'excluded') || jsonb_build_object('resources', coalesce(c->'resources', '[]'::jsonb) || '["guardian_rating_stats"]'::jsonb,
      'withheld', 'اسم المعلم ومعرّفه وأولياء الأمور والطلاب والتعليقات والإجابات لكل سؤال، وأي مدرسة لديها أقل من 5 تقييمات')
    else c end order by a.ord)
from jsonb_array_elements(public._api_coverage_v3()) with ordinality a(c, ord))
|| (select jsonb_agg(jsonb_build_object('section', s, 'excluded', 'صلاحيات وإعدادات داخلية لمركز الأتمتة؛ لا تُنشر عبر واجهة التكاملات') order by o)
    from unnest(array['au_view','au_manage','au_control','au_data','au_settings_info']) with ordinality u(s, o)
    where not exists (select 1 from jsonb_array_elements(public._api_coverage_v3()) c where c->>'section' = u.s))
$function$;