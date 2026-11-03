import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { PeoplePicker } from "@/components/people-picker";
import { canCreateTask } from "@/lib/roles";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { ExportButtons } from "@/components/list-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { FIELD_TYPES, FORM_STATUS, PRIORITY, REQ_STATUS, STAFF_ROLES, TASK_STATUS, isLead, Pill, useStaff, type Field } from "@/components/admin/shared";

export const Route = createFileRoute("/_authenticated/app/admin/")({
  head: () => ({ meta: [{ title: "الإدارة المدرسية | ركاز" }, { name: "description", content: "التكليفات والطلبات والنماذج والمناوبات والاجتماعات في المدرسة" }] }),
  component: Page,
});

type Ctx = AppContext & { schoolId: string };

function Page() {
  const { active } = useSession();
  if (active?.role === "org_owner" && !active.schoolId) return <OrgSummary orgId={active.orgId!} />;
  return <RequireSchool nav="admin">{(ctx) => <Admin ctx={ctx} />}</RequireSchool>;
}

function OrgSummary({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["adm-org", orgId],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_org_summary", { _org: orgId });
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <div>
      <PageHeader title="الإدارة المدرسية" desc="أعداد مجمعة لكل فرع دون محتوى التكليفات أو الطلبات." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد فروع" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right"><tr>{["الفرع", "تكليفات مفتوحة", "متأخرة", "منجزة (30 يومًا)", "طلبات مفتوحة", "طلبات مغلقة (30 يومًا)", "مناوبات الأسبوع", "نقص التغطية", "اجتماعات قادمة", "قرارات مفتوحة"].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{q.data.map((r) => (
              <tr key={r.school_id} className="border-t"><td className="p-3 font-medium">{r.school}</td><td className="p-3">{r.tasks_open}</td><td className="p-3">{r.tasks_overdue}</td><td className="p-3">{r.tasks_done_30d}</td><td className="p-3">{r.requests_open}</td><td className="p-3">{r.requests_closed_30d}</td><td className="p-3">{r.duties_week}</td><td className="p-3">{r.duty_gaps_week}</td><td className="p-3">{r.meetings_upcoming}</td><td className="p-3">{r.decisions_open}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Admin({ ctx }: { ctx: Ctx }) {
  const principal = ctx.role === "principal";
  const tabs = [["tasks", "التكليفات"], ["requests", "الطلبات"], ["new", "تقديم طلب"], ...(principal ? [["forms", "إعداد النماذج"]] : [])] as const;
  const [tab, setTab] = useState<string>("tasks");
  return (
    <div>
      <PageHeader eyebrow={ctx.schoolName} title="الإدارة المدرسية" desc="تكليفات الموظفين والطلبات الإدارية في مكان واحد." />
      <Summary school={ctx.schoolId} onPick={setTab} />
      <SectionLinks school={ctx.schoolId} lead={isLead(ctx.role)} />
      <div role="tablist" className="mb-4 flex flex-wrap gap-2 border-b pb-2">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      {tab === "tasks" && <Tasks ctx={ctx} />}
      {tab === "requests" && <Requests ctx={ctx} />}
      {tab === "new" && <NewRequest ctx={ctx} />}
      {tab === "forms" && principal && <Forms ctx={ctx} />}
    </div>
  );
}

function Summary({ school, onPick }: { school: string; onPick: (t: string) => void }) {
  const q = useQuery({
    queryKey: ["adm-summary", school],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_summary", { _school: school });
      if (error) throw error;
      return (data ?? {}) as Row;
    },
  });
  const s = q.data ?? {};
  const cards: [string, number | undefined, string][] = [
    ["تكليفات اليوم", s.tasks_today, "tasks"], ["تكليفات متأخرة", s.tasks_overdue, "tasks"], ["تحتاج إجراءً مني", s.tasks_needs_action, "tasks"],
    ["طلبات جديدة واردة", s.requests_new, "requests"], ["طلباتي المفتوحة", s.requests_open_mine, "requests"],
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map(([l, v, t]) => (
        <button key={l} onClick={() => onPick(t)} className="rounded-xl border bg-card p-4 text-right hover:border-primary">
          <p className="text-xs text-muted-foreground">{l}</p>
          <p className="mt-1 text-2xl font-bold">{q.isLoading ? "…" : (v ?? 0)}</p>
        </button>
      ))}
    </div>
  );
}

function SectionLinks({ school, lead }: { school: string; lead: boolean }) {
  const q = useQuery({ queryKey: ["adm-summary", school], queryFn: async () => ((await db.rpc("adm_summary", { _school: school })).data ?? {}) as Row });
  const s = q.data ?? {};
  const links = [
    { to: "/app/admin/duties", label: "المناوبات", hint: lead ? `نقص التغطية هذا الأسبوع: ${s.duty_gaps_week ?? 0} · طلبات اعتذار: ${s.duty_changes_open ?? 0}` : `مناوباتي اليوم: ${s.duties_today_mine ?? 0}` },
    { to: "/app/admin/meetings", label: "الاجتماعات والقرارات", hint: `اجتماعاتي القادمة: ${s.meetings_upcoming_mine ?? 0} · قراراتي المفتوحة: ${s.decisions_open_mine ?? 0}` },
    { to: "/app/admin/calendar", label: "تقويمي", hint: "التكليفات والمناوبات والاجتماعات والقرارات" },
  ] as const;
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-3">
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="rounded-xl border bg-card p-4 hover:border-primary">
          <p className="font-semibold">{l.label}</p><p className="mt-1 text-xs text-muted-foreground">{q.isLoading ? "…" : l.hint}</p>
        </Link>
      ))}
    </div>
  );
}

