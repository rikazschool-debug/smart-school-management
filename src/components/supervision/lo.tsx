import { cloneElement, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, GitCompareArrows, Layers, Plus } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import type { SvMe, SvSearch } from "./model";
import { LO_KIND, LO_VIEWS, ORIGIN, pctChangeText, type Compare, type LoView, type Mastery, type Measure, type Refs } from "./lo-model";
import { sv4 as call } from "./pd-api";
import { MeasureDetail } from "./lo-measure";

export function useLo<T>(key: unknown[], fn: string, args: Record<string, unknown>, enabled = true) {
  return useQuery({ queryKey: ["sv5", ...key], enabled, retry: false, queryFn: async () => { const r = await db.rpc(fn, args); if (r.error) throw r.error; return r.data as T; } });
}

/** «نواتج التعلم» — measures from existing tests or documented files; every number comes from sv5_* on the server. */
export function LearningOutcomes({ org, me, sp, go }: { org: string; me: SvMe; sp: SvSearch; go: (s: SvSearch, replace?: boolean) => void }) {
  const view: LoView = sp.lo ?? "measures";
  const list = useLo<Measure[]>(["list", org], "sv5_measure_list", { _org: org });
  const icons = { measures: BarChart3, compare: GitCompareArrows, mastery: Layers };
  return <div className="space-y-4">
    <nav aria-label="نواتج التعلم" className="flex flex-wrap gap-2 border-b pb-3">{(Object.keys(LO_VIEWS) as LoView[]).map((v) => { const I = icons[v]; return <Button key={v} variant={view === v ? "default" : "ghost"} onClick={() => go({ tab: "outcomes", lo: v })}><I />{LO_VIEWS[v]}</Button>; })}</nav>
    <p className="text-sm text-muted-foreground">النتائج من اختبارات ركاز المنشورة أو من ملفات موثقة تُدخل يدويًا (لا ربط رسمي مع نافس أو قياس). الغياب وعدم وجود نتيجة ليسا صفرًا، ولا ترتيب للمعلمين أو المدارس ولا تقييم وظيفي.</p>
    {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : <>
      {view === "measures" && (sp.id ? <MeasureDetail id={sp.id} org={org} onBack={() => go({ tab: "outcomes", lo: "measures" }, false)} /> : <Measures org={org} me={me} list={list.data ?? []} open={(id) => go({ tab: "outcomes", lo: "measures", id }, false)} />)}
      {view === "compare" && <CompareView list={list.data ?? []} />}
      {view === "mastery" && <MasteryView org={org} me={me} />}
    </>}
  </div>;
}

