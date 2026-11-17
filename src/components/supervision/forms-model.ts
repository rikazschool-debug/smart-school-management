// Forms library — pure helpers (filters, version comparison, fill progress). Tested in src/test/supervision-forms.test.ts.
import { missingFields, shown, type SvField, type SvForm, type SvSpec } from "./model";

export const DOMAINS: Record<string, string> = { teaching: "التدريس والملاحظة", planning: "التخطيط والمتابعة", pd: "التطوير المهني", outcomes: "نواتج التعلم", meetings: "الاجتماعات والتواصل", reports: "التقارير" };
const KIND: Record<string, { domain: keyof typeof DOMAINS; purpose: string }> = {
  observation: { domain: "teaching", purpose: "زيارة" }, review: { domain: "teaching", purpose: "مراجعة" }, ack: { domain: "teaching", purpose: "اطلاع" },
  plan: { domain: "planning", purpose: "خطة" }, followup: { domain: "planning", purpose: "متابعة" }, action: { domain: "planning", purpose: "متابعة" },
  need: { domain: "pd", purpose: "احتياج" }, pd_plan: { domain: "pd", purpose: "خطة" }, program: { domain: "pd", purpose: "برنامج" }, program_eval: { domain: "pd", purpose: "تقييم" },
  trainer_eval: { domain: "pd", purpose: "تقييم" }, impact: { domain: "pd", purpose: "قياس أثر" }, portfolio: { domain: "pd", purpose: "ملف" },
  analysis: { domain: "outcomes", purpose: "تحليل" }, minutes: { domain: "meetings", purpose: "محضر" }, bulletin: { domain: "meetings", purpose: "نشرة" }, report: { domain: "reports", purpose: "تقرير" },
};
export const formDomain = (kind: string) => KIND[kind]?.domain ?? "reports";
export const formPurpose = (kind: string) => KIND[kind]?.purpose ?? "أخرى";
export const PURPOSES = [...new Set(Object.values(KIND).map((k) => k.purpose))];

export type Approval = "adopted" | "template" | "pending" | "branch";
export const APPROVAL: Record<Approval, string> = { adopted: "معتمد للمؤسسة", template: "قالب غير معتمد للمؤسسة", pending: "مسودة أو قيد المراجعة", branch: "تخصيص فرع" };

/** One card per key: the org's live version first (branch copy shown separately), else the newest template. */
export type FormCard = { key: string; main: SvForm; versions: SvForm[]; pending: SvForm[]; template: SvForm | undefined; newerTemplate: SvForm | undefined; approval: Approval };
export function formCards(all: SvForm[]): FormCard[] {
  const by = new Map<string, SvForm[]>(); for (const f of all) by.set(f.key, [...(by.get(f.key) ?? []), f]);
  return [...by.entries()].map(([key, vs]) => {
    const sorted = [...vs].sort((a, b) => b.version - a.version);
    const template = sorted.find((v) => !v.org_id && v.status === "published");
    const orgPub = sorted.find((v) => v.org_id && !v.school_id && v.status === "published");
    const pending = sorted.filter((v) => v.org_id && (v.status === "draft" || v.status === "review"));
    const main = orgPub ?? sorted.find((v) => v.org_id && v.school_id && v.status === "published") ?? template ?? sorted[0]!;
    const basedOn = orgPub ? vs.find((v) => v.id === orgPub.based_on) : undefined;
    const newerTemplate = orgPub && template && template.id !== orgPub.based_on && (!basedOn || basedOn.org_id || template.version > basedOn.version) ? template : undefined;
    const approval: Approval = orgPub ? "adopted" : main.org_id && main.school_id ? "branch" : pending.length ? "pending" : "template";
    return { key, main, versions: sorted, pending, template, newerTemplate, approval };
  }).sort((a, b) => a.main.title.localeCompare(b.main.title, "ar"));
}

export type FormFilter = { q: string; domain: string; purpose: string; approval: string };
export function filterCards(cards: FormCard[], f: FormFilter): FormCard[] {
  const q = f.q.trim().toLowerCase();
  return cards.filter((c) => (!f.domain || formDomain(c.main.kind) === f.domain) && (!f.purpose || formPurpose(c.main.kind) === f.purpose)
    && (!f.approval || c.approval === f.approval || (f.approval === "pending" && c.pending.length > 0))
    && (!q || `${c.main.title} ${c.main.purpose}`.toLowerCase().includes(q)));
}

/** Usable for new records only when the org (or the branch) has a published copy — never a template. */
export const canUse = (f: SvForm) => !!f.org_id && f.status === "published" && !f.spec.embedded;

