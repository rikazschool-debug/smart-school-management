import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Download, FileText, GraduationCap, Presentation, Printer, Users } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import type { SvMe, SvSearch } from "./model";
import { DEV_HEAD, devReport, filterNeeds, filterPlans, filterPrograms, MEET_HEAD, meetingRows, NEED_HEAD, NEED_STATUS, needRows, PD_VIEWS, PLAN_STATUS, PROG_HEAD, PROG_STATUS, programRows, type DevPlan, type Need, type PdFilter, type PdMeeting, type PdTeacher, type PdView, type Program } from "./pd-model";
import { PdTeachers } from "./pd-teachers";
import { PdPlans } from "./pd-plans";
import { PdPrograms } from "./pd-programs";

export async function sv4(fn: string, args: Record<string, unknown>, okMsg?: string): Promise<unknown> {
  const r = await db.rpc(fn, args); if (r.error) { toast.error(arabicError(r.error)); throw r.error; } if (okMsg) toast.success(okMsg); return r.data;
}
function useList<T>(key: string, fn: string, org: string) { return useQuery({ queryKey: ["sv4", key, org], retry: false, queryFn: async () => { const r = await db.rpc(fn, { _org: org }); if (r.error) throw r.error; return r.data as T; } }); }
export type PdData = { teachers: PdTeacher[]; needs: Need[]; plans: DevPlan[]; programs: Program[]; meetings: PdMeeting[] };

