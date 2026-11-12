import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HrPageTop } from "@/components/hr/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { rpc } from "@/components/hr/shared";
import { PayPolicies, TOPIC_L, policySummary, type Pol, type Topic } from "@/components/hr/pay-policies";
import { ADV_STATUS, AdvanceCard, CAT_L, DEC_STATUS, KIND_L, PAY_STATUS, POST_STATUS, Pill, RUN_STATUS, SRC_L, mon, nextMonth, sar, thisMonth, type Advance, type PayItem } from "@/components/hr/money";

type Caps = { enabled: boolean; owner: boolean; link: boolean; money: Record<"view" | "draft" | "approve" | "items" | "export", boolean>; pay: Record<"view" | "prepare" | "finance_review" | "approve" | "post" | "pay" | "export", boolean> };
type RunCan = Record<"prepare" | "submit" | "review" | "return" | "approve" | "publish" | "post" | "pay", boolean>;
type Run = { id: string; month: string; status: string; version: number; rev: number; totals: { employees?: number; gross?: number; deductions?: number; net?: number; blocked?: number; excluded?: number; exceptions?: number; employer_gosi?: number; pending_policies?: Topic[] }; notes: string[]; prepared_by: string; prepared_at: string | null; submitted_by: string; reviewed_version: number | null; reviewed_by: string; approved_by: string; approved_version: number | null; return_reason: string | null; published_at: string | null; posting_status: string; posting_ref: string | null; payment_status: string; payment_ref: string | null; link: boolean; can: RunCan };
type Line = { id: string; employee_id: string; employee: string; employee_no: string; school: string | null; status: string; items: PayItem[]; gross: number; deductions: number; net: number; currency: string | null; blockers: { code: string; msg: string }[]; notes: string[]; exclude_reason: string | null; exception: { kind: string; reason: string; effect: string; by?: string } | null; resolution: { mode: string; reason: string } | null };
type RunD = Run & { policies: Record<Topic, Pol>; allow_partial_exception: boolean; lines: Line[]; versions: { version: number; by: string; at: string }[]; events: { at: string; action: string; reason: string | null; by: string }[] };
type Dec = { id: string; employee_id: string; employee: string; employee_no: string; item: string; kind: string; amount: number | null; hours: number | null; category: string; mode: string; from_month: string; to_month: string | null; reason: string; status: string; rev: number; created_by: string; approved_by: string; cancel_reason: string | null; can: { approve: boolean; cancel: boolean } };
type Setup = { items: { id: string; name: string; kind: string; is_active: boolean }[]; leave_types: { id: string; name: string }[]; unpaid_leave_types: string[]; day_divisor: number | null; finance_link: string | null; link_by: string; link_at: string | null; can_items: boolean; can_settings: boolean };
type Emp = { id: string; full_name: string; employee_no: string };
type Tab = "runs" | "decisions" | "advances" | "settings";
type Search = { tab?: Tab; r?: string };

