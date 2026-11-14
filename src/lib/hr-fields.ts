// Single definition of employee data used by the add/edit form, the employee file and the Excel import.
// Same labels, groups, sensitivity and validation everywhere.
import { normPhone } from "@/lib/people-import";

export type HrGroup = "personal" | "docs" | "job" | "qual" | "contact" | "pay";
/** Order and names = the approved «إضافة موظف» tabs (1–6); tabs 7 (account) and 8 (review) have no data fields. */
export const HR_GROUPS: { key: HrGroup; label: string }[] = [
  { key: "personal", label: "البيانات الشخصية" },
  { key: "docs", label: "الهوية والوثائق" },
  { key: "job", label: "البيانات الوظيفية" },
  { key: "qual", label: "المؤهلات" },
  { key: "contact", label: "بيانات التواصل" },
  { key: "pay", label: "البيانات البنكية والدفع" },
];
/** fixed choices shown as a list in the form (older free-text values stay selectable) */
export const HR_OPTIONS: Record<string, string[]> = {
  nationality: ["سعودي", "مصري", "سوداني", "يمني", "هندي", "بنقلاديشي", "باكستاني", "بدون"],
  marital_status: ["متزوج", "غير متزوج"],
  religion: ["مسلم", "غير مسلم"],
  pay_method: ["تحويل بنكي", "نقداً", "وسيط"],
};
/** the intermediary (وسيط) bank fields are open only when the payment method is «وسيط» */
export const MID_KEYS = ["mid_name", "mid_id", "mid_bank", "mid_iban"];
export const isMidPay = (v: string | undefined) => norm(v) === norm("وسيط");
/** a fixed non-intermediary method (bank transfer / cash) was picked → intermediary data is not used */
export const isNonMidPay = (v: string | undefined) => !!v && HR_OPTIONS["pay_method"]!.some((o) => norm(o) === norm(v)) && !isMidPay(v);
export const NAME_EN_MAX = 35;
export type HrKind = "text" | "date" | "docdate" | "phone" | "email" | "gender" | "iban" | "digits" | "school" | "category" | "manager_no" | "idtype" | "check";
/** where: base = hr_employees column (hr_employee_save); prof = hr_employee_profile (hr_employee_profile_save); asg = primary assignment */
export type HrField = { key: string; label: string; group: HrGroup; kind: HrKind; where: "base" | "prof" | "asg" | "meta"; sensitive?: boolean; required?: boolean; template?: boolean; max?: number; syn: string[] };

