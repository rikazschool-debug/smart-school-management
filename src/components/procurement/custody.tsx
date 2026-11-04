import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Plus } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { FileList, Uploader, openFile } from "@/components/homework/files";
import { Pill, fmt } from "@/components/admin/shared";
import { PeoplePicker } from "@/components/people-picker";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { ACTION, C_STATUS, METHOD, MOVE, TONE, day, sar, todayRiyadh, type PcMe, type Row } from "@/components/procurement/shared";
import { ActionBox, BackLink, DateRange, DetailHeader, Field, FormActions, FormCard, Pager, Panel, SearchBox, Stat, StatGrid, TD, TDN, TH, THEAD, THN, TR, TRC, TableCard, Toolbar } from "@/components/procurement/ui";

const files = (fs: Row[]) => (fs ?? []).map((f: Row) => ({ ...f, size_bytes: f.size ?? 0 }));
export const useInvalidate = () => {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("pc-") }); };
};
const run = async (p: PromiseLike<{ error: unknown }>, ok?: string) => {
  const { error } = await p;
  if (error) { toast.error(arabicError(error)); return false; }
  if (ok) toast.success(ok);
  return true;
};

export function Balances({ bal }: { bal: Row }) {
  const items: [string, unknown, (string | undefined)?][] = [
    ["المصروف للعهدة", Number(bal.disbursed) + Number(bal.topups), Number(bal.topups) ? `منها تعزيز ${sar(bal.topups)}` : undefined], ["المعتمد صرفه", bal.spent], ["الاستردادات", bal.refunds],
    ...(Number(bal.returned) ? [["المعاد للإدارة", bal.returned] as [string, unknown]] : []), ...(Number(bal.carried) ? [["المرحّل (±)", bal.carried] as [string, unknown]] : []),
    ...(Number(bal.adjusted) ? [["فروق معالجة (±)", bal.adjusted] as [string, unknown]] : []),
    ["قيد المراجعة", bal.pending, "معلّق ولا يُخصم بعد"], ["الرصيد الدفتري", bal.book], ["المتاح للصرف", bal.available, "الدفتري ناقص المعلّق"],
  ];
  return (
    <StatGrid cols={6}>
      {items.map(([l, v, h]) => <Stat key={l} label={l} value={sar(v)} hint={h} tone={l === "المتاح للصرف" ? "primary" : l === "قيد المراجعة" && Number(v) ? "warn" : "default"} />)}
    </StatGrid>
  );
}

export function LogList({ log }: { log: Row[] }) {
  if (!log?.length) return null;
  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold">سجل العمليات <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">{log.length}</span></summary>
      <ol className="space-y-2 border-t px-4 py-3 text-sm">
        {log.map((l, i) => (
          <li key={i} className="relative flex flex-wrap gap-x-2 border-s-2 border-primary/20 ps-3"><span className="font-medium">{ACTION[l.action] ?? l.action}</span><span>— {l.actor}</span><span className="text-xs text-muted-foreground">{fmt(l.at)}</span>{l.reason && <span className="w-full text-muted-foreground">«{l.reason}»</span>}</li>
        ))}
      </ol>
    </details>
  );
}

