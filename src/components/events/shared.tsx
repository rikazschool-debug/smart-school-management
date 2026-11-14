// Events (evt_*): every rule lives in SQL RPCs; these are display mirrors only.
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/components/hr/shared";
import { Pill } from "@/components/admin/shared";

export type Kind = "trip" | "general" | "course";
export type KindCaps = Record<string, boolean>;
export type EvtCaps = { owner: boolean; delegated: number; family: boolean; tpl_view: boolean; schools: { id: string; name: string; trip: KindCaps; general: KindCaps; course: KindCaps }[] };
export type AppCounts = { total: number; new: number; review: number; info_needed: number; accepted: number; rejected: number; cancelled: number };
export type EvtRow = {
  id: string; rev: number; kind: Kind; title: string; school_id: string; school: string; category: string | null; status: string; reg_open: boolean; reg_state: string;
  audience: "internal" | "external" | "both"; capacity: number | null; location: string | null; mode: string; first_at: string | null; last_at: string | null; sessions: number;
  apps: AppCounts; consents: { approved: number; declined: number } | null; updated_at: string;
};
export type Session = { id?: string; seq?: number; title: string | null; starts_at: string; ends_at: string | null; location: string | null };
export type EvtItem = EvtRow & {
  org_id: string; description: string | null; trainer: string | null; target: { all?: boolean; sections?: string[]; grades?: string[] }; reg_opens: string | null; reg_closes: string | null;
  conditions: string | null; cancel_reason: string | null; consent_required: boolean; consent_deadline: string | null; need_emergency: boolean; need_medical: boolean;
  link_active: boolean; token: string | null; published_at: string | null; created_by: string; created_at: string; caps: Record<string, boolean>; form_version: number;
  targets: number | null; session_list: Session[]; staff: { user_id: string; name: string; caps: string[] }[] | null;
  log: { action: string; at: string; by: string | null; details: Record<string, unknown> }[];
  extra: Answers; extra_fields: Field[]; core_labels: CoreLabels;
  tpl: TplLinkInfo; apply_tpl: TplLinkInfo | null;
};
export type CoreLabels = Record<string, { label?: string; help?: string }>;
export type TplLinkInfo = { version: number; latest: number; source: "group" | "school" | "default"; outdated: boolean };
export type TplKind = Kind | "apply";
export const TPL_KIND: Record<TplKind, [string, string]> = {
  trip: ["نموذج الرحلات المدرسية", "يضبط حقول إنشاء رحلة مدرسية جديدة."],
  general: ["نموذج الفعاليات العامة", "يضبط حقول إنشاء فعالية عامة جديدة."],
  course: ["نموذج الدورات", "يضبط حقول إنشاء دورة جديدة."],
  apply: ["نموذج طلبات التسجيل", "يضبط الحقول التي يعبئها المتقدم عند التسجيل، بما يشمل نموذج التسجيل الخارجي."],
};
export const TPL_SOURCE: Record<string, string> = { group: "نموذج المجموعة", school: "تخصيص المدرسة", default: "النموذج الافتراضي" };

export type FieldKind = "section" | "text" | "textarea" | "number" | "date" | "phone" | "email" | "select" | "multi" | "checkbox" | "file";
export type Field = {
  id: string; kind: FieldKind; label: string; help?: string | undefined; placeholder?: string | undefined; required?: boolean | undefined; audience?: "all" | "internal" | "external" | undefined;
  options?: string[] | undefined; role?: "name" | "phone" | "email" | "birth_date" | "guardian_name" | undefined; min?: number | undefined; max?: number | undefined; maxlen?: number | undefined;
  accept?: ("pdf" | "image" | "doc" | "sheet")[] | undefined; max_mb?: number | undefined; max_files?: number | undefined;
};
export type Answers = Record<string, string | boolean | string[]>;