const PAGE = 25;
/** Exports cover every matching row: page through the list RPC (capped at 100 per call) until exhausted. */
async function fetchAll(call: (offset: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let o = 0; o < 20000; o += 100) {
    const { data, error } = await call(o);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

function Tasks({ ctx }: { ctx: Ctx }) {
  const lead = isLead(ctx.role);
  const [scope, setScope] = useState(lead ? "all" : "mine");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ["adm-tasks", ctx.schoolId, scope, status, priority, q, page],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_task_list", { _school: ctx.schoolId, _scope: scope, _q: q.trim() || null, _status: status || null, _priority: priority || null, _assignee: null, _dept: null, _from: null, _to: null, _limit: PAGE, _offset: page * PAGE });
      if (error) throw error;
      return data as Row[];
    },
  });
  const total = Number(list.data?.[0]?.total ?? 0);
  const sel = selectCls("", true);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="بحث في التكليفات" placeholder="بحث بالعنوان أو الوصف" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-9 w-56" />
        <select aria-label="النطاق" className={sel} value={scope} onChange={(e) => { setScope(e.target.value); setPage(0); }}>
          <option value="mine">المسندة إليّ</option>{lead && <option value="created">التي أنشأتها</option>}<option value="all">كل ما أستطيع رؤيته</option>
        </select>
        <select aria-label="الحالة" className={sel} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">كل الحالات</option><option value="open">المفتوحة</option><option value="needs_action">تحتاج إجراءً</option><option value="today">مستحقة اليوم</option><option value="overdue">متأخرة</option>
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="الأولوية" className={sel} value={priority} onChange={(e) => { setPriority(e.target.value); setPage(0); }}>
          <option value="">كل الأولويات</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="ms-auto flex gap-2">
          <ExportButtons title="التكليفات" school={ctx.schoolName} headers={["العنوان", "المسؤول", "المكلِّف", "الحالة", "الأولوية", "الاستحقاق", "التقدم"]}
            filters={[scope === "all" ? "كل ما أستطيع رؤيته" : scope === "mine" ? "المسندة إليّ" : "التي أنشأتها", status ? `الحالة: ${TASK_STATUS[status] ?? (status === "open" ? "المفتوحة" : status)}` : "كل الحالات", ...(priority ? [`الأولوية: ${PRIORITY[priority]}`] : []), ...(q.trim() ? [`بحث: ${q.trim()}`] : []), "قائمة ملخصة بلا مرفقات؛ إثبات الإنجاز والملحق بعد الإنجاز يُعرضان منفصلين في صفحة التكليف"]}
            rows={async () => {
              const data = await fetchAll((o) => db.rpc("adm_task_list", { _school: ctx.schoolId, _scope: scope, _q: q.trim() || null, _status: status || null, _priority: priority || null, _assignee: null, _dept: null, _from: null, _to: null, _limit: 100, _offset: o }));
              return data.map((t) => [t.title, t.assignee_name, t.assigner_name, TASK_STATUS[t.status], PRIORITY[t.priority], t.due_date, `${t.progress}%`]);
            }} />
          {canCreateTask(ctx.role) && <Button size="sm" onClick={() => setCreating((v) => !v)}>{creating ? "إغلاق" : "تكليف جديد"}</Button>}
        </div>
      </div>
      {creating && <NewTask ctx={ctx} onDone={() => setCreating(false)} />}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.length ? <EmptyState title="لا توجد تكليفات" hint={canCreateTask(ctx.role) ? "أنشئ تكليفًا من الزر أعلاه." : "ستظهر هنا التكليفات المسندة إليك."} /> : (
        <ul className="space-y-2">
          {list.data.map((t) => (
            <li key={t.id}>
              <Link to="/app/admin/tasks/$id" params={{ id: t.id }} className="block rounded-xl border bg-card p-4 hover:border-primary">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.title}</span>
                  <Pill tone={t.status === "done" ? "ok" : t.status === "cancelled" ? "muted" : "warn"}>{TASK_STATUS[t.status]}</Pill>
                  {t.overdue && <Pill tone="bad">متأخر</Pill>}
                  {t.needs_me && <Pill tone="warn">يحتاج إجراءً منك</Pill>}
                  {t.blocked && <Pill tone="bad">عائق</Pill>}
                  {t.priority === "high" && <Pill tone="bad">أولوية عالية</Pill>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">المسؤول: {t.assignee_name} · المكلِّف: {t.assigner_name}{t.department ? ` · ${t.department}` : ""} · الاستحقاق {t.due_date} · التقدم {t.progress}%</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={total} setPage={setPage} />
    </div>
  );
}

function Pager({ page, total, setPage }: { page: number; total: number; setPage: (n: number) => void }) {
  if (total <= PAGE) return null;
  const last = Math.ceil(total / PAGE) - 1;
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
      <span>صفحة {page + 1} من {last + 1} ({total})</span>
      <Button size="sm" variant="outline" disabled={page >= last} onClick={() => setPage(page + 1)}>التالي</Button>
    </div>
  );
}

function NewTask({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const qc = useQueryClient();
  const [clientId] = useState(() => crypto.randomUUID());
  const [d, setD] = useState({ title: "", description: "", assignee: "", due_date: "", priority: "normal", proof_required: "", needs_confirmation: false, participants: [] as string[] });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!d.title.trim() || !d.assignee || !d.due_date) return void toast.error("أكمل العنوان والمسؤول وتاريخ الاستحقاق");
    setBusy(true);
    const { error } = await db.rpc("adm_create_task", { _school: ctx.schoolId, _d: d, _client: clientId });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("أُرسل التكليف وأُشعر المسؤول");
    qc.invalidateQueries({ queryKey: ["adm-tasks"] });
    qc.invalidateQueries({ queryKey: ["adm-summary"] });
    onDone();
  }
  const sel = selectCls("w-full");
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2">
      <div className="md:col-span-2"><Label htmlFor="t-title">العنوان</Label><Input id="t-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></div>
      <div className="md:col-span-2"><Label htmlFor="t-desc">الوصف</Label><Textarea id="t-desc" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
      <div className="md:col-span-2"><Label>المسؤول الأساسي</Label>
        <PeoplePicker purpose="task" school={ctx.schoolId} label="المسؤول الأساسي" single compact value={d.assignee ? [d.assignee] : []} onChange={(v) => setD({ ...d, assignee: v[0] ?? "", participants: d.participants.filter((x) => x !== v[0]) })} />
      </div>
      <div><Label htmlFor="t-due">تاريخ الاستحقاق</Label><Input id="t-due" type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} /></div>
      <div><Label htmlFor="t-pr">الأولوية</Label>
        <select id="t-pr" className={sel} value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div><Label htmlFor="t-proof">الإثبات المطلوب (اختياري)</Label><Input id="t-proof" value={d.proof_required} onChange={(e) => setD({ ...d, proof_required: e.target.value })} /></div>
      <div className="md:col-span-2"><Label>مشاركون (اختياري)</Label>
        <PeoplePicker purpose="task" school={ctx.schoolId} label="المشاركون" compact exclude={d.assignee ? [d.assignee] : []} value={d.participants} onChange={(v) => setD({ ...d, participants: v })} />
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={d.needs_confirmation} onChange={(e) => setD({ ...d, needs_confirmation: e.target.checked })} />يتطلب تأكيد الإنجاز مني</label>
      <div className="md:col-span-2"><Button onClick={save} disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال التكليف"}</Button></div>
    </div>
  );
}

