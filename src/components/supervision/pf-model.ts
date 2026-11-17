// Professional portfolio (sv5_pf_*) — client model. Every rule is enforced by the server; these helpers only group and report permitted rows.
import type { SvSearch } from "./model";

export const PF_DOMAIN: Record<string, string> = { planning: "التخطيط للتعلم", instruction: "التدريس وإدارة الصف", assessment: "التقويم ومتابعة التعلم", outcomes: "تحسين نواتج التعلم", pd: "التطوير المهني", community: "التعاون والمجتمع المهني" };
export const PF_STATUS: Record<string, string> = { proposed: "بانتظار التحقق", returned: "أُعيد للمعلم", verified: "متحقق منه", withdrawn: "مسحوب" };
export const PF_SOURCE: Record<string, string> = { record: "سجل إشرافي معتمد", pd_session: "حضور برنامج تطوير", dev_plan: "خطة تطوير مهني", action: "إجراء تحسين" };
export const PF_LOG: Record<string, string> = { propose: "اقتراح", edit: "تعديل", repropose: "إعادة اقتراح", return: "إعادة للمعلم", verify: "تحقق", withdraw: "سحب" };
export const PF_NOTE = "الملف المهني يعرض عمل المعلم المعتمد والموثّق كما هو في مصادره، ولا يُعدّ تقييمًا وظيفيًا. عدد العناصر لا يدل على جودة الأداء.";
export const NO_YEAR = "خارج الأعوام الدراسية المسجّلة";
export const NO_TERM = "دون فصل مسجّل";

export type PfSource = { title: string; date: string; detail: string; hours?: number };
export type PfItem = { id: string; school_id: string; school: string; teacher_id: string; teacher: string; source_kind: string; source_id: string; source: PfSource; source_date: string; year: string | null; term: string | null; domain: string; title: string; reflection: string; status: string; review_note: string | null; verifier: string | null; verified_at: string | null; rev: number; updated_at: string; is_teacher: boolean; can_edit: boolean; can_review: boolean; can_open: boolean };
export type PfCandidate = { kind: string; id: string; source: PfSource; year?: string | null; term?: string | null };
export type PfFilter = { teacher: string; year: string; term: string; domain: string; status: string };

export function filterPf(items: PfItem[], f: PfFilter): PfItem[] {
  return items.filter((x) => (!f.teacher || x.teacher_id === f.teacher) && (!f.year || (x.year ?? NO_YEAR) === f.year) && (!f.term || (x.term ?? NO_TERM) === f.term) && (!f.domain || x.domain === f.domain) && (f.status ? x.status === f.status : x.status !== "withdrawn"));
}

export type PfGroup = { year: string; terms: { term: string; domains: { domain: string; items: PfItem[] }[] }[] };
/** Year (newest first) → term → domain (catalog order). */
export function groupPf(items: PfItem[]): PfGroup[] {
  const order = Object.keys(PF_DOMAIN); const years = new Map<string, Map<string, Map<string, PfItem[]>>>();
  for (const x of items) {
    const y = x.year ?? NO_YEAR; const t = x.term ?? NO_TERM;
    const ty = years.get(y) ?? new Map(); years.set(y, ty); const dm = ty.get(t) ?? new Map(); ty.set(t, dm); const l = dm.get(x.domain) ?? []; dm.set(x.domain, l); l.push(x);
  }
  const ys = [...years.keys()].sort((a, b) => (a === NO_YEAR ? 1 : b === NO_YEAR ? -1 : b.localeCompare(a, "ar")));
  return ys.map((y) => { const ty = years.get(y)!; const termDate = (t: string) => [...ty.get(t)!.values()].flat().reduce((m, i) => (i.source_date < m ? i.source_date : m), "9999");
    return { year: y, terms: [...ty.keys()].sort((a, b) => (a === NO_TERM ? 1 : b === NO_TERM ? -1 : termDate(a).localeCompare(termDate(b)))).map((t) => ({ term: t, domains: [...ty.get(t)!.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([domain, l]) => ({ domain, items: [...l].sort((a, b) => a.source_date.localeCompare(b.source_date)) })) })) }; });
}

/** Report rows in the same order as the screen; unverified items stay labelled as such. */
export function pfRows(items: PfItem[]): string[][] {
  return groupPf(items).flatMap((g) => g.terms.flatMap((t) => t.domains.flatMap((d) => d.items.map((x) => [x.teacher, g.year, t.term, PF_DOMAIN[x.domain] ?? x.domain, x.title, `${PF_SOURCE[x.source_kind] ?? x.source_kind}: ${x.source.detail}`, x.source_date, PF_STATUS[x.status] ?? x.status, x.verifier ?? "—", x.reflection || "—"]))));
}
export const PF_HEADERS = ["المعلم", "العام", "الفصل", "المجال", "العنصر", "المصدر", "التاريخ", "الحالة", "تحقق منه", "تأمل المعلم"];

/** Where the original source opens (only shown when the server says can_open). */
export function sourceLink(x: Pick<PfItem, "source_kind" | "source_id">): SvSearch | null {
  if (x.source_kind === "record") return { tab: "records", id: x.source_id };
  if (x.source_kind === "dev_plan") return { tab: "pd", pd: "devplans", id: x.source_id };
  if (x.source_kind === "action") return { tab: "outcomes", lo: "actions", id: x.source_id };
  return null;
}