export const Route = createFileRoute("/_authenticated/app/hr_/payroll")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    if (s["tab"] === "decisions" || s["tab"] === "advances" || s["tab"] === "settings") o.tab = s["tab"];
    if (typeof s["r"] === "string") o.r = s["r"] as string;
    return o;
  },
  head: () => ({ meta: [{ title: "الرواتب والسلف — الموارد البشرية — ركاز" }, { name: "description", content: "مسير الرواتب: الموارد البشرية تعدّ، المالية تراجع، الإدارة العامة تعتمد؛ مع القرارات والسلف والعهد." }, { property: "og:title", content: "الرواتب والسلف — ركاز" }, { property: "og:description", content: "مسير الرواتب والقرارات والسلف في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

const EV: Record<string, string> = { create: "إنشاء", prepare: "إعادة احتساب", submit: "إرسال للمراجعة المالية", review: "مراجعة مالية", return: "إرجاع للتعديل", approve: "اعتماد الإدارة العامة", publish: "نشر القسائم", post: "تأكيد القيد", pay: "تأكيد الصرف", "resolve:exclude": "استبعاد موظف", "resolve:confirm": "تأكيد بنود شهر جزئي", "resolve:clear": "إلغاء معالجة" };

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["hr-money-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("hr_money_caps", { _org: org }) });
  if (!active) return null;
  const k = caps.data;
  const any = k && (Object.values(k.money).some(Boolean) || Object.values(k.pay).some(Boolean) || k.owner);
  return (
    <>
      <HrPageTop title="الرواتب والسلف" desc="الموارد البشرية تُعدّ المسير ← المالية تراجع ← الإدارة العامة تعتمد النسخة التي راجعتها المالية. القيد والصرف حالتان منفصلتان." />
      {caps.isLoading ? <LoadingState /> : caps.error ? <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} />
        : !k!.enabled ? <SectionLocked /> : !any ? <ForbiddenState /> : <Workspace org={org!} k={k!} />}
    </>
  );
}

function Workspace({ org, k }: { org: string; k: Caps }) {
  const s = Route.useSearch();
  const nav = useNavigate({ from: "/app/hr/payroll" });
  const tabs = ([["runs", "مسيرات الرواتب", k.pay.view], ["decisions", "القرارات", k.money.view], ["advances", "السلف", k.money.view], ["settings", "البنود والإعدادات", true]] as const).filter((t) => t[2]);
  const tab: Tab = s.tab ?? (tabs[0]?.[0] as Tab);
  return (
    <div className="space-y-4">
      {!k.link && <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-sm">القيد المحاسبي والصرف: <b>بانتظار إعداد الربط المالي</b>. يمكن إعداد المسير ومراجعته واعتماده، ولا يُؤكد قيد أو صرف قبل أن يسجل المالك الربط المعتمد.</p>}
      <nav aria-label="أقسام الرواتب" className="flex flex-wrap gap-2 text-sm">
        {tabs.map(([key, l]) => <button key={key} type="button" onClick={() => nav({ search: key === "runs" ? {} : { tab: key } })} className={"rounded-lg px-3 py-1.5 " + (tab === key ? "bg-primary text-primary-foreground" : "border bg-card hover:border-primary")} aria-current={tab === key ? "page" : undefined}>{l}</button>)}
      </nav>
      {tab === "runs" && <Runs org={org} k={k} open={s.r} onOpen={(id) => nav({ search: id ? { r: id } : {} })} />}
      {tab === "decisions" && <Decisions org={org} k={k} />}
      {tab === "advances" && <Advances org={org} k={k} />}
      {tab === "settings" && <Settings org={org} />}
    </div>
  );
}

const runTone = (s: string) => (s === "approved" ? "ok" : s === "finance_review" ? "wait" : "muted") as "ok" | "wait" | "muted";
function States({ r }: { r: Run }) {
  return <div className="flex flex-wrap gap-1">
    <Pill tone={runTone(r.status)}>المسير: {RUN_STATUS[r.status]}{r.status === "finance_review" && r.reviewed_version ? " — روجع وبانتظار الإدارة" : ""}</Pill>
    <Pill tone={r.posting_status === "posted" ? "ok" : "wait"}>القيد: {POST_STATUS[r.posting_status]}</Pill>
    <Pill tone={r.payment_status === "paid" ? "ok" : "wait"}>الدفع: {PAY_STATUS[r.payment_status]}</Pill>
  </div>;
}

function Runs({ org, k, open, onOpen }: { org: string; k: Caps; open?: string | undefined; onOpen: (id: string | null) => void }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const list = useQuery({ queryKey: ["hr-runs", org], queryFn: () => rpc<Run[]>("hr_pay_runs", { _org: org }) });
  const create = useMutation({
    mutationFn: () => rpc<string>("hr_pay_run_create", { _org: org, _month: month }),
    onSuccess: (id) => { toast.success("أُنشئ المسير واحتُسب"); qc.invalidateQueries({ queryKey: ["hr-runs"] }); onOpen(id); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const rows = list.data ?? [];
  const exp = (kind: "xlsx" | "pdf") => {
    const h = ["الشهر", "حالة المسير", "القيد المحاسبي", "مرجع القيد", "الدفع", "مرجع الدفع", "الموظفون", "الإجمالي", "الاستقطاعات", "الصافي"];
    const d = rows.map((r) => [mon(r.month), RUN_STATUS[r.status]!, POST_STATUS[r.posting_status]!, r.posting_ref ?? "", PAY_STATUS[r.payment_status]!, r.payment_ref ?? "", Number(r.totals.employees ?? 0), Number(r.totals.gross ?? 0), Number(r.totals.deductions ?? 0), Number(r.totals.net ?? 0)]);
    const meta = { title: "سجل مسيرات الرواتب", filters: [] };
    return kind === "xlsx" ? exportXlsx(meta, h, d) : exportPdf(meta, h, d);
  };
  return (
    <>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        {k.pay.prepare && <><label className="text-xs text-muted-foreground">الشهر<Input type="month" dir="ltr" aria-label="شهر المسير" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <Button disabled={create.isPending || !month} onClick={() => create.mutate()}><Plus className="size-4" />إنشاء مسير</Button></>}
        {k.pay.export && rows.length > 0 && <div className="ms-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></div>}
      </div>
      {open && <RunPanel id={open} k={k} onClose={() => onOpen(null)} />}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد مسيرات" hint="أنشئ مسير الشهر ليُحتسب من العقود السارية والقرارات المعتمدة وأقساط السلف." /> : (
        <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => <li key={r.id}><button type="button" onClick={() => onOpen(r.id)} className="w-full space-y-1 rounded-xl border bg-card p-3 text-start text-sm hover:border-primary">
          <span className="block font-bold">مسير {mon(r.month)} {r.version ? <span className="text-xs font-normal text-muted-foreground">· النسخة {r.version}</span> : null}</span>
          <States r={r} />
          <span className="block text-muted-foreground">{r.totals.employees ?? 0} موظف · الصافي {sar(r.totals.net)}{r.totals.blocked ? ` · ${r.totals.blocked} بموانع` : ""}</span>
        </button></li>)}</ul>)}
    </>
  );
}

function RunPanel({ id, k, onClose }: { id: string; k: Caps; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-run", id], queryFn: () => rpc<RunD>("hr_pay_run_get", { _id: id }) });
  const [openLine, setOpenLine] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: async (a: { fn: string; args: Record<string, unknown>; msg: string }) => { await rpc(a.fn, a.args); return a.msg; },
    onSuccess: (m) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-run"] }); qc.invalidateQueries({ queryKey: ["hr-runs"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const r = q.data!;
  const run = (action: string, msg: string, extra: { _reason?: string | null; _ref?: string | null } = {}) => { if (!act.isPending) act.mutate({ fn: "hr_pay_run_act", args: { _id: r.id, _rev: r.rev, _action: action, _reason: extra._reason ?? null, _ref: extra._ref ?? null }, msg }); };
  const withText = async (label: string, action: string, msg: string, field: "_reason" | "_ref") => { const t = await askText(label, { required: true }); if (t) run(action, msg, { [field]: t }); };
  const resolve = async (emp: string, mode: string) => {
    const t = mode === "clear" ? "" : await askText(mode === "exclude" ? "سبب استبعاد الموظف من هذا المسير" : "سبب الاستثناء الموثق ومرجعه (يظهر للمالية والإدارة العامة)", { required: true });
    if (mode !== "clear" && !t) return;
    act.mutate({ fn: "hr_pay_line_resolve", args: { _run: r.id, _rev: r.rev, _emp: emp, _mode: mode, _reason: t || null }, msg: "حُدّث المسير" });
  };
  const inc = r.lines.filter((l) => l.status === "included");
  const exp = (kind: "xlsx" | "pdf") => {
    const h = ["الموظف", "الرقم الوظيفي", "المدرسة", "الإجمالي", "الاستقطاعات", "الصافي", "موانع"];
    const d = inc.map((l) => [l.employee, l.employee_no, l.school ?? "", Number(l.gross), Number(l.deductions), Number(l.net), l.blockers.map((b) => b.msg).join("؛ ")]);
    const meta = { title: `مسير ${mon(r.month)}`, filters: [`المسير: ${RUN_STATUS[r.status]}`, `القيد: ${POST_STATUS[r.posting_status]}`, `الدفع: ${PAY_STATUS[r.payment_status]}`], note: `النسخة ${r.version}` };
    return kind === "xlsx" ? exportXlsx(meta, h, d) : exportPdf(meta, h, d);
  };
  const xs = r.lines.filter((l) => l.exception);
  const XK: Record<string, string> = { excluded: "مستبعد بقرار", partial: "استثناء شهر جزئي موثق", no_contract: "بلا عقد ساري", no_basic: "بلا أجر أساسي" };
  const expX = (kind: "xlsx" | "pdf") => {
    const h = ["الموظف", "الرقم الوظيفي", "النوع", "السبب", "الأثر", "الصافي المحسوب", "سجّله"];
    const d = xs.map((l) => [l.employee, l.employee_no, XK[l.exception!.kind] ?? l.exception!.kind, l.exception!.reason, l.exception!.effect, Number(l.net), l.exception!.by ?? ""]);
    const meta = { title: `كشف استثناءات مسير ${mon(r.month)}`, filters: [`المسير: ${RUN_STATUS[r.status]}`], note: `النسخة ${r.version} · ${xs.length} حالة` };
    return kind === "xlsx" ? exportXlsx(meta, h, d) : exportPdf(meta, h, d);
  };
  return (
    <section aria-label={`مسير ${mon(r.month)}`} className="space-y-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-start gap-2"><div className="flex-1 space-y-1"><p className="text-base font-bold">مسير {mon(r.month)} · النسخة {r.version}</p><States r={r} /></div>
        <Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["الموظفون", String(r.totals.employees ?? 0)], ["الإجمالي", sar(r.totals.gross)], ["الاستقطاعات", sar(r.totals.deductions)], ["الصافي", sar(r.totals.net)]].map(([a, b]) => <div key={a} className="rounded-lg border p-2"><span className="block text-xs text-muted-foreground">{a}</span><span className="font-bold">{b}</span></div>)}
      </div>
      <div className="flex flex-wrap gap-1 text-xs" aria-label="سياسات شهر المسير">{(Object.keys(TOPIC_L) as Topic[]).map((t) => <span key={t} className={"rounded border px-1.5 " + (r.policies?.[t] ? "" : "border-warning/50 bg-warning/10")} title={policySummary(t, r.policies?.[t] ?? null)}>{TOPIC_L[t]}: {r.policies?.[t] ? (r.policies[t]!.status === "set" ? `الإصدار ${r.policies[t]!.version}` : "لا تنطبق") : "غير مضبوطة — معلّق"}</span>)}</div>
      {Number(r.totals.employer_gosi ?? 0) > 0 && <p className="text-xs text-muted-foreground">حصة صاحب العمل في التأمينات (تكلفة لا تُخصم): {sar(r.totals.employer_gosi)}</p>}
      {r.return_reason && r.status === "draft" && <p className="rounded-lg bg-destructive/10 p-2 text-destructive">أُعيد للتعديل: {r.return_reason}</p>}
      <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {r.submitted_by && <div>أعدّه وأرسله: {r.submitted_by}</div>}
        {r.reviewed_by && <div>راجعته المالية: {r.reviewed_by} (النسخة {r.reviewed_version})</div>}
        {r.approved_by && <div>اعتمدته الإدارة العامة: {r.approved_by} (النسخة {r.approved_version})</div>}
        {r.published_at && <div>نُشرت القسائم: <bdi dir="ltr">{r.published_at.slice(0, 16).replace("T", " ")}</bdi></div>}
        {r.posting_ref && <div>مرجع القيد: <bdi dir="ltr">{r.posting_ref}</bdi></div>}
        {r.payment_ref && <div>مرجع الصرف: <bdi dir="ltr">{r.payment_ref}</bdi></div>}
      </dl>
      <div className="flex flex-wrap gap-2">
        {r.can.prepare && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run("prepare", "أُعيد الاحتساب")}>إعادة الاحتساب</Button>}
        {r.can.submit && <Button size="sm" disabled={act.isPending} onClick={() => run("submit", "أُرسل للمراجعة المالية")}>إرسال للمراجعة المالية</Button>}
        {r.can.review && <Button size="sm" disabled={act.isPending} onClick={() => run("review", "تمت المراجعة المالية")}>تأكيد المراجعة المالية للنسخة {r.version}</Button>}
        {r.can.approve && <Button size="sm" disabled={act.isPending} onClick={() => run("approve", "اعتُمد المسير")}>اعتماد النسخة {r.version} (الإدارة العامة)</Button>}
        {r.can.return && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => void withText("سبب الإرجاع للموارد البشرية", "return", "أُعيد المسير", "_reason")}>إرجاع للتعديل</Button>}
        {r.can.publish && <Button size="sm" disabled={act.isPending} onClick={() => run("publish", "نُشرت القسائم للموظفين")}>نشر القسائم</Button>}
        {r.can.post && (r.link ? <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => void withText("المرجع المحاسبي للقيد", "post", "تأكد القيد", "_ref")}>تأكيد القيد بمرجع</Button>
          : <span className="rounded-lg border px-2 py-1 text-xs text-muted-foreground">القيد: بانتظار إعداد الربط المالي</span>)}
        {r.can.pay && (r.link ? <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => void withText("مرجع الصرف", "pay", "تأكد الصرف", "_ref")}>تأكيد الصرف بمرجع</Button>
          : <span className="rounded-lg border px-2 py-1 text-xs text-muted-foreground">الدفع: بانتظار إعداد الربط المالي</span>)}
        {k.pay.export && <><Button size="sm" variant="ghost" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="ghost" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></>}
      </div>
      <ul className="space-y-1">{inc.map((l) => (
        <li key={l.id} className={"rounded-lg border p-2 " + (l.blockers.length ? "border-destructive/50" : "")}>
          <button type="button" className="flex w-full flex-wrap items-center gap-2 text-start" onClick={() => setOpenLine(openLine === l.id ? null : l.id)} aria-expanded={openLine === l.id}>
            <span className="flex-1 font-medium">{l.employee} <span className="text-xs text-muted-foreground">{l.employee_no}</span></span>
            {l.blockers.length > 0 && <Pill tone="bad">معلّق</Pill>}{l.exception && <Pill tone="wait">استثناء</Pill>}<span>الصافي {sar(l.net, l.currency ?? "SAR")}</span>
          </button>
          {l.blockers.map((b, i) => <p key={i} className="mt-1 text-xs text-destructive">{b.msg}</p>)}
          {openLine === l.id && <div className="mt-2 space-y-1 text-xs">
            {l.items.map((i, n) => <div key={n} className="flex gap-2"><span className="flex-1">{i.label} <span className="text-muted-foreground">({SRC_L[i.source] ?? i.source})</span></span><span className={i.kind === "deduction" ? "text-destructive" : ""}>{i.kind === "deduction" ? "−" : ""}{sar(i.amount)}</span></div>)}
            {l.notes.map((n, i) => <p key={i} className="text-muted-foreground">• {n}</p>)}
          </div>}
          {r.can.prepare && (l.blockers.length > 0 || l.resolution) && <div className="mt-1 flex flex-wrap gap-2">
            {l.blockers.some((b) => b.code === "partial") && r.allow_partial_exception && <Button size="sm" variant="outline" onClick={() => void resolve(l.employee_id, "confirm")}>تسجيل استثناء موثق</Button>}
            <Button size="sm" variant="outline" onClick={() => void resolve(l.employee_id, "exclude")}>استبعاد بسبب</Button>
            {l.resolution && <Button size="sm" variant="ghost" onClick={() => void resolve(l.employee_id, "clear")}>إلغاء المعالجة</Button>}
          </div>}
        </li>))}</ul>
      {xs.length > 0 && <section aria-label="كشف الاستثناءات" className="rounded-lg border border-warning/40 p-2">
        <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-bold">كشف الاستثناءات ({xs.length})</p>
          {k.pay.export && <><Button size="sm" variant="ghost" onClick={() => expX("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="ghost" onClick={() => expX("pdf")}><FileText className="size-4" />PDF</Button></>}</div>
        <p className="text-xs text-muted-foreground">يظهر للمالية والإدارة العامة حتى لا يختفي مستحق أي موظف من المتابعة.</p>
        <ul className="mt-1 space-y-1 text-xs">{xs.map((l) => <li key={l.id} className="flex flex-wrap items-start gap-2 rounded border p-1.5"><span className="flex-1"><b>{l.employee}</b> {l.employee_no} — {XK[l.exception!.kind] ?? l.exception!.kind}<br />السبب: {l.exception!.reason}<br />الأثر: {l.exception!.effect}{l.exception!.by ? ` · ${l.exception!.by}` : ""}</span>
          {r.can.prepare && l.resolution && <Button size="sm" variant="ghost" onClick={() => void resolve(l.employee_id, "clear")}>{l.resolution.mode === "exclude" ? "إعادة إدراج" : "إلغاء الاستثناء"}</Button>}</li>)}</ul></section>}
      {r.notes.length > 0 && <ul className="text-xs text-muted-foreground">{r.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>}
      {r.events.length > 0 && <details><summary className="cursor-pointer text-xs">السجل ({r.events.length})</summary><ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">{r.events.map((e, i) => <li key={i}><bdi dir="ltr">{e.at.slice(0, 16).replace("T", " ")}</bdi> — {EV[e.action] ?? e.action} — {e.by}{e.reason ? ` — ${e.reason}` : ""}</li>)}</ol></details>}
    </section>
  );
}

function useEmps(org: string) { return useQuery({ queryKey: ["hr-money-people", org], queryFn: () => rpc<Emp[]>("hr_money_people", { _org: org }) }); }
function useSetup(org: string) { return useQuery({ queryKey: ["hr-pay-setup", org], queryFn: () => rpc<Setup>("hr_pay_setup", { _org: org }) }); }

function Decisions({ org, k }: { org: string; k: Caps }) {
  const qc = useQueryClient();
  const [st, setSt] = useState("");
  const list = useQuery({ queryKey: ["hr-decs", org, st], queryFn: () => rpc<Dec[]>("hr_decision_list", { _org: org, _f: st ? { status: st } : {} }) });
  const setup = useSetup(org); const emps = useEmps(org);
  const [f, setF] = useState<{ employee_id: string; item_id: string; category: string; amount: string; hours: string; mode: string; from_month: string; to_month: string; reason: string } | null>(null);
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-decs"] }); };
  const save = useMutation({ mutationFn: () => rpc("hr_decision_save", { _org: org, _p: f }), onSuccess: () => { setF(null); done("حُفظ القرار مسودة بانتظار الاعتماد"); }, onError: (e) => toast.error(arabicError(e)) });
  const act = useMutation({ mutationFn: async (a: { d: Dec; action: string }) => { let r: string | null = null; if (a.action === "cancel") { r = await askText("سبب الإلغاء", { required: true }); if (!r) return null; } await rpc("hr_decision_act", { _id: a.d.id, _rev: a.d.rev, _action: a.action, _reason: r }); return a.action; }, onSuccess: (a) => a && done(a === "approve" ? "اعتُمد القرار" : "أُلغي القرار"), onError: (e) => toast.error(arabicError(e)) });
  const items = (setup.data?.items ?? []).filter((i) => i.is_active);
  return (
    <>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <select aria-label="حالة القرار" className={selectCls("w-full sm:w-48")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(DEC_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {k.money.draft && !f && <Button onClick={() => setF({ employee_id: "", item_id: "", category: "general", amount: "", hours: "", mode: "once", from_month: nextMonth(), to_month: "", reason: "" })}><Plus className="size-4" />قرار جديد</Button>}
      </div>
      {f && <form className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
        {items.length === 0 && <p className="text-sm text-warning sm:col-span-3">لا توجد بنود فعالة؛ أضفها من «البنود والإعدادات».</p>}
        <div><Label htmlFor="d-emp">الموظف</Label><select id="d-emp" className={selectCls("w-full")} value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}><option value="">اختر</option>{(emps.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name} — {x.employee_no}</option>)}</select></div>
        <div><Label htmlFor="d-item">البند</Label><select id="d-item" className={selectCls("w-full")} value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}><option value="">اختر</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name} ({KIND_L[i.kind]})</option>)}</select></div>
        <div><Label htmlFor="d-cat">نوع القرار</Label><select id="d-cat" className={selectCls("w-full")} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, ...(["overtime", "settlement"].includes(e.target.value) ? { mode: "once" } : {}) })}>{Object.entries(CAT_L).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {f.category === "overtime" ? <div><Label htmlFor="d-hrs">الساعات المعتمدة</Label><Input id="d-hrs" inputMode="decimal" dir="ltr" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /><p className="text-xs text-muted-foreground">يُحسب المبلغ في المسير من سياسة العمل الإضافي، ويُعلّق إن لم تُضبط.</p></div>
          : <div><Label htmlFor="d-amt">المبلغ</Label><Input id="d-amt" inputMode="decimal" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>}
        {(f.category === "promotion" || f.category === "comp_change") && <p className="text-xs text-muted-foreground sm:col-span-3">تغيير الأجر الأساسي أو المسمى يتم بتعديل العقد (إصدار جديد بتاريخ سريان) وتعيين الموظف؛ هذا القرار للفروقات أو البدلات المؤقتة فقط.</p>}
        <div><Label htmlFor="d-mode">التكرار</Label><select id="d-mode" className={selectCls("w-full")} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="once">مرة واحدة</option>{!["overtime", "settlement"].includes(f.category) && <option value="monthly">شهري</option>}</select></div>
        <div><Label htmlFor="d-from">{f.mode === "once" ? "الشهر" : "من شهر"}</Label><Input id="d-from" type="month" dir="ltr" value={f.from_month} onChange={(e) => setF({ ...f, from_month: e.target.value })} /></div>
        {f.mode === "monthly" && <div><Label htmlFor="d-to">إلى شهر (اختياري)</Label><Input id="d-to" type="month" dir="ltr" value={f.to_month} onChange={(e) => setF({ ...f, to_month: e.target.value })} /></div>}
        <div className="sm:col-span-3"><Label htmlFor="d-r">سبب القرار</Label><Input id="d-r" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
        <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={save.isPending}>حفظ مسودة</Button><Button type="button" variant="ghost" onClick={() => setF(null)}>إلغاء</Button></div>
      </form>}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : (list.data ?? []).length === 0 ? <EmptyState title="لا توجد قرارات" hint="القرار يُعدّه مختص ويعتمده آخر، ثم يدخل المسير في شهره." /> : (
        <ul className="grid gap-2 md:grid-cols-2">{list.data!.map((d) => <li key={d.id} className="space-y-1 rounded-xl border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-bold">{d.employee} — {d.item}</p><Pill tone={d.status === "approved" ? "ok" : d.status === "draft" ? "wait" : "muted"}>{DEC_STATUS[d.status]}</Pill></div>
          <p className={d.kind === "deduction" ? "text-destructive" : ""}>{CAT_L[d.category] && d.category !== "general" ? `${CAT_L[d.category]} · ` : ""}{KIND_L[d.kind]} {d.category === "overtime" ? `${d.hours} ساعة (يُحسب بالسياسة)` : sar(d.amount)} · {d.mode === "once" ? `مرة واحدة ${mon(d.from_month)}` : `شهري من ${mon(d.from_month)}${d.to_month ? ` إلى ${mon(d.to_month)}` : ""}`}</p>
          <p className="text-xs text-muted-foreground">{d.reason} · أعدّه {d.created_by}{d.approved_by ? ` · اعتمده ${d.approved_by}` : ""}</p>
          {d.cancel_reason && <p className="text-xs text-muted-foreground">إيقاف/إلغاء: {d.cancel_reason}</p>}
          <div className="flex gap-2">{d.can.approve && <Button size="sm" onClick={() => act.mutate({ d, action: "approve" })}>اعتماد</Button>}{d.can.cancel && <Button size="sm" variant="ghost" onClick={() => act.mutate({ d, action: "cancel" })}>إلغاء</Button>}</div>
        </li>)}</ul>)}
    </>
  );
}

