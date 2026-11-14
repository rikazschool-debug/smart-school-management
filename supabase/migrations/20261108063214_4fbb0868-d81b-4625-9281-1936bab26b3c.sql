CREATE OR REPLACE FUNCTION public.attendance_board(_school uuid, _date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not (public.att_gate(_school) or public.att_approver(_school) or public.att_counselor(_school)) then null else jsonb_build_object(
    'expected', (select count(*) from public._att_expected(_school, _date)),
    'not_yet', (select count(*) from public._att_expected(_school, _date) x where not exists(select 1 from attendance_days a where a.student_id=x and a.date=_date)),
    'present', (select count(*) from attendance_days where school_id=_school and date=_date and status='present'),
    'late', (select count(*) from attendance_days where school_id=_school and date=_date and status='late'),
    'pending_review', (select count(*) from attendance_days where school_id=_school and date=_date and status='pending_review'),
    'escalated', (select count(*) from attendance_days where school_id=_school and date=_date and status='pending_review' and escalated_at is not null),
    'absent', (select count(*) from attendance_days where school_id=_school and date=_date and status='absent'),
    'excused', (select count(*) from attendance_days where school_id=_school and date=_date and status='excused'),
    'in_school_absent', (select count(*) from attendance_days where school_id=_school and date=_date and status='in_school_absent'),
    'recorded', (select count(*) from attendance_days where school_id=_school and date=_date),
    'inside', (select count(*) from (select distinct on (student_id) kind from gate_movements where school_id=_school and date=_date order by student_id, at desc) z where kind <> 'out'),
    'early_out', (select count(distinct student_id) from gate_movements where school_id=_school and date=_date and kind='out'),
    'open_requests', (select count(*) from pickup_requests where school_id=_school and req_date=_date and status in ('submitted','under_review','approved','arrived','preparing','ready')),
    'pending_corrections', (select count(*) from attendance_corrections where school_id=_school and status='pending'),
    'school_day', (select public.att_is_school_day(p, _date) from (select public.attendance_policy(_school, _date) p) z),
    'policy', (select to_jsonb(public.attendance_policy(_school, _date)))) end $function$;