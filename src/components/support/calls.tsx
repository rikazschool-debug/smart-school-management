import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Download, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, RefreshCw, Ticket } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Pill, fmt } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { exportXlsx } from "@/lib/export";
import { mqSync, mqTest } from "@/lib/maqsam.functions";
import { PRIO, useCategories } from "@/components/support/support";
import { AssigneePicker, type Assignee } from "@/components/support/assignee-picker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
export type MqSection = "live" | "calls" | "followups" | "reports" | "settings";
export type MqCaps = { enabled: boolean; owner?: boolean; manage?: boolean; own?: boolean; link?: boolean; listen?: boolean; download?: boolean; export?: boolean;
  schools?: { id: string; name: string }[]; link_schools?: { id: string; name: string }[]; agents?: { id: string; name: string }[]; sync?: { at: string | null; ok: boolean | null } };

const STATE: Record<string, string> = { initiated: "بدأت", in_progress: "جارية", completed: "مكتملة", busy: "مشغول", no_answer: "لم يُرد", canceled: "ملغاة", failed: "فشلت",
  aborted: "قُطعت", blocked: "محظورة", serviced: "تم الرد", abandoned: "تركها المتصل", dropped: "انقطعت", out_of_hours: "خارج الدوام" };
const OUTCOMES = ["تم الحل في المكالمة", "يحتاج متابعة", "طلب معاودة الاتصال", "لم يُرد", "رقم خاطئ", "تحويل إلى قسم آخر"];
const dur = (s: number) => `${Math.floor((s ?? 0) / 60)}:${String((s ?? 0) % 60).padStart(2, "0")}`;
const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await db.rpc(fn, args); if (error) throw error; return data; };

export function useMqCaps(orgId: string | null) {
  return useQuery({ queryKey: ["mq-caps", orgId], enabled: !!orgId, staleTime: 60_000, queryFn: async () => (await rpc("mq_caps", { _org: orgId })) as MqCaps });
}

export const MQ_LABEL: Record<MqSection, string> = { live: "لوحة الاتصال", calls: "المكالمات", followups: "المتابعات", reports: "تقارير الاتصال", settings: "إعدادات Maqsam" };
export function mqSections(c: MqCaps): MqSection[] {
  if (!c.enabled) return c.manage ? ["settings"] : [];
  return ["live", "calls", "followups", ...(c.export ? (["reports"] as const) : []), ...(c.manage ? (["settings"] as const) : [])];
}

function Dir({ r }: { r: Row }) {
  if (r.missed) return <span className="inline-flex items-center gap-1 text-destructive"><PhoneMissed className="size-4" /> فائتة</span>;
  return r.direction === "inbound" ? <span className="inline-flex items-center gap-1"><PhoneIncoming className="size-4" /> واردة</span> : <span className="inline-flex items-center gap-1"><PhoneOutgoing className="size-4" /> صادرة</span>;
}

function SyncBar({ orgId, caps }: { orgId: string; caps: MqCaps }) {
  const sync = useServerFn(mqSync);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);
  const go = async (force: boolean) => {
    setBusy(true);
    try { const r = await sync({ data: { orgId, force } }); if (!r.skipped) qc.invalidateQueries({ queryKey: ["mq"] }); if (force) toast.success(r.skipped ? "المزامنة جارية بالفعل" : `تمت المزامنة (${r.count ?? 0} سجل)`); }
    catch (e) { if (force) toast.error(arabicError(e)); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["mq-caps", orgId] }); }
  };
  useEffect(() => { if (!ran.current) { ran.current = true; void go(false); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>آخر مزامنة مع Maqsam: {caps.sync?.at ? fmt(caps.sync.at) : "لم تتم بعد"}{caps.sync?.ok === false ? " — فشلت آخر محاولة (التذاكر تعمل كالمعتاد)" : ""}</span>
      {caps.manage && <Button size="sm" variant="outline" disabled={busy} onClick={() => go(true)}><RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} /> مزامنة الآن</Button>}
    </div>
  );
}

type F = { school: string; agent: string; dir: string; kind: string; from: string; to: string; q: string; review: boolean };
const F0: F = { school: "", agent: "", dir: "", kind: "", from: "", to: "", q: "", review: false };

