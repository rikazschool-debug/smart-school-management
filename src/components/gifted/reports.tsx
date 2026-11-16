import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Inbox, Printer } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { buildReport, CARE_LABEL, GT_DOMAINS, NOTE_STATUS, ownerOf, PLAN_STATUS, PROG_STATUS, REPORTS, type GtMe, type GtStudentRow, type ReportId } from "./model";
import { planQuery } from "./plans";
import { progQuery } from "./programs";
import { workQuery } from "./works";

export const studentsQuery = (school: string) => ({ queryKey: ["gt-students", school], queryFn: async () => { const r = await db.rpc("gt_students", { _school: school }); if (r.error) throw r.error; return r.data as GtStudentRow[]; } });
const uniq = (a: (string | null)[]) => [...new Set(a.filter((x): x is string => !!x))].sort();

export function Reports({ school, me }: { school: string; me: GtMe }) {
  const { active } = useSession();
  const st = useQuery(studentsQuery(school)); const pl = useQuery(planQuery(school)); const pg = useQuery(progQuery(school)); const wk = useQuery(workQuery(school));
  const [rid, setRid] = useState<ReportId>("inventory");
  const [f, setF] = useState({ stage: "", grade: "", section: "", domain: "", owner: "", status: "" });
  const [busy, setBusy] = useState(false);
  const qs = [st, pl, pg, wk];
  if (qs.some((q) => q.isLoading)) return <LoadingState />;
  const err = qs.find((q) => q.error); if (err) return <ErrorState message={arabicError(err.error)} onRetry={() => qs.forEach((q) => void q.refetch())} />;
  const students = st.data ?? [], plans = pl.data ?? [], progs = pg.data ?? [], works = wk.data ?? [];
  if (!students.length && !plans.length && !progs.length && !works.length) return <div className="space-y-4"><StartSteps />{me.coord && <FamilyInbox school={school} />}</div>;
  const sel = (s: GtStudentRow) => (!f.stage || s.stage === f.stage) && (!f.grade || s.grade === f.grade) && (!f.section || s.section === f.section) && (!f.domain || s.domains.includes(f.domain)) && (!f.owner || ownerOf(plans, s.id) === f.owner);
  const ids = new Set(students.filter(sel).map((s) => s.id));
  const studentFilter = !!(f.stage || f.grade || f.section || f.domain || f.owner);
  const data = {
    students: students.filter(sel).filter((s) => rid !== "inventory" || !f.status || s.care === f.status),
    plans: plans.filter((p) => (!studentFilter || p.students.some((s) => ids.has(s.id))) && (rid !== "plans" || !f.status || p.status === f.status)).map((p) => studentFilter ? { ...p, students: p.students.filter((s) => ids.has(s.id)) } : p),
    progs: progs.filter((p) => rid !== "programs" || !f.status || p.status === f.status).map((p) => studentFilter ? { ...p, participants: p.participants.filter((s) => ids.has(s.student_id)) } : p),
    works: works.filter((w) => !studentFilter || w.members.some((m) => ids.has(m.student_id))),
  };
  const rep = buildReport(rid, data);
  const statusOpts: Record<string, string> | null = rid === "inventory" ? CARE_LABEL : rid === "plans" ? PLAN_STATUS : rid === "programs" ? PROG_STATUS : null;
  const filterText = [f.stage && `المرحلة: ${f.stage}`, f.grade && `الصف: ${f.grade}`, f.section && `الشعبة: ${f.section}`, f.domain && `المجال: ${GT_DOMAINS[f.domain]}`, f.owner && `المسؤول: ${f.owner}`, f.status && statusOpts && `الحالة: ${statusOpts[f.status]}`].filter((x): x is string => !!x);
  const meta = { title: `رعاية الموهوبين — ${REPORTS[rid].title}`, school: active?.schoolName, filters: filterText, note: `${REPORTS[rid].def} لا يتضمن التقرير نتائج المقاييس الخارجية.` };
  async function run(fmt: "pdf" | "xlsx" | "print") {
    setBusy(true);
    try {
      const r = await db.rpc("gt_export_log", { _school: school, _report: rid, _format: fmt, _rows: rep.rows.length, _filters: f });
      if (r.error) throw r.error;
      if (fmt === "xlsx") exportXlsx(meta, rep.headers, rep.rows); else if (fmt === "pdf") await exportPdf(meta, rep.headers, rep.rows); else printReport(meta, rep.headers, rep.rows);
      toast.success(fmt === "print" ? "فُتحت نافذة الطباعة" : "نُزّل الملف");
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const fs = (k: keyof typeof f, label: string, opts: [string, string][]) => <select aria-label={label} className={selectCls()} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">{label}: الكل</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const pair = (a: string[]) => a.map((x) => [x, x] as [string, string]);
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="نوع التقرير">{(Object.keys(REPORTS) as ReportId[]).map((k) => <button key={k} role="tab" aria-selected={rid === k} type="button" onClick={() => { setRid(k); setF({ ...f, status: "" }); }} className={`rounded-full border px-4 py-1.5 text-sm ${rid === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{REPORTS[k].title}</button>)}</div>
    <div className="flex flex-wrap gap-2">
      {fs("stage", "المرحلة", pair(uniq(students.map((s) => s.stage))))}{fs("grade", "الصف", pair(uniq(students.map((s) => s.grade))))}{fs("section", "الشعبة", pair(uniq(students.map((s) => s.section))))}
      {fs("domain", "المجال", Object.entries(GT_DOMAINS))}{fs("owner", "المسؤول", pair(uniq(plans.map((p) => p.owner_name))))}
      {statusOpts && fs("status", "الحالة", Object.entries(statusOpts))}
    </div>
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{REPORTS[rid].title}</h3><p className="text-sm text-muted-foreground">{rep.summary}</p><p className="mt-1 max-w-2xl text-xs text-muted-foreground">تعريف المؤشر: {REPORTS[rid].def}</p></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || !rep.rows.length} onClick={() => void run("pdf")}><FileText className="size-4" />PDF</Button><Button size="sm" variant="outline" disabled={busy || !rep.rows.length} onClick={() => void run("xlsx")}><FileSpreadsheet className="size-4" />Excel</Button><Button size="sm" variant="outline" disabled={busy || !rep.rows.length} onClick={() => void run("print")}><Printer className="size-4" />طباعة</Button></div></div>
      {!rep.rows.length ? <p className="mt-4 text-sm text-muted-foreground">لا توجد بيانات تطابق الفلاتر.</p> :
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{rep.headers.map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead><tbody>{rep.rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}</tr>)}</tbody></table></div>}
      <p className="mt-3 text-xs text-muted-foreground">يُسجَّل كل تصدير أو طباعة (نوع التقرير والصيغة وعدد السطور والفلاتر) دون نسخ محتوى الطلبة إلى السجل.</p>
    </div>
    {me.coord && <FamilyInbox school={school} />}
  </div>;
}

function StartSteps() {
  return <div className="rounded-2xl border bg-card p-6"><h3 className="mb-3 font-bold">لا توجد بيانات لإعداد التقارير بعد</h3><ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground"><li>أرسل ترشيحًا وأقرّه من «الترشيحات».</li><li>أنشئ خطة رعاية وابدأ تنفيذها.</li><li>أضف برنامجًا أو وثّق مشاركة أو إنجازًا.</li><li>عد إلى هنا لتصدير الحصر والإحصاءات.</li></ol></div>;
}

type Note = { id: string; student: string; kind: string; body: string; url: string | null; by_role: string; status: string; review_note: string | null; at: string };
function FamilyInbox({ school }: { school: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gt-fam-inbox", school], queryFn: async () => { const r = await db.rpc("gt_family_inbox", { _school: school }); if (r.error) throw r.error; return r.data as Note[]; } });
  async function decide(id: string, d: "accepted" | "rejected") {
    let note = "";
    if (d === "rejected") { const t = await askText("سبب عدم القبول (يظهر للأسرة)", { required: true, long: true, ok: "تسجيل" }); if (t == null) return; note = t; }
    const r = await db.rpc("gt_family_review", { _id: id, _decision: d, _note: note });
    if (r.error) toast.error(arabicError(r.error)); else { toast.success(d === "accepted" ? "قُبلت المشاركة — القبول لا يُنشئ إنجازًا؛ وثّقه من «المشروعات والإنجازات» إن لزم" : "سُجّل عدم القبول"); void qc.invalidateQueries({ queryKey: ["gt-fam-inbox", school] }); }
  }
  return <div className="rounded-2xl border bg-card p-4">
    <h3 className="mb-1 flex items-center gap-2 font-bold"><Inbox className="size-4 text-primary" />مشاركات الأسرة والطلبة</h3>
    <p className="mb-3 text-xs text-muted-foreground">ملاحظات وروابط شواهد يرسلها الطالب أو ولي الأمر الموثّق؛ لا تُحسب إنجازًا حتى توثّقه وتتحقق منه.</p>
    {q.isLoading ? <LoadingState rows={1} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !(q.data ?? []).length ? <EmptyState title="لا توجد مشاركات" hint="تظهر هنا ما يرسله الطلبة وأولياء الأمور من صفحة الابن." /> :
      <ul className="divide-y">{(q.data ?? []).map((n) => <li key={n.id} className="space-y-1 py-3 text-sm">
        <p className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{n.student} · {n.by_role === "student" ? "من الطالب" : "من ولي الأمر"} · {n.kind === "evidence" ? "شاهد" : "ملاحظة"}</span><span className="text-xs text-muted-foreground">{NOTE_STATUS[n.status]} · {n.at.slice(0, 10)}</span></p>
        <p className="whitespace-pre-wrap">{n.body}</p>
        {n.url && <a href={n.url} target="_blank" rel="noreferrer noopener" className="text-primary underline">فتح الرابط</a>}
        {n.review_note && <p className="text-xs text-muted-foreground">السبب: {n.review_note}</p>}
        {n.status === "pending" && <div className="flex gap-2 pt-1"><Button size="sm" onClick={() => void decide(n.id, "accepted")}>قبول</Button><Button size="sm" variant="outline" onClick={() => void decide(n.id, "rejected")}>عدم قبول</Button></div>}
      </li>)}</ul>}
  </div>;
}
