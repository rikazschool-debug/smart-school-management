// Shared labels/helpers for the grades section. Calculations live in Postgres (_gb_total); the UI only mirrors them.
export const GB_STATUS: Record<string, string> = {
  not_started: "لم يُفتح", draft: "مسودة", submitted: "بانتظار المراجعة", returned: "معاد للمعلم",
  reviewed: "بانتظار الاعتماد", approved: "معتمد (مقفل)", published: "منشور",
};
export const GB_TONE: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground", draft: "bg-muted text-foreground", submitted: "bg-warning/15 text-warning-foreground",
  returned: "bg-destructive/10 text-destructive", reviewed: "bg-primary/10 text-primary", approved: "bg-success/15 text-success", published: "bg-success/20 text-success",
};
export const ENTRY_STATUS: Record<string, string> = { missing: "لم تُرصد", score: "درجة", absent: "غائب", exempt: "معفى" };
export const PLAN_STATUS: Record<string, string> = { draft: "مسودة", approved: "معتمدة", retired: "موقوفة" };
export const PERIOD_STATUS: Record<string, string> = { open: "مفتوحة", closed: "مغلقة", locked: "مقفلة" };
export const CORR_STATUS: Record<string, string> = { pending: "معلّق", approved: "معتمد", rejected: "مرفوض" };
export const EVENT_LABEL: Record<string, string> = {
  opened: "فُتح السجل", entries_saved: "حُفظت درجات", homework_linked: "رُبطت درجات واجبات", submitted: "أُرسل للمراجعة",
  reviewed: "قُبلت المراجعة", returned: "أُعيد للمعلم", approved: "اعتُمد وقُفل", published: "نُشر للطلاب والأسر",
  reopened: "أُعيد الفتح", correction_requested: "طُلب تصحيح", correction_applied: "طُبق تصحيح", correction_rejected: "رُفض تصحيح",
};

/** Contribution of one item = score / max × weight (weight applied once). Mirrors _gb_total for previews only. */
export function contribution(score: number, max: number, weight: number) {
  return (score / max) * weight;
}

/** Spreadsheet cell → entry. "غ" absent, "م" exempt, number = score, blank = untouched. */
export function parseCell(v: unknown): { status: string; score?: number } | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "غ" || s === "غائب") return { status: "absent" };
  if (s === "م" || s === "معفى") return { status: "exempt" };
  const n = Number(s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (Number.isNaN(n)) throw new Error(`قيمة غير صالحة: ${s}`);
  return { status: "score", score: n };
}

Object.assign(EVENT_LABEL, { exception_granted: "مُنح استثناء موعد", exception_revoked: "أُلغي استثناء موعد", note_saved: "حُفظت ملاحظة للأسرة" });

export type PlanLike = { total: number | string; decimals: number; rounding: string; absent_policy: string; exempt_policy: string };
export type ItemLike = { id: string; max_score: number | string; weight: number | string };
export type CellLike = { status: string; score?: number | string | null };

export function roundAs(x: number, dec: number, mode: string) {
  const f = 10 ** dec;
  if (mode === "down") return Math.trunc(x * f) / f;
  if (mode === "up") return Math.ceil(x * f - 1e-9) / f;
  return Math.round((x + Number.EPSILON) * f) / f;
}

/** Preview of one student's total with unsaved values. Mirrors _gb_total exactly; the server value is authoritative.
 *  null = incomplete: a missing cell never counts as zero; absent counts as zero only under the "zero" policy;
 *  exempt redistributes declared weights only under the "redistribute" policy. */
export function previewTotal(plan: PlanLike, items: ItemLike[], cell: (itemId: string) => CellLike | undefined): number | null {
  let contrib = 0, used = 0;
  for (const it of items) {
    const c = cell(it.id); const w = Number(it.weight);
    if (!c || c.status === "missing") return null;
    if (c.status === "score") {
      if (c.score === "" || c.score == null || Number.isNaN(Number(c.score))) return null;
      contrib += (Number(c.score) / Number(it.max_score)) * w; used += w;
    } else if (c.status === "absent") { if (plan.absent_policy === "zero") used += w; else return null; }
    else if (c.status === "exempt") { if (plan.exempt_policy !== "redistribute") return null; }
  }
  if (used === 0) return null;
  if (plan.exempt_policy === "redistribute") contrib = (contrib * Number(plan.total)) / used;
  return roundAs(contrib, plan.decimals, plan.rounding);
}

export type ImportItem = { id: string; name: string; max_score: number | string };
export type ImportRow = { student_id: string; item_id: string; status: string; score: number | null };
export type ImportError = { line: number; student: string; item: string; message: string };

/** Validates a course template (AOA, header row starts with "المعرّف"). The file can never choose the course, the item maximum or the user:
 *  only rows of listed students and listed item columns are read. Formula cells are reported by the caller (readSheet). */
export function checkGradeImport(aoa: unknown[][], students: { id: string; name: string; active: boolean }[], items: ImportItem[]) {
  const hi = aoa.findIndex((r) => String(r[0] ?? "").trim() === "المعرّف");
  if (hi < 0) throw new Error("القالب غير صالح: لم يُعثر على عمود المعرّف");
  const byId = new Map(students.map((s) => [s.id, s]));
  const rows: ImportRow[] = []; const errors: ImportError[] = []; const seen = new Map<string, number>();
  aoa.slice(hi + 1).forEach((r, n) => {
    const line = hi + n + 2; const sid = String(r[0] ?? "").trim();
    if (!sid) return;
    const st = byId.get(sid);
    if (!st || !st.active) return void errors.push({ line, student: String(r[1] ?? sid), item: "—", message: "طالب غير مستهدف في هذا المقرر" });
    if (seen.has(sid)) return void errors.push({ line, student: st.name, item: "—", message: `الطالب مكرر (سبق في السطر ${seen.get(sid)})` });
    seen.set(sid, line);
    items.forEach((it, j) => {
      try {
        const c = parseCell(r[j + 2]); if (!c) return;
        if (c.status === "score" && (c.score! < 0 || c.score! > Number(it.max_score))) throw new Error(`خارج النطاق 0–${it.max_score}`);
        rows.push({ student_id: sid, item_id: it.id, status: c.status, score: c.score ?? null });
      } catch (e) { errors.push({ line, student: st.name, item: it.name, message: (e as Error).message }); }
    });
  });
  return { rows, errors };
}

export async function fileKey(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