// ---- version comparison -------------------------------------------------
export type Change = { kind: "added" | "removed" | "changed"; where: string; detail: string };
const flat = (s: SvSpec) => { const m = new Map<string, { f: SvField; sec: string }>(); for (const sec of s.sections ?? []) for (const f of sec.fields ?? []) m.set(f.key, { f, sec: sec.title }); return m; };
const TYPE: Record<string, string> = { text: "نص قصير", textarea: "نص طويل", date: "تاريخ", datetime: "تاريخ ووقت", number: "رقم", select: "اختيار", goals: "أهداف", actions: "إجراءات", recs: "توصيات", list: "قائمة", indicators: "مؤشرات وصفية" };
export const fieldType = (t: string) => TYPE[t] ?? t;
const list = (a?: string[]) => (a ?? []).join("، ") || "—";
const cond = (f: SvField) => (f.when ? `${f.when.field} = ${f.when.in ? f.when.in.join(" أو ") : f.when.eq}` : "دائمًا");

/** Human-readable differences from version a (older) to b (newer). Pure and order-stable. */
export function diffSpecs(a: SvSpec, b: SvSpec): Change[] {
  const out: Change[] = []; const A = flat(a), B = flat(b);
  const secA = (a.sections ?? []).map((s) => s.title), secB = (b.sections ?? []).map((s) => s.title);
  for (const t of secB) if (!secA.includes(t)) out.push({ kind: "added", where: `قسم «${t}»`, detail: "قسم جديد" });
  for (const t of secA) if (!secB.includes(t)) out.push({ kind: "removed", where: `قسم «${t}»`, detail: "حُذف القسم" });
  for (const [k, { f, sec }] of B) {
    const o = A.get(k);
    if (!o) { out.push({ kind: "added", where: f.label, detail: `حقل جديد (${fieldType(f.type)}) في «${sec}»${f.required ? " — إلزامي" : ""}${f.private ? " — داخلي" : ""}` }); continue; }
    const p = o.f; const d: string[] = [];
    if (p.label !== f.label) d.push(`التسمية: «${p.label}» ← «${f.label}»`);
    if (p.type !== f.type) d.push(`النوع: ${fieldType(p.type)} ← ${fieldType(f.type)}`);
    if (!!p.required !== !!f.required) d.push(f.required ? "أصبح إلزاميًا" : "أصبح اختياريًا");
    if (o.sec !== sec) d.push(`نُقل من «${o.sec}» إلى «${sec}»`);
    if (cond(p) !== cond(f)) d.push(`شرط الظهور: ${cond(p)} ← ${cond(f)}`);
    if (list(p.options) !== list(f.options)) d.push(`الخيارات: ${list(p.options)} ← ${list(f.options)}`);
    if (list(p.levels) !== list(f.levels)) d.push(`مستويات السلّم: ${list(p.levels)} ← ${list(f.levels)}`);
    for (const it of f.items ?? []) { const x = (p.items ?? []).find((y) => y.code === it.code); if (!x) d.push(`بند جديد: ${it.label}`); else if (x.label !== it.label) d.push(`بند «${x.label}» ← «${it.label}»`); }
    for (const it of p.items ?? []) if (!(f.items ?? []).some((y) => y.code === it.code)) d.push(`حُذف البند: ${it.label}`);
    if ((p.evidence ?? "") !== (f.evidence ?? "")) d.push(f.evidence === "required" ? "الشاهد لكل بند أصبح مطلوبًا" : f.evidence ? "الشاهد لكل بند اختياري" : "أُلغي ربط الشاهد بالبند");
    if (!!p.private !== !!f.private) d.push(f.private ? "أصبح داخليًا (لا يظهر للمعلم)" : "أصبح ظاهرًا للمعلم");
    if ((p.help ?? "") !== (f.help ?? "")) d.push("تغيّرت التعليمات");
    if (d.length) out.push({ kind: "changed", where: f.label, detail: d.join("؛ ") });
  }
  for (const [k, { f }] of A) if (!B.has(k)) out.push({ kind: "removed", where: f.label, detail: "حُذف الحقل (السجلات السابقة تحتفظ به)" });
  return out;
}

// ---- fill progress ------------------------------------------------------
export type SecProgress = { title: string; required: number; missing: number };
/** Per-section count of required items still missing, using the same rule as submit (missingFields). */
export function sectionProgress(spec: SvSpec, data: Record<string, unknown>): SecProgress[] {
  const miss = missingFields(spec, data);
  return (spec.sections ?? []).map((sec) => {
    const req = sec.fields.filter((f) => shown(f, data) && (f.required || (f.type === "indicators" && f.evidence === "required")));
    const missing = req.filter((f) => miss.some((m) => m === f.label || m.startsWith(f.label + " ") || m.startsWith(f.label + ":"))).length;
    return { title: sec.title, required: req.length, missing };
  });
}

/** Printed record number: stable, derived from the record id (no separate sequence). */
export const recordNo = (id: string) => `SV-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
/** Fields the given copy may print: teacher copy never includes internal fields. */
export const printable = (spec: SvSpec, teacherCopy: boolean): SvSpec => (teacherCopy ? { ...spec, sections: spec.sections.map((s) => ({ ...s, fields: s.fields.filter((f) => !f.private) })).filter((s) => s.fields.length) } : spec);
