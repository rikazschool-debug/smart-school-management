import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport, type ExportMeta } from "@/lib/export";
import { riyadhText, type SvMe, type SvSearch } from "./model";
import { sv4 as call } from "./pd-api";
import { useLo } from "./lo";
import { filterPf, groupPf, NO_TERM, NO_YEAR, PF_DOMAIN, PF_HEADERS, PF_LOG, PF_NOTE, PF_SOURCE, PF_STATUS, pfRows, sourceLink, type PfCandidate, type PfFilter, type PfItem } from "./pf-model";

type Go = (s: SvSearch, replace?: boolean) => void;
const uniq = (xs: string[]) => [...new Set(xs)].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar"));

/** «الملف المهني» — the teacher proposes permitted work, someone in scope verifies. All rules live in sv5_pf_*. */
export function Portfolio({ org, me, go }: { org: string; me: SvMe; go: Go }) {
  const list = useLo<PfItem[]>(["pf", org], "sv5_pf_list", { _org: org });
  const [f, setF] = useState<PfFilter>({ teacher: "", year: "", term: "", domain: "", status: "" });
  const [adding, setAdding] = useState(false);
  const mySchools = me.schools.filter((s) => s.teacher);
  if (list.isLoading) return <LoadingState />;
  if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const all = list.data ?? []; const rows = filterPf(all, f); const pending = all.filter((x) => x.can_review);
  const teachers = [...new Map(all.map((x) => [x.teacher_id, x.teacher])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  const meta = (): ExportMeta => ({ title: "الملف المهني", school: uniq(rows.map((x) => x.school)).join("، ") || undefined, filters: [f.teacher && `المعلم: ${teachers.find((t) => t[0] === f.teacher)?.[1] ?? ""}`, f.year && `العام: ${f.year}`, f.term && `الفصل: ${f.term}`, f.domain && `المجال: ${PF_DOMAIN[f.domain]}`, f.status && `الحالة: ${PF_STATUS[f.status]}`].filter(Boolean) as string[], note: PF_NOTE });
  return <div className="space-y-4">
    <p className="rounded bg-muted px-3 py-2 text-sm">{PF_NOTE} لا تُنسخ ملفات ولا ملاحظات داخلية؛ يُعرض ملخص المصدر ورابطه لمن يملك قراءته.</p>
    <div className="flex flex-wrap items-center gap-2">
      {!!mySchools.length && !adding && <Button onClick={() => setAdding(true)}><Plus />اقتراح عنصر من عملي</Button>}
      {teachers.length > 1 && <select className={selectCls()} aria-label="المعلم" value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}><option value="">كل المعلمين</option>{teachers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>}
      <select className={selectCls()} aria-label="العام" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}><option value="">كل الأعوام</option>{uniq(all.map((x) => x.year ?? NO_YEAR)).map((y) => <option key={y}>{y}</option>)}</select>
      <select className={selectCls()} aria-label="الفصل" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}><option value="">كل الفصول</option>{uniq(all.map((x) => x.term ?? NO_TERM)).map((y) => <option key={y}>{y}</option>)}</select>
      <select className={selectCls()} aria-label="المجال" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })}><option value="">كل المجالات</option>{Object.entries(PF_DOMAIN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select className={selectCls()} aria-label="الحالة" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">الحالية (دون المسحوب)</option>{Object.entries(PF_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {!!rows.length && <span className="ms-auto flex"><Button variant="ghost" size="icon" aria-label="Excel الملف المهني" onClick={() => exportXlsx(meta(), PF_HEADERS, pfRows(rows))}><Download /></Button><Button variant="ghost" size="icon" aria-label="PDF الملف المهني" onClick={() => void exportPdf(meta(), PF_HEADERS, pfRows(rows))}><FileText /></Button><Button variant="ghost" size="icon" aria-label="طباعة الملف المهني" onClick={() => printReport(meta(), PF_HEADERS, pfRows(rows))}><Printer /></Button></span>}
    </div>
    {adding && <Candidates schools={mySchools} onDone={() => setAdding(false)} />}
    {!!pending.length && <section aria-label="بانتظار تحققك" className="space-y-2"><h4 className="font-semibold">بانتظار تحققك ({pending.length})</h4><ul className="grid gap-2 md:grid-cols-2">{pending.map((x) => <ItemCard key={x.id} x={x} go={go} showTeacher />)}</ul></section>}
    {!rows.length ? <EmptyState title={all.length ? "لا عناصر تطابق التصفية" : "لا عناصر في الملف المهني بعد"} hint={mySchools.length ? "اقترح عنصرًا من سجلاتك المعتمدة أو حضورك الموثّق أو خطتك المعتمدة." : "يقترح المعلم العناصر من عمله، ثم يتحقق منها من يملك نطاقه."} /> :
      groupPf(rows).map((g) => <section key={g.year} aria-label={`العام ${g.year}`} className="space-y-3">
        <h3 className="border-b pb-1 text-lg font-bold">العام {g.year}</h3>
        {g.terms.map((t) => <div key={t.term} className="space-y-2"><h4 className="font-semibold text-primary">الفصل: {t.term}</h4>
          {t.domains.map((d) => <div key={d.domain} className="space-y-2 ps-2"><h5 className="text-sm font-semibold">{PF_DOMAIN[d.domain] ?? d.domain} ({d.items.length})</h5>
            <ul className="grid gap-2 md:grid-cols-2">{d.items.map((x) => <ItemCard key={x.id} x={x} go={go} showTeacher={teachers.length > 1} />)}</ul></div>)}
        </div>)}
      </section>)}
  </div>;
}

function F({ t, children }: { t: string; children: React.ReactNode }) { return <label className="grid gap-1 text-sm"><span className="font-medium">{t}</span>{children}</label>; }

function Candidates({ schools, onDone }: { schools: { id: string; name: string }[]; onDone: () => void }) {
  const [school, setSchool] = useState(schools[0]?.id ?? "");
  const c = useLo<PfCandidate[]>(["pf-cand", school], "sv5_pf_candidates", { _school: school }, !!school);
  const [pick, setPick] = useState<PfCandidate | null>(null);
  return <section aria-label="اقتراح عنصر" className="space-y-3 rounded-lg border border-primary/40 p-3">
    <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">اقتراح عنصر من عملي المعتمد</h4>
      {schools.length > 1 && <select className={selectCls()} aria-label="الفرع" value={school} onChange={(e) => { setSchool(e.target.value); setPick(null); }}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <Button variant="ghost" className="ms-auto" onClick={onDone}>إغلاق</Button></div>
    <p className="text-xs text-muted-foreground">تظهر هنا فقط أعمالك المعتمدة أو الموثّقة التي لم تُضف بعد: سجلات إشرافية معتمدة، حضور برامج التطوير، خطط التطوير المعتمدة، إجراءات التحسين المنفّذة التي أنت مسؤولها.</p>
    {c.isLoading ? <LoadingState /> : c.error ? <ErrorState message={arabicError(c.error)} onRetry={() => c.refetch()} /> : !(c.data ?? []).length ? <p className="text-sm text-muted-foreground">لا أعمال معتمدة جديدة لإضافتها.</p> :
      pick ? <ProposeForm school={school} c={pick} onDone={(saved) => { setPick(null); if (saved) onDone(); }} /> :
      <ul className="grid gap-2 md:grid-cols-2">{(c.data ?? []).map((x) => <li key={x.kind + x.id} className="flex items-start justify-between gap-2 rounded border p-2 text-sm">
        <div><b>{x.source.title}</b><p className="text-xs text-muted-foreground">{PF_SOURCE[x.kind]} · {x.source.detail} · {x.source.date}{x.year ? ` · ${x.year}${x.term ? ` / ${x.term}` : ""}` : ""}</p></div>
        <Button size="sm" variant="outline" onClick={() => setPick(x)}>اختيار</Button></li>)}</ul>}
  </section>;
}

function ProposeForm({ school, c, item, onDone }: { school?: string; c?: PfCandidate; item?: PfItem; onDone: (saved: boolean) => void }) {
  const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const [p, setP] = useState({ domain: item?.domain ?? "", title: item?.title ?? c?.source.title ?? "", reflection: item?.reflection ?? "" });
  async function save() {
    setBusy(true);
    try { await call("sv5_pf_save", { _id: item?.id ?? null, _rev: item?.rev ?? null, _p: item ? p : { ...p, school_id: school, source_kind: c!.kind, source_id: c!.id } }, item ? "حُفظ العنصر وأُرسل للتحقق" : "اقتُرح العنصر وأُرسل للتحقق"); await qc.invalidateQueries({ queryKey: ["sv5"] }); onDone(true); }
    catch { /* toast shown; text kept */ } finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded border bg-card p-3" aria-label="بيانات العنصر" role="group">
    {c && <p className="text-sm"><b>المصدر:</b> {c.source.title} — {c.source.detail} ({c.source.date})</p>}
    <div className="grid gap-2 md:grid-cols-2">
      <F t="المجال"><select aria-label="مجال العنصر" className={selectCls()} value={p.domain} onChange={(e) => setP({ ...p, domain: e.target.value })}><option value="">اختر المجال</option>{Object.entries(PF_DOMAIN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
      <F t="العنوان"><Input aria-label="عنوان العنصر" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} /></F>
    </div>
    <F t="تأملي (اختياري): ماذا تعلمت وماذا طبقت؟"><Textarea aria-label="تأمل المعلم" rows={3} value={p.reflection} onChange={(e) => setP({ ...p, reflection: e.target.value })} /></F>
    <div className="flex gap-2"><Button disabled={busy || !p.domain || p.title.trim().length < 3} onClick={save}>{item ? "حفظ وإرسال للتحقق" : "اقتراح للتحقق"}</Button><Button variant="ghost" onClick={() => onDone(false)}>إلغاء</Button></div>
  </div>;
}

function ItemCard({ x, go, showTeacher }: { x: PfItem; go: Go; showTeacher?: boolean }) {
  const qc = useQueryClient(); const [edit, setEdit] = useState(false); const [busy, setBusy] = useState(false); const [log, setLog] = useState(false);
  const det = useLo<{ log: { action: string; note: string | null; actor: string; at: string }[] }>(["pf-one", x.id, x.rev], "sv5_pf_get", { _id: x.id }, log);
  async function run(fn: string, args: Record<string, unknown>, msg: string) { setBusy(true); try { await call(fn, { _id: x.id, _rev: x.rev, ...args }, msg); } catch { /* shown */ } finally { await qc.invalidateQueries({ queryKey: ["sv5"] }); setBusy(false); } }
  const link = x.can_open ? sourceLink(x) : null;
  const tone = x.status === "verified" ? "bg-primary/10 text-primary" : x.status === "returned" ? "bg-destructive/10 text-destructive" : "bg-muted";
  return <li className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><b>{x.title}</b><span className={`rounded px-2 text-xs leading-6 ${tone}`}>{PF_STATUS[x.status] ?? x.status}</span></div>
    {showTeacher && <p className="text-xs">{x.teacher} · {x.school}</p>}
    <p className="text-xs text-muted-foreground">{PF_SOURCE[x.source_kind]}: {x.source.detail} · {x.source_date}</p>
    {x.reflection && <p className="whitespace-pre-wrap">{x.reflection}</p>}
    {x.status === "verified" && <p className="text-xs">تحقق منه {x.verifier} — {riyadhText(x.verified_at)}{x.review_note ? ` · ${x.review_note}` : ""}</p>}
    {x.status === "returned" && x.review_note && <p className="text-xs text-destructive">سبب الإعادة: {x.review_note}</p>}
    {edit ? <ProposeForm item={x} onDone={() => setEdit(false)} /> :
      <div className="mt-1 flex flex-wrap gap-2">
        {link && <Button size="sm" variant="ghost" onClick={() => go(link, false)}><ExternalLink />فتح المصدر</Button>}
        {x.can_edit && <Button size="sm" variant="outline" disabled={busy} onClick={() => setEdit(true)}>تعديل</Button>}
        {x.can_edit && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await ask("سحب العنصر من ملفك المهني؟", { destructive: true })) await run("sv5_pf_withdraw", {}, "سُحب العنصر"); }}>سحب</Button>}
        {x.can_review && <Button size="sm" disabled={busy} onClick={async () => { const n = await askText("ملاحظة التحقق (اختيارية)", { ok: "تحقق" }); if (n !== null) await run("sv5_pf_review", { _decision: "verify", _note: n }, "تم التحقق"); }}>تحقق</Button>}
        {x.can_review && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const n = await askText("سبب الإعادة للمعلم", { required: true, long: true }); if (n !== null) await run("sv5_pf_review", { _decision: "return", _note: n }, "أُعيد للمعلم"); }}>إعادة للمعلم</Button>}
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setLog(!log)}>{log ? "إخفاء السجل" : "السجل"}</Button>
      </div>}
    {log && (det.data ? <ol className="mt-1 space-y-0.5 border-t pt-1 text-xs text-muted-foreground">{det.data.log.map((l, i) => <li key={i}>{PF_LOG[l.action] ?? l.action} — {l.actor} — {riyadhText(l.at)}{l.note ? ` · ${l.note}` : ""}</li>)}</ol> : <p className="text-xs">…</p>)}
  </li>;
}
