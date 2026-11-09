import type React from "react";
import { AddressCard } from "@/components/hr/p10";
import { EmpOpenAssets } from "@/components/hr/assets";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, IdCard, Plus, Upload, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { HrImport } from "@/components/hr/import";
import { HrIdReadiness } from "@/components/hr/id-readiness";
import { PersonCardButton } from "@/components/people/person-card";
import { HrCategories } from "@/components/hr/categories";
import { useServerFn } from "@tanstack/react-start";
import { createHrEmployeeLogin } from "@/lib/accounts.functions";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { GENDER, STATUS, rpc, useHrCats, useHrMe, type HrAssign, type HrEmp, type HrMe } from "@/components/hr/shared";

export const Route = createFileRoute("/_authenticated/app/hr")({
  validateSearch: (s: Record<string, unknown>): { emp?: string; add?: string; imp?: string } => ({
    ...(typeof s["emp"] === "string" ? { emp: s["emp"] as string } : {}),
    ...(s["add"] ? { add: "1" } : {}),
    ...(s["imp"] ? { imp: "1" } : {}),
  }),
  head: () => ({ meta: [{ title: "الموارد البشرية — ركاز" }, { name: "description", content: "ملفات الموظفين وتعييناتهم في مدارس المؤسسة." }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const me = useHrMe(org);
  if (!active) return null;
  if (me.isLoading) return <LoadingState />;
  if (me.error) return <ErrorState message={arabicError(me.error)} onRetry={() => me.refetch()} />;
  const m = me.data!;
  return (
    <>
      {m.owner && <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />الرئيسية</Link>}
      <PageHeader title="الموارد البشرية" desc="ملفات الموظفين وتعييناتهم. الموظف سجل واحد في المؤسسة يرتبط بحساب دخوله وسجل المعلم إن وُجد؛ يمكن إنشاء حساب دخوله بالهوية والجوال من نموذج الإضافة." />
      {m.enabled && <nav aria-label="أقسام الموارد البشرية" className="mb-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">ملفات الموظفين</span>
        <Link to="/app/hr/contracts" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">العقود</Link>
        <Link to="/app/hr/documents" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">المستندات</Link>
        <Link to="/app/hr/letters" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">الخطابات</Link>
        <Link to="/app/hr/leave" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">الإجازات</Link>
        <Link to="/app/hr/attendance" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">الحضور والانصراف</Link>
        <Link to="/app/hr/payroll" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">الرواتب والسلف</Link>
        <Link to="/app/hr/recruit" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">التوظيف</Link>
        <Link to="/app/hr/assets" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">العهد العينية</Link>
        <Link to="/app/hr/performance" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">الأداء</Link>
        <Link to="/app/hr/insurance" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">التأمين الطبي</Link>
        <Link to="/app/hr/housing" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">السكن</Link>
        <Link to="/app/hr/reports" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">التقارير</Link>
        <Link to="/app/hr/opening" className="rounded-lg border bg-card px-3 py-1.5 hover:border-primary">الأرصدة الافتتاحية</Link>
      </nav>}
      {!m.enabled ? <SectionLocked /> : !m.caps.view ? <ForbiddenState /> : <Workspace org={org!} m={m} />}
    </>
  );
}

function Workspace({ org, m }: { org: string; m: HrMe }) {
  const { emp, add, imp } = Route.useSearch();
  const qc = useQueryClient();
  const all = useQuery({ enabled: !!imp, queryKey: ["hr-list-all", org], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: null, _q: null, _status: null }) });
  const nav = useNavigate({ from: "/app/hr" });
  const [q, setQ] = useState(""), [school, setSchool] = useState(""), [status, setStatus] = useState("active");
  const list = useQuery({ queryKey: ["hr-list", org, school, q, status], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: school || null, _q: q || null, _status: status || null }) });
  const rows = list.data ?? [];
  const exp = (kind: "xlsx" | "pdf") => {
    const sens = rows.some((r) => r.sensitive);
    const headers = ["الرقم الوظيفي", "الاسم", "الوظيفة", "المدارس", "الحالة", "حساب دخول", ...(sens ? ["رقم الهوية"] : [])];
    const data = rows.map((r) => [r.employee_no, r.full_name, r.job_title ?? "", (r.assignments ?? []).map((a) => a.school).join("، "), STATUS[r.status] ?? r.status, r.has_login ? "نعم" : "لا", ...(sens ? [r.sensitive ? r.national_id ?? "" : "غير مصرح"] : [])]);
    const meta = { title: "قائمة الموظفين", filters: [school ? m.schools.find((s) => s.id === school)?.name ?? "" : "كل المدارس المصرح بها", status ? STATUS[status]! : "كل الحالات", q ? `بحث: ${q}` : ""].filter(Boolean) };
    return kind === "xlsx" ? exportXlsx(meta, headers, data) : exportPdf(meta, headers, data);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم الوظيفي أو الوظيفة" className="w-full sm:w-64" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="المدرسة" className={selectCls("w-full sm:w-44")} value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">كل المدارس</option>{m.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="الحالة" className={selectCls("w-full sm:w-40")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="flex-1" />
        {m.caps.export && rows.length > 0 && <>
          <Button variant="outline" size="sm" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button>
          <Button variant="outline" size="sm" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button>
        </>}
        {m.caps.create && <Button size="sm" onClick={() => nav({ search: { add: "1" } })}><Plus className="size-4" />إضافة موظف</Button>}
        {m.caps.create && <Button size="sm" variant="outline" onClick={() => nav({ search: { imp: "1" } })}><Upload className="size-4" />استيراد Excel</Button>}
      </div>
      {add && m.caps.create && <AddEmployee org={org} m={m} onClose={() => nav({ search: {} })} onDone={(id) => nav({ search: { emp: id } })} />}
      {m.org_wide && m.caps.edit && <HrCategories org={org} />}
      {imp && m.caps.create && all.data && <HrImport org={org} m={m} existing={all.data} onClose={() => nav({ search: {} })} onDone={() => { qc.invalidateQueries({ queryKey: ["hr-list"] }); qc.invalidateQueries({ queryKey: ["hr-list-all"] }); }} />}
      <HrIdReadiness org={org} school={school} onOpen={(id) => nav({ search: { emp: id } })} />
      {emp && <EmployeePanel id={emp} org={org} m={m} onClose={() => nav({ search: {} })} />}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !rows.length ? (
        <EmptyState title="لا يوجد موظفون مطابقون" hint={m.caps.create ? "أضف الموظفين من حساباتهم أو سجلات المعلمين الموجودة." : "لا توجد ملفات موظفين في نطاقك."} />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => nav({ search: { emp: r.id } })} className={"w-full rounded-xl border bg-card p-3 text-start hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (emp === r.id ? "border-primary" : "")}>
                <span className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><IdCard className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.full_name}</span>
                    <span className="block text-xs text-muted-foreground"><bdi dir="ltr">{r.employee_no}</bdi> · {r.job_title ?? "بلا مسمى"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{(r.assignments ?? []).map((a) => a.school).join("، ") || "بلا تعيين حالي"}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1 text-xs">
                    <span className={"rounded px-1.5 " + (r.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{STATUS[r.status]}</span>
                    {r.has_login && <span className="rounded bg-secondary px-1.5">حساب دخول</span>}
                    {(r.assignments ?? []).some((a) => a.teacher_id) && <span className="rounded bg-secondary px-1.5">سجل معلم</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{m.org_wide ? "نطاقك: المؤسسة كاملة." : "نطاقك: موظفو المدارس المصرح لك بها حسب تعييناتهم الحالية."} {m.caps.sensitive ? "" : "رقم الهوية يظهر مختصرًا لأن البيانات الحساسة صلاحية مستقلة."}</p>
    </div>
  );
}

type Cand = { accounts: { user_id: string; name: string; roles: string[]; schools: { id: string; name: string }[] | null }[]; teachers: { teacher_id: string; name: string; school_id: string; school: string; user_id: string | null; specialization: string | null }[] };
const EMPTY = { full_name: "", display_name: "", category_id: "", user_id: "", school_id: "", teacher_id: "", job_title: "", department: "", hire_date: "", phone: "", email: "", gender: "", national_id: "", nationality: "", birth_date: "" };

function AddEmployee({ org, m, onClose, onDone }: { org: string; m: HrMe; onClose: () => void; onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const cand = useQuery({ queryKey: ["hr-cand", org], queryFn: () => rpc<Cand>("hr_candidates", { _org: org }) });
  const [f, setF] = useState({ ...EMPTY });
  const cats = useHrCats(org);
  const set = (k: keyof typeof EMPTY, v: string) => setF((x) => ({ ...x, [k]: v }));
  const schools = m.schools.filter((s) => s.create);
  const teachers = (cand.data?.teachers ?? []).filter((t) => t.school_id === f.school_id && (!t.user_id || t.user_id === f.user_id));
  const [mode, setMode] = useState<"new" | "link">("new");
  const [base, setBase] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<{ kind: string; employee_id?: string }[]>([]);
  const createLogin = useServerFn(createHrEmployeeLogin);
  const roles = useQuery({ enabled: !!f.school_id, queryKey: ["hr-login-roles", org, f.school_id], queryFn: () => rpc<string[]>("hr_login_roles", { _org: org, _school: f.school_id }) });
  const done = (id: string) => { qc.invalidateQueries({ queryKey: ["hr-list"] }); qc.invalidateQueries({ queryKey: ["hr-cand"] }); onDone(id); };
  const save = useMutation({
    mutationFn: () => rpc<string>("hr_employee_save", { _org: org, _id: null, _p: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "")), _reason: null }),
    onSuccess: (id) => { toast.success("أُضيف ملف الموظف"); done(id); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const create = useMutation({
    mutationFn: () => createLogin({ data: { orgId: org, base, p: Object.fromEntries(Object.entries({ ...f, user_id: "", teacher_id: "" }).filter(([, v]) => v !== "")) } }),
    onSuccess: (r) => {
      if ("conflicts" in r && r.conflicts) { setConfirm(false); setConflicts(r.conflicts); return; }
      toast.success("أُنشئ ملف الموظف وحساب دخوله"); done((r as { employeeId: string }).employeeId);
    },
    onError: (e) => { setConfirm(false); toast.error(arabicError(e)); },
  });
  const schoolName = schools.find((s) => s.id === f.school_id)?.name ?? "";
  const canNew = !!f.full_name.trim() && !!f.school_id && !!base && /^[12]\d{9}$/.test(f.national_id.replace(/\D/g, "")) && !!localPhone(f.phone);
  const pickAccount = (uid: string) => {
    const a = cand.data?.accounts.find((x) => x.user_id === uid);
    const t = (cand.data?.teachers ?? []).find((x) => x.user_id === uid);
    const sch = t?.school_id ?? a?.schools?.find((s) => schools.some((x) => x.id === s.id))?.id ?? f.school_id;
    setF((x) => ({ ...x, user_id: uid, full_name: a?.name && a.name !== "—" ? a.name : x.full_name, school_id: sch, teacher_id: t && t.school_id === sch ? t.teacher_id : "", job_title: x.job_title || (t ? (t.specialization ? `معلم ${t.specialization}` : "معلم") : "") }));
  };
  const pickTeacher = (tid: string) => {
    const t = (cand.data?.teachers ?? []).find((x) => x.teacher_id === tid);
    setF((x) => ({ ...x, teacher_id: tid, ...(t ? { school_id: t.school_id, full_name: x.full_name || t.name, job_title: x.job_title || (t.specialization ? `معلم ${t.specialization}` : "معلم"), ...(t.user_id ? { user_id: t.user_id } : {}) } : {}) }));
  };
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="إضافة موظف">
      <div className="mb-3 flex items-center gap-2"><p className="flex-1 font-bold">إضافة موظف</p><Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق"><X className="size-4" /></Button></div>
      {cand.isLoading ? <LoadingState rows={1} /> : cand.error ? <ErrorState message={arabicError(cand.error)} /> : (
        <div className="space-y-4">
          <div role="radiogroup" aria-label="حساب الدخول" className="grid gap-2 sm:grid-cols-2">
            {([["new", "إنشاء حساب جديد للموظف", "يدخل برقم الهوية أو الإقامة ثم رمز يصل إلى جواله المعتمد."], ["link", "ربط يدوي بحساب موجود", "لموظف لديه حساب دخول في المؤسسة من قبل."]] as const).map(([k, t, d]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => { setMode(k); setConfirm(false); setConflicts([]); setF((x) => ({ ...x, user_id: "", teacher_id: "" })); }}
                className={"rounded-lg border p-3 text-start " + (mode === k ? "border-primary bg-primary/5" : "hover:border-primary")}>
                <span className="block font-semibold">{t}</span><span className="block text-xs text-muted-foreground">{d}</span>
              </button>))}
          </div>
          {mode === "new" && !m.caps.sensitive && <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-sm">إنشاء حساب الدخول يحتاج إدخال رقم الهوية، وهو صلاحية «البيانات الحساسة» غير المتاحة لك.</p>}
          {mode === "new" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label htmlFor="hr-sch">المدرسة</Label>
                <select id="hr-sch" className={selectCls("mt-1 w-full")} value={f.school_id} onChange={(e) => { setF((x) => ({ ...x, school_id: e.target.value })); setBase(""); setConflicts([]); }}>
                  <option value="">اختر المدرسة</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><Label htmlFor="hr-cat">التصنيف الوظيفي</Label>
                <select id="hr-cat" className={selectCls("mt-1 w-full")} value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  <option value="">بلا تصنيف</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><Label htmlFor="hr-role">دور الدخول</Label>
                <select id="hr-role" className={selectCls("mt-1 w-full")} value={base} disabled={!f.school_id} onChange={(e) => { setBase(e.target.value); if (!f.job_title) set("job_title", ROLE_LABELS[e.target.value as Role] ?? ""); }}>
                  <option value="">{f.school_id ? "اختر الدور" : "اختر المدرسة أولًا"}</option>{(roles.data ?? []).map((r) => <option key={r} value={r}>{ROLE_LABELS[r as Role] ?? r}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">تظهر الأدوار التي يحق لك منحها فقط. لا تُمنح صلاحيات الموارد البشرية تلقائيًا.</p></div>
            </div>
          ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label htmlFor="hr-acc">الحساب الموجود</Label>
              <select id="hr-acc" className={selectCls("mt-1 w-full")} value={f.user_id} onChange={(e) => e.target.value ? pickAccount(e.target.value) : set("user_id", "")}>
                <option value="">بلا حساب دخول</option>{cand.data!.accounts.map((a) => <option key={a.user_id} value={a.user_id}>{a.name} — {(a.schools ?? []).map((s) => s.name).join("، ")}</option>)}
              </select></div>
            <div><Label htmlFor="hr-sch">مدرسة التعيين الأول</Label>
              <select id="hr-sch" className={selectCls("mt-1 w-full")} value={f.school_id} onChange={(e) => setF((x) => ({ ...x, school_id: e.target.value, teacher_id: "" }))}>
                <option value="">اختر المدرسة</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><Label htmlFor="hr-cat">التصنيف الوظيفي</Label>
              <select id="hr-cat" className={selectCls("mt-1 w-full")} value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
                <option value="">بلا تصنيف</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">التصنيف وصف وظيفي فقط ولا يمنح صلاحيات أو دور دخول.</p></div>
            <div className="md:col-span-2"><Label htmlFor="hr-t">ربط بسجل معلم موجود في المدرسة (اختياري)</Label>
              <select id="hr-t" className={selectCls("mt-1 w-full")} value={f.teacher_id} disabled={!f.school_id} onChange={(e) => e.target.value ? pickTeacher(e.target.value) : set("teacher_id", "")}>
                <option value="">ليس معلمًا / لا ربط</option>{teachers.map((t) => <option key={t.teacher_id} value={t.teacher_id}>{t.name}{t.specialization ? ` — ${t.specialization}` : ""}{t.user_id ? " (له حساب)" : ""}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">يبقى الملف الأكاديمي للمعلم كما هو؛ الربط يضيف الملف الوظيفي فقط.</p></div>
          </div>
          )}
          <EmpFields f={f} set={(k: never, v: string) => { set(k, v); setConflicts([]); setConfirm(false); }} sensitive={m.caps.sensitive} loginPhone={mode === "new"} />
          {conflicts.length > 0 && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-semibold">لم يُنشأ شيء — توجد بيانات سابقة تحتاج مراجعة:</p>
              <ul className="mt-1 list-disc ps-5">{conflicts.map((c, i) => <li key={i}>{CONFLICT[c.kind] ?? c.kind}{c.employee_id && <> — <button type="button" className="text-primary underline" onClick={() => onDone(c.employee_id!)}>فتح الملف الموجود</button></>}</li>)}</ul>
              <p className="mt-1 text-xs text-muted-foreground">لا يُدمج أو يُستبدل أي سجل تلقائيًا. إن كان الشخص نفسه ولديه حساب، استخدم «ربط يدوي بحساب موجود».</p>
            </div>)}
          {mode === "new" && confirm && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm" aria-label="تأكيد الإنشاء">
              <p className="mb-1 font-semibold">راجع قبل الإنشاء</p>
              <dl className="grid gap-1 sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">الموظف: </dt><dd className="inline">{f.full_name}</dd></div>
                <div><dt className="inline text-muted-foreground">المدرسة: </dt><dd className="inline font-semibold">{schoolName}</dd></div>
                <div><dt className="inline text-muted-foreground">دور الدخول: </dt><dd className="inline">{ROLE_LABELS[base as Role]}</dd></div>
                <div><dt className="inline text-muted-foreground">الجوال المعتمد: </dt><dd className="inline"><bdi dir="ltr">{localPhone(f.phone)}</bdi></dd></div>
              </dl>
              <p className="mt-1 text-xs text-muted-foreground">الصلاحيات: الصلاحيات المعتمدة لدور «{ROLE_LABELS[base as Role]}» في هذه المدرسة فقط، دون أي صلاحية إضافية أو صلاحية موارد بشرية.{base === "teacher" ? " سيُنشأ سجل معلم مرتبط." : ""} لن تُرسل رسالة الآن؛ الدخول لاحقًا برقم الهوية ورمز إلى الجوال.</p>
            </div>)}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {mode === "link" ? (
              <Button disabled={!f.full_name.trim() || !f.school_id || save.isPending} onClick={() => save.mutate()}><UserCheck className="size-4" />{save.isPending ? "…" : "حفظ الموظف"}</Button>
            ) : !confirm ? (
              <Button disabled={!canNew || !m.caps.sensitive} onClick={() => setConfirm(true)}><UserCheck className="size-4" />متابعة للتأكيد</Button>
            ) : (
              <Button disabled={create.isPending} onClick={() => create.mutate()}><UserCheck className="size-4" />{create.isPending ? "جارٍ الإنشاء…" : "تأكيد إنشاء الملف والحساب"}</Button>
            )}
            <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      )}
    </section>
  );
}

const CONFLICT: Record<string, string> = {
  bad_id: "رقم الهوية/الإقامة غير صحيح (10 أرقام تبدأ بـ1 أو 2)", bad_phone: "رقم الجوال غير صحيح (05xxxxxxxx)",
  hr_file: "رقم الهوية مسجل لملف موظف في المؤسسة", teacher: "رقم الهوية مسجل لسجل معلم", guardian: "رقم الهوية مسجل لولي أمر",
  owner: "رقم الهوية مسجل لمالك مؤسسة", other_org: "رقم الهوية مسجل لموظف في مؤسسة أخرى", phone_used: "رقم الجوال مستخدم لحساب شخص آخر",
};
/** Local display of a Saudi mobile (05xxxxxxxx); null when not a valid mobile. Stored server-side as +9665xxxxxxxx. */
function localPhone(s: string) {
  let d = (s ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^9665\d{8}$/.test(d)) d = "0" + d.slice(3);
  else if (/^5\d{8}$/.test(d)) d = "0" + d;
  return /^05\d{8}$/.test(d) ? d : null;
}

function EmpFields({ f, set, sensitive, withStatus, loginPhone }: { f: Record<string, string>; set: (k: never, v: string) => void; sensitive: boolean; withStatus?: boolean; loginPhone?: boolean }) {
  const raw = set as (k: string, v: string) => void;
  // display name follows first + last word of the full name until the user types their own
  const auto = (n: string) => { const w = n.trim().split(/\s+/).filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : (w[0] ?? ""); };
  const s = (k: string, v: string) => { raw(k, v); if (k === "full_name" && (!f["display_name"] || f["display_name"] === auto(f["full_name"] ?? ""))) raw("display_name", auto(v)); };
  const F = (k: string, label: string, type = "text", extra: Record<string, string> = {}) => (
    <div><Label htmlFor={`hr-${k}`}>{label}</Label><Input id={`hr-${k}`} type={type} className="mt-1" value={f[k] ?? ""} onChange={(e) => s(k, e.target.value)} {...extra} /></div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {F("full_name", "الاسم الرسمي الكامل")}
      {F("display_name", "الاسم المعروض", "text", { placeholder: "يُملأ تلقائيًا بالاسم الأول والأخير" })}
      {F("job_title", "المسمى الوظيفي")}
      {F("hire_date", "تاريخ المباشرة", "date")}
      {F("phone", loginPhone ? "رقم الجوال المعتمد للدخول" : "الجوال", "tel", { dir: "ltr", inputMode: "tel", placeholder: "05xxxxxxxx" })}
      {F("email", "البريد الوظيفي", "email", { dir: "ltr" })}
      <div><Label htmlFor="hr-gender">الجنس</Label><select id="hr-gender" className={selectCls("mt-1 w-full")} value={f["gender"] ?? ""} onChange={(e) => s("gender", e.target.value)}><option value="">—</option>{Object.entries(GENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      {sensitive ? <>
        {F("national_id", "رقم الهوية / الإقامة", "text", { dir: "ltr", inputMode: "numeric" })}
        {F("nationality", "الجنسية")}
        {F("birth_date", "تاريخ الميلاد", "date")}
      </> : <p className="self-end text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">رقم الهوية والجنسية وتاريخ الميلاد تحتاج صلاحية «البيانات الحساسة».</p>}
      {withStatus && <>
        <div><Label htmlFor="hr-status">الحالة</Label><select id="hr-status" className={selectCls("mt-1 w-full")} value={f["status"] ?? "active"} onChange={(e) => s("status", e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {f["status"] === "ended" && F("end_date", "تاريخ انتهاء الخدمة", "date")}
      </>}
    </div>
  );
}

// HR links the file to an existing account, then switches personal access on/off as a separate, audited step.
function SelfAccessCard({ e, org, canEdit, onDone }: { e: HrEmp; org: string; canEdit: boolean; onDone: () => void }) {
  const [uid, setUid] = useState("");
  const cand = useQuery({ queryKey: ["hr-cand", org], enabled: canEdit && !e.has_login, retry: false, queryFn: () => rpc<Cand>("hr_candidates", { _org: org }) });
  const link = useMutation({
    mutationFn: () => rpc("hr_employee_save", { _org: org, _id: e.id, _p: { full_name: e.full_name, job_title: e.job_title ?? "", hire_date: e.hire_date ?? "", phone: e.phone ?? "", email: e.email ?? "", gender: e.gender ?? "", status: e.status, end_date: e.end_date ?? "", notes: e.notes ?? "", user_id: uid } }),
    onSuccess: () => { toast.success("رُبط الملف بالحساب. الوصول ما زال غير مفعّل."); setUid(""); onDone(); },
    onError: (x) => toast.error(arabicError(x)),
  });
  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      const reason = on ? null : await askText("سبب إيقاف وصول الموظف إلى ملفه", { required: true, ok: "إيقاف" });
      if (!on && !reason) throw new Error("أُلغي");
      return rpc("hr_self_access_set", { _emp: e.id, _active: on, _reason: reason });
    },
    onSuccess: (_d, on) => { toast.success(on ? "فُعّل وصول الموظف إلى ملفه" : "أُوقف وصول الموظف إلى ملفه"); onDone(); },
    onError: (x) => { if ((x as Error).message !== "أُلغي") toast.error(arabicError(x)); },
  });
  const when = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "");
  return (
    <div className="rounded-lg border bg-secondary/30 p-3 text-sm" aria-label="الوصول إلى الملف الوظيفي">
      <p className="mb-1 font-bold">وصول الموظف إلى «ملفي الوظيفي»</p>
      {!e.has_login ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">الملف غير مرتبط بحساب. اربطه بحساب الموظف الحالي، ثم فعّل الوصول في خطوة منفصلة.</p>
          {canEdit && (cand.data ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-56 flex-1"><span className="text-xs text-muted-foreground">الحساب</span>
                <select className={selectCls("mt-1 w-full")} value={uid} onChange={(x) => setUid(x.target.value)} aria-label="اختر حساب الموظف">
                  <option value="">اختر الحساب…</option>{cand.data.accounts.map((a) => <option key={a.user_id} value={a.user_id}>{a.name} — {(a.schools ?? []).map((s) => s.name).join("، ")}</option>)}
                </select></label>
              <Button size="sm" disabled={!uid || link.isPending} onClick={() => link.mutate()}>{link.isPending ? "…" : "ربط بالحساب"}</Button>
            </div>
          ) : cand.isError ? <p className="text-xs text-muted-foreground">ربط الحسابات يحتاج صلاحية إنشاء ملفات الموظفين.</p> : null)}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className={"rounded px-2 py-0.5 text-xs font-semibold " + (e.self_access ? "bg-success/15 text-success" : "bg-warning/15 text-warning-foreground")}>{e.self_access ? "مفعّل" : "مرتبط — غير مفعّل"}</span>
          <span className="flex-1 text-xs text-muted-foreground">
            {e.self_linked_at && <>رُبط {when(e.self_linked_at)}. </>}
            {e.self_access_at && <>{e.self_access ? "فُعّل" : "آخر تغيير"} {when(e.self_access_at)}{e.self_access_by ? ` بواسطة ${e.self_access_by}` : ""}.</>}
          </span>
          {canEdit && (e.self_access
            ? <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(false)}>إيقاف الوصول</Button>
            : <Button size="sm" disabled={toggle.isPending || e.status === "ended"} onClick={() => toggle.mutate(true)}>تفعيل الوصول</Button>)}
        </div>
      )}
    </div>
  );
}

type Detail = { view: "hr" | "self" | "manager"; employee: HrEmp; assignments: HrAssign[]; can_edit: boolean; events?: { at: string; action: string; reason: string | null; by: string; entity: string }[] };
const ACT: Record<string, string> = { self_link: "ربط بحساب", self_unlink: "فك الربط بالحساب", self_on: "تفعيل الوصول للملف", self_off: "إيقاف الوصول للملف", create: "إنشاء", update: "تعديل", end: "إنهاء تعيين", "status:ended": "إنهاء الخدمة", "status:suspended": "إيقاف مؤقت", "status:active": "إعادة للعمل" };

function EmployeePanel({ id, org, m, onClose }: { id: string; org: string; m: HrMe; onClose: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["hr-emp", id], queryFn: () => rpc<Detail>("hr_employee_get", { _id: id }) });
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [asg, setAsg] = useState<Record<string, string> | null>(null);
  const cats = useHrCats(org);
  const others = useQuery({ queryKey: ["hr-list", org, "", "", "active"], enabled: !!asg, queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: null, _q: null, _status: "active" }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["hr-emp", id] }); qc.invalidateQueries({ queryKey: ["hr-list"] }); };
  const saveEmp = useMutation({
    mutationFn: async (v: Record<string, string>) => {
      const e = d.data!.employee;
      let reason: string | null = null;
      if ((v["status"] ?? "active") !== e.status) { reason = await askText("سبب تغيير حالة الموظف", { required: true, ok: "حفظ" }); if (!reason) throw new Error("أُلغي"); }
      const p: Record<string, unknown> = { ...v };
      if (!e.sensitive) { delete p["national_id"]; delete p["nationality"]; delete p["birth_date"]; }
      return rpc("hr_employee_save", { _org: org, _id: id, _p: p, _reason: reason });
    },
    onSuccess: () => { toast.success("حُفظت التعديلات"); setEdit(null); refresh(); },
    onError: (e) => { if ((e as Error).message !== "أُلغي") toast.error(arabicError(e)); },
  });
  const saveAsg = useMutation({
    mutationFn: async (v: Record<string, string>) => {
      const ending = !!v["end_date"] && !d.data!.assignments.find((a) => a.id === v["id"])?.end_date;
      const reason = ending ? await askText("سبب إنهاء التعيين", { required: true, ok: "حفظ" }) : null;
      if (ending && !reason) throw new Error("أُلغي");
      const { id: aid, ...p } = v;
      return rpc("hr_assignment_save", { _employee: id, _id: aid || null, _p: { ...Object.fromEntries(Object.entries(p).filter(([, x]) => x !== "")), category_id: p["category_id"] ?? "" }, _reason: reason });
    },
    onSuccess: () => { toast.success("حُفظ التعيين"); setAsg(null); refresh(); },
    onError: (e) => { if ((e as Error).message !== "أُلغي") toast.error(arabicError(e)); },
  });
  const mgrs = useMemo(() => (others.data ?? []).filter((x) => x.id !== id), [others.data, id]);
  if (d.isLoading) return <LoadingState rows={2} />;
  if (d.error) return <ErrorState message={arabicError(d.error)} />;
  const { employee: e, assignments, can_edit, events } = d.data!;
  const row = (k: string, v: React.ReactNode) => <div className="rounded-lg bg-secondary/40 p-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>;
  const startEdit = () => setEdit({ full_name: e.full_name, display_name: e.display_name ?? "", job_title: e.job_title ?? "", hire_date: e.hire_date ?? "", phone: e.phone ?? "", email: e.email ?? "", gender: e.gender ?? "", status: e.status, end_date: e.end_date ?? "", ...(e.sensitive ? { national_id: e.national_id ?? "", nationality: e.nationality ?? "", birth_date: e.birth_date ?? "" } : {}) });
  return (
    <section className="space-y-4 rounded-xl border-2 border-primary/30 bg-card p-4" aria-label={`ملف ${e.full_name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1"><span className="block text-lg font-bold">{e.display_name || e.full_name}</span>{e.display_name && e.display_name !== e.full_name && <span className="block text-xs text-muted-foreground">الاسم الرسمي: {e.full_name}</span>}<span className="text-xs text-muted-foreground"><bdi dir="ltr">{e.employee_no}</bdi> · {STATUS[e.status]}</span></span>
        <PersonCardButton kind="employee" id={e.id} org={org} />
        {can_edit && !edit && <Button size="sm" variant="outline" onClick={startEdit}>تعديل الملف</Button>}
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق الملف"><X className="size-4" /></Button>
      </div>
      {d.data!.view === "hr" && <SelfAccessCard e={e} org={org} canEdit={can_edit} onDone={refresh} />}
      <EmpOpenAssets emp={id} />
      {d.data!.view === "hr" && <AddressCard emp={id} />}
      {edit ? (
        <div className="space-y-3">
          <EmpFields f={edit} set={((k: string, v: string) => setEdit((x) => ({ ...x!, [k]: v }))) as never} sensitive={!!e.sensitive} withStatus />
          {edit["status"] === "ended" && <p className="rounded bg-warning/15 p-2 text-xs">إنهاء الخدمة لا يوقف حساب الدخول تلقائيًا؛ يصل تنبيه للمالك لمراجعة الحساب والعضويات.</p>}
          <div className="flex gap-2"><Button disabled={saveEmp.isPending} onClick={() => saveEmp.mutate(edit)}>{saveEmp.isPending ? "…" : "حفظ"}</Button><Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
        </div>
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {row("المسمى الوظيفي", e.job_title)}{row("تاريخ المباشرة", e.hire_date)}{row("الجوال", e.phone && <bdi dir="ltr">{e.phone}</bdi>)}{row("البريد", e.email && <bdi dir="ltr">{e.email}</bdi>)}
          {row("الجنس", e.gender ? GENDER[e.gender] : null)}{row("حساب الدخول", e.has_login ? (e.self_access ? "مرتبط ومفعّل" : "مرتبط — غير مفعّل") : "بلا حساب")}
          {row("رقم الهوية", e.national_id && <bdi dir="ltr">{e.national_id}</bdi>)}
          {e.sensitive && <>{row("الجنسية", e.nationality)}{row("تاريخ الميلاد", e.birth_date)}</>}
          {e.status === "ended" && row("انتهاء الخدمة", e.end_date)}
        </dl>
      )}
      <div>
        <div className="mb-2 flex items-center gap-2"><p className="flex-1 font-bold">التعيينات</p>{can_edit && !asg && <Button size="sm" variant="outline" onClick={() => setAsg({ id: "", school_id: "", category_id: "", job_title: e.job_title ?? "", department: "", manager_id: "", start_date: "", end_date: "" })}><Plus className="size-4" />تعيين جديد</Button>}</div>
        {asg && (
          <div className="mb-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label htmlFor="as-sch">المدرسة</Label><select id="as-sch" className={selectCls("mt-1 w-full")} value={asg["school_id"]} onChange={(ev) => setAsg({ ...asg, school_id: ev.target.value })}><option value="">اختر</option>{m.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><Label htmlFor="as-cat">التصنيف الوظيفي</Label><select id="as-cat" className={selectCls("mt-1 w-full")} value={asg["category_id"] ?? ""} onChange={(ev) => setAsg({ ...asg, category_id: ev.target.value })}><option value="">بلا تصنيف</option>{(cats.data ?? []).filter((c) => c.is_active || c.id === asg["category_id"]).map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (معطل)"}</option>)}</select></div>
            <div><Label htmlFor="as-job">الوظيفة في هذا التعيين</Label><Input id="as-job" className="mt-1" value={asg["job_title"]} onChange={(ev) => setAsg({ ...asg, job_title: ev.target.value })} /></div>
            <div><Label htmlFor="as-dep">القسم</Label><Input id="as-dep" className="mt-1" value={asg["department"]} onChange={(ev) => setAsg({ ...asg, department: ev.target.value })} /></div>
            <div><Label htmlFor="as-mgr">المدير المباشر</Label><select id="as-mgr" className={selectCls("mt-1 w-full")} value={asg["manager_id"]} onChange={(ev) => setAsg({ ...asg, manager_id: ev.target.value })}><option value="">بلا</option>{mgrs.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></div>
            <div><Label htmlFor="as-s">من</Label><Input id="as-s" type="date" className="mt-1" value={asg["start_date"]} onChange={(ev) => setAsg({ ...asg, start_date: ev.target.value })} /></div>
            <div><Label htmlFor="as-e">إلى (اختياري)</Label><Input id="as-e" type="date" className="mt-1" value={asg["end_date"]} onChange={(ev) => setAsg({ ...asg, end_date: ev.target.value })} /></div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button disabled={!asg["school_id"] || !asg["start_date"] || saveAsg.isPending} onClick={() => saveAsg.mutate(asg)}>{saveAsg.isPending ? "…" : "حفظ التعيين"}</Button><Button variant="ghost" onClick={() => setAsg(null)}>إلغاء</Button></div>
          </div>
        )}
        {!assignments.length ? <p className="text-sm text-muted-foreground">لا توجد تعيينات.</p> : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className={"flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm " + (a.active ? "" : "opacity-70")}>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.school}{a.is_primary && <span className="ms-2 rounded bg-secondary px-1.5 text-xs font-normal">أساسي</span>}{!a.active && <span className="ms-2 rounded bg-muted px-1.5 text-xs font-normal">منتهٍ</span>}</span>
                  <span className="block text-xs text-muted-foreground">{[a.category, a.job_title, a.department, a.manager && `المدير: ${a.manager}`, a.teacher && `سجل المعلم: ${a.teacher}`].filter(Boolean).join(" · ")}</span>
                  <span className="block text-xs text-muted-foreground"><bdi dir="ltr">{a.start_date}</bdi> ← {a.end_date ? <bdi dir="ltr">{a.end_date}</bdi> : "مستمر"}</span>
                </span>
                {can_edit && a.active && !asg && <Button size="sm" variant="ghost" onClick={() => setAsg({ id: a.id, school_id: a.school_id, category_id: a.category_id ?? "", job_title: a.job_title ?? "", department: a.department ?? "", manager_id: a.manager_id ?? "", start_date: a.start_date, end_date: a.end_date ?? "", ...(a.teacher_id ? { teacher_id: a.teacher_id } : {}) })}>تعديل / إنهاء</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {events && events.length > 0 && (
        <details className="rounded-lg border p-2 text-sm"><summary className="cursor-pointer font-semibold">سجل التغييرات ({events.length})</summary>
          <ul className="mt-2 space-y-1">{events.map((v, i) => <li key={i} className="text-xs"><bdi dir="ltr">{new Date(v.at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}</bdi> — {v.entity === "assignment" ? "تعيين: " : ""}{ACT[v.action] ?? v.action} — {v.by}{v.reason ? ` — السبب: ${v.reason}` : ""}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