function Filters({ f, set, caps }: { f: F; set: (f: F) => void; caps: MqCaps }) {
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-4 lg:grid-cols-8">
      <select aria-label="الفرع" className={selectCls()} value={f.school} onChange={(e) => set({ ...f, school: e.target.value })}><option value="">كل الفروع</option>{caps.schools?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select aria-label="الموظف" className={selectCls()} value={f.agent} onChange={(e) => set({ ...f, agent: e.target.value })}><option value="">كل الموظفين</option>{caps.agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <select aria-label="الاتجاه" className={selectCls()} value={f.dir} onChange={(e) => set({ ...f, dir: e.target.value })}><option value="">كل الاتجاهات</option><option value="inbound">واردة</option><option value="outbound">صادرة</option></select>
      <select aria-label="الحالة" className={selectCls()} value={f.kind} onChange={(e) => set({ ...f, kind: e.target.value })}><option value="">كل الحالات</option><option value="answered">مُجابة</option><option value="missed">فائتة</option></select>
      <Input aria-label="من تاريخ" type="date" value={f.from} onChange={(e) => set({ ...f, from: e.target.value })} />
      <Input aria-label="إلى تاريخ" type="date" value={f.to} onChange={(e) => set({ ...f, to: e.target.value })} />
      <Input aria-label="بحث" placeholder="رقم أو اسم" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.review} onChange={(e) => set({ ...f, review: e.target.checked })} /> للمراجعة فقط</label>
    </div>
  );
}
const args = (orgId: string, f: F) => ({ _org: orgId, _school: f.school || null, _agent: f.agent || null, _dir: f.dir || null, _kind: f.kind || null, _from: f.from || null, _to: f.to || null, _q: f.q.trim() || null, _review: f.review });

export function CallsPanel({ orgId, caps, initial }: { orgId: string; caps: MqCaps; initial?: Partial<F> }) {
  const [f, setF] = useState<F>({ ...F0, ...initial });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["mq", "calls", orgId, f, page], queryFn: async () => rpc("mq_calls_list", { ...args(orgId, f), _limit: 25, _offset: page * 25 }) as Promise<{ total: number; rows: Row[] }> });
  if (open) return <CallDetail id={open} caps={caps} onBack={() => setOpen(null)} />;
  return (
    <div className="space-y-3">
      <SyncBar orgId={orgId} caps={caps} />
      <Filters f={f} set={(x) => { setF(x); setPage(0); }} caps={caps} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.rows.length ? <EmptyState title="لا توجد مكالمات" hint="لا توجد مكالمات ضمن نطاقك والفلاتر المحددة." /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground"><tr>{["الاتجاه", "الوقت", "الرقم", "المتصل", "الفرع", "الموظف", "المدة", "الحالة", "التذاكر", ""].map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{q.data.rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setOpen(r.id)}>
                <td className="p-2"><Dir r={r} /></td><td className="p-2 whitespace-nowrap">{fmt(r.started_at)}</td><td className="p-2" dir="ltr">{r.other_number ?? "—"}</td>
                <td className="p-2">{r.contact ?? (r.match_count > 1 ? <Pill tone="warn">تطابقات متعددة</Pill> : r.match_count === 1 ? "مطابق" : "غير معروف")}</td>
                <td className="p-2">{r.school ?? <Pill tone="warn">للمراجعة</Pill>}</td><td className="p-2">{r.agent ?? "—"}</td><td className="p-2">{dur(r.duration)}</td>
                <td className="p-2">{STATE[r.state] ?? r.state}</td><td className="p-2">{r.tickets || "—"}{r.open_followups ? <span className="ms-1"><Pill tone="warn">متابعة</Pill></span> : null}</td>
                <td className="p-2 text-primary">فتح</td>
              </tr>))}</tbody>
          </table>
          <div className="flex items-center justify-between border-t p-2 text-sm">
            <span>{q.data.total} مكالمة</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button><Button size="sm" variant="outline" disabled={(page + 1) * 25 >= q.data.total} onClick={() => setPage(page + 1)}>التالي</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function CallDetail({ id, caps, onBack }: { id: string; caps: MqCaps; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mq", "call", id], queryFn: () => rpc("mq_call_get", { _id: id }) });
  const [audio, setAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["mq"] });
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } };
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const c = q.data as Row;
  const rec = async (mode: "listen" | "download") => {
    try {
      const t = await rpc("mq_rec_ticket", { _call: id, _mode: mode });
      const url = `/api/public/maqsam/recording?t=${t}`;
      if (mode === "listen") setAudio(url); else window.location.assign(url);
    } catch (e) { toast.error(arabicError(e)); }
  };
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowRight className="size-4" /> رجوع إلى المكالمات</Button>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div><div className="text-xs text-muted-foreground">الاتجاه</div><Dir r={c} /></div>
        <div><div className="text-xs text-muted-foreground">الرقم</div><div dir="ltr" className="text-end sm:text-start">{c.other_number ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">الوقت والمدة</div>{fmt(c.started_at)} — {dur(c.duration)}</div>
        <div><div className="text-xs text-muted-foreground">الحالة</div>{STATE[c.state] ?? c.state}</div>
        <div><div className="text-xs text-muted-foreground">الموظف</div>{c.agent ?? "غير مربوط بمستخدم في ركاز"}</div>
        <div><div className="text-xs text-muted-foreground">رقم الخدمة</div><span dir="ltr">{c.service_number ?? "—"}</span></div>
      </div>

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h3 className="font-semibold">الفرع</h3>
        {c.can.set_school ? (
          <select aria-label="فرع المكالمة" className={selectCls()} disabled={busy} value={c.school_id ?? ""} onChange={(e) => e.target.value && act(() => rpc("mq_call_set_school", { _id: id, _school: e.target.value }), "تم تحديد الفرع")}>
            <option value="">— لم يُحدَّد (للمراجعة) —</option>{caps.link_schools?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : <p className="text-sm">{c.school ?? "لم يُحدَّد"}</p>}
        <p className="text-xs text-muted-foreground">يُحدَّد الفرع من رقم الخدمة، أو يختاره المخوَّل هنا — لا من المدرسة المفتوحة حاليًا.</p>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h3 className="font-semibold">المتصل</h3>
        {c.matches.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد تطابق لهذا الرقم داخل المجموعة.</p>}
        {c.matches.length > 1 && !c.contact_kind && <p className="text-sm text-accent-foreground">تطابقات متعددة — اختر الصحيح، لا يُربط تلقائيًا.</p>}
        <ul className="space-y-2">{c.matches.map((m: Row) => (
          <li key={m.kind + m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
            <div><b>{m.name}</b> <Pill>{m.kind === "guardian" ? "ولي أمر" : m.kind === "employee" ? "موظف" : "جهة اتصال"}</Pill> {m.school && <span className="text-muted-foreground">— {m.school}</span>}
              {m.children?.length ? <div className="text-xs text-muted-foreground">الأبناء: {m.children.map((k: Row) => `${k.name} (${k.school})`).join("، ")}</div> : null}</div>
            {c.can.link && (c.contact_kind === m.kind && c.contact_id === m.id ? <Pill tone="ok">المتصل المعتمد</Pill> : <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => rpc("mq_call_set_contact", { _id: id, _kind: m.kind, _cid: m.id }), "تم اعتماد المتصل")}>اعتماد</Button>)}
          </li>))}</ul>
        {c.can.link && c.phone_norm && <SaveContact id={id} onDone={refresh} />}
      </section>

      {(c.can.listen || c.can.download) && (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">التسجيل</h3>
          <div className="flex flex-wrap gap-2">
            {c.can.listen && <Button size="sm" variant="outline" onClick={() => rec("listen")}><Play className="size-4" /> استماع</Button>}
            {c.can.download && <Button size="sm" variant="outline" onClick={() => rec("download")}><Download className="size-4" /> تنزيل</Button>}
          </div>
          {audio && <audio controls autoPlay src={audio} className="w-full" onError={() => toast.error("التسجيل غير متاح لهذه المكالمة")} />}
          <p className="text-xs text-muted-foreground">يُسجَّل كل استماع وتنزيل. الرابط مؤقت وخاص بك.</p>
        </section>
      )}

      <CallTickets c={c} id={id} busy={busy} act={act} />
      <CallFollowups c={c} id={id} act={act} />
    </div>
  );
}

