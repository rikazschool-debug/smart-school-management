import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { ArrowRight, Download, FileText, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { rpc } from "@/components/hr/shared";
import { DeviceCard, type Device } from "@/components/hr/att-devices";
import { WEEKDAYS } from "@/components/hr/leave";
import { AT_STATUS, AttStatus, DayRow, SOURCE, addDays, dtm, mins, riyadhToday, tm, type AttDay, type EmpDays } from "@/components/hr/attendance";

type CapKey = "view" | "record" | "correct" | "settings" | "close" | "export";
type Caps = { enabled: boolean; settings_admin: boolean; team: boolean; caps: Record<CapKey, boolean> };
type Shift = { id: string; name: string; school_id: string | null; school: string | null; start_time: string; end_time: string; night: boolean; grace_in_min: number; grace_out_min: number; break_min: number; is_active: boolean; used: boolean; assigned: number };
type Setup = { can_edit: boolean; work_days: number[] | null; allow_self_punch: boolean; require_location: boolean; schools: { id: string; name: string }[]; shifts: Shift[]; holidays: { id: string; date: string; name: string; school: string | null }[]; devices: Device[] };
type Emp = { employee_id: string; employee: string; employee_no: string; school: string | null };
type BoardRow = Emp & AttDay & { can_record: boolean };
type Board = { date: string; closed: { school_id: string; school: string; closed: boolean; can_close: boolean; log: { action: string; reason: string | null; at: string; by: string | null }[] }[]; rows: BoardRow[] };
type Assign = Emp & { id: string; shift: string; shift_id: string; start_date: string; end_date: string | null; live: boolean };
type Corr = Emp & { id: string; date: string; kind: string; at: string | null; reason: string; status: string; created_at: string; decided_by: string | null; decision_reason: string | null; can_decide: boolean };
type Rep = Emp & { present: number; late: number; absent: number; incomplete: number; leave: number; excused: number; late_min: number; early_min: number; worked_min: number };
type Tab = "day" | "corrections" | "report" | "shifts";
type Search = { tab?: Tab; e?: string };

export const Route = createFileRoute("/_authenticated/app/hr_/attendance")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    if (s["tab"] === "corrections" || s["tab"] === "report" || s["tab"] === "shifts") o.tab = s["tab"];
    if (typeof s["e"] === "string") o.e = s["e"] as string;
    return o;
  },
  head: () => ({ meta: [{ title: "الحضور والانصراف — الموارد البشرية — ركاز" }, { name: "description", content: "ورديات الموظفين وبصماتهم ونتيجة كل يوم والتصحيحات وإغلاق اليوم." }, { property: "og:title", content: "الحضور والانصراف — ركاز" }, { property: "og:description", content: "حضور الموظفين وورديّاتهم في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

const err = (e: unknown) => toast.error(arabicError(e));

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["hr-att-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("hr_att_caps", { _org: org }) });
  if (!active) return null;
  const k = caps.data;
  const any = k && Object.values(k.caps).some(Boolean);
  return (
    <>
      <Link to="/app/hr" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />ملفات الموظفين</Link>
      <PageHeader title="الحضور والانصراف" desc="البصمات الخام تُحفظ كما وصلت ولا تُعدّل، ونتيجة اليوم تُحسب منها حسب الوردية والعطلات والإجازات المعتمدة. التصحيح بسبب مؤرخ، واليوم المغلق لا يُعدّل إلا بإعادة فتحه." />
      {caps.isLoading ? <LoadingState /> : caps.error ? <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} />
        : !k!.enabled ? <SectionLocked /> : !any ? <ForbiddenState /> : <Workspace org={org!} k={k!} />}
    </>
  );
}

function Workspace({ org, k }: { org: string; k: Caps }) {
  const s = Route.useSearch();
  const nav = useNavigate({ from: "/app/hr/attendance" });
  const c = k.caps;
  const tabs = ([["day", "اليوم", c.view], ["corrections", "التصحيحات", c.correct || c.view], ["report", "تقرير الفترة", c.view], ["shifts", "الورديات والإعداد", c.settings || c.view]] as const).filter((t) => t[2]);
  const tab = s.tab ?? tabs[0]?.[0] ?? "day";
  return (
    <div className="space-y-4">
      <nav aria-label="أقسام الحضور" className="flex flex-wrap gap-2 text-sm">
        {tabs.map(([key, l]) => <button key={key} type="button" onClick={() => nav({ search: key === "day" ? {} : { tab: key } })} className={"rounded-lg px-3 py-1.5 " + (tab === key ? "bg-primary text-primary-foreground" : "border bg-card hover:border-primary")} aria-current={tab === key ? "page" : undefined}>{l}</button>)}
        {k.team && <Link to="/app/team-leave" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">فريقي</Link>}
      </nav>
      {s.e && <EmpPanel id={s.e} onClose={() => nav({ search: tab === "day" ? {} : { tab } })} />}
      {tab === "day" && c.view && <DayBoard org={org} k={k} onOpen={(e) => nav({ search: { e } })} />}
      {tab === "corrections" && <Corrections org={org} />}
      {tab === "report" && c.view && <Report org={org} k={k} />}
      {tab === "shifts" && <Shifts org={org} k={k} />}
    </div>
  );
}

function EmpPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const today = riyadhToday();
  const q = useQuery({ queryKey: ["hr-att-emp", id], queryFn: () => rpc<EmpDays>("hr_att_emp_days", { _emp: id, _from: addDays(today, -30), _to: today }) });
  return (
    <Section title={q.data ? `${q.data.employee.employee} · ${q.data.employee.employee_no}` : "سجل الموظف"} desc="آخر 31 يومًا: النتيجة المحسوبة ثم البصمات الخام بمصدرها." action={<Button size="sm" variant="outline" onClick={onClose}>إغلاق</Button>}>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (
        <div className="space-y-3">
          <ul className="grid gap-2 md:grid-cols-2">{q.data!.days.map((d) => <li key={d.date}><DayRow d={d} /></li>)}</ul>
          {q.data!.punches.length > 0 && <ul className="space-y-1 text-xs">{q.data!.punches.map((p, i) => <li key={i} className="rounded bg-secondary/40 p-1.5">{dtm(p.at)} · {SOURCE[p.source] ?? p.source}{p.reason ? ` · ${p.reason}` : ""}</li>)}</ul>}
        </div>
      )}
    </Section>
  );
}

function DayBoard({ org, k, onOpen }: { org: string; k: Caps; onOpen: (e: string) => void }) {
  const qc = useQueryClient();
  const today = riyadhToday();
  const [date, setDate] = useState(addDays(today, -1));
  const [f, setF] = useState({ q: "", status: "", school: "" });
  const q = useQuery({ queryKey: ["hr-att-board", org, date, f], queryFn: () => rpc<Board>("hr_att_board", { _org: org, _date: date, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }) });
  const inv = () => { qc.invalidateQueries({ queryKey: ["hr-att-board"] }); qc.invalidateQueries({ queryKey: ["hr-att-emp"] }); };
  const close = useMutation({ mutationFn: (school: string) => rpc("hr_att_close", { _school: school, _date: date }), onSuccess: () => { toast.success("أُغلق اليوم"); inv(); }, onError: err });
  const reopen = useMutation({ mutationFn: (a: { school: string; reason: string }) => rpc("hr_att_reopen", { _school: a.school, _date: date, _reason: a.reason }), onSuccess: () => { toast.success("أُعيد فتح اليوم"); inv(); }, onError: err });
  const punch = useMutation({ mutationFn: (a: { emp: string; at: string; reason: string }) => rpc<{ duplicate: boolean }>("hr_att_punch_add", { _emp: a.emp, _at: a.at, _source: "manual", _reason: a.reason, _key: crypto.randomUUID() }), onSuccess: () => { toast.success("سُجلت البصمة"); inv(); }, onError: err });
  const addPunch = async (r: BoardRow) => {
    const t = await askText(`وقت البصمة لـ ${r.employee} يوم ${date} (مثال 07:15)`, { required: true }); if (!t) return;
    const m = t.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).match(/^(\d{1,2}):(\d{2})$/); if (!m) { toast.error("اكتب الوقت بصيغة 07:15"); return; }
    const reason = await askText("سبب التسجيل اليدوي", { required: true }); if (!reason) return;
    punch.mutate({ emp: r.employee_id, at: `${date}T${m[1]!.padStart(2, "0")}:${m[2]}:00+03:00`, reason });
  };
  const b = q.data;
  const rows = b?.rows ?? [];
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  return (
    <>
      <div className="grid gap-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="text-xs text-muted-foreground">اليوم<Input type="date" dir="ltr" className="w-full sm:w-44" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم" className="w-full sm:w-56" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="الحالة" className={selectCls("w-full sm:w-40")} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(AT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {(b?.closed.length ?? 0) > 1 && <select aria-label="المدرسة" className={selectCls("w-full sm:w-40")} value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">كل المدارس</option>{b!.closed.map((x) => <option key={x.school_id} value={x.school_id}>{x.school}</option>)}</select>}
        {k.caps.record && <ImportPunches org={org} onDone={inv} />}
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{(["present", "late", "absent", "incomplete", "leave"] as const).map((st) => (
          <button key={st} type="button" onClick={() => setF((x) => ({ ...x, status: x.status === st ? "" : st }))} className={"rounded-xl border bg-card p-3 text-start " + (f.status === st ? "border-primary" : "")}><span className="block text-2xl font-bold">{count(st)}</span><span className="block text-xs text-muted-foreground">{AT_STATUS[st]}</span></button>))}</div>
        <ul className="grid gap-2 md:grid-cols-2">{b!.closed.map((x) => (
          <li key={x.school_id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
            <b className="flex-1">{x.school}</b><span className={"rounded px-1.5 text-xs " + (x.closed ? "bg-muted" : "bg-success/10 text-success")}>{x.closed ? "اليوم مغلق" : "مفتوح للتعديل"}</span>
            {x.can_close && date < today && (x.closed
              ? <Button size="sm" variant="outline" disabled={reopen.isPending} onClick={async () => { const r = await askText(`سبب إعادة فتح ${date} — ${x.school}`, { required: true }); if (r) reopen.mutate({ school: x.school_id, reason: r }); }}>إعادة فتح</Button>
              : <Button size="sm" disabled={close.isPending} onClick={async () => { if (await ask(`إغلاق ${date} — ${x.school}؟ بعد الإغلاق لا تُقبل بصمات يدوية ولا تصحيحات لهذا اليوم إلا بإعادة فتحه.`)) close.mutate(x.school_id); }}>إغلاق اليوم</Button>)}
            {x.log.length > 0 && <p className="w-full text-xs text-muted-foreground">{x.log.map((l) => `${l.action === "close" ? "إغلاق" : "إعادة فتح"} ${dtm(l.at)}${l.by ? ` · ${l.by}` : ""}${l.reason ? ` · ${l.reason}` : ""}`).join(" — ")}</p>}
          </li>))}</ul>
        {rows.length === 0 ? <EmptyState title="لا توجد نتائج لهذا اليوم" hint="تظهر هنا أيام الموظفين ضمن نطاقك بعد تعيين وردياتهم." /> : (
          <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => (
            <li key={r.employee_id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-start font-semibold hover:text-primary" onClick={() => onOpen(r.employee_id)}>{r.employee}</button>{r.closed && <span className="rounded bg-muted px-1.5 text-xs">مغلق</span>}<AttStatus s={r.status} /></div>
              <p className="text-xs text-muted-foreground">{r.employee_no} · {r.shift ?? "بلا وردية"} · دخول {tm(r.first_in)} · خروج {tm(r.last_out)}{r.late_min ? ` · تأخير ${r.late_min}د` : ""}{r.early_min ? ` · مبكر ${r.early_min}د` : ""}{r.duplicates ? ` · ${r.duplicates} مكررة` : ""}</p>
              {r.can_record && !r.closed && <Button size="sm" variant="ghost" className="mt-1" disabled={punch.isPending} onClick={() => addPunch(r)}><Plus className="size-4" />بصمة يدوية</Button>}
            </li>))}</ul>
        )}
      </>)}
    </>
  );
}

/** Excel import: columns الرقم الوظيفي | التاريخ | الوقت. Each row goes through hr_att_punch_add with a row key, so re-importing adds nothing. */
function ImportPunches({ org, onDone }: { org: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (file: File) => {
    setBusy(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false, defval: "" }).slice(1).filter((r) => r.some((c) => String(c).trim()));
      const emps = await rpc<{ employee_id: string; employee_no: string }[]>("hr_att_assignments", { _org: org, _f: { all: true } });
      const byNo = new Map(emps.map((e) => [e.employee_no, e.employee_id]));
      let okN = 0, dup = 0; const bad: string[] = [];
      for (const [i, r] of rows.entries()) {
        const no = String(r[0] ?? "").trim(), d = String(r[1] ?? "").trim(), t = String(r[2] ?? "").trim();
        const emp = byNo.get(no);
        if (!emp) { bad.push(`سطر ${i + 2}: رقم وظيفي غير معروف أو بلا وردية`); continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(t)) { bad.push(`سطر ${i + 2}: التاريخ YYYY-MM-DD والوقت HH:MM`); continue; }
        const at = `${d}T${t.padStart(5, "0")}:00+03:00`;
        try { const x = await rpc<{ duplicate: boolean }>("hr_att_punch_add", { _emp: emp, _at: at, _source: "import", _reason: `استيراد ${file.name}`, _key: `${no}:${at}` }); x.duplicate ? dup++ : okN++; }
        catch (e) { bad.push(`سطر ${i + 2}: ${arabicError(e)}`); }
      }
      toast.success(`أُضيفت ${okN} بصمة${dup ? ` · ${dup} موجودة مسبقًا` : ""}${bad.length ? ` · ${bad.length} مرفوضة` : ""}`);
      if (bad.length) toast.error(bad.slice(0, 5).join("\n"));
      onDone();
    } catch { toast.error("تعذّر قراءة الملف"); } finally { setBusy(false); }
  };
  return (
    <label className={"inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:border-primary " + (busy ? "opacity-60" : "")}>
      <Upload className="size-4" />{busy ? "جارٍ الاستيراد…" : "استيراد بصمات Excel"}
      <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(f); }} />
    </label>
  );
}

