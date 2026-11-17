// Stage 5 «نواتج التعلم» — client model. The server (sv5_*) decides scope, checks every row and computes all numbers;
// this file only maps spreadsheet columns, labels values and keeps «لا توجد بيانات» / «صفر» / «لم يُقس» distinct.
export type LoView = "measures" | "compare" | "mastery" | "actions";
export const LO_VIEWS: Record<LoView, string> = { measures: "المقاييس والنتائج", compare: "المقارنة بين قياسين", mastery: "مستويات الإتقان", actions: "إجراءات التحسين" };
export const LO_KIND: Record<string, string> = { school: "اختبار مدرسي", diagnostic: "تشخيصي", formative: "تكويني", final: "ختامي", nafes: "نافس", qudrat: "القدرات", tahsili: "التحصيلي" };
export const STANDARD_KINDS = ["nafes", "qudrat", "tahsili"];
export const ORIGIN: Record<string, string> = { system: "اختبار في ركاز (الدرجات المنشورة)", external: "نتائج مدخلة/مستوردة من ملف موثق" };
export const ACTION: Record<string, string> = { insert: "سيُضاف", replace: "سيُستبدل (يُحفظ السابق في السجل)", keep: "موجود مسبقًا — يبقى كما هو", skip: "بلا نتيجة — يبقى «لم يُقس»", reject: "مرفوض" };
export const RES_STATUS: Record<string, string> = { present: "حاضر", absent: "غائب", exempt: "معفى", missing: "لا نتيجة" };

export type Counts = { targeted: number; present: number; absent: number; exempt: number; missing: number };
export type Measure = { id: string; school_id: string; school: string; origin: "system" | "external"; kind: string; homework_id: string | null; title: string; source_note: string; measured_on: string;
  year_id: string; year: string; term_id: string | null; term: string | null; period_label: string; stage: string | null; grade_id: string; grade: string; section_ids: string[]; sections: string[];
  subject_id: string; subject: string; course_id: string | null; teacher_id: string | null; teacher: string | null; scale_max: number; scale_note: string | null; items_source: string | null; items: number;
  creator: string; rev: number; updated_at: string; counts: Counts; can_edit: boolean };
export type Item = { code: string; label?: string; skill: string; outcome_code?: string | null; max_score: number; mcq: boolean; options: string[]; answer_key: string | null };
export type MeasureDetail = Measure & { item_list: Item[]; imports: { file: string; total: number; imported: number; failed: number; duplicates: number; existing: number; replaced: number; by: string; at: string }[] };
export type Refs = { schools: { id: string; name: string }[]; years: { id: string; school_id: string; name: string; current: boolean }[]; terms: { id: string; school_id: string; year_id: string; name: string }[];
  grades: { id: string; school_id: string; name: string; stage: string }[]; sections: { id: string; school_id: string; grade_id: string; year_id: string; name: string }[];
  subjects: { id: string; school_id: string; name: string }[]; courses: { id: string; school_id: string; subject_id: string; section_id: string; year_id: string; teacher: string | null }[];
  tests: { id: string; school_id: string; title: string; max_score: number; status: string; used: boolean }[]; mastery: Mastery[] };
export type Mastery = { id: string; title: string; version: number; levels: { label: string; min_pct: number }[]; published_at: string | null; status?: string; note?: string | null; creator?: string; editor?: string; publisher?: string | null; rev?: number; can_publish?: boolean; version_of?: string | null };
export type Analysis = Counts & { scale_max: number; outside: number; mean: number | null; mean_pct: number | null; median: number | null; min: number | null; max: number | null; small_sample: boolean;
  distribution: { from: number; to: number; n: number }[]; by_section: { section: string; targeted: number; present: number; mean_pct: number | null }[];
  mastery: { title: string; version: number; published_at: string; levels: { label: string; min_pct: number; n: number }[] } | null; mapping: string | null;
  skills: { skill: string; items: number; students: number; mean_pct: number | null }[] | null;
  items: { code: string; label: string; skill: string; mcq: boolean; key: string | null; answered: number; p: number | null; discrimination: number | null; options: Record<string, number> | null }[] | null };
