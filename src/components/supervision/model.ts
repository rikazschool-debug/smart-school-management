// Educational supervision (sv_*) — shared client model. missingFields mirrors private._sv_missing on the server.
export type FieldType = "text" | "textarea" | "date" | "datetime" | "number" | "select" | "goals" | "actions" | "recs" | "list" | "indicators";
export type SvField = { key: string; label: string; type: FieldType; required?: boolean; options?: string[]; when?: { field: string; eq?: string; in?: string[] }; help?: string; items?: { code: string; label: string }[]; levels?: string[] };
export type SvSpec = { sections: { title: string; fields: SvField[] }[]; teacher?: boolean; ack?: boolean; embedded?: boolean; create?: string[]; approve?: string; autofill?: string[] };
export type SvSource = { type: "official" | "internal"; issuer?: string; title?: string; version?: string; url?: string; checked_on?: string; limits?: string; note?: string };
export type SvForm = { id: string; org_id: string | null; school_id: string | null; school?: string | null; key: string; version: number; title: string; purpose: string; kind: string; source: SvSource; spec: SvSpec; roles: Record<string, string>; acceptance: string; outputs: string; status: "draft" | "review" | "published" | "archived"; rev: number; creator: string; publisher: string | null; published_at: string | null; return_reason: string | null; can_edit: boolean; can_publish: boolean; created_by: string | null };
export type SvSchool = { id: string; name: string; principal: boolean; can_assign: boolean; supervisor: boolean; teacher: boolean; dept_head: boolean; approver: boolean };
export type SvMe = { owner: boolean; forms_admin: boolean; schools: SvSchool[]; live: { id: string; school_id: string; teacher_ids: string[]; ends_at: string }[]; now: string };
export type Named = { id: string; name: string };
export type SvAssignment = { id: string; school_id: string; school: string; supervisor_id: string; supervisor: string; teacher_ids: string[]; course_ids: string[]; subject_ids: string[]; teachers: Named[]; courses: Named[]; subjects: Named[]; starts_at: string; ends_at: string; reason: string; cancel_reason: string | null; state: "current" | "future" | "ended" | "cancelled"; rev: number; created_by_name: string; updated_by_name: string; can_manage: boolean; handover: number };
export type SvRecordStatus = "draft" | "submitted" | "needs_info" | "approved";
export type SvRecord = { id: string; school_id: string; school: string; form_key: string; form_version: number; title: string; author: string; author_id: string; handler: string | null; teacher: string | null; teacher_id: string | null; status: SvRecordStatus; needs_reason: string | null; submitted_at: string | null; approved_at: string | null; approver: string | null; teacher_ack_at: string | null; teacher_comment: string | null; teacher_comment_at: string | null; rev: number; updated_at: string; can_work: boolean; can_approve: boolean; can_reopen: boolean; is_teacher: boolean; needs_handover: boolean; assignment_id: string | null };
export type SvRecordFull = SvRecord & { data: Record<string, unknown>; form_snapshot: { title: string; purpose: string; spec: SvSpec; source: SvSource; acceptance: string }; missing: string[]; events: { action: string; actor: string; at: string; details: Record<string, unknown> | null }[] };
export type SvDelegation = { id: string; kind: "assign" | "forms" | "approve" | "read"; school_id: string | null; school: string | null; delegate: string; granter?: string; form_key: string | null; record_id: string | null; assignment_id: string | null; starts_at: string; ends_at: string; reason: string; revoked_at: string | null; live: boolean };