function SaveContact({ id, onDone }: { id: string; onDone: () => void }) {
  const [name, setName] = useState(""); const [note, setNote] = useState(""); const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>تسجيل المتصل كجهة اتصال</Button>;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Input placeholder="اسم المتصل" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" onClick={async () => { try { await rpc("mq_contact_save", { _id: id, _name: name, _note: note }); toast.success("تم حفظ جهة الاتصال (دون إنشاء حساب دخول)"); setOpen(false); onDone(); } catch (e) { toast.error(arabicError(e)); } }}>حفظ</Button>
    </div>
  );
}

function CallTickets({ c, id, busy, act }: { c: Row; id: string; busy: boolean; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [mode, setMode] = useState<"" | "new" | "link">("");
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [prio, setPrio] = useState("normal"); const [s, setS] = useState("");
  const key = useRef(crypto.randomUUID());
  const found = useQuery({ queryKey: ["mq", "tsearch", id, s], enabled: mode === "link", queryFn: () => rpc("mq_ticket_search", { _id: id, _q: s }) as Promise<Row[]> });
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">التذاكر المرتبطة</h3>
      {c.tickets.length ? <ul className="space-y-1 text-sm">{c.tickets.map((t: Row) => <li key={t.id}><a className="text-primary underline" href={`/app/support?t=${t.id}`}>{t.ref}</a> — {t.title}</li>)}</ul> : <p className="text-sm text-muted-foreground">لا توجد تذكرة مرتبطة.</p>}
      <p className="text-xs text-muted-foreground">انتهاء المكالمة لا يغيّر حالة التذكرة.</p>
      {c.can.link && <PendingForCall callId={id} onLinked={() => act(async () => null, "تم")} />}
      {c.can.link && (
        <>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setMode(mode === "new" ? "" : "new")}><Ticket className="size-4" /> تذكرة جديدة من المكالمة</Button><Button size="sm" variant="outline" onClick={() => setMode(mode === "link" ? "" : "link")}>ربط بتذكرة قائمة</Button></div>
          {mode === "new" && (
            <div className="space-y-2">
              {!c.school_id && <p className="text-sm text-destructive">حدّد فرع المكالمة أولًا.</p>}
              <Input placeholder="عنوان التذكرة" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="التفاصيل" value={body} onChange={(e) => setBody(e.target.value)} />
              <select aria-label="الأولوية" className={selectCls()} value={prio} onChange={(e) => setPrio(e.target.value)}><option value="low">منخفضة</option><option value="normal">عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select>
              <Button size="sm" disabled={busy || !c.school_id || title.trim().length < 3} onClick={() => act(() => rpc("mq_call_open_ticket", { _id: id, _title: title.trim(), _body: body.trim() || title.trim(), _priority: prio, _client_key: key.current }), "أُنشئت التذكرة وربطت بالمكالمة").then(() => setMode(""))}>إنشاء التذكرة</Button>
            </div>)}
          {mode === "link" && (
            <div className="space-y-2">
              <Input placeholder="ابحث برقم التذكرة أو عنوانها" value={s} onChange={(e) => setS(e.target.value)} />
              <ul className="space-y-1 text-sm">{(found.data ?? []).map((t) => <li key={t.id} className="flex items-center justify-between gap-2 rounded border p-2"><span>{t.ref} — {t.title} {t.school && <span className="text-muted-foreground">({t.school})</span>}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => rpc("mq_call_link_ticket", { _id: id, _ticket: t.id }), "تم الربط")}>ربط</Button></li>)}</ul>
            </div>)}
        </>
      )}
    </section>
  );
}