function Measures({ org, me, list, open }: { org: string; me: SvMe; list: Measure[]; open: (id: string) => void }) {
  const [mode, setMode] = useState<"" | "file" | "test">(""); const [f, setF] = useState({ school: "", kind: "", q: "" });
  const canCreate = me.owner || me.schools.some((s) => s.principal) || me.live.length > 0;
  const rows = list.filter((m) => (!f.school || m.school_id === f.school) && (!f.kind || m.kind === f.kind) && (!f.q || `${m.title} ${m.subject} ${m.grade} ${m.teacher ?? ""}`.includes(f.q)));
  return <div className="space-y-3">
    {canCreate && !mode && <div className="flex flex-wrap gap-2"><Button onClick={() => setMode("file")}><Plus />مقياس بنتائج من ملف</Button><Button variant="outline" onClick={() => setMode("test")}><Plus />تحليل اختبار في ركاز</Button></div>}
    {mode === "file" && <MeasureForm org={org} onDone={(id) => { setMode(""); if (id) open(id); }} />}
    {mode === "test" && <FromTest org={org} onDone={(id) => { setMode(""); if (id) open(id); }} />}
    <div className="flex flex-wrap gap-2">
      <select className={selectCls()} aria-label="تصفية الفرع" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">كل الفروع المتاحة</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className={selectCls()} aria-label="تصفية نوع القياس" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">كل الأنواع</option>{Object.entries(LO_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <Input className="w-56" placeholder="بحث بالعنوان أو المادة أو الصف" aria-label="بحث" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
    </div>
    {!rows.length ? <EmptyState title="لا مقاييس في نطاقك" hint="أضف مقياسًا من ملف موثق أو حلّل اختبارًا منشورًا في ركاز." /> :
      <ul className="grid gap-3 md:grid-cols-2">{rows.map((m) => <li key={m.id} className="rounded-lg border p-3">
        <div className="flex flex-wrap justify-between gap-2"><b>{m.title}</b><span className="rounded bg-muted px-2 text-xs leading-6">{LO_KIND[m.kind]}</span></div>
        <p className="mt-1 text-sm text-muted-foreground">{m.school} · {m.subject} · {m.grade}{m.sections.length ? ` (${m.sections.join("، ")})` : ""} · {m.period_label} · {m.measured_on}</p>
        <p className="text-xs text-muted-foreground">{ORIGIN[m.origin]} · الدرجة العظمى {m.scale_max}</p>
        <p className="mt-1 text-sm">المستهدفون {m.counts.targeted} · لهم نتيجة {m.counts.present} · غائب {m.counts.absent} · معفى {m.counts.exempt} · بلا نتيجة {m.counts.missing}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => open(m.id)}>فتح المقياس</Button></li>)}</ul>}
  </div>;
}

/** Field wrapper: the control gets the field name as its accessible name (a wrapping label would also read the options). */
function L({ t, children }: { t: string; children: React.ReactElement<{ "aria-label"?: string }> }) { return <label className="grid gap-1 text-sm"><span className="font-medium">{t}</span>{cloneElement(children, { "aria-label": t })}</label>; }

export function MeasureForm({ org, m, onDone }: { org: string; m?: Measure; onDone: (id?: string) => void }) {
  const refs = useLo<Refs>(["refs", org], "sv5_refs", { _org: org }); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const [p, setP] = useState(() => ({ school_id: m?.school_id ?? "", kind: m?.kind ?? "", title: m?.title ?? "", source_note: m?.source_note ?? "", measured_on: m?.measured_on ?? "", year_id: m?.year_id ?? "", term_id: m?.term_id ?? "",
    period_label: m?.period_label ?? "", grade_id: m?.grade_id ?? "", section_ids: m?.section_ids ?? [], subject_id: m?.subject_id ?? "", course_id: m?.course_id ?? "", scale_max: m ? String(m.scale_max) : "", scale_note: m?.scale_note ?? "" }));
  if (refs.isLoading) return <LoadingState />; if (refs.error || !refs.data) return <ErrorState message={arabicError(refs.error)} />;
  const r = refs.data; const sch = p.school_id || (r.schools.length === 1 ? r.schools[0]!.id : ""); const by = <T extends { school_id: string }>(xs: T[]) => xs.filter((x) => x.school_id === sch);
  const set = (k: keyof typeof p, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const secs = by(r.sections).filter((s) => s.grade_id === p.grade_id && s.year_id === p.year_id);
  const courses = by(r.courses).filter((c) => c.subject_id === p.subject_id && (!p.section_ids.length || p.section_ids.includes(c.section_id)));
  async function save() { setBusy(true); try { const id = await call("sv5_measure_save", { _id: m?.id ?? null, _rev: m?.rev ?? null, _p: { ...p, school_id: sch } }, "حُفظ المقياس") as string; await qc.invalidateQueries({ queryKey: ["sv5"] }); onDone(id); } catch { /* shown */ } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-lg border p-3" aria-label="بيانات المقياس">
    <h3 className="font-semibold">{m ? "تعديل بيانات المقياس" : "مقياس جديد بنتائج من ملف موثق"}</h3>
    <p className="text-sm text-muted-foreground">المقياس على مستوى الصف كله لمدير الفرع أو المالك أو مشرف أُسندت إليه المادة؛ المشرف المسند إليه معلمون يختار مقرر المعلم.</p>
    <div className="grid gap-3 md:grid-cols-3">
      {!m && <L t="الفرع"><select className={selectCls()} value={sch} onChange={(e) => setP({ ...p, school_id: e.target.value, grade_id: "", section_ids: [], subject_id: "", course_id: "", year_id: "", term_id: "" })}><option value="">اختر</option>{r.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>}
      <L t="نوع القياس"><select className={selectCls()} value={p.kind} onChange={(e) => set("kind", e.target.value)}><option value="">اختر</option>{Object.entries(LO_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></L>
      <L t="العنوان"><Input value={p.title} onChange={(e) => set("title", e.target.value)} /></L>
      <L t="مصدر البيانات (الملف أو الجهة)"><Input value={p.source_note} onChange={(e) => set("source_note", e.target.value)} placeholder="مثال: تقرير نتائج مستلم من الإدارة بتاريخ…" /></L>
      <L t="تاريخ القياس"><Input type="date" value={p.measured_on} onChange={(e) => set("measured_on", e.target.value)} /></L>
      <L t="العام الدراسي"><select className={selectCls()} value={p.year_id} onChange={(e) => setP({ ...p, year_id: e.target.value, term_id: "", section_ids: [] })}><option value="">اختر</option>{by(r.years).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></L>
      <L t="الفصل الدراسي (اختياري)"><select className={selectCls()} value={p.term_id} onChange={(e) => set("term_id", e.target.value)}><option value="">—</option>{by(r.terms).filter((t) => t.year_id === p.year_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></L>
      <L t="الفترة"><Input value={p.period_label} onChange={(e) => set("period_label", e.target.value)} placeholder="مثال: بداية الفصل" /></L>
      <L t="الصف"><select className={selectCls()} value={p.grade_id} onChange={(e) => setP({ ...p, grade_id: e.target.value, section_ids: [] })}><option value="">اختر</option>{by(r.grades).map((g) => <option key={g.id} value={g.id}>{g.stage} — {g.name}</option>)}</select></L>
      <L t="المادة"><select className={selectCls()} value={p.subject_id} onChange={(e) => setP({ ...p, subject_id: e.target.value, course_id: "" })}><option value="">اختر</option>{by(r.subjects).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
      <L t="المقرر والمعلم (اختياري)"><select className={selectCls()} value={p.course_id} onChange={(e) => set("course_id", e.target.value)}><option value="">على مستوى الصف</option>{courses.map((c) => <option key={c.id} value={c.id}>{secs.find((s) => s.id === c.section_id)?.name ?? "فصل"} — {c.teacher ?? "بلا معلم"}</option>)}</select></L>
      <L t="الدرجة العظمى لسلم القياس"><Input inputMode="decimal" value={p.scale_max} onChange={(e) => set("scale_max", e.target.value)} disabled={!!m && m.counts.present + m.counts.absent + m.counts.exempt > 0} /></L>
      <L t="ملاحظة على السلم (اختياري)"><Input value={p.scale_note} onChange={(e) => set("scale_note", e.target.value)} /></L>
    </div>
    <fieldset className="text-sm"><legend className="font-medium">الفصول (اتركها كلها فارغة لكل فصول الصف)</legend>
      <div className="mt-1 flex flex-wrap gap-3">{secs.length ? secs.map((s) => <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={p.section_ids.includes(s.id)} onChange={(e) => set("section_ids", e.target.checked ? [...p.section_ids, s.id] : p.section_ids.filter((x) => x !== s.id))} />{s.name}</label>) : <span className="text-muted-foreground">اختر العام والصف أولًا</span>}</div></fieldset>
    <div className="flex gap-2"><Button disabled={busy} onClick={save}>حفظ</Button><Button variant="ghost" onClick={() => onDone()}>إلغاء</Button></div>
  </section>;
}

function FromTest({ org, onDone }: { org: string; onDone: (id?: string) => void }) {
  const refs = useLo<Refs>(["refs", org], "sv5_refs", { _org: org }); const qc = useQueryClient(); const [p, setP] = useState({ hw: "", kind: "school", period: "" }); const [busy, setBusy] = useState(false);
  if (refs.isLoading) return <LoadingState />; const tests = (refs.data?.tests ?? []).filter((t) => !t.used);
  async function go() { setBusy(true); try { const id = await call("sv5_measure_from_test", { _homework: p.hw, _kind: p.kind, _period: p.period }, "أضيف الاختبار للتحليل") as string; await qc.invalidateQueries({ queryKey: ["sv5"] }); onDone(id); } catch { /* shown */ } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-lg border p-3" aria-label="تحليل اختبار في ركاز"><h3 className="font-semibold">تحليل اختبار منشور في ركاز</h3>
    <p className="text-sm text-muted-foreground">تُقرأ الدرجات المنشورة من الاختبار نفسه ولا تُنسخ؛ لا سجل درجات موازٍ.</p>
    {!tests.length ? <EmptyState title="لا اختبارات منشورة متاحة في نطاقك" /> : <div className="grid gap-3 md:grid-cols-3">
      <select className={selectCls()} aria-label="الاختبار" value={p.hw} onChange={(e) => setP({ ...p, hw: e.target.value })}><option value="">اختر الاختبار</option>{tests.map((t) => <option key={t.id} value={t.id}>{t.title} (من {t.max_score})</option>)}</select>
      <select className={selectCls()} aria-label="نوع الاختبار" value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })}>{["school", "diagnostic", "formative", "final"].map((k) => <option key={k} value={k}>{LO_KIND[k]}</option>)}</select>
      <Input aria-label="الفترة" placeholder="الفترة" value={p.period} onChange={(e) => setP({ ...p, period: e.target.value })} /></div>}
    <div className="flex gap-2"><Button disabled={busy || !p.hw} onClick={go}>إضافة</Button><Button variant="ghost" onClick={() => onDone()}>إلغاء</Button></div></section>;
}

function CompareView({ list }: { list: Measure[] }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [res, setRes] = useState<Compare | null>(null); const [busy, setBusy] = useState(false);
  async function run() { setBusy(true); try { setRes(await call("sv5_compare", { _a: a, _b: b }) as Compare); } catch { setRes(null); } finally { setBusy(false); } }
  const opt = list.map((m) => <option key={m.id} value={m.id}>{m.title} — {LO_KIND[m.kind]} — {m.measured_on}</option>);
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">تُرفض المقارنة إذا اختلفت المادة أو سلم الدرجات أو نوع الاختبار المعياري. الفرق بالدرجات والتغير النسبي يُعرضان منفصلين، مع فروق المشاركين.</p>
    <div className="flex flex-wrap gap-2"><select className={selectCls("min-w-64")} aria-label="القياس الأول" value={a} onChange={(e) => setA(e.target.value)}><option value="">القياس الأول (الأقدم)</option>{opt}</select>
      <select className={selectCls("min-w-64")} aria-label="القياس الثاني" value={b} onChange={(e) => setB(e.target.value)}><option value="">القياس الثاني</option>{opt}</select>
      <Button disabled={!a || !b || busy} onClick={run}>قارن</Button></div>
    {res && <section className="space-y-2 rounded-lg border p-3" aria-label="نتيجة المقارنة">
      <p className={`font-semibold ${res.comparable ? "" : "text-destructive"}`}>{res.comparable ? "القياسان قابلان للمقارنة مع التحفظات أدناه" : "لا تصح المقارنة بين هذين القياسين"}</p>
      {!!res.reasons.length && <ul className="list-disc ps-5 text-sm">{res.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-start"><th className="p-1 text-start">البند</th><th className="p-1 text-start">{res.a.title}</th><th className="p-1 text-start">{res.b.title}</th></tr></thead><tbody>
        {([["النوع", LO_KIND[res.a.kind], LO_KIND[res.b.kind]], ["التاريخ والفترة", `${res.a.measured_on} · ${res.a.period}`, `${res.b.measured_on} · ${res.b.period}`], ["الدرجة العظمى", res.a.scale_max, res.b.scale_max], ["عدد من لهم نتيجة", res.a.present, res.b.present], ["المتوسط", res.a.mean ?? "لم يُقس", res.b.mean ?? "لم يُقس"]] as const).map(([l, x, y]) => <tr key={l} className="border-b"><td className="p-1">{l}</td><td className="p-1">{x}</td><td className="p-1">{y}</td></tr>)}
      </tbody></table></div>
      {res.comparable && <ul className="text-sm"><li>الفرق بالدرجات (المتوسط الثاني − الأول): <b>{res.point_diff}</b> درجة</li><li>التغير النسبي في المتوسط: <b>{pctChangeText(res)}</b></li><li>الطلاب المشتركون في القياسين: {res.paired}{res.paired_point_diff !== null ? ` — متوسط فرقهم ${res.paired_point_diff} درجة` : ""}</li></ul>}
      {!!res.warnings.length && <div className="rounded bg-muted p-2 text-sm"><b>تحفظات:</b><ul className="list-disc ps-5">{res.warnings.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    </section>}
  </div>;
}

function MasteryView({ org, me }: { org: string; me: SvMe }) {
  const q = useLo<Mastery[]>(["mastery", org], "sv5_mastery_list", { _org: org }); const qc = useQueryClient(); const [edit, setEdit] = useState<{ id?: string; rev?: number; from?: string; title: string; note: string; levels: { label: string; min_pct: string }[] } | null>(null);
  const canDraft = me.owner || me.schools.some((s) => s.principal);
  async function save() { if (!edit) return; try { await call("sv5_mastery_save", { _org: org, _id: edit.id ?? null, _rev: edit.rev ?? null, _title: edit.title, _note: edit.note, _from: edit.from ?? null, _levels: edit.levels.map((l) => ({ label: l.label, min_pct: Number(l.min_pct) })) }, "حُفظت المسودة"); setEdit(null); await qc.invalidateQueries({ queryKey: ["sv5"] }); } catch { /* shown */ } }
  async function publish(x: Mastery) { try { await call("sv5_mastery_publish", { _id: x.id, _rev: x.rev }, "نُشرت مستويات الإتقان"); await qc.invalidateQueries({ queryKey: ["sv5"] }); } catch { /* shown */ } }
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} />;
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">حدود الإتقان تعتمدها المؤسسة: يقترحها المالك أو مدير فرع، وينشرها المالك (لا ينشر أحد ما كتبه). المنشور لا يُعدّل، وأي تغيير إصدار جديد مؤرخ، والتقارير السابقة تبقى على إصدارها. لا أوزان.</p>
    {canDraft && !edit && <Button onClick={() => setEdit({ title: "", note: "", levels: [{ label: "متقن", min_pct: "" }, { label: "", min_pct: "0" }] })}><Plus />مسودة مستويات</Button>}
    {edit && <section className="space-y-2 rounded-lg border p-3" aria-label="مسودة مستويات الإتقان">
      <Input aria-label="العنوان" placeholder="العنوان" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
      {edit.levels.map((l, i) => <div key={i} className="flex flex-wrap gap-2"><Input className="w-56" aria-label={`اسم المستوى ${i + 1}`} placeholder="اسم المستوى" value={l.label} onChange={(e) => setEdit({ ...edit, levels: edit.levels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
        <Input className="w-32" inputMode="decimal" aria-label={`الحد الأدنى ٪ للمستوى ${i + 1}`} placeholder="من ٪" value={l.min_pct} onChange={(e) => setEdit({ ...edit, levels: edit.levels.map((x, j) => (j === i ? { ...x, min_pct: e.target.value } : x)) })} />
        {edit.levels.length > 2 && <Button variant="ghost" onClick={() => setEdit({ ...edit, levels: edit.levels.filter((_, j) => j !== i) })}>حذف</Button>}</div>)}
      {edit.levels.length < 6 && <Button variant="outline" size="sm" onClick={() => setEdit({ ...edit, levels: [...edit.levels, { label: "", min_pct: "" }] })}>إضافة مستوى</Button>}
      <Input aria-label="ملاحظة" placeholder="مرجع القرار أو ملاحظة" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
      <div className="flex gap-2"><Button onClick={save}>حفظ المسودة</Button><Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div></section>}
    {!(q.data ?? []).length ? <EmptyState title="لا مستويات إتقان بعد" hint="بدونها يُعرض التوزيع فقط دون تصنيف إتقان." /> :
      <ul className="grid gap-3 md:grid-cols-2">{(q.data ?? []).map((x) => <li key={x.id} className="rounded-lg border p-3">
        <div className="flex justify-between gap-2"><b>{x.title}</b><span className="text-xs">{x.status === "published" ? `منشور — إصدار ${x.version}` : x.status === "retired" ? `إصدار سابق ${x.version}` : `مسودة — إصدار ${x.version}`}</span></div>
        <ul className="mt-1 text-sm">{x.levels.map((l) => <li key={l.label}>{l.label}: من {l.min_pct}٪</li>)}</ul>
        <p className="text-xs text-muted-foreground">كتبها {x.creator}{x.publisher ? ` · نشرها ${x.publisher} في ${x.published_at?.slice(0, 10)}` : ""}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {x.status === "draft" && canDraft && <Button size="sm" variant="outline" onClick={() => setEdit({ id: x.id, rev: x.rev!, title: x.title, note: x.note ?? "", levels: x.levels.map((l) => ({ label: l.label, min_pct: String(l.min_pct) })) })}>تعديل</Button>}
          {x.can_publish && <Button size="sm" onClick={() => publish(x)}>نشر للمؤسسة</Button>}
          {x.status === "published" && canDraft && <Button size="sm" variant="outline" onClick={() => setEdit({ from: x.id, title: x.title, note: "", levels: x.levels.map((l) => ({ label: l.label, min_pct: String(l.min_pct) })) })}>إصدار جديد</Button>}
        </div></li>)}</ul>}
  </div>;
}
