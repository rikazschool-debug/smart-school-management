
create or replace function public._home_roles(_school uuid, _me uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'hw_to_grade', (select count(*) from homework_submissions s join homework h on h.id=s.homework_id
        where h.school_id=_school and h.created_by=_me and s.status in ('submitted','resubmitted','paper')
          and not exists(select 1 from homework_grades g where g.submission_id=s.id and g.graded_at is not null)),
    'hw_due', (select count(*) from homework_targets t join homework h on h.id=t.homework_id join students st on st.id=t.student_id
        where st.user_id=_me and t.school_id=_school and t.removed_at is null and h.status='published'
          and coalesce(t.extended_due, h.due_at) between now() and now() + interval '3 days'
          and not exists(select 1 from homework_submissions s where s.homework_id=h.id and s.student_id=t.student_id and s.status in ('submitted','resubmitted','paper'))),
    'child_absent', (select count(*) from attendance_days a join student_guardians sg on sg.student_id=a.student_id and sg.can_follow join guardians g on g.id=sg.guardian_id
        where g.user_id=_me and a.school_id=_school and a.date=(now() at time zone 'Asia/Riyadh')::date and a.status in ('absent','late','pending_review')));
$$;
revoke all on function public._home_roles(uuid,uuid) from public, anon, authenticated;

do $$ declare d text; begin
  d := pg_get_functiondef('public.home_work(uuid)'::regprocedure);
  d := replace(d, $x$'mt', mt, 'pc', pcn, 'at', now());$x$, $x$'mt', mt, 'pc', pcn, 'at', now()) || _home_roles(_school, me);$x$);
  if position('_home_roles' in d) = 0 then raise exception 'home_work patch failed'; end if;
  execute d;
end $$;
