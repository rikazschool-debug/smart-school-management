-- attendance staff (gate, approvers, counselor) need student names on day records even without general student-record access
create or replace function public.att_day_rows(_school uuid, _from date, _to date, _status text default null)
returns table(id uuid, date date, status text, late_minutes int, first_in_at timestamptz, source text, note text, student_id uuid, student_name text, section text, escalated_at timestamptz, escalation_note text)
language sql stable security definer set search_path=public as $$
  select a.id, a.date, a.status, a.late_minutes, a.first_in_at, a.source, a.note, a.student_id, s.full_name, public._att_section(s.id), a.escalated_at, a.escalation_note
  from attendance_days a join students s on s.id=a.student_id
  where a.school_id=_school and a.date between _from and _to and (_status is null or a.status=_status)
    and _to - _from <= 366
    and (public.att_gate(_school) or public.att_approver(_school) or public.att_counselor(_school))
  order by a.date desc, s.full_name limit 5000 $$;
revoke execute on function public.att_day_rows(uuid,date,date,text) from public, anon;