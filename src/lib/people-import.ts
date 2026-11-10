// Pure helpers for student/teacher Excel import and single add (shared rules, unit-tested in people-import.test.ts).
// Reads ministry-style reports (titles, merged cells, two-line headers, one sheet per section) and the blank Rikaz templates.
import * as XLSX from "xlsx";

export type PKind = "students" | "teachers";
export type Field = { key: string; label: string; required?: boolean; hint: string; syn: string[] };

export type IKind = PKind | "guardians";
export const FIELDS: Record<IKind, Field[]> = {
  students: [
    { key: "full_name", label: "اسم الطالب", required: true, hint: "مطلوب — الاسم بالعربية", syn: ["اسم الطالب", "الاسم الكامل", "الاسم", "الإسم", "اسم الطالبة"] },
    { key: "display_name", label: "الاسم المعروض", hint: "اختياري — يُملأ تلقائيًا بالاسم الأول والأخير، ويجب ألا يتكرر لشخص آخر في المؤسسة", syn: ["الاسم المعروض", "اسم العرض", "display name"] },
    { key: "national_id", label: "رقم الهوية", required: true, hint: "مطلوب — 10 أرقام، يُكتب نصًا", syn: ["رقم الهوية", "رقمها", "الهوية", "السجل المدني", "رقم السجل المدني", "رقم الهوية/الإقامة"] },
    { key: "csmart_no", label: "رقم الطالب الداخلي — C‑Smart", hint: "يُكتب نصًا وتُحفظ الأصفار الأولى — مطلوب لدخول الطالب", syn: ["رقم الطالب الداخلي — C‑Smart", "رقم الطالب الداخلي", "رقم الطالب", "رقم C-Smart", "رقم سي سمارت", "C-Smart", "csmart"] },
    { key: "birth_date", label: "تاريخ الميلاد", hint: "ميلادي YYYY-MM-DD أو DD/MM/YYYY", syn: ["تاريخ الميلاد", "تاريخ الولادة", "date of birth"] },
    { key: "gender", label: "الجنس", hint: "ذكر / أنثى", syn: ["الجنس", "النوع"] },
    { key: "grade", label: "الصف", hint: "اسم الصف كما في ركاز", syn: ["الصف"] },
    { key: "section", label: "الفصل", hint: "اسم الشعبة كما في ركاز", syn: ["الفصل", "الشعبة"] },
    { key: "guardian_name", label: "اسم ولي الأمر", hint: "مطلوب — يُضاف ولي الأمر ويُربط بالطالب تلقائيًا", syn: ["اسم ولي الأمر", "ولي الأمر", "اسم ولي الامر"] },
    { key: "guardian_id", label: "هوية ولي الأمر", hint: "مطلوب مع اسم ولي الأمر — 10 أرقام", syn: ["هوية ولي الأمر", "رقم هوية ولي الأمر", "هوية ولي الامر"] },
    { key: "guardian_phone", label: "جوال ولي الأمر", hint: "اختياري — 05XXXXXXXX، يلزم لرمز الدخول ورسالة الجوال", syn: ["جوال ولي الأمر", "رقم جوال ولي الأمر", "جوال ولي الامر"] },
    { key: "relationship", label: "صلة القرابة", hint: "أب / أم / أخ / أخت / أخرى", syn: ["صلة القرابة", "القرابة", "صلة ولي الأمر"] },
  ],
  guardians: [
    { key: "full_name", label: "اسم ولي الأمر", required: true, hint: "مطلوب", syn: ["اسم ولي الأمر", "ولي الأمر", "اسم ولي الامر", "الاسم"] },
    { key: "display_name", label: "الاسم المعروض", hint: "اختياري — يُملأ تلقائيًا بالاسم الأول والأخير، ويجب ألا يتكرر لشخص آخر في المؤسسة", syn: ["الاسم المعروض", "اسم العرض", "display name"] },
    { key: "national_id", label: "هوية ولي الأمر أو إقامته", required: true, hint: "مطلوب — 10 أرقام، يُكتب نصًا", syn: ["هوية ولي الأمر أو إقامته", "هوية ولي الأمر", "رقم هوية ولي الأمر", "هوية ولي الامر", "رقم الهوية"] },
    { key: "phone", label: "الجوال المعتمد", required: true, hint: "مطلوب — 05XXXXXXXX، يُرسل إليه رمز الدخول", syn: ["الجوال المعتمد", "جوال ولي الأمر", "الجوال", "رقم الجوال", "جوال ولي الامر"] },
    { key: "email", label: "البريد (اختياري)", hint: "اختياري", syn: ["البريد (اختياري)", "البريد", "البريد الإلكتروني"] },
    { key: "relationship", label: "صلة القرابة", hint: "أب / أم / أخ / أخت / أخرى", syn: ["صلة القرابة", "القرابة", "صلة ولي الأمر"] },
    { key: "student_nid", label: "هوية الابن", hint: "هوية الابن أو رقمه في C‑Smart (أحدهما على الأقل)", syn: ["هوية الابن", "هوية الطالب", "رقم هوية الطالب"] },
    { key: "student_csmart", label: "رقم الابن في C‑Smart", hint: "يُكتب نصًا وتُحفظ الأصفار الأولى", syn: ["رقم الابن في C‑Smart", "رقم الطالب الداخلي", "رقم C-Smart", "C-Smart"] },
    { key: "school", label: "مدرسة الابن", hint: "اسم المدرسة كما في ركاز — يجب أن تطابق المدرسة الحالية", syn: ["مدرسة الابن", "المدرسة", "مدرسة الطالب"] },
  ],
  teachers: [
    { key: "full_name", label: "الإسم", required: true, hint: "مطلوب", syn: ["الإسم", "الاسم", "الاسم الكامل", "اسم المعلم", "اسم المعلمة"] },
    { key: "display_name", label: "الاسم المعروض", hint: "اختياري — يُملأ تلقائيًا بالاسم الأول والأخير، ويجب ألا يتكرر لشخص آخر في المؤسسة", syn: ["الاسم المعروض", "اسم العرض", "display name"] },
    { key: "national_id", label: "رقم الهوية أو الإقامة", hint: "10 أرقام يُكتب نصًا — يلزم للدخول بالهوية ثم رمز التحقق", syn: ["رقم الهوية أو الإقامة", "رقم الهوية", "الهوية", "السجل المدني", "رقم الإقامة"] },
    { key: "phone", label: "الجوال", required: true, hint: "مطلوب — 05XXXXXXXX، يدخل به المعلم برمز واتساب", syn: ["الجوال", "رقم الجوال", "جوال"] },
    { key: "email", label: "البريد الإلكتروني", hint: "اختياري", syn: ["البريد الإلكتروني", "البريد", "البريد الالكتروني"] },
    { key: "specialization", label: "التخصص", hint: "اختياري", syn: ["التخصص"] },
    { key: "department", label: "القسم", hint: "اسم قسم موجود (اختياري)", syn: ["القسم"] },
  ],
};

