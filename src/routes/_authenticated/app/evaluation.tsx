import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FileSpreadsheet, FileText, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { arabicError, useSession } from "@/lib/session";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { exportPdf, exportXlsx } from "@/lib/export";
import { StarPicker, scoreOf, type FormItem } from "@/components/evaluation/stars";

type Tab = "summary" | "guardians" | "visits" | "monthly" | "forms";
export const Route = createFileRoute("/_authenticated/app/evaluation")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({ tab: (["summary", "guardians", "visits", "monthly", "forms"] as const).find((t) => t === s["tab"]) }),
  head: () => ({ meta: [{ title: "نظام التقييم الشامل — ركاز" }, { name: "description", content: "تقييمات أولياء الأمور والزيارات الصفية والتقييم الشهري للكادر." }] }),
  component: Page,
});

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => { const r = await supabase.rpc(fn as never, args as never); if (r.error) throw r.error; return r.data as unknown as T; };
const thisMonth = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7);
const ROLE_LABEL: Record<string, string> = { vice: "وكيل المدرسة", supervisor: "المشرف التربوي", admin: "الكادر الإداري", teacher: "المعلم", "": "ولي الأمر" };
const fmt = (n: unknown) => (n == null ? "—" : Number(n).toFixed(2));

function Page() {
  const { active } = useSession();
  if (!active) return null;
  if (active.role === "guardian") return <GuardianView />;
  if (active.role === "supervisor") return (<><PageHeader title="نظام التقييم الشامل" /><p className="mb-3 text-sm">دورك في التقييم هو الزيارات الصفية لمعلميك المسندين.</p><Button asChild><Link to="/app/visits">فتح الزيارات الصفية</Link></Button></>);
  if (!["org_owner", "principal", "platform_admin"].includes(active.role)) return <ForbiddenState />;
  return <StaffView />;
}

