import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, FileDown, FileSpreadsheet, FolderCheck, Printer, RotateCcw, Search, Target, UserRound } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { EDU_CATEGORIES, EDU_LABELS, EMPTY_PLAN_FILTER, OUTCOMES, PLAN_STATUS, PLAN_TABS, pct, type EduKind, type EduRecord, type EduStats, type PlanFilter, type PlanTab } from "./model";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
type List = { rows: EduRecord[]; total: number; can_create: boolean; can_export: boolean };
type Opt = { id: string; name: string; stage_id?: string; grade_id?: string; section_id?: string };
type Opts = { stages: Opt[]; grades: Opt[]; sections: Opt[]; courses: Opt[]; teachers: Opt[] };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const progress = (r: EduRecord) => r.goals.length ? `الأنشطة ${r.goals_done ?? 0}/${r.goals.length} · الإتقان ${r.mastered ?? 0}/${r.goals.length}` : "—";
const cells = (kind: EduKind, r: EduRecord) => [r.person, r.title, r.course ? `${r.course}${r.section_label ? ` (${r.section_label})` : ""}` : "", r.skill || (EDU_CATEGORIES[kind][r.category] ?? ""), r.responsible || r.owner_name || "", PLAN_STATUS[r.status] ?? r.status, r.next_date ?? "", progress(r), r.last_session ?? "لا جلسات"];