const DIAC = /[\u064B-\u0652\u0640]/g;
/** Arabic-insensitive comparison key: no diacritics/tatweel, unified alef/yaa/taa marbuta, single spaces, lower case. */
export function norm(s: unknown): string {
  return String(s ?? "").replace(DIAC, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[:：]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Arabic-Indic / Persian digits → Latin, so «٠١٢» and «012» are the same value. */
export function latinDigits(s: unknown): string {
  return String(s ?? "").replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
}
/** C‑Smart internal number: text, digits/letters only, leading zeros kept; null when empty; "" when invalid. */
/** Comparison key used only to DETECT near-duplicates (case-insensitive). Matching always requires the exact value. */
export function csmartKey(s: string): string {
  return s.toUpperCase();
}
export function normCsmart(s: unknown): string | null {
  const t = latinDigits(s).replace(/[\s\u200f\u200e]/g, "").trim();
  if (!t) return null;
  return /^[A-Za-z0-9-]{1,30}$/.test(t) ? t : "";
}
/** A student can sign in only with an ID, a C‑Smart number and an active status. Missing items in Arabic. */
export function studentReadiness(r: { national_id?: string | null; csmart_no?: string | null; status?: string | null }): string[] {
  const m: string[] = [];
  if (!r.national_id) m.push("رقم الهوية");
  if (!r.csmart_no) m.push("رقم C‑Smart");
  if (r.status && r.status !== "active") m.push("الحالة غير منتظمة");
  return m;
}

/** A guardian receives a sign-in code only with an ID and an approved mobile. */
export function guardianReadiness(r: { national_id?: string | null; phone?: string | null }): string[] {
  const m: string[] = [];
  if (!r.national_id) m.push("رقم الهوية");
  if (!r.phone) m.push("الجوال المعتمد");
  return m;
}
/** Hide all but the last 3 characters. */
export const maskTail = (s: string) => (s.length <= 3 ? s : "•".repeat(s.length - 3) + s.slice(-3));

/** Saudi mobile → 9665XXXXXXXX; null when invalid. Same rule as SQL norm_phone. */
export function normPhone(p: unknown): string | null {
  let d = latinDigits(p).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^05\d{8}$/.test(d)) return "966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "966" + d;
  return null;
}
export const localPhone = (p: string | null | undefined) => (p && /^9665\d{8}$/.test(p) ? "0" + p.slice(3) : p ?? "");
export const STUDENT_DOMAIN = "student.rikaz.app";
export const studentLoginEmail = (nid: string) => `${nid.replace(/\D/g, "")}@${STUDENT_DOMAIN}`;
export const isNationalId = (s: string) => /^[12]\d{9}$/.test(s);

export function strongEnough(p: string): string | null {
  if (p.length < 8) return "كلمة المرور 8 أحرف على الأقل";
  if (!/[A-Za-z\u0600-\u06FF]/.test(p) || !/\d/.test(p)) return "استخدم حروفًا وأرقامًا معًا";
  return null;
}

const HFMT = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }) : null;
/** Umm al-Qura Hijri → Gregorian ISO by searching around an estimate (Intl formats Gregorian→Hijri only). */
export function hijriToGregorian(y: number, m: number, d: number): string | null {
  if (!HFMT || m < 1 || m > 12 || d < 1 || d > 30) return null;
  const est = Date.UTC(622, 6, 16) + ((y - 1) * 354.36667 + (m - 1) * 29.5306 + (d - 1)) * 86400000;
  for (let k = -45; k <= 45; k++) {
    const t = est + k * 86400000;
    const parts = Object.fromEntries(HFMT.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    if (Number(parts["year"]) === y && Number(parts["month"]) === m && Number(parts["day"]) === d) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

/** Gregorian (or Umm al-Qura Hijri, converted) date → YYYY-MM-DD; invalid → error text. */
export function parseDate(s: string): { v: string | null; err?: string; hijri?: boolean } {
  const t = s.trim();
  if (!t) return { v: null };
  let y: number, m: number, d: number;
  let mt = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (mt) { y = +mt[1]!; m = +mt[2]!; d = +mt[3]!; }
  else if ((mt = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +mt[1]!; m = +mt[2]!; y = +mt[3]!; }
  else return { v: null, err: "صيغة التاريخ غير مفهومة" };
  if (y >= 1300 && y <= 1500) { const g = hijriToGregorian(y, m, d); return g ? { v: g, hijri: true } : { v: null, err: "تاريخ هجري غير صالح" }; }
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return { v: null, err: "تاريخ غير صالح" };
  if (y < 1940 || dt.getTime() > Date.now()) return { v: null, err: "تاريخ خارج النطاق" };
  return { v: iso };
}

export type RawRow = { sheet: string; line: number; values: Record<string, string>; formulas: string[] };
export type Parsed = { rows: RawRow[]; mapping: Record<string, number>; headers: string[]; sheets: number; problems: string[] };

type Grid = { cells: (string | null)[][]; formula: boolean[][] };
function gridOf(ws: XLSX.WorkSheet): Grid {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const cells: (string | null)[][] = [], formula: boolean[][] = [];
  for (let r = 0; r <= range.e.r; r++) {
    cells[r] = []; formula[r] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      formula[r]![c] = !!cell?.f;
      if (!cell || cell.v === undefined || cell.v === null || cell.v === "") { cells[r]![c] = null; continue; }
      // numbers: plain digits (IDs/phones typed as numbers keep their digits; leading 0 of phones handled by normPhone)
      const v = cell.t === "n" ? (Number.isInteger(cell.v) ? String(cell.v) : String(cell.w ?? cell.v)) : String(cell.w ?? cell.v);
      cells[r]![c] = v.trim() === "" ? null : v.trim();
    }
  }
  return { cells, formula };
}

/** Finds the header row (one or two lines) with the most known column names; the name column must be among them. */
function findHeader(g: Grid, fields: Field[]): { row: number; depth: number; map: Record<string, number>; heads: string[] } | null {
  const syn = new Map<string, string>();
  for (const f of fields) for (const s of f.syn) syn.set(norm(s), f.key);
  let best: { row: number; depth: number; map: Record<string, number>; heads: string[] } | null = null;
  const lim = Math.min(g.cells.length, 60);
  for (let r = 0; r < lim; r++) for (const depth of [1, 2]) {
    if (depth === 2 && r + 1 >= g.cells.length) continue;
    const map: Record<string, number> = {}; const heads: string[] = [];
    const width = Math.max(g.cells[r]!.length, g.cells[r + 1]?.length ?? 0);
    for (let c = 0; c < width; c++) {
      for (let k = 0; k < depth; k++) {
        const t = g.cells[r + k]?.[c];
        const key = t ? syn.get(norm(t)) : undefined;
        if (key && map[key] === undefined) { map[key] = c; heads[c] = t!; break; }
      }
    }
    const n = Object.keys(map).length;
    if (map["full_name"] !== undefined && n >= 2 && (!best || n > Object.keys(best.map).length)) best = { row: r, depth, map, heads };
  }
  return best;
}

/** Sheet-level labels above the table (e.g. «الصف : الأول الابتدائي», «الفصل : 1») apply to every row of that sheet. */
function sheetContext(g: Grid, before: number, keys: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (let r = 0; r < before; r++) {
    const row = g.cells[r]!;
    row.forEach((t, c) => {
      const key = t ? keys[norm(t)] : undefined;
      if (!key || out[key]) return;
      let bestC = -1;
      row.forEach((v, c2) => { if (c2 !== c && v && norm(v) !== "" && !keys[norm(v)] && (bestC < 0 || Math.abs(c2 - c) < Math.abs(bestC - c))) bestC = c2; });
      if (bestC >= 0) out[key] = row[bestC]!;
    });
  }
  return out;
}

const HAS_AR = /[\u0600-\u06FF]/;

/** Reads every sheet without evaluating formulas. Rows without Arabic in the name (English duplicate lines, footers) are skipped. */
export function parseWorkbook(buf: ArrayBuffer, kind: IKind, override?: Record<string, number>): Parsed {
  const wb = XLSX.read(buf, { type: "array", cellFormula: true, cellHTML: false, cellDates: false, bookVBA: false, sheetStubs: false });
  const fields = FIELDS[kind];
  const rows: RawRow[] = []; const problems: string[] = [];
  let mapping: Record<string, number> = {}; let headers: string[] = []; let sheets = 0;
  const ctxKeys: Record<string, string> = kind === "students" ? { [norm("الصف")]: "grade", [norm("الفصل")]: "section", [norm("الشعبة")]: "section" } : {};
  for (const name of wb.SheetNames) {
    const g = gridOf(wb.Sheets[name]!);
    const h = findHeader(g, fields);
    if (!h) continue;
    sheets++;
    const map = override ?? h.map;
    if (!Object.keys(mapping).length) { mapping = map; headers = h.heads; }
    const ctx = sheetContext(g, h.row, ctxKeys);
    for (let r = h.row + h.depth; r < g.cells.length; r++) {
      const row = g.cells[r]!;
      if (!row.some(Boolean)) continue;
      const values: Record<string, string> = {};
      for (const f of fields) { const c = map[f.key]; values[f.key] = c === undefined ? "" : row[c] ?? ""; }
      for (const [k, v] of Object.entries(ctx)) if (!values[k]) values[k] = v;
      // English duplicate lines in ministry reports carry no ID/phone: skip them. A row with an ID or phone but no Arabic
      // name is kept so validation reports it instead of dropping it silently.
      const keyed = !!(values["national_id"] || values["phone"] || values["guardian_phone"] || values["student_nid"]);
      const prev = rows[rows.length - 1]?.values;
      const echo = !!prev && !!values["national_id"] && prev["national_id"] === values["national_id"];
      if (!values["full_name"] || !HAS_AR.test(values["full_name"])) { if (!keyed || echo) continue; values["full_name"] = HAS_AR.test(values["full_name"] ?? "") ? values["full_name"]! : ""; }
      if (fields.some((f) => norm(values[f.key]) === norm(f.label))) continue; // repeated header line on a printed page
      const formulas = fields.filter((f) => map[f.key] !== undefined && g.formula[r]![map[f.key]!]).map((f) => f.label);
      rows.push({ sheet: name, line: r + 1, values, formulas });
    }
  }
  if (!sheets) problems.push("لم يُعثر على صف عناوين معروف (يلزم عمود الاسم وعمود آخر على الأقل)");
  return { rows, mapping, headers, sheets, problems };
}

/** Blank template: column names only, text format so IDs and phones keep leading zeros. No personal data. */
export function templateBook(kind: IKind): XLSX.WorkBook {
  const f = FIELDS[kind];
  const ws = XLSX.utils.aoa_to_sheet([f.map((c) => c.label)]);
  for (let r = 1; r <= 1000; r++) f.forEach((_, c) => { const a = XLSX.utils.encode_cell({ r, c }); ws[a] = { t: "s", v: "", z: "@" }; });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: f.length - 1 } });
  ws["!cols"] = f.map(() => ({ wch: 22 }));
  const help = XLSX.utils.aoa_to_sheet([["العمود", "الوصف"], ...f.map((c) => [c.label, c.hint])]);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "البيانات");
  XLSX.utils.book_append_sheet(wb, help, "تعليمات");
  return wb;
}