/* ===================== guardian ===================== */
type GTeacher = { teacher_id: string; name: string; subjects: string; rating: { answers: Record<string, number | "na">; comment: string | null; form_version: number; updated_at: string; revision: number } | null };
function GuardianView() {
  const qc = useQueryClient();
  const kids = useQuery({ queryKey: ["ev-kids"], queryFn: () => rpc<{ id: string; name: string }[]>("ev_g_children", {}) });
  const [kid, setKid] = useState<string>("");
  useEffect(() => { if (!kid && kids.data?.length) setKid(kids.data[0]!.id); }, [kids.data, kid]);
  const data = useQuery({ queryKey: ["ev-gt", kid], enabled: !!kid, queryFn: () => rpc<{ form: { id: string; version: number; title: string; items: FormItem[] }; teachers: GTeacher[] }>("ev_g_teachers", { _student: kid }) });
  const [open, setOpen] = useState<GTeacher | null>(null);
  const [ans, setAns] = useState<Record<string, number | "na">>({});
  const [comment, setComment] = useState("");
  if (kids.isLoading) return <LoadingState />;
  if (kids.error) return <ErrorState message={arabicError(kids.error as Error)} />;
  if (!kids.data?.length) return (<><PageHeader title="تقييم المعلمين" /><EmptyState title="لا يوجد أبناء مرتبطون بحسابك بعلاقة موثقة" /></>);
  const form = data.data?.form;
  async function save() {
    if (!open || !form) return;
    const r = await supabase.rpc("ev_g_save" as never, { _student: kid, _teacher: open.teacher_id, _answers: ans, _comment: comment } as never);
    if (r.error) { toast.error(arabicError(r.error)); return; }
    toast.success("حُفظ تقييمك ويمكنك تعديله لاحقًا"); setOpen(null); qc.invalidateQueries({ queryKey: ["ev-gt", kid] });
  }
  if (open && form) {
    const sc = scoreOf(form.items, ans);
    const changed = open.rating && open.rating.form_version !== form.version;
    return (
      <>
        <PageHeader title={`تقييم ${open.name}`} desc={open.subjects} />
        <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm leading-7">
          المقياس: ١ ضعيف جدًا · ٢ ضعيف · ٣ متوسط · ٤ جيد · ٥ ممتاز. اختر «لا أستطيع التقييم» إذا لم تكن لديك معرفة كافية — لا يُحسب صفرًا.
          <br /><b>الخصوصية:</b> التقييم ليس مجهولًا: يطّلع مدير المدرسة ومالك المؤسسة على اسمك وتقييمك وتعليقك. لا يطّلع عليه المعلم ولا أولياء الأمور الآخرون.
        </div>
        {changed && <p className="mb-3 rounded-md border border-warning/60 bg-warning/10 p-3 text-sm">تغيّر نموذج التقييم منذ آخر حفظ. إجاباتك السابقة محفوظة في السجل؛ راجع الأسئلة وأكمل ما يحتاج إكمالًا.</p>}
        {form.items.map((i, n) => (
          <fieldset key={i.code} className="mb-3 rounded-lg border bg-card p-3">
            <legend className="px-1 font-semibold">{n + 1}. {i.text}</legend>
            {i.desc && <p className="mb-2 text-sm text-muted-foreground">{i.desc}</p>}
            <StarPicker label={i.text} value={ans[i.code]} naLabel={i.na ? "لا أستطيع التقييم" : undefined}
              onChange={(v) => setAns((a) => { const x = { ...a }; if (v === undefined) delete x[i.code]; else x[i.code] = v; return x; })} />
          </fieldset>
        ))}
        <Label htmlFor="ev-c">تعليق (اختياري) — يراه المدير والمالك فقط</Label>
        <textarea id="ev-c" className="mb-3 min-h-20 w-full rounded-md border bg-background p-2 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
        <p className="mb-3 text-sm">أُجيب {sc.answered} من {sc.total} ({Math.round((sc.answered / sc.total) * 100)}٪){sc.avg != null && ` · المتوسط ${sc.avg} من 5`}</p>
        <div className="flex gap-2"><Button onClick={save} disabled={!sc.answered}>حفظ التقييم</Button><Button variant="ghost" onClick={() => setOpen(null)}>رجوع</Button></div>
      </>
    );
  }
  return (
    <>
      <PageHeader title="تقييم المعلمين" desc="قيّم معلمي ابنك الحاليين؛ يمكنك تعديل التقييم ما دام المعلم يدرّسه." />
      <div className="mb-4 max-w-xs"><Label htmlFor="kid">الابن</Label>
        <select id="kid" className={selectCls("w-full")} value={kid} onChange={(e) => setKid(e.target.value)}>{kids.data.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></div>
      {data.isLoading ? <LoadingState /> : data.error ? <ErrorState message={arabicError(data.error as Error)} /> : !data.data?.teachers.length ? <EmptyState title="لا يوجد معلمون حاليون لهذا الابن" /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.teachers.map((t) => (
            <div key={t.teacher_id} className="rounded-lg border bg-card p-4">
              <div className="font-semibold">{t.name}</div>
              <div className="mb-2 text-sm text-muted-foreground">{t.subjects}</div>
              <div className="mb-3 text-sm">{t.rating ? `قيّمته — آخر تعديل ${new Date(t.rating.updated_at).toLocaleDateString("ar-SA")}` : "لم تقيّمه بعد"}</div>
              <Button size="sm" onClick={() => { setOpen(t); setAns(t.rating?.answers ?? {}); setComment(t.rating?.comment ?? ""); }}>{t.rating ? "تعديل التقييم" : "تقييم"}</Button>
            </div>))}
        </div>)}
    </>
  );
}

