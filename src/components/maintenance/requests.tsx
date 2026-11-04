import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Bus, CalendarClock, CheckCircle2, MessageSquare, Plus, Wrench } from "lucide-react";
import { db } from "@/components/crud-page";
import type { Row } from "@/components/procurement/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { FileList, Uploader } from "@/components/homework/files";
import { ExportButtons } from "@/components/procurement/export-buttons";
import { ActionBox, BackLink, DateRange, DetailHeader, Field, FormActions, FormCard, Pager, Panel, SearchBox, TableCard, TabIntro, TD, TH, THEAD, Toolbar, TRC } from "@/components/procurement/ui";
import { arabicError } from "@/lib/session";
import { NeedPanel } from "./need-panel";
import { BUS_STATUS, EVENT, KIND_LABEL, PLACE_TYPES, PRIORITY, STATUS, STATUS_TONE, dd, dt, type Kind, type MtMe } from "./shared";

const PAGE = 25;
const sel = selectCls("w-full", true);

export function StatusPill({ s }: { s: string }) {
  return <span className={"inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_TONE[s] ?? "bg-secondary text-secondary-foreground")}>{STATUS[s] ?? s}</span>;
}
function PriorityTag({ p }: { p: string }) {
  if (p !== "urgent" && p !== "high") return <span className="text-xs text-muted-foreground">{PRIORITY[p]}</span>;
  return <span className={"inline-flex items-center gap-1 text-xs font-semibold " + (p === "urgent" ? "text-destructive" : "text-warning-foreground")}><AlertTriangle className="size-3.5" />{PRIORITY[p]}</span>;
}

async function run<T>(p: PromiseLike<{ data: T; error: unknown }>, ok?: string): Promise<T | null> {
  const { data, error } = await p;
  if (error) { toast.error(arabicError(error)); return null; }
  if (ok) toast.success(ok);
  return data;
}

// ---------------- list ----------------
/** Request log views: new arrivals vs completed, each shown grouped per branch so branches never mix. */
const FOLLOW_LOGS: [string, string, string][] = [["current", "الطلبات الحالية", "new,awaiting_assign,assigned,in_progress,scheduled,clarify,waiting_parts,returned,awaiting_approval"], ["review", "بانتظار تأكيدي", "awaiting_approval"], ["past", "الطلبات السابقة", "closed,cancelled"]];
const MGR_LOGS: [string, string, string][] = [["", "كل الطلبات", ""], ["new", "الطلبات الجديدة", "new,awaiting_assign,assigned"], ["work", "قيد المعالجة", "in_progress,scheduled,clarify,waiting_parts,returned"], ["review", "بانتظار تأكيد المتابعة", "awaiting_approval"], ["done", "الطلبات المكتملة", "closed"]];
const byBranch = (rows: Row[]) => [...rows].sort((a, b) => String(a.school).localeCompare(String(b.school), "ar"));
export function RequestList({ orgId, orgName, kind, me, open, onNew, preset }: {
  orgId: string; orgName: string; kind: Kind; me: MtMe; open: (id: string) => void; onNew?: (() => void) | undefined; preset?: Record<string, string> | undefined;
}) {
  const followOnly = !me.owner && !me.caps![kind].execute.length; const LOGS = followOnly ? FOLLOW_LOGS : MGR_LOGS;
  const [q, setQ] = useState(""); const presetLog = LOGS.find((l) => l[2] && l[2] === preset?.["status"])?.[0];
  const [status, setStatus] = useState(presetLog ? "" : (preset?.["status"] ?? "")); const [priority, setPriority] = useState("");
  const [school, setSchool] = useState(""); const [mine, setMine] = useState(preset?.["mine"] ?? ""); const [overdue, setOverdue] = useState(preset?.["overdue"] === "1");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(0);
  const [log, setLog] = useState(presetLog ?? (followOnly ? "current" : ""));
  const f = { kind, q, status: status || (LOGS.find((l) => l[0] === log)?.[2] ?? ""), priority, school, mine, overdue, from, to };
  const list = useQuery({
    queryKey: ["mt-list", orgId, f, page],
    queryFn: async () => {
      const { data, error } = await db.rpc("mt_list", { _org: orgId, _f: { ...f, limit: PAGE, offset: page * PAGE } });
      if (error) throw error; return data as { rows: Row[]; total: number };
    },
  });
  const schools = [...new Map(Object.values(me.caps?.[kind] ?? {}).flat().map((s) => [s.id, s])).values()];
  const filters = [log && `السجل: ${LOGS.find((l) => l[0] === log)?.[1]}`, status && `الحالة: ${STATUS[status]}`, priority && `الأولوية: ${PRIORITY[priority]}`, school && `الفرع: ${schools.find((s) => s.id === school)?.name}`, mine && (mine === "assigned" ? "المسند إليّ" : "طلباتي"), overdue && "المتأخرة", from && `من ${from}`, to && `إلى ${to}`, q && `بحث: ${q}`].filter(Boolean) as string[];
  async function allRows() {
    const { data, error } = await db.rpc("mt_list", { _org: orgId, _f: { ...f, limit: 500, offset: 0 } });
    if (error) { toast.error(arabicError(error)); return []; }
    return (data.rows as Row[]);
  }
  const [exp, setExp] = useState<Row[] | null>(null);
  const reset = (fn: () => void) => { fn(); setPage(0); };
  return (
    <div className="space-y-4">
      <TabIntro icon={kind === "school" ? Wrench : Bus} title={KIND_LABEL[kind]} desc={kind === "school" ? "أعطال المباني والمرافق والأجهزة في الفروع ومتابعتها حتى اعتماد الإنجاز." : "أعطال الباصات وصيانتها الدورية؛ حالة الباص التشغيلية منفصلة عن حالة الطلب."}
        actions={onNew && <Button onClick={onNew}><Plus className="size-4" />طلب صيانة جديد</Button>} />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="سجل الطلبات">
        {LOGS.map(([k, label]) => (
          <Button key={k} size="sm" role="tab" aria-selected={log === k} variant={log === k ? "default" : "outline"} onClick={() => reset(() => { setLog(k); setStatus(""); })}>{label}</Button>
        ))}
      </div>
      <Toolbar actions={<>
        <Button size="sm" variant="ghost" onClick={async () => setExp(await allRows())}>تجهيز التصدير</Button>
        {exp && <ExportButtons meta={{ title: `طلبات ${KIND_LABEL[kind]}`, school: orgName, filters }} headers={["المرجع", "العنوان", "الفرع", "التصنيف", "المكان/الباص", "الأولوية", "الحالة", "المسؤول", "مقدم الطلب", "التاريخ", "التقدم %"]}
          rows={() => exp.map((r) => [r.ref, r.title, r.school, r.category, r.place, PRIORITY[r.priority] ?? "", STATUS[r.status] ?? "", r.assignee ?? "—", r.requester, dd(r.created_at), r.progress])} />}
      </>}>
        <SearchBox value={q} onChange={(v) => reset(() => setQ(v))} placeholder="رقم، عنوان أو مكان" />
        <Field label="الحالة"><select className={selectCls("w-48", true)} value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
          <option value="">الكل</option>{Object.entries(STATUS).filter(([k]) => k !== "new").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {!followOnly && <><Field label="الأولوية"><select className={selectCls("w-28", true)} value={priority} onChange={(e) => reset(() => setPriority(e.target.value))}>
          <option value="">الكل</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {schools.length > 1 && <Field label="الفرع"><select className={selectCls("w-36", true)} value={school} onChange={(e) => reset(() => setSchool(e.target.value))}>
          <option value="">كل الفروع</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Field label="عرض"><select className={selectCls("w-32", true)} value={mine} onChange={(e) => reset(() => setMine(e.target.value))}>
          <option value="">الكل</option><option value="assigned">المسند إليّ</option><option value="requested">طلباتي</option></select></Field>
        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={overdue} onChange={(e) => reset(() => setOverdue(e.target.checked))} />المتأخرة فقط</label></>}
        <DateRange from={from} to={to} setFrom={(v) => reset(() => setFrom(v))} setTo={(v) => reset(() => setTo(v))} />
      </Toolbar>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => void list.refetch()} /> : !list.data?.rows.length ? (
        <EmptyState title="لا توجد طلبات مطابقة" hint={filters.length ? "غيّر الفلاتر لعرض طلبات أخرى." : "ستظهر هنا الطلبات التي تملك الاطلاع عليها."} />
      ) : (
        <>
          <TableCard caption={<span>{list.data.total} طلب</span>}>
            <table className="w-full text-sm">
              <thead className={THEAD}><tr><th className={TH}>المرجع</th><th className={TH}>العنوان</th><th className={TH}>الفرع</th><th className={TH}>{kind === "bus" ? "الباص" : "المكان"}</th><th className={TH}>الأولوية</th><th className={TH}>الحالة</th><th className={TH}>المسؤول</th><th className={TH}>الموعد</th><th className={TH}>التقدم</th></tr></thead>
              <tbody>
                {byBranch(list.data.rows).map((r, i, a) => (<Fragment key={r.id}>
                  {(i === 0 || a[i - 1]!.school !== r.school) && <tr className="bg-secondary/60"><td colSpan={9} className="px-3 py-1.5 text-xs font-bold text-primary">الفرع: {r.school} ({a.filter((x) => x.school === r.school).length})</td></tr>}
                  <tr className={TRC} onClick={() => open(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open(r.id)}>
                    <td className={TD + " whitespace-nowrap font-mono text-xs"} dir="ltr">{r.ref}</td>
                    <td className={TD}><span className="font-medium">{r.title}</span><span className="block text-xs text-muted-foreground">{r.category}{r.subcategory ? ` ← ${r.subcategory}` : ""}</span></td>
                    <td className={TD}>{r.school}</td><td className={TD}>{r.place ?? "—"}</td>
                    <td className={TD}><PriorityTag p={r.priority} /></td>
                    <td className={TD}><StatusPill s={r.status} />{r.overdue && <span className="mr-1 text-xs font-semibold text-destructive">متأخر</span>}</td>
                    <td className={TD}>{r.assignee ?? <span className="text-muted-foreground">غير مسند</span>}</td>
                    <td className={TD + " whitespace-nowrap text-xs"}>{r.visit_at ? dt(r.visit_at) : "—"}</td>
                    <td className={TD + " tabular-nums"}>{r.progress}%</td>
                  </tr>
                </Fragment>))}
              </tbody>
            </table>
          </TableCard>
          <Pager page={page} total={list.data.total} size={PAGE} setPage={setPage} />
        </>
      )}
    </div>
  );
}

// ---------------- create ----------------
export function RequestForm({ orgId, kind, me, onDone, onCancel }: { orgId: string; kind: Kind; me: MtMe; onDone: (id: string) => void; onCancel: () => void }) {
  const schools = me.caps?.[kind].request ?? [];
  const [d, setD] = useState<Record<string, string | boolean>>({ school: schools[0]?.id ?? "", priority: "normal", place_type: "فصل" });
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const cats = useQuery({ queryKey: ["mt-cats", orgId, kind], queryFn: async () => { const { data, error } = await db.rpc("mt_categories_list", { _org: orgId, _kind: kind }); if (error) throw error; return data as Row[]; } });
  const buses = useQuery({ enabled: kind === "bus", queryKey: ["mt-buses", orgId], queryFn: async () => { const { data, error } = await db.rpc("mt_buses_list", { _org: orgId }); if (error) throw error; return data as Row[]; } });
  const set = (k: string, v: string | boolean) => setD((x) => ({ ...x, [k]: v }));
  const cat = cats.data?.find((c) => c.id === d["category_id"]);
  const myBuses = (buses.data ?? []).filter((b) => b.school_id === d["school"] && b.active);
  if (!schools.length) return <EmptyState title="لا تملك تقديم طلبات من هذا النوع" hint="يحدد مالك المؤسسة من يقدّم الطلبات لكل فرع." />;
  async function save() {
    setBusy(true);
    const { school, ...data } = d;
    const id = await run(db.rpc("mt_create", { _school: school, _kind: kind, _data: data, _key: key }), "أُرسل الطلب");
    setBusy(false);
    if (id) onDone(id as string);
  }
  return (
    <FormCard title={`طلب ${KIND_LABEL[kind]} جديد`} subtitle="الرقم المرجعي ووقت الإنشاء وهويتك وفرعك تُسجّل من الخادم." wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {schools.length > 1 && <Field label="الفرع"><select className={sel} value={d["school"] as string} onChange={(e) => set("school", e.target.value)}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Field label="العنوان" className="sm:col-span-2"><Input value={(d["title"] as string) ?? ""} onChange={(e) => set("title", e.target.value)} maxLength={150} /></Field>
        <Field label="التصنيف الرئيسي"><select className={sel} value={(d["category_id"] as string) ?? ""} onChange={(e) => { set("category_id", e.target.value); set("subcategory_id", ""); }}>
          <option value="">اختر</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {cat?.subs.length > 0 && <Field label="التصنيف الفرعي"><select className={sel} value={(d["subcategory_id"] as string) ?? ""} onChange={(e) => set("subcategory_id", e.target.value)}>
          <option value="">—</option>{cat.subs.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {cat?.is_other && <Field label="صف نوع العطل (مطلوب مع «أخرى»)" className="sm:col-span-2"><Input value={(d["other_text"] as string) ?? ""} onChange={(e) => set("other_text", e.target.value)} /></Field>}
        <Field label="الأولوية"><select className={sel} value={d["priority"] as string} onChange={(e) => set("priority", e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {d["priority"] === "urgent" && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm sm:col-span-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>للحالات الخطرة (حريق، تماس كهربائي، تسرب غاز، خطر على الطلاب) اتبع إجراءات الطوارئ المباشرة واتصل بالجهات المختصة فورًا؛ هذا الطلب لا يغني عنها.</span>
          </div>
        )}
        {kind === "school" ? (<>
          <Field label="المبنى"><Input value={(d["building"] as string) ?? ""} onChange={(e) => set("building", e.target.value)} /></Field>
          <Field label="الطابق"><Input value={(d["floor"] as string) ?? ""} onChange={(e) => set("floor", e.target.value)} /></Field>
          <Field label="نوع المكان"><select className={sel} value={d["place_type"] as string} onChange={(e) => set("place_type", e.target.value)}>{PLACE_TYPES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="المكان المحدد"><Input placeholder="مثال: فصل 3/2" value={(d["place"] as string) ?? ""} onChange={(e) => set("place", e.target.value)} /></Field>
          <Field label="الجهاز أو الأصل المتأثر (اختياري)" className="sm:col-span-2"><Input value={(d["asset"] as string) ?? ""} onChange={(e) => set("asset", e.target.value)} /></Field>
        </>) : (<>
          <Field label="الباص"><select className={sel} value={(d["bus_id"] as string) ?? ""} onChange={(e) => set("bus_id", e.target.value)}>
            <option value="">{myBuses.length ? "اختر" : "لا توجد باصات مسجلة للفرع"}</option>{myBuses.map((b) => <option key={b.id} value={b.id}>{b.code}{b.plate ? ` — ${b.plate}` : ""} ({BUS_STATUS[b.op_status]})</option>)}</select></Field>
          <Field label="قراءة العداد (عند الحاجة)"><Input type="number" min={0} value={(d["odometer"] as string) ?? ""} onChange={(e) => set("odometer", e.target.value)} /></Field>
          <Field label="مكان الباص الآن"><Input value={(d["bus_location"] as string) ?? ""} onChange={(e) => set("bus_location", e.target.value)} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!d["stop_bus"]} onChange={(e) => set("stop_bus", e.target.checked)} />إيقاف الباص عن الخدمة حتى الإصلاح</label>
        </>)}
        <Field label="وصف العطل" className="sm:col-span-2"><Textarea rows={3} value={(d["description"] as string) ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="تأثير العطل على العمل" className="sm:col-span-2"><Input value={(d["impact"] as string) ?? ""} onChange={(e) => set("impact", e.target.value)} /></Field>
        <Field label={kind === "bus" ? "موعد إتاحة الباص للصيانة" : "أوقات السماح بالزيارة"}><Input placeholder="مثال: بعد الحصة الخامسة" value={(d["visit_window"] as string) ?? ""} onChange={(e) => set("visit_window", e.target.value)} /></Field>
        <Field label="وسيلة التواصل الداخلية"><Input placeholder="تحويلة، مكتب، أو عبر الطلب" value={(d["contact"] as string) ?? ""} onChange={(e) => set("contact", e.target.value)} /></Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">المرفقات (صور العطل) تُضاف من صفحة الطلب بعد إرساله.</p>
      <FormActions><Button disabled={busy} onClick={() => void save()}>إرسال الطلب</Button><Button variant="ghost" onClick={onCancel}>إلغاء</Button></FormActions>
    </FormCard>
  );
}

// ---------------- detail ----------------
export function RequestDetail({ id, back }: { id: string; back: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mt-get", id], queryFn: async () => { const { data, error } = await db.rpc("mt_get", { _id: id }); if (error) throw error; return data as Row; } });
  const cands = useQuery({ enabled: !!q.data?.can.assign, queryKey: ["mt-cand", id], queryFn: async () => { const { data, error } = await db.rpc("mt_candidates", { _id: id }); if (error) throw error; return data as Row[]; } });
  const [txt, setTxt] = useState(""); const [internal, setInternal] = useState(false);
  const [pr, setPr] = useState<{ progress: string; waiting: boolean; est: string }>({ progress: "", waiting: false, est: "" });
  const [visit, setVisit] = useState(""); const [due, setDue] = useState(""); const [assignee, setAssignee] = useState("");
  const inv = () => { void qc.invalidateQueries({ queryKey: ["mt-get", id] }); void qc.invalidateQueries({ queryKey: ["mt-list"] }); void qc.invalidateQueries({ queryKey: ["mt-buses"] }); void qc.invalidateQueries({ queryKey: ["mt-stats"] }); };
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} />;
  const r = q.data; const c = r.can;
  async function act(action: string, data: Record<string, unknown> = {}, ok?: string) {
    const res = await run(db.rpc("mt_action", { _id: id, _rev: r.rev, _action: action, _data: data }), ok);
    if (res) { setTxt(""); inv(); return true; }
    inv(); return false;
  }
  async function withReason(action: string, msg: string, ok: string, extra: Record<string, unknown> = {}) {
    const reason = await askText(msg, { required: true, ok: "تأكيد" });
    if (reason) await act(action, { ...extra, reason }, ok);
  }
  const files = (r.files as Row[]).map((f) => ({ ...f, storage_path: f.path, size_bytes: f.size }));
  return (
    <div className="space-y-4">
      <BackLink onClick={back} label="العودة إلى القائمة" />
      <DetailHeader refText={<span dir="ltr">{r.ref}</span>} title={r.title} status={<StatusPill s={r.status} />}
        facts={[["النوع", KIND_LABEL[r.kind as Kind]], ["الفرع", r.school], ["التصنيف", `${r.category}${r.subcategory ? ` ← ${r.subcategory}` : ""}`], ["الأولوية", PRIORITY[r.priority]],
          [r.kind === "bus" ? "الباص" : "المكان", r.kind === "bus" ? `${r.bus?.code ?? ""}${r.bus?.plate ? ` — ${r.bus.plate}` : ""} (${BUS_STATUS[r.bus?.op_status] ?? "—"})` : [r.building && `مبنى ${r.building}`, r.floor && `طابق ${r.floor}`, r.place_type, r.place].filter(Boolean).join(" · ")],
          ["مقدم الطلب", r.requester], ["المسؤول", r.assignee ?? "غير مسند"], ["موعد الزيارة", r.visit_at ? dt(r.visit_at) : "—"], ["الإنجاز المتوقع", dd(r.expected_done)],
          ["التقدم", `${r.progress}%`], ["التكلفة التقديرية", r.est_cost != null ? `${r.est_cost} ر.س` : "—"], ["التكلفة المعتمدة", r.actual_cost != null ? `${r.actual_cost} ر.س` : "—"]]}
        actions={<>
          {c.claim && <Button onClick={() => void act("claim", {}, "استلمت الطلب")}>استلام الطلب</Button>}
          {c.accept && <Button onClick={() => void act("accept", {}, "استلمت الطلب")}>استلام</Button>}
          {c.decline && <Button variant="outline" onClick={() => void withReason("decline", "سبب الاعتذار عن الإسناد", "أُعيد الطلب للمتابعة")}>اعتذار</Button>}
          {c.clarify && <Button variant="outline" onClick={() => void withReason("clarify", "ما المطلوب توضيحه من مقدم الطلب؟", "أُرسل طلب التوضيح")}>طلب توضيح</Button>}
          {c.reopen && <Button variant="outline" onClick={() => void withReason("reopen", "سبب طلب إعادة الفتح", "أُرسل طلب إعادة الفتح للمتابعة")}>طلب إعادة فتح</Button>}
          {c.reopen_decide && <Button onClick={() => void withReason("reopen_decide", "سبب قبول إعادة الفتح", "أُعيد فتح الطلب", { approve: true })}>قبول إعادة الفتح</Button>}
          {c.reopen_decide && <Button variant="outline" onClick={() => void withReason("reopen_decide", "سبب رفض إعادة الفتح", "رُفض طلب إعادة الفتح", { approve: false })}>رفض إعادة الفتح</Button>}
          {c.cancel && <Button variant="ghost" className="text-destructive" onClick={() => void withReason("cancel", "سبب الإلغاء (يظهر لمقدم الطلب)", "أُلغي الطلب")}>إلغاء الطلب</Button>}
        </>}>
        {r.overdue && <p className="mt-2 text-sm font-semibold text-destructive">تجاوز تاريخ الإنجاز المتوقع.</p>}
        {r.priority === "urgent" && r.status !== "closed" && <p className="mt-2 flex items-center gap-1 text-sm text-destructive"><AlertTriangle className="size-4" />طلب عاجل — لا يغني عن إجراءات الطوارئ المباشرة.</p>}
        {r.reopen_pending && <p className="mt-2 rounded-lg bg-warning/15 p-2 text-sm">طلب إعادة فتح من {r.reopen_pending.name} بانتظار قرار المتابعة: {r.reopen_pending.reason}</p>}
        {r.reopen_cycle > 0 && <p className="mt-2 text-xs text-muted-foreground">دورة المعالجة رقم {r.reopen_cycle + 1} — الإنجاز والإغلاق السابقان محفوظان في السجل.</p>}
        {r.status === "cancelled" && r.cancel_reason && <p className="mt-2 text-sm">سبب الإلغاء: {r.cancel_reason}</p>}
      </DetailHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="وصف العطل">
            <p className="whitespace-pre-wrap text-sm">{r.description}</p>
            {r.other_text && <p className="mt-2 text-sm">نوع العطل: {r.other_text}</p>}
            {r.impact && <p className="mt-2 text-sm text-muted-foreground">التأثير: {r.impact}</p>}
            {r.asset && <p className="mt-1 text-sm text-muted-foreground">الجهاز: {r.asset}</p>}
            {r.odometer != null && <p className="mt-1 text-sm text-muted-foreground">قراءة العداد: {r.odometer}</p>}
            {r.bus_location && <p className="mt-1 text-sm text-muted-foreground">مكان الباص: {r.bus_location}</p>}
            {r.visit_window && <p className="mt-1 text-sm text-muted-foreground">{r.kind === "bus" ? "إتاحة الباص" : "أوقات الزيارة"}: {r.visit_window}</p>}
            {r.contact && <p className="mt-1 text-sm text-muted-foreground">التواصل: {r.contact}</p>}
            {r.completion_note && <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm"><p className="font-semibold">الأعمال المنفذة ({r.completed_by})</p><p className="whitespace-pre-wrap">{r.completion_note}</p></div>}
          </Panel>

          {c.decide && (
            <ActionBox title="اعتماد الإنجاز">
              <p className="text-sm text-muted-foreground">راجع الأعمال والإثباتات. الإعادة للاستكمال تحتاج ملاحظات.</p>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="التكلفة الفعلية المعتمدة (اختياري)"><Input type="number" min={0} className="w-40" value={pr.est} onChange={(e) => setPr({ ...pr, est: e.target.value })} /></Field>
                <Button onClick={() => void act("approve", { actual_cost: pr.est || null }, "اعتُمد الإنجاز وأُغلق الطلب")}><CheckCircle2 className="size-4" />تأكيد: تمت الصيانة</Button>
                <Button variant="outline" onClick={() => void withReason("return", "ملاحظات الإعادة للاستكمال", "أُعيد للاستكمال")}>إعادة بملاحظات</Button>
              </div>
            </ActionBox>
          )}

          {c.work && (
            <ActionBox title="التنفيذ">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="موعد الزيارة"><Input type="datetime-local" value={visit} onChange={(e) => setVisit(e.target.value)} /></Field>
                <Field label="الإنجاز المتوقع"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
                <div className="flex items-end"><Button variant="outline" disabled={!visit} onClick={async () => {
                  const reason = r.visit_at ? await askText("سبب إعادة الجدولة (يُحفظ الموعد السابق)", { required: true }) : null;
                  if (r.visit_at && !reason) return;
                  await act("schedule", { visit_at: new Date(visit).toISOString(), expected_done: due || null, reason }, r.visit_at ? "أُعيدت الجدولة" : "حُدد الموعد");
                }}><CalendarClock className="size-4" />{r.visit_at ? "إعادة الجدولة" : "تحديد الموعد"}</Button></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="نسبة التقدم %"><Input type="number" min={0} max={100} value={pr.progress} onChange={(e) => setPr({ ...pr, progress: e.target.value })} /></Field>
                <Field label="التكلفة التقديرية"><Input type="number" min={0} value={pr.est} onChange={(e) => setPr({ ...pr, est: e.target.value })} /></Field>
                <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={pr.waiting} onChange={(e) => setPr({ ...pr, waiting: e.target.checked })} />بانتظار قطع أو جهة خارجية</label>
              </div>
              <Textarea rows={2} placeholder="الأعمال المنفذة أو العوائق" value={txt} onChange={(e) => setTxt(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!pr.progress || !txt.trim()} onClick={() => void act("progress", { progress: Number(pr.progress), body: txt, waiting: pr.waiting, est_cost: pr.est || null }, "سُجل التحديث")}>تسجيل التحديث</Button>
                {c.submit && <Button disabled={txt.trim().length < 5} onClick={() => void act("submit_completion", { body: txt }, "أُرسل طلب اعتماد الإنجاز")}>إنهاء وإرسال للمتابعة</Button>}
              </div>
              <p className="text-xs text-muted-foreground">نسبة 100% لا تغلق الطلب؛ الإغلاق باعتماد مسؤول المتابعة فقط.</p>
            </ActionBox>
          )}

          {c.assign && (
            <ActionBox title={r.assignee_id ? "إعادة الإسناد" : "إسناد الطلب"}>
              {cands.data && !cands.data.length ? <p className="text-sm text-muted-foreground">لا يوجد مسؤول صيانة مخول لهذا الفرع. أسند الدور من صفحة الصلاحيات.</p> : (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="المسؤول"><select className={selectCls("w-64", true)} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                    <option value="">اختر</option>{cands.data?.filter((u) => u.id !== r.assignee_id).map((u) => <option key={u.id} value={u.id}>{u.name} — {u.open} مفتوح</option>)}</select></Field>
                  <Button disabled={!assignee} onClick={async () => {
                    const reason = r.assignee_id ? await askText("سبب إعادة الإسناد", { required: true }) : null;
                    if (r.assignee_id && !reason) return;
                    if (await act("assign", { user: assignee, reason }, "أُسند الطلب")) setAssignee("");
                  }}>إسناد</Button>
                </div>
              )}
            </ActionBox>
          )}

          <Panel title="السجل والمحادثة" count={r.events.length}>
            <ol className="space-y-3">
              {(r.events as Row[]).map((e, i) => (
                <li key={i} className={"rounded-xl border p-3 text-sm " + (e.internal ? "border-dashed bg-muted/40" : "")}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{EVENT[e.action] ?? e.action}</span><span>{e.actor}</span><span>{dt(e.at)}</span>
                    {e.internal && <span className="rounded bg-secondary px-1.5">داخلية للفريق</span>}
                  </div>
                  {e.body && <p className="mt-1 whitespace-pre-wrap">{e.body}</p>}
                  {e.action === "reschedule" && e.before?.visit_at && <p className="mt-1 text-xs text-muted-foreground">الموعد السابق: {dt(e.before.visit_at)} ← الجديد: {dt(e.after?.visit_at)}</p>}
                  {(e.action === "progress" || e.action === "waiting") && <p className="mt-1 text-xs text-muted-foreground">التقدم: {e.after?.progress}%</p>}
                </li>
              ))}
            </ol>
            {c.reply && (
              <div className="mt-4 space-y-2">
                <Textarea rows={2} placeholder={r.status === "clarify" ? "اكتب التوضيح المطلوب" : "اكتب ردًا أو ملاحظة"} value={txt} onChange={(e) => setTxt(e.target.value)} />
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" disabled={!txt.trim()} onClick={() => void act(internal && c.note ? "note" : "reply", { body: txt }, "أُضيف")}><MessageSquare className="size-4" />{r.status === "clarify" ? "إرسال التوضيح" : "إرسال"}</Button>
                  {c.note && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />ملاحظة داخلية (لا تظهر لمقدم الطلب)</label>}
                </div>
              </div>
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="المرفقات" count={files.length}>
            {files.length ? <FileList files={files} onRemove={c.attach ? async (f) => { if (await run(db.rpc("mt_file_remove", { _file: f["id"] }), "أُزيل الملف")) inv(); } : undefined} /> : <p className="text-sm text-muted-foreground">لا مرفقات.</p>}
            {c.attach && <div className="mt-3"><Uploader label="إرفاق صورة أو مستند" create={async (f) => { const { data, error } = await db.rpc("create_mt_file", { _id: id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }} release={(fid) => db.rpc("mt_file_remove", { _file: fid })} onDone={inv} /></div>}
          </Panel>
          <NeedPanel id={id} />
          <Panel title="المواعيد"><ul className="space-y-1 text-sm"><li>الإنشاء: {dt(r.created_at)}</li><li>موعد الزيارة: {r.visit_at ? dt(r.visit_at) : "—"}</li><li>الإنجاز المتوقع: {dd(r.expected_done)}</li>{r.closed_at && <li>الإغلاق: {dt(r.closed_at)}</li>}{r.reopen_until && r.status === "closed" && <li>إعادة الفتح متاحة حتى: {dt(r.reopen_until)}</li>}</ul></Panel>
        </div>
      </div>
    </div>
  );
}

// ---------------- buses ----------------
export function BusesTab({ orgId, orgName, me }: { orgId: string; orgName: string; me: MtMe }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mt-buses", orgId], queryFn: async () => { const { data, error } = await db.rpc("mt_buses_list", { _org: orgId }); if (error) throw error; return data as Row[]; } });
  const fleetSchools = me.caps?.bus.fleet ?? [];
  const [edit, setEdit] = useState<Row | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const logQ = useQuery({ enabled: !!log, queryKey: ["mt-bus-log", log], queryFn: async () => { const { data, error } = await db.rpc("mt_bus_log", { _bus: log }); if (error) throw error; return data as Row[]; } });
  const inv = () => { void qc.invalidateQueries({ queryKey: ["mt-buses"] }); void qc.invalidateQueries({ queryKey: ["mt-bus-log"] }); };
  async function setStatus(b: Row, s: string) {
    const note = await askText(s === "available" ? "نتيجة الفحص قبل إعادة الباص للخدمة" : "سبب تغيير حالة الباص", { required: true, ok: "تأكيد" });
    if (note && await run(db.rpc("mt_bus_set_status", { _bus: b.id, _status: s, _note: note }), "حُدّثت حالة الباص")) inv();
  }
  if (edit) return <BusForm bus={edit} schools={fleetSchools} onDone={() => { setEdit(null); inv(); }} />;
  return (
    <div className="space-y-4">
      <TabIntro icon={Bus} title="الباصات" desc="البيانات الأساسية اللازمة لطلبات الصيانة فقط، وحالة كل باص التشغيلية والصيانة القادمة."
        actions={fleetSchools.length > 0 && <Button onClick={() => setEdit({})}><Plus className="size-4" />إضافة باص</Button>} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد باصات مسجلة" hint="يضيف باصات الفرع من مُنح صلاحية إدارة بيانات الباصات." /> : (
        <TableCard caption={<span className="flex flex-wrap items-center gap-3">{q.data.length} باص<ExportButtons meta={{ title: "الباصات", school: orgName, filters: [] }} headers={["الرقم", "اللوحة", "الفرع", "الحالة", "العداد", "الصيانة القادمة", "الفحص الدوري", "الترخيص", "طلبات مفتوحة"]}
          rows={() => q.data.map((b) => [b.code, b.plate, b.school, BUS_STATUS[b.op_status] ?? "", b.odometer, [b.next_service_date && dd(b.next_service_date), b.next_service_km && `${b.next_service_km} كم`].filter(Boolean).join(" / "), b.inspection_date ? `${dd(b.inspection_date)} ${DOC[b.inspection_state] ?? ""}` : "", b.license_expiry ? `${dd(b.license_expiry)} ${DOC[b.license_state] ?? ""}` : "", b.open_requests])} /></span>}>
          <table className="w-full text-sm">
            <thead className={THEAD}><tr><th className={TH}>الباص</th><th className={TH}>الفرع</th><th className={TH}>الحالة التشغيلية</th><th className={TH}>العداد</th><th className={TH}>الصيانة القادمة</th><th className={TH}>الفحص الدوري</th><th className={TH}>الترخيص</th><th className={TH}>طلبات مفتوحة</th><th className={TH}></th></tr></thead>
            <tbody>
              {q.data.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className={TD}><span className="font-medium">{b.code}</span>{b.plate && <span className="block text-xs text-muted-foreground">{b.plate}</span>}</td>
                  <td className={TD}>{b.school}</td>
                  <td className={TD}><span className={"rounded-full px-2 py-0.5 text-xs " + (b.op_status === "available" ? "bg-success/10 text-success" : b.op_status === "stopped" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning-foreground")}>{BUS_STATUS[b.op_status]}</span></td>
                  <td className={TD + " tabular-nums"}>{b.odometer ?? "—"}</td>
                  <td className={TD}>{[b.next_service_date && dd(b.next_service_date), b.next_service_km && `${b.next_service_km} كم`].filter(Boolean).join(" / ") || "—"}{b.service_due && <span className="mr-1 text-xs font-semibold text-destructive">مستحقة</span>}</td>
                  <td className={TD}><DocState d={b.inspection_date} s={b.inspection_state} /></td>
                  <td className={TD}><DocState d={b.license_expiry} s={b.license_state} /></td>
                  <td className={TD + " tabular-nums"}>{b.open_requests}</td>
                  <td className={TD}><div className="flex flex-wrap gap-1">
                    {b.can_fleet && <Button size="sm" variant="ghost" onClick={() => setEdit(b)}>تعديل</Button>}
                    {b.can_fleet && b.op_status !== "available" && <Button size="sm" variant="outline" onClick={() => void setStatus(b, "available")}>إعادة للخدمة</Button>}
                    {b.can_fleet && b.op_status === "available" && <Button size="sm" variant="ghost" onClick={() => void setStatus(b, "stopped")}>إيقاف</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setLog(log === b.id ? null : b.id)}>السجل</Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
      {log && <Panel title="سجل الباص">{logQ.isLoading ? <LoadingState rows={1} /> : <ul className="space-y-1 text-sm">{logQ.data?.map((l, i) => <li key={i}>{dt(l.at)} — {l.actor}: {l.action === "return_to_service" ? "إعادة للخدمة" : l.action === "status" ? `الحالة: ${BUS_STATUS[l.after?.op_status] ?? ""}` : l.action === "create" ? "إضافة" : "تعديل البيانات"}{l.note ? ` (${l.note})` : ""}</li>)}</ul>}</Panel>}
    </div>
  );
}

const DOC: Record<string, string> = { valid: "ساري", soon: "قارب على الانتهاء", expired: "منتهٍ" };
function DocState({ d, s }: { d?: string | null; s?: string | null }) {
  if (!d) return <span className="text-muted-foreground">—</span>;
  const c = s === "expired" ? "bg-destructive/10 text-destructive" : s === "soon" ? "bg-warning/15 text-warning-foreground" : "bg-success/10 text-success";
  return <span className="flex flex-col gap-0.5"><span className="tabular-nums">{dd(d)}</span><span className={"w-fit rounded-full px-2 py-0.5 text-xs " + c}>{DOC[s ?? ""]}</span></span>;
}

function BusForm({ bus, schools, onDone }: { bus: Row; schools: { id: string; name: string }[]; onDone: () => void }) {
  const [d, setD] = useState<Row>({ school: bus.school_id ?? schools[0]?.id, ...bus });
  const set = (k: string, v: unknown) => setD((x: Row) => ({ ...x, [k]: v }));
  async function save() {
    const data = { code: d.code, plate: d.plate, model: d.model, capacity: d.capacity ?? "", odometer: d.odometer ?? "", next_service_date: d.next_service_date ?? "", next_service_km: d.next_service_km ?? "", inspection_date: d.inspection_date ?? "", license_expiry: d.license_expiry ?? "", notes: d.notes, active: d.active ?? true };
    if (await run(db.rpc("mt_bus_save", { _id: bus.id ?? null, _school: d.school, _data: data }), "حُفظ الباص")) onDone();
  }
  return (
    <FormCard title={bus.id ? `تعديل الباص ${bus.code}` : "إضافة باص"}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!bus.id && schools.length > 1 && <Field label="الفرع"><select className={sel} value={d.school} onChange={(e) => set("school", e.target.value)}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Field label="رقم الباص"><Input value={d.code ?? ""} onChange={(e) => set("code", e.target.value)} /></Field>
        <Field label="اللوحة"><Input value={d.plate ?? ""} onChange={(e) => set("plate", e.target.value)} /></Field>
        <Field label="الطراز"><Input value={d.model ?? ""} onChange={(e) => set("model", e.target.value)} /></Field>
        <Field label="السعة"><Input type="number" min={0} value={d.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} /></Field>
        <Field label="قراءة العداد"><Input type="number" min={0} value={d.odometer ?? ""} onChange={(e) => set("odometer", e.target.value)} /></Field>
        <Field label="تاريخ الصيانة القادمة"><Input type="date" value={d.next_service_date ?? ""} onChange={(e) => set("next_service_date", e.target.value)} /></Field>
        <Field label="عداد الصيانة القادمة (كم)"><Input type="number" min={0} value={d.next_service_km ?? ""} onChange={(e) => set("next_service_km", e.target.value)} /></Field>
        <Field label="تاريخ الفحص الدوري القادم"><Input type="date" value={d.inspection_date ?? ""} onChange={(e) => set("inspection_date", e.target.value)} /></Field>
        <Field label="تاريخ انتهاء الترخيص"><Input type="date" value={d.license_expiry ?? ""} onChange={(e) => set("license_expiry", e.target.value)} /></Field>
        <Field label="ملاحظات" className="sm:col-span-2"><Input value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      <FormActions><Button onClick={() => void save()}>حفظ</Button><Button variant="ghost" onClick={onDone}>إلغاء</Button></FormActions>
    </FormCard>
  );
}

