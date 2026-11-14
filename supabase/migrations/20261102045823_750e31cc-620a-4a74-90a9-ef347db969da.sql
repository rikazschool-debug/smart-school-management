do $$ declare src text; begin
  select pg_get_functiondef('public.scan_attendance(uuid,text)'::regprocedure) into src;
  src := replace(src, $q$jsonb_build_object('result', day.status, 'late_minutes', day.late_minutes, 'message',$q$, $q$jsonb_build_object('result', day.status, 'late_minutes', day.late_minutes, 'at', day.first_in_at, 'message',$q$);
  execute src;
end $$;