/* ===================== staff (owner / principal / granted platform) ===================== */
type Summary = { month: string; teachers: { id: string; name: string; school: string; school_id: string; ratings: number; raters: number; students: number; g_avg: number | null; visits: number }[]; monthly: { school_id: string; school: string; required: number; done: number; drafts: number }[] };
function StaffView() {
  const { active } = useSession();
  const tab = Route.useSearch().tab ?? "summary";
  const orgId = active!.orgId!;
  const isOwner = active!.role === "org_owner" || active!.role === "platform_admin";
  const [school, setSchool] = useState<string>(isOwner ? "" : active!.schoolId ?? "");
  const [month, setMonth] = useState(thisMonth());
  const sum = useQuery({ queryKey: ["ev-sum", orgId, school, month], queryFn: () => rpc<Summary>("ev_summary", { _org: orgId, _school: school || null, _month: month + "-01" }) });
  const me = useQuery({ queryKey: ["ev-me", active!.schoolId], enabled: !!active!.schoolId, queryFn: () => rpc<{ forms: boolean }>("ev_me", { _school: active!.schoolId }) });
  const canForms = isOwner || !!me.data?.forms;
  const tabs: [Tab, string][] = [["summary", "الملخص والمؤشرات"], ["guardians", "تقييمات أولياء الأمور"], ["visits", "الزيارات الصفية"], ["monthly", "التقييم الشهري"], ...(canForms ? [["forms", "النماذج والإعدادات"] as [Tab, string]] : [])];
  const schools = sum.data ? [...new Map(sum.data.monthly.map((m) => [m.school_id, m.school])).entries()] : [];
  return (
    <>
      <PageHeader title="نظام التقييم الشامل" desc="المصادر معروضة منفصلة؛ لا تُدمج في درجة شاملة ولا يُصنَّف أحد آليًا." />
      <nav className="mb-4 flex flex-wrap gap-1 border-b" aria-label="تبويبات التقييم">
        {tabs.map(([k, l]) => <Link key={k} to="/app/evaluation" search={{ tab: k }} className={"-mb-px border-b-2 px-3 py-2 text-sm " + (tab === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground")}>{l}</Link>)}
      </nav>
      {tab !== "forms" && tab !== "visits" && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {isOwner && <div><Label htmlFor="ev-s">الفرع</Label><select id="ev-s" className={selectCls("min-w-48")} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">كل الفروع</option>{(sum.data?.monthly ?? []).map((m) => <option key={m.school_id} value={m.school_id}>{m.school}</option>)}</select></div>}
          <div><Label htmlFor="ev-m">الشهر</Label><Input id="ev-m" type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} /></div>
        </div>)}
      {tab === "visits" ? (<div className="rounded-lg border bg-card p-4"><p className="mb-3 text-sm">الزيارات الصفية قسم واحد مشترك (المحاور الخمسة والبنود الأربعة والعشرون واعتماد المدير). نتائجها تظهر أيضًا في ملف كل معلم.</p><Button asChild><Link to="/app/visits">فتح الزيارات الصفية</Link></Button></div>)
        : tab === "forms" ? (canForms ? <FormsTab orgId={orgId} /> : <ForbiddenState />)
        : sum.isLoading ? <LoadingState /> : sum.error ? <ErrorState message={arabicError(sum.error as Error)} />
        : tab === "summary" ? <SummaryTab s={sum.data!} orgId={orgId} />
        : tab === "guardians" ? <GuardiansTab s={sum.data!} orgId={orgId} />
        : <MonthlyTab schools={schools} school={school || active!.schoolId || schools[0]?.[0] || ""} month={month} canEdit={active!.role === "principal" || active!.role === "org_owner"} />}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{value}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>;
}

function SummaryTab({ s, orgId }: { s: Summary; orgId: string }) {
  const rated = s.teachers.filter((t) => t.ratings > 0);
  const ratings = s.teachers.reduce((a, t) => a + t.ratings, 0);
  const req = s.monthly.reduce((a, m) => a + m.required, 0), done = s.monthly.reduce((a, m) => a + m.done, 0), drafts = s.monthly.reduce((a, m) => a + m.drafts, 0);
  const past = s.month < thisMonth() + "-01";
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="تقييمات أولياء الأمور الحالية" value={ratings} hint="الوحدة: ولي أمر–طالب–معلم" />
        <Kpi label="معلمون لديهم تقييمات" value={`${rated.length} / ${s.teachers.length}`} />
        <Kpi label="زيارات صفية معتمدة" value={s.teachers.reduce((a, t) => a + t.visits, 0)} />
        <Kpi label="التقييم الشهري" value={`${done} / ${req}`} hint={`مسودات ${drafts}${past ? ` · متأخر ${Math.max(req - done, 0)}` : ""}`} />
      </div>
      <h3 className="mb-2 font-semibold">التقييم الشهري حسب الفرع</h3>
      <div className="mb-4 overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">الفرع</th><th className="p-2 text-start">المطلوب</th><th className="p-2 text-start">المعتمد</th><th className="p-2 text-start">مسودات</th></tr></thead>
        <tbody>{s.monthly.map((m) => <tr key={m.school_id} className="border-b last:border-0"><td className="p-2">{m.school}</td><td className="p-2">{m.required}</td><td className="p-2">{m.done}</td><td className="p-2">{m.drafts}</td></tr>)}</tbody></table></div>
      <GuardiansTab s={s} orgId={orgId} compact />
    </>
  );
}

function GuardiansTab({ s, orgId, compact }: { s: Summary; orgId: string; compact?: boolean }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const rows = s.teachers.filter((t) => !q || t.name.includes(q));
  const headers = ["المعلم", "الفرع", "تقييمات حالية", "المقيّمون", "الطلاب", "متوسط أولياء الأمور /5", "زيارات معتمدة"];
  const data = rows.map((t) => [t.name, t.school, t.ratings, t.raters, t.students, t.g_avg == null ? "—" : Number(t.g_avg).toFixed(2), t.visits]);
  const meta = { title: "تقييمات المعلمين — المصادر منفصلة", filters: [`الشهر ${s.month.slice(0, 7)}`, q ? `بحث: ${q}` : "كل المعلمين"], note: "متوسط أولياء الأمور لأحدث نسخة من كل تقييم؛ «لا أستطيع التقييم» غير محسوب. يجمع إصدارات النموذج — راجع ملف المعلم للتفصيل حسب الإصدار." };
  const exp = async (k: "x" | "p") => { await supabase.rpc("ev_export_log" as never, { _org: orgId, _what: "teachers-" + k } as never); if (k === "x") exportXlsx(meta, headers, data); else await exportPdf(meta, headers, data); };
  if (open) return <TeacherFile id={open} onBack={() => setOpen(null)} />;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{compact ? "المعلمون" : "تقييمات أولياء الأمور حسب المعلم"}</h3>
        <Input className="max-w-56" placeholder="بحث باسم المعلم" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث باسم المعلم" />
        <Button size="sm" variant="outline" onClick={() => exp("x")}><FileSpreadsheet className="size-4" />Excel</Button>
        <Button size="sm" variant="outline" onClick={() => exp("p")}><FileText className="size-4" />PDF</Button>
      </div>
      {!rows.length ? <EmptyState title="لا يوجد معلمون" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground">{headers.map((h) => <th key={h} className="p-2 text-start">{h}</th>)}<th /></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id} className="border-b last:border-0"><td className="p-2">{t.name}</td><td className="p-2">{t.school}</td><td className="p-2">{t.ratings}</td><td className="p-2">{t.raters}</td><td className="p-2">{t.students}</td>
              <td className="p-2">{fmt(t.g_avg)}{t.ratings > 0 && t.ratings < 5 && <span className="ms-1 text-xs text-muted-foreground">(عينة صغيرة)</span>}</td><td className="p-2">{t.visits}</td>
              <td className="p-2 text-end"><Button size="sm" variant="outline" onClick={() => setOpen(t.id)}>ملف التقييم</Button></td></tr>))}</tbody></table></div>)}
    </>
  );
}

