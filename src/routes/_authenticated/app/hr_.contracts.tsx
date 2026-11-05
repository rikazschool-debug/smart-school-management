import type React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileSignature, FileText, Plus, ScrollText, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { rpc, type HrEmp } from "@/components/hr/shared";
import { VersionCard } from "@/components/hr/version-card";
import { COMP_KIND, C_STATUS, EVENT, KIND, PERIOD, V_STATUS, money, type CCaps, type CDetail, type CRow, type CompLine, type CVersion } from "@/components/hr/contracts-shared";

type Search = { c?: string; new?: string; edit?: string; renew?: string; tpl?: string };
export const Route = createFileRoute("/_authenticated/app/hr_/contracts")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    for (const k of ["c", "edit", "renew"] as const) if (typeof s[k] === "string") o[k] = s[k] as string;
    if (s["new"]) o.new = "1";
    if (s["tpl"]) o.tpl = "1";
    return o;
  },
  head: () => ({ meta: [{ title: "العقود — الموارد البشرية — ركاز" }, { name: "description", content: "عقود الموظفين وإصداراتها وبنود التعويض وإقرار الموظف." }, { property: "og:title", content: "العقود — ركاز" }, { property: "og:description", content: "عقود الموظفين وإصداراتها وإقرارها." }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["hr-c-caps", org], enabled: !!org, queryFn: () => rpc<CCaps>("hr_contract_caps", { _org: org }) });
  if (!active) return null;
  return (
    <>
      <Link to="/app/hr" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />ملفات الموظفين</Link>
      <PageHeader title="العقود" desc="كل عقد مرتبط بملف الموظف. الإصدار المعتمد لا يتغير؛ أي تعديل أو تجديد ينشئ إصدارًا جديدًا يقرّه الموظف. المبالغ تظهر لمن يملك صلاحية التعويض فقط." />
      {caps.isLoading ? <LoadingState /> : caps.error ? <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} />
        : !caps.data!.enabled ? <SectionLocked /> : !caps.data!.caps.view ? <ForbiddenState /> : <Workspace org={org!} k={caps.data!} />}
    </>
  );
}

