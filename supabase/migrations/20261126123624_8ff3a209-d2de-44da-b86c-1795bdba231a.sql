UPDATE public.au_events e SET note = e.note || ' — أتمتة تشغيلية مشروعة متاحة عبر المصدر ' || m.ds || ' (مهام، طلبات صيانة، تقارير، تحديث حقول) دون تكرار الإشعار القائم'
FROM (VALUES
 ('adm.request.submitted','ds.api.admin_requests'),('adm.task.created','ds.admin_tasks'),('adm.task.due_soon','ds.admin_tasks'),
 ('ad.application.created','ds.api.admissions'),('ad.application.stale','ds.api.admissions'),('ad.application.status','ds.api.admissions'),
 ('att.student.absent','ds.student_absence'),('comm.circular.published','ds.api.circulars'),('course.assignment.decided','ds.api.teacher_assignments'),
 ('adm.duty.changed','ds.api.duty_assignments'),('gate.exit.requested','ds.api.gate_movements'),('hr.contract.expiring','ds.hr_docs'),('hr.document.expiring','ds.hr_docs'),
 ('hr.leave.decided','ds.api.hr_leaves'),('hr.leave.requested','ds.api.hr_leaves'),('mt.bus.docs_expiring','ds.api.buses'),('mt.bus.request','ds.api.buses'),
 ('mt.request.created','ds.maintenance'),('mt.request.late','ds.maintenance'),('mt.request.status','ds.maintenance'),('adm.meeting.upcoming','ds.api.admin_meetings'),
 ('pc.request.pending','ds.api.procurement_requests'),('fin.due.soon','ds.student_accounts'),('fin.payment.recorded','ds.student_accounts'),
 ('sup.ticket.created','ds.api.support_tickets'),('sup.ticket.late_reply','ds.api.support_tickets'),('sup.ticket.late_resolve','ds.api.support_tickets'),
 ('edu.homework.missed','ds.api.homework'),('edu.homework.published','ds.api.homework')
) AS m(code, ds)
WHERE e.code = m.code AND e.status = 'blocked' AND position('أتمتة تشغيلية مشروعة' in coalesce(e.note,'')) = 0;