const PAGE = 20;
export function CustodyList({ orgId, me, open, onNew, orgName }: { orgId: string; me: PcMe; open: (id: string) => void; onNew?: (() => void) | undefined; orgName: string }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [school, setSchool] = useState("");
  const [mine, setMine] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const args = { _org: orgId, _status: status || null, _q: q || null, _school: school || null, _mine: mine, _from: from || null, _to: to || null };
  const list = useQuery({
    queryKey: ["pc-custodies", args, page],
    queryFn: async () => {
      const { data, error } = await db.rpc("pc_custody_list", { ...args, _limit: PAGE, _offset: page * PAGE });
      if (error) throw error;
      return data as { total: number; rows: Row[] };
    },
  });
  async function exp(kind: "xlsx" | "pdf") {
    const { data, error } = await db.rpc("pc_custody_list", { ...args, _limit: 5000, _offset: 0 });
    if (error) { toast.error(arabicError(error)); return; }
    const rows = (data.rows as Row[]).map((c) => [c.ref, c.holder, c.school, c.purpose, C_STATUS[c.status] ?? c.status, Number(c.amount), Number(c.bal.spent), Number(c.bal.pending), Number(c.bal.book), day(c.settle_due)]);
    const meta = { title: "سجل العهد المالية", school: orgName, filters: [status && `الحالة: ${C_STATUS[status] ?? status}`, q && `بحث: ${q}`, mine ? "عهدي فقط" : ""].filter(Boolean) as string[] };
    const h = ["المرجع", "المستلم", "الفرع", "الغرض", "الحالة", "المبلغ", "المصروف", "المعلّق", "الرصيد", "موعد التسوية"];
    if (kind === "xlsx") exportXlsx(meta, h, rows); else await exportPdf(meta, h, rows);
  }
  const total = list.data?.total ?? 0;
  const sums = (list.data?.rows ?? []).reduce((a, c) => ({ amount: a.amount + Number(c.amount), book: a.book + Number(c.bal.book), avail: a.avail + Number(c.bal.available) }), { amount: 0, book: 0, avail: 0 });
  return (
    <div className="space-y-3">
      <Toolbar actions={<>
        {me.caps.export && <><Button size="sm" variant="outline" onClick={() => void exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exp("pdf")}><FileText className="size-4" />PDF</Button></>}
        {onNew && <Button size="sm" onClick={onNew}><Plus className="size-4" />{me.caps.create && me.caps.create !== "own" ? "إضافة عهدة" : "طلب عهدة"}</Button>}
      </>}>
        <SearchBox placeholder="المرجع أو الغرض أو المستلم" value={q} onChange={(v) => { setQ(v); setPage(0); }} />
        <Field label="الحالة"><select className={selectCls("w-44", true)} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">كل الحالات</option><option value="open">المفتوحة</option><option value="overdue">المتأخرة التسوية</option><option value="past">سجل العهد السابقة</option>
          {Object.entries(C_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></Field>
        {me.schools.length > 1 && (
          <Field label="الفرع"><select className={selectCls("w-40", true)} value={school} onChange={(e) => { setSchool(e.target.value); setPage(0); }}>
            <option value="">كل الفروع</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></Field>
        )}
        <DateRange from={from} to={to} setFrom={(v) => { setFrom(v); setPage(0); }} setTo={(v) => { setTo(v); setPage(0); }} />
        <label className="flex h-9 items-center gap-1.5 text-sm"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(0); }} /> عهدي فقط</label>
      </Toolbar>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => void list.refetch()} /> : !list.data?.rows.length ? (
        <EmptyState title="لا توجد عهد" hint={onNew ? "اطلب عهدة جديدة لتبدأ." : "لا توجد عهد ضمن نطاقك."} />
      ) : (
        <TableCard caption={<><span><b className="text-foreground tabular-nums">{total}</b> عهدة</span><span>المبالغ في الصفحة {sar(sums.amount)}</span><span>الرصيد {sar(sums.book)}</span><span>المتاح <b className="text-foreground">{sar(sums.avail)}</b></span></>}>
          <table className="w-full text-sm">
            <thead className={THEAD}><tr>
              {["المرجع", "المستلم", "الفرع", "الغرض", "الحالة"].map((h) => <th key={h} className={TH}>{h}</th>)}
              {["المبلغ", "الرصيد", "المتاح"].map((h) => <th key={h} className={THN}>{h}</th>)}<th className={TH}>التسوية</th>
            </tr></thead>
            <tbody>
              {list.data.rows.map((c) => (
                <tr key={c.id} className={TRC} onClick={() => open(c.id)}>
                  <td className={`${TD} font-mono text-xs`}>{c.ref}</td><td className={`${TD} font-medium`}>{c.holder}</td><td className={TD}>{c.school}</td>
                  <td className={`${TD} max-w-56 truncate`}>{c.purpose}</td>
                  <td className={TD}><span className="flex flex-wrap gap-1"><Pill tone={TONE[c.status] ?? "muted"}>{C_STATUS[c.status]}</Pill>{c.overdue && <Pill tone="bad">متأخرة</Pill>}</span></td>
                  <td className={TDN}>{sar(c.amount)}</td><td className={TDN}>{sar(c.bal.book)}</td><td className={`${TDN} font-semibold`}>{sar(c.bal.available)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{day(c.settle_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
      <Pager page={page} total={total} size={PAGE} setPage={setPage} />
    </div>
  );
}

export function CustodyForm({ orgId, me, initial, onDone, onCancel }: { orgId: string; me: PcMe; initial?: Row; onDone: (id: string) => void; onCancel: () => void }) {
  const createSchools = me.schools.filter((s) => me.create_schools.includes(s.id));
  const canOthers = me.caps.create && me.caps.create !== "own";
  const [school, setSchool] = useState<string>(initial?.school_id ?? createSchools[0]?.id ?? "");
  const [holder, setHolder] = useState<string[]>(initial?.holder_id ? [initial.holder_id] : canOthers ? [] : [me.me]);
  const [extra, setExtra] = useState<string[]>(initial?.school_ids ?? []);
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [due, setDue] = useState(initial?.settle_due ?? "");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const inv = useInvalidate();
  // The org owner creates and approves in one step for a chosen branch + procurement officer (pc_custody_save_approve).
  const ownerDirect = me.is_owner && !initial;
  async function saveApprove() {
    if (!school) { toast.error("اختر الفرع"); return; }
    if (!holder[0] || holder[0] === me.me) { toast.error("اختر مسؤول المشتريات المستفيد"); return; }
    setBusy(true);
    const { data, error } = await db.rpc("pc_custody_save_approve", { _org: orgId, _school: school, _school_ids: extra.filter((x) => x !== school), _holder: holder[0],
      _purpose: purpose, _amount: Number(amount), _due: due || null, _key: key });
    setBusy(false);
    if (error) { toast.error(arabicError(error)); return; }
    toast.success("حُفظت العهدة واعتُمدت للفرع ومسؤول المشتريات"); inv(); onDone(data as string);
  }
  async function save(submit: boolean) {
    if (canOthers && !holder[0]) { toast.error("اختر مسؤول المشتريات المنسوب إليه العهدة"); return; }
    setBusy(true);
    const { data, error } = await db.rpc("pc_custody_save", { _org: orgId, _id: initial?.id ?? null, _school: school, _school_ids: extra.filter((x) => x !== school), _holder: holder[0] ?? me.me,
      _purpose: purpose, _amount: Number(amount), _due: due || null, _rev: initial?.rev ?? 0, _key: initial ? null : key });
    if (error) { setBusy(false); toast.error(arabicError(error)); return; }
    const id = data as string;
    if (submit) {
      const g = await db.rpc("pc_custody_get", { _id: id });
      if (g.error || !(await run(db.rpc("pc_custody_action", { _id: id, _action: "submit", _rev: g.data.rev, _reason: null }), "أُرسلت العهدة للاعتماد"))) { setBusy(false); inv(); onDone(id); return; }
    } else toast.success("حُفظت المسودة");
    setBusy(false); inv(); onDone(id);
  }
  if (!createSchools.length) return <EmptyState title="لا تملك طلب عهدة" hint="اطلب من مالك المؤسسة منحك صلاحية الإنشاء." />;
  return (
    <FormCard title={initial ? `تعديل ${initial.ref}` : canOthers ? "إضافة عهدة" : "طلب عهدة جديدة"} subtitle={ownerDirect ? "حدّد الفرع ومسؤول المشتريات المستفيد؛ تُعتمد العهدة فور الحفظ ثم تُصرف بإثبات، والرصيد يبدأ عند الصرف الفعلي." : "تُرسل للاعتماد ثم تُصرف بإثبات؛ الرصيد يبدأ عند الصرف الفعلي."}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>الجهة المستفيدة</Label><select className={selectCls()} value={unit === "branch" ? school : unit} onChange={(e) => { const v = e.target.value; setHolder([]); if (v === "mt_bus" || v === "mt_school") setUnit(v); else { setUnit("branch"); setSchool(v); } }}>
          <optgroup label="الفروع">{createSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          {canOthers && <optgroup label="أقسام الصيانة"><option value="mt_bus">صيانة الباصات</option><option value="mt_school">صيانة المدارس</option></optgroup>}
        </select></div>
        {unit !== "branch" && <div><Label>الفرع المقيّدة عليه العهدة</Label><select className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)}>{createSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        <div><Label>المبلغ (ريال سعودي)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
        <div className="sm:col-span-2"><Label>الغرض</Label><Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} /></div>
        <div><Label>موعد التسوية</Label><Input type="date" min={todayRiyadh()} value={due} onChange={(e) => setDue(e.target.value)} /></div>
        {me.schools.length > 1 && (
          <div><Label>فروع مستفيدة أخرى (اختياري)</Label>
            <div className="flex flex-wrap gap-2 pt-1 text-sm">{me.schools.filter((s) => s.id !== school).map((s) => (
              <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={extra.includes(s.id)} onChange={(e) => setExtra(e.target.checked ? [...extra, s.id] : extra.filter((x) => x !== s.id))} />{s.name}</label>
            ))}</div>
          </div>
        )}
      </div>
      {canOthers ? (
        <PeoplePicker key={unit + school} purpose={unit === "mt_bus" ? "pc_holder_mt_bus" : unit === "mt_school" ? "pc_holder_mt_school" : "pc_holder"} school={unit === "branch" ? school || null : null} org={orgId} value={holder} onChange={setHolder} single
          label={unit === "branch" ? "مستلم العهدة (من له صلاحية استلام العهد في الفرع)" : unit === "mt_bus" ? "مستلم العهدة (مدير أو مسؤول صيانة الباصات)" : "مستلم العهدة (مدير أو مسؤول صيانة المدارس)"} compact />
      ) : <p className="text-sm text-muted-foreground">المستلم: أنت (صلاحيتك تشمل عهدك الخاصة فقط).</p>}
      <FormActions>
        {ownerDirect ? <Button disabled={busy} onClick={() => void saveApprove()}>حفظ واعتماد</Button>
          : <Button disabled={busy} onClick={() => void save(true)}>حفظ وإرسال للاعتماد</Button>}
        <Button disabled={busy} variant="outline" onClick={() => void save(false)}>حفظ مسودة</Button>
        <Button variant="ghost" onClick={onCancel}>إلغاء</Button>
      </FormActions>
    </FormCard>
  );
}

function DisburseForm({ c, onDone }: { c: Row; onDone: () => void }) {
  const [method, setMethod] = useState("transfer");
  const [ext, setExt] = useState("");
  const [doc, setDoc] = useState(todayRiyadh());
  const [note, setNote] = useState("");
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const inv = useInvalidate();
  const fs = files(c.files);
  return (
    <ActionBox title={`صرف العهدة ${sar(c.amount)}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label>طريقة الصرف</Label><select className={selectCls()} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><Label>رقم العملية / المرجع الخارجي{method !== "cash" ? " (إلزامي)" : ""}</Label><Input value={ext} onChange={(e) => setExt(e.target.value)} /></div>
        <div><Label>تاريخ المستند</Label><Input type="date" max={todayRiyadh()} value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
        <div className="sm:col-span-3"><Label>ملاحظة</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <Label>إثبات الصرف (إلزامي)</Label>
        <Uploader label="رفع إثبات" create={async (f) => { const { data, error } = await db.rpc("create_pc_file", { _entity: "custody", _id: c.id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }}
          release={(id) => db.rpc("pc_file_remove", { _file: id })} onDone={inv} />
        {fs.length > 0 && (
          <select className={selectCls()} value={file} onChange={(e) => setFile(e.target.value)} aria-label="الإثبات">
            <option value="">— اختر ملف الإثبات —</option>{fs.map((f: Row) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
      <Button disabled={busy || !file || (method !== "cash" && !ext.trim())} onClick={async () => {
        if (!(await ask(`تأكيد صرف ${sar(c.amount)} إلى ${c.holder}؟ لا يمكن التراجع عن الحركة.`))) return;
        setBusy(true);
        const ok = await run(db.rpc("pc_disburse", { _id: c.id, _rev: c.rev, _method: method, _external_ref: ext || null, _file: file, _doc_date: doc, _note: note || null, _key: key }), "سُجّل الصرف");
        setBusy(false); if (ok) { inv(); onDone(); }
      }}>تأكيد الصرف</Button>
    </ActionBox>
  );
}

export function CustodyDetail({ id, me, orgName, back, openExpense, newExpense, ops }: { id: string; me: PcMe; orgName: string; back: () => void; openExpense: (id: string) => void; newExpense: (custody: string) => void; ops?: (c: Row) => React.ReactNode }) {
  const q = useQuery({
    queryKey: ["pc-custody", id],
    queryFn: async () => { const { data, error } = await db.rpc("pc_custody_get", { _id: id }); if (error) throw error; return data as Row; },
  });
  const [editing, setEditing] = useState(false);
  const [disb, setDisb] = useState(false);
  const inv = useInvalidate();
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const c = q.data!;
  if (editing) return <CustodyForm orgId={c.org_id} me={me} initial={c} onDone={() => { setEditing(false); inv(); }} onCancel={() => setEditing(false)} />;
  const act = async (action: string, msg: string, needReason = false, exception?: string | null) => {
    let reason: string | null = null;
    if (needReason) { reason = await askText("اذكر السبب", { required: true }); if (!reason) return; }
    if (await run(db.rpc("pc_custody_action", { _id: c.id, _action: action, _rev: c.rev, _reason: reason, _exception: exception ?? null }), msg)) inv();
  };
  async function approve() {
    let exc: string | null = null;
    if (c.overdue_count > 0 && me.settings?.block_overdue) {
      exc = await askText(`للمستلم ${c.overdue_count} عهدة متأخرة التسوية. اكتب سبب الاستثناء للاعتماد:`, { required: true });
      if (!exc) return;
    } else if (!(await ask(`اعتماد عهدة ${sar(c.amount)} لـ ${c.holder}؟ الاعتماد لا يعني الصرف.`))) return;
    await act("approve", "اعتُمدت العهدة", false, exc);
  }
  async function statement(kind: "xlsx" | "pdf") {
    const rows = (c.moves as Row[]).map((m) => [day(m.at), MOVE[m.kind] ?? m.kind, m.ref, m.note ?? "", Number(m.amount), Number(m.balance)]);
    const meta = { title: `كشف حساب العهدة ${c.ref}`, school: orgName, filters: [`المستلم: ${c.holder}`, `الفرع: ${c.school}`], note: `الرصيد الدفتري: ${sar(c.bal.book)} — المعلّق: ${sar(c.bal.pending)}` };
    const h = ["التاريخ", "الحركة", "المرجع", "البيان", "المبلغ", "الرصيد"];
    if (kind === "xlsx") exportXlsx(meta, h, rows); else await exportPdf(meta, h, rows);
  }
  const ack = (c.moves as Row[]).filter((m) => ["disburse", "topup", "carry_in"].includes(m.kind) && !m.ack_at);
  return (
    <div className="space-y-4">
      <BackLink onClick={back} label="العهد" />
      <DetailHeader refText={c.ref} title={c.purpose}
        status={<><Pill tone={TONE[c.status] ?? "muted"}>{C_STATUS[c.status]}</Pill>{c.overdue && <Pill tone="bad">متأخرة التسوية</Pill>}</>}
        facts={[
          ["المستلم", c.holder], ["الفرع", c.school], ["المبلغ", <b key="a" className="tabular-nums">{sar(c.amount)}</b>], ["موعد التسوية", day(c.settle_due)],
          ["مقدّم الطلب", c.creator],
          ...(c.schools?.filter((n: string) => n !== c.school).length ? [["فروع مستفيدة", c.schools.filter((n: string) => n !== c.school).join("، ")] as [string, React.ReactNode]] : []),
          ...(c.decider ? [["القرار", `${c.decider} — ${fmt(c.decided_at)}${c.decision_reason ? ` «${c.decision_reason}»` : ""}`] as [string, React.ReactNode]] : []),
        ]}
        actions={<>
          {c.can.edit && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>تعديل</Button>}
          {c.can.submit && <Button size="sm" onClick={() => void act("submit", "أُرسلت للاعتماد")}>إرسال للاعتماد</Button>}
          {c.can.decide && <><Button size="sm" onClick={() => void approve()}>اعتماد</Button><Button size="sm" variant="outline" onClick={() => void act("return", "أُعيدت للاستكمال", true)}>إعادة للاستكمال</Button><Button size="sm" variant="destructive" onClick={() => void act("reject", "رُفضت", true)}>رفض</Button></>}
          {c.can.disburse && !disb && <Button size="sm" onClick={() => setDisb(true)}>صرف</Button>}
          {c.can.cancel && <Button size="sm" variant="ghost" onClick={() => void act("cancel", "أُلغيت", true)}>إلغاء</Button>}
          {c.can.expense && <Button size="sm" onClick={() => newExpense(c.id)}><Plus className="size-4" />تسجيل مصروف</Button>}
        </>}>
        {c.overdue_exception && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">استثناء عهدة متأخرة: {c.overdue_exception}</p>}
        {c.status === "submitted" && !c.can.decide && me.caps.approve && <p className="text-xs text-muted-foreground">لا يمكنك البت فيها (مقدّمها/مستلمها أو تتجاوز حدّك {me.limit != null ? sar(me.limit) : ""})</p>}
      </DetailHeader>
      {c.can.ack && ack.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <span>صُرف لك {sar(ack.reduce((s, m) => s + Number(m.amount), 0))} — أكّد استلامك للمبلغ.</span>
          {ack.map((m) => <Button key={m.id} size="sm" onClick={async () => { if (await run(db.rpc("pc_ack", { _move: m.id }), "تم تأكيد الاستلام")) inv(); }}>تأكيد استلام {sar(m.amount)}</Button>)}
        </div>
      )}
      {disb && <DisburseForm c={c} onDone={() => setDisb(false)} />}
      {["disbursed", "settling", "closed"].includes(c.status) && <Balances bal={c.bal} />}
      {ops?.(c)}
      {Number(me.settings?.low_balance ?? 0) > 0 && c.status === "disbursed" && Number(c.bal.available) <= Number(me.settings!.low_balance) && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">الرصيد المتاح منخفض (أقل من {sar(me.settings!.low_balance)}).</p>}
      <Panel title="كشف حساب العهدة" count={c.moves.length} flush
        actions={c.moves.length > 0 && me.caps.export ? <><Button size="sm" variant="outline" onClick={() => void statement("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void statement("pdf")}><FileText className="size-4" />PDF</Button></> : undefined}>
        {!c.moves.length ? <p className="p-4 text-sm text-muted-foreground">لا حركات بعد — الرصيد يبدأ عند الصرف الفعلي.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={THEAD}><tr>{["التاريخ", "الحركة", "المرجع", "البيان", "بواسطة"].map((h) => <th key={h} className={TH}>{h}</th>)}<th className={THN}>المبلغ</th><th className={THN}>الرصيد</th><th className={TH}>الإثبات</th></tr></thead>
              <tbody>{(c.moves as Row[]).map((m) => (
                <tr key={m.id} className={TR}>
                  <td className={`${TD} whitespace-nowrap`}>{fmt(m.at)}</td><td className={TD}>{MOVE[m.kind] ?? m.kind}{m.method ? ` (${METHOD[m.method] ?? m.method})` : ""}</td>
                  <td className={`${TD} font-mono text-xs`}>{m.expense_id ? <button className="text-primary" onClick={() => openExpense(m.expense_id)}>{m.ref}</button> : m.ref}</td>
                  <td className={TD}>{m.note ?? m.external_ref ?? ""}{m.ack_at ? <span className="ms-1 text-xs text-muted-foreground">· استُلم</span> : ""}</td><td className={TD}>{m.actor}</td>
                  <td className={`${TDN} ${Number(m.amount) < 0 ? "text-destructive" : ""}`}>{sar(m.amount)}</td><td className={`${TDN} font-semibold`}>{sar(m.balance)}</td>
                  <td className={TD}>{m.file && <button className="text-primary" onClick={() => void openFile(m.file)}>{m.file.name}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      {c.expenses.length > 0 && (
        <Panel title="المصروفات على العهدة" count={c.expenses.length} flush>
          <ul className="divide-y text-sm">{(c.expenses as Row[]).map((e) => (
            <li key={e.id} className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-muted/40" onClick={() => openExpense(e.id)}>
              <span className="font-mono text-xs">{e.ref}</span><span className="font-medium">{e.description}</span><span className="text-muted-foreground">{e.supplier}{e.invoice_no ? ` · ${e.invoice_no}` : ""}</span>
              <span className="ms-auto tabular-nums">{sar(e.total)}</span><Pill tone={TONE[e.status] ?? "muted"}>{e.status === "approved" ? "معتمد" : e.status === "draft" ? "مسودة" : e.status === "returned" ? "معاد" : e.status === "rejected" ? "مرفوض" : e.status === "cancelled" ? "ملغى" : "قيد المراجعة"}</Pill>
            </li>
          ))}</ul>
        </Panel>
      )}
      {c.files.length > 0 && <Panel title="المرفقات" count={c.files.length}><FileList files={files(c.files)} /></Panel>}
      <LogList log={c.log} />
    </div>
  );
}