function Workspace({ org, k }: { org: string; k: CCaps }) {
  const s = Route.useSearch();
  const nav = useNavigate({ from: "/app/hr/contracts" });
  const [f, setF] = useState({ q: "", school: "", status: "", kind: "", expiring: "" });
  const list = useQuery({ queryKey: ["hr-c-list", org, f], queryFn: () => rpc<CRow[]>("hr_contract_list", { _org: org, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }) });
  const rows = list.data ?? [];
  const showPay = rows.some((r) => r.basic);
  const exp = (kind: "xlsx" | "pdf") => {
    const headers = ["رقم العقد", "الموظف", "الرقم الوظيفي", "المدرسة", "النوع", "الحالة", "البداية", "النهاية", ...(showPay ? ["الأساسي"] : [])];
    const data = rows.map((r) => [r.contract_no, r.employee, r.employee_no, r.school, KIND[r.kind] ?? r.kind, C_STATUS[r.status] ?? r.status, r.start_date, r.end_date ?? "غير محددة", ...(showPay ? [r.basic ? money(r.basic) : "غير مصرح"] : [])]);
    const meta = { title: "العقود", filters: [f.school ? k.schools.find((x) => x.id === f.school)?.name ?? "" : "كل المدارس المصرح بها", f.status ? C_STATUS[f.status]! : "", f.expiring ? `تنتهي خلال ${f.expiring} يومًا` : "", f.q ? `بحث: ${f.q}` : ""].filter(Boolean) };
    return kind === "xlsx" ? exportXlsx(meta, headers, data) : exportPdf(meta, headers, data);
  };
  const set = (key: keyof typeof f, v: string) => setF((x) => ({ ...x, [key]: v }));
  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-center">
        <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم الوظيفي أو رقم العقد" className="w-full sm:w-64" value={f.q} onChange={(e) => set("q", e.target.value)} />
        <select aria-label="المدرسة" className={selectCls("w-full sm:w-40")} value={f.school} onChange={(e) => set("school", e.target.value)}><option value="">كل المدارس</option>{k.schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select aria-label="الحالة" className={selectCls("w-full sm:w-44")} value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">كل الحالات</option>{Object.entries(C_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
        <select aria-label="النوع" className={selectCls("w-full sm:w-36")} value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="">كل الأنواع</option>{Object.entries(KIND).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
        <select aria-label="قرب الانتهاء" className={selectCls("w-full sm:w-44")} value={f.expiring} onChange={(e) => set("expiring", e.target.value)}><option value="">كل التواريخ</option><option value="30">تنتهي خلال 30 يومًا</option><option value="60">تنتهي خلال 60 يومًا</option><option value="90">تنتهي خلال 90 يومًا</option></select>
        <span className="hidden flex-1 sm:block" />
        <div className="flex flex-wrap gap-2">
          {k.caps.export && rows.length > 0 && <><Button variant="outline" size="sm" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></>}
          {(k.templates_admin || k.caps.draft) && <Button variant="outline" size="sm" onClick={() => nav({ search: { tpl: "1" } })}><ScrollText className="size-4" />القوالب</Button>}
          {k.caps.draft && <Button size="sm" onClick={() => nav({ search: { new: "1" } })}><Plus className="size-4" />عقد جديد</Button>}
        </div>
      </div>
      <ContractsReport org={org} k={k} onPick={(patch) => setF((x) => ({ ...x, ...patch }))} />
      {s.tpl && <Templates org={org} admin={k.templates_admin} onClose={() => nav({ search: {} })} />}
      {(s.new || s.renew) && k.caps.draft && <ContractForm org={org} k={k} renewOf={s.renew ?? null} onClose={() => nav({ search: {} })} onDone={(id) => nav({ search: { c: id } })} />}
      {s.edit && <EditLoader org={org} k={k} id={s.edit} onClose={() => nav({ search: { c: s.edit! } })} />}
      {s.c && !s.edit && <Detail id={s.c} org={org} onClose={() => nav({ search: {} })} />}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !rows.length ? (
        <EmptyState title="لا توجد عقود مطابقة" hint={k.caps.draft ? "أنشئ عقدًا من «عقد جديد» واختر الموظف من ملفات الموظفين." : "لا توجد عقود في نطاقك."} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground"><tr>{["رقم العقد", "الموظف", "المدرسة", "النوع", "الحالة", "الفترة", ...(showPay ? ["الأساسي"] : [])].map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={"cursor-pointer border-t hover:bg-secondary/30 " + (s.c === r.id ? "bg-secondary/40" : "")} onClick={() => nav({ search: { c: r.id } })}>
                    <td className="p-2"><button type="button" className="font-semibold text-primary focus-visible:underline focus-visible:outline-none" onClick={() => nav({ search: { c: r.id } })}><bdi dir="ltr">{r.contract_no}</bdi></button></td>
                    <td className="p-2">{r.employee} <span className="text-xs text-muted-foreground"><bdi dir="ltr">{r.employee_no}</bdi></span></td>
                    <td className="p-2">{r.school}</td><td className="p-2">{KIND[r.kind] ?? r.kind}</td>
                    <td className="p-2"><StatusChips r={r} /></td>
                    <td className="p-2 text-xs"><bdi dir="ltr">{r.start_date}</bdi> ← {r.end_date ? <bdi dir="ltr">{r.end_date}</bdi> : "غير محددة"}</td>
                    {showPay && <td className="p-2">{r.basic ? <>{money(r.basic)} <span className="text-xs text-muted-foreground">{PERIOD[r.basic.period]}</span></> : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}><button type="button" onClick={() => nav({ search: { c: r.id } })} className="w-full rounded-xl border bg-card p-3 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-start justify-between gap-2"><span className="font-semibold">{r.employee}</span><bdi dir="ltr" className="text-xs text-muted-foreground">{r.contract_no}</bdi></span>
                <span className="block text-xs text-muted-foreground">{r.school} · {KIND[r.kind] ?? r.kind}</span>
                <span className="block text-xs text-muted-foreground"><bdi dir="ltr">{r.start_date}</bdi> ← {r.end_date ? <bdi dir="ltr">{r.end_date}</bdi> : "غير محددة"}{r.basic ? ` · ${money(r.basic)}` : ""}</span>
                <span className="mt-1 block"><StatusChips r={r} /></span>
              </button></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ContractsReport({ org, k, onPick }: { org: string; k: CCaps; onPick: (p: { status?: string; expiring?: string; school?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const all = useQuery({ queryKey: ["hr-c-list", org, "report"], queryFn: () => rpc<CRow[]>("hr_contract_list", { _org: org, _f: {} }) });
  const rows = all.data ?? [];
  const live = (r: CRow) => r.status === "active" && !r.expired;
  const kpi = [
    { label: "سارية", n: rows.filter(live).length, pick: { status: "active", expiring: "" } },
    { label: "تنتهي خلال 30 يومًا", n: rows.filter((r) => live(r) && r.days_left !== null && r.days_left <= 30).length, pick: { status: "", expiring: "30" }, warn: true },
    { label: "تنتهي خلال 60 يومًا", n: rows.filter((r) => live(r) && r.days_left !== null && r.days_left <= 60).length, pick: { status: "", expiring: "60" } },
    { label: "انتهت مدتها ولم تُجدَّد أو تُنهَ", n: rows.filter((r) => r.expired).length, pick: { status: "active", expiring: "" }, warn: true },
    { label: "بانتظار إقرار الموظف", n: rows.filter((r) => r.status === "pending" || (r.in_force !== null && r.pending_version)).length, pick: { status: "pending", expiring: "" } },
    { label: "مسودات", n: rows.filter((r) => r.status === "draft" || r.draft_version).length, pick: { status: "draft", expiring: "" } },
  ];
  const bySchool = Object.values(rows.reduce<Record<string, { id: string; name: string; active: number; soon: number; expired: number; pending: number; ended: number }>>((m, r) => {
    const x = (m[r.school_id] ??= { id: r.school_id, name: r.school, active: 0, soon: 0, expired: 0, pending: 0, ended: 0 });
    if (live(r)) x.active++;
    if (live(r) && r.days_left !== null && r.days_left <= 60) x.soon++;
    if (r.expired) x.expired++;
    if (r.status === "pending" || r.status === "draft") x.pending++;
    if (r.status === "terminated" || r.status === "cancelled") x.ended++;
    return m;
  }, {})).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const headers = ["المدرسة", "سارية", "تنتهي خلال 60 يومًا", "انتهت مدتها", "مسودة/بانتظار الإقرار", "منتهية/ملغاة"];
  const data = bySchool.map((x) => [x.name, x.active, x.soon, x.expired, x.pending, x.ended]);
  const meta = { title: "تقرير العقود", filters: ["كل المدارس المصرح بها"] };
  if (all.isLoading || all.error || !rows.length) return null;
  return (
    <Section title="ملخص العقود" desc="محسوب من العقود التي تملك صلاحية عرضها. اضغط على رقم لعرض العقود المقصودة. يصل تنبيه لمعدّي العقود ومعتمديها والمالك قبل الانتهاء بشهرين، ثم بشهر، ثم بأسبوع، ثم عند الانتهاء.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpi.map((x) => (
          <button key={x.label} type="button" onClick={() => onPick(x.pick)} className={"rounded-xl border bg-card p-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (x.warn && x.n ? "border-warning/50" : "")}>
            <span className={"block text-2xl font-bold " + (x.warn && x.n ? "text-warning" : "")}>{x.n}</span>
            <span className="block text-xs text-muted-foreground">{x.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>{open ? "إخفاء التوزيع حسب المدرسة" : "التوزيع حسب المدرسة"}</Button>
        {open && k.caps.export && <><Button variant="outline" size="sm" onClick={() => exportXlsx(meta, headers, data)}><Download className="size-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => exportPdf(meta, headers, data)}><FileText className="size-4" />PDF</Button></>}
      </div>
      {open && (
        <div className="mt-2 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground"><tr>{headers.map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{bySchool.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-2"><button type="button" className="text-primary" onClick={() => onPick({ school: x.id, status: "", expiring: "" })}>{x.name}</button></td>
                <td className="p-2">{x.active}</td><td className={"p-2 " + (x.soon ? "text-warning" : "")}>{x.soon}</td><td className={"p-2 " + (x.expired ? "text-warning" : "")}>{x.expired}</td><td className="p-2">{x.pending}</td><td className="p-2">{x.ended}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function StatusChips({ r }: { r: CRow }) {
  return (
    <span className="flex flex-wrap gap-1 text-xs">
      <span className={"rounded px-1.5 " + (r.status === "active" && !r.expired ? "bg-success/10 text-success" : r.status === "pending" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>{r.expired ? "منتهي المدة" : C_STATUS[r.status] ?? r.status}</span>
      {r.status === "active" && !r.expired && r.days_left !== null && r.days_left <= 60 && <span className="rounded bg-warning/10 px-1.5 text-warning">ينتهي بعد {r.days_left} يومًا</span>}
      {r.in_force !== null && r.pending_version && <span className="rounded bg-secondary px-1.5">تعديل بانتظار الإقرار</span>}
      {r.draft_version && r.in_force !== null && <span className="rounded bg-secondary px-1.5">مسودة تعديل</span>}
    </span>
  );
}

function Detail({ id, org, onClose }: { id: string; org: string; onClose: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate({ from: "/app/hr/contracts" });
  const d = useQuery({ queryKey: ["hr-c", id], queryFn: () => rpc<CDetail>("hr_contract_get", { _id: id }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["hr-c", id] }); qc.invalidateQueries({ queryKey: ["hr-c-list"] }); };
  const act = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: () => { toast.success("تم"); refresh(); }, onError: (e) => { toast.error(arabicError(e)); refresh(); } });
  if (d.isLoading) return <LoadingState rows={2} />;
  if (d.error) return <ErrorState message={arabicError(d.error)} onRetry={() => d.refetch()} />;
  const c = d.data!.contract, can = d.data!.can!, vs = d.data!.versions;
  const draft = vs.find((v) => v.status === "draft"), issued = vs.find((v) => v.status === "issued");
  const issue = async (v: CVersion) => {
    const pay = v.comp_hidden ? "" : `\nالتعويض: ${(v.data.comp ?? []).map((l) => `${l.label} ${money(l)} ${PERIOD[l.period]}`).join("، ") || "بلا بنود"}`;
    const msg = `اعتماد وإصدار الإصدار ${v.version} من العقد ${c.contract_no} للموظف ${c.employee}؟\nالنوع: ${KIND[v.data.kind]} · من ${v.data.start_date} إلى ${v.data.end_date ?? "غير محددة"}${v.version > 1 ? ` · يسري التعديل من ${v.effective_from}` : ""}${pay}\nبعد الإصدار لا يُعدَّل هذا الإصدار، ويُرسل للموظف لإقراره.`;
    if (!(await ask(msg, { ok: "اعتماد وإصدار" }))) return;
    act.mutate(() => rpc("hr_contract_issue", { _id: id, _version: v.version, _reason: null }));
  };
  const withdraw = async (v: CVersion) => { const r = await askText(`سبب سحب الإصدار ${v.version}`, { required: true, ok: "سحب" }); if (r) act.mutate(() => rpc("hr_contract_withdraw", { _id: id, _version: v.version, _reason: r })); };
  const paper = async (v: CVersion, decision: "accept" | "reject") => { const r = await askText(decision === "accept" ? "مرجع الإقرار الورقي بالقبول (رقم النسخة الموقعة ومكان حفظها)" : "سبب الرفض ومرجعه", { required: true, ok: "تسجيل" }); if (r) act.mutate(() => rpc("hr_contract_ack", { _id: id, _version: v.version, _decision: decision, _reason: r, _paper: true })); };
  const end = async (action: "cancel" | "terminate") => {
    let date: string | null = null;
    if (action === "terminate") { date = await askText("تاريخ الإنهاء (YYYY-MM-DD)", { required: true, ok: "متابعة" }); if (!date) return; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error("صيغة التاريخ غير صحيحة"); return; } }
    const r = await askText(action === "cancel" ? "سبب إلغاء العقد (لا يُحذف، يبقى في السجل)" : "سبب إنهاء العقد", { required: true, ok: action === "cancel" ? "إلغاء العقد" : "إنهاء العقد" });
    if (r) act.mutate(() => rpc("hr_contract_end", { _id: id, _action: action, _date: date, _reason: r }));
  };
  const busy = act.isPending;
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="تفاصيل العقد">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">العقد <bdi dir="ltr">{c.contract_no}</bdi> — {c.employee}</p>
          <p className="text-sm text-muted-foreground"><bdi dir="ltr">{c.employee_no}</bdi> · {c.school} · {C_STATUS[c.status]}{c.in_force ? ` · الإصدار الساري ${c.in_force}` : ""}{c.parent_no ? ` · تجديد للعقد ${c.parent_no}` : ""}{!c.has_login ? " · الموظف بلا حساب دخول" : ""}</p>
          {c.ended_on && <p className="text-sm text-muted-foreground">{c.status === "cancelled" ? "أُلغي" : "أُنهي"} في <bdi dir="ltr">{c.ended_on}</bdi> — {c.end_reason}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق"><X className="size-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {can.draft && !["terminated", "cancelled"].includes(c.status) && !issued && <Button size="sm" variant="outline" disabled={busy} onClick={() => nav({ search: { edit: id } })}>{draft ? "تعديل المسودة" : c.in_force ? "تعديل العقد (إصدار جديد)" : "مسودة جديدة"}</Button>}
        {can.approve && draft && <Button size="sm" disabled={busy} onClick={() => issue(draft)}><FileSignature className="size-4" />مراجعة واعتماد الإصدار {draft.version}</Button>}
        {can.approve && draft && <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(draft)}>تجاهل المسودة</Button>}
        {can.approve && issued && <Button size="sm" variant="outline" disabled={busy} onClick={() => withdraw(issued)}>سحب الإصدار {issued.version}</Button>}
        {can.approve && issued && !c.has_login && <><Button size="sm" disabled={busy} onClick={() => paper(issued, "accept")}>تسجيل قبول ورقي</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => paper(issued, "reject")}>تسجيل رفض ورقي</Button></>}
        {can.draft && c.status === "active" && <Button size="sm" variant="outline" disabled={busy} onClick={() => nav({ search: { renew: id } })}>تجديد</Button>}
        {can.approve && c.in_force === null && !["cancelled"].includes(c.status) && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => end("cancel")}>إلغاء العقد</Button>}
        {can.approve && c.status === "active" && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => end("terminate")}>إنهاء العقد</Button>}
      </div>
      {issued && c.has_login && <p className="rounded-lg bg-warning/10 p-2 text-sm">الإصدار {issued.version} بانتظار قبول الموظف أو رفضه من «ملفي الوظيفي».</p>}
      <Section title="الإصدارات" desc={can.comp_view ? "كل إصدار محفوظ كما اعتُمد، مع بنود التعويض وتاريخ السريان." : "المبالغ مخفية لأن عرض التعويض صلاحية مستقلة."}>
        <ul className="space-y-2">{vs.map((v) => <VersionCard key={v.id} v={v} current={v.version === c.in_force} />)}</ul>
      </Section>
      {(d.data!.renewals?.length ?? 0) > 0 && <p className="text-sm">تجديدات: {d.data!.renewals!.map((r) => <button key={r.id} type="button" className="me-2 text-primary underline" onClick={() => nav({ search: { c: r.id } })}><bdi dir="ltr">{r.contract_no}</bdi> ({C_STATUS[r.status]})</button>)}</p>}
      <Section title="سجل الإجراءات">
        <ul className="space-y-1 text-sm">{(d.data!.events ?? []).map((e, i) => <li key={i} className="flex flex-wrap gap-x-2 border-b py-1 last:border-0"><span className="font-medium">{EVENT[e.action] ?? e.action}</span><span className="text-muted-foreground">{e.by} · <bdi dir="ltr">{new Date(e.at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}</bdi></span>{e.reason && <span className="w-full text-xs text-muted-foreground">السبب: {e.reason}</span>}</li>)}</ul>
      </Section>
    </section>
  );
}

type Tpl = { id: string; name: string; body: string; version: number; is_active: boolean };
type Form = { employee_id: string; school_id: string; kind: string; job_title: string; start_date: string; end_date: string; probation_days: string; probation_terms: string; terms: string; notes: string; template_id: string; effective_from: string; comp: CompLine[]; reason: string; updated_at?: string; parent_id?: string };
const BLANK: Form = { employee_id: "", school_id: "", kind: "fixed", job_title: "", start_date: "", end_date: "", probation_days: "", probation_terms: "", terms: "", notes: "", template_id: "", effective_from: "", comp: [], reason: "" };

function EditLoader({ org, k, id, onClose }: { org: string; k: CCaps; id: string; onClose: () => void }) {
  const d = useQuery({ queryKey: ["hr-c", id], queryFn: () => rpc<CDetail>("hr_contract_get", { _id: id }) });
  if (d.isLoading) return <LoadingState rows={2} />;
  if (d.error) return <ErrorState message={arabicError(d.error)} />;
  const c = d.data!.contract, vs = d.data!.versions;
  const base = vs.find((v) => v.status === "draft") ?? vs.find((v) => v.version === c.in_force) ?? vs[0]!;
  const x = base.data;
  const init: Form = { ...BLANK, employee_id: c.employee_id!, school_id: c.school_id!, kind: x.kind, job_title: x.job_title ?? "", start_date: x.start_date, end_date: x.end_date ?? "", probation_days: x.probation_days?.toString() ?? "", probation_terms: x.probation_terms ?? "", terms: x.terms ?? "", notes: x.notes ?? "", template_id: x.template_id ?? "", comp: x.comp ?? [], effective_from: base.status === "draft" ? base.effective_from : "", ...(base.status === "draft" ? { updated_at: base.updated_at } : {}) };
  return <ContractForm org={org} k={k} renewOf={null} editId={id} amend={c.in_force !== null} compHidden={base.comp_hidden} init={init} employeeLabel={`${c.employee} — ${c.school}`} onClose={onClose} onDone={onClose} />;
}

function ContractForm({ org, k, renewOf, editId, amend, compHidden, init, employeeLabel, onClose, onDone }: { org: string; k: CCaps; renewOf: string | null; editId?: string; amend?: boolean; compHidden?: boolean; init?: Form; employeeLabel?: string; onClose: () => void; onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const renew = useQuery({ enabled: !!renewOf, queryKey: ["hr-c", renewOf], queryFn: () => rpc<CDetail>("hr_contract_get", { _id: renewOf }) });
  const emps = useQuery({ enabled: !editId, queryKey: ["hr-list-all", org], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: null, _q: null, _status: "active" }) });
  const tpls = useQuery({ queryKey: ["hr-tpl", org], queryFn: () => rpc<Tpl[]>("hr_template_list", { _org: org }) });
  const [f, setF] = useState<Form>(init ?? BLANK);
  const [seeded, setSeeded] = useState(false);
  if (renewOf && renew.data && !seeded) {
    const c = renew.data.contract, cur = renew.data.versions.find((v) => v.version === c.in_force) ?? renew.data.versions[0]!;
    const next = c.end_date ? new Date(new Date(c.end_date).getTime() + 86400000).toISOString().slice(0, 10) : "";
    setF({ ...BLANK, employee_id: c.employee_id!, school_id: c.school_id!, kind: cur.data.kind, job_title: cur.data.job_title ?? "", start_date: next, terms: cur.data.terms ?? "", template_id: cur.data.template_id ?? "", comp: cur.data.comp ?? [], parent_id: c.id });
    setSeeded(true);
  }
  const set = <K extends keyof Form>(key: K, v: Form[K]) => setF((x) => ({ ...x, [key]: v }));
  const emp = emps.data?.find((e) => e.id === f.employee_id);
  const empSchools = (emp?.assignments ?? []).filter((a) => k.schools.some((s) => s.id === a.school_id && s.draft));
  const compEdit = k.caps.comp_edit && !compHidden;
  const save = useMutation({
    mutationFn: () => {
      const p: Record<string, unknown> = { ...f, comp: f.comp };
      delete p["reason"];
      if (!compEdit) delete p["comp"];
      for (const key of Object.keys(p)) if (p[key] === "") delete p[key];
      return rpc<string>("hr_contract_save", { _org: org, _id: editId ?? null, _p: p, _reason: f.reason || null });
    },
    onSuccess: (id) => { toast.success(editId ? "حُفظت المسودة" : "أُنشئت مسودة العقد"); qc.invalidateQueries({ queryKey: ["hr-c-list"] }); qc.invalidateQueries({ queryKey: ["hr-c", id] }); onDone(id); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const line = (i: number, patch: Partial<CompLine>) => set("comp", f.comp.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const fixed = f.kind === "fixed" || f.kind === "temporary";
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="نموذج العقد">
      <div className="mb-3 flex items-center gap-2"><p className="flex-1 font-bold">{editId ? (amend ? "تعديل عقد ساري — إصدار جديد" : "تعديل مسودة العقد") : renewOf ? "تجديد العقد" : "عقد جديد"}</p><Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق"><X className="size-4" /></Button></div>
      {amend && <p className="mb-3 rounded-lg bg-secondary/50 p-2 text-sm">الإصدار الساري يبقى كما هو حتى يُعتمد هذا التعديل ويقرّه الموظف. حدّد تاريخ سريان التعديل وسببه.</p>}
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
        {editId || renewOf ? <div className="md:col-span-2 text-sm"><span className="text-muted-foreground">الموظف: </span>{employeeLabel ?? renew.data?.contract.employee}</div> : (
          <>
            <div><Label htmlFor="c-emp">الموظف</Label>
              {emps.error ? <p className="text-sm text-destructive">{arabicError(emps.error)} — اختيار الموظف يحتاج صلاحية عرض ملفات الموظفين.</p> : (
                <select id="c-emp" required className={selectCls("w-full")} value={f.employee_id} onChange={(e) => { const em = emps.data?.find((x) => x.id === e.target.value); const a = (em?.assignments ?? []).find((x) => k.schools.some((s) => s.id === x.school_id && s.draft)); setF((x) => ({ ...x, employee_id: e.target.value, school_id: a?.school_id ?? "", job_title: x.job_title || a?.job_title || em?.job_title || "" })); }}>
                  <option value="">اختر…</option>{(emps.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.full_name} — {e.employee_no}</option>)}
                </select>)}
            </div>
            <div><Label htmlFor="c-sch">مكان العمل</Label>
              <select id="c-sch" required className={selectCls("w-full")} value={f.school_id} onChange={(e) => set("school_id", e.target.value)}>
                <option value="">اختر…</option>{empSchools.map((a) => <option key={a.id} value={a.school_id}>{a.school}</option>)}
              </select>
              {emp && !empSchools.length && <p className="text-xs text-destructive">لا يوجد للموظف تعيين حالي في مدرسة يحق لك إعداد عقودها.</p>}
            </div>
          </>
        )}
        <div><Label htmlFor="c-kind">نوع العقد</Label><select id="c-kind" className={selectCls("w-full")} value={f.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(KIND).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
        <div><Label htmlFor="c-job">الوظيفة</Label><Input id="c-job" value={f.job_title} onChange={(e) => set("job_title", e.target.value)} /></div>
        <div><Label htmlFor="c-sd">تاريخ البداية</Label><Input id="c-sd" type="date" required disabled={!!amend} value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
        <div><Label htmlFor="c-ed">تاريخ النهاية {fixed ? "" : "(اختياري)"}</Label><Input id="c-ed" type="date" required={fixed} value={f.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
        {amend && <div><Label htmlFor="c-ef">يسري التعديل من</Label><Input id="c-ef" type="date" required value={f.effective_from} onChange={(e) => set("effective_from", e.target.value)} /></div>}
        <div><Label htmlFor="c-pd">فترة التجربة (أيام، إن وُجدت)</Label><Input id="c-pd" inputMode="numeric" value={f.probation_days} onChange={(e) => set("probation_days", e.target.value.replace(/\D/g, ""))} /></div>
        <div className="md:col-span-2"><Label htmlFor="c-pt">شروط التجربة</Label><Input id="c-pt" value={f.probation_terms} onChange={(e) => set("probation_terms", e.target.value)} /></div>
        <div className="md:col-span-2"><Label htmlFor="c-tpl">قالب النص (اختياري)</Label>
          <select id="c-tpl" className={selectCls("w-full")} value={f.template_id} onChange={(e) => set("template_id", e.target.value)}><option value="">بلا قالب</option>{(tpls.data ?? []).filter((t) => t.is_active || t.id === f.template_id).map((t) => <option key={t.id} value={t.id}>{t.name} (نسخة {t.version})</option>)}</select>
          <p className="text-xs text-muted-foreground">يُحفظ نص القالب داخل الإصدار عند الحفظ؛ تعديل القالب لاحقًا لا يغير عقدًا صادرًا.</p>
        </div>
        <div className="md:col-span-2"><Label htmlFor="c-terms">شروط العمل</Label><Textarea id="c-terms" rows={3} value={f.terms} onChange={(e) => set("terms", e.target.value)} /></div>
        <div className="md:col-span-2"><Label htmlFor="c-notes">ملاحظات</Label><Input id="c-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        <fieldset className="space-y-2 rounded-lg border p-3 md:col-span-2">
          <legend className="px-1 text-sm font-semibold">التعويض</legend>
          {!compEdit ? <p className="text-sm text-muted-foreground">{compHidden || !k.caps.comp_view ? "بنود التعويض لا تظهر لك، وتبقى كما هي في الإصدار." : "تعديل التعويض صلاحية مستقلة؛ البنود تبقى كما هي."}</p> : <>
            {f.comp.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بنود. أضف الأساسي والبدلات كما اتُّفق عليها؛ لا تُقترح مبالغ تلقائيًا.</p>}
            {f.comp.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-lg bg-secondary/30 p-2 sm:grid-cols-[8rem_1fr_8rem_5rem_7rem_auto]">
                <select aria-label="نوع البند" className={selectCls("w-full")} value={l.kind} onChange={(e) => line(i, { kind: e.target.value as CompLine["kind"] })}>{Object.entries(COMP_KIND).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
                <Input aria-label="اسم البند" placeholder="اسم البند" required value={l.label} onChange={(e) => line(i, { label: e.target.value })} />
                <Input aria-label="المبلغ" placeholder="المبلغ" inputMode="decimal" dir="ltr" required value={l.amount} onChange={(e) => line(i, { amount: e.target.value.replace(/[^\d.]/g, "") })} />
                <Input aria-label="العملة" placeholder="SAR" dir="ltr" required maxLength={3} value={l.currency} onChange={(e) => line(i, { currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />
                <select aria-label="الدورية" className={selectCls("w-full")} value={l.period} onChange={(e) => line(i, { period: e.target.value as CompLine["period"] })}>{Object.entries(PERIOD).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
                <Button type="button" variant="ghost" size="icon" aria-label="حذف البند" onClick={() => set("comp", f.comp.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => set("comp", [...f.comp, { kind: f.comp.some((x) => x.kind === "basic") ? "allowance" : "basic", label: "", amount: "", currency: f.comp[0]?.currency ?? "", period: "monthly" }])}><Plus className="size-4" />إضافة بند</Button>
          </>}
        </fieldset>
        <div className="md:col-span-2"><Label htmlFor="c-reason">{amend ? "سبب التعديل (مطلوب)" : "ملاحظة الحفظ (اختياري)"}</Label><Input id="c-reason" required={!!amend && !f.updated_at} value={f.reason} onChange={(e) => set("reason", e.target.value)} /></div>
        <div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? "جارٍ الحفظ…" : "حفظ المسودة"}</Button><Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button></div>
        <p className="text-xs text-muted-foreground md:col-span-2">الحفظ ينشئ مسودة فقط. الإصدار يحتاج مراجعًا آخر يملك صلاحية الاعتماد، ثم إقرار الموظف.</p>
      </form>
    </section>
  );
}

function Templates({ org, admin, onClose }: { org: string; admin: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ["hr-tpl", org], queryFn: () => rpc<Tpl[]>("hr_template_list", { _org: org }) });
  const [f, setF] = useState<{ id: string | null; name: string; body: string; active: boolean } | null>(null);
  const save = useMutation({ mutationFn: () => rpc("hr_template_save", { _org: org, _id: f!.id, _name: f!.name, _body: f!.body, _active: f!.active }), onSuccess: () => { toast.success("حُفظ القالب"); setF(null); qc.invalidateQueries({ queryKey: ["hr-tpl"] }); }, onError: (e) => toast.error(arabicError(e)) });
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="قوالب العقود">
      <div className="mb-3 flex items-center gap-2"><p className="flex-1 font-bold">قوالب نصوص العقود</p>{admin && !f && <Button size="sm" onClick={() => setF({ id: null, name: "", body: "", active: true })}><Plus className="size-4" />قالب جديد</Button>}<Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق"><X className="size-4" /></Button></div>
      <p className="mb-2 text-xs text-muted-foreground">المتغيرات المتاحة: {"{{الاسم}} {{الرقم_الوظيفي}} {{الوظيفة}} {{المدرسة}} {{رقم_العقد}} {{البداية}} {{النهاية}}"}. المبالغ لا تُدرج في النص. {admin ? "" : "تعديل القوالب لصاحب صلاحية الاعتماد على مستوى المؤسسة."}</p>
      {f && (
        <form className="mb-3 space-y-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Input aria-label="اسم القالب" placeholder="اسم القالب" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Textarea aria-label="نص القالب" rows={6} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />متاح للعقود الجديدة</label>
          <div className="flex gap-2"><Button type="submit" size="sm" disabled={save.isPending}>حفظ</Button><Button type="button" size="sm" variant="ghost" onClick={() => setF(null)}>إلغاء</Button></div>
        </form>
      )}
      {t.isLoading ? <LoadingState rows={1} /> : t.error ? <ErrorState message={arabicError(t.error)} /> : !t.data!.length ? <EmptyState title="لا توجد قوالب" /> : (
        <ul className="space-y-2">{t.data!.map((x) => <li key={x.id} className="rounded-lg border p-2 text-sm"><div className="flex items-center gap-2"><span className="flex-1 font-semibold">{x.name} <span className="text-xs text-muted-foreground">نسخة {x.version}{x.is_active ? "" : " · غير متاح"}</span></span>{admin && <Button size="sm" variant="ghost" onClick={() => setF({ id: x.id, name: x.name, body: x.body, active: x.is_active })}>تعديل</Button>}</div><p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{x.body}</p></li>)}</ul>
      )}
    </section>
  );
}
