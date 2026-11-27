// Shared test-fixture adapter for academic setup rows (years/terms/stages/grades/sections).
// Production rules (guard triggers) require: owner session for these rows, stage/grade names from the approved
// catalogue, and a term on every section. Old fixtures used free names ("متوسط", "الأول") and the service role;
// this adapter maps them to approved names and routes the insert through the org owner — business rules are untouched.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const ACAD = new Set(["academic_years", "terms", "stages", "grades", "sections"]);
const STAGE: Record<string, string> = { "متوسط": "المتوسطة", "ابتدائي": "الابتدائية", "ثانوي": "الثانوية" };
const ORD: Record<string, string> = { "الأول": "أول", "الثاني": "ثاني", "الثالث": "ثالث", "الرابع": "رابع", "الخامس": "خامس", "السادس": "سادس" };
export const normStage = (n: string) => STAGE[n.trim()] ?? n;
export const normGrade = (n: string) => {
  const base = n.trim().replace(/\s+(الابتدائي|ابتدائي|المتوسط|متوسط|الثانوي|ثانوي)$/, "");
  return ORD[base] ?? base;
};
/** Academic tables go through the owner session; everything else keeps the caller's client. */
export const acadClient = (table: string, other: Any, owner: Any): Any => (ACAD.has(table) ? owner : other);
const terms = new Map<string, string>();
async function termFor(owner: Any, school: string, year: string): Promise<string> {
  const k = school + ":" + year; const hit = terms.get(k); if (hit) return hit;
  const ex = await owner.from("terms").select("id").eq("school_id", school).eq("year_id", year).limit(1);
  let id: string | undefined = ex.data?.[0]?.id;
  if (!id) {
    const y = (await owner.from("academic_years").select("start_date,end_date").eq("id", year).single()).data;
    const r = await owner.from("terms").insert({ school_id: school, year_id: year, name: "الفصل الدراسي الأول", ...(y ? { start_date: y.start_date, end_date: y.end_date } : {}) }).select("id").single();
    if (r.error) throw new Error("terms: " + r.error.message);
    id = r.data.id as string;
  }
  terms.set(k, id!); return id!;
}
/** Returns the row with approved names and, for sections, a term of the same year. */
export async function acadRow(owner: Any, table: string, row: Record<string, Any>): Promise<Record<string, Any>> {
  const r = { ...row };
  if (table === "stages" && typeof r["name"] === "string") r["name"] = normStage(r["name"]);
  if (table === "grades" && typeof r["name"] === "string") r["name"] = normGrade(r["name"]);
  if (table === "sections" && !r["term_id"] && r["year_id"] && r["school_id"]) r["term_id"] = await termFor(owner, r["school_id"], r["year_id"]);
  return r;
}
