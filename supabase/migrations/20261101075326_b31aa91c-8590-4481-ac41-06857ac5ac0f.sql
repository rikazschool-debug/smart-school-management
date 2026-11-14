do $$ begin
  execute replace(replace(pg_get_functiondef('public.homework_report(uuid,text)'::regprocedure),
    $q$  select * into co from courses where id=_course;
  if co is null then raise exception 'غير موجود'; end if;$q$,
    $q$  select * into co from courses where id=_course;
  if co is null and _kind<>'family' then raise exception 'غير موجود'; end if;$q$),
    $q$where h.course_id=_course and h.status in ('published','closed') and hw_family$q$,
    $q$where (_course is null or h.course_id=_course) and h.status in ('published','closed') and hw_family$q$);
end $$;