// Order = the 34-column template (after «#»), then Rikaz-only fields.
export const HR_FIELDS: HrField[] = [
  { key: "employee_no", label: "الرقم الوظيفي", group: "job", kind: "text", where: "base", template: true, syn: ["رقم الموظف", "employee no", "employee number"] },
  { key: "full_name", label: "اسم الموظف", group: "personal", kind: "text", where: "base", required: true, template: true, syn: ["الاسم الكامل", "الاسم الرسمي الكامل", "الاسم", "name", "full name"] },
  { key: "name_en", label: "الاسم الكامل - انجليزي", group: "personal", kind: "text", where: "prof", template: true, max: NAME_EN_MAX, syn: ["الاسم الانجليزي", "الاسم بالانجليزي", "الاسم الكامل انجليزي", "english name"] },
  { key: "job_title", label: "المسمى الوظيفي", group: "job", kind: "text", where: "base", template: true, syn: ["الوظيفة", "job", "job title"] },
  { key: "school", label: "الفرع", group: "job", kind: "school", where: "meta", required: true, template: true, syn: ["المدرسة", "school", "branch"] },
  { key: "department", label: "القسم", group: "job", kind: "text", where: "asg", template: true, syn: ["department"] },
  { key: "team", label: "الفريق", group: "job", kind: "text", where: "prof", template: true, syn: ["team"] },
  { key: "manager_name", label: "اسم المسؤول المباشر", group: "job", kind: "text", where: "meta", template: true, syn: ["المسؤول المباشر", "المدير المباشر", "اسم المدير المباشر"] },
  { key: "manager_no", label: "رقم المسؤول المباشر", group: "job", kind: "manager_no", where: "meta", template: true, syn: ["الرقم الوظيفي للمسؤول المباشر", "رقم المدير المباشر"] },
  { key: "phone", label: "رقم الجوال", group: "contact", kind: "phone", where: "base", template: true, syn: ["الجوال", "الهاتف", "phone", "mobile"] },
  { key: "email", label: "البريد الإلكتروني", group: "contact", kind: "email", where: "base", template: true, syn: ["البريد", "البريد الوظيفي", "email"] },
  { key: "gender", label: "الجنس", group: "personal", kind: "gender", where: "base", template: true, syn: ["gender"] },
  { key: "marital_status", label: "الحالة الاجتماعية", group: "personal", kind: "text", where: "prof", template: true, syn: ["marital status"] },
  { key: "nationality", label: "الجنسية", group: "personal", kind: "text", where: "base", sensitive: true, template: true, syn: ["nationality"] },
  { key: "address", label: "العنوان", group: "personal", kind: "text", where: "prof", sensitive: true, template: true, syn: ["address"] },
  { key: "birth_date", label: "تاريخ الميلاد", group: "personal", kind: "date", where: "base", sensitive: true, template: true, syn: ["الميلاد", "birth date"] },
  { key: "national_id", label: "رقم الهوية", group: "docs", kind: "digits", where: "base", sensitive: true, template: true, syn: ["الهوية", "رقم الهوية / الإقامة", "رقم الاقامة", "السجل المدني", "id"] },
  { key: "id_expiry", label: "تاريخ إنتهاء الهوية", group: "docs", kind: "docdate", where: "prof", sensitive: true, template: true, syn: ["تاريخ انتهاء الهوية", "انتهاء الهوية"] },
  { key: "passport_no", label: "رقم جواز السفر", group: "docs", kind: "text", where: "prof", sensitive: true, template: true, syn: ["رقم الجواز", "الجواز", "passport"] },
  { key: "passport_expiry", label: "تاريخ انتهاء جواز السفر", group: "docs", kind: "docdate", where: "prof", sensitive: true, template: true, syn: ["تاريخ إنتهاء جواز السفر", "انتهاء الجواز"] },
  { key: "passport_issue", label: "تاريخ إصدار جواز السفر", group: "docs", kind: "docdate", where: "prof", sensitive: true, syn: ["تاريخ اصدار الجواز", "passport issue date"] },
  { key: "passport_place", label: "مكان إصدار جواز السفر", group: "docs", kind: "text", where: "prof", sensitive: true, syn: ["مكان اصدار الجواز", "passport place of issue"] },
  { key: "has_licence", label: "لديه رخصة قيادة", group: "docs", kind: "check", where: "prof", syn: ["رخصة القيادة", "driving licence"] },
  { key: "licence_type", label: "نوع الرخصة", group: "docs", kind: "text", where: "prof", syn: ["licence type"] },
  { key: "licence_expiry", label: "تاريخ انتهاء الرخصة", group: "docs", kind: "docdate", where: "prof", syn: ["انتهاء الرخصة", "licence expiry date"] },
  { key: "religion", label: "الديانة", group: "personal", kind: "text", where: "prof", template: true, syn: ["الدين", "religion"] },
  { key: "education", label: "التعليم", group: "qual", kind: "text", where: "prof", template: true, syn: ["المؤهل", "المؤهل العلمي", "education"] },
  { key: "specialization", label: "التخصص", group: "qual", kind: "text", where: "prof", template: true, syn: ["specialization", "major"] },
  { key: "assignment_note", label: "الإسناد", group: "job", kind: "text", where: "prof", template: true, syn: ["الاسناد"] },
  { key: "pay_method", label: "طريقة الدفع", group: "pay", kind: "text", where: "prof", template: true, syn: ["payment method"] },
  { key: "iban", label: "آيبان الحساب البنكي", group: "pay", kind: "iban", where: "prof", sensitive: true, template: true, syn: ["الايبان", "رقم الايبان", "iban"] },
  { key: "bank_name", label: "اسم البنك", group: "pay", kind: "text", where: "prof", template: true, syn: ["البنك", "bank"] },
  { key: "mid_iban", label: "آيبان الحساب الوسيط", group: "pay", kind: "iban", where: "prof", sensitive: true, template: true, syn: ["ايبان الوسيط"] },
  { key: "mid_bank", label: "اسم البنك الوسيط", group: "pay", kind: "text", where: "prof", sensitive: true, template: true, syn: ["بنك الوسيط"] },
  { key: "mid_name", label: "اسم الوسيط", group: "pay", kind: "text", where: "prof", sensitive: true, template: true, syn: ["الوسيط"] },
  { key: "mid_id", label: "رقم هوية الوسيط", group: "pay", kind: "digits", where: "prof", sensitive: true, template: true, syn: ["هوية الوسيط"] },
  { key: "sponsor_name", label: "اسم الكفيل", group: "docs", kind: "text", where: "prof", sensitive: true, template: true, syn: ["الكفيل"] },
  { key: "sponsor_no", label: "رقم الكفيل", group: "docs", kind: "text", where: "prof", sensitive: true, template: true, syn: ["رقم الكفيل"] },
  // Rikaz-only (old templates / form)
  { key: "id_type", label: "نوع الهوية", group: "docs", kind: "idtype", where: "prof", sensitive: true, syn: ["id type"] },
  { key: "id_version", label: "رقم النسخة", group: "docs", kind: "text", where: "prof", sensitive: true, syn: ["رقم نسخة الهوية", "id version", "id version number"] },
  { key: "display_name", label: "الاسم المعروض", group: "personal", kind: "text", where: "base", syn: ["اسم العرض", "display name"] },
  { key: "category", label: "التصنيف الوظيفي", group: "job", kind: "category", where: "meta", syn: ["التصنيف", "category"] },
  { key: "hire_date", label: "تاريخ المباشرة", group: "job", kind: "date", where: "base", syn: ["تاريخ التعيين", "hire date"] },
];
export const TEMPLATE_HEAD = ["#", ...HR_FIELDS.filter((f) => f.template).map((f) => f.label)];
export const PROF_KEYS = HR_FIELDS.filter((f) => f.where === "prof").map((f) => f.key);