/** «المعلمون والتطوير» — one hub tab with three sub-views; every list comes from caller-scoped sv4_* RPCs. */
export function TeachersDevelopment({ org, me, sp, go }: { org: string; me: SvMe; sp: SvSearch; go: (s: SvSearch, replace?: boolean) => void }) {
  const teachers = useList<PdTeacher[]>("teachers", "sv4_teacher_list", org); const needs = useList<Need[]>("needs", "sv4_need_list", org);
  const plans = useList<DevPlan[]>("plans", "sv4_plan_list", org); const programs = useList<Program[]>("programs", "sv4_program_list", org);
  const meetings = useList<PdMeeting[]>("meetings", "sv4_meeting_list", org);
  const ind = useList<{ needs_open: number; needs_accepted: number; plans_review: number; plans_approved: number; programs_open: number; verified_hours: number }>("ind", "sv4_indicators", org);
  const [f, setF] = useState<PdFilter>({}); const view: PdView = sp.pd ?? "teachers";
  const err = [teachers, needs, plans, programs].find((q) => q.error)?.error;
  if (teachers.isLoading || needs.isLoading || plans.isLoading || programs.isLoading) return <LoadingState />;
  if (err) return <ErrorState message={arabicError(err)} onRetry={() => { void teachers.refetch(); void needs.refetch(); void plans.refetch(); void programs.refetch(); }} />;
  const d: PdData = { teachers: teachers.data ?? [], needs: needs.data ?? [], plans: plans.data ?? [], programs: programs.data ?? [], meetings: meetings.data ?? [] };
  const spec = Object.fromEntries(d.teachers.map((t) => [t.id, t.specialization])); const specs = Array.from(new Set(d.teachers.map((t) => t.specialization).filter(Boolean))) as string[];
  const fd: PdData = { ...d, needs: filterNeeds(d.needs, f, spec), plans: filterPlans(d.plans, f, spec), programs: filterPrograms(d.programs, f),
    teachers: d.teachers.filter((t) => (!f.school || t.school_id === f.school) && (!f.teacher || t.id === f.teacher) && (!f.specialty || t.specialization === f.specialty)),
    meetings: d.meetings.filter((m) => (!f.school || m.school_id === f.school) && (!f.from || m.starts_at.slice(0, 10) >= f.from) && (!f.to || m.starts_at.slice(0, 10) <= f.to)) };
  const filters = [f.school && `الفرع: ${me.schools.find((s) => s.id === f.school)?.name ?? ""}`, f.specialty && `التخصص: ${f.specialty}`, f.teacher && `المعلم: ${d.teachers.find((t) => t.id === f.teacher)?.name ?? ""}`, f.status && `الحالة: ${f.status}`, (f.from || f.to) && `الفترة: ${f.from ?? "…"} — ${f.to ?? "…"}`].filter(Boolean) as string[];
  function report(kind: "dev" | "needs" | "programs" | "meetings") {
    const meta = { title: { dev: "تقرير تطوير المعلمين", needs: "تقرير الاحتياجات المهنية", programs: "تقرير البرامج والحضور والساعات", meetings: "تقرير الاجتماعات والإجراءات" }[kind], filters, note: "من السجلات المتاحة لصلاحيتك فقط؛ «غير متاح» يعني عدم توفر البيانات وليس صفرًا. لا درجات ولا ترتيب." };
    if (kind === "dev") return { meta, headers: DEV_HEAD, rows: devReport(fd.teachers, fd.needs, fd.plans, fd.programs, {}) };
    if (kind === "needs") return { meta, headers: NEED_HEAD, rows: needRows(fd.needs) };
    if (kind === "programs") return { meta, headers: PROG_HEAD, rows: programRows(fd.programs) };
    return { meta, headers: MEET_HEAD, rows: meetingRows(fd.meetings) };
  }
  const statusOpts = view === "teachers" ? NEED_STATUS : view === "devplans" ? PLAN_STATUS : PROG_STATUS;
  const icons = { teachers: Users, devplans: BookOpenCheck, programs: Presentation };
  return <div className="space-y-4">
    <nav aria-label="المعلمون والتطوير" className="flex flex-wrap gap-2 border-b pb-3">{(Object.keys(PD_VIEWS) as PdView[]).map((v) => { const I = icons[v]; return <Button key={v} variant={view === v ? "default" : "ghost"} onClick={() => { setF((x) => ({ ...x, status: "" })); go({ tab: "pd", pd: v }); }}><I />{PD_VIEWS[v]}</Button>; })}</nav>
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><GraduationCap className="mt-0.5 size-4 shrink-0" />الملف الإشرافي للتطوير وليس تقييمًا وظيفيًا: لا ترتيب ولا درجة كلية، وغياب الدليل لا يعني ضعف الأداء.</p>
    {ind.data && <div className="flex flex-wrap gap-2 text-sm">{[["احتياجات بانتظار المراجعة", ind.data.needs_open, () => { go({ tab: "pd", pd: "teachers" }); setF({ ...f, status: "proposed" }); }], ["احتياجات معتمدة", ind.data.needs_accepted, () => { go({ tab: "pd", pd: "teachers" }); setF({ ...f, status: "" }); }], ["خطط بانتظار الاعتماد", ind.data.plans_review, () => { go({ tab: "pd", pd: "devplans" }); setF({ ...f, status: "submitted" }); }], ["خطط معتمدة", ind.data.plans_approved, () => { go({ tab: "pd", pd: "devplans" }); setF({ ...f, status: "approved" }); }], ["برامج مفتوحة", ind.data.programs_open, () => { go({ tab: "pd", pd: "programs" }); setF({ ...f, status: "open" }); }], ["ساعات حضور موثقة", ind.data.verified_hours, () => go({ tab: "pd", pd: "programs" })]].map(([l, n, on]) => <button type="button" key={l as string} onClick={on as () => void} className="rounded-lg border px-3 py-1.5 hover:bg-muted">{l as string}: <b>{String(n)}</b></button>)}</div>}
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectCls()} aria-label="تصفية الفرع" value={f.school ?? ""} onChange={(e) => setF({ ...f, school: e.target.value, teacher: "" })}><option value="">كل الفروع المتاحة</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className={selectCls()} aria-label="تصفية التخصص" value={f.specialty ?? ""} onChange={(e) => setF({ ...f, specialty: e.target.value })}><option value="">كل التخصصات</option>{specs.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <select className={selectCls()} aria-label="تصفية المعلم" value={f.teacher ?? ""} onChange={(e) => setF({ ...f, teacher: e.target.value })}><option value="">كل المعلمين المتاحين</option>{d.teachers.filter((t) => !f.school || t.school_id === f.school).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select className={selectCls()} aria-label="تصفية الحالة" value={f.status ?? ""} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(statusOpts).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <Input type="date" className="w-40" aria-label="من تاريخ" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} /><Input type="date" className="w-40" aria-label="إلى تاريخ" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} />
      <Button variant="ghost" onClick={() => setF({})}>مسح الفلاتر</Button>
    </div>
    <details className="rounded-lg border p-2 text-sm"><summary className="cursor-pointer font-semibold">التقارير (PDF وExcel وطباعة)</summary>
      <ul className="mt-2 space-y-1">{([["dev", "تطوير المعلمين"], ["needs", "الاحتياجات"], ["programs", "البرامج والحضور والساعات"], ["meetings", "الاجتماعات والإجراءات"]] as const).map(([k, l]) => <li key={k} className="flex flex-wrap items-center gap-1"><span className="min-w-40">{l}</span>
        <Button variant="ghost" size="icon" aria-label={`Excel ${l}`} title="Excel" onClick={() => { const r = report(k); exportXlsx(r.meta, r.headers, r.rows); }}><Download /></Button>
        <Button variant="ghost" size="icon" aria-label={`PDF ${l}`} title="PDF" onClick={() => { const r = report(k); void exportPdf(r.meta, r.headers, r.rows); }}><FileText /></Button>
        <Button variant="ghost" size="icon" aria-label={`طباعة ${l}`} title="طباعة" onClick={() => { const r = report(k); printReport(r.meta, r.headers, r.rows); }}><Printer /></Button></li>)}</ul></details>
    {view === "teachers" && <PdTeachers me={me} d={d} fd={fd} />}
    {view === "devplans" && <PdPlans me={me} d={d} fd={fd} openId={sp.id} onOpen={(id) => go({ tab: "pd", pd: "devplans", ...(id ? { id } : {}) }, false)} />}
    {view === "programs" && <PdPrograms me={me} d={d} fd={fd} />}
  </div>;
}
