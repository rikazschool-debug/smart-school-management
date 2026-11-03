// Pure helpers for student/teacher Excel import and single add (shared rules, unit-tested in people-import.test.ts).
// Reads ministry-style reports (titles, merged cells, two-line headers, one sheet per section) and the blank Rikaz templates.
import * as XLSX from "xlsx";

export type PKind = "students" | "teachers";
export type Field = { key: string; label: string; required?: boolean; hint: string; syn: string[] };

export const FIELDS: Record<PKind, Field[]> = {
  students: [
    { key: "full_name", label: "اسم الطالب", required: true, hint: "مطلوب — الاسم بالعربية", syn: ["اسم الطالب", "الاسم الكامل", "الاسم", "الإسم", "اسم الطالبة"] },
    { key: "national_id", label: "رقم الهوية", required: true, hint: "مطلوب — 10 أرقام، يُكتب نصًا", syn: ["رقم الهوية", "رقمها", "الهوية", "السجل المدني", "رقم السجل المدني", "رقم الهوية/الإقامة"] },
    { key: "birth_date", label: "تاريخ الميلاد", hint: "ميلادي YYYY-MM-DD أو DD/MM/YYYY", syn: ["تاريخ الميلاد", "تاريخ الولادة", "date of birth"] },
    { key: "gender", label: "الجنس", hint: "ذكر / أنثى", syn: ["الجنس", "النوع"] },
    { key: "grade", label: "الصف", hint: "اسم الصف كما في ركاز", syn: ["الصف"] },
    { key: "section", label: "الفصل", hint: "اسم الشعبة كما في ركاز", syn: ["الفصل", "الشعبة"] },
    { key: "guardian_name", label: "اسم ولي الأمر", hint: "مطلوب إذا أُدخل جوال ولي الأمر", syn: ["اسم ولي الأمر", "ولي الأمر", "اسم ولي الامر"] },
    { key: "guardian_id", label: "هوية ولي الأمر", hint: "اختياري — 10 أرقام", syn: ["هوية ولي الأمر", "رقم هوية ولي الأمر", "هوية ولي الامر"] },
    { key: "guardian_phone", label: "جوال ولي الأمر", hint: "05XXXXXXXX — يدخل به ولي الأمر برمز واتساب", syn: ["جوال ولي الأمر", "رقم جوال ولي الأمر", "جوال ولي الامر"] },
    { key: "relationship", label: "صلة القرابة", hint: "أب / أم / أخ / أخت / أخرى", syn: ["صلة القرابة", "القرابة", "صلة ولي الأمر"] },
  ],
  teachers: [
    { key: "full_name", label: "الإسم", required: true, hint: "مطلوب", syn: ["الإسم", "الاسم", "الاسم الكامل", "اسم المعلم", "اسم المعلمة"] },
    { key: "national_id", label: "رقم الهوية", hint: "اختياري — 10 أرقام، لمنع التكرار", syn: ["رقم الهوية", "الهوية", "السجل المدني"] },
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

/** Saudi mobile → 9665XXXXXXXX; null when invalid. Same rule as SQL norm_phone. */
export function normPhone(p: unknown): string | null {
  let d = String(p ?? "").replace(/\D/g, "");
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

/** Gregorian date → YYYY-MM-DD; Hijri or invalid → error text. */
export function parseDate(s: string): { v: string | null; err?: string } {
  const t = s.trim();
  if (!t) return { v: null };
  let y: number, m: number, d: number;
  let mt = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (mt) { y = +mt[1]!; m = +mt[2]!; d = +mt[3]!; }
  else if ((mt = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +mt[1]!; m = +mt[2]!; y = +mt[3]!; }
  else return { v: null, err: "صيغة التاريخ غير مفهومة" };
  if (y >= 1300 && y <= 1500) return { v: null, err: "التاريخ هجري؛ أدخل الميلادي" };
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
export function parseWorkbook(buf: ArrayBuffer, kind: PKind, override?: Record<string, number>): Parsed {
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
      if (!values["full_name"] || !HAS_AR.test(values["full_name"])) continue;
      if (fields.some((f) => norm(values[f.key]) === norm(f.label))) continue; // repeated header line on a printed page
      const formulas = fields.filter((f) => map[f.key] !== undefined && g.formula[r]![map[f.key]!]).map((f) => f.label);
      rows.push({ sheet: name, line: r + 1, values, formulas });
    }
  }
  if (!sheets) problems.push("لم يُعثر على صف عناوين معروف (يلزم عمود الاسم وعمود آخر على الأقل)");
  return { rows, mapping, headers, sheets, problems };
}

/** Blank template: column names only, text format so IDs and phones keep leading zeros. No personal data. */
export function templateBook(kind: PKind): XLSX.WorkBook {
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
};
export type CheckedRow = RawRow & {
  data: Record<string, string | null>; errors: string[]; notes: string[];
  existingId?: string; section?: { id: string; year_id: string } | null; department_id?: string | null;
};

const REL: Record<string, string> = { [norm("أب")]: "father", [norm("الأب")]: "father", [norm("والد")]: "father", [norm("أم")]: "mother", [norm("الأم")]: "mother", [norm("والدة")]: "mother", [norm("أخ")]: "brother", [norm("أخت")]: "sister", [norm("أخرى")]: "other" };

/** Same rules for import rows and the single-add form. */
export function validate(kind: PKind, rows: RawRow[], lk: Lookups): CheckedRow[] {
  const seenId = new Set<string>(), seenPhone = new Set<string>();
  const planned = new Map<string, number>();
  return rows.map((r) => {
    const v = r.values; const e: string[] = []; const notes: string[] = [];
    const data: Record<string, string | null> = { full_name: v["full_name"]!.replace(/\s+/g, " ").trim() };
    if (r.formulas.length) e.push(`خلايا صيغ مرفوضة: ${r.formulas.join("، ")}`);
    if (!data["full_name"]) e.push("الاسم مطلوب");
    const out: CheckedRow = { ...r, data, errors: e, notes };
    const nid = (v["national_id"] ?? "").replace(/\D/g, "");
    if (nid && !isNationalId(nid)) e.push("رقم الهوية 10 أرقام يبدأ بـ1 أو 2");
    data["national_id"] = nid || null;
    if (nid) { if (seenId.has(nid)) e.push("رقم الهوية مكرر في الملف"); seenId.add(nid); }
    if (kind === "students") {
      if (!nid) e.push("رقم الهوية مطلوب (يدخل به الطالب)");
      if (nid && lk.existingIds.has(nid)) { out.existingId = lk.existingIds.get(nid)!; notes.push("الطالب موجود مسبقًا — لن يُكرر، تُستكمل بقية الخطوات"); }
      const bd = parseDate(v["birth_date"] ?? ""); if (bd.err) e.push(`تاريخ الميلاد: ${bd.err}`); data["birth_date"] = bd.v;
      const gn = norm(v["gender"]); data["gender"] = !gn ? null : ["ذكر", "male", "m"].map(norm).includes(gn) ? "male" : ["انثي", "أنثى", "female", "f"].map(norm).includes(gn) ? "female" : null;
      if (gn && !data["gender"]) e.push("الجنس: ذكر أو أنثى");
      const g = v["grade"] ?? "", s = v["section"] ?? "";
      if (g || s) {
        const sec = lk.sections.get(`${norm(g)}|${norm(s)}`);
        if (!g || !s) e.push("الصف والفصل معًا مطلوبان للتسكين");
        else if (!sec) e.push(`الشعبة «${g} / ${s}» غير موجودة في السنة الحالية`);
        else if (!out.existingId) {
          const k = sec.id; const n = (planned.get(k) ?? 0) + 1; planned.set(k, n);
          if (sec.capacity != null && sec.used + n > sec.capacity) e.push(`الشعبة ممتلئة (السعة ${sec.capacity})`);
          out.section = { id: sec.id, year_id: sec.year_id };
        } else out.section = { id: sec.id, year_id: sec.year_id };
      }
      const gName = (v["guardian_name"] ?? "").trim(), gPhoneRaw = v["guardian_phone"] ?? "", gId = (v["guardian_id"] ?? "").replace(/\D/g, "");
      if (gName || gPhoneRaw || gId) {
        const gp = normPhone(gPhoneRaw);
        if (!gName) e.push("اسم ولي الأمر مطلوب");
        if (!gp) e.push("جوال ولي الأمر غير صالح (05XXXXXXXX)");
        if (gId && !isNationalId(gId)) e.push("هوية ولي الأمر 10 أرقام");
        data["guardian_name"] = gName || null; data["guardian_phone"] = gp; data["guardian_id"] = gId || null;
        const rel = norm(v["relationship"]); data["relationship"] = rel ? REL[rel] ?? null : "father";
        if (rel && !data["relationship"]) e.push("صلة القرابة: أب / أم / أخ / أخت / أخرى");
      }
    } else {
      const ph = normPhone(v["phone"]);
      if (!ph) e.push("الجوال مطلوب بصيغة 05XXXXXXXX (يدخل به المعلم برمز واتساب)");
      data["phone"] = ph;
      if (ph) { if (seenPhone.has(ph)) e.push("الجوال مكرر في الملف"); seenPhone.add(ph); }
      const ex = (nid && lk.existingIds.get(nid)) || (ph && lk.existingPhones.get(ph)) || undefined;
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