export type Lookups = {
  sections: Map<string, { id: string; year_id: string; capacity: number | null; used: number }>; // key norm(grade)|norm(section)
  departments: Map<string, string>; // norm(name) → id
  existingIds: Map<string, string>; // national_id → row id
  existingPhones: Map<string, string>; // normalized phone → teacher id
  /** explicit choices made in the preview: file key norm(grade)|norm(section) → section id */
  sectionChoice?: Map<string, string>;
  /** teacher row id → national ID (to detect a mobile that belongs to someone with another ID) */
  rowNid?: Map<string, string>;
  /** caller lacks people_identity.view: ID numbers in the file are not saved */
  nidLocked?: boolean;
  /** students: C‑Smart number → row id, and row id → stored C‑Smart number */
  existingCsmart?: Map<string, string>;
  rowCsmart?: Map<string, string>;
};
/** Rikaz sections for a file label that did not match exactly — the user must pick one; a numeric label only gets a *suggestion*. */
export function sectionSuggestion(label: string): string | null {
  const n = Number(label.trim());
  return /^\d{1,2}$/.test(label.trim()) && LETTERS[n - 1] ? LETTERS[n - 1]! : null;
}
export type CheckedRow = RawRow & {
  data: Record<string, string | null>; errors: string[]; notes: string[];
  existingId?: string; section?: { id: string; year_id: string } | null; department_id?: string | null;
  /** set when the file's grade/section has no exact match and no explicit choice yet */
  unmatchedSection?: { key: string; grade: string; section: string };
};

