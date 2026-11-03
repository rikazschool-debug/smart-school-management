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
import { ROLE_LABELS, type Role, type SupportTab } from "@/lib/roles";
import { exportPdf, exportXlsx } from "@/lib/export";

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
};
export const TAB_LABEL: Record<SupportTab, string> = { mine: "تذاكري", assigned: "المسندة إليّ", manage: "إدارة التذاكر" };
const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r;
const PAGE = 20;

type Ctx = AppContext;

function useCategories(scope: "school" | "platform", orgId: string | null) {
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
      let q = db.from("support_settings").select("work_hours, response_note, reopen_days");
      q = orgId ? q.eq("org_id", orgId) : q.is("org_id", null);
      const { data } = await q.maybeSingle();
      return (data ?? { work_hours: "الأحد–الخميس، 7:00 ص – 3:00 م", response_note: "نرد عادة خلال يوم عمل واحد.", reopen_days: 7 }) as Row;
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
export function TicketList({ ctx, box, onOpen }: { ctx: Ctx; box: SupportTab; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [prio, setPrio] = useState("");
  const [cat, setCat] = useState("");
  const [school, setSchool] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const owner = ctx.role === "org_owner" && box === "manage";
  const scopeSchool = ctx.role === "principal" && box === "manage" ? ctx.schoolId : null;
  const branches = useQuery({
    enabled: owner && !!ctx.orgId,
    queryKey: ["support-branches", ctx.orgId],
    queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", ctx.orgId).order("name")).data ?? []) as Row[],
  });
  const cats = useCategories(ctx.role === "platform_admin" ? "platform" : "school", ctx.orgId);
  useEffect(() => setPage(0), [q, status, prio, cat, school, from, to, box]);
  const args = (offset: number, limit = PAGE) => ({
    _box: box, _school: school || scopeSchool || null, _q: q.trim() || null, _status: status || null, _priority: prio || null,
    _category: cat || null, _from: from || null, _to: to || null, _limit: limit, _offset: offset,
  });
  const list = useQuery({
    queryKey: ["support-list", box, ctx.key, q, status, prio, cat, school, from, to, page],
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
      const all = await fetchAllRows((o) => db.rpc("support_list", args(o, 100)));
      const headers = ["الرقم", "العنوان", "الحالة", "الأولوية", "التصنيف", "الفرع", "مقدم الطلب", "الصفة", "المسؤول", "الإنشاء", "آخر تحديث"];
      const data = all.map((r) => [r.ref, r.title, STATUS[r.status], PRIO[r.priority], r.category, r.school_name, r.requester_name, roleLabel(r.requester_role), r.assignee_name, fmt(r.created_at), fmt(r.updated_at)]);
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
          <option value="">كل الحالات</option><option value="open">المفتوحة فقط</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="الأولوية" className={selectCls()} value={prio} onChange={(e) => setPrio(e.target.value)}>
          <option value="">كل الأولويات</option>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="التصنيف" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">كل التصنيفات</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {owner && (
          <select aria-label="الفرع" className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">كل الفروع</option>{(branches.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {box === "manage" && (
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
                </div>
                <p className="text-xs text-muted-foreground">
                  {box !== "mine" && <>{r.requester_name ?? "—"} ({roleLabel(r.requester_role)}) · {r.school_name} · </>}
                  {r.category ?? "بلا تصنيف"} · المسؤول: {r.assignee_name ?? "لم يُستلم بعد"} · آخر تحديث {fmt(r.updated_at)}
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
export function NewTicket({ ctx, onDone, onCancel }: { ctx: Ctx; onDone: (id: string) => void; onCancel: () => void }) {
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
      <p className="font-semibold">تذكرة جديدة</p>
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
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted-foreground">مقدم الطلب: </dt><dd className="inline">{t.requester_name ?? "—"} ({roleLabel(t.requester_role)})</dd></div>
          <div><dt className="inline text-muted-foreground">الفرع: </dt><dd className="inline">{t.school_name}</dd></div>
          <div><dt className="inline text-muted-foreground">التصنيف: </dt><dd className="inline">{t.category ?? "بلا تصنيف"}</dd></div>
          <div><dt className="inline text-muted-foreground">المسؤول الحالي: </dt><dd className="inline">{t.assignee_name ?? "لم يُستلم بعد"}</dd></div>
          {t.student_name && <div><dt className="inline text-muted-foreground">الابن المعني: </dt><dd className="inline">{t.student_name}</dd></div>}
          <div><dt className="inline text-muted-foreground">الإنشاء: </dt><dd className="inline">{fmt(t.created_at)}</dd></div>
          <div><dt className="inline text-muted-foreground">آخر تحديث: </dt><dd className="inline">{fmt(t.updated_at)}</dd></div>
          {t.resolved_at && <div><dt className="inline text-muted-foreground">الحل: </dt><dd className="inline">{fmt(t.resolved_at)}</dd></div>}
          {t.closed_at && <div><dt className="inline text-muted-foreground">الإغلاق: </dt><dd className="inline">{fmt(t.closed_at)}</dd></div>}
          {t.rating && <div><dt className="inline text-muted-foreground">التقييم: </dt><dd className="inline">{t.rating} / 5</dd></div>}
        </dl>
        <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{t.body}</p>
        {t.resolution && <p className="rounded-lg border border-primary/30 p-3 text-sm"><span className="font-semibold">طريقة الحل: </span>{t.resolution}</p>}
      </div>

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        {can.manage && ["new", "waiting_internal", "in_progress"].includes(t.status) && t.assignee !== userId && <Button size="sm" onClick={() => act("claim")}>استلام التذكرة</Button>}
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
        {open ? (
          <div className="space-y-2 rounded-xl border bg-card p-3">
            <Label htmlFor="sp-reply">رد علني <span className="text-xs font-normal text-muted-foreground">— يراه مقدم الطلب ومن يتابع التذكرة</span></Label>
            <Textarea id="sp-reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
            <Button disabled={busy || !reply.trim()} onClick={send}>إرسال الرد</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">التذكرة {STATUS[t.status]}؛ أعد فتحها للرد.</p>}
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="font-semibold">المرفقات</p>
        {!files.data?.length && <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p>}
        <FileList files={files.data ?? []} />
        {open && <Uploader create={async (f) => { const { data, error } = await db.rpc("create_support_file", { _ticket: id, _name: f.name, _mime: f.type || "application/octet-stream", _size: f.size }); if (error) throw error; return (data as { id: string; storage_path: string }[])[0]!; }}
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
  useEffect(() => { if (s.data && !form) setForm({ ...s.data }); }, [s.data, form]);
  async function save() {
    const { error } = await db.rpc("support_save_settings", { _org: orgId, _hours: form.work_hours, _note: form.response_note, _reopen: Number(form.reopen_days) });
    if (error) toast.error(arabicError(error)); else { toast.success("حُفظت الإعدادات"); s.refetch(); }
  }
  async function saveCat(id: string | null, n: string, active: boolean) {
    const { error } = await db.rpc("support_save_category", { _org: orgId, _id: id, _name: n, _active: active });
    if (error) toast.error(arabicError(error)); else { setName(""); cats.refetch(); }
  }
  if (!form) return <LoadingState />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">ساعات العمل والاستجابة</p>
        <div className="space-y-1"><Label htmlFor="ss-h">ساعات عمل فريق الدعم</Label><Input id="ss-h" value={form.work_hours} onChange={(e) => setForm({ ...form, work_hours: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="ss-n">المدة المتوقعة للرد</Label><Input id="ss-n" value={form.response_note} onChange={(e) => setForm({ ...form, response_note: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="ss-r">مهلة إعادة الفتح لمقدم الطلب (أيام)</Label><Input id="ss-r" type="number" min={0} max={90} value={form.reopen_days} onChange={(e) => setForm({ ...form, reopen_days: e.target.value })} /></div>
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
