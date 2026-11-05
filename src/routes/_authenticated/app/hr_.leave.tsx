import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, Plus } from "lucide-react";
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
import { LV_STATUS, LeaveCard, LeavePanel, PolicyForm, WEEKDAYS, daysTxt, policyTxt, type LeaveRow, type LeaveType } from "@/components/hr/leave";

type Caps = { enabled: boolean; settings_admin: boolean; team: boolean; caps: Record<"view" | "approve" | "balances" | "settings" | "export", boolean> };
type Setup = { work_days: number[] | null; updated_at: string | null; can_edit: boolean; schools: { id: string; name: string }[]; types: LeaveType[] };
type BalRow = { employee_id: string; employee: string; employee_no: string; school: string | null; type_id: string; type: string; year: number; granted: number; adjusted: number; taken: number; balance: number; pending: number };
type Search = { r?: string; tab?: "requests" | "balances" | "settings" };

export const Route = createFileRoute("/_authenticated/app/hr_/leave")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    if (typeof s["r"] === "string") o.r = s["r"] as string;
    if (s["tab"] === "balances" || s["tab"] === "settings") o.tab = s["tab"];
    return o;
  },
  head: () => ({ meta: [{ title: "الإجازات — الموارد البشرية — ركاز" }, { name: "description", content: "سياسات الإجازات وأرصدة الموظفين وطلباتهم من المدير المباشر حتى اعتماد الموارد البشرية." }, { property: "og:title", content: "الإجازات — ركاز" }, { property: "og:description", content: "إدارة إجازات الموظفين في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["hr-lv-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("hr_leave_caps", { _org: org }) });
  if (!active) return null;
  const k = caps.data;
  const any = k && Object.values(k.caps).some(Boolean);
  return (
    <>
      <Link to="/app/hr" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />ملفات الموظفين</Link>
      <PageHeader title="الإجازات" desc="الموظف يطلب ← المدير المباشر يوافق ← الموارد البشرية تعتمد. الرصيد مجموع حركات لا تُعدّل، وإجازة المعلم المعتمدة تُسجل غيابًا ليعيّن الوكيل البديل." />
      {caps.isLoading ? <LoadingState /> : caps.error ? <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} />
        : !k!.enabled ? <SectionLocked /> : !any ? <ForbiddenState /> : <Workspace org={org!} k={k!} />}
    </>
  );
}

