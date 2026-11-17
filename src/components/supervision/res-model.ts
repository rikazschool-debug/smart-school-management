// Stage 5 supervisory resources and bulletins — client mirror. sv5_res_* on the server decides who writes, reviews, publishes and reads.
export type ResView = "library" | "manage";
export const RES_KIND: Record<string, string> = { bulletin: "نشرة إشرافية", guide: "دليل", strategy: "استراتيجية تدريس", assessment_tool: "أداة تقويم", template: "قالب", training: "مادة تدريبية" };
export const RES_STATUS: Record<string, string> = { draft: "مسودة", review: "بانتظار المراجعة", published: "منشور", retired: "إصدار سابق" };
/** Shown on every resource: internal content is never presented as officially approved. */
export const INTERNAL_NOTE = "نموذج داخلي — إعداد المؤسسة وليس اعتمادًا رسميًا من الوزارة أو أي جهة.";
export type Resource = { id: string; org_id: string; school_id: string | null; scope: string; series_id: string; version: number; version_of: string | null; kind: string; title: string; summary: string; body?: string; domain: string;
  subjects: string[]; stages: string[]; keywords: string[]; source: string; usage_rights: string; no_personal_data: boolean; status: string; review_note: string | null; creator: string; editor: string; publisher: string | null;
  published_at: string | null; retired_at: string | null; submitted_at: string | null; rev: number; updated_at: string; files: number; missing: string[]; can_edit: boolean; can_publish: boolean; can_version: boolean; can_retire: boolean };
export type ResourceDetail = Resource & { body: string; file_list: { id: string; name: string; mime_type: string; size_bytes: number; storage_path: string }[]; versions: { id: string; version: number; status: string; published_at: string | null }[]; log: { action: string; note: string | null; by: string; at: string }[] };
export const RES_LOG: Record<string, string> = { create: "أُنشئ", edit: "عُدّل", submit: "أُرسل للمراجعة", return: "أُعيد للكاتب", publish: "نُشر", retire: "أُوقف", version: "إصدار جديد", file_add: "أُرفق ملف", file_remove: "حُذف ملف" };

export type ResDraft = { summary: string; body: string; files: number; domain: string; source: string; usage_rights: string; no_personal_data: boolean };
/** Mirrors private._sv5_res_missing (what blocks submission/publication). */
export function resMissing(r: ResDraft): string[] {
  const m: string[] = []; const t = (s: string) => s.trim();
  if (t(r.summary).length < 10) m.push("الملخص");
  if (t(r.body).length < 20 && r.files === 0) m.push("المحتوى أو ملف مرفق");
  if (t(r.domain).length < 2) m.push("المجال");
  if (t(r.source).length < 3) m.push("المصدر");
  if (t(r.usage_rights).length < 3) m.push("حقوق الاستخدام");
  if (!r.no_personal_data) m.push("تأكيد خلو المورد من بيانات الطلاب والشواهد الشخصية");
  return m;
}
/** Mirrors the server refusal to label internal content as officially approved. */
export const OFFICIAL_CLAIM = /(معتمد|معتمدة|اعتماد|مُعتمد|مُعتمدة)\s*(رسمي|رسمية|رسميا|رسميًا|من الوزارة|من وزارة)/;
export type ResFilter = { kind: string; domain: string; subject: string; stage: string; q: string };
const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();
/** Library search over already-permitted rows: kind, domain, subject, stage and keywords in title/summary/keywords. */
export function filterRes(list: Resource[], f: ResFilter): Resource[] {
  const q = norm(f.q.trim());
  return list.filter((r) => (!f.kind || r.kind === f.kind) && (!f.domain || r.domain === f.domain) && (!f.subject || r.subjects.includes(f.subject)) && (!f.stage || r.stages.includes(f.stage))
    && (!q || q.split(/\s+/).every((w) => norm(`${r.title} ${r.summary} ${r.keywords.join(" ")} ${r.domain}`).includes(w))));
}
export const splitList = (s: string) => [...new Set(s.split(/[،,]/).map((x) => x.trim()).filter(Boolean))];
