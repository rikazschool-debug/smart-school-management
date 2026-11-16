import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, FileDown, FileSpreadsheet, Filter, Info, LayoutDashboard, List, Plus, Printer, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { schoolTime } from "@/lib/homework";
import { EDU_AREAS, EDU_CATEGORIES, EDU_LABELS, EDU_LEVELS, EDU_PRIORITY, EDU_STATUS, EDU_TEXT, EMPTY_FILTER, filterLabels, goalDone, isOverdue, planProgress, type EduFilter, type EduKind, type EduRecord, type EduStats } from "./model";
import { EduDashboard } from "./stats";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
type List = { rows: EduRecord[]; total: number; can_create: boolean; can_export: boolean };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const PRIORITY_TONE: Record<string, string> = { low: "bg-muted text-muted-foreground", normal: "bg-secondary", high: "bg-accent text-accent-foreground", urgent: "bg-destructive/15 text-destructive" };
const teacherKind = (k: EduKind) => k === "teacher_plan" || k === "supervision";

function rowCells(kind: EduKind, r: EduRecord) {
  return [r.person, r.title, EDU_CATEGORIES[kind][r.category] ?? r.category, EDU_AREAS[kind].options[r.area] ?? "", EDU_PRIORITY[r.priority] ?? "", r.record_date, r.due_date ?? "", EDU_STATUS[r.status] ?? r.status,
    kind === "supervision" ? (r.rating ? `${r.rating}/5` : "") : r.goals.length ? `${r.goals_done ?? 0}/${r.goals.length}` : "", r.course ?? ""];
}
const HEADERS = (kind: EduKind) => [teacherKind(kind) ? "المعلم" : "الطالب", "العنوان", "التصنيف", EDU_AREAS[kind].label, "الأولوية", "التاريخ", "موعد المراجعة", "الحالة", kind === "supervision" ? "التقدير" : "الإنجاز", "المقرر"];