type TFile = { teacher: { name: string }; guardian: { ratings: number; raters: number; students: number; comments: { comment: string; at: string }[]; by_version: { version: number; title: string; n: number; avg: number | null; stars: Record<string, number>; items: { code: string; text: string; avg: number | null; n: number; na: number; weight: number }[] }[] };
  visits: { id: string; date: string; evaluator: string; status: string; version: number; scores: Record<string, number>; summary: string | null; plan: string | null; follow_up: string | null; subject: string | null; type: string | null }[] };
function TeacherFile({ id, onBack }: { id: string; onBack: () => void }) {
  const f = useQuery({ queryKey: ["ev-tf", id], queryFn: () => rpc<TFile>("ev_teacher_file", { _teacher: id }) });
  const [t, setT] = useState<"g" | "v" | "p">("g");
  if (f.isLoading) return <LoadingState />;
  if (f.error) return <ErrorState message={arabicError(f.error as Error)} />;
  const d = f.data!;
  const pct = (sc: Record<string, number>) => { const v = Object.values(sc); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / (v.length * 5)) * 100) : null; };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">→ رجوع</Button>
      <h3 className="mb-1 text-lg font-bold">ملف تقييم: {d.teacher.name}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{d.guardian.ratings} تقييم حالي · {d.guardian.raters} مقيّم · {d.guardian.students} طالب</p>
      <div className="mb-3 flex gap-1 border-b">{([["g", "أولياء الأمور"], ["v", "الزيارات الصفية"], ["p", "خطة التحسين والمتابعة"]] as const).map(([k, l]) =>
        <button key={k} onClick={() => setT(k)} className={"-mb-px border-b-2 px-3 py-2 text-sm " + (t === k ? "border-primary font-semibold" : "border-transparent text-muted-foreground")}>{l}</button>)}</div>
      {t === "g" && (!d.guardian.by_version.length ? <EmptyState title="لا توجد تقييمات من أولياء الأمور" /> : d.guardian.by_version.map((v) => (
        <section key={v.version} className="mb-4 rounded-lg border bg-card p-3">
          <h4 className="font-semibold">{v.title} — الإصدار {v.version}</h4>
          <p className="mb-2 text-sm">المتوسط {fmt(v.avg)} من 5 · عدد التقييمات {v.n}{v.n < 5 && " · عينة صغيرة، لا تُبنى عليها أحكام"}</p>
          <p className="mb-2 text-xs text-muted-foreground">توزيع النجوم: {[5, 4, 3, 2, 1].map((s) => `${s}★ ${v.stars[String(s)] ?? 0}`).join(" · ")}</p>
          <table className="w-full text-sm"><tbody>{v.items.map((i) => <tr key={i.code} className="border-t"><td className="py-1.5">{i.text}{i.weight !== 1 && <span className="text-xs text-muted-foreground"> (وزن {i.weight})</span>}</td><td className="py-1.5">{fmt(i.avg)}</td><td className="py-1.5 text-xs text-muted-foreground">{i.n} إجابة · {i.na} لا أستطيع</td></tr>)}</tbody></table>
        </section>)))}
      {t === "g" && d.guardian.comments.length > 0 && <section className="rounded-lg border bg-card p-3"><h4 className="mb-2 font-semibold">التعليقات (غير منشورة)</h4>{d.guardian.comments.map((c, i) => <p key={i} className="border-t py-1.5 text-sm">{c.comment}</p>)}</section>}
      {t === "v" && (!d.visits.length ? <EmptyState title="لا توجد زيارات" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">التاريخ</th><th className="p-2 text-start">المنفّذ</th><th className="p-2 text-start">المادة/النوع</th><th className="p-2 text-start">النتيجة</th><th className="p-2 text-start">الحالة</th><th className="p-2 text-start">الإصدار</th></tr></thead>
          <tbody>{d.visits.map((v) => <tr key={v.id} className="border-b last:border-0"><td className="p-2"><bdi dir="ltr">{v.date}</bdi></td><td className="p-2">{v.evaluator}</td><td className="p-2">{[v.subject, v.type].filter(Boolean).join(" · ") || "—"}</td><td className="p-2">{pct(v.scores) ?? "—"}٪</td><td className="p-2">{v.status === "approved" ? "معتمدة" : "بانتظار الاعتماد"}</td><td className="p-2">{v.version}</td></tr>)}</tbody></table></div>))}
      {t === "p" && (d.visits.filter((v) => v.plan).length ? d.visits.filter((v) => v.plan).map((v) => <div key={v.id} className="mb-2 rounded-lg border bg-card p-3 text-sm"><b>زيارة <bdi dir="ltr">{v.date}</bdi></b><p className="whitespace-pre-wrap">{v.plan}</p>{v.follow_up && <p className="text-muted-foreground">موعد المتابعة: <bdi dir="ltr">{v.follow_up}</bdi></p>}</div>) : <EmptyState title="لا توجد خطة تحسين مسجلة" hint="تُضاف من صفحة الزيارة الصفية." />)}
    </>
  );
}