const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل"];
const REL: Record<string, string> = { [norm("أب")]: "father", [norm("الأب")]: "father", [norm("والد")]: "father", [norm("أم")]: "mother", [norm("الأم")]: "mother", [norm("والدة")]: "mother", [norm("أخ")]: "brother", [norm("أخت")]: "sister", [norm("أخرى")]: "other" };

/** Arabic relationship label → code; "" when unknown, "father" when empty. */
export function relCode(s: unknown): string { const r = norm(s); return r ? REL[r] ?? "" : "father"; }

export type GuardianCheck = { errors: string[]; payload: Record<string, string> };
/** Client-side checks for the guardians template; the server re-checks everything and decides create/link/conflict. */
export function checkGuardianRows(rows: RawRow[], schoolName: string): GuardianCheck[] {
  const pairs = new Set<string>(), phoneOf = new Map<string, string>();
  return rows.map((r) => {
    const v = r.values; const e: string[] = [];
    if (r.formulas.length) e.push(`خلايا صيغ مرفوضة: ${r.formulas.join("، ")}`);
    const nid = latinDigits(v["national_id"]).replace(/\D/g, "");
    const ph = normPhone(v["phone"]);
    const snid = latinDigits(v["student_nid"]).replace(/\D/g, "");
    const scs = normCsmart(v["student_csmart"]);
    const rel = relCode(v["relationship"]);
    if (!(v["full_name"] ?? "").trim()) e.push("اسم ولي الأمر مطلوب");
    if (!isNationalId(nid)) e.push("هوية ولي الأمر 10 أرقام تبدأ بـ1 أو 2");
    if (!ph) e.push("الجوال المعتمد غير صالح (05XXXXXXXX)");
    if (!rel) e.push("صلة القرابة: أب / أم / أخ / أخت / أخرى");
    if (snid && !isNationalId(snid)) e.push("هوية الابن 10 أرقام");
    if (scs === "") e.push("رقم C‑Smart غير صالح");
    if (!snid && !scs) e.push("أدخل هوية الابن أو رقمه في C‑Smart");
    if ((v["school"] ?? "").trim() && norm(v["school"]) !== norm(schoolName)) e.push(`المدرسة «${v["school"]}» ليست المدرسة الحالية — استورد صفوفها من مدرستها`);
    if (nid && ph) { const p = phoneOf.get(nid); if (p && p !== ph) e.push("ولي الأمر نفسه بجوالين مختلفين في الملف"); phoneOf.set(nid, ph); }
    const pair = `${nid}|${snid || scs}`;
    if (nid && (snid || scs)) { if (pairs.has(pair)) e.push("العلاقة نفسها مكررة في الملف"); pairs.add(pair); }
    return { errors: e, payload: { full_name: (v["full_name"] ?? "").replace(/\s+/g, " ").trim(), display_name: (v["display_name"] ?? "").replace(/\s+/g, " ").trim(), national_id: nid, phone: ph ?? "", email: (v["email"] ?? "").trim(), relationship: rel, student_nid: snid, student_csmart: scs ?? "" } };
  });
}