/** Remedial/teacher plan dashboard: tabs, filters, clickable counters and a follow-up table. */
export function PlanBoard({ school, schoolName, kind, title, open, create }: { school: string; schoolName?: string | undefined; kind: EduKind; title: string; open: (id: string) => void; create?: (() => void) | undefined }) {
  const [f, setF] = useState<PlanFilter>(EMPTY_PLAN_FILTER); const [page, setPage] = useState(0); const [busy, setBusy] = useState(false);
  const set = (x: Partial<PlanFilter>) => { setF({ ...f, ...x }); setPage(0); };
  const base = { ...f, tab: "" as PlanTab };
  const list = useQuery({ queryKey: ["edu-list", school, kind, f, page], queryFn: () => rpc<List>("edu_find", { _school: school, _kind: kind, _f: f, _offset: page * 25, _limit: 25 }) });
  const stats = useQuery({ queryKey: ["edu-stats", school, kind, base], queryFn: () => rpc<EduStats>("edu_stats", { _school: school, _kind: kind, _f: base }) });
  const opts = useQuery({ queryKey: ["edu-plan-filters", school, kind], queryFn: () => rpc<Opts>("edu_plan_filters", { _school: school, _kind: kind }) });
  const o = opts.data; const s = stats.data; const student = kind === "student_plan";
  const filtered = !!(f.q || f.status || f.stage || f.grade || f.section || f.course || f.teacher || f.from || f.to || f.category);
  const headers = [student ? "الطالب" : "المعلم", "الخطة", "المقرر", student ? "المهارة" : "المجال", "المسؤول", "الحالة", "الموعد القادم", "التقدم", "آخر متابعة"];
  async function doExport(fmt: "xlsx" | "pdf" | "print") {
    setBusy(true);
    try {
      const all: EduRecord[] = []; let off = 0; let total = 0;
      do { const r = await rpc<List>("edu_find", { _school: school, _kind: kind, _f: f, _offset: off, _limit: 500 }); total = r.total; all.push(...r.rows); off += 500; if (!r.rows.length) break; } while (off < total);
      const labels = [f.tab ? PLAN_TABS[f.tab] : "كل الخطط", ...[o?.stages.find((x) => x.id === f.stage)?.name, o?.grades.find((x) => x.id === f.grade)?.name, o?.sections.find((x) => x.id === f.section)?.name, o?.courses.find((x) => x.id === f.course)?.name, o?.teachers.find((x) => x.id === f.teacher)?.name, f.status && PLAN_STATUS[f.status], f.from && `من ${f.from}`, f.to && `إلى ${f.to}`].filter((x): x is string => !!x)];
      const meta = { title: `${title} — ${EDU_LABELS[kind]}`, school: schoolName, filters: labels, note: s ? `تنفيذ الأنشطة ${s.goals_done}/${s.goals_total} · إتقان الأهداف ${s.goals_mastered ?? 0}/${s.goals_total} — تنفيذ النشاط لا يعني إتقان الهدف` : undefined };
      const rows = all.map((r) => cells(kind, r));
      if (fmt === "xlsx") exportXlsx(meta, headers, rows); else if (fmt === "pdf") await exportPdf(meta, headers, rows); else printReport(meta, headers, rows);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const sel = (label: string, key: keyof PlanFilter, items: Opt[] | undefined, reset: Partial<PlanFilter> = {}) => <select aria-label={label} className={selectCls("w-full")} value={f[key] as string} onChange={(e) => set({ [key]: e.target.value, ...reset })}><option value="">{label}: الكل</option>{items?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
  const card = (tab: Exclude<PlanTab, "">, icon: typeof ClipboardList, n: number | undefined, tone = "") => { const I = icon; const on = f.tab === tab; return <button type="button" aria-pressed={on} onClick={() => set({ tab: on ? "" : tab })} className={`rounded-xl border p-4 text-start transition-colors ${on ? "border-primary bg-primary/10" : "bg-card hover:bg-muted/40"}`}><I className={`mb-2 size-5 ${tone || "text-primary"}`} /><p className="text-xs text-muted-foreground">{PLAN_TABS[tab]}</p><p className={`text-2xl font-bold ${tone}`}>{n ?? "—"}</p></button>; };
  if (s && s.total === 0 && !filtered && create) return <section className="space-y-4 rounded-xl border bg-card p-6 text-center"><ClipboardList className="mx-auto size-10 text-primary" /><h2 className="text-lg font-bold">لا توجد خطط بعد</h2>
    <ol className="mx-auto max-w-md space-y-2 text-start text-sm leading-7">{(student ? ["اختر الطالب والمقرر.", "وثّق الاحتياج: المهارة ومستوى البداية ومصدر الدليل.", "اكتب أهدافًا قابلة للقياس مع الأنشطة وطريقة التحقق.", "اجعل الخطة جاهزة ثم ابدأ تسجيل الجلسات والقياسات."] : ["اختر المعلم المسند إليك.", "حدد مجال الممارسة ومصدر الاحتياج (مثل زيارة إشرافية).", "اكتب الأهداف ومؤشرات التحقق وإجراءات الدعم.", "اجعل الخطة جاهزة وتابع ملاحظات المعلم والأثر."]).map((x, i) => <li key={x} className="flex gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>{x}</li>)}</ol>
    <Button onClick={create}>إنشاء أول خطة</Button></section>;
  return <div className="space-y-4">
    {stats.error ? <ErrorState message={arabicError(stats.error)} onRetry={() => stats.refetch()} /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {card("mine", UserRound, s?.mine)}{card("active", ClipboardList, s?.active)}{card("attention", AlertTriangle, s?.attention, s?.attention ? "text-destructive" : "")}{card("closed", FolderCheck, s?.closed)}
      <div className="rounded-xl border bg-card p-4"><CheckCircle2 className="mb-2 size-5 text-primary" /><p className="text-xs text-muted-foreground">تنفيذ الأنشطة</p><p className="text-2xl font-bold">{s ? `${pct(s.goals_done, s.goals_total)}%` : "—"}</p><p className="text-xs text-muted-foreground">{s ? `${s.goals_done} من ${s.goals_total} هدفًا` : ""}</p></div>
      <div className="rounded-xl border bg-card p-4"><Target className="mb-2 size-5 text-primary" /><p className="text-xs text-muted-foreground">إتقان الأهداف</p><p className="text-2xl font-bold">{s ? `${pct(s.goals_mastered ?? 0, s.goals_total)}%` : "—"}</p><p className="text-xs text-muted-foreground">{s ? `${s.goals_mastered ?? 0} من ${s.goals_total} — مؤكد بقياس` : ""}</p></div>
    </div>}
    <p className="text-xs text-muted-foreground">تنفيذ النشاط لا يعني إتقان الهدف؛ الإتقان يُسجَّل فقط بعد قياس. «تحتاج متابعة»: خطة جارية تجاوزت موعد مراجعتها، أو بلا جلسة منذ 14 يومًا، أو بانتظار المراجعة.{s?.by_outcome && Object.keys(s.by_outcome).length ? ` نتائج الإغلاق: ${Object.entries(s.by_outcome).map(([k, n]) => `${OUTCOMES[k] ?? k} ${n}`).join("، ")}.` : ""}</p>
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث في الخطط" placeholder={student ? "بحث باسم الطالب أو رقم C-Smart أو العنوان" : "بحث باسم المعلم أو العنوان"} className="ps-9" value={f.q} onChange={(e) => set({ q: e.target.value })} /></div>
        {list.data?.can_export && (["xlsx", "pdf", "print"] as const).map((x) => <Button key={x} variant="outline" size="sm" disabled={busy} onClick={() => void doExport(x)}>{x === "xlsx" ? <FileSpreadsheet className="size-4" /> : x === "pdf" ? <FileDown className="size-4" /> : <Printer className="size-4" />}{x === "print" ? "طباعة" : x === "xlsx" ? "Excel" : "PDF"}</Button>)}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {student && <>{sel("المرحلة", "stage", o?.stages, { grade: "", section: "", course: "" })}{sel("الصف", "grade", o?.grades.filter((x) => !f.stage || x.stage_id === f.stage), { section: "", course: "" })}{sel("الشعبة", "section", o?.sections.filter((x) => !f.grade || x.grade_id === f.grade), { course: "" })}{sel("المقرر", "course", o?.courses.filter((x) => (!f.section || x.section_id === f.section) && (!f.grade || x.grade_id === f.grade) && (!f.stage || x.stage_id === f.stage)))}</>}
        {sel("المعلم", "teacher", o?.teachers)}
        <select aria-label="الحالة" className={selectCls("w-full")} value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">الحالة: الكل</option>{Object.entries(PLAN_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <Input type="date" aria-label="من تاريخ" value={f.from} onChange={(e) => set({ from: e.target.value })} /><Input type="date" aria-label="إلى تاريخ" value={f.to} onChange={(e) => set({ to: e.target.value })} />
        {filtered && <Button size="sm" variant="ghost" onClick={() => { setF({ ...EMPTY_PLAN_FILTER, tab: f.tab }); setPage(0); }}><RotateCcw className="size-4" />مسح التصفية</Button>}
      </div>
    </div>
    {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.rows.length ? <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">{filtered || f.tab ? "لا توجد خطط مطابقة. جرّب تبويبًا آخر أو امسح التصفية." : "لا توجد خطط ضمن صلاحيتك."}</p>
      : <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{headers.map((h) => <th key={h} className="whitespace-nowrap p-3 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{list.data.rows.map((r) => { const c = cells(kind, r); const late = !!r.due_date && r.due_date < today() && ["active", "review"].includes(r.status); return <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => open(r.id)}>
          <td className="p-3 font-medium">{c[0]}</td><td className="p-3"><span className="font-semibold text-primary">{r.title}</span>{r.attention && <span className="ms-2 whitespace-nowrap rounded bg-destructive/10 px-1.5 text-xs text-destructive">تحتاج متابعة</span>}</td><td className="p-3 text-xs">{c[2] || "—"}</td><td className="p-3">{c[3] || "—"}</td><td className="p-3">{c[4] || "—"}</td>
          <td className="whitespace-nowrap p-3"><span className="rounded-md bg-secondary px-2 py-0.5 text-xs">{c[5]}</span></td><td className={`whitespace-nowrap p-3 ${late ? "font-semibold text-destructive" : ""}`}>{late ? `متأخرة (${r.due_date})` : c[6] || "—"}</td><td className="whitespace-nowrap p-3 text-xs">{c[7]}</td><td className="whitespace-nowrap p-3">{c[8]}</td></tr>; })}</tbody></table></div>}
    {(list.data?.total ?? 0) > 25 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>السابق</Button><span className="text-sm">{page + 1} / {Math.ceil((list.data?.total ?? 0) / 25)}</span><Button variant="outline" disabled={(page + 1) * 25 >= (list.data?.total ?? 0)} onClick={() => setPage(page + 1)}>التالي</Button></div>}
  </div>;
}