function CallFollowups({ c, id, act }: { c: Row; id: string; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [outcome, setOutcome] = useState(OUTCOMES[1]!); const [note, setNote] = useState(""); const [due, setDue] = useState(""); const [who, setWho] = useState("");
  const staff = useQuery({ queryKey: ["mq", "staff", c.school_id], enabled: c.can.link && !!c.school_id, queryFn: async () => {
    const { data } = await db.rpc("support_route_candidates", { _school: c.school_id, _dept: null }); return (data ?? []) as Row[]; } });
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">نتيجة الاتصال والمتابعة</h3>
      <ul className="space-y-1 text-sm">{c.followups.map((f: Row) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
          <span><b>{f.outcome}</b>{f.note ? ` — ${f.note}` : ""} <span className="text-muted-foreground">({f.by}، {fmt(f.created_at)}{f.due_at ? ` — موعد: ${fmt(f.due_at)}` : ""}{f.assignee ? ` — المسؤول: ${f.assignee}` : ""})</span></span>
          {f.done_at ? <Pill tone="ok">منجزة</Pill> : f.due_at || f.assignee ? <Button size="sm" variant="outline" onClick={() => act(() => rpc("mq_followup_done", { _id: f.id }), "تم إنجاز المتابعة")}>إنجاز</Button> : null}
        </li>))}</ul>
      {c.can.link && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label>النتيجة</Label><select className={selectCls()} value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></div>
          <div><Label>موعد المتابعة (اختياري)</Label><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div><Label>المسؤول عن المتابعة</Label><select className={selectCls()} value={who} onChange={(e) => setWho(e.target.value)}><option value="">— بلا مسؤول —</option>{(staff.data ?? []).map((p) => <option key={p.user_id ?? p.id} value={p.user_id ?? p.id}>{p.full_name ?? p.name}</option>)}</select></div>
          <div><Label>ملاحظات</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button size="sm" onClick={() => act(() => rpc("mq_followup_add", { _call: id, _outcome: outcome, _note: note, _due: due ? new Date(due).toISOString() : null, _assignee: who || null }), "تم تسجيل النتيجة").then(() => { setNote(""); setDue(""); })}>حفظ النتيجة</Button>
        </div>)}
    </section>
  );
}