function Corrections({ org }: { org: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const q = useQuery({ queryKey: ["hr-att-corr", org, status], queryFn: () => rpc<Corr[]>("hr_att_corr_list", { _org: org, _status: status }) });
  const dec = useMutation({ mutationFn: (a: { id: string; ok: boolean; reason: string | null }) => rpc("hr_att_corr_decide", { _id: a.id, _approve: a.ok, _reason: a.reason }), onSuccess: () => { toast.success("سُجل القرار"); qc.invalidateQueries({ queryKey: ["hr-att-corr"] }); qc.invalidateQueries({ queryKey: ["hr-att-board"] }); }, onError: err });
  return (
    <>
      <select aria-label="الحالة" className={selectCls("w-full sm:w-44")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="pending">قيد المراجعة</option><option value="applied">معتمدة</option><option value="rejected">مرفوضة</option><option value="">الكل</option></select>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (q.data ?? []).length === 0 ? <EmptyState title="لا توجد طلبات تصحيح" /> : (
        <ul className="grid gap-2 md:grid-cols-2">{q.data!.map((c) => (
          <li key={c.id} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-center gap-2"><b className="flex-1 truncate">{c.employee}</b><bdi dir="ltr" className="text-xs">{c.date}</bdi></div>
            <p className="text-xs text-muted-foreground">{c.kind === "punch" ? `إضافة بصمة ${tm(c.at)}` : "عذر لليوم"} · {c.reason}{c.decided_by ? ` · ${c.decided_by}` : ""}{c.decision_reason ? ` · ${c.decision_reason}` : ""}</p>
            {c.can_decide && <div className="mt-2 flex gap-2"><Button size="sm" disabled={dec.isPending} onClick={() => dec.mutate({ id: c.id, ok: true, reason: null })}>اعتماد</Button>
              <Button size="sm" variant="outline" disabled={dec.isPending} onClick={async () => { const r = await askText("سبب الرفض", { required: true }); if (r) dec.mutate({ id: c.id, ok: false, reason: r }); }}>رفض</Button></div>}
          </li>))}</ul>
      )}
    </>
  );
}

function Report({ org, k }: { org: string; k: Caps }) {
  const today = riyadhToday();
  const [f, setF] = useState({ from: addDays(today, -30), to: addDays(today, -1), q: "" });
  const q = useQuery({ queryKey: ["hr-att-rep", org, f], queryFn: () => rpc<Rep[]>("hr_att_report", { _org: org, _from: f.from, _to: f.to, _f: f.q ? { q: f.q } : {} }) });
  const rows = q.data ?? [];
  const exp = (kind: "xlsx" | "pdf") => {
    const headers = ["الموظف", "الرقم الوظيفي", "المدرسة", "حاضر", "متأخر", "غائب", "ناقص", "إجازة", "معذور", "دقائق التأخير", "دقائق الخروج المبكر", "ساعات العمل"];
    const data = rows.map((r) => [r.employee, r.employee_no, r.school ?? "", r.present, r.late, r.absent, r.incomplete, r.leave, r.excused, r.late_min, r.early_min, Math.round(r.worked_min / 6) / 10]);
    const meta = { title: "تقرير الحضور", filters: [`من ${f.from}`, `إلى ${f.to}`], note: "مصدر قابل للمراجعة؛ لا يُطبق منه أي خصم مالي إلا عبر مسار الرواتب المعتمد." };
    return kind === "xlsx" ? exportXlsx(meta, headers, data) : exportPdf(meta, headers, data);
  };
  return (
    <>
      <div className="grid gap-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="text-xs text-muted-foreground">من<Input type="date" dir="ltr" className="w-full sm:w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">إلى<Input type="date" dir="ltr" className="w-full sm:w-40" max={today} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <Input aria-label="بحث" placeholder="بحث" className="w-full sm:w-48" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        {k.caps.export && rows.length > 0 && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></div>}
      </div>
      <p className="text-xs text-muted-foreground">يُحسب التقرير من الأيام المحسوبة فقط؛ افتح يوم «اليوم» لاحتساب يوم لم يُفتح بعد. لا يُطبق منه أي خصم مالي.</p>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد بيانات للفترة" /> : (
        <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => (
          <li key={r.employee_id} className="rounded-xl border bg-card p-3 text-sm"><b>{r.employee}</b>
            <p className="text-xs text-muted-foreground">حاضر {r.present} · متأخر {r.late} · غائب {r.absent} · ناقص {r.incomplete} · إجازة {r.leave} · معذور {r.excused} · تأخير {r.late_min}د · عمل {mins(r.worked_min)}</p></li>))}</ul>
      )}
    </>
  );
}