/* ---------- monthly ---------- */
type MStaff = { user_id: string; name: string; role_key: string; status: string | null; id: string | null };
function MonthlyTab({ schools, school, month, canEdit }: { schools: [string, string][]; school: string; month: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [sch, setSch] = useState(school);
  useEffect(() => setSch(school), [school]);
  const staff = useQuery({ queryKey: ["ev-ms", sch, month], enabled: !!sch, queryFn: () => rpc<MStaff[]>("ev_m_staff", { _school: sch, _month: month + "-01" }) });
  const [ed, setEd] = useState<{ p: MStaff; form: { items: FormItem[]; title: string; version: number }; ans: Record<string, number | "na">; na: Record<string, string>; notes: string; approved: boolean; version: number; history: unknown[] } | null>(null);
  async function open(p: MStaff) {
    try {
      if (p.id) { const g = await rpc<{ form_snapshot: { items: FormItem[]; title: string; version: number }; answers: Record<string, number | "na">; na_reasons: Record<string, string>; notes: string | null; status: string; version: number; history: unknown[] }>("ev_m_get", { _id: p.id });
        setEd({ p, form: g.form_snapshot, ans: g.answers, na: g.na_reasons, notes: g.notes ?? "", approved: g.status === "approved", version: g.version, history: g.history }); }
      else { const f = await rpc<{ items: FormItem[]; title: string; version: number } | null>("ev_m_form", { _school: sch, _role: p.role_key }); if (!f) { toast.error("لا يوجد نموذج منشور لهذا الدور"); return; }
        setEd({ p, form: f, ans: {}, na: {}, notes: "", approved: false, version: 1, history: [] }); }
    } catch (e) { toast.error(arabicError(e as Error)); }
  }
  async function save(approve: boolean) {
    if (!ed) return;
    let reason: string | null = null;
    if (ed.approved) { reason = await askText("سبب تعديل تقييم معتمد (يُحفظ الإصدار السابق)", { required: true }); if (!reason) return; }
    else if (approve && !(await ask("اعتماد التقييم؟ أي تعديل بعده يحتاج سببًا وإصدارًا جديدًا."))) return;
    const r = await supabase.rpc("ev_m_save" as never, { _school: sch, _user: ed.p.user_id, _role: ed.p.role_key, _month: month + "-01", _answers: ed.ans, _na: ed.na, _notes: ed.notes || null, _approve: approve || ed.approved, _reason: reason } as never);
    if (r.error) { toast.error(arabicError(r.error)); return; }
    toast.success(approve || ed.approved ? "اعتُمد التقييم" : "حُفظت المسودة"); setEd(null); qc.invalidateQueries({ queryKey: ["ev-ms"] }); qc.invalidateQueries({ queryKey: ["ev-sum"] });
  }
  if (ed) {
    const sc = scoreOf(ed.form.items, ed.ans);
    return (
      <>
        <h3 className="mb-1 text-lg font-bold">{ed.p.name} — {ROLE_LABEL[ed.p.role_key]} — {month}</h3>
        <p className="mb-3 text-sm text-muted-foreground">{ed.form.title} (إصدار النموذج {ed.form.version}){ed.approved && ` · معتمد، إصدار التقييم ${ed.version}`}. «غير منطبق» يحتاج سببًا ولا يُحسب صفرًا. البنود بلا بيانات تُقيَّم يدويًا.</p>
        {ed.form.items.map((i) => (
          <fieldset key={i.code} className="mb-3 rounded-lg border bg-card p-3" disabled={!canEdit}>
            <legend className="px-1 font-semibold">{i.text}</legend>{i.desc && <p className="mb-2 text-sm text-muted-foreground">{i.desc}</p>}
            <StarPicker label={i.text} value={ed.ans[i.code]} naLabel={i.na ? "غير منطبق" : undefined}
              onChange={(v) => setEd((e) => { if (!e) return e; const a = { ...e.ans }; if (v === undefined) delete a[i.code]; else a[i.code] = v; return { ...e, ans: a }; })} />
            {ed.ans[i.code] === "na" && <Input className="mt-2" placeholder="سبب «غير منطبق»" value={ed.na[i.code] ?? ""} onChange={(e) => setEd({ ...ed, na: { ...ed.na, [i.code]: e.target.value } })} />}
          </fieldset>))}
        <Label htmlFor="ev-n">ملاحظات</Label>
        <textarea id="ev-n" disabled={!canEdit} className="mb-3 min-h-20 w-full rounded-md border bg-background p-2 text-sm" value={ed.notes} onChange={(e) => setEd({ ...ed, notes: e.target.value })} />
        <p className="mb-3 text-sm">أُجيب {sc.answered} من {sc.total} · المتوسط {sc.avg ?? "—"} من 5{ed.history.length > 0 && ` · إصدارات سابقة: ${ed.history.length}`}</p>
        <div className="flex flex-wrap gap-2">{canEdit && (ed.approved ? <Button onClick={() => save(true)}>حفظ التصحيح بسبب</Button> : <><Button onClick={() => save(true)}>اعتماد</Button><Button variant="outline" onClick={() => save(false)}>حفظ مسودة</Button></>)}<Button variant="ghost" onClick={() => setEd(null)}>رجوع</Button></div>
      </>
    );
  }
  return (
    <>
      {schools.length > 1 && <div className="mb-3 max-w-xs"><Label htmlFor="ev-ms">فرع التقييم</Label><select id="ev-ms" className={selectCls("w-full")} value={sch} onChange={(e) => setSch(e.target.value)}>{schools.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>}
      <p className="mb-3 text-sm text-muted-foreground">سجل واحد لكل موظف ودور وفرع وشهر. الموظف متعدد الأدوار يُقيَّم بنموذج مستقل لكل دور. لا يوجد نموذج شهري للمعلم ما لم ينشئه المالك.</p>
      {staff.isLoading ? <LoadingState /> : staff.error ? <ErrorState message={arabicError(staff.error as Error)} /> : !staff.data?.length ? <EmptyState title="لا يوجد موظفون مطلوب تقييمهم في هذا الفرع" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">الدور</th><th className="p-2 text-start">الحالة</th><th /></tr></thead>
          <tbody>{staff.data.map((p) => <tr key={p.user_id + p.role_key} className="border-b last:border-0"><td className="p-2">{p.name || "—"}</td><td className="p-2">{ROLE_LABEL[p.role_key]}</td>
            <td className="p-2">{p.status === "approved" ? "معتمد" : p.status === "draft" ? "مسودة" : month < thisMonth() ? "متأخر" : "مطلوب"}</td>
            <td className="p-2 text-end"><Button size="sm" variant="outline" onClick={() => open(p)}>{p.status ? (canEdit ? "فتح" : "عرض") : canEdit ? "تقييم" : "—"}</Button></td></tr>)}</tbody></table></div>)}
    </>
  );
}

/* ---------- forms editor ---------- */
type EvForm = { id: string; kind: string; role_key: string; version: number; title: string; description: string | null; items: FormItem[]; status: string; published_at: string | null };
function FormsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const forms = useQuery({ queryKey: ["ev-forms", orgId], queryFn: () => rpc<EvForm[]>("ev_forms_list", { _org: orgId }) });
  const [ed, setEd] = useState<{ kind: string; role_key: string; title: string; description: string; items: FormItem[]; preview: boolean } | null>(null);
  if (forms.isLoading) return <LoadingState />;
  if (forms.error) return <ErrorState message={arabicError(forms.error as Error)} />;
  const groups = [...new Map(forms.data!.map((f) => [f.kind + "|" + f.role_key, f])).keys()];
  async function save(publish: boolean) {
    if (!ed) return;
    if (publish && !(await ask("نشر الإصدار الجديد؟ يُؤرشف الإصدار الحالي، وتبقى التقييمات السابقة بنصوص نموذجها."))) return;
    const r = await supabase.rpc("ev_form_save" as never, { _org: orgId, _kind: ed.kind, _role: ed.role_key, _title: ed.title, _desc: ed.description || null, _items: ed.items, _publish: publish } as never);
    if (r.error) { toast.error(arabicError(r.error)); return; }
    toast.success(publish ? "نُشر الإصدار" : "حُفظت المسودة"); setEd(null); qc.invalidateQueries({ queryKey: ["ev-forms"] });
  }
  if (ed) {
    const set = (i: number, p: Partial<FormItem>) => setEd({ ...ed, items: ed.items.map((x, k) => (k === i ? { ...x, ...p } : x)) });
    const mv = (i: number, d: number) => { const a = [...ed.items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j]!, a[i]!]; setEd({ ...ed, items: a }); };
    if (ed.preview) return (<><h3 className="mb-3 text-lg font-bold">معاينة: {ed.title}</h3>{ed.items.map((i, n) => <fieldset key={i.code} className="mb-2 rounded-lg border bg-card p-3"><legend className="px-1 font-semibold">{n + 1}. {i.text}{(i.weight ?? 1) !== 1 && ` (وزن ${i.weight})`}</legend>{i.desc && <p className="mb-2 text-sm text-muted-foreground">{i.desc}</p>}<StarPicker label={i.text} value={undefined} onChange={() => {}} naLabel={i.na ? "غير منطبق" : undefined} /></fieldset>)}<Button variant="outline" onClick={() => setEd({ ...ed, preview: false })}>رجوع للتحرير</Button></>);
    return (
      <>
        <h3 className="mb-2 text-lg font-bold">تحرير نموذج — {ed.kind === "guardian" ? "ولي الأمر" : `شهري: ${ROLE_LABEL[ed.role_key]}`}</h3>
        <p className="mb-3 text-sm text-muted-foreground">الأوزان اختيارية (الافتراضي 1 للجميع). حذف سؤال في إصدار جديد لا يمحو الإجابات القديمة. لا تغيّر معنى سؤال مع إبقاء رمزه — أضف سؤالًا جديدًا بدلًا منه.</p>
        <div className="mb-3 grid gap-3 sm:grid-cols-2"><div><Label>الاسم</Label><Input value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} /></div><div><Label>الوصف</Label><Input value={ed.description} onChange={(e) => setEd({ ...ed, description: e.target.value })} /></div></div>
        {ed.items.map((i, k) => (
          <div key={i.code} className="mb-2 grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[1fr_1.5fr_auto]">
            <Input aria-label="نص البند" value={i.text} onChange={(e) => set(k, { text: e.target.value })} />
            <Input aria-label="شرح البند" value={i.desc ?? ""} onChange={(e) => set(k, { desc: e.target.value })} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!i.na} onChange={(e) => set(k, { na: e.target.checked })} />غير منطبق</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={i.required !== false} onChange={(e) => set(k, { required: e.target.checked })} />إلزامي</label>
              <Input aria-label="الوزن" type="number" min={0.1} step={0.5} className="w-20" value={i.weight ?? 1} onChange={(e) => set(k, { weight: Number(e.target.value) || 1 })} />
              <Button size="icon" variant="ghost" aria-label="أعلى" onClick={() => mv(k, -1)}><ArrowUp className="size-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="أسفل" onClick={() => mv(k, 1)}><ArrowDown className="size-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => setEd({ ...ed, items: ed.items.filter((_, j) => j !== k) })}><Trash2 className="size-4" /></Button>
            </div>
          </div>))}
        <Button variant="outline" className="mb-3" onClick={() => setEd({ ...ed, items: [...ed.items, { code: "q" + Date.now().toString(36), text: "", na: true }] })}><Plus className="size-4" />بند جديد</Button>
        <div className="flex flex-wrap gap-2"><Button onClick={() => save(true)}>نشر إصدار جديد</Button><Button variant="outline" onClick={() => save(false)}>حفظ مسودة</Button><Button variant="outline" onClick={() => setEd({ ...ed, preview: true })}>معاينة</Button><Button variant="ghost" onClick={() => setEd(null)}>إلغاء</Button></div>
      </>
    );
  }
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">نموذج الزيارة الصفية (5 محاور، 24 بندًا) معتمد ومستخدم في صفحة الزيارات. هنا نماذج أولياء الأمور والتقييم الشهري.</p>
      <div className="mb-3 flex flex-wrap gap-2">{[["monthly", "teacher"]].filter(([k, r]) => !groups.includes(k + "|" + r)).map(([k, r]) => <Button key={r} variant="outline" size="sm" onClick={() => setEd({ kind: k!, role_key: r!, title: "التقييم الشهري — المعلم", description: "", items: [], preview: false })}><Plus className="size-4" />إنشاء نموذج شهري للمعلم</Button>)}</div>
      {groups.map((g) => { const vs = forms.data!.filter((f) => f.kind + "|" + f.role_key === g); const cur = vs.find((f) => f.status === "draft") ?? vs.find((f) => f.status === "published") ?? vs[0]!;
        return (
          <section key={g} className="mb-3 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{cur.kind === "guardian" ? "تقييم ولي الأمر للمعلم" : `التقييم الشهري — ${ROLE_LABEL[cur.role_key]}`}</h3>
              <Button size="sm" onClick={() => setEd({ kind: cur.kind, role_key: cur.role_key, title: cur.title, description: cur.description ?? "", items: cur.items, preview: false })}>{cur.status === "draft" ? "متابعة المسودة" : "تعديل (إصدار جديد)"}</Button></div>
            <ul className="mt-2 text-sm">{vs.map((f) => <li key={f.id}>الإصدار {f.version} · {f.items.length} بند · {f.status === "published" ? "منشور" : f.status === "draft" ? "مسودة" : "مؤرشف"}</li>)}</ul>
          </section>); })}
    </>
  );
}