function Requests({ ctx }: { ctx: Ctx }) {
  const [scope, setScope] = useState(ctx.role === "principal" ? "all" : "mine");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const list = useQuery({
    queryKey: ["adm-requests", ctx.schoolId, scope, status, q, page],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_request_list", { _school: ctx.schoolId, _scope: scope, _q: q.trim() || null, _status: status || null, _form: null, _limit: PAGE, _offset: page * PAGE });
      if (error) throw error;
      return data as Row[];
    },
  });
  const total = Number(list.data?.[0]?.total ?? 0);
  const sel = selectCls("", true);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="بحث في الطلبات" placeholder="بحث باسم النموذج" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-9 w-56" />
        <select aria-label="النطاق" className={sel} value={scope} onChange={(e) => { setScope(e.target.value); setPage(0); }}>
          <option value="mine">طلباتي</option><option value="handling">الواردة إليّ</option><option value="all">الكل</option>
        </select>
        <select aria-label="الحالة" className={sel} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">كل الحالات</option><option value="open">المفتوحة</option>{Object.entries(REQ_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="ms-auto"><ExportButtons title="الطلبات الإدارية" school={ctx.schoolName} headers={["النموذج", "الإصدار", "مقدم الطلب", "المسؤول", "الحالة", "تاريخ التقديم"]}
          filters={[scope === "all" ? "الكل" : scope === "mine" ? "طلباتي" : "الواردة إليّ", status ? `الحالة: ${REQ_STATUS[status] ?? "المفتوحة"}` : "كل الحالات", ...(q.trim() ? [`بحث: ${q.trim()}`] : []), "قائمة ملخصة بلا مرفقات أو روابط ملفات"]}
          rows={async () => {
            const data = await fetchAll((o) => db.rpc("adm_request_list", { _school: ctx.schoolId, _scope: scope, _q: q.trim() || null, _status: status || null, _form: null, _limit: 100, _offset: o }));
            return data.map((r) => [r.form_name, `إصدار ${r.form_version}`, r.submitted_by, r.handler, REQ_STATUS[r.status], r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) : ""]);
          }} /></div>
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.length ? <EmptyState title="لا توجد طلبات" /> : (
        <ul className="space-y-2">
          {list.data.map((r) => (
            <li key={r.id}>
              <Link to="/app/admin/requests/$id" params={{ id: r.id }} className="block rounded-xl border bg-card p-4 hover:border-primary">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.form_name}</span><span className="text-xs text-muted-foreground">إصدار {r.form_version}</span>
                  <Pill tone={r.status === "completed" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{REQ_STATUS[r.status]}</Pill>
                  {r.handling && ["submitted", "in_progress"].includes(r.status) && <Pill tone="warn">بانتظار معالجتك</Pill>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">مقدم الطلب: {r.submitted_by} · المسؤول: {r.handler}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={total} setPage={setPage} />
    </div>
  );
}

function NewRequest({ ctx }: { ctx: Ctx }) {
  const forms = useQuery({
    queryKey: ["adm-forms-active", ctx.schoolId, ctx.role],
    queryFn: async () => {
      const { data, error } = await db.from("adm_forms").select("id, name, description, version, audience").eq("school_id", ctx.schoolId).eq("status", "active").order("name");
      if (error) throw error;
      return (data as Row[]).filter((f) => f.audience.includes(ctx.role));
    },
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function start(id: string) {
    setBusy(id);
    const { data, error } = await db.rpc("adm_save_request", { _id: null, _form: id, _answers: {}, _rev: null });
    setBusy(null);
    if (error) return void toast.error(arabicError(error));
    qc.invalidateQueries({ queryKey: ["adm-requests"] });
    window.location.assign(`/app/admin/requests/${data.id}`);
  }
  if (forms.isLoading) return <LoadingState />;
  if (forms.error) return <ErrorState message={arabicError(forms.error)} />;
  if (!forms.data?.length) return <EmptyState title="لا توجد نماذج متاحة لك" hint="يفعّل مدير المدرسة النماذج ويحدد من يستطيع استخدامها." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {forms.data.map((f) => (
        <div key={f.id} className="rounded-xl border bg-card p-4">
          <p className="font-semibold">{f.name}</p>
          {f.description && <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>}
          <Button size="sm" className="mt-3" disabled={busy === f.id} onClick={() => start(f.id)}>بدء طلب</Button>
        </div>
      ))}
    </div>
  );
}

function Forms({ ctx }: { ctx: Ctx }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const list = useQuery({
    queryKey: ["adm-forms", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("adm_forms").select("*").eq("school_id", ctx.schoolId).order("name").order("version", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  async function setStatus(id: string, s: string) {
    const { error } = await db.rpc("adm_set_form_status", { _id: id, _status: s });
    if (error) return void toast.error(arabicError(error));
    toast.success(s === "active" ? "فُعّل النموذج" : "أُرشف النموذج");
    qc.invalidateQueries({ queryKey: ["adm-forms"] });
  }
  if (editing) return <FormEditor ctx={ctx} form={editing} onClose={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setEditing({})}>نموذج جديد</Button>
      {list.isLoading ? <LoadingState /> : !list.data?.length ? <EmptyState title="لا توجد نماذج" hint="أنشئ نموذجًا وحدد حقوله ومن يستقبله." /> : (
        <ul className="space-y-2">
          {list.data.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
              <span className="font-semibold">{f.name}</span><span className="text-xs text-muted-foreground">إصدار {f.version}</span>
              <Pill tone={f.status === "active" ? "ok" : "muted"}>{FORM_STATUS[f.status]}</Pill>
              <span className="text-xs text-muted-foreground">{(f.audience as string[]).map((a) => STAFF_ROLES[a] ?? a).join("، ")}</span>
              <div className="ms-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(f)}>{f.status === "draft" ? "تعديل" : "إصدار جديد"}</Button>
                {f.status !== "active" && <Button size="sm" variant="outline" onClick={() => setStatus(f.id, "active")}>تفعيل</Button>}
                {f.status === "active" && <Button size="sm" variant="outline" onClick={() => setStatus(f.id, "archived")}>أرشفة</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormEditor({ ctx, form, onClose }: { ctx: Ctx; form: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const staff = useStaff(ctx.schoolId);
  const [d, setD] = useState({
    name: form.name ?? "", description: form.description ?? "", purpose: form.purpose ?? "", handler_user: form.handler_user ?? "",
    audience: (form.audience as string[]) ?? ["teacher"],
    allow_files: (form.allow_files as boolean | undefined) ?? true,
    fields: ((form.fields as Field[]) ?? [{ label: "", type: "text", required: true, options: [] }]).map((f) => ({ ...f, options: f.options ?? [] })),
  });
  const [busy, setBusy] = useState(false);
  const setField = (i: number, p: Partial<Field>) => setD({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  async function save() {
    setBusy(true);
    const { error } = await db.rpc("adm_save_form", { _id: form.id ?? null, _school: ctx.schoolId, _d: d });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(form.id && form.status !== "draft" ? "أُنشئ إصدار جديد كمسودة" : "حُفظ النموذج");
    qc.invalidateQueries({ queryKey: ["adm-forms"] });
    onClose();
  }
  const sel = selectCls("w-full");
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      {form.id && form.status !== "draft" && <p className="rounded-lg bg-accent p-2 text-sm">النموذج مفعل؛ الحفظ ينشئ إصدارًا جديدًا ولا يغيّر الطلبات السابقة.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label htmlFor="f-name">اسم النموذج</Label><Input id="f-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div><Label htmlFor="f-h">المسؤول عن الاستقبال</Label>
          <select id="f-h" className={sel} value={d.handler_user} onChange={(e) => setD({ ...d, handler_user: e.target.value })}>
            <option value="">اختر موظفًا</option>{staff.data?.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name} — {STAFF_ROLES[s.role] ?? s.role}</option>)}
          </select>
        </div>
        <div className="md:col-span-2"><Label htmlFor="f-d">الوصف</Label><Textarea id="f-d" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
      </div>
      <div><Label>من يستطيع التقديم</Label>
        <div className="mt-1 flex flex-wrap gap-2">{Object.entries(STAFF_ROLES).map(([k, v]) => (
          <label key={k} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"><input type="checkbox" checked={d.audience.includes(k)} onChange={(e) => setD({ ...d, audience: e.target.checked ? [...d.audience, k] : d.audience.filter((x) => x !== k) })} />{v}</label>
        ))}</div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.allow_files} onChange={(e) => setD({ ...d, allow_files: e.target.checked })} />السماح بإرفاق ملفات مع الطلب</label>
      <div className="space-y-2"><Label>الحقول</Label>
        {d.fields.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <Input aria-label={`اسم الحقل ${i + 1}`} placeholder="اسم الحقل" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} className="h-9 w-48" />
            <select aria-label="نوع الحقل" className={selectCls("", true)} value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>{Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {f.type === "choice" && <Input aria-label="الخيارات" placeholder="الخيارات مفصولة بفاصلة" value={f.options.join("،")} onChange={(e) => setField(i, { options: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} className="h-9 w-56" />}
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />إلزامي</label>
            <Button size="sm" variant="ghost" onClick={() => setD({ ...d, fields: d.fields.filter((_, j) => j !== i) })}>حذف</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setD({ ...d, fields: [...d.fields, { label: "", type: "text", required: false, options: [] }] })}>إضافة حقل</Button>
      </div>
      <div className="flex gap-2"><Button onClick={save} disabled={busy}>حفظ</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>
    </div>
  );
}