export const REC_STATUS: Record<SvRecordStatus, string> = { draft: "مسودة", submitted: "مُرسل للمراجعة", needs_info: "مطلوب استكماله", approved: "معتمد" };
export const ASG_STATE: Record<SvAssignment["state"], string> = { current: "ساري", future: "لم يبدأ", ended: "منتهٍ", cancelled: "أُلغي قبل بدايته" };
export const FORM_STATUS: Record<SvForm["status"], string> = { draft: "مسودة", review: "قيد المراجعة", published: "منشور", archived: "مؤرشف" };
export const DELEG_KIND: Record<SvDelegation["kind"], string> = { assign: "إدارة الإسناد في الفرع", forms: "اعتماد إصدارات النماذج", approve: "اعتماد بديل", read: "قراءة أعمال إسناد منتهٍ" };
export const ACTION_LABEL: Record<string, string> = { create: "إنشاء", save: "حفظ", update: "تعديل", submit: "إرسال", request_info: "طلب استكمال", approve: "اعتماد", reopen: "إعادة فتح", ack: "اطلاع المعلم", comment: "تعقيب المعلم", handover: "تسليم", end: "إنهاء", cancel: "إلغاء", grant: "منح", revoke: "إلغاء", draft: "إصدار جديد", review: "إرسال للمراجعة", return: "إعادة", publish: "نشر", archive: "أرشفة" };
export const NL = "nl", NA = "na";

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" ? v.trim() === "" : typeof v === "object" ? false : String(v).trim() === "");
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v));
export function shown(f: SvField, data: Record<string, unknown>): boolean {
  if (!f.when) return true; const v = s(data[f.when.field]);
  return f.when.in ? f.when.in.includes(v) : v === (f.when.eq ?? "");
}
/** Missing required/conditional items, in server order and wording (private._sv_missing). Drafts may be incomplete; this gates submit. */
export function missingFields(spec: SvSpec, data: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const sec of spec.sections ?? []) for (const f of sec.fields ?? []) {
    if (!shown(f, data) || !f.required) continue;
    const v = data[f.key]; const arr = Array.isArray(v) ? (v as Record<string, unknown>[]) : null;
    if (f.type === "goals") { if (!arr?.length) out.push(f.label); else arr.forEach((it, i) => { if (!s(it.goal) || !s(it.indicator) || !s(it.baseline) || !s(it.target)) out.push(`${f.label} ${i + 1}: الهدف والمؤشر وخط الأساس والمستهدف`); }); }
    else if (f.type === "actions") { if (!arr?.length) out.push(f.label); else arr.forEach((it, i) => { if (!s(it.action) || !s(it.owner) || !s(it.due) || !s(it.evidence)) out.push(`${f.label} ${i + 1}: الإجراء والمسؤول والموعد والشاهد`); }); }
    else if (f.type === "recs") { if (!arr?.length) out.push(f.label); else arr.forEach((it, i) => { if (!s(it.text) || !s(it.follow_due)) out.push(`${f.label} ${i + 1}: التوصية وموعد متابعتها`); }); }
    else if (f.type === "list") { if (!Array.isArray(v) || !(v as unknown[]).some((x) => s(x) !== "")) out.push(f.label); }
    else if (f.type === "indicators") {
      const m = (v ?? {}) as Record<string, { level?: string; state?: string; reason?: string }>;
      for (const it of f.items ?? []) { const e = m[it.code];
        if (!e || (!s(e.level) && e.state !== NL && e.state !== NA)) out.push(`${f.label}: ${it.label}`);
        else if (e.state === NA && !s(e.reason)) out.push(`${f.label}: سبب «لا ينطبق» في ${it.label}`); }
    } else if (blank(v)) out.push(f.label);
  }
  return out;
}

/** Which create roles the caller holds in a school, matching sv_rec_save. */
export function canCreate(spec: SvSpec, sc: SvSchool | undefined): boolean {
  if (!sc || spec.embedded) return false; const r = spec.create ?? [];
  return (r.includes("supervisor") && sc.supervisor) || (r.includes("principal") && sc.principal) || (r.includes("teacher") && sc.teacher) || (r.includes("dept_head") && sc.dept_head);
}

/** Riyadh is UTC+3 all year (no DST). datetime-local values are shown and entered in Riyadh time. */
export function toRiyadhInput(iso: string | null | undefined): string {
  if (!iso) return ""; const d = new Date(new Date(iso).getTime() + 3 * 3600_000); return d.toISOString().slice(0, 16);
}
export function fromRiyadhInput(v: string): string | null { return v ? new Date(`${v}:00+03:00`).toISOString() : null; }
export function riyadhText(iso: string | null | undefined): string {
  if (!iso) return "—"; return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) + " (الرياض)";
}
export type SvTab = "records" | "assign" | "forms" | "deleg";
export type SvSearch = { tab?: SvTab; id?: string };
export function svSearch(raw: Record<string, unknown>): SvSearch {
  const tab = ["records", "assign", "forms", "deleg"].includes(String(raw.tab)) ? (raw.tab as SvTab) : undefined;
  const id = typeof raw.id === "string" && /^[0-9a-f-]{36}$/i.test(raw.id) ? raw.id : undefined;
  return { ...(tab ? { tab } : {}), ...(id ? { id } : {}) };
}
