import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Download, FileText, Plus, Search } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { FileList, Uploader } from "@/components/homework/files";
import { Pill, fmt, fetchAllRows } from "@/components/admin/shared";
import { arabicError, type AppContext } from "@/lib/session";
import { ROLE_LABELS, SUPPORT_TAB_LABELS, type Role, type SupportTab } from "@/lib/roles";
import { exportPdf, exportXlsx } from "@/lib/export";
import { InternalPanel, ManagePanel } from "@/components/support/handling";
import { InternalTicket } from "@/components/support/internal-ticket";
import { FollowersPanel } from "@/components/support/followers";
import type { Branch, SupportCaps } from "@/components/support/caps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export const STATUS: Record<string, string> = {
  new: "جديدة", in_progress: "قيد المعالجة", waiting_requester: "بانتظار مقدم الطلب", waiting_internal: "بانتظار جهة داخلية",
  resolved: "تم الحل", closed: "مغلقة", cancelled: "ملغاة",
};
export const PRIO: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة" };
const TONE: Record<string, "muted" | "warn" | "ok" | "bad"> = { new: "warn", in_progress: "ok", waiting_requester: "warn", waiting_internal: "warn", resolved: "ok", closed: "muted", cancelled: "muted" };
const ACT: Record<string, string> = {
  created: "أُنشئت التذكرة", reply: "رد", reply_edited: "تصحيح رد", claim: "استلام", in_progress: "قيد المعالجة", waiting_requester: "طلب معلومات من مقدم الطلب",
  waiting_internal: "بانتظار جهة داخلية", priority: "تغيير الأولوية", category: "تغيير التصنيف", resolve: "حل", confirm: "تأكيد الحل وإغلاق", close: "إغلاق",
  reopen: "إعادة فتح", cancel: "إلغاء", file_added: "إرفاق ملف",
  assign: "إسناد المعالجة", department: "تغيير القسم الموجّه إليه", transfer: "تحويل إلى فرع آخر", escalated: "تصعيد إلى دعم المنصة", note_private: "ملاحظة خاصة", note_team: "ملاحظة الفريق",
  info_requested: "طلب إفادة", info_answered: "وصول إفادة", info_cancelled: "إلغاء طلب إفادة", follower_added: "إضافة متابع", follower_removed: "إزالة متابع", sla_breach: "تنبيه تأخير",
};
export const DEFAULT_SLA: Record<string, { response: number; resolve: number }> = { urgent: { response: 2, resolve: 8 }, high: { response: 4, resolve: 24 }, normal: { response: 8, resolve: 40 }, low: { response: 24, resolve: 80 } };
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const isOverdue = (t: Row) => !["resolved", "closed", "cancelled", "waiting_requester"].includes(t.status) && ((!t.first_response_at && t.response_due && new Date(t.response_due) < new Date()) || (t.resolve_due && new Date(t.resolve_due) < new Date()));
export const TAB_LABEL: Record<SupportTab, string> = SUPPORT_TAB_LABELS;
const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r;
const PAGE = 20;

type Ctx = AppContext;

export function useCategories(scope: "school" | "platform", orgId: string | null) {
  return useQuery({
    queryKey: ["support-cats", scope, orgId],
    queryFn: async () => {
      let q = db.from("support_categories").select("id, name, is_active, org_id").order("sort").order("name");
      q = scope === "platform" ? q.is("org_id", null) : q.eq("org_id", orgId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Row[];
    },
  });
}

function useSettings(orgId: string | null) {
  return useQuery({
    queryKey: ["support-settings", orgId],
    queryFn: async () => {
      let q = db.from("support_settings").select("work_hours, response_note, reopen_days, sla, work_days, work_start, work_end, escalate_to");
      q = orgId ? q.eq("org_id", orgId) : q.is("org_id", null);
      const { data } = await q.maybeSingle();
      return (data ?? { work_hours: "الأحد–الخميس، 7:00 ص – 3:00 م", response_note: "نرد عادة خلال يوم عمل واحد.", reopen_days: 7, sla: DEFAULT_SLA, work_days: [0, 1, 2, 3, 4], work_start: "07:00:00", work_end: "15:00:00", escalate_to: null }) as Row;
    },
  });
}

export function HoursNote({ orgId }: { orgId: string | null }) {
  const s = useSettings(orgId);
  if (!s.data) return null;
  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <p>استقبال التذاكر متاح على مدار الساعة. <span className="text-muted-foreground">ساعات عمل فريق الدعم: {s.data.work_hours}.</span></p>
      <p className="text-muted-foreground">{s.data.response_note} الرد ليس فوريًا.</p>
    </div>
  );
}

/* ---------------- list ---------------- */
export { InfoInbox } from "@/components/support/handling";