/** Same rules for import rows and the single-add form. */
export function validate(kind: PKind, rows: RawRow[], lk: Lookups): CheckedRow[] {
  const seenId = new Set<string>(), seenPhone = new Set<string>(), seenCs = new Map<string, string>();
  const planned = new Map<string, number>();
  return rows.map((r) => {
    const v = r.values; const e: string[] = []; const notes: string[] = [];
    const data: Record<string, string | null> = { full_name: v["full_name"]!.replace(/\s+/g, " ").trim() };
    data["display_name"] = (v["display_name"] ?? "").replace(/\s+/g, " ").trim() || null;
    if ((data["display_name"] ?? "").length > 80) e.push("الاسم المعروض طويل (حتى 80 حرفًا)");
    if (r.formulas.length) e.push(`خلايا صيغ مرفوضة: ${r.formulas.join("، ")}`);
    if (!data["full_name"]) e.push("الاسم مطلوب");
    const out: CheckedRow = { ...r, data, errors: e, notes };
    const nid = latinDigits(v["national_id"]).replace(/\D/g, "");
    if (nid && !isNationalId(nid)) e.push("رقم الهوية 10 أرقام يبدأ بـ1 أو 2");
    data["national_id"] = nid || null;
    if (nid) { if (seenId.has(nid)) e.push("رقم الهوية مكرر في الملف"); seenId.add(nid); }
    if (kind === "students") {
      if (!nid) e.push("رقم الهوية مطلوب (يدخل به الطالب)");
      const cs = normCsmart(v["csmart_no"]);
      if (cs === "") e.push("رقم C‑Smart: أرقام أو حروف لاتينية أو شرطة فقط");
      data["csmart_no"] = cs || null;
      if (cs) {
        const prev = seenCs.get(csmartKey(cs));
        if (prev === cs) e.push("رقم C‑Smart مكرر في الملف");
        else if (prev) e.push(`تعارض: رقم C‑Smart «${cs}» يختلف عن «${prev}» في الملف بحالة الحروف فقط — لا يُعدّان رقمًا واحدًا ولا رقمين مختلفين حتى تُعتمد مواصفات C‑Smart`);
        else seenCs.set(csmartKey(cs), cs);
      }
      const byNid = nid ? lk.existingIds.get(nid) : undefined, byCs = cs ? lk.existingCsmart?.get(csmartKey(cs)) : undefined;
      const stored = byNid ? lk.rowCsmart?.get(byNid) : undefined;
      const byCsStored = byCs ? lk.rowCsmart?.get(byCs) : undefined;
      // never re-point an existing link or merge two students: any mismatch is a conflict for manual review
      if (byCs && cs && byCsStored && byCsStored !== cs) e.push(`تعارض: رقم C‑Smart «${cs}» يطابق الرقم المسجل «${byCsStored}» بعد تجاهل حالة الحروف فقط — يُرفض حتى تُعتمد مواصفات C‑Smart، صحّح الرقم ليطابق المسجل حرفيًا`);
      else if (byCs && byCs !== byNid) e.push(byNid ? "تعارض: رقم C‑Smart مسجل لطالب آخر غير صاحب الهوية — راجع السجلين يدويًا" : "تعارض: رقم C‑Smart مسجل لطالب آخر بهوية مختلفة — راجع يدويًا");
      else if (byNid && cs && stored && stored !== cs) e.push(`تعارض: الطالب مسجل برقم C‑Smart مختلف (${stored}) — لن يُستبدل تلقائيًا`);
      if (byNid) { out.existingId = byNid; notes.push(cs && !stored ? "الطالب موجود مسبقًا — سيُضاف رقم C‑Smart لسجله" : "الطالب موجود مسبقًا — لن يُكرر، تُستكمل بقية الخطوات"); }
      if (!cs) notes.push("ينقص رقم C‑Smart — لن يتمكن الطالب من الدخول حتى يُضاف");
      const bd = parseDate(v["birth_date"] ?? ""); if (bd.err) e.push(`تاريخ الميلاد: ${bd.err}`); data["birth_date"] = bd.v;
      if (bd.hijri) notes.push(`تاريخ الميلاد هجري «${(v["birth_date"] ?? "").trim()}» حُوّل إلى ${bd.v} (تقويم أم القرى)`);
      const gn = norm(v["gender"]); data["gender"] = !gn ? null : ["ذكر", "male", "m"].map(norm).includes(gn) ? "male" : ["انثي", "أنثى", "female", "f"].map(norm).includes(gn) ? "female" : null;
      if (gn && !data["gender"]) e.push("الجنس: ذكر أو أنثى");
      const g = v["grade"] ?? "", s = v["section"] ?? "";
      if (g || s) {
        const key = `${norm(g)}|${norm(s)}`;
        const chosen = lk.sectionChoice?.get(key);
        const sec = lk.sections.get(key) ?? (chosen ? [...lk.sections.values()].find((x) => x.id === chosen) : undefined);
        if (chosen && sec) notes.push(`الشعبة «${g} / ${s}» قوبلت باختيارك`);
        if (!g || !s) e.push("الصف والفصل معًا مطلوبان للتسكين");
        else if (!sec) { out.unmatchedSection = { key, grade: g, section: s }; e.push(`الشعبة «${g} / ${s}» لا تطابق شعبة في السنة الحالية — اختر الشعبة المقابلة أعلى المعاينة`); }
        else if (!out.existingId) {
          const k = sec.id; const n = (planned.get(k) ?? 0) + 1; planned.set(k, n);
          if (sec.capacity != null && sec.used + n > sec.capacity) e.push(`الشعبة ممتلئة (السعة ${sec.capacity})`);
          out.section = { id: sec.id, year_id: sec.year_id };
        } else out.section = { id: sec.id, year_id: sec.year_id };
      }
      const gName = (v["guardian_name"] ?? "").trim(), gPhoneRaw = v["guardian_phone"] ?? "", gId = latinDigits(v["guardian_id"]).replace(/\D/g, "");
      if (gName || gPhoneRaw || gId) {
        const gp = normPhone(gPhoneRaw);
        if (!gName) e.push("اسم ولي الأمر مطلوب");
        // name + ID required; the mobile is optional (without it the guardian's login waits as «بيانات ناقصة»)
        if (gPhoneRaw.trim() && !gp) e.push("جوال ولي الأمر غير صالح (05XXXXXXXX)");
        if (!gId) e.push("هوية ولي الأمر مطلوبة");
        else if (!isNationalId(gId)) e.push("هوية ولي الأمر 10 أرقام");
        data["guardian_name"] = gName || null; data["guardian_phone"] = gp; data["guardian_id"] = gId || null;
        const rel = norm(v["relationship"]); data["relationship"] = rel ? REL[rel] ?? null : "father";
        if (rel && !data["relationship"]) e.push("صلة القرابة: أب / أم / أخ / أخت / أخرى");
      }
    } else {
      const ph = normPhone(v["phone"]);
      if (!ph) e.push("الجوال مطلوب بصيغة 05XXXXXXXX (يدخل به المعلم برمز واتساب)");
      data["phone"] = ph;
      if (ph) { if (seenPhone.has(ph)) e.push("الجوال مكرر في الملف"); seenPhone.add(ph); }
      const byId = nid ? lk.existingIds.get(nid) : undefined, byPhone = ph ? lk.existingPhones.get(ph) : undefined;
      if (!byId && byPhone && nid && lk.rowNid?.get(byPhone) && lk.rowNid.get(byPhone) !== nid) e.push("تعارض: الجوال مسجل لمعلم برقم هوية مختلف — راجع يدويًا");
      if (byId && byPhone && byId !== byPhone) e.push("تعارض: رقم الهوية لمعلم والجوال لمعلم آخر — راجع السجلين يدويًا");
      const conflict = (byId && byPhone && byId !== byPhone) || (!byId && byPhone && nid && lk.rowNid?.get(byPhone) && lk.rowNid.get(byPhone) !== nid);
      const ex = conflict ? undefined : byId ?? byPhone;
      if (ex) { out.existingId = ex; notes.push("المعلم موجود مسبقًا — لن يُكرر، يُستكمل الحساب"); }
      const em = (v["email"] ?? "").trim().toLowerCase();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) e.push("بريد غير صالح");
      data["email"] = em || null; data["specialization"] = (v["specialization"] ?? "").trim() || null;
      const dn = norm(v["department"]);
      if (dn) { out.department_id = lk.departments.get(dn) ?? null; if (!out.department_id) e.push("القسم غير موجود"); }
    }
    return out;
  });
}