function Shifts({ org, k }: { org: string; k: Caps }) {
  const qc = useQueryClient();
  const setup = useQuery({ queryKey: ["hr-att-setup", org], queryFn: () => rpc<Setup>("hr_att_setup", { _org: org }) });
  const assigns = useQuery({ queryKey: ["hr-att-assign", org], queryFn: () => rpc<Assign[]>("hr_att_assignments", { _org: org, _f: {} }) });
  const free = useQuery({ queryKey: ["hr-att-free", org], enabled: k.caps.settings, queryFn: () => rpc<Emp[]>("hr_att_unassigned", { _org: org }) });
  const inv = () => ["hr-att-setup", "hr-att-assign", "hr-att-free", "hr-att-board"].forEach((x) => qc.invalidateQueries({ queryKey: [x] }));
  const blank = { name: "", start_time: "", end_time: "", grace_in_min: "", grace_out_min: "", break_min: "", school_id: "" };
  const [sf, setSf] = useState(blank);
  const saveShift = useMutation({ mutationFn: (p: Record<string, unknown>) => rpc("hr_att_shift_save", { _org: org, _id: (p["id"] as string) ?? null, _p: p }), onSuccess: () => { toast.success("حُفظت الوردية"); setSf(blank); inv(); }, onError: err });
  const [af, setAf] = useState({ shift: "", from: riyadhToday(), to: "", emps: [] as string[] });
  const assign = useMutation({ mutationFn: () => rpc<{ assigned: number }>("hr_att_assign", { _org: org, _emps: af.emps, _shift: af.shift, _from: af.from, _to: af.to || null }), onSuccess: (r) => { toast.success(`عُيّنت الوردية لـ ${r.assigned}`); setAf({ ...af, emps: [] }); inv(); }, onError: err });
  const endA = useMutation({ mutationFn: (a: { id: string; end: string; reason: string }) => rpc("hr_att_assign_end", { _id: a.id, _end: a.end, _reason: a.reason }), onSuccess: () => { toast.success("أُنهي التعيين"); inv(); }, onError: err });
  const [hf, setHf] = useState({ date: "", name: "", school: "" });
  const hol = useMutation({ mutationFn: () => rpc("hr_att_holiday_save", { _org: org, _school: hf.school || null, _date: hf.date, _name: hf.name }), onSuccess: () => { toast.success("أُضيفت العطلة"); setHf({ date: "", name: "", school: "" }); inv(); }, onError: err });
  const holDel = useMutation({ mutationFn: (id: string) => rpc("hr_att_holiday_delete", { _id: id }), onSuccess: () => { toast.success("حُذفت العطلة"); inv(); }, onError: err });
  const selfSet = useMutation({ mutationFn: (v: { self: boolean; loc: boolean }) => rpc("hr_att_settings_save", { _org: org, _self: v.self, _require_location: v.loc }), onSuccess: () => { toast.success("حُفظ الإعداد"); inv(); }, onError: err });
  const [dname, setDname] = useState(""); const [dschool, setDschool] = useState("");
  const [secret, setSecret] = useState<{ id: string; secret: string } | null>(null);
  const dev = useMutation({ mutationFn: () => rpc<{ id: string; secret: string }>("hr_att_device_save", { _org: org, _school: dschool || null, _name: dname }), onSuccess: (r) => { setSecret(r); setDname(""); inv(); }, onError: err });
  const devT = useMutation({ mutationFn: (a: { id: string; on: boolean }) => rpc("hr_att_device_toggle", { _id: a.id, _active: a.on }), onSuccess: inv, onError: err });
  if (setup.isLoading) return <LoadingState />;
  if (setup.error) return <ErrorState message={arabicError(setup.error)} onRetry={() => setup.refetch()} />;
  const d = setup.data!;
  const can = d.can_edit;
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <div className="space-y-4">
      {!can && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">عرض فقط. يضبط الورديات والعطلات المالك أو من يملك صلاحية «إعداد الورديات والعطلات والأجهزة» على مستوى المؤسسة.</p>}
      <Section title="أيام العمل" desc="تقويم الموظفين منفصل عن التقويم الدراسي، ويُضبط من صفحة الإجازات.">
        <p className="text-sm">{d.work_days ? d.work_days.map((x) => WEEKDAYS[x]).join("، ") : <span className="text-warning">لم تُحدد؛ كل الأيام تُعامل أيام عمل حتى تُحدد.</span>} <Link to="/app/hr/leave" search={{ tab: "settings" }} className="text-primary">ضبط</Link></p>
      </Section>
      <Section title="الورديات" desc="لا توجد قيم افتراضية للسماح أو الراحة. الوردية المستخدمة لا تتغير أوقاتها؛ أنشئ وردية جديدة وعيّنها بتاريخ سريان. إذا انتهت قبل بدايتها فهي ليلية.">
        {can && (
          <form className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!saveShift.isPending) saveShift.mutate({ name: sf.name, start_time: sf.start_time, end_time: sf.end_time, grace_in_min: num(sf.grace_in_min), grace_out_min: num(sf.grace_out_min), break_min: num(sf.break_min), school_id: sf.school_id || null }); }}>
            <div className="col-span-2"><Label htmlFor="s-n">الاسم</Label><Input id="s-n" className="mt-1 w-full sm:w-44" value={sf.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} /></div>
            <div><Label htmlFor="s-s">البداية</Label><Input id="s-s" type="time" dir="ltr" className="mt-1 w-full sm:w-28" value={sf.start_time} onChange={(e) => setSf({ ...sf, start_time: e.target.value })} /></div>
            <div><Label htmlFor="s-e">النهاية</Label><Input id="s-e" type="time" dir="ltr" className="mt-1 w-full sm:w-28" value={sf.end_time} onChange={(e) => setSf({ ...sf, end_time: e.target.value })} /></div>
            <div><Label htmlFor="s-gi">سماح الدخول (د)</Label><Input id="s-gi" inputMode="numeric" dir="ltr" className="mt-1 w-full sm:w-24" value={sf.grace_in_min} onChange={(e) => setSf({ ...sf, grace_in_min: e.target.value })} /></div>
            <div><Label htmlFor="s-go">سماح الخروج (د)</Label><Input id="s-go" inputMode="numeric" dir="ltr" className="mt-1 w-full sm:w-24" value={sf.grace_out_min} onChange={(e) => setSf({ ...sf, grace_out_min: e.target.value })} /></div>
            <div><Label htmlFor="s-b">الراحة (د)</Label><Input id="s-b" inputMode="numeric" dir="ltr" className="mt-1 w-full sm:w-24" value={sf.break_min} onChange={(e) => setSf({ ...sf, break_min: e.target.value })} /></div>
            <Button size="sm" type="submit" disabled={saveShift.isPending}><Plus className="size-4" />إضافة وردية</Button>
          </form>
        )}
        {d.shifts.length === 0 ? <EmptyState title="لا توجد ورديات" hint="أضف وردية ثم عيّنها للموظفين؛ لا يُحتسب حضور موظف بلا وردية." /> : (
          <ul className="grid gap-2 md:grid-cols-2">{d.shifts.map((s) => (
            <li key={s.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-center gap-2"><b className="flex-1">{s.name}</b>{s.night && <span className="rounded bg-secondary px-1.5 text-xs">ليلية</span>}{!s.is_active && <span className="rounded bg-muted px-1.5 text-xs">موقوفة</span>}</div>
              <p className="text-xs text-muted-foreground"><bdi dir="ltr">{s.start_time}–{s.end_time}</bdi> · سماح {s.grace_in_min}/{s.grace_out_min}د · راحة {s.break_min}د · {s.assigned} موظف حاليًا</p>
              {can && <Button size="sm" variant="ghost" className="mt-1" onClick={() => saveShift.mutate({ ...s, id: s.id, is_active: !s.is_active })}>{s.is_active ? "إيقاف" : "تفعيل"}</Button>}
            </li>))}</ul>
        )}
      </Section>
      {k.caps.settings && (
        <Section title="تعيين وردية" desc="لموظف أو مجموعة بتاريخ سريان. التعيين المتداخل يُرفض حتى يُنهى السابق.">
          <form className="grid gap-2 sm:flex sm:flex-wrap sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!af.shift || af.emps.length === 0) { toast.error("اختر الوردية والموظفين"); return; } if (!assign.isPending) assign.mutate(); }}>
            <div><Label htmlFor="a-s">الوردية</Label><select id="a-s" className={selectCls("mt-1 w-full sm:w-44")} value={af.shift} onChange={(e) => setAf({ ...af, shift: e.target.value })}><option value="">— اختر —</option>{d.shifts.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><Label htmlFor="a-f">من</Label><Input id="a-f" type="date" dir="ltr" className="mt-1 w-full sm:w-40" value={af.from} onChange={(e) => setAf({ ...af, from: e.target.value })} /></div>
            <div><Label htmlFor="a-t">إلى (اختياري)</Label><Input id="a-t" type="date" dir="ltr" className="mt-1 w-full sm:w-40" value={af.to} onChange={(e) => setAf({ ...af, to: e.target.value })} /></div>
            <Button size="sm" type="submit" disabled={assign.isPending}>تعيين ({af.emps.length})</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">موظفون بلا وردية سارية ({free.data?.length ?? 0}):</p>
          <div className="mt-1 flex flex-wrap gap-2">{(free.data ?? []).map((e) => (
            <label key={e.employee_id} className={"flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm " + (af.emps.includes(e.employee_id) ? "border-primary bg-primary/10" : "bg-card")}>
              <input type="checkbox" checked={af.emps.includes(e.employee_id)} onChange={(x) => setAf({ ...af, emps: x.target.checked ? [...af.emps, e.employee_id] : af.emps.filter((y) => y !== e.employee_id) })} />{e.employee}</label>))}</div>
        </Section>
      )}
      <Section title="التعيينات السارية">
        {(assigns.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد تعيينات.</p> : (
          <ul className="grid gap-2 md:grid-cols-2">{assigns.data!.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm"><b className="flex-1 truncate">{a.employee}</b><span className="text-xs">{a.shift} · <bdi dir="ltr">{a.start_date}</bdi>{a.end_date ? <> ← <bdi dir="ltr">{a.end_date}</bdi></> : " (مستمر)"}</span>
              {k.caps.settings && <Button size="sm" variant="ghost" disabled={endA.isPending} onClick={async () => { const end = await askText("آخر يوم للتعيين (YYYY-MM-DD)", { required: true }); if (!end) return; const reason = await askText("السبب", { required: true }); if (reason) endA.mutate({ id: a.id, end, reason }); }}>إنهاء</Button>}
            </li>))}</ul>
        )}
      </Section>
      <Section title="العطلات" desc="على المؤسسة كلها أو مدرسة واحدة. يوم العطلة لا يُحسب غيابًا.">
        {can && (
          <form className="mb-3 grid gap-2 sm:flex sm:flex-wrap sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!hf.date || !hf.name.trim()) { toast.error("التاريخ والاسم مطلوبان"); return; } if (!hol.isPending) hol.mutate(); }}>
            <Input aria-label="التاريخ" type="date" dir="ltr" className="w-full sm:w-40" value={hf.date} onChange={(e) => setHf({ ...hf, date: e.target.value })} />
            <Input aria-label="اسم العطلة" placeholder="اسم العطلة" className="w-full sm:w-56" value={hf.name} onChange={(e) => setHf({ ...hf, name: e.target.value })} />
            {d.schools.length > 1 && <select aria-label="المدرسة" className={selectCls("w-full sm:w-40")} value={hf.school} onChange={(e) => setHf({ ...hf, school: e.target.value })}><option value="">المؤسسة كلها</option>{d.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            <Button size="sm" type="submit" disabled={hol.isPending}><Plus className="size-4" />إضافة</Button>
          </form>
        )}
        {d.holidays.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد عطلات مسجلة.</p> : <ul className="flex flex-wrap gap-2 text-sm">{d.holidays.map((h) => (
          <li key={h.id} className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1"><bdi dir="ltr">{h.date}</bdi> {h.name}{h.school ? ` · ${h.school}` : ""}{can && <button type="button" className="text-xs text-destructive" onClick={async () => { if (await ask(`حذف عطلة ${h.name}؟`)) holDel.mutate(h.id); }}>حذف</button>}</li>))}</ul>}
      </Section>
      {can && (
        <Section title="مصادر التسجيل" desc="الجوال معطّل افتراضيًا. أجهزة ZKTeco (وضع ADMS) تتصل عبر برنامج الربط، ويُنقل الحضور والانصراف فقط بلا قوالب بصمة أو وجه.">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.allow_self_punch} disabled={selfSet.isPending} onChange={(e) => selfSet.mutate({ self: e.target.checked, loc: d.require_location })} />السماح للموظف بتسجيل بصمته من «حضوري»</label>
          <p className="ms-6 text-xs text-muted-foreground">كل بصمة جوال تتطلب قراءة موقع حديثة ودقيقة داخل نطاق مدرسة الموظف؛ المدرسة بلا موقع معتمد ترفض التسجيل.</p>
          <SchoolSites org={org} />
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (dname.trim() && !dev.isPending) dev.mutate(); }}>
            <Input aria-label="اسم الجهاز" placeholder="اسم جهاز جديد" className="w-full sm:w-56" value={dname} onChange={(e) => setDname(e.target.value)} />
            <select aria-label="مدرسة الجهاز" className={selectCls("w-full sm:w-44")} value={dschool} onChange={(e) => setDschool(e.target.value)}><option value="">مدرسة الجهاز…</option>{d.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <Button size="sm" type="submit" disabled={dev.isPending}><Plus className="size-4" />إضافة جهاز</Button>
          </form>
          {secret && <div className="mt-2 rounded-lg border border-warning bg-warning/10 p-2 text-xs"><p>انسخ هذه البيانات الآن؛ لن يظهر السر مرة أخرى.</p><p dir="ltr" className="break-all font-mono">DEVICE_ID={secret.id}<br />DEVICE_SECRET={secret.secret}</p><p>أدخل الرقم التسلسلي للجهاز في بطاقته أدناه.</p><Button size="sm" variant="ghost" onClick={() => setSecret(null)}>تم</Button></div>}
          {d.devices.length > 0 && <ul className="mt-2 space-y-2">{d.devices.map((x) => <DeviceCard key={x.id} org={org} d={x} schools={d.schools} onToggle={() => devT.mutate({ id: x.id, on: !x.is_active })} />)}</ul>}
        </Section>
      )}
    </div>
  );
}

type Site = { school_id: string; school: string; lat: number | null; lng: number | null; radius_m: number | null; max_accuracy_m: number | null };
/** Approved location per school (owner or hr_attendance.settings). */
function SchoolSites({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-att-sites", org], queryFn: () => rpc<Site[]>("hr_att_sites_list", { _org: org }) });
  const [ed, setEd] = useState<{ id: string; lat: string; lng: string; r: string; a: string } | null>(null);
  const save = useMutation({ mutationFn: () => rpc("hr_att_site_save", { _school: ed!.id, _lat: Number(ed!.lat), _lng: Number(ed!.lng), _radius: Number(ed!.r), _accuracy: Number(ed!.a) }), onSuccess: () => { toast.success("حُفظ موقع المدرسة"); setEd(null); qc.invalidateQueries({ queryKey: ["hr-att-sites"] }); }, onError: (e) => toast.error(arabicError(e)) });
  const here = () => navigator.geolocation?.getCurrentPosition((p) => setEd((x) => x && { ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }), () => toast.error("تعذّر قراءة موقعك"), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div className="mt-3 rounded-xl border p-3">
      <h3 className="text-sm font-bold">مواقع المدارس المعتمدة</h3>
      <ul className="mt-2 space-y-2 text-sm">{(q.data ?? []).map((s) => (
        <li key={s.school_id} className="rounded-lg bg-secondary/40 p-2">
          <div className="flex flex-wrap items-center gap-2"><span className="flex-1 font-semibold">{s.school}</span>
            <span className="text-xs text-muted-foreground">{s.lat == null ? "لم يُضبط — بصمة الجوال مرفوضة" : <>نطاق {s.radius_m} م · دقة ≤ {s.max_accuracy_m} م · <bdi dir="ltr">{s.lat.toFixed(5)}, {s.lng!.toFixed(5)}</bdi></>}</span>
            <Button size="sm" variant="outline" onClick={() => setEd({ id: s.school_id, lat: s.lat?.toString() ?? "", lng: s.lng?.toString() ?? "", r: String(s.radius_m ?? 150), a: String(s.max_accuracy_m ?? 50) })}>{s.lat == null ? "ضبط الموقع" : "تعديل"}</Button></div>
          {ed?.id === s.school_id && (
            <form className="mt-2 grid gap-2 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
              <div><Label htmlFor="st-lat">خط العرض</Label><Input id="st-lat" dir="ltr" inputMode="decimal" value={ed.lat} onChange={(e) => setEd({ ...ed, lat: e.target.value })} /></div>
              <div><Label htmlFor="st-lng">خط الطول</Label><Input id="st-lng" dir="ltr" inputMode="decimal" value={ed.lng} onChange={(e) => setEd({ ...ed, lng: e.target.value })} /></div>
              <div><Label htmlFor="st-r">النطاق (متر)</Label><Input id="st-r" dir="ltr" inputMode="numeric" value={ed.r} onChange={(e) => setEd({ ...ed, r: e.target.value })} /></div>
              <div><Label htmlFor="st-a">حد الدقة (متر)</Label><Input id="st-a" dir="ltr" inputMode="numeric" value={ed.a} onChange={(e) => setEd({ ...ed, a: e.target.value })} /></div>
              <div className="flex gap-2"><Button size="sm" type="submit" disabled={save.isPending}>حفظ الموقع</Button><Button size="sm" type="button" variant="ghost" onClick={here}>موقعي الحالي</Button></div>
            </form>)}
        </li>))}</ul>
    </div>
  );
}
