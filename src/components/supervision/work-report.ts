import type { SvRecordFull } from "./model";
import { REC_STATUS, riyadhText } from "./model";
import { EXECUTION, PLAN_KIND, REC_STATE, VISIT_STATE, type Plan, type VisitFull } from "./work-model";

export function planReport(plan: Plan, record: SvRecordFull) {
  const rows: (string | number)[][] = [["النطاق", "نوع الخطة", PLAN_KIND[plan.kind]], ["النطاق", "حالة الاعتماد", REC_STATUS[plan.status]], ["النطاق", "التنفيذ", EXECUTION[plan.execution] ?? plan.execution], ["النطاق", "إصدار النموذج", plan.form_version]];
  for (const section of record.form_snapshot.spec.sections) for (const field of section.fields) {
    const value = record.data[field.key];
    if (Array.isArray(value)) for (const [i, item] of value.entries()) {
      if (item && typeof item === "object") for (const [key, cell] of Object.entries(item)) rows.push([field.label, `${i + 1}. ${key}`, String(cell ?? "")]);
      else rows.push([field.label, String(i + 1), String(item ?? "")]);
    } else rows.push([section.title, field.label, String(value ?? "—")]);
  }
  for (const event of record.events) rows.push(["سجل الإجراءات", event.action, `${event.actor} · ${riyadhText(event.at)}`]);
  return { meta: { title: `تقرير الخطة — ${plan.title}`, school: plan.school, filters: [PLAN_KIND[plan.kind]], note: "اعتماد الخطة مستقل عن تقدم التنفيذ" }, headers: ["القسم", "البند", "القيمة"], rows };
}

// The detail RPC has already filtered reflections, actions and events for the caller.
// Never add a second privileged read, private file URLs or an internal form for a peer.
export function visitReport(v: VisitFull) {
  const rows: (string | number)[][] = [["الملخص", "المعلم", v.teacher], ["الملخص", "المقرر", v.course], ["الملخص", "الهدف", v.purpose], ["الملخص", "المحور", v.focus], ["الملخص", "الموعد", riyadhText(v.starts_at)], ["الملخص", "التنفيذ", VISIT_STATE[v.state]], ["الملخص", "اعتماد التوثيق", v.documentation_status ? REC_STATUS[v.documentation_status as keyof typeof REC_STATUS] : "لم يبدأ"], ["الملخص", "اطلاع المعلم", v.teacher_ack_at ? riyadhText(v.teacher_ack_at) : "لم يسجل"], ["الملخص", "الجدول المدرسي", v.timetable_verified ? "الحصة مطابقة للجدول" : "التعارض غير متحقق"]];
  if (v.reason) rows.push(["الملخص", "السبب", v.reason]);
  for (const r of v.recommendations) rows.push([`توصية ${r.no}`, "الإجراء", r.action], [`توصية ${r.no}`, "الموعد والحالة", `${r.due} · ${REC_STATE[r.state] ?? r.state}${r.overdue ? " · متأخرة" : ""}`], [`توصية ${r.no}`, "الدليل المتوقع", r.expected_evidence], [`توصية ${r.no}`, "تحديث التنفيذ", r.update_note ?? "—"], [`توصية ${r.no}`, "التحقق", r.verification_note ?? "—"]);
  for (const r of v.reflections) rows.push(["التأمل", r.teacher, r.reflection]);
  for (const e of v.events) rows.push(["سجل الإجراءات", e.action, `${e.actor} · ${riyadhText(e.at)}`]);
  return { meta: { title: `تقرير الزيارة — ${v.teacher}`, school: v.school, filters: [riyadhText(v.starts_at), v.course], note: "التنفيذ واعتماد التوثيق واطلاع المعلم حالات مستقلة؛ التقرير ضمن نطاق الاطلاع الحالي" }, headers: ["القسم", "البند", "القيمة"], rows };
}