export function FollowupsPanel({ orgId, onOpenCalls }: { orgId: string; onOpenCalls: () => void }) {
  const [status, setStatus] = useState("open"); const [mine, setMine] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mq", "fu", orgId, status, mine], queryFn: () => rpc("mq_followups_list", { _org: orgId, _school: null, _status: status, _mine: mine }) as Promise<Row[]> });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="الحالة" className={selectCls("w-auto")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">مفتوحة</option><option value="overdue">متأخرة</option><option value="done">منجزة</option><option value="all">الكل</option></select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> المسندة إليّ فقط</label>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد متابعات" hint="تظهر هنا متابعات المكالمات ضمن نطاقك." /> : (
        <ul className="space-y-2">{q.data.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
            <div><b>{f.outcome}</b> — <span dir="ltr">{f.number}</span>{f.contact ? ` (${f.contact})` : ""} <span className="text-muted-foreground">{f.school ?? "بلا فرع"} · {f.assignee ?? "بلا مسؤول"} · {f.due_at ? fmt(f.due_at) : "بلا موعد"}</span>{f.note && <div className="text-muted-foreground">{f.note}</div>}</div>
            <div className="flex items-center gap-2">{f.overdue && <Pill tone="bad">متأخرة</Pill>}{f.done_at ? <Pill tone="ok">منجزة</Pill> :
              <Button size="sm" variant="outline" onClick={async () => { try { await rpc("mq_followup_done", { _id: f.id }); qc.invalidateQueries({ queryKey: ["mq"] }); } catch (e) { toast.error(arabicError(e)); } }}>إنجاز</Button>}</div>
          </li>))}</ul>)}
      <Button variant="ghost" size="sm" onClick={onOpenCalls}>فتح المكالمات</Button>
    </div>
  );
}

export function ReportsPanel({ orgId, caps }: { orgId: string; caps: MqCaps }) {
  const [f, setF] = useState<F>(F0);
  const [drill, setDrill] = useState<Partial<F> | null>(null);
  const q = useQuery({ queryKey: ["mq", "rep", orgId, f.school, f.agent, f.from, f.to], queryFn: () => rpc("mq_report", { _org: orgId, _school: f.school || null, _agent: f.agent || null, _from: f.from || null, _to: f.to || null }) as Promise<Row> });
  if (drill) return <div className="space-y-2"><Button variant="ghost" size="sm" onClick={() => setDrill(null)}><ArrowRight className="size-4" /> رجوع للتقرير</Button><CallsPanel orgId={orgId} caps={caps} initial={drill} /></div>;
  const r = q.data;
  const base = { school: f.school, agent: f.agent, from: f.from, to: f.to };
  const exp = async () => {
    if (!r) return;
    const rows = [...r.by_school.map((x: Row) => ["فرع", x.name, x.total, x.inbound, x.outbound, x.missed, dur(x.duration ?? 0)]), ...r.by_agent.map((x: Row) => ["موظف", x.name, x.total, x.inbound, x.outbound, x.missed, dur(x.duration ?? 0)])];
    try { await rpc("mq_export_log", { _org: orgId, _what: "calls_report", _rows: rows.length }); exportXlsx({ title: "تقرير الاتصال", filters: [f.from && `من ${f.from}`, f.to && `إلى ${f.to}`].filter(Boolean) as string[] }, ["النوع", "الاسم", "الإجمالي", "واردة", "صادرة", "فائتة", "المدة"], rows); }
    catch (e) { toast.error(arabicError(e)); }
  };
  const Card = ({ label, v, d }: { label: string; v: number | string; d?: Partial<F> }) => (
    <button disabled={!d} onClick={() => d && setDrill({ ...base, ...d })} className="rounded-xl border bg-card p-3 text-start hover:bg-muted/30 disabled:cursor-default"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{v}</div></button>);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-5">
        <select aria-label="الفرع" className={selectCls()} value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">كل الفروع</option>{caps.schools?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select aria-label="الموظف" className={selectCls()} value={f.agent} onChange={(e) => setF({ ...f, agent: e.target.value })}><option value="">كل الموظفين</option>{caps.agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <Input aria-label="من" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input aria-label="إلى" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <Button variant="outline" onClick={exp} disabled={!r}><Download className="size-4" /> تصدير Excel</Button>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : r && (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Card label="الإجمالي" v={r.total} d={{}} /><Card label="واردة" v={r.inbound} d={{ dir: "inbound" }} /><Card label="صادرة" v={r.outbound} d={{ dir: "outbound" }} />
            <Card label="فائتة" v={r.missed} d={{ kind: "missed" }} /><Card label="إجمالي المدة" v={dur(r.duration)} /><Card label="متابعات مفتوحة / منجزة" v={`${r.followups_open} / ${r.followups_done}`} />
          </div>
          {(["by_school", "by_agent"] as const).map((k) => (
            <div key={k} className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm"><thead className="bg-muted/50"><tr>{[k === "by_school" ? "الفرع" : "الموظف", "الإجمالي", "واردة", "صادرة", "فائتة", "المدة"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
                <tbody>{r[k].map((x: Row) => <tr key={x.id ?? "none"} className="border-t"><td className="p-2">{x.name}</td><td className="p-2">{x.total}</td><td className="p-2">{x.inbound}</td><td className="p-2">{x.outbound}</td><td className="p-2">{x.missed}</td><td className="p-2">{dur(x.duration ?? 0)}</td></tr>)}</tbody></table>
            </div>))}
        </>
      )}
    </div>
  );
}