export type Compare = { a: Side; b: Side; comparable: boolean; reasons: string[]; warnings: string[]; point_diff: number | null; pct_change: number | null; paired: number; paired_point_diff: number | null };
type Side = { id: string; title: string; kind: string; measured_on: string; period: string; scale_max: number; present: number; mean: number | null };
export type PreviewRow = { row: number; student: string | null; status: string | null; score: number | null; error: string | null; warning: string | null; existing: boolean; existing_score: number | null; existing_status: string | null; action: string };
export type Preview = { fp: string; rows: PreviewRow[]; summary: { total: number; insert: number; replace: number; keep: number; skip: number; reject: number; duplicates: number; warnings: number } };

/** Column roles. Names are only a check: a student is matched by national ID and/or C-Smart number. */
export type Field = "skip" | "national_id" | "csmart_no" | "name" | "score" | "status" | `item:${string}`;
export const FIELD_LABEL: Record<string, string> = { skip: "تجاهل العمود", national_id: "رقم الهوية", csmart_no: "رقم سي سمارت", name: "الاسم (للتحقق فقط)", score: "الدرجة", status: "الحالة (حاضر/غائب/معفى)" };
const norm = (s: string) => s.replace(/[\s_\-ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase();
export function guessField(header: string, itemCodes: string[]): Field {
  const h = norm(String(header ?? "")); if (!h) return "skip";
  const code = itemCodes.find((c) => norm(c) === h); if (code) return `item:${code}`;
  if (/هويه|سجلمدني|nationalid|^id$|اقامه/.test(h)) return "national_id";
  if (/سيسمارت|csmart|نور|رقمالطالب/.test(h)) return "csmart_no";
  if (/اسم|name/.test(h)) return "name";
  if (/درجه|score|مجموع|نتيجه|total/.test(h)) return "score";
  if (/حاله|status|حضور/.test(h)) return "status";
  return "skip";
}
export type ImportRow = { row: number; national_id?: string; csmart_no?: string; name?: string; score?: string; status?: string; items?: Record<string, string> };
const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
/** Builds server rows from a sheet. Row numbers match the spreadsheet (1-based); blank rows are dropped; nothing is guessed. */
export function buildRows(data: unknown[][], headerIdx: number, map: Field[]): ImportRow[] {
  const out: ImportRow[] = [];
  data.slice(headerIdx + 1).forEach((r, i) => {
    if (!r || r.every((v) => cell(v) === "")) return;
    const row: ImportRow = { row: headerIdx + i + 2 };
    map.forEach((f, ci) => { const v = cell(r[ci]); if (f === "skip" || v === "") return;
      if (f.startsWith("item:")) { row.items = { ...(row.items ?? {}), [f.slice(5)]: v }; } else (row as Record<string, unknown>)[f] = v; });
    out.push(row);
  });
  return out;
}
/** A column map is usable only with an identity column and a score or status column, each used once. */
export function mapProblems(map: Field[]): string[] {
  const p: string[] = []; const used = map.filter((f) => f !== "skip");
  if (!used.includes("national_id") && !used.includes("csmart_no")) p.push("حدد عمود رقم الهوية أو رقم سي سمارت؛ لا يُطابق الطالب بالاسم وحده");
  if (!used.includes("score") && !used.includes("status")) p.push("حدد عمود الدرجة أو الحالة");
  if (new Set(used).size !== used.length) p.push("عمود واحد لكل حقل");
  return p;
}
/** «لم يُقس» when nobody was measured, never a zero mean. */
export const meanText = (a: Pick<Analysis, "present" | "mean" | "mean_pct" | "scale_max">) => (a.present === 0 || a.mean === null ? "لم يُقس" : `${a.mean} من ${a.scale_max} (${a.mean_pct}٪)`);
/** Count cell: «لا توجد بيانات» when nothing is targeted, a real 0 otherwise. */
export const countText = (n: number, targeted: number) => (targeted === 0 ? "لا توجد بيانات" : String(n));
export const pctChangeText = (c: Compare) => (!c.comparable ? "غير قابل للمقارنة" : c.pct_change === null ? "لا يُحسب (المتوسط الأول صفر)" : `${c.pct_change > 0 ? "+" : ""}${c.pct_change}٪`);
export const TEMPLATE_HEAD = ["رقم الهوية", "رقم سي سمارت", "الاسم", "الدرجة", "الحالة"];
