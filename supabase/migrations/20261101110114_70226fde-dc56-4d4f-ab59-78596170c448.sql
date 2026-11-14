alter function public.att_is_school_day(public.attendance_policies, date) set search_path = public;
alter function public.att_classify(public.attendance_policies, time) set search_path = public;
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
   ('att_gate','att_counselor','attendance_policy','_att_default_policy','att_approver','att_classify_preview','_att_section','save_attendance_policy','issue_student_card','revoke_student_card','scan_attendance','manual_attendance','build_absence_review','resolve_absence','request_attendance_correction','decide_attendance_correction','add_authorized_pickup','set_authorized_pickup_active','create_pickup_request','decide_pickup','pickup_arrived','pickup_progress','handover_pickup','cancel_pickup','record_return','call_next','call_result','pickup_queue','present_now','attendance_board','attendance_alerts','_att_event','_att_notify_guardians')
  loop execute format('revoke execute on function %s from public, anon', f); end loop;
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('_att_section','_att_default_policy')
  loop execute format('revoke execute on function %s from authenticated', f); end loop;
end $$;