function Advances({ org, k }: { org: string; k: Caps }) {
  const qc = useQueryClient();
  const [st, setSt] = useState("");
  const list = useQuery({ queryKey: ["hr-advs", org, st], queryFn: () => rpc<Advance[]>("hr_advance_list", { _org: org, _f: st ? { status: st } : {} }) });
  const emps = useEmps(org);
  const [f, setF] = useState<{ employee_id: string; amount: string; installments: string; start_month: string; reason: string } | null>(null);
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-advs"] }); };
  const save = useMutation({ mutationFn: () => rpc("hr_advance_save", { _org: org, _p: f }), onSuccess: () => { setF(null); done("سُجل طلب السلفة بانتظار الاعتماد"); }, onError: (e) => toast.error(arabicError(e)) });
  const act = useMutation({
    mutationFn: async (a: { v: Advance; action: string }) => {
      let r: string | null = null, ref: string | null = null;
      if (a.action === "reject" || a.action === "cancel") { r = await askText(a.action === "reject" ? "سبب الرفض" : "سبب الإلغاء", { required: true }); if (!r) return null; }
      if (a.action === "pay") { ref = await askText("مرجع الصرف", { required: true }); if (!ref) return null; }
      await rpc("hr_advance_act", { _id: a.v.id, _rev: a.v.rev, _action: a.action, _reason: r, _ref: ref }); return a.action;
    },
    onSuccess: (a) => a && done({ approve: "اعتُمدت السلفة", reject: "رُفضت", cancel: "أُلغيت", pay: "تأكد الصرف" }[a] ?? "تم"), onError: (e) => toast.error(arabicError(e)),
  });
  const rows = list.data ?? [];
  const exp = (kind: "xlsx" | "pdf") => {
    const h = ["الموظف", "الرقم الوظيفي", "المبلغ", "الأقساط", "القسط", "بداية الاستقطاع", "الحالة", "الصرف", "المسدد", "المتبقي"];
    const d = rows.map((a) => [a.employee ?? "", a.employee_no ?? "", Number(a.amount), a.installments, Number(a.installment_amount), mon(a.start_month), ADV_STATUS[a.status]!, PAY_STATUS[a.payment_status]!, Number(a.repaid), Number(a.outstanding)]);
    const meta = { title: "سجل السلف", filters: st ? [ADV_STATUS[st]!] : [] };
    return kind === "xlsx" ? exportXlsx(meta, h, d) : exportPdf(meta, h, d);
  };
  return (
    <>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <select aria-label="حالة السلفة" className={selectCls("w-full sm:w-48")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(ADV_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {k.money.draft && !f && <Button onClick={() => setF({ employee_id: "", amount: "", installments: "1", start_month: nextMonth(), reason: "" })}><Plus className="size-4" />سلفة لموظف</Button>}
        {k.money.export && rows.length > 0 && <div className="ms-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></div>}
      </div>
      {f && <form className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
        <div><Label htmlFor="a-emp">الموظف</Label><select id="a-emp" className={selectCls("w-full")} value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}><option value="">اختر</option>{(emps.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name} — {x.employee_no}</option>)}</select></div>
        <div><Label htmlFor="a-amt">المبلغ</Label><Input id="a-amt" inputMode="decimal" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><Label htmlFor="a-n">عدد الأقساط</Label><Input id="a-n" type="number" min={1} dir="ltr" value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /></div>
        <div><Label htmlFor="a-m">بداية الاستقطاع</Label><Input id="a-m" type="month" dir="ltr" value={f.start_month} onChange={(e) => setF({ ...f, start_month: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="a-r">السبب</Label><Input id="a-r" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
        <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={save.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setF(null)}>إلغاء</Button></div>
      </form>}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد سلف" hint="طلبات الموظفين والسلف المسجلة ضمن نطاقك." /> : (
        <ul className="grid gap-2 md:grid-cols-2">{rows.map((a) => <li key={a.id}><AdvanceCard a={a} onAct={(action) => act.mutate({ v: a, action })} /></li>)}</ul>)}
    </>
  );
}

function Settings({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useSetup(org);
  const [name, setName] = useState(""); const [kind, setKind] = useState("earning");
  const [s, setS] = useState<{ unpaid: string[]; divisor: string; link: string } | null>(null);
  const item = useMutation({ mutationFn: (a: { id: string | null; name: string; kind: string; active: boolean }) => rpc("hr_pay_item_save", { _org: org, _id: a.id, _name: a.name, _kind: a.kind, _active: a.active }), onSuccess: () => { setName(""); toast.success("حُفظ البند"); qc.invalidateQueries({ queryKey: ["hr-pay-setup"] }); }, onError: (e) => toast.error(arabicError(e)) });
  const save = useMutation({ mutationFn: () => rpc("hr_pay_settings_save", { _org: org, _p: { unpaid_leave_types: s!.unpaid, day_divisor: s!.divisor || null, finance_link: s!.link } }), onSuccess: () => { toast.success("حُفظت الإعدادات"); setS(null); qc.invalidateQueries({ queryKey: ["hr-pay-setup"] }); qc.invalidateQueries({ queryKey: ["hr-money-caps"] }); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const cur = s ?? { unpaid: d.unpaid_leave_types, divisor: d.day_divisor ? String(d.day_divisor) : "", link: d.finance_link ?? "" };
  return (
    <div className="space-y-6">
      <Section title="بنود الاستحقاق والاستقطاع" desc="تُستخدم في القرارات. لا يتغير نوع بند استُخدم.">
        {d.can_items && <div className="mb-2 flex flex-wrap gap-2"><Input aria-label="اسم البند" placeholder="اسم البند" className="w-full sm:w-56" value={name} onChange={(e) => setName(e.target.value)} />
          <select aria-label="نوع البند" className={selectCls("w-full sm:w-36")} value={kind} onChange={(e) => setKind(e.target.value)}><option value="earning">استحقاق</option><option value="deduction">استقطاع</option></select>
          <Button disabled={name.trim().length < 2 || item.isPending} onClick={() => item.mutate({ id: null, name: name.trim(), kind, active: true })}>إضافة</Button></div>}
        {d.items.length === 0 ? <EmptyState title="لا توجد بنود" hint="" /> : <ul className="grid gap-1 sm:grid-cols-2">{d.items.map((i) => <li key={i.id} className="flex items-center gap-2 rounded-lg border bg-card p-2 text-sm"><span className="flex-1">{i.name}</span><Pill tone={i.kind === "earning" ? "ok" : "bad"}>{KIND_L[i.kind]}</Pill>{!i.is_active && <Pill tone="muted">موقوف</Pill>}
          {d.can_items && <Button size="sm" variant="ghost" onClick={() => item.mutate({ id: i.id, name: i.name, kind: i.kind, active: !i.is_active })}>{i.is_active ? "إيقاف" : "تفعيل"}</Button>}</li>)}</ul>}
      </Section>
      <PayPolicies org={org} />
      <Section title="الربط المالي" desc="يحدده المالك فقط. أنواع الإجازة غير المدفوعة هنا إعداد سابق يُستخدم فقط إن لم تُضبط سياسة الإجازة غير المدفوعة أعلاه.">
        <div className="space-y-3 rounded-xl border bg-card p-3 text-sm">
          <fieldset><legend className="font-medium">أنواع الإجازات غير المدفوعة</legend>
            {d.leave_types.length === 0 ? <p className="text-muted-foreground">لا توجد أنواع إجازات.</p> : <div className="flex flex-wrap gap-3">{d.leave_types.map((t) => <label key={t.id} className="flex items-center gap-1"><input type="checkbox" disabled={!d.can_settings} checked={cur.unpaid.includes(t.id)} onChange={(e) => setS({ ...cur, unpaid: e.target.checked ? [...cur.unpaid, t.id] : cur.unpaid.filter((x) => x !== t.id) })} />{t.name}</label>)}</div>}
          </fieldset>
          <div><Label htmlFor="p-div">أساس احتساب اليوم (الأجر الأساسي ÷ عدد الأيام)</Label><Input id="p-div" type="number" min={1} max={31} dir="ltr" className="w-32" disabled={!d.can_settings} value={cur.divisor} onChange={(e) => setS({ ...cur, divisor: e.target.value })} />
            <p className="text-xs text-muted-foreground">إن لم يُحدد، يمنع وجود إجازة غير مدفوعة إرسال المسير حتى يُحدد.</p></div>
          <div><Label htmlFor="p-link">الربط المالي المعتمد</Label><Input id="p-link" disabled={!d.can_settings} placeholder="مثال: النظام المحاسبي المعتمد — اسم الجهة المختصة" value={cur.link} onChange={(e) => setS({ ...cur, link: e.target.value })} />
            <p className="text-xs text-muted-foreground">{d.finance_link ? `مسجل بواسطة ${d.link_by}` : "غير مسجل: القيد والدفع «بانتظار إعداد الربط المالي». سجّله فقط بعد اعتماد الربط من الجهة المختصة."}</p></div>
          {d.can_settings ? <Button disabled={!s || save.isPending} onClick={() => save.mutate()}>حفظ</Button> : <p className="text-xs text-muted-foreground">للاطلاع فقط — يعدّلها المالك.</p>}
        </div>
      </Section>
    </div>
  );
}