function Workspace({ org, k }: { org: string; k: Caps }) {
  const s = Route.useSearch();
  const nav = useNavigate({ from: "/app/hr/leave" });
  const tab = s.tab ?? (k.caps.view ? "requests" : k.caps.balances ? "balances" : "settings");
  const tabs = ([["requests", "الطلبات", k.caps.view], ["balances", "الأرصدة", k.caps.view || k.caps.balances], ["settings", "الأنواع والسياسات", true]] as const).filter((t) => t[2]);
  return (
    <div className="space-y-4">
      <nav aria-label="أقسام الإجازات" className="flex flex-wrap gap-2 text-sm">
        {tabs.map(([key, l]) => <button key={key} type="button" onClick={() => nav({ search: key === "requests" ? {} : { tab: key } })} className={"rounded-lg px-3 py-1.5 " + (tab === key ? "bg-primary text-primary-foreground" : "border bg-card hover:border-primary")} aria-current={tab === key ? "page" : undefined}>{l}</button>)}
        {k.team && <Link to="/app/team-leave" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">طلبات فريقي</Link>}
      </nav>
      {s.r && <LeavePanel id={s.r} onClose={() => nav({ search: tab === "requests" ? {} : { tab } })} />}
      {tab === "requests" && k.caps.view && <Requests org={org} k={k} onOpen={(id) => nav({ search: { r: id } })} />}
      {tab === "balances" && <Balances org={org} k={k} />}
      {tab === "settings" && <Settings org={org} />}
    </div>
  );
}

function useSetup(org: string) { return useQuery({ queryKey: ["hr-lv-setup", org], queryFn: () => rpc<Setup>("hr_leave_setup", { _org: org }) }); }

function Requests({ org, k, onOpen }: { org: string; k: Caps; onOpen: (id: string) => void }) {
  const [f, setF] = useState({ q: "", status: "", type: "", school: "", from: "", to: "" });
  const setup = useSetup(org);
  const list = useQuery({ queryKey: ["hr-lv-list", org, f], queryFn: () => rpc<LeaveRow[]>("hr_leave_list", { _org: org, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }) });
  const rows = list.data ?? [];
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const exp = (kind: "xlsx" | "pdf") => {
    const headers = ["الموظف", "الرقم الوظيفي", "المدرسة", "النوع", "من", "إلى", "آخر يوم فعلي", "الأيام", "الحالة", "المدير", "اعتماد الموارد"];
    const data = rows.map((r) => [r.employee, r.employee_no, r.school ?? "", r.type, r.start_date, r.end_date, r.actual_end ?? "", Number(r.days), LV_STATUS[r.status] ?? r.status, r.manager_by ?? "", r.hr_by ?? ""]);
    const meta = { title: "سجل الإجازات", filters: [f.status ? LV_STATUS[f.status]! : "", f.from ? `من ${f.from}` : "", f.to ? `إلى ${f.to}` : "", f.q ? `بحث: ${f.q}` : ""].filter(Boolean) };
    return kind === "xlsx" ? exportXlsx(meta, headers, data) : exportPdf(meta, headers, data);
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["pending_manager", "عند المدير المباشر"], ["pending_hr", "بانتظار اعتمادنا"], ["approved", "معتمدة"], ["returned", "أُعيدت للتعديل"]].map(([st, lb]) => (
          <button key={st} type="button" onClick={() => setF((x) => ({ ...x, status: x.status === st ? "" : st! }))} className={"rounded-xl border bg-card p-3 text-start " + (f.status === st ? "border-primary" : "")}>
            <span className="block text-2xl font-bold">{count(st!)}</span><span className="block text-xs text-muted-foreground">{lb}</span></button>))}
      </div>
      <div className="grid gap-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-end">
        <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم الوظيفي" className="w-full sm:w-56" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="الحالة" className={selectCls("w-full sm:w-44")} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(LV_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="النوع" className={selectCls("w-full sm:w-40")} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">كل الأنواع</option>{(setup.data?.types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        {(setup.data?.schools.length ?? 0) > 1 && <select aria-label="المدرسة" className={selectCls("w-full sm:w-40")} value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">كل المدارس</option>{setup.data!.schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <label className="text-xs text-muted-foreground">من<Input type="date" dir="ltr" className="w-full sm:w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">إلى<Input type="date" dir="ltr" className="w-full sm:w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        {k.caps.export && rows.length > 0 && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></div>}
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد طلبات إجازة" hint="تظهر هنا طلبات الموظفين ضمن نطاقك." /> : (
        <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => <li key={r.id}><LeaveCard r={r} onOpen={() => onOpen(r.id)} /></li>)}</ul>
      )}
    </>
  );
}