export function MqSettingsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const test = useServerFn(mqTest); const sync = useServerFn(mqSync);
  const q = useQuery({ queryKey: ["mq", "settings", orgId], queryFn: () => rpc("mq_settings", { _org: orgId }) as Promise<Row> });
  const [probe, setProbe] = useState(false);
  const [mic, setMic] = useState<string>("");
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); } catch (e) { toast.error(arabicError(e)); } finally { qc.invalidateQueries({ queryKey: ["mq"] }); qc.invalidateQueries({ queryKey: ["mq-caps", orgId] }); } };
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const s = q.data;
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <h3 className="font-semibold">حالة الربط</h3>
        <p>الحساب: <span dir="ltr">{s.base_url}</span> — مخصص لهذه المجموعة فقط. المفاتيح محفوظة في الخادم ولا تظهر هنا.</p>
        <p>آخر اختبار: {s.last_test_at ? `${fmt(s.last_test_at)} — ${s.last_test_ok ? "ناجح" : "فشل"}` : "لم يُختبر"}{s.last_test_ok === false && s.last_test_error ? ` (${s.last_test_error})` : ""}</p>
        <p>آخر مزامنة: {s.last_sync_at ? `${fmt(s.last_sync_at)} (${s.last_sync_count ?? 0} سجل)` : "لم تتم"}{s.last_sync_ok === false ? ` — فشلت آخر محاولة: ${s.last_sync_error ?? ""}` : ""}</p>
        <p>مكالمات بانتظار المراجعة (فرع غير محدد أو تطابقات متعددة): <b>{s.review}</b></p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => run(async () => { const r = await test({ data: { orgId } }); if (!r.ok) throw new Error(r.error); }, "الاتصال بـ Maqsam ناجح")}>اختبار الاتصال</Button>
          <Button size="sm" variant="outline" onClick={() => run(() => sync({ data: { orgId, force: true } }), "تمت المزامنة")}><RefreshCw className="size-4" /> مزامنة الآن</Button>
        </div>
        <p className="text-xs text-muted-foreground">تتم المزامنة تلقائيًا عند فتح شاشة المكالمات (مرة كل دقيقة على الأكثر) مع تداخل زمني لاستدراك أي انقطاع؛ تكرار السجل لا يضيف مكالمة.</p>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <h3 className="font-semibold">موظفو Maqsam ↔ مستخدمو ركاز</h3>
        {!s.agents.length && <p className="text-muted-foreground">لا يوجد موظفون بعد — شغّل المزامنة.</p>}
        {s.agents.map((a: Row) => (
          <div key={a.identifier} className="grid items-center gap-2 sm:grid-cols-3">
            <span>{a.name} {a.active === false && <Pill>غير نشط</Pill>}</span><span className="text-muted-foreground" dir="ltr">{a.email}</span>
            <select aria-label={`ربط ${a.name}`} className={selectCls()} value={a.user_id ?? ""} onChange={(e) => run(() => rpc("mq_agent_map", { _org: orgId, _identifier: a.identifier, _user: e.target.value || null }), "تم الربط")}>
              <option value="">— غير مربوط —</option>{s.staff.map((p: Row) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>))}
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <h3 className="font-semibold">أرقام الخدمة ↔ الفروع</h3>
        {!s.numbers.length && <p className="text-muted-foreground">تظهر الأرقام بعد أول مزامنة.</p>}
        {s.numbers.map((n: Row) => (
          <div key={n.number} className="grid items-center gap-2 sm:grid-cols-3">
            <span dir="ltr" className="text-end sm:text-start">{n.number}</span><span className="text-muted-foreground">{n.calls} مكالمة</span>
            <select aria-label={`فرع ${n.number}`} className={selectCls()} value={n.school_id ?? ""} onChange={(e) => run(() => rpc("mq_number_map", { _org: orgId, _number: n.number, _school: e.target.value || null, _label: null }), "تم الحفظ")}>
              <option value="">— بلا فرع (للمراجعة) —</option>{s.schools.map((x: Row) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>))}
        <p className="text-xs text-muted-foreground">رقم مشترك بين أكثر من فرع: اتركه بلا فرع ليحدد المخوَّل الفرع لكل مكالمة.</p>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <h3 className="font-semibold">فحص تمهيدي: تضمين لوحة اتصال Maqsam</h3>
        <p className="text-muted-foreground">لا يُجري أي اتصال. يفتح لوحة Maqsam داخل ركاز لنرى هل تسمح بالتضمين، وهل يعمل دخول الموظف، وهل يُمنح الميكروفون. الصوت داخل ركاز لا يُعتبر منجزًا قبل مكالمة واردة وصادرة فعلية يسمع فيها الطرفان بعضهما.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setProbe(!probe)}>{probe ? "إغلاق الفحص" : "فتح اللوحة داخل ركاز"}</Button>
          <Button size="sm" variant="outline" onClick={async () => { try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); setMic("مُنح الميكروفون لركاز"); } catch { setMic("رُفض الميكروفون أو غير متاح"); } }}>فحص الميكروفون</Button>
          {mic && <Pill tone={mic.startsWith("مُنح") ? "ok" : "bad"}>{mic}</Pill>}
        </div>
        {probe && <iframe title="Maqsam Dialer" src="https://portal.mq.maqsam.com/phone/dialer" allow="microphone; autoplay" className="h-[520px] w-full rounded-lg border" />}
      </section>
    </div>
  );
}