export const norm = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ـ]/g, "").toLowerCase();
export const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const SYN = new Map<string, string>();
for (const f of HR_FIELDS) for (const s of [f.label, ...f.syn]) if (!SYN.has(norm(s))) SYN.set(norm(s), f.key);
/** header text → field key (exact label or synonym). */
export const fieldForHeader = (h: unknown) => SYN.get(norm(h)) ?? null;

export type Cal = "gregorian" | "hijri";
export type DateRes = { ok: true; date: string; cal: Cal } | { ok: false; err: string } | { ok: true; date: ""; cal: null };
/** Excel serial or text date. Hijri accepted only when allowHijri (document expiry). Ambiguous → error, never guessed. */
export function parseDate(v: unknown, allowHijri: boolean): DateRes {
  if (v == null || String(v).trim() === "") return { ok: true, date: "", cal: null };
  if (typeof v === "number") {
    if (v < 1 || v > 80000) return { ok: false, err: "رقم تاريخ غير صالح" };
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return { ok: true, date: d.toISOString().slice(0, 10), cal: "gregorian" };
  }
  let s = toLatinDigits(String(v)).trim();
  let forced: Cal | null = null;
  if (/(هـ|ه)\s*$/.test(s)) { forced = "hijri"; s = s.replace(/(هـ|ه)\s*$/, "").trim(); }
  else if (/م\s*$/.test(s)) { forced = "gregorian"; s = s.replace(/م\s*$/, "").trim(); }
  s = s.replace(/[./\\]/g, "-").replace(/\s+/g, "");
  s = s.replace(/T.*$/, "");
  let y: number, m: number, d: number;
  let mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (mm) { y = +mm[1]!; m = +mm[2]!; d = +mm[3]!; }
  else {
    mm = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!mm) return { ok: false, err: "تاريخ غير واضح — اكتبه بصيغة يوم/شهر/سنة" };
    d = +mm[1]!; m = +mm[2]!; y = +mm[3]!;
    if (m > 12 && d <= 12) return { ok: false, err: "تاريخ غير واضح (الشهر أكبر من 12) — صحّحه" };
  }
  const cal: Cal = forced ?? (y >= 1300 && y <= 1500 ? "hijri" : "gregorian");
  if (cal === "hijri") {
    if (!allowHijri) return { ok: false, err: "أدخل التاريخ بالميلادي" };
    if (y < 1300 || y > 1500 || m < 1 || m > 12 || d < 1 || d > 30) return { ok: false, err: "تاريخ هجري غير صحيح" };
  } else {
    if (y < 1900 || y > 2100) return { ok: false, err: "سنة غير صحيحة" };
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false, err: "تاريخ غير صحيح" };
  }
  return { ok: true, date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, cal };
}

