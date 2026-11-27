import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Copy, Eye, Layers, Loader2, Search, Sparkles, Archive, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { sanadAutomationDraft } from "@/lib/sanad-automation.functions";
import { can, fmt, rpc, useOrgSchools, useRegistry, type Any, type AuMe } from "./lib";

const RISK: Record<string, [string, string]> = { low: ["منخفض", "bg-primary/10 text-primary"], medium: ["متوسط", "bg-warning/15 text-warning-foreground"], high: ["مرتفع", "bg-destructive/10 text-destructive"] };
const TPL_ST: Record<string, [string, string]> = { ready: ["معتمد", "bg-primary/10 text-primary"], draft: ["مسودة", "bg-muted text-muted-foreground"], archived: ["مؤرشف", "bg-muted text-muted-foreground"] };
const OPS: Record<string, string> = { eq: "يساوي", neq: "لا يساوي", gt: "أكبر من", lt: "أقل من", gte: "أكبر من أو يساوي", lte: "أقل من أو يساوي", contains: "يحتوي", not_contains: "لا يحتوي", in: "ضمن", not_in: "ليس ضمن", between: "بين", empty: "فارغ", not_empty: "غير فارغ", before: "قبل", after: "بعد", within_days: "خلال أيام" };
const SCHED: Record<string, string> = { daily: "يوميًا", weekly: "أسبوعيًا", monthly: "شهريًا", condition: "عند تحقق الشرط", on_change: "فور تغيّر السجلات", hourly: "كل ساعة", manual: "يدويًا" };
const DOW = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const Pill = ({ s }: { s: [string, string] | undefined }) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s?.[1] ?? ""}`}>{s?.[0]}</span>;

/** Human Arabic outline of a definition (same JSON the engine runs); placeholders show the customisable value names. */
function useOutline(orgId: string) {
  const reg = useRegistry(orgId);
  const vl = useMemo(() => new Map<string, string>(((reg.data?.variables ?? []) as Any[]).map((v) => [`${v.event_code}|${v.key}`, v.label])), [reg.data]);
  const rl = useMemo(() => new Map<string, string>(((reg.data?.recipients ?? []) as Any[]).map((v) => [v.code, v.label])), [reg.data]);
  const val = (v: unknown, params: Any[]) => { const s = typeof v === "string" ? v : JSON.stringify(v); const m = /^\$[pm]:(\w+)$/.exec(s ?? ""); if (m) { const p = params.find((x) => x.key === m[1]); return `«${p?.label ?? m[1]}»`; } return v === true ? "نعم" : v === false ? "لا" : s; };
  const cond = (ev: string, w: Any, params: Any[]): string => !w ? "" : w.all ? (w.all as Any[]).map((x) => cond(ev, x, params)).join(" و ") : w.any ? (w.any as Any[]).map((x) => cond(ev, x, params)).join(" أو ") : `${vl.get(`${ev}|${w.var}`) ?? w.var} ${OPS[w.op] ?? w.op} ${w.value === undefined ? "" : val(w.value, params)}`;
  const who = (st: Any) => [...((st.recipients ?? []) as string[]).map((c) => rl.get(c) ?? c), ...((st.groups ?? []) as Any[]).map((g) => g.by === "record" ? rl.get(g.code) ?? g.code : g.by === "role" ? rl.get(g.role) ?? g.role : "مستلمون محددون"), ...(st.to ? [rl.get(st.to) ?? st.to] : [])].join("، ");
  const steps = (ev: string, list: Any[], params: Any[], depth = 0): { d: number; t: string }[] => list.flatMap((st) => {
    const me = (t: string) => ({ d: depth, t });
    switch (st.type) {
      case "notify": return [me(`إشعار داخلي إلى ${who(st) || "—"}: «${st.title}»`)];
      case "reminder": return [me(`تذكير إلى ${who(st) || "—"}: «${st.title}»`)];
      case "escalate": return [me(`تصعيد إلى ${who(st) || "—"}: «${st.title}»`)];
      case "wait": return [me(`انتظار ${typeof st.minutes === "number" ? `${Math.round(st.minutes / 1440)} يوم` : val(st.minutes, params)}`)];
      case "wait_until": return [me(`الانتظار حتى: ${cond(ev, st.when, params)}`), ...steps(ev, st.timeout ?? [], params, depth + 1).map((x) => ({ ...x, t: `عند انتهاء المهلة: ${x.t}` }))];
      case "if": return [me(`إذا ${cond(ev, st.when, params)}`), ...steps(ev, st.then ?? [], params, depth + 1), ...((st.else ?? []).length ? [{ d: depth, t: "وإلا" }, ...steps(ev, st.else, params, depth + 1)] : [])];
      case "stop": return [me("إنهاء المسار")];
      case "report": return [me(`إنشاء تقرير «${st.title}» ومشاركته مع ${who({ groups: st.share }) || "—"}${st.notify ? " مع إشعار «ملف جاهز»" : " دون إشعار"}`)];
      case "hr_letter": return [me("إنشاء طلب خطاب بانتظار الاعتماد البشري (لا يُصدر تلقائيًا)")];
      case "mt_request": return [me(`إنشاء طلب صيانة «${st.title}» وإسناده`)];
      default: return [me(st.type)];
    }
  });
  return (t: { event: string; def: Any; params?: Any[] }) => {
    const p = t.params ?? [], s = t.def?.schedule ?? {};
    return { when: [SCHED[s.type] ?? s.type, s.type === "weekly" ? DOW[s.dow] : s.type === "monthly" ? `يوم ${s.day}` : null, s.at].filter(Boolean).join(" · "),
      mode: t.def?.mode === "batch" ? "معالجة مجمّعة للنتائج" : "معالجة كل سجل مستقلًا", cond: cond(t.event, t.def?.when, p), steps: steps(t.event, t.def?.steps ?? [], p) };
  };
}

function Flow({ o }: { o: ReturnType<ReturnType<typeof useOutline>> }) {
  return (
    <ol className="space-y-1.5 text-sm" aria-label="مسار الأتمتة">
      <li className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5"><b>التوقيت:</b> {o.when} — {o.mode}</li>
      {o.cond && <li className="rounded-lg border bg-background px-3 py-1.5"><b>الشرط:</b> {o.cond}</li>}
      {o.steps.map((s, i) => <li key={i} style={{ marginInlineStart: s.d * 18 }} className="rounded-lg border bg-background px-3 py-1.5">{s.t}</li>)}
    </ol>
  );
}

export function TemplatesTab({ orgId, me, openDesigner }: { orgId: string; me: AuMe; openDesigner: (id: string) => void }) {
  const list = useQuery({ queryKey: ["au-templates", orgId], queryFn: () => rpc<Any[]>("au_tpl_list", { _org: orgId }) });
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [scope, setScope] = useState(""), [open, setOpen] = useState<string | null>(null);
  const canUse = can(me, "au_manage.designer");
  const all = list.data ?? [];
  const cats = [...new Set(all.map((t) => t.category as string))].sort();
  const shown = all.filter((t) => (!cat || t.category === cat) && (!scope || t.scope === scope) && (!q.trim() || `${t.name} ${t.description} ${t.event_label}`.includes(q.trim())));
  const sel = all.find((t) => t.id === open);
  return (
    <div className="space-y-4">
      {canUse && <SanadPanel orgId={orgId} openDesigner={openDesigner} />}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative block"><span className="sr-only">بحث في القوالب</span><Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم القالب أو هدفه…" className="h-10 w-full rounded-xl border bg-background ps-9 pe-3 text-sm" /></label>
          <select aria-label="التصنيف" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">كل التصنيفات</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <select aria-label="المصدر" className={selectCls()} value={scope} onChange={(e) => setScope(e.target.value)}><option value="">قوالب المنصة والمجموعة</option><option value="platform">قوالب ركاز الجاهزة</option><option value="org">قوالب المجموعة</option></select>
        </div>
        {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => void list.refetch()} /> : !shown.length ? <EmptyState title="لا توجد قوالب مطابقة" hint="غيّر البحث أو التصنيف؛ تظهر لك قوالب الأقسام المخوّل بها فقط." /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((t) => (
              <article key={t.id} className={`flex min-w-0 flex-col rounded-xl border bg-background p-3 ${open === t.id ? "ring-2 ring-primary" : ""}`}>
                <div className="mb-1 flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">{t.category}</span><Pill s={RISK[t.risk]} />{t.scope === "org" && <Pill s={TPL_ST[t.status]} />}</div>
                <h3 className="font-bold leading-7">{t.name}</h3>
                <p className="mt-1 line-clamp-3 text-xs leading-6 text-muted-foreground">{t.description}</p>
                <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground"><div><dt className="inline">المصدر: </dt><dd className="inline">{t.event_label}</dd></div><div><dt className="inline">الإصدار: </dt><dd className="inline">{t.version}{t.used ? ` · استُخدم ${t.used} مرة` : ""}</dd></div></dl>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  {t.problem ? <span className="text-[11px] font-semibold text-warning-foreground">يحتاج إعدادًا</span> : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"><CheckCircle2 className="size-3.5" />جاهز للاستخدام</span>}
                  <Button size="sm" variant={open === t.id ? "default" : "outline"} onClick={() => setOpen(open === t.id ? null : t.id)}><Eye className="size-4" />معاينة</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {sel && <TemplateDetail key={sel.id} orgId={orgId} t={sel} me={me} canUse={canUse} openDesigner={openDesigner} />}
      {me.owner && <OrgTemplateTools orgId={orgId} />}
    </div>
  );
}

function TemplateDetail({ orgId, t, me, canUse, openDesigner }: { orgId: string; t: Any; me: AuMe; canUse: boolean; openDesigner: (id: string) => void }) {
  const qc = useQueryClient();
  const outline = useOutline(orgId);
  const schools = useOrgSchools(orgId);
  const params = (t.params ?? []) as Any[];
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(params.map((p) => [p.key, p.type === "letter_template" ? (t.letters?.[0]?.id ?? "") : String(p.default ?? "")])));
  const [name, setName] = useState(t.name as string), [school, setSchool] = useState(""), [busy, setBusy] = useState(false);
  async function use() {
    setBusy(true);
    try {
      const v = Object.fromEntries(params.map((p) => [p.key, p.type === "letter_template" ? vals[p.key] : Number(vals[p.key])]));
      const id = await rpc<string>("au_tpl_use", { _org: orgId, _id: t.id, _name: name, _schools: school ? [school] : null, _vals: v });
      toast.success("أُنشئت مسودة مستقلة غير مفعّلة؛ راجعها في المصمم ثم حاكها");
      void qc.invalidateQueries({ queryKey: ["au-templates", orgId] }); void qc.invalidateQueries({ queryKey: ["au-rules"] });
      openDesigner(id);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function setStatus(s: string) {
    try { await rpc("au_tpl_set_status", { _id: t.id, _status: s }); toast.success("تم تحديث حالة القالب"); void qc.invalidateQueries({ queryKey: ["au-templates", orgId] }); } catch (e) { toast.error(arabicError(e)); }
  }
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-label={`تفاصيل ${t.name}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div><h3 className="text-base font-bold">{t.name}</h3><p className="text-sm text-muted-foreground">{t.goal ? `الهدف: ${t.goal}` : t.description}</p></div>
          <Flow o={outline(t)} />
          {t.changelog?.length > 0 && (
            <details className="rounded-lg border bg-background p-2 text-xs"><summary className="cursor-pointer font-semibold">سجل التحديثات</summary>
              <ul className="mt-2 space-y-1">{(t.changelog as Any[]).map((c) => <li key={c.v}>الإصدار {c.v} — {c.note ?? "—"} <span className="text-muted-foreground">({fmt(c.at)})</span></li>)}</ul></details>
          )}
        </div>
        <div className="min-w-0 space-y-3 rounded-xl border bg-background p-3">
          <h4 className="text-sm font-bold">تخصيص القالب</h4>
          {t.problem && <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning-foreground">{t.problem}</p>}
          <label className="block text-xs font-semibold">اسم القاعدة<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border bg-card px-2 text-sm font-normal" /></label>
          {params.map((p) => p.type === "letter_template" ? (
            <label key={p.key} className="block text-xs font-semibold">{p.label}
              <select className={selectCls("mt-1 w-full")} value={vals[p.key] ?? ""} onChange={(e) => setVals({ ...vals, [p.key]: e.target.value })}><option value="">اختر…</option>{((t.letters ?? []) as Any[]).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          ) : (
            <label key={p.key} className="block text-xs font-semibold">{p.label}{p.unit ? ` (${p.unit})` : ""}
              <input type="number" min={p.min} max={p.max} step={p.type === "number" ? "any" : 1} value={vals[p.key] ?? ""} onChange={(e) => setVals({ ...vals, [p.key]: e.target.value })} className="mt-1 h-9 w-full rounded-lg border bg-card px-2 text-sm font-normal" />
              <span className="mt-0.5 block font-normal text-muted-foreground">من {p.min} إلى {p.max}</span></label>
          ))}
          <label className="block text-xs font-semibold">النطاق
            <select className={selectCls("mt-1 w-full")} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">كل المدارس المتاحة لي</option>{(schools.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <p className="text-[11px] leading-5 text-muted-foreground">مستوى المخاطر المعروض محسوب لكل المدارس، ويُعاد حسابه حسب النطاق عند الحفظ. ينشئ القالب قاعدة مستقلة كمسودة غير مفعّلة. القنوات داخلية فقط، ويمكن إضافة قالب واتساب معتمد لاحقًا من المصمم. التحقق والمحاكاة والاعتماد والتفعيل تبقى خطوات منفصلة.</p>
          {canUse ? <Button className="w-full" disabled={busy || !!t.problem && !params.some((p) => p.type === "letter_template")} onClick={() => void use()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}استخدام القالب وإنشاء مسودة</Button>
            : <p className="text-xs text-muted-foreground">لإنشاء مسودة تحتاج صلاحية المصمم وتفويضًا ساريًا.</p>}
          {me.owner && t.scope === "org" && (
            <div className="flex flex-wrap gap-2 border-t pt-2">
              {t.status !== "ready" && <Button size="sm" variant="outline" onClick={() => void setStatus("ready")}><CheckCircle2 className="size-4" />اعتماد القالب</Button>}
              {t.status === "ready" && <Button size="sm" variant="outline" onClick={() => void setStatus("draft")}><RotateCcw className="size-4" />إرجاع لمسودة</Button>}
              <Button size="sm" variant="outline" onClick={() => void setStatus("archived")}><Archive className="size-4" />أرشفة</Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** System manager: save an existing rule draft as a group template (new versions on each save; approval separate). */
function OrgTemplateTools({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["au-rules", orgId, "tpl-source"], queryFn: () => rpc<Any>("au_rules_list", { _org: orgId, _limit: 100 }) });
  const tpls = useQuery({ queryKey: ["au-templates", orgId], queryFn: () => rpc<Any[]>("au_tpl_list", { _org: orgId }) });
  const [rule, setRule] = useState(""), [target, setTarget] = useState(""), [name, setName] = useState(""), [desc, setDesc] = useState(""), [cat, setCat] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const orgT = (tpls.data ?? []).filter((t) => t.scope === "org");
  async function save() {
    setBusy(true);
    try { await rpc("au_tpl_save", { _org: orgId, _id: target || null, _rule: rule, _name: name, _description: desc, _category: cat, _note: note || null }); toast.success(target ? "صدر إصدار جديد من القالب بانتظار الاعتماد" : "حُفظ قالب المجموعة كمسودة"); setNote(""); void qc.invalidateQueries({ queryKey: ["au-templates", orgId] }); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return (
    <details className="rounded-2xl border bg-card p-4 shadow-sm">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><Layers className="size-4 text-primary" />قوالب المجموعة: حفظ قاعدة كقالب</summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <select aria-label="القاعدة المصدر" className={selectCls()} value={rule} onChange={(e) => { setRule(e.target.value); const r = ((rules.data?.rows ?? []) as Any[]).find((x) => x.id === e.target.value); if (r && !name) { setName(r.name); setDesc(r.description ?? ""); } }}>
          <option value="">اختر القاعدة المصدر…</option>{((rules.data?.rows ?? []) as Any[]).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select aria-label="القالب" className={selectCls()} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">قالب جديد</option>{orgT.map((t) => <option key={t.id} value={t.id}>إصدار جديد من: {t.name}</option>)}</select>
        <input aria-label="اسم القالب" placeholder="اسم القالب" value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm" />
        <input aria-label="التصنيف" placeholder="التصنيف (مثال: المالية والمحاسبة)" value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm" />
        <textarea aria-label="وصف القالب" placeholder="وصف القالب" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-16 rounded-xl border bg-background p-3 text-sm md:col-span-2" />
        <input aria-label="ملاحظة الإصدار" placeholder="ملاحظة الإصدار (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm md:col-span-2" />
      </div>
      <Button className="mt-3" disabled={busy || !rule || name.trim().length < 3 || desc.trim().length < 5 || cat.trim().length < 2} onClick={() => void save()}>{busy && <Loader2 className="size-4 animate-spin" />}حفظ كقالب للمجموعة</Button>
      <p className="mt-2 text-[11px] text-muted-foreground">يُحفظ القالب كمسودة، ولا يظهر للاستخدام إلا بعد اعتمادك. كل حفظ جديد يصدر إصدارًا مرقّمًا ويُبقي الإصدارات السابقة في السجل.</p>
    </details>
  );
}

/** «سند»: Arabic description → draft checked by the engine; saved only when the user presses save, never approved or activated. */
function SanadPanel({ orgId, openDesigner }: { orgId: string; openDesigner: (id: string) => void }) {
  const ask = useServerFn(sanadAutomationDraft);
  const outline = useOutline(orgId);
  const qc = useQueryClient();
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [res, setRes] = useState<Any>(null), [saving, setSaving] = useState(false);
  async function run() {
    setBusy(true); setRes(null);
    try { setRes(await ask({ data: { orgId, text } })); } catch (e) { setRes({ error: arabicError(e) }); } finally { setBusy(false); }
  }
  async function save() {
    setSaving(true);
    try {
      const id = await rpc<string>("au_rule_save_full", { _org: orgId, _id: null, _name: res.name, _description: res.description || null, _event: res.event, _schools: null, _def: res.def, _layout: null });
      toast.success("حُفظت المسودة؛ راجعها في المصمم ثم حاكها قبل الإرسال للاعتماد");
      void qc.invalidateQueries({ queryKey: ["au-rules"] }); openDesigner(id);
    } catch (e) { toast.error(arabicError(e)); } finally { setSaving(false); }
  }
  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 shadow-sm" aria-label="إنشاء مسودة بمساعدة سند">
      <div className="mb-2 flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Bot className="size-4" /></span>
        <div className="min-w-0"><h3 className="text-sm font-bold">صِف الأتمتة وسيُعدّ سند مسودة</h3><p className="text-xs text-muted-foreground">من مصادرك وصلاحياتك الفعلية فقط. لا يحفظ ولا يعتمد ولا يفعّل ولا يرسل شيئًا بنفسه.</p></div></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1200} aria-label="وصف الأتمتة المطلوبة"
        placeholder="مثال: أريد كل يوم متابعة الطلاب الذين عليهم متأخرات أكبر من 2000 ريال، وإرسال إشعار لولي أمر كل طالب، ثم إعادة التحقق بعد ثلاثة أيام، وإذا ظل مطابقًا يُصعَّد إلى مدير المدرسة."
        className="min-h-20 w-full rounded-xl border bg-card p-3 text-sm leading-7" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button disabled={busy || text.trim().length < 10} onClick={() => void run()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{busy ? "سند يُعدّ المسودة…" : "إعداد المسودة"}</Button>
        {busy && <span className="text-xs text-muted-foreground">قد يستغرق ذلك حتى دقيقة.</span>}
      </div>
      {res && (
        <div className="mt-3 space-y-2 rounded-xl border bg-card p-3 text-sm" aria-live="polite">
          {res.error && <p className="text-destructive">{res.error}</p>}
          {res.refused && <p className="text-destructive">{res.refused}</p>}
          {!res.def && res.questions?.length > 0 && <div><p className="font-semibold">يحتاج سند إلى توضيح:</p><ul className="list-disc ps-5">{(res.questions as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {res.def && <>
            <div className="flex flex-wrap items-center gap-2"><b>{res.name}</b><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">{res.event_label}</span>
              {res.ok ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"><CheckCircle2 className="size-3.5" />اجتازت فحص المحرك</span> : <span className="text-[11px] font-semibold text-destructive">رفضها المحرك: {res.problem}</span>}</div>
            {res.summary && <p className="whitespace-pre-line text-xs leading-6 text-muted-foreground">{res.summary}</p>}
            <Flow o={outline({ event: res.event, def: res.def })} />
            {res.questions?.length > 0 && <div className="text-xs"><p className="font-semibold">نقاط تحتاج قرارك:</p><ul className="list-disc ps-5">{(res.questions as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {res.similar?.length > 0 && <p className="rounded-lg bg-warning/10 p-2 text-xs text-warning-foreground">توجد قواعد على المصدر نفسه قد تتداخل: {(res.similar as Any[]).map((s) => s.name).join("، ")}. راجعها قبل الاعتماد لتجنّب التكرار.</p>}
            {res.template && <p className="text-xs">قالب جاهز مشابه: <b>{res.template.name}</b> — يمكنك استخدامه من القائمة أدناه.</p>}
            <Button disabled={!res.ok || saving} onClick={() => void save()}>{saving && <Loader2 className="size-4 animate-spin" />}حفظ كمسودة وفتحها في المصمم</Button>
          </>}
        </div>
      )}
    </section>
  );
}