export function EducationDesk({ title, kinds }: { title: string; kinds: EduKind[] }) {
  const { active } = useSession(); const school = active?.schoolId; const qc = useQueryClient();
  const [kind, setKind] = useState<EduKind>(kinds[0] ?? "case"); const [f, setF] = useState<EduFilter>(EMPTY_FILTER); const [page, setPage] = useState(0);
  const [view, setView] = useState<"dashboard" | "records">("dashboard"); const [showGuide, setShowGuide] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); const [creating, setCreating] = useState(false); const [exporting, setExporting] = useState(false);
  const list = useQuery({ queryKey: ["edu-list", school, kind, f, page], enabled: !!school, queryFn: () => rpc<List>("edu_find", { _school: school, _kind: kind, _f: f, _offset: page * 25, _limit: 25 }) });
  const stats = useQuery({ queryKey: ["edu-stats", school, kind, f], enabled: !!school, queryFn: () => rpc<EduStats>("edu_stats", { _school: school, _kind: kind, _f: f }) });
  if (!school) return <EmptyState title="اختر مدرسة أولًا" />;
  const set = (patch: Partial<EduFilter>) => { setF({ ...f, ...patch }); setPage(0); };
  async function doExport(format: "xlsx" | "pdf" | "print") {
    setExporting(true);
    try {
      const all: EduRecord[] = []; let offset = 0; let total = 0;
      do { const res = await rpc<List>("edu_find", { _school: school, _kind: kind, _f: f, _offset: offset, _limit: 500 }); total = res.total; all.push(...res.rows); offset += 500; if (!res.rows.length) break; } while (offset < total);
      const s = stats.data; const meta = { title: `${title} — ${EDU_LABELS[kind]}`, school: active?.schoolName, filters: filterLabels(kind, f), note: s ? `الإجمالي ${s.total} · مفتوحة ${s.open} · متأخرة ${s.overdue}${kind === "supervision" && s.avg_rating ? ` · متوسط التقدير ${s.avg_rating}` : ""}` : undefined };
      const rows = all.map((r) => rowCells(kind, r));
      if (format === "xlsx") exportXlsx(meta, HEADERS(kind), rows); else if (format === "pdf") await exportPdf(meta, HEADERS(kind), rows); else printReport(meta, HEADERS(kind), rows);
    } catch (e) { toast.error(arabicError(e)); } finally { setExporting(false); }
  }
  const done = () => { for (const k of ["edu-list", "edu-detail", "edu-stats"]) void qc.invalidateQueries({ queryKey: [k] }); };
  const t = today(); const filtered = filterLabels(kind, f).length > 0;
  return <div className="space-y-5">
    <PageHeader title={title} desc={EDU_LABELS[kind]} action={list.data?.can_create ? <Button onClick={() => setCreating(true)}><Plus className="size-4" />إضافة سجل</Button> : undefined} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      {kinds.length > 1 ? <Tabs value={kind} onValueChange={(v) => { setKind(v as EduKind); setF(EMPTY_FILTER); setPage(0); }} dir="rtl"><TabsList className="h-auto flex-wrap">{kinds.map((k) => <TabsTrigger key={k} value={k} className="px-4">{EDU_LABELS[k]}</TabsTrigger>)}</TabsList></Tabs> : <span />}
      <div className="flex gap-2"><Button size="sm" variant={view === "dashboard" ? "default" : "outline"} onClick={() => setView("dashboard")}><LayoutDashboard className="size-4" />لوحة المعلومات</Button><Button size="sm" variant={view === "records" ? "default" : "outline"} onClick={() => setView("records")}><List className="size-4" />السجلات</Button><Button size="sm" variant="ghost" aria-expanded={showGuide} onClick={() => setShowGuide(!showGuide)}><Info className="size-4" />آلية العمل</Button></div>
    </div>
    {showGuide && <p className="rounded-lg border-s-4 border-primary bg-muted/40 p-3 text-sm leading-7">{EDU_TEXT[kind].hint}</p>}
    {kind === "case" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />سجلات سرية — تظهر للموجّه الطلابي ومن مُنح الصلاحية فقط، ولا تُشارك مع ولي الأمر</p>}
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2"><Filter className="size-4 text-muted-foreground" /><div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث في السجلات" placeholder="بحث بالعنوان أو الاسم" className="ps-9" value={f.q} onChange={(e) => set({ q: e.target.value })} /></div>
        {list.data?.can_export && (["xlsx", "pdf", "print"] as const).map((x) => <Button key={x} variant="outline" size="sm" disabled={exporting} onClick={() => void doExport(x)}>{x === "xlsx" ? <FileSpreadsheet className="size-4" /> : x === "pdf" ? <FileDown className="size-4" /> : <Printer className="size-4" />}{x === "print" ? "طباعة" : x === "xlsx" ? "Excel" : "PDF"}</Button>)}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        <select aria-label="التصنيف" className={selectCls("w-full")} value={f.category} onChange={(e) => set({ category: e.target.value })}><option value="">كل التصنيفات</option>{Object.entries(EDU_CATEGORIES[kind]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label={EDU_AREAS[kind].label} className={selectCls("w-full")} value={f.area} onChange={(e) => set({ area: e.target.value })}><option value="">{EDU_AREAS[kind].label}: الكل</option>{Object.entries(EDU_AREAS[kind].options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="الحالة" className={selectCls("w-full")} value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(EDU_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="الأولوية" className={selectCls("w-full")} value={f.priority} onChange={(e) => set({ priority: e.target.value })}><option value="">كل الأولويات</option>{Object.entries(EDU_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <Input type="date" aria-label="من تاريخ" value={f.from} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="إلى تاريخ" value={f.to} onChange={(e) => set({ to: e.target.value })} />
        <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.overdue} onChange={(e) => set({ overdue: e.target.checked })} />المتأخرة</label>{filtered && <Button size="sm" variant="ghost" onClick={() => { setF(EMPTY_FILTER); setPage(0); }}><RotateCcw className="size-4" />مسح</Button>}</div>
      </div>
    </div>
    {view === "dashboard" ? (stats.isLoading ? <LoadingState /> : stats.error ? <ErrorState message={arabicError(stats.error)} onRetry={() => stats.refetch()} /> : stats.data ? <EduDashboard kind={kind} s={stats.data} filter={f} pick={(field, v) => { set({ [field]: v }); setView("records"); }} /> : null)
      : list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.rows.length ? <EmptyState title={filtered ? "لا توجد سجلات مطابقة للتصفية" : "لا توجد سجلات ضمن صلاحيتك"} />
      : <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{HEADERS(kind).slice(0, 9).map((h) => <th key={h} className="whitespace-nowrap p-3 text-start font-medium">{h}</th>)}</tr></thead><tbody>{list.data.rows.map((r) => { const c = rowCells(kind, r); return <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setSelected(r.id)}><td className="p-3 font-medium">{c[0]}</td><td className="p-3"><span className="font-semibold text-primary">{r.title}</span>{r.shared && <span className="ms-2 text-xs text-primary">· مشترك مع ولي الأمر</span>}{r.course && <span className="block text-xs text-muted-foreground">{r.course}</span>}</td><td className="whitespace-nowrap p-3">{c[2]}</td><td className="whitespace-nowrap p-3">{c[3] || "—"}</td><td className="p-3"><span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs ${PRIORITY_TONE[r.priority] ?? ""}`}>{c[4]}</span></td><td className="whitespace-nowrap p-3">{c[5]}</td><td className={`whitespace-nowrap p-3 ${isOverdue(r, t) ? "font-semibold text-destructive" : ""}`}>{c[6] || "—"}</td><td className="whitespace-nowrap p-3"><span className="rounded-md bg-secondary px-2 py-0.5 text-xs">{c[7]}</span></td><td className="whitespace-nowrap p-3">{c[8] || "—"}</td></tr>; })}</tbody></table></div>}
    {view === "records" && (list.data?.total ?? 0) > 25 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>السابق</Button><span className="text-sm">{page + 1} / {Math.ceil((list.data?.total ?? 0) / 25)}</span><Button variant="outline" disabled={(page + 1) * 25 >= (list.data?.total ?? 0)} onClick={() => setPage(page + 1)}>التالي</Button></div>}
    <Dialog open={creating || !!selected} onOpenChange={(open) => { if (!open) { setCreating(false); setSelected(null); } }}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{EDU_LABELS[kind]}</DialogTitle></DialogHeader>{selected ? <RecordDetail id={selected} school={school} schoolName={active?.schoolName} changed={done} /> : creating ? <RecordEditor school={school} kind={kind} done={(id) => { setCreating(false); setSelected(id); done(); }} /> : null}</DialogContent></Dialog>
  </div>;
}

function RecordEditor({ school, kind, row, done }: { school: string; kind: EduKind; row?: EduRecord; done: (id: string) => void }) {
  const categories = EDU_CATEGORIES[kind]; const areas = EDU_AREAS[kind]; const text = EDU_TEXT[kind];
  const [personQ, setPersonQ] = useState(""); const [person, setPerson] = useState(row?.student_id ?? row?.teacher_id ?? "");
  const [v, setV] = useState({ title: row?.title ?? "", description: row?.description ?? "", category: row?.category ?? Object.keys(categories)[0] ?? "", area: row?.area ?? "", priority: row?.priority ?? "normal", record_date: row?.record_date ?? today(), due_date: row?.due_date ?? "", actions: row?.actions ?? "", level: row?.level ?? "", rating: row?.rating ? String(row.rating) : "", status: row?.status ?? "open", shared: row?.shared ?? false });
  const [course, setCourse] = useState(row?.course_id ?? ""); const [goals, setGoals] = useState<string[]>(row?.goals?.length ? row.goals : [""]); const [busy, setBusy] = useState(false);
  const teachers = teacherKind(kind); const locked = !!row?.followups?.some((x) => x.goal_index !== null);
  const pool = useQuery({ queryKey: ["edu-pool", school, kind, personQ], enabled: !row, queryFn: () => rpc<{ id: string; name: string }[]>("edu_pool", { _school: school, _kind: kind, _q: personQ }) });
  const courses = useQuery({ queryKey: ["edu-courses", person], enabled: kind === "student_plan" && !!person && !row, queryFn: () => rpc<{ id: string; name: string }[]>("edu_courses", { _student: person }) });
  const field = (k: keyof typeof v) => ({ value: String(v[k]), onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  return <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const id = await rpc<string>("edu_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: { kind, ...v, rating: v.rating || null, due_date: v.due_date || null, student_id: teachers ? null : person, teacher_id: teachers ? person : null, course_id: kind === "student_plan" ? course : null, goals: goals.map((g) => g.trim()).filter(Boolean) } }); toast.success("حُفظ السجل"); done(id); } catch (err) { toast.error(arabicError(err)); } finally { setBusy(false); } }}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="edu-person">{teachers ? "المعلم" : "الطالب"}</Label>{row ? <p className="text-sm">{row.person}</p> : <><Input aria-label={teachers ? "البحث عن معلم" : "البحث عن طالب"} placeholder="بحث بالاسم" value={personQ} onChange={(e) => setPersonQ(e.target.value)} /><select id="edu-person" className={selectCls("w-full")} value={person} required onChange={(e) => { setPerson(e.target.value); setCourse(""); }}><option value="">اختر</option>{pool.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{pool.error && <ErrorState message={arabicError(pool.error)} />}</>}</div>
      {kind === "student_plan" ? <div className="space-y-2"><Label htmlFor="edu-course">المقرر</Label>{row ? <p className="text-sm">{row.course ?? "المقرر المرتبط بالخطة"}</p> : <><select id="edu-course" required className={selectCls("w-full")} value={course} onChange={(e) => setCourse(e.target.value)}><option value="">اختر مقرر الطالب</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{courses.error && <ErrorState message={arabicError(courses.error)} />}</>}</div> : <span className="hidden sm:block" />}
      <div className="space-y-2"><Label htmlFor="edu-cat">التصنيف</Label><select id="edu-cat" className={selectCls("w-full")} {...field("category")}>{Object.entries(categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="edu-area">{areas.label}</Label><select id="edu-area" className={selectCls("w-full")} {...field("area")}><option value="">—</option>{Object.entries(areas.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="edu-date">{kind === "supervision" ? "تاريخ الزيارة" : "التاريخ"}</Label><Input id="edu-date" type="date" required {...field("record_date")} /></div>
      <div className="space-y-2"><Label htmlFor="edu-due">{kind === "supervision" ? "موعد زيارة المتابعة" : "موعد المراجعة / نهاية الخطة"}</Label><Input id="edu-due" type="date" min={v.record_date} {...field("due_date")} /></div>
      <div className="space-y-2"><Label htmlFor="edu-pr">الأولوية</Label><select id="edu-pr" className={selectCls("w-full")} {...field("priority")}>{Object.entries(EDU_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="edu-status">الحالة</Label><select id="edu-status" className={selectCls("w-full")} {...field("status")}>{Object.entries(EDU_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      {kind === "talent" && <div className="space-y-2"><Label htmlFor="edu-lv">مستوى الإنجاز / المشاركة</Label><select id="edu-lv" className={selectCls("w-full")} {...field("level")}><option value="">—</option>{Object.entries(EDU_LEVELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
      {kind === "supervision" && <div className="space-y-2"><Label htmlFor="edu-rt">التقدير العام (1–5)</Label><select id="edu-rt" className={selectCls("w-full")} {...field("rating")}><option value="">بدون تقدير</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>}
    </div>
    <div className="space-y-2"><Label htmlFor="edu-title">العنوان</Label><Input id="edu-title" required minLength={2} maxLength={200} {...field("title")} /></div>
    <div className="space-y-2"><Label htmlFor="edu-description">{text.description}</Label><Textarea id="edu-description" required rows={4} maxLength={12000} {...field("description")} /></div>
    <div className="space-y-2"><Label htmlFor="edu-actions">{text.actions}</Label><Textarea id="edu-actions" rows={3} maxLength={8000} {...field("actions")} /></div>
    <div className="space-y-2 border-t pt-4"><Label>{text.goals}</Label>{locked && <p className="text-xs text-muted-foreground">بدأت متابعة التوصيات؛ لا يمكن تغييرها في هذه الخطة.</p>}{goals.map((g, i) => <div key={i} className="flex items-center gap-2"><span className="w-6 text-sm text-muted-foreground">{i + 1}.</span><Input aria-label={`التوصية ${i + 1}`} value={g} maxLength={1000} disabled={locked} onChange={(e) => setGoals(goals.map((x, j) => j === i ? e.target.value : x))} /><Button type="button" variant="ghost" size="icon" aria-label={`حذف التوصية ${i + 1}`} disabled={locked} onClick={() => setGoals(goals.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></div>)}<Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => setGoals([...goals, ""])}><Plus className="size-4" />إضافة</Button></div>
    {kind === "student_plan" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.shared} onChange={(e) => setV({ ...v, shared: e.target.checked })} />مشاركة الخطة مع ولي الأمر وطلب إقرار الاطلاع</label>}
    <div className="flex justify-end border-t pt-4"><Button disabled={busy || !person || (kind === "student_plan" && !course)}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button></div>
  </form>;
}

function RecordDetail({ id, school, schoolName, changed }: { id: string; school: string; schoolName?: string | undefined; changed: () => void }) {
  const detail = useQuery({ queryKey: ["edu-detail", id], queryFn: () => rpc<EduRecord>("edu_detail", { _id: id }) }); const [editing, setEditing] = useState(false); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  if (detail.isLoading) return <LoadingState />; if (detail.error) return <ErrorState message={arabicError(detail.error)} />; const r = detail.data; if (!r) return null;
  async function follow(goal: number | null, completed: boolean | null) { if (!r) return; setBusy(true); try { await rpc("edu_follow", { _id: id, _rev: r.rev, _goal: goal, _completed: completed, _note: note.trim() || (goal === null ? "" : completed ? "تأكيد إنجاز الهدف" : "إعادة فتح متابعة الهدف") }); setNote(""); changed(); await detail.refetch(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  if (editing) return <RecordEditor school={school} kind={r.kind} row={r} done={() => { setEditing(false); changed(); void detail.refetch(); }} />;
  const p = planProgress(r.goals, r.followups ?? []); const text = EDU_TEXT[r.kind];
  const facts: [string, string][] = ([["التصنيف", EDU_CATEGORIES[r.kind][r.category] ?? r.category], [EDU_AREAS[r.kind].label, EDU_AREAS[r.kind].options[r.area] ?? ""], ["الأولوية", EDU_PRIORITY[r.priority] ?? ""], ["التاريخ", r.record_date], ["موعد المراجعة", r.due_date ?? ""], ["الحالة", EDU_STATUS[r.status] ?? r.status], ["المقرر", r.course ?? ""], ["المستوى", EDU_LEVELS[r.level] ?? ""], ["التقدير", r.rating ? `${r.rating} / 5` : ""]] as [string, string][]).filter(([, x]) => x);
  const print = () => printReport({ title: `${EDU_LABELS[r.kind]} — ${r.title}`, school: schoolName, filters: [r.person] }, ["البند", "القيمة"], [...facts, [text.description, r.description], [text.actions, r.actions], ...r.goals.map((g, i) => [`${i + 1}. ${g}`, goalDone(r.followups ?? [], i) ? "منجز ✓" : "قيد المتابعة"] as [string, string]), ...(r.followups ?? []).map((x) => [`متابعة — ${schoolTime(x.created_at)}`, `${x.note} (${x.actor_name})`] as [string, string])].filter(([, x]) => x));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{r.title}</h2><p className="mt-1 text-sm text-muted-foreground">{r.person}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={print}><Printer className="size-4" />طباعة</Button>{r.can_edit && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>تعديل</Button>}</div></div>
    <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">{facts.map(([k, x]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{x}</dd></div>)}</dl>
    <section><h3 className="mb-1 text-sm font-semibold">{text.description}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{r.description}</p></section>
    {r.actions && <section><h3 className="mb-1 text-sm font-semibold">{text.actions}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{r.actions}</p></section>}
    {r.goals.length > 0 && <section className="space-y-3 border-y py-4"><h3 className="flex items-center justify-between text-sm font-semibold"><span>{text.goals}</span><span className="text-primary">{p.done} / {p.total}</span></h3><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>{r.goals.map((g, i) => <label key={i} className="flex items-start gap-3 text-sm"><input className="mt-1 size-4 shrink-0" type="checkbox" aria-label={`إنجاز الهدف ${i + 1}`} checked={goalDone(r.followups ?? [], i)} disabled={!r.can_edit || busy} onChange={(e) => void follow(i, e.target.checked)} /><span>{i + 1}. {g}</span></label>)}</section>}
    {r.can_ack && <div className="space-y-2 border-b pb-4"><Button variant="outline" disabled={busy || !!r.acks?.length} onClick={async () => { setBusy(true); try { await rpc("edu_ack", { _id: id, _rev: r.rev }); toast.success("سُجل إقرار الاطلاع"); await detail.refetch(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }}><ClipboardCheck className="size-4" />{r.acks?.length ? "تم إقرار الاطلاع" : "أقر باطلاعي على الخطة"}</Button></div>}
    {r.kind === "student_plan" && r.shared && r.can_edit && <p className="text-xs text-muted-foreground">{r.acks?.length ? r.acks.map((a) => `أقر ${a.name} بالاطلاع — ${schoolTime(a.created_at)}`).join(" · ") : "لم يُقر ولي الأمر بالاطلاع على النسخة الحالية بعد"}</p>}
    <section className="space-y-3"><h3 className="text-sm font-semibold">سجل المتابعة والإجراءات</h3>{!r.followups?.length ? <p className="text-sm text-muted-foreground">لا توجد متابعة مسجلة بعد</p> : <ol className="space-y-3 border-s ps-4">{r.followups.map((x) => <li key={x.id}><p className="whitespace-pre-wrap break-words text-sm">{x.note}</p><p className="mt-1 text-xs text-muted-foreground">{x.actor_name} · {schoolTime(x.created_at)}</p></li>)}</ol>}{r.can_edit && <div className="space-y-2"><Textarea aria-label="ملاحظة المتابعة والإجراء" placeholder="المتابعة والإجراء" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} /><Button variant="outline" size="sm" disabled={busy || !note.trim()} onClick={() => void follow(null, null)}><Plus className="size-4" />إضافة متابعة</Button></div>}</section>
  </div>;
}
