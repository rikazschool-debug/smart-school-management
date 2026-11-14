import { brandHeaderHtml } from "@/lib/export-brand";
// One layout for the employee file: on-screen view, single print and bulk print all use buildSheet,
// so section order and masking are identical everywhere. Data comes only from the server
// (hr_employee_get / hr_employee_profile_get / hr_employee_account or hr_employee_print), already masked.
import { CAL_LABEL, HR_FIELDS, HR_GROUPS, ID_TYPES, type Cal } from "@/lib/hr-fields";

type Val = string | number | boolean | null | undefined;
export type SheetEmp = Record<string, Val> & { sensitive?: boolean };
export type SheetAssign = { school: string; job_title?: string | null; department?: string | null; category?: string | null; manager?: string | null; start_date: string; end_date?: string | null; is_primary?: boolean; active?: boolean };
export type SheetAccount = { has_login: boolean; self_access: boolean; roles: { role: string; school: string | null; active: boolean }[]; templates: string[]; is_teacher?: boolean };
export type SheetItem = { employee: SheetEmp; assignments?: SheetAssign[]; profile?: Record<string, Val> | null; account?: SheetAccount | null };
export type SheetRow = { label: string; value: string; ltr?: boolean; masked?: boolean };
export type SheetSection = { key: string; title: string; rows: SheetRow[] };

export const ACCOUNT_TITLE = "الحساب والصلاحيات";
export const MASKED = "محجوب — يحتاج صلاحية البيانات الحساسة";
const GENDER: Record<string, string> = { male: "ذكر", female: "أنثى" };
const STATUS: Record<string, string> = { active: "على رأس العمل", suspended: "موقوف مؤقتًا", ended: "انتهت الخدمة" };

/** field order inside each section (keys from HR_FIELDS; a few computed rows use «@») */
const ORDER: Record<string, string[]> = {
  personal: ["full_name", "display_name", "name_en", "gender", "birth_date", "nationality", "marital_status", "religion", "address"],
  docs: ["id_type", "national_id", "id_version", "id_expiry", "passport_no", "passport_issue", "passport_expiry", "passport_place", "sponsor_name", "sponsor_no", "has_licence", "licence_type", "licence_expiry"],
  job: ["employee_no", "job_title", "@category", "@schools", "department", "team", "@manager", "hire_date", "assignment_note", "@status", "@end_date"],
  qual: ["education", "specialization"],
  contact: ["phone", "email"],
  pay: ["pay_method", "bank_name", "iban", "mid_name", "mid_id", "mid_bank", "mid_iban"],
};
const LTR = new Set(["national_id", "id_version", "passport_no", "iban", "mid_iban", "mid_id", "phone", "email", "employee_no", "name_en", "sponsor_no"]);
/** never printed or shown, whatever the server sends */
const SECRET = /pass(word)?_?hash|password|secret|token|otp/i;

const str = (v: Val) => (v === null || v === undefined || v === "" ? "" : String(v));