// Live call panel: the Maqsam dialer stays mounted on the right while the ticket form edits/saves in a side column.
// The service number is shared by all branches → the agent picks the branch; the call id is linked when already synced, else «بانتظار ربط المكالمة».
export function LivePanel({ orgId, caps, assignable }: { orgId: string; caps: MqCaps; assignable: { id: string; name: string }[] }) {
  const [side, setSide] = useState<"" | "new" | "link">("");
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-2 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-semibold">لوحة الاتصال (Maqsam)</h3>
          {caps.link && <><Button size="sm" variant={side === "new" ? "default" : "outline"} onClick={() => setSide(side === "new" ? "" : "new")}><Ticket className="size-4" /> إنشاء تذكرة</Button>
            <Button size="sm" variant={side === "link" ? "default" : "outline"} onClick={() => setSide(side === "link" ? "" : "link")}>ربط بتذكرة قائمة</Button></>}
        </div>
        <iframe title="Maqsam Dialer" src="https://portal.mq.maqsam.com/phone/dialer" allow="microphone; autoplay" className="h-[560px] w-full rounded-lg border" />
        <p className="text-xs text-muted-foreground">تبقى لوحة الاتصال مفتوحة أثناء تحرير التذكرة وحفظها.</p>
      </section>
      {side && <aside aria-label="نموذج التذكرة" className="rounded-xl border bg-card p-3">{side === "new" ? <LiveNew orgId={orgId} caps={caps} assignable={assignable} onClose={() => setSide("")} /> : <LiveLink orgId={orgId} onClose={() => setSide("")} />}</aside>}
    </div>
  );
}

function useRecent(orgId: string) {
  return useQuery({ queryKey: ["mq", "recent", orgId], refetchInterval: 30_000, queryFn: () => rpc("mq_recent_calls", { _org: orgId, _minutes: 120 }) as Promise<Row[]> });
}