function Balances({ org, k }: { org: string; k: Caps }) {
  const qc = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [f, setF] = useState({ year: String(thisYear), type: "", school: "", q: "" });
  const setup = useSetup(org);
  const list = useQuery({ queryKey: ["hr-lv-bal", org, f], enabled: k.caps.view, queryFn: () => rpc<BalRow[]>("hr_leave_balances", { _org: org, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }) });
  const [g, setG] = useState({ type: "", school: "" });
  const grant = useMutation({
    mutationFn: () => rpc<{ granted: number; skipped: number }>("hr_leave_grant", { _org: org, _type: g.type, _year: Number(f.year), _school: g.school || null }),
    onSuccess: (r) => { toast.success(`مُنح الاستحقاق لـ ${r.granted} موظف${r.skipped ? ` · تخطي ${r.skipped} (لا سياسة رصيد أو مُنح سابقًا)` : ""}`); qc.invalidateQueries({ queryKey: ["hr-lv-bal"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const adjust = useMutation({
    mutationFn: (a: { emp: string; type: string; days: number; reason: string }) => rpc("hr_leave_adjust", { _emp: a.emp, _type: a.type, _year: Number(f.year), _days: a.days, _reason: a.reason, _key: crypto.randomUUID() }),
    onSuccess: () => { toast.success("سُجلت التسوية"); qc.invalidateQueries({ queryKey: ["hr-lv-bal"] }); }, onError: (e) => toast.error(arabicError(e)),
  });
  const doAdjust = async (r: BalRow) => {
    const n = await askText(`عدد أيام التسوية لـ ${r.employee} — ${r.type} (موجب للإضافة، سالب للخصم)`, { required: true }); if (!n) return;
    const days = Number(n.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))));
    if (!Number.isFinite(days) || days === 0) { toast.error("أدخل رقمًا غير صفري"); return; }
    const reason = await askText("سبب التسوية", { required: true }); if (reason) adjust.mutate({ emp: r.employee_id, type: r.type_id, days, reason });
  };
  const rows = list.data ?? [];
  const types = (setup.data?.types ?? []).filter((t) => t.is_active);
  const exp = (kind: "xlsx" | "pdf") => {
    const headers = ["الموظف", "الرقم الوظيفي", "المدرسة", "النوع", "السنة", "الاستحقاق", "التسويات", "المأخوذ", "المعلّق", "الرصيد"];
    const data = rows.map((r) => [r.employee, r.employee_no, r.school ?? "", r.type, r.year, Number(r.granted), Number(r.adjusted), Number(r.taken), Number(r.pending), Number(r.balance)]);
    const meta = { title: `أرصدة الإجازات ${f.year}`, filters: [f.q ? `بحث: ${f.q}` : ""].filter(Boolean) };
    return kind === "xlsx" ? exportXlsx(meta, headers, data) : exportPdf(meta, headers, data);
  };
  return (
    <>
      {k.caps.balances && (
        <Section title="منح الاستحقاق السنوي" desc="يُمنح لكل موظف نشط مرة واحدة لكل نوع وسنة حسب السياسة السارية لمدرسته؛ تكرار المنح لا يضيف شيئًا. لا يُحتسب تناسب تلقائي لتاريخ المباشرة — استخدم التسوية بسبب.">
          <form className="grid gap-2 sm:flex sm:flex-wrap sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!g.type) { toast.error("اختر النوع"); return; } if (!grant.isPending) grant.mutate(); }}>
            <div><Label htmlFor="gr-t">النوع</Label><select id="gr-t" className={selectCls("mt-1 w-full sm:w-44")} value={g.type} onChange={(e) => setG({ ...g, type: e.target.value })}><option value="">— اختر —</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            {(setup.data?.schools.length ?? 0) > 1 && <div><Label htmlFor="gr-s">المدرسة</Label><select id="gr-s" className={selectCls("mt-1 w-full sm:w-44")} value={g.school} onChange={(e) => setG({ ...g, school: e.target.value })}><option value="">كل المدارس المصرح بها</option>{setup.data!.schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
            <p className="text-sm">السنة <bdi dir="ltr">{f.year}</bdi></p>
            <Button size="sm" type="submit" disabled={grant.isPending}><Plus className="size-4" />منح</Button>
          </form>
        </Section>
      )}
      {k.caps.view && <>
        <div className="grid gap-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-center">
          <select aria-label="السنة" className={selectCls("w-full sm:w-28")} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}>{[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم" className="w-full sm:w-56" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select aria-label="النوع" className={selectCls("w-full sm:w-40")} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">كل الأنواع</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          {k.caps.export && rows.length > 0 && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></div>}
        </div>
        {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد أرصدة لهذه السنة" hint="امنح الاستحقاق السنوي أولًا." /> : (
          <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => (
            <li key={r.employee_id + r.type_id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-semibold">{r.employee}</span><span className="text-lg font-bold">{Number(r.balance)}</span><span className="text-xs text-muted-foreground">يوم</span></div>
              <p className="text-xs text-muted-foreground">{r.type} · {r.school ?? ""} · استحقاق {Number(r.granted)} · تسويات {Number(r.adjusted)} · مأخوذ {Number(r.taken)}{Number(r.pending) ? ` · معلّق ${daysTxt(r.pending)}` : ""}</p>
              {k.caps.balances && <Button size="sm" variant="ghost" className="mt-1" disabled={adjust.isPending} onClick={() => doAdjust(r)}>تسوية</Button>}
            </li>))}</ul>
        )}
      </>}
    </>
  );
}

function Settings({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useSetup(org);
  const [wd, setWd] = useState<number[] | null>(null);
  const [newType, setNewType] = useState("");
  const [polFor, setPolFor] = useState<string | null>(null);
  const inv = () => { qc.invalidateQueries({ queryKey: ["hr-lv-setup"] }); qc.invalidateQueries({ queryKey: ["hr-lv-mine"] }); };
  const saveWd = useMutation({ mutationFn: (d: number[]) => rpc("hr_leave_workdays_save", { _org: org, _days: d }), onSuccess: () => { toast.success("حُفظت أيام العمل"); setWd(null); inv(); }, onError: (e) => toast.error(arabicError(e)) });
  const saveType = useMutation({ mutationFn: (a: { id: string | null; name: string; active: boolean }) => rpc("hr_leave_type_save", { _org: org, _id: a.id, _name: a.name, _active: a.active }), onSuccess: () => { toast.success("حُفظ النوع"); setNewType(""); inv(); }, onError: (e) => toast.error(arabicError(e)) });
  const savePol = useMutation({ mutationFn: (a: { type: string; p: Record<string, unknown> }) => rpc("hr_leave_policy_save", { _org: org, _type: a.type, _p: a.p }), onSuccess: () => { toast.success("حُفظت نسخة السياسة"); setPolFor(null); inv(); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const cur = wd ?? d.work_days ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      {!d.can_edit && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">عرض فقط. يضبط الأنواع والسياسات المالك أو من يملك صلاحية «إعداد أنواع الإجازات وسياساتها».</p>}
      <Section title="أيام العمل" desc="تُستخدم لاحتساب الإجازات بأيام العمل ولأيام غياب المعلم. لا توجد قيمة افتراضية.">
        {d.work_days == null && !wd && <p className="mb-2 text-sm text-warning">لم تُحدد بعد؛ السياسات التي تحتسب أيام العمل موقوفة حتى تُحدد.</p>}
        <div className="flex flex-wrap gap-2">{WEEKDAYS.map((n, i) => (
          <label key={i} className={"flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm " + (cur.includes(i) ? "border-primary bg-primary/10" : "bg-card")}>
            <input type="checkbox" disabled={!d.can_edit} checked={cur.includes(i)} onChange={(e) => setWd(e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i))} />{n}</label>))}</div>
        {d.can_edit && wd && <Button size="sm" className="mt-2" disabled={saveWd.isPending} onClick={() => saveWd.mutate(wd)}>حفظ أيام العمل</Button>}
      </Section>
      <Section title="أنواع الإجازات وسياساتها" desc="سياسة المدرسة تتقدم على سياسة المؤسسة. كل نسخة لها تاريخ سريان، والطلبات تُقيَّم بالنسخة السارية في تاريخ بدايتها.">
        {d.can_edit && (
          <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (newType.trim()) saveType.mutate({ id: null, name: newType, active: true }); }}>
            <Input aria-label="اسم نوع جديد" placeholder="اسم نوع جديد (مثال: إجازة اضطرارية)" className="w-full sm:w-72" value={newType} onChange={(e) => setNewType(e.target.value)} />
            <Button size="sm" type="submit" disabled={saveType.isPending}><Plus className="size-4" />إضافة نوع</Button>
          </form>
        )}
        {d.types.length === 0 ? <EmptyState title="لا توجد أنواع إجازات" hint="يضيفها المالك ثم يحدد لكل نوع سياسة مؤرخة." /> : (
          <ul className="space-y-3">{d.types.map((t) => {
            const live = t.policies.filter((p) => p.effective_from <= today && (!p.effective_to || p.effective_to >= today));
            return (
              <li key={t.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b className="flex-1">{t.name}</b>{!t.is_active && <span className="rounded bg-muted px-1.5 text-xs">موقوف</span>}
                  {d.can_edit && <><Button size="sm" variant="outline" onClick={() => setPolFor(polFor === t.id ? null : t.id)}>نسخة سياسة جديدة</Button>
                    <Button size="sm" variant="ghost" onClick={() => saveType.mutate({ id: t.id, name: t.name, active: !t.is_active })}>{t.is_active ? "إيقاف" : "تفعيل"}</Button></>}</div>
                {live.length === 0 && <p className="text-xs text-warning">لا توجد سياسة سارية اليوم؛ لا يستطيع الموظفون طلب هذا النوع.</p>}
                {polFor === t.id && <PolicyForm schools={d.schools} busy={savePol.isPending} onCancel={() => setPolFor(null)} onSave={(p) => savePol.mutate({ type: t.id, p })} />}
                {t.policies.length > 0 && <ul className="space-y-1">{t.policies.map((p) => (
                  <li key={p.id} className={"rounded-lg bg-secondary/40 p-2 text-xs " + (live.some((x) => x.id === p.id) ? "" : "opacity-70")}>
                    <b>{p.school ?? "المؤسسة كلها"} · نسخة {p.version}</b> · من <bdi dir="ltr">{p.effective_from}</bdi>{p.effective_to ? <> إلى <bdi dir="ltr">{p.effective_to}</bdi></> : " (مستمرة)"} — {policyTxt(p)}{p.created_by ? ` · ${p.created_by}` : ""}
                  </li>))}</ul>}
              </li>
            );
          })}</ul>
        )}
      </Section>
    </div>
  );
}
