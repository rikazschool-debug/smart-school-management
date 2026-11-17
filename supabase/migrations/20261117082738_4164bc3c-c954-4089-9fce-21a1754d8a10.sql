create or replace function private.sv4_indicators(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'needs_open',(select count(*) from sv4_needs n where n.org_id=_org and n.status='proposed' and private._sv4_work(n.school_id,n.teacher_id)),
  'needs_accepted',(select count(*) from sv4_needs n where n.org_id=_org and n.status in ('accepted','linked') and private._sv4_work(n.school_id,n.teacher_id)),
  'plans_review',(select count(*) from sv4_dev_plans p where p.org_id=_org and p.status='submitted' and private._sv4_work(p.school_id,p.teacher_id)),
  'plans_approved',(select count(*) from sv4_dev_plans p where p.org_id=_org and p.status='approved' and private._sv4_work(p.school_id,p.teacher_id)),
  'programs_open',(select count(*) from sv4_programs g where g.org_id=_org and g.status='open' and (private._sv4_prog_manage(g.school_id)
     or (private._sv3_enabled(g.school_id) and private._sv4_school_teacher(g.school_id) is not null))),
  'verified_hours',(select coalesce(round(sum(extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2),0) from sv4_attendance a join sv4_sessions s on s.id=a.session_id join sv4_programs g on g.id=s.program_id
     where g.org_id=_org and a.status='present' and s.status='scheduled' and (private._sv4_prog_manage(g.school_id) or a.user_id=auth.uid()))) $$;