export function buildSheet(it: SheetItem, roleLabel: (r: string) => string = (r) => r): SheetSection[] {
  const e = it.employee, p = it.profile ?? {}, sens = !!e.sensitive;
  const asg = (it.assignments ?? []).filter((a) => a.active !== false);
  const primary = asg.find((a) => a.is_primary) ?? asg[0];
  const field = (k: string) => HR_FIELDS.find((f) => f.key === k);
  const one = (k: string): SheetRow | null => {
    if (SECRET.test(k)) return null;
    if (k === "@category") return { label: "التصنيف الوظيفي", value: primary?.category ?? "" };
    if (k === "@schools") return { label: "الفرع / المدرسة", value: asg.map((a) => a.school).join("، ") };
    if (k === "@manager") return { label: "المسؤول المباشر", value: str(p["manager"]) ? `${str(p["manager"])}${str(p["manager_no"]) ? ` (${str(p["manager_no"])})` : ""}` : p["manager_kind"] === "owner" ? "مالك المجموعة" : "الموارد البشرية (افتراضي)" };
    if (k === "@status") return { label: "الحالة", value: STATUS[str(e["status"])] ?? str(e["status"]) };
    if (k === "@end_date") return e["status"] === "ended" ? { label: "تاريخ انتهاء الخدمة", value: str(e["end_date"]), ltr: true } : null;
    const f = field(k); if (!f) return null;
    const src = f.where === "base" ? e : p;
    let v = str(k === "department" ? (p["department"] ?? primary?.department) : src[k]);
    if (f.sensitive && !sens && !v) return { label: f.label, value: MASKED, masked: true };
    if (f.kind === "gender") v = GENDER[v] ?? v;
    else if (f.kind === "idtype") v = ID_TYPES[v] ?? v;
    else if (f.kind === "check") v = v === "yes" || v === "true" ? "نعم" : v ? "لا" : "";
    else if (f.kind === "docdate" && v) { const c = str(p[`${k}_cal`]) as Cal | ""; if (c && CAL_LABEL[c]) v = `${v} (${CAL_LABEL[c]})`; }
    return { label: f.label, value: v, ltr: LTR.has(k) || f.kind === "date" || f.kind === "docdate", masked: v.startsWith("••••") };
  };
  const out: SheetSection[] = HR_GROUPS.map((g) => ({ key: g.key, title: g.label, rows: (ORDER[g.key] ?? []).map(one).filter((r): r is SheetRow => !!r) }));
  const acc = it.account;
  const rows: SheetRow[] = [
    { label: "حساب الدخول", value: acc ? (acc.has_login ? "مرتبط" : "لا يوجد حساب مرتبط") : e["has_login"] ? "مرتبط" : "لا يوجد حساب مرتبط" },
    { label: "الوصول إلى «ملفي الوظيفي»", value: (acc?.self_access ?? e["self_access"]) ? "مفعّل" : "غير مفعّل" },
  ];
  if (acc) {
    rows.push({ label: "الأدوار", value: acc.roles.map((r) => `${r.role === "teacher" && acc.is_teacher === false ? (acc.templates[0] ?? "موظف إداري") : roleLabel(r.role)}${r.school ? ` — ${r.school}` : ""}${r.active ? "" : " (موقوف)"}`).join("، ") });
    if (acc.templates.length) rows.push({ label: "قوالب الصلاحيات", value: acc.templates.join("، ") });
  }
  out.push({ key: "account", title: ACCOUNT_TITLE, rows });
  return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Arabic RTL A4 document; every employee starts on a new page. Used by the preview iframe and printing. */
export function sheetHtml(items: SheetItem[], opts: { org?: string | undefined; by?: string | undefined; at?: Date; roleLabel?: (r: string) => string } = {}): string {
  const at = (opts.at ?? new Date()).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const pages = items.map((it, i) => {
    const e = it.employee;
    const secs = buildSheet(it, opts.roleLabel).map((s, n) => `<section><h2>${n + 1}. ${esc(s.title)}</h2><table>${s.rows.map((r) =>
      `<tr><th>${esc(r.label)}</th><td${r.ltr ? ' dir="ltr"' : ""}${r.masked ? ' class="m"' : ""}>${esc(r.value || "—")}</td></tr>`).join("")}</table></section>`).join("");
    return `<article${i ? ' class="pb"' : ""}>${brandHeaderHtml({ fallbackName: opts.org })}<header><div><h1>بيانات الموظف</h1><p>${esc(str(e["display_name"]) || str(e["full_name"]))} · <bdi dir="ltr">${esc(str(e["employee_no"]))}</bdi></p></div><div class="meta">${opts.org ? esc(opts.org) + "<br>" : ""}تاريخ الطباعة: ${esc(at)}${opts.by ? `<br>بواسطة: ${esc(opts.by)}` : ""}</div></header>${secs}<footer>سري — للاستخدام الإداري الداخلي فقط. لا يتضمن كلمات مرور أو أسرار حساب.</footer></article>`;
  }).join("");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بيانات الموظفين</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:12mm 10mm}
*{box-sizing:border-box}body{font-family:Cairo,Tahoma,sans-serif;color:#111;margin:0;padding:12px;font-size:11.5px;background:#fff}
article{max-width:190mm;margin:0 auto}.pb{break-before:page;page-break-before:always;margin-top:24px}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f5e4a;padding-bottom:6px;margin-bottom:8px}
h1{margin:0;font-size:18px;color:#0f5e4a}header p{margin:2px 0 0;font-weight:700;font-size:13px}.meta{font-size:10px;color:#555;text-align:left}
section{break-inside:avoid;margin-top:8px}h2{font-size:12.5px;margin:0 0 3px;background:#eef5f2;padding:3px 8px;border-radius:4px;color:#0f5e4a}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #d6dedb;padding:3px 6px;text-align:right;vertical-align:top}
th{width:34%;background:#fafafa;font-weight:600;color:#333}td.m{color:#888;font-size:10px}
footer{margin-top:10px;font-size:9.5px;color:#777;text-align:center;border-top:1px solid #ddd;padding-top:4px}
@media print{body{padding:0}.pb{margin-top:0}}</style></head><body>${pages}</body></html>`;
}