function LiveNew({ orgId, caps, assignable, onClose }: { orgId: string; caps: MqCaps; assignable: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const schools = caps.link_schools ?? [];
  const [school, setSchool] = useState(schools.length === 1 ? schools[0]!.id : "");
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [prio, setPrio] = useState("normal"); const [cat, setCat] = useState("");
  const [who, setWho] = useState<Assignee | null>(null); const [call, setCall] = useState(""); const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ ticket: string; pending: boolean } | null>(null);
  const key = useRef(crypto.randomUUID());
  const cats = useCategories("school", orgId);
  const recent = useRecent(orgId);
  async function save() {
    if (!school) return void toast.error("اختر الفرع حسب موضوع المكالمة");
    setBusy(true);
    try {
      const r = (await rpc("mq_live_ticket", { _org: orgId, _school: school, _title: title.trim(), _body: body.trim(), _priority: prio, _category: cat || null, _assignee: who?.user_id ?? null, _call: call || null, _phone: phone || null, _client_key: key.current })) as { ticket: string; pending: boolean };
      setDone(r); qc.invalidateQueries({ queryKey: ["mq"] });
      toast.success(r.pending ? "حُفظت التذكرة — بانتظار ربط المكالمة" : "حُفظت التذكرة وربطت بالمكالمة");
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  if (done) return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold">حُفظت التذكرة</p>
      {done.pending ? <Pill tone="warn">بانتظار ربط المكالمة</Pill> : <Pill tone="ok">مرتبطة بالمكالمة</Pill>}
      {done.pending && <p className="text-xs text-muted-foreground">بعد مزامنة المكالمة، اربطها من سجل المكالمات.</p>}
      <div className="flex gap-2"><a className="text-primary underline" href={`/app/support?t=${done.ticket}`} target="_blank" rel="noreferrer">فتح التذكرة</a>
        <Button size="sm" variant="outline" onClick={onClose}>إغلاق</Button></div>
    </div>
  );
  return (
    <div className="space-y-3">
      <p className="font-semibold">تذكرة من المكالمة</p>
      <div className="space-y-1"><Label htmlFor="lv-school">الفرع (حسب موضوع المكالمة)</Label>
        <select id="lv-school" className={selectCls()} value={school} onChange={(e) => { setSchool(e.target.value); if (who) toast.message("أُزيل الموظف المختار؛ اختره من الفرع الجديد"); setWho(null); }}><option value="">اختر</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="lv-title">العنوان</Label><Input id="lv-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="lv-body">الوصف</Label><Textarea id="lv-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="lv-cat">التصنيف</Label><select id="lv-cat" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">بدون</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="lv-prio">الأولوية</Label><select id="lv-prio" className={selectCls()} value={prio} onChange={(e) => setPrio(e.target.value)}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <AssigneePicker id="lv-who" school={school} canAssign={assignable.some((b) => b.id === school)} who={who} onWho={setWho} />
      <div className="space-y-1"><Label htmlFor="lv-call">المكالمة</Label>
        <select id="lv-call" className={selectCls()} value={call} onChange={(e) => setCall(e.target.value)}>
          <option value="">لم تظهر بعد (بانتظار ربط المكالمة)</option>
          {(recent.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.other_number} · {fmt(c.started_at)}{c.contact_label ? ` · ${c.contact_label}` : ""}</option>)}
        </select></div>
      {!call && <div className="space-y-1"><Label htmlFor="lv-phone">رقم المتصل (يساعد على الربط لاحقًا)</Label><Input id="lv-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>}
      <div className="flex gap-2"><Button disabled={busy || !school || title.trim().length < 3 || body.trim().length < 5} onClick={save}>حفظ التذكرة</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>
    </div>
  );
}

function LiveLink({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const recent = useRecent(orgId);
  const [call, setCall] = useState(""); const [s, setS] = useState(""); const [busy, setBusy] = useState(false);
  const found = useQuery({ queryKey: ["mq", "tsearch", call, s], enabled: !!call, queryFn: () => rpc("mq_ticket_search", { _id: call, _q: s }) as Promise<Row[]> });
  return (
    <div className="space-y-3">
      <p className="font-semibold">ربط المكالمة بتذكرة قائمة</p>
      <select aria-label="المكالمة" className={selectCls()} value={call} onChange={(e) => setCall(e.target.value)}><option value="">اختر المكالمة</option>{(recent.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.other_number} · {fmt(c.started_at)}</option>)}</select>
      {!call && <p className="text-xs text-muted-foreground">إذا لم تظهر المكالمة بعد، أنشئ التذكرة الآن واربطها لاحقًا من سجل المكالمات.</p>}
      {call && <><Input placeholder="ابحث برقم التذكرة أو عنوانها" value={s} onChange={(e) => setS(e.target.value)} />
        <ul className="space-y-1 text-sm">{(found.data ?? []).map((t) => <li key={t.id} className="flex items-center justify-between gap-2 rounded border p-2"><span>{t.ref} — {t.title}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await rpc("mq_call_link_ticket", { _id: call, _ticket: t.id }); toast.success("تم الربط"); qc.invalidateQueries({ queryKey: ["mq"] }); onClose(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }}>ربط</Button></li>)}</ul></>}
    </div>
  );
}

export function PendingForCall({ callId, onLinked }: { callId: string; onLinked: () => void }) {
  const q = useQuery({ queryKey: ["mq", "pending", callId], queryFn: () => rpc("mq_pending_tickets", { _org: null, _call: callId }) as Promise<Row[]> });
  if (!q.data?.length) return null;
  return (
    <div className="space-y-1 rounded-lg border border-dashed p-2 text-sm">
      <p className="font-medium">تذاكر بانتظار ربط المكالمة</p>
      {q.data.map((t) => <div key={t.ticket_id} className="flex items-center justify-between gap-2"><span>{t.ref} — {t.title} <span className="text-muted-foreground">({t.school})</span></span>
        <Button size="sm" variant="outline" onClick={async () => { try { await rpc("mq_call_link_ticket", { _id: callId, _ticket: t.ticket_id }); toast.success("رُبطت التذكرة بالمكالمة"); q.refetch(); onLinked(); } catch (e) { toast.error(arabicError(e)); } }}>ربط بهذه المكالمة</Button></div>)}
    </div>
  );
}
