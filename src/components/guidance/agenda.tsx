import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { SESSION_MODE, sessionIssues } from "./case-model";
import { RecordSession, StatusChip, schoolToday } from "./case-run";

type A = { id: string; record_id: string; ref_no: string; person: string; session_date: string; start_time: string | null; place: string; status: string; mode: string; group_id: string | null; topic: string; activity: string };
type Agenda = { today: string; rows: A[]; unrecorded: A[]; cases: { id: string; ref_no: string; person: string; goals: string[] }[] };
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DAY = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { weekday: "long", day: "numeric", month: "long" });

/** Groups one group session's per-case rows into one card (names visible to counselors only). */
function groupRows(rows: A[]) { const out: A[][] = []; const seen = new Map<string, A[]>(); for (const r of rows) { if (!r.group_id) { out.push([r]); continue; } const g = seen.get(r.group_id); if (g) g.push(r); else { const n = [r]; seen.set(r.group_id, n); out.push(n); } } return out; }

export function GuidanceAgenda({ school, openCase }: { school: string; openCase: (id: string) => void }) {
  const [from, setFrom] = useState(schoolToday()); const to = addDays(from, 6);
  const q = useQuery({ queryKey: ["guidance-agenda", school, from], queryFn: async () => { const r = await db.rpc("edu_guidance_agenda", { _school: school, _from: from, _to: to }); if (r.error) throw r.error; return r.data as Agenda; } });
  const [form, setForm] = useState(false);
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data; const refresh = async () => { await q.refetch(); };
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const Card = ({ g }: { g: A[] }) => { const s = g[0]!; return <li className="space-y-2 rounded-xl border bg-card p-3 text-sm">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><div className="min-w-0"><p className="font-medium">{s.mode === "group" ? <span className="inline-flex items-center gap-1"><Users className="size-4" />{s.topic}</span> : <button type="button" className="text-start hover:underline" onClick={() => openCase(s.record_id)}>{s.person}</button>}</p><p className="text-xs text-muted-foreground">{SESSION_MODE[s.mode]}{s.start_time ? ` · ${s.start_time.slice(0, 5)}` : ""}{s.place ? ` · ${s.place}` : ""}{s.mode === "individual" ? ` · ${s.ref_no}` : ""} · {s.activity}</p></div>{s.mode === "individual" && <StatusChip s={s.status} />}</div>
    {s.mode === "group" && <ul className="divide-y rounded-lg border">{g.map((x) => <li key={x.id} className="space-y-1 p-2"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><button type="button" className="min-w-0 truncate text-start hover:underline" onClick={() => openCase(x.record_id)}>{x.person} · {x.ref_no}</button><StatusChip s={x.status} /></div>{x.status === "planned" && <RecordSession s={x} done={refresh} />}</li>)}</ul>}
    {s.mode === "individual" && s.status === "planned" && <RecordSession s={s} done={refresh} />}
  </li>; };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, -7))}>الأسبوع السابق</Button><Button size="sm" variant="outline" onClick={() => setFrom(schoolToday())}>هذا الأسبوع</Button><Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, 7))}>الأسبوع التالي</Button><span className="text-sm text-muted-foreground">{from} ← {to}</span></div>
      <Button disabled={!a.cases.length} onClick={() => setForm(!form)}><CalendarPlus className="size-4" />جلسة أو موعد جديد</Button></div>
    {!a.cases.length && <p className="text-sm text-muted-foreground">لا توجد حالات معتمدة مفتوحة؛ الجلسات تُسجل لحالات مفتوحة أو قيد المتابعة.</p>}
    {form && <NewSession cases={a.cases} done={async () => { setForm(false); await refresh(); }} />}
    {a.unrecorded.length > 0 && <section className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="font-semibold">مواعيد مضت دون تسجيل نتيجة ({a.unrecorded.length})</h3><ul className="space-y-2">{groupRows(a.unrecorded).map((g) => <Card key={g[0]!.id} g={g} />)}</ul></section>}
    {!a.rows.length ? <EmptyState title="لا توجد جلسات في هذا الأسبوع" hint="احجز موعدًا من «جلسة أو موعد جديد» أو من تبويب «الجلسات» داخل الحالة." />
      : <div className="space-y-4">{days.map((d) => { const rows = a.rows.filter((r) => r.session_date === d); if (!rows.length) return null; return <section key={d} className="space-y-2"><h3 className="text-sm font-semibold">{DAY(d)}{d === a.today ? " · اليوم" : ""}</h3><ul className="space-y-2">{groupRows(rows).map((g) => <Card key={g[0]!.id} g={g} />)}</ul></section>; })}</div>}
  </div>;
}