export const parseGender = (v: unknown): "male" | "female" | "" | null => {
  const g = norm(v); if (!g) return "";
  if (["ذكر", "male", "m"].map(norm).includes(g)) return "male";
  if (["انثى", "انثي", "female", "f"].map(norm).includes(g)) return "female";
  return null;
};
export const cleanIban = (v: unknown) => toLatinDigits(String(v ?? "")).replace(/\s|-/g, "").toUpperCase();
export const ibanOk = (s: string) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(s) && (!s.startsWith("SA") || s.length === 24);

/** Validate + normalise one value with the shared rules. Returns [value, error]. Values are kept as text (leading zeros). */
export function cleanValue(f: HrField, raw: unknown): { v: string; cal?: Cal | null; err?: string } {
  const t = toLatinDigits(String(raw ?? "")).trim().replace(/\s+/g, " ");
  switch (f.kind) {
    case "date": case "docdate": {
      const r = parseDate(typeof raw === "number" ? raw : t, f.kind === "docdate");
      return r.ok ? { v: r.date, cal: r.cal } : { v: t, err: `${f.label}: ${r.err}` };
    }
    case "phone": { if (!t) return { v: "" }; const p = normPhone(t); return p ? { v: "+" + p } : { v: t, err: "رقم الجوال غير صحيح (05 أو 9665 أو ‎+9665)" }; }
    case "email": return !t || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? { v: t } : { v: t, err: "بريد غير صحيح" };
    case "gender": { const g = parseGender(t); return g === null ? { v: t, err: "الجنس: ذكر أو أنثى" } : { v: g }; }
    case "iban": { const s = cleanIban(t); return !s || ibanOk(s) ? { v: s } : { v: s, err: `${f.label} غير صحيح` }; }
    case "idtype": { if (!t) return { v: "" }; const k = ID_TYPES[t] ? t : Object.keys(ID_TYPES).find((x) => norm(ID_TYPES[x]) === norm(t)); return k ? { v: k } : { v: t, err: "نوع الهوية غير معروف" }; }
    case "check": { if (!t) return { v: "" }; return ["yes", "نعم", "1", "true"].includes(norm(t)) ? { v: "yes" } : ["no", "لا", "0", "false"].includes(norm(t)) ? { v: "" } : { v: t, err: `${f.label}: نعم أو لا` }; }
    case "digits": { const s = t.replace(/\s/g, ""); return !s || /^\d{5,20}$/.test(s) ? { v: s } : { v: s, err: `${f.label}: أرقام فقط (5–20)` }; }
    default: return f.max && t.length > f.max ? { v: t, err: `${f.label}: لا يزيد عن ${f.max} خانة` } : t.length > 300 ? { v: t, err: `${f.label} طويل` } : { v: t };
  }
}
export const ID_TYPES: Record<string, string> = { national: "هوية وطنية", resident: "هوية مقيم", gcc: "هوية خليجية", border: "رقم حدود", none: "لا يوجد" };
/** passport expiry before issue (same calendar) → message shown under the field and refused by the server */
export function passportDateErr(f: Record<string, string | undefined>): string {
  const a = cleanValue(HR_FIELDS.find((x) => x.key === "passport_issue")!, f["passport_issue"]), b = cleanValue(HR_FIELDS.find((x) => x.key === "passport_expiry")!, f["passport_expiry"]);
  if (!a.v || !b.v || a.err || b.err) return "";
  const ca = f["passport_issue_cal"] || a.cal, cb = f["passport_expiry_cal"] || b.cal;
  return ca === cb && b.v < a.v ? "تاريخ انتهاء الجواز يسبق تاريخ إصداره" : "";
}
export const CAL_LABEL: Record<Cal, string> = { gregorian: "ميلادي", hijri: "هجري" };
