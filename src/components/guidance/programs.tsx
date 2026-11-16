import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { exportXlsx } from "@/lib/export";
import { PROGRAM_DOMAIN, PROGRAM_KIND, PROGRAM_STATUS, programIssues, schoolYear, type Program } from "./case-model";
import { schoolToday } from "./case-run";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
const MONTH = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { month: "long", year: "numeric" });
const blank = { kind: "preventive", domain: "behavioral", title: "", target: "", objectives: "", activities: "", indicator: "", start_date: "", end_date: "" };

export function Programs({ school, canExport }: { school: string; canExport: boolean }) {
  const [yr, setYr] = useState(() => schoolYear(schoolToday())); const [edit, setEdit] = useState<Program | "new" | null>(null); const [st, setSt] = useState("");
  const q = useQuery({ queryKey: ["edu-programs", school, yr.from], queryFn: () => rpc<{ can_edit: boolean; today: string; rows: Program[] }>("edu_prog_list", { _school: school, _from: yr.from, _to: yr.to }) });
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data; const rows = d.rows.filter((r) => !st || r.status === st); const refresh = async () => { await q.refetch(); };
  const months = [...new Set(rows.map((r) => r.start_date.slice(0, 7)))].sort();
  const shift = (n: number) => { const y = Number(yr.from.slice(0, 4)) + n; setYr({ from: `${y}-09-01`, to: `${y + 1}-08-31` }); };
  async function exp() {
    try { await rpc("edu_guidance_export_log", { _school: school, _report: "programs", _rows: rows.length, _filters: { from: yr.from, to: yr.to, format: "xlsx" } }); }
    catch (e) { return void toast.error(arabicError(e)); }
    exportXlsx({ title: "الخطة السنوية للتوجيه الطلابي", filters: [`${yr.from} ← ${yr.to}`, st ? PROGRAM_STATUS[st] ?? "" : "كل الحالات"] }, ["البرنامج", "النوع", "المجال", "الفئة المستهدفة", "البداية", "النهاية", "الحالة", "مؤشر النجاح", "ما تحقق", "المستفيدون"],
      rows.map((r) => [r.title, PROGRAM_KIND[r.kind], PROGRAM_DOMAIN[r.domain], r.target, r.start_date, r.end_date, PROGRAM_STATUS[r.status], r.indicator, r.outcome, r.participants]));
  }
  if (edit) return <ProgramForm school={school} row={edit === "new" ? undefined : edit} close={async (saved) => { setEdit(null); if (saved) await refresh(); }} />;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => shift(-1)}>العام السابق</Button><span className="text-sm font-medium">العام الدراسي {yr.from.slice(0, 4)}/{yr.to.slice(0, 4)}</span><Button size="sm" variant="outline" onClick={() => shift(1)}>العام التالي</Button>
        <select aria-label="حالة البرنامج" className={selectCls("w-40")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(PROGRAM_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="flex gap-2">{canExport && rows.length > 0 && <Button variant="outline" onClick={() => void exp()}><Download className="size-4" />تصدير Excel</Button>}{d.can_edit && <Button onClick={() => setEdit("new")}><Plus className="size-4" />برنامج جديد</Button>}</div>
    </div>
    {!d.can_edit && <p className="text-xs text-muted-foreground">عرض فقط؛ يُعد الموجّه الطلابي البرامج ويحدّث تنفيذها.</p>}
    {!rows.length ? <EmptyState title="لا توجد برامج في هذا العام" hint={d.can_edit ? "أضف البرامج الوقائية والإنمائية والعلاجية لتتكوّن الخطة السنوية شهرًا بشهر." : "لم يُضف الموجّه برامج بعد."} />
      : months.map((m) => <section key={m} className="space-y-2"><h3 className="text-sm font-semibold">{MONTH(m)}</h3><ul className="grid gap-3 md:grid-cols-2">{rows.filter((r) => r.start_date.startsWith(m)).map((r) => <ProgramCard key={r.id} r={r} canEdit={d.can_edit} today={d.today} edit={() => setEdit(r)} refresh={refresh} />)}</ul></section>)}
  </div>;
}

function ProgramCard({ r, canEdit, today, edit, refresh }: { r: Program; canEdit: boolean; today: string; edit: () => void; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    const p: Record<string, unknown> = {};
    if (action === "complete") { const oc = await askText("ما الذي تحقق مقارنة بمؤشر النجاح؟", { required: true, long: true }); if (!oc) return; const n = await askText("عدد المستفيدين (رقم)"); if (n === null) return; if (!/^\d+$/.test(n.trim())) return void toast.error("أدخل عدد المستفيدين أرقامًا"); p["outcome"] = oc; p["participants"] = Number(n.trim()); }
    if (action === "cancel" || action === "reopen") { const why = await askText(action === "cancel" ? "سبب الإلغاء" : "سبب إعادة الفتح", { required: true }); if (!why) return; p["reason"] = why; }
    setBusy(true); try { await rpc("edu_prog_act", { _id: r.id, _rev: r.rev, _action: action, _p: p }); toast.success("تم التحديث"); await refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const open = r.status === "planned" || r.status === "in_progress";
  return <li className="space-y-2 rounded-xl border bg-card p-4 text-sm">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><div className="min-w-0"><p className="font-semibold">{r.title}</p><p className="text-xs text-muted-foreground">{PROGRAM_KIND[r.kind]} · {PROGRAM_DOMAIN[r.domain]} · {r.start_date} ← {r.end_date}{r.target ? ` · ${r.target}` : ""}</p></div><span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs">{PROGRAM_STATUS[r.status]}</span></div>
    <p className="whitespace-pre-wrap">{r.objectives}</p>
    <p className="text-xs text-muted-foreground">مؤشر النجاح: {r.indicator}</p>
    {r.status === "done" && <p className="rounded-lg bg-muted/40 p-2 text-xs">ما تحقق: {r.outcome} · المستفيدون: {r.participants ?? "—"}</p>}
    {r.reason && <p className="text-xs text-muted-foreground">{r.status === "cancelled" ? "سبب الإلغاء" : "سبب إعادة الفتح"}: {r.reason}</p>}
    {canEdit && <div className="flex flex-wrap gap-2">{open && <Button size="sm" variant="ghost" onClick={edit}><Pencil className="size-4" />تعديل</Button>}{r.status === "planned" && <Button size="sm" variant="secondary" disabled={busy || r.start_date > today} onClick={() => void act("start")}>بدء التنفيذ</Button>}{open && <Button size="sm" disabled={busy || r.start_date > today} onClick={() => void act("complete")}>تسجيل التنفيذ</Button>}{open && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("cancel")}>إلغاء</Button>}{!open && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("reopen")}>إعادة فتح</Button>}</div>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">السجل ({r.events.length})</summary><ul className="mt-1 space-y-0.5">{r.events.map((e, i) => <li key={i}>{({ create: "إنشاء", update: "تعديل", start: "بدء", complete: "تسجيل التنفيذ", cancel: "إلغاء", reopen: "إعادة فتح" } as Record<string, string>)[e.action] ?? e.action} · {e.actor_name} · {new Date(e.created_at).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</li>)}</ul></details>
  </li>;
}

function ProgramForm({ school, row, close }: { school: string; row?: Program | undefined; close: (saved: boolean) => void | Promise<void> }) {
  const [v, setV] = useState(row ? { kind: row.kind, domain: row.domain, title: row.title, target: row.target, objectives: row.objectives, activities: row.activities, indicator: row.indicator, start_date: row.start_date, end_date: row.end_date } : blank);
  const [busy, setBusy] = useState(false); const issues = programIssues(v); const [tried, setTried] = useState(false);
  async function save() { setTried(true); if (issues.length) return; setBusy(true); try { await rpc("edu_prog_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: v }); toast.success("حُفظ البرنامج"); await close(true); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  const T = (k: keyof typeof v, l: string, rows = 3, hint = "") => <div className="space-y-1"><Label htmlFor={`pg-${k}`}>{l}</Label><Textarea id={`pg-${k}`} rows={rows} maxLength={3000} placeholder={hint} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>;
  return <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border bg-card p-5">
    <h3 className="text-lg font-bold">{row ? "تعديل البرنامج" : "برنامج جديد"}</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="pg-title">عنوان البرنامج</Label><Input id="pg-title" maxLength={200} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="pg-kind">النوع</Label><select id="pg-kind" className={selectCls("w-full")} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{Object.entries(PROGRAM_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="pg-domain">المجال</Label><select id="pg-domain" className={selectCls("w-full")} value={v.domain} onChange={(e) => setV({ ...v, domain: e.target.value })}>{Object.entries(PROGRAM_DOMAIN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="pg-start">البداية</Label><Input id="pg-start" type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="pg-end">النهاية</Label><Input id="pg-end" type="date" value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="pg-target">الفئة المستهدفة (دون أسماء)</Label><Input id="pg-target" maxLength={500} placeholder="مثال: طلاب الصف الأول المتوسط" value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} /></div>
    </div>
    {T("objectives", "الأهداف")}{T("activities", "الأنشطة والإجراءات", 3)}{T("indicator", "مؤشر النجاح", 2, "مثال: انخفاض حالات التأخر الأسبوعية")}
    {tried && issues.length > 0 && <ul className="list-disc ps-5 text-sm text-destructive">{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
    <div className="flex gap-2"><Button disabled={busy} onClick={() => void save()}>حفظ البرنامج</Button><Button variant="ghost" onClick={() => void close(false)}>إلغاء</Button></div>
  </div>;
}