function NewSession({ cases, done }: { cases: Agenda["cases"]; done: () => Promise<void> }) {
  const [mode, setMode] = useState<"individual" | "group">("individual"); const [ids, setIds] = useState<string[]>([]); const [absent, setAbsent] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [q, setQ] = useState("");
  const [v, setV] = useState({ status: "planned", session_date: "", start_time: "", place: "", topic: "", activity: "" });
  const issues = sessionIssues({ mode, caseCount: ids.length, status: v.status, date: v.session_date, topic: v.topic, activity: v.activity }, schoolToday());
  const toggle = (id: string) => setIds(mode === "individual" ? [id] : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  async function save() { setBusy(true); try { const r = await db.rpc("edu_case_session_save", { _p: { ...v, mode, case_ids: ids, per: Object.fromEntries(absent.filter((x) => ids.includes(x)).map((x) => [x, { attended: false }])) } }); if (r.error) throw r.error; toast.success(v.status === "planned" ? "حُجز الموعد" : "سُجلت الجلسة"); await done(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  const shown = cases.filter((c) => !q || c.person.includes(q) || c.ref_no.includes(q));
  return <section className="space-y-3 rounded-2xl border bg-card p-4">
    <div className="flex flex-wrap gap-2">{([["individual", "جلسة فردية"], ["group", "جلسة جماعية"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => { setMode(k); setIds([]); }} className={`rounded-full border px-3 py-1.5 text-sm ${mode === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{l}</button>)}<span className="mx-1 border-s" />{[["planned", "موعد قادم"], ["done", "جلسة منفذة"]].map(([k, l]) => <button key={k} type="button" aria-pressed={v.status === k} onClick={() => setV({ ...v, status: k! })} className={`rounded-full border px-3 py-1.5 text-sm ${v.status === k ? "border-primary bg-primary/10" : "bg-card"}`}>{l}</button>)}</div>
    <div className="space-y-1"><Label htmlFor="ns-q" className="text-xs">{mode === "group" ? `المشاركون (${ids.length})` : "الحالة"}</Label><Input id="ns-q" placeholder="اسم الطالب أو رقم الحالة" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="grid max-h-56 gap-1.5 overflow-y-auto pt-1 sm:grid-cols-2">{shown.map((c) => <li key={c.id} className="flex items-center gap-2"><button type="button" aria-pressed={ids.includes(c.id)} onClick={() => toggle(c.id)} className={`min-w-0 flex-1 truncate rounded-lg border px-3 py-2 text-start text-sm ${ids.includes(c.id) ? "border-primary bg-primary/5" : ""}`}>{c.person} · {c.ref_no}</button>{mode === "group" && v.status === "done" && ids.includes(c.id) && <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={absent.includes(c.id)} onChange={(e) => setAbsent(e.target.checked ? [...absent, c.id] : absent.filter((x) => x !== c.id))} />غائب</label>}</li>)}</ul></div>
    <div className="grid gap-2 sm:grid-cols-4">
      {mode === "group" && <div className="space-y-1 sm:col-span-4"><Label htmlFor="ns-t" className="text-xs">موضوع الجلسة الجماعية (يظهر دون تصنيفات)</Label><Input id="ns-t" maxLength={200} placeholder="مثال: مهارات تنظيم الوقت" value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} /></div>}
      <div className="space-y-1"><Label htmlFor="ns-d" className="text-xs">التاريخ</Label><Input id="ns-d" type="date" value={v.session_date} onChange={(e) => setV({ ...v, session_date: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="ns-h" className="text-xs">الوقت</Label><Input id="ns-h" type="time" value={v.start_time} onChange={(e) => setV({ ...v, start_time: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="ns-p" className="text-xs">المكان</Label><Input id="ns-p" maxLength={200} value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-4"><Label htmlFor="ns-a" className="text-xs">{v.status === "planned" ? "هدف الجلسة" : "ما نُفّذ في الجلسة"}</Label><Input id="ns-a" maxLength={1000} value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })} /></div>
    </div>
    {(ids.length > 0 || v.session_date) && issues.length > 0 && <ul className="list-disc ps-5 text-xs text-destructive">{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
    <Button disabled={busy || issues.length > 0} onClick={() => void save()}>{v.status === "planned" ? "حجز الموعد" : "حفظ الجلسة"}</Button>
    {mode === "group" && <p className="text-xs text-muted-foreground">تُحفظ الجلسة الجماعية سطرًا مستقلًا داخل كل حالة؛ ملاحظات كل طالب تبقى في حالته فقط.</p>}
  </section>;
}