export function TicketList({ ctx, box, onOpen, initialStatus, caps }: { ctx: Ctx; box: SupportTab; onOpen: (id: string) => void; initialStatus?: string | undefined; caps?: SupportCaps }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus ?? "");
  const [prio, setPrio] = useState("");
  const [cat, setCat] = useState("");
  const [school, setSchool] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dept, setDept] = useState("");
  const [page, setPage] = useState(0);
  const platform = ctx.role === "platform_admin";
  // branches come from support.view (support_caps); one branch → fixed, several → a branch filter
  const viewBranches = caps?.view ?? [];
  const owner = box === "manage" && !platform && viewBranches.length > 1;
  const scopeSchool = box === "manage" && !platform && !owner ? (viewBranches[0]?.id ?? ctx.schoolId) : null;
  const branches = { data: viewBranches as Row[] };
  const exportNames = new Set((caps?.export ?? []).map((b) => b.name));
  const canExport = box === "manage" && (platform || exportNames.size > 0);
  const cats = useCategories(ctx.role === "platform_admin" ? "platform" : "school", ctx.orgId);
  const assignees = useQuery({
    enabled: box === "manage",
    queryKey: ["support-assignees", ctx.key, scopeSchool],
    queryFn: async () => ((await db.rpc("support_assignees", { _school: scopeSchool })).data ?? []) as Row[],
  });
  const depts = useQuery({
    enabled: box === "manage",
    queryKey: ["support-dept-options", ctx.key, school || scopeSchool],
    queryFn: async () => ((await db.rpc("support_dept_options" as never, { _school: school || scopeSchool || null } as never)).data ?? []) as unknown as Row[],
  });
  useEffect(() => setPage(0), [q, status, prio, cat, school, from, to, box, assignee, dept]);
  const args = (offset: number, limit = PAGE) => ({
    _box: box, _school: school || scopeSchool || null, _q: q.trim() || null, _status: status || null, _priority: prio || null,
    _category: cat || null, _from: from || null, _to: to || null, _limit: limit, _offset: offset, _assignee: assignee || null, _dept: dept || null,
  });
  const list = useQuery({
    queryKey: ["support-list", box, ctx.key, q, status, prio, cat, school, from, to, assignee, dept, page],
    queryFn: async () => {
      const { data, error } = await db.rpc("support_list", args(page * PAGE));
      if (error) throw error;
      return data as Row[];
    },
  });
  const rows = list.data ?? [];
  const total = Number(rows[0]?.total ?? 0);

  async function doExport(kind: "xlsx" | "pdf") {
    try {
      const all = (await fetchAllRows((o) => db.rpc("support_list", args(o, 100)))).filter((r) => platform || caps?.owner || exportNames.has(r.school_name));
      const headers = ["الرقم", "العنوان", "الحالة", "الأولوية", "التصنيف", "الفرع", "القسم", "مقدم الطلب", "الصفة", "المسؤول", "الإنشاء", "آخر تحديث", "موعد الحل", "متأخرة"];
      const data = all.map((r) => [r.ref, r.title, STATUS[r.status], PRIO[r.priority], r.category, r.school_name, r.department_name ?? "", r.requester_name, roleLabel(r.requester_role), r.assignee_name, fmt(r.created_at), fmt(r.updated_at), r.resolve_due ? fmt(r.resolve_due) : "", r.overdue ? "نعم" : ""]);
      const filters = [q && `بحث: ${q}`, status && `الحالة: ${STATUS[status] ?? "مفتوحة"}`, prio && `الأولوية: ${PRIO[prio]}`, from && `من ${from}`, to && `إلى ${to}`].filter(Boolean) as string[];
      const meta = { title: `تذاكر الدعم — ${TAB_LABEL[box]}`, school: ctx.schoolName, filters };
      if (kind === "xlsx") exportXlsx(meta, headers, data); else await exportPdf(meta, headers, data);
    } catch (e) { toast.error(arabicError(e)); }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="بحث" className="pr-9" placeholder="ابحث برقم التذكرة أو العنوان" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="الحالة" className={selectCls()} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option><option value="open">المفتوحة فقط</option>{box !== "mine" && <><option value="overdue">المتأخرة فقط</option><option value="unassigned">بلا مسؤول</option><option value="waiting">بانتظار رد</option><option value="done">المحلولة والمغلقة</option></>}
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="الأولوية" className={selectCls()} value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="">كل الأولويات</option>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="التصنيف" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">كل التصنيفات</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {owner && (
          <select aria-label="الفرع" className={selectCls()} value={school} onChange={(e) => { setSchool(e.target.value); setDept(""); }}>
            <option value="">كل الفروع</option>{(branches.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {box === "manage" && (
          <select aria-label="المسؤول" className={selectCls()} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">كل المسؤولين</option>{(assignees.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name ?? "—"}</option>)}
          </select>
        )}
        {box === "manage" && (
          <select aria-label="القسم" className={selectCls()} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">كل الأقسام</option>{(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}{owner && !school ? ` — ${d.school_name}` : ""}</option>)}
          </select>
        )}
        <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {canExport && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => doExport("xlsx")}><Download className="size-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => doExport("pdf")}><FileText className="size-4" /> PDF</Button>
        </div>
      )}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !rows.length ? (
        <EmptyState title="لا توجد تذاكر" hint={box === "mine" ? "أنشئ تذكرة جديدة عند حاجتك للمساعدة." : "لا توجد تذاكر مطابقة في نطاقك."} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.id}>
              <button onClick={() => onOpen(r.id)} className="flex w-full flex-col gap-1 p-3 text-start hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{r.ref}</span>
                  <span className="font-semibold">{r.title}</span>
                  <Pill tone={TONE[r.status] ?? "muted"}>{STATUS[r.status]}</Pill>
                  {(r.priority === "high" || r.priority === "urgent") && <Pill tone="bad">{PRIO[r.priority]}</Pill>}
                  {r.scope === "platform" && <Pill>دعم المنصة</Pill>}
                  {r.overdue && <Pill tone="bad">متأخرة</Pill>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {box !== "mine" && <>{r.requester_name ?? "—"} ({roleLabel(r.requester_role)}) · {r.school_name} · </>}
                  {r.department_name ? <>القسم: {r.department_name} · </> : null}{r.category ?? "بلا تصنيف"} · المسؤول: {r.assignee_name ?? "لم يُستلم بعد"} · آخر تحديث {fmt(r.updated_at)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} من {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>التالي</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- create ---------------- */
export function NewTicket({ ctx, onDone, onCancel, internal = false, branches = [] }: { ctx: Ctx; onDone: (id: string) => void; onCancel: () => void; internal?: boolean; branches?: Branch[] }) {
  const [mode, setMode] = useState<"internal" | "own">(internal ? "internal" : "own");
  if (mode === "internal") return <InternalTicket ctx={ctx} branches={branches} onDone={onDone} onCancel={onCancel} onOwn={() => setMode("own")} />;
  return <OwnTicket ctx={ctx} onDone={onDone} onCancel={onCancel} onInternal={internal ? () => setMode("internal") : undefined} />;
}

function OwnTicket({ ctx, onDone, onCancel, onInternal }: { ctx: Ctx; onDone: (id: string) => void; onCancel: () => void; onInternal?: (() => void) | undefined }) {
  const canPlatform = ctx.role === "org_owner" || ctx.role === "principal";
  const [scope, setScope] = useState<"school" | "platform">(ctx.role === "org_owner" ? "platform" : "school");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [prio, setPrio] = useState("normal");
  const [cat, setCat] = useState("");
  const [student, setStudent] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useMemo(() => crypto.randomUUID(), []);
  const cats = useCategories(scope, ctx.orgId);
  const kids = useQuery({
    enabled: ctx.role === "guardian",
    queryKey: ["support-kids", ctx.schoolId],
    queryFn: async () => ((await db.rpc("support_my_children", { _school: ctx.schoolId })).data ?? []) as Row[],
  });
  async function submit() {
    if (!ctx.schoolId) return void toast.error("اختر مدرسة من شريط السياق أولًا");
    setBusy(true);
    const { data, error } = await db.rpc("support_create", { _scope: scope, _school: ctx.schoolId, _title: title, _body: body, _priority: prio, _category: cat || null, _student: student || null, _client_key: key });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("أُرسلت التذكرة");
    onDone(data as string);
  }
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-semibold">تذكرة جديدة</p>{onInternal && <Button size="sm" variant="outline" onClick={onInternal}>تذكرة داخلية لفرع</Button>}</div>
      {canPlatform && (
        <div className="space-y-1">
          <Label htmlFor="sp-scope">الجهة</Label>
          <select id="sp-scope" className={selectCls()} value={scope} onChange={(e) => { setScope(e.target.value as "school" | "platform"); setCat(""); }}>
            {ctx.role !== "org_owner" && <option value="school">دعم المدرسة (داخلي)</option>}
            <option value="platform">دعم منصة ركاز</option>
          </select>
        </div>
      )}
      <div className="space-y-1"><Label htmlFor="sp-title">العنوان</Label><Input id="sp-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="sp-body">الوصف</Label><Textarea id="sp-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="sp-cat">التصنيف</Label>
          <select id="sp-cat" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">بدون</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label htmlFor="sp-prio">الأولوية</Label>
          <select id="sp-prio" className={selectCls()} value={prio} onChange={(e) => setPrio(e.target.value)}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </div>
      {ctx.role === "guardian" && (
        <div className="space-y-1"><Label htmlFor="sp-kid">الابن المعني (اختياري)</Label>
          <select id="sp-kid" className={selectCls()} value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">لا يخص ابنًا محددًا</option>{(kids.data ?? []).map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}
          </select>
        </div>
      )}
      <p className="text-xs text-muted-foreground">يمكنك إرفاق ملفات بعد إنشاء التذكرة من صفحة تفاصيلها.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={submit}>إرسال التذكرة</Button>
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}

/* ---------------- detail ---------------- */
export function TicketDetail({ id, ctx, userId, onBack }: { id: string; ctx: Ctx; userId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["support-ticket", id],
    retry: false,
    queryFn: async () => { const { data, error } = await db.rpc("support_get", { _ticket: id }); if (error) throw error; return data as Row; },
  });
  const files = useQuery({
    queryKey: ["support-files", id],
    queryFn: async () => ((await db.rpc("support_files", { _ticket: id })).data ?? []) as Row[],
  });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const cats = useCategories(q.data?.ticket?.scope ?? "school", q.data?.ticket?.org_id ?? null);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <div className="space-y-3"><Button variant="ghost" onClick={onBack}><ArrowRight className="size-4" /> رجوع</Button><ErrorState message={arabicError(q.error)} /></div>;
  const d = q.data, t = d.ticket, can = d.can;
  const open = !["closed", "cancelled"].includes(t.status);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["support-ticket", id] }); qc.invalidateQueries({ queryKey: ["support-list"] }); files.refetch(); };

  async function act(action: string, opts: { reason?: string; reasonPrompt?: string; value?: string; confirm?: string } = {}) {
    let reason = opts.reason ?? null;
    if (opts.reasonPrompt) { reason = await askText(opts.reasonPrompt, { required: true }); if (!reason) return; }
    if (opts.confirm && !(await ask(opts.confirm))) return;
    const { error } = await db.rpc("support_action", { _ticket: id, _action: action, _rev: t.rev, _reason: reason, _value: opts.value || null });
    if (error) toast.error(arabicError(error)); else toast.success("تم");
    refresh();
  }
  async function send() {
    setBusy(true);
    const { error } = await db.rpc("support_reply", { _ticket: id, _body: reply, _client_key: key });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    setReply(""); setKey(crypto.randomUUID()); refresh();
  }
  async function edit(m: Row) {
    const body = await askText("النص المصحح للرد", { required: true });
    if (!body) return;
    const reason = await askText("سبب التصحيح (يبقى موثقًا)", { required: true });
    if (!reason) return;
    const { error } = await db.rpc("support_edit_message", { _message: m.id, _body: body, _reason: reason });
    if (error) toast.error(arabicError(error)); refresh();
  }
  async function history(m: Row) {
    const { data } = await db.rpc("support_message_history", { _message: m.id });
    const lines = ((data ?? []) as Row[]).map((r) => `${fmt(r.created_at)} — السبب: ${r.reason}\nالنص السابق: ${r.old_body}`).join("\n\n");
    await ask(lines || "لا توجد تصحيحات", { ok: "حسنًا" });
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}><ArrowRight className="size-4" /> كل التذاكر</Button>
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">{t.ref}</span>
          <h2 className="text-lg font-bold">{t.title}</h2>
          <Pill tone={TONE[t.status] ?? "muted"}>{STATUS[t.status]}</Pill>
          <Pill tone={t.priority === "urgent" || t.priority === "high" ? "bad" : "muted"}>{PRIO[t.priority]}</Pill>
          {t.scope === "platform" && <Pill>دعم المنصة</Pill>}
          {can.handle && isOverdue(t) && <Pill tone="bad">متأخرة</Pill>}
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted-foreground">مقدم الطلب: </dt><dd className="inline">{t.requester_name ?? "—"} ({roleLabel(t.requester_role)})</dd></div>
          <div><dt className="inline text-muted-foreground">الفرع: </dt><dd className="inline">{t.school_name}</dd></div>
          <div><dt className="inline text-muted-foreground">التصنيف: </dt><dd className="inline">{t.category ?? "بلا تصنيف"}</dd></div>
          <div><dt className="inline text-muted-foreground">المسؤول الحالي: </dt><dd className="inline">{t.assignee_name ?? "لم يُستلم بعد"}</dd></div>
          {t.linked && <div><dt className="inline text-muted-foreground">تصعيد من: </dt><dd className="inline font-mono" dir="ltr">{t.linked.ref}</dd></div>}
          {t.student_name && <div><dt className="inline text-muted-foreground">الابن المعني: </dt><dd className="inline">{t.student_name}</dd></div>}
          <div><dt className="inline text-muted-foreground">الإنشاء: </dt><dd className="inline">{fmt(t.created_at)}</dd></div>
          <div><dt className="inline text-muted-foreground">آخر تحديث: </dt><dd className="inline">{fmt(t.updated_at)}</dd></div>
          {t.resolved_at && <div><dt className="inline text-muted-foreground">الحل: </dt><dd className="inline">{fmt(t.resolved_at)}</dd></div>}
          {t.closed_at && <div><dt className="inline text-muted-foreground">الإغلاق: </dt><dd className="inline">{fmt(t.closed_at)}</dd></div>}
          {can.handle && t.response_due && !t.first_response_at && <div><dt className="inline text-muted-foreground">موعد الرد الأول: </dt><dd className="inline">{fmt(t.response_due)}</dd></div>}
          {can.handle && t.resolve_due && !["resolved", "closed", "cancelled"].includes(t.status) && <div><dt className="inline text-muted-foreground">موعد الحل المستهدف: </dt><dd className="inline">{fmt(t.resolve_due)}</dd></div>}
          {t.rating && <div><dt className="inline text-muted-foreground">التقييم: </dt><dd className="inline">{t.rating} / 5</dd></div>}
        </dl>
        <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{t.body}</p>
        {t.resolution && <p className="rounded-lg border border-primary/30 p-3 text-sm"><span className="font-semibold">طريقة الحل: </span>{t.resolution}</p>}
      </div>

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        {can.assign && ["new", "waiting_internal", "in_progress"].includes(t.status) && t.assignee !== userId && <Button size="sm" onClick={() => act("claim")}>استلام التذكرة</Button>}
        {can.handle && open && t.status !== "resolved" && <>
          <Button size="sm" variant="outline" onClick={() => act("waiting_requester", { confirm: "تحويل الحالة إلى «بانتظار مقدم الطلب»؟ اكتب سؤالك في الرد." })}>طلب معلومات</Button>
          <Button size="sm" variant="outline" onClick={() => act("waiting_internal")}>بانتظار جهة داخلية</Button>
          <Button size="sm" onClick={() => act("resolve", { reasonPrompt: "اكتب طريقة الحل" })}>حل التذكرة</Button>
        </>}
        {can.requester && t.status === "resolved" && <Button size="sm" onClick={async () => {
          const r = await askText("قيّم المعالجة من 1 إلى 5 (اختياري)");
          act("confirm", { ...(r && /^[1-5]$/.test(r.trim()) ? { value: r.trim() } : {}) });
        }}>تأكيد الحل</Button>}
        {can.manage && t.status === "resolved" && <Button size="sm" variant="outline" onClick={() => act("close", { confirm: "إغلاق التذكرة؟" })}>إغلاق</Button>}
        {(can.requester || can.manage) && ["resolved", "closed"].includes(t.status) && <Button size="sm" variant="outline" onClick={() => act("reopen", { reasonPrompt: `سبب إعادة الفتح (مهلة مقدم الطلب ${d.reopen_days} أيام بعد الحل)` })}>إعادة فتح</Button>}
        {open && t.status !== "resolved" && (can.requester || can.manage) && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => can.manage && !can.requester ? act("cancel", { reasonPrompt: "سبب الإلغاء" }) : act("cancel", { confirm: "إلغاء التذكرة؟ يبقى سجلها محفوظًا." })}>إلغاء التذكرة</Button>}
      </div>
      {can.manage && open && (
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="تغيير الأولوية" className={selectCls()} value={t.priority} onChange={(e) => act("priority", { value: e.target.value })}>
            {Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>الأولوية: {v}</option>)}
          </select>
          <select aria-label="تغيير التصنيف" className={selectCls()} value={t.category_id ?? ""} onChange={(e) => act("category", { value: e.target.value })}>
            <option value="">بلا تصنيف</option>{(cats.data ?? []).filter((c) => c.is_active || c.id === t.category_id).map((c) => <option key={c.id} value={c.id}>التصنيف: {c.name}</option>)}
          </select>
        </div>
      )}

      {(can.assign || can.transfer || can.escalate) && <ManagePanel d={d} onChange={refresh} />}
      <FollowersPanel d={d} userId={userId} onChange={refresh} />

      {/* conversation */}
      <div className="space-y-2">
        <p className="font-semibold">المحادثة</p>
        {!d.messages.length && <p className="text-sm text-muted-foreground">لا توجد ردود بعد.</p>}
        {d.messages.map((m: Row) => (
          <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.is_requester ? "bg-card" : "bg-primary/5"}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{m.author_name ?? "—"}{m.is_requester ? " (مقدم الطلب)" : " (الدعم)"}</span>
              <span>{fmt(m.created_at)}{m.edited_at && " · مُصحَّح"}</span>
            </div>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <div className="mt-1 flex gap-2">
              {m.author === userId && open && <Button variant="ghost" size="sm" onClick={() => edit(m)}>تصحيح</Button>}
              {m.revisions > 0 && <Button variant="ghost" size="sm" onClick={() => history(m)}>سجل التصحيح ({m.revisions})</Button>}
            </div>
          </div>
        ))}
        {open && !can.reply ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">أنت {can.following ? "متابع لهذه التذكرة" : "مطّلع على هذه التذكرة"}: يمكنك قراءة الردود العلنية والمرفقات فقط، دون رد أو تغيير.</p>
        ) : open ? (
          <div className="space-y-2 rounded-xl border bg-card p-3">
            <Label htmlFor="sp-reply">رد علني <span className="text-xs font-normal text-muted-foreground">— يراه مقدم الطلب ومن يتابع التذكرة</span></Label>
            <Textarea id="sp-reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
            <Button disabled={busy || !reply.trim()} onClick={send}>إرسال الرد</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">التذكرة {STATUS[t.status]}؛ أعد فتحها للرد.</p>}
      </div>

      {can.handle && <InternalPanel d={d} userId={userId} onChange={refresh} />}

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="font-semibold">المرفقات</p>
        {!files.data?.length && <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p>}
        <FileList files={files.data ?? []} />
        {open && can.attach && <Uploader create={async (f) => { const { data, error } = await db.rpc("create_support_file", { _ticket: id, _name: f.name, _mime: f.type || "application/octet-stream", _size: f.size }); if (error) throw error; return (data as { id: string; storage_path: string }[])[0]!; }}
          release={(fid) => db.rpc("support_release_file", { _file: fid })} onDone={refresh} />}
      </div>

      <div className="space-y-2">
        <p className="font-semibold">السجل الزمني</p>
        <ol className="space-y-1.5">
          {d.events.map((e: Row, i: number) => (
            <li key={i} className="rounded-lg border bg-card p-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-medium">{ACT[e.action] ?? e.action}</span> — {e.actor_name ?? "النظام"}{e.to && (e.from ? ` · ${STATUS[e.from]} ← ${STATUS[e.to]}` : ` · ${STATUS[e.to]}`)}</span>
                <span className="text-xs text-muted-foreground">{fmt(e.created_at)}</span>
              </div>
              {e.details?.reason && <p className="mt-0.5 text-muted-foreground">{e.details.reason}</p>}
              {e.action === "priority" && <p className="mt-0.5 text-muted-foreground">{PRIO[e.details.from]} ← {PRIO[e.details.to]}</p>}
              {e.details?.name && <p className="mt-0.5 text-muted-foreground">{e.details.name}</p>}
              {e.action === "transfer" && <p className="mt-0.5 text-muted-foreground">{e.details.from_school} ← {e.details.to_school}</p>}
              {e.action === "department" && <p className="mt-0.5 text-muted-foreground">{e.details.from ?? "بدون قسم"} ← {e.details.to ?? "بدون قسم"}</p>}
              {e.action === "assign" && <p className="mt-0.5 text-muted-foreground">{e.details.from ?? "بلا مسؤول"} ← {e.details.to ?? "بلا مسؤول"}</p>}
              {e.action === "info_requested" && e.details?.to && <p className="mt-0.5 text-muted-foreground">إلى {e.details.to}</p>}
              {e.action === "sla_breach" && <p className="mt-0.5 text-muted-foreground">{e.details.kind === "response" ? "تجاوز موعد الرد الأول" : "تجاوز موعد الحل"}{e.details.to ? ` — نُبّه ${e.details.to}` : " — نُبّه مديرو التذكرة"}</p>}
              {e.action === "escalated" && <p className="mt-0.5 font-mono text-muted-foreground" dir="ltr">{e.details.ref}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ---------------- settings (owner / platform admin) ---------------- */
export function SupportSettings({ ctx }: { ctx: Ctx }) {
  const orgId = ctx.role === "platform_admin" ? null : ctx.orgId;
  const s = useSettings(orgId);
  const cats = useCategories(orgId ? "school" : "platform", orgId);
  const [form, setForm] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const staff = useQuery({
    enabled: !!orgId,
    queryKey: ["support-esc-cands", orgId],
    queryFn: async () => ((await db.rpc("support_escalate_candidates", { _org: orgId })).data ?? []) as Row[],
  });
  useEffect(() => { if (s.data && !form) setForm({ ...s.data, sla: { ...DEFAULT_SLA, ...(s.data.sla ?? {}) }, work_start: String(s.data.work_start).slice(0, 5), work_end: String(s.data.work_end).slice(0, 5) }); }, [s.data, form]);
  async function save() {
    const { error } = await db.rpc("support_save_settings", {
      _org: orgId, _note: form.response_note, _reopen: Number(form.reopen_days), _days: form.work_days, _start: form.work_start, _end: form.work_end,
      _sla: Object.fromEntries(Object.entries(form.sla as Record<string, Row>).map(([k, v]) => [k, { response: Number(v.response), resolve: Number(v.resolve) }])), _escalate: form.escalate_to || null,
    });
    if (error) toast.error(arabicError(error)); else { toast.success("حُفظت الإعدادات"); setForm(null); s.refetch(); }
  }
  async function saveCat(id: string | null, n: string, active: boolean) {
    const { error } = await db.rpc("support_save_category", { _org: orgId, _id: id, _name: n, _active: active });
    if (error) toast.error(arabicError(error)); else { setName(""); cats.refetch(); }
  }
  if (!form) return <LoadingState />;
  const setSla = (k: string, f: "response" | "resolve", v: string) => setForm({ ...form, sla: { ...form.sla, [k]: { ...form.sla[k], [f]: v } } });
  const toggleDay = (d: number) => setForm({ ...form, work_days: form.work_days.includes(d) ? form.work_days.filter((x: number) => x !== d) : [...form.work_days, d].sort() });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">ساعات العمل والاستجابة</p>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">أيام عمل فريق الدعم</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                <input type="checkbox" checked={form.work_days.includes(i)} onChange={() => toggleDay(i)} /> {d}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="ss-s">بداية الدوام</Label><Input id="ss-s" type="time" value={form.work_start} onChange={(e) => setForm({ ...form, work_start: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ss-e">نهاية الدوام</Label><Input id="ss-e" type="time" value={form.work_end} onChange={(e) => setForm({ ...form, work_end: e.target.value })} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="ss-n">نص المدة المتوقعة للرد</Label><Input id="ss-n" value={form.response_note} onChange={(e) => setForm({ ...form, response_note: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="ss-r">مهلة إعادة الفتح لمقدم الطلب (أيام)</Label><Input id="ss-r" type="number" min={0} max={90} value={form.reopen_days} onChange={(e) => setForm({ ...form, reopen_days: e.target.value })} /></div>
        <div className="space-y-1">
          <p className="text-sm font-medium">أوقات الاستجابة والحل (بساعات العمل)</p>
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground"><th className="py-1 text-start font-normal">الأولوية</th><th className="font-normal">الرد الأول</th><th className="font-normal">الحل</th></tr></thead>
            <tbody>
              {(["urgent", "high", "normal", "low"] as const).map((k) => (
                <tr key={k}>
                  <td className="py-1">{PRIO[k]}</td>
                  <td className="px-1"><Input aria-label={`ساعات الرد الأول — ${PRIO[k]}`} type="number" min={1} value={form.sla[k]?.response ?? ""} onChange={(e) => setSla(k, "response", e.target.value)} /></td>
                  <td className="px-1"><Input aria-label={`ساعات الحل — ${PRIO[k]}`} type="number" min={1} value={form.sla[k]?.resolve ?? ""} onChange={(e) => setSla(k, "resolve", e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">تُحسب المواعيد ضمن أيام وساعات العمل فقط. لا تُرسل تنبيهات التأخير أثناء انتظار رد مقدم الطلب.</p>
        </div>
        {orgId && (
          <div className="space-y-1">
            <Label htmlFor="ss-esc">من يُنبَّه عند التأخير</Label>
            <select id="ss-esc" className={selectCls()} value={form.escalate_to ?? ""} onChange={(e) => setForm({ ...form, escalate_to: e.target.value })}>
              <option value="">مديرو التذكرة (المدير والمالك) والمسؤول الحالي</option>
              {(staff.data ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name} — {p.school_name}</option>)}
            </select>
          </div>
        )}
        <Button onClick={save}>حفظ</Button>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">التصنيفات</p>
        <ul className="space-y-1">
          {(cats.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span className={c.is_active ? "" : "text-muted-foreground line-through"}>{c.name}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={async () => { const n = await askText("الاسم الجديد", { required: true }); if (n) saveCat(c.id, n, c.is_active); }}>تعديل</Button>
                <Button variant="ghost" size="sm" onClick={() => saveCat(c.id, c.name, !c.is_active)}>{c.is_active ? "إيقاف" : "تفعيل"}</Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2"><Input aria-label="تصنيف جديد" placeholder="تصنيف جديد" value={name} onChange={(e) => setName(e.target.value)} /><Button variant="outline" disabled={name.trim().length < 2} onClick={() => saveCat(null, name, true)}><Plus className="size-4" /> إضافة</Button></div>
      </div>
    </div>
  );
}

/* ---------------- reports (managers, own scope only) ---------------- */
const hrs = (v: Row) => (v == null ? "—" : `${v} س`);
const pct = (v: Row) => (v == null ? "—" : `${v}%`);
export function SupportReports({ ctx }: { ctx: Ctx }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [school, setSchool] = useState("");
  const owner = ctx.role === "org_owner";
  const scopeSchool = ctx.role === "principal" ? ctx.schoolId : school || null;
  const branches = useQuery({
    enabled: owner && !!ctx.orgId,
    queryKey: ["support-branches", ctx.orgId],
    queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", ctx.orgId).order("name")).data ?? []) as Row[],
  });
  const st = useQuery({
    queryKey: ["support-stats", ctx.key, scopeSchool, from, to],
    queryFn: async () => { const { data, error } = await db.rpc("support_stats", { _school: scopeSchool, _from: from || null, _to: to || null }); if (error) throw error; return data as Row; },
  });
  async function doExport(kind: "xlsx" | "pdf") {
    const d = st.data; if (!d) return;
    const headers = ["البند", "المفتوحة", "المتأخرة", "المحلولة / الإجمالي", "متوسط الحل", "التقييم"];
    const rows = [
      ...d.by_branch.map((b: Row) => [`فرع: ${b.name}`, b.open, b.overdue, b.total, "", b.avg_rating ?? ""]),
      ...d.by_assignee.map((a: Row) => [`مسؤول: ${a.name}`, a.open, a.overdue, a.resolved, a.avg_resolution_h ?? "", ""]),
    ];
    const filters = [from && `من ${from}`, to && `إلى ${to}`, `متوسط أول رد: ${hrs(d.avg_first_response_h)}`, `متوسط الحل: ${hrs(d.avg_resolution_h)}`, `متوسط التقييم: ${d.avg_rating ?? "—"}`].filter(Boolean) as string[];
    const meta = { title: "تقرير الدعم والمساعدة", school: ctx.schoolName, filters };
    try { if (kind === "xlsx") exportXlsx(meta, headers, rows); else await exportPdf(meta, headers, rows); } catch (e) { toast.error(arabicError(e)); }
  }
  const d = st.data;
  const cards: [string, string | number][] = d ? [
    ["المفتوحة", d.open], ["المتأخرة", d.overdue], ["بلا مسؤول", d.unassigned], ["أُنشئت في الفترة", d.created], ["حُلّت في الفترة", d.resolved],
    ["متوسط أول رد", hrs(d.avg_first_response_h)], ["متوسط زمن الحل", hrs(d.avg_resolution_h)], ["الرد ضمن الموعد", pct(d.response_on_time_pct)],
    ["الحل ضمن الموعد", pct(d.resolve_on_time_pct)], ["تقييم مقدمي الطلبات", d.avg_rating ? `${d.avg_rating} / 5 (${d.ratings})` : "—"],
  ] : [];
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {owner && (
          <select aria-label="الفرع" className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">كل الفروع</option>{(branches.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => doExport("xlsx")}><Download className="size-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => doExport("pdf")}><FileText className="size-4" /> PDF</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">المفتوحة والمتأخرة وحجم العمل للحالة الآن؛ الأزمنة والتقييم للتذاكر المنشأة في الفترة المختارة. الأزمنة بالساعات الفعلية.</p>
      {st.isLoading ? <LoadingState /> : st.error ? <ErrorState message={arabicError(st.error)} onRetry={() => st.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className={`text-xl font-bold ${k === "المتأخرة" && Number(v) > 0 ? "text-destructive" : ""}`}>{v}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatTable title="حسب الفرع" head={["الفرع", "المفتوحة", "المتأخرة", "في الفترة", "التقييم"]} rows={d.by_branch.map((b: Row) => [b.name, b.open, b.overdue, b.total, b.avg_rating ?? "—"])} />
            <StatTable title="حسب المسؤول" head={["المسؤول", "المفتوحة", "المتأخرة", "حُلّت", "متوسط الحل"]} rows={d.by_assignee.map((a: Row) => [a.name, a.open, a.overdue, a.resolved, hrs(a.avg_resolution_h)])} />
          </div>
        </>
      )}
    </div>
  );
}
function StatTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card p-3">
      <p className="mb-2 font-semibold">{title}</p>
      {!rows.length ? <p className="text-sm text-muted-foreground">لا توجد بيانات.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground">{head.map((h) => <th key={h} className="py-1.5 text-start font-normal">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className="py-1.5">{c}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