export const KIND: Record<Kind, string> = { trip: "رحلة مدرسية", general: "فعالية عامة", course: "دورة" };
export const KIND_PLURAL: Record<Kind, string> = { trip: "الرحلات المدرسية", general: "الفعاليات العامة", course: "الدورات" };
export const ITEM_STATUS: Record<string, [string, "muted" | "warn" | "ok" | "bad"]> = {
  draft: ["مسودة", "muted"], published: ["منشورة", "ok"], cancelled: ["ملغاة", "bad"], completed: ["مكتملة", "muted"], archived: ["مؤرشفة", "muted"],
};
export const REG_STATE: Record<string, string> = {
  open: "التسجيل مفتوح", closed: "التسجيل مغلق", not_yet: "لم يبدأ التسجيل", ended: "انتهى التسجيل", no_form: "بانتظار نشر النموذج", draft: "مسودة", cancelled: "ملغاة",
};
export const APP_STATUS: Record<string, [string, "muted" | "warn" | "ok" | "bad"]> = {
  new: ["جديد", "warn"], review: ["قيد المراجعة", "warn"], info_needed: ["مطلوب استكمال", "warn"], accepted: ["مقبول", "ok"], rejected: ["مرفوض", "bad"], cancelled: ["ملغى", "muted"],
};
export const AUDIENCE: Record<string, string> = { internal: "طلاب المدارس", external: "طلاب خارجيون", both: "طلاب المدارس والخارجيون" };
export const MODE: Record<string, string> = { in_person: "حضوري", online: "عن بعد", hybrid: "مدمج" };
export const ATT: Record<string, string> = { present: "حاضر", late: "متأخر", absent: "غائب", excused: "معتذر" };
export const CATEGORY: Record<string, string> = { internal: "داخلي", external: "خارجي" };
export const SOURCE: Record<string, string> = { link: "رابط التسجيل", account: "حساب ركاز", target: "جمهور الفعالية" };
export const FIELD_KIND: Record<FieldKind, string> = {
  section: "قسم (عنوان)", text: "نص قصير", textarea: "نص طويل", number: "رقم", date: "تاريخ", phone: "جوال", email: "بريد إلكتروني", select: "قائمة اختيار", multi: "اختيار متعدد", checkbox: "مربع موافقة", file: "مرفق",
};
export const ROLE: Record<string, string> = { name: "اسم المشارك", phone: "جوال التواصل", email: "البريد للتواصل", birth_date: "تاريخ الميلاد", guardian_name: "اسم ولي الأمر" };
export const STAFF_CAPS: Record<string, string> = { edit: "إدارة الدورة والنموذج والرابط", apps: "عرض الطلبات ومراجعتها", decide: "القبول والرفض", attend: "تسجيل الحضور" };
export const LOG: Record<string, string> = {
  create: "إنشاء", edit: "تعديل البيانات", publish: "نشر", open_reg: "فتح التسجيل", close_reg: "إغلاق التسجيل", cancel: "إلغاء", complete: "إكمال", archive: "أرشفة",
  link_enable: "تفعيل الرابط", link_disable: "إيقاف الرابط", link_renew: "تجديد الرابط", staff_set: "تفويض موظف", staff_remove: "سحب تفويض",
  form_publish: "نشر إصدار النموذج", form_copy: "نسخ نموذج", consent: "رد ولي أمر", attend: "تعديل الحضور",
  submit: "استلام الطلب", review: "بدء المراجعة", info: "طلب استكمال", accept: "قبول", reject: "رفض", reconsider: "إعادة نظر", reason: "سبب داخلي",
  notify: "إشعار", withdraw: "سحب المتقدم طلبه", complete_info: "استكمل المتقدم بياناته", file: "إضافة مرفق", file_remove: "حذف مرفق", consent_reset: "تجديد الموافقات بعد تعديل جوهري", form_from_tpl: "تطبيق نموذج طلبات التسجيل", tpl_update: "تحديث نموذج العنصر",
};

/** Ready-made fields the editor can add and then customize. */
export const SUGGESTED: Field[] = [
  { id: "participant_name", kind: "text", label: "اسم المشارك الرباعي", required: true, role: "name", audience: "all" },
  { id: "birth_date", kind: "date", label: "تاريخ الميلاد", required: true, role: "birth_date", audience: "all" },
  { id: "age", kind: "number", label: "العمر", min: 3, max: 25, audience: "all" },
  { id: "school_name", kind: "text", label: "المدرسة الحالية", audience: "external" },
  { id: "grade", kind: "select", label: "الصف", options: ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"], audience: "all" },
  { id: "guardian_name", kind: "text", label: "اسم ولي الأمر", required: true, role: "guardian_name", audience: "external" },
  { id: "guardian_phone", kind: "phone", label: "جوال ولي الأمر", required: true, role: "phone", audience: "external" },
  { id: "contact_email", kind: "email", label: "البريد الإلكتروني", role: "email", audience: "all" },
  { id: "contact_way", kind: "select", label: "وسيلة التواصل المفضلة", options: ["اتصال", "واتساب", "بريد إلكتروني"], audience: "all" },
  { id: "notes", kind: "textarea", label: "ملاحظات التسجيل", audience: "all" },
  { id: "agree_terms", kind: "checkbox", label: "أقر بالاطلاع على شروط الدورة", required: true, audience: "all" },
];

export function StatusPill({ s }: { s: string }) { const [l, t] = ITEM_STATUS[s] ?? [s, "muted" as const]; return <Pill tone={t}>{l}</Pill>; }
export function AppPill({ s }: { s: string }) { const [l, t] = APP_STATUS[s] ?? [s, "muted" as const]; return <Pill tone={t}>{l}</Pill>; }

export const fmtDT = (d?: string | null) => (d ? new Date(d).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—");
export const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium" }) : "—");
/** datetime-local value (Riyadh wall clock) ↔ ISO */
export const toLocal = (iso?: string | null) => (iso ? new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 16) : "");
export const fromLocal = (v: string) => (v ? new Date(Date.parse(v + ":00Z") - 3 * 3600e3).toISOString() : null);

export function useEvtCaps(org: string | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["evt-caps", org], enabled: !!org && enabled, staleTime: 30_000, queryFn: () => rpc<EvtCaps>("evt_caps", { _org: org }) });
}
export const canAny = (c: EvtCaps | undefined, kind: Kind, action: string) => !!c?.schools.some((s) => s[kind]?.[action]);
export const hasEvents = (c: EvtCaps | undefined) => !!c && (c.schools.length > 0 || c.delegated > 0);

/** Fields the applicant of a category sees (same filter as the server). */
export const visibleFields = (fields: Field[], cat: "internal" | "external") => fields.filter((f) => !f.audience || f.audience === "all" || f.audience === cat);

/** Human value of a stored answer, read against the field snapshot saved with the application. */
export function answerText(f: Field, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (f.kind === "checkbox") return v === true ? "نعم" : "لا";
  if (f.kind === "file") return Array.isArray(v) && v.length ? `${v.length} ملف` : "—";
  if (Array.isArray(v)) return v.join("، ");
  return String(v);
}

export const newClientKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

export const ACCEPT: Record<string, string> = { pdf: "PDF", image: "صورة", doc: "Word", sheet: "Excel" };
export const ACCEPT_MIME: Record<string, string> = { pdf: "application/pdf", image: "image/png,image/jpeg,image/webp", doc: ".docx", sheet: ".xlsx" };
