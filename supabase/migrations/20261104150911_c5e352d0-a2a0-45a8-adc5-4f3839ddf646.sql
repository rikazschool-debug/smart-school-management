create or replace function public._ev_g_version(_teacher uuid, _ver int) returns jsonb language sql stable security definer set search_path=public as $$
  with r as (select * from ev_guardian g where g.teacher_id=_teacher and (g.form_snapshot->>'version')::int=_ver),
  snap as (select form_snapshot s from r limit 1)
  select jsonb_build_object('version',_ver,'title',(select s->>'title' from snap),'n',(select count(*) from r),
    'avg',(select round(avg((_ev_score(r.form_snapshot->'items',r.answers)->>'avg')::numeric),2) from r),
    'items',(select jsonb_agg(jsonb_build_object('code',i->>'code','text',i->>'text','weight',coalesce((i->>'weight')::numeric,1),
        'avg',(select round(avg((r.answers->>(i->>'code'))::numeric),2) from r where r.answers->>(i->>'code') ~ '^[1-5]$'),
        'n',(select count(*) from r where r.answers->>(i->>'code') ~ '^[1-5]$'),
        'na',(select count(*) from r where r.answers->>(i->>'code') = 'na')))
      from snap, jsonb_array_elements(snap.s->'items') i),
    'stars',(select coalesce(jsonb_object_agg(v,c),'{}') from (select a.value v, count(*) c from r, jsonb_each_text(r.answers) a where a.value ~ '^[1-5]$' group by a.value) st)) $$;
revoke execute on function public._ev_g_version(uuid,int) from public, anon, authenticated;

create or replace function public.ev_teacher_file(_teacher uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t teachers;
begin
  select * into t from teachers where id=_teacher;
  if t.id is null or not _ev_school_read(t.school_id) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('teacher', jsonb_build_object('id',t.id,'name',t.full_name),
    'guardian', jsonb_build_object(
      'ratings',(select count(*) from ev_guardian where teacher_id=_teacher),
      'raters',(select count(distinct guardian_user) from ev_guardian where teacher_id=_teacher),
      'students',(select count(distinct student_id) from ev_guardian where teacher_id=_teacher),
      'by_version',coalesce((select jsonb_agg(_ev_g_version(_teacher,ver) order by ver) from (select distinct (form_snapshot->>'version')::int ver from ev_guardian where teacher_id=_teacher) vv),'[]'),
      'comments',coalesce((select jsonb_agg(jsonb_build_object('comment',g.comment,'at',g.updated_at) order by g.updated_at desc) from ev_guardian g where g.teacher_id=_teacher and g.comment is not null),'[]')),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'date',v.visit_date,'evaluator',coalesce(p.full_name,''),'status',v.status,'version',v.version,'scores',v.scores,'summary',v.summary,'plan',v.improvement_plan,'follow_up',v.follow_up,'subject',v.subject,'type',v.visit_type) order by v.visit_date)
       from cv_visits v left join profiles p on p.id=v.evaluator_id where v.teacher_id=_teacher and v.status in ('submitted','approved')),'[]'));
end $$;