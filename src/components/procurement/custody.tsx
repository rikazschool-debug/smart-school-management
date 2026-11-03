import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Download, FileText, Plus } from "lucide-react";
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
  const items: [string, unknown, string?][] = [
    ["المصروف للعهدة", Number(bal.disbursed) + Number(bal.topups), Number(bal.topups) ? `منها تعزيز ${sar(bal.topups)}` : undefined], ["المعتمد صرفه", bal.spent], ["الاستردادات", bal.refunds],
    ...(Number(bal.returned) ? [["المعاد للإدارة", bal.returned] as [string, unknown]] : []), ...(Number(bal.carried) ? [["المرحّل (±)", bal.carried] as [string, unknown]] : []),
    ...(Number(bal.adjusted) ? [["فروق معالجة (±)", bal.adjusted] as [string, unknown]] : []),
    ["قيد المراجعة", bal.pending, "معلّق ولا يُخصم بعد"], ["الرصيد الدفتري", bal.book], ["المتاح للصرف", bal.available, "الدفتري ناقص المعلّق"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([l, v, h]) => (
        <div key={l} className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">{l}</p>
          <p className="mt-1 font-bold tabular-nums">{sar(v)}</p>
          {h && <p className="text-[11px] text-muted-foreground">{h}</p>}
        </div>
      ))}
    </div>
  );
}

export function LogList({ log }: { log: Row[] }) {
  if (!log?.length) return null;
  return (
    <details className="rounded-xl border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold">سجل العمليات ({log.length})</summary>
      <ul className="mt-2 space-y-1 text-sm">
        {log.map((l, i) => (
          <li key={i} className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{fmt(l.at)}</span><span className="font-medium">{ACTION[l.action] ?? l.action}</span><span>— {l.actor}</span>{l.reason && <span className="text-muted-foreground">«{l.reason}»</span>}</li>
        ))}
      </ul>
    </details>
  );
}

const PAGE = 20;
export function CustodyList({ orgId, me, open, onNew, orgName }: { orgId: string; me: PcMe; open: (id: string) => void; onNew?: (() => void) | undefined; orgName: string }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [school, setSchool] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const args = { _org: orgId, _status: status || null, _q: q || null, _school: school || null, _mine: mine };
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
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input className="w-56" placeholder="بحث بالمرجع أو الغرض أو المستلم" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className={selectCls("w-44")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="الحالة">
          <option value="">كل الحالات</option><option value="open">المفتوحة</option><option value="overdue">المتأخرة التسوية</option>
          {Object.entries(C_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {me.schools.length > 1 && (
          <select className={selectCls("w-40")} value={school} onChange={(e) => { setSchool(e.target.value); setPage(0); }} aria-label="الفرع">
            <option value="">كل الفروع</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(0); }} /> عهدي فقط</label>
        <span className="ms-auto flex gap-2">
          {me.caps.export && <><Button size="sm" variant="outline" onClick={() => void exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exp("pdf")}><FileText className="size-4" />PDF</Button></>}
          {onNew && <Button size="sm" onClick={onNew}><Plus className="size-4" />طلب عهدة</Button>}
        </span>
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => void list.refetch()} /> : !list.data?.rows.length ? (
        <EmptyState title="لا توجد عهد" hint={onNew ? "اطلب عهدة جديدة لتبدأ." : "لا توجد عهد ضمن نطاقك."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["المرجع", "المستلم", "الفرع", "الغرض", "الحالة", "المبلغ", "الرصيد", "المتاح", "التسوية"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {list.data.rows.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => open(c.id)}>
                  <td className="px-3 py-2 font-mono text-xs">{c.ref}</td><td className="px-3 py-2">{c.holder}</td><td className="px-3 py-2">{c.school}</td>
                  <td className="max-w-56 truncate px-3 py-2">{c.purpose}</td>
                  <td className="px-3 py-2"><Pill tone={TONE[c.status] ?? "muted"}>{C_STATUS[c.status]}</Pill>{c.overdue && <span className="ms-1"><Pill tone="bad">متأخرة</Pill></span>}</td>
                  <td className="px-3 py-2 tabular-nums">{sar(c.amount)}</td><td className="px-3 py-2 tabular-nums">{sar(c.bal.book)}</td><td className="px-3 py-2 tabular-nums">{sar(c.bal.available)}</td>
                  <td className="px-3 py-2">{day(c.settle_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
          <span>{page + 1} / {Math.ceil(total / PAGE)} ({total})</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>التالي</Button>
        </div>
      )}
    </div>
  );
}

export function CustodyForm({ orgId, me, initial, onDone, onCancel }: { orgId: string; me: PcMe; initial?: Row; onDone: (id: string) => void; onCancel: () => void }) {
  const createSchools = me.schools.filter((s) => me.create_schools.includes(s.id));
  const canOthers = me.caps.create && me.caps.create !== "own";
  const [school, setSchool] = useState<string>(initial?.school_id ?? createSchools[0]?.id ?? "");
  const [holder, setHolder] = useState<string[]>([initial?.holder_id ?? me.me]);
  const [extra, setExtra] = useState<string[]>(initial?.school_ids ?? []);
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [due, setDue] = useState(initial?.settle_due ?? "");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const inv = useInvalidate();
  async function save(submit: boolean) {
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
    <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-5">
      <h2 className="font-bold">{initial ? `تعديل ${initial.ref}` : "طلب عهدة جديدة"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>الفرع المسؤول</Label><select className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)}>{createSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
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
        <PeoplePicker purpose="pc_holder" school={school || null} org={orgId} value={holder} onChange={(v) => setHolder(v.length ? v : [me.me])} single label="مستلم العهدة" compact />
      ) : <p className="text-sm text-muted-foreground">المستلم: أنت (صلاحيتك تشمل عهدك الخاصة فقط).</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void save(true)}>حفظ وإرسال للاعتماد</Button>
        <Button disabled={busy} variant="outline" onClick={() => void save(false)}>حفظ مسودة</Button>
        <Button variant="ghost" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
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
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="font-semibold">صرف العهدة {sar(c.amount)}</h3>
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
    </div>
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
      <button className="inline-flex items-center gap-1 text-sm text-primary" onClick={back}><ArrowRight className="size-4" />العودة</button>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-5">
        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{c.ref}</p>
          <h2 className="text-lg font-bold">{c.purpose}</h2>
          <p className="text-sm text-muted-foreground">المستلم: {c.holder} · الفرع: {c.school}{c.schools?.filter((n: string) => n !== c.school).length ? ` · فروع مستفيدة: ${c.schools.filter((n: string) => n !== c.school).join("، ")}` : ""}</p>
          <p className="text-sm text-muted-foreground">المبلغ: <b className="text-foreground">{sar(c.amount)}</b> · موعد التسوية: {day(c.settle_due)} · مقدّم الطلب: {c.creator}</p>
          {c.decider && <p className="text-sm text-muted-foreground">القرار: {c.decider} — {fmt(c.decided_at)}{c.decision_reason ? ` «${c.decision_reason}»` : ""}</p>}
          {c.overdue_exception && <p className="text-sm text-warning">استثناء عهدة متأخرة: {c.overdue_exception}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="flex gap-1"><Pill tone={TONE[c.status] ?? "muted"}>{C_STATUS[c.status]}</Pill>{c.overdue && <Pill tone="bad">متأخرة التسوية</Pill>}</span>
          <div className="flex flex-wrap justify-end gap-2">
            {c.can.edit && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>تعديل</Button>}
            {c.can.submit && <Button size="sm" onClick={() => void act("submit", "أُرسلت للاعتماد")}>إرسال للاعتماد</Button>}
            {c.can.decide && <><Button size="sm" onClick={() => void approve()}>اعتماد</Button><Button size="sm" variant="outline" onClick={() => void act("return", "أُعيدت للاستكمال", true)}>إعادة للاستكمال</Button><Button size="sm" variant="destructive" onClick={() => void act("reject", "رُفضت", true)}>رفض</Button></>}
            {c.status === "submitted" && !c.can.decide && me.caps.approve && <span className="text-xs text-muted-foreground">لا يمكنك البت فيها (مقدّمها/مستلمها أو تتجاوز حدّك {me.limit != null ? sar(me.limit) : ""})</span>}
            {c.can.disburse && !disb && <Button size="sm" onClick={() => setDisb(true)}>صرف</Button>}
            {c.can.cancel && <Button size="sm" variant="ghost" onClick={() => void act("cancel", "أُلغيت", true)}>إلغاء</Button>}
            {c.can.expense && <Button size="sm" onClick={() => newExpense(c.id)}><Plus className="size-4" />تسجيل مصروف</Button>}
          </div>
        </div>
      </div>
      {c.can.ack && ack.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>صُرف لك {sar(ack.reduce((s, m) => s + Number(m.amount), 0))} — أكّد استلامك للمبلغ.</span>
          {ack.map((m) => <Button key={m.id} size="sm" onClick={async () => { if (await run(db.rpc("pc_ack", { _move: m.id }), "تم تأكيد الاستلام")) inv(); }}>تأكيد استلام {sar(m.amount)}</Button>)}
        </div>
      )}
      {disb && <DisburseForm c={c} onDone={() => setDisb(false)} />}
      {["disbursed", "settling", "closed"].includes(c.status) && <Balances bal={c.bal} />}
      {ops?.(c)}
      {Number(me.settings?.low_balance ?? 0) > 0 && c.status === "disbursed" && Number(c.bal.available) <= Number(me.settings!.low_balance) && <p className="text-sm text-warning">الرصيد المتاح منخفض (أقل من {sar(me.settings!.low_balance)}).</p>}
      <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-semibold">كشف حساب العهدة</h3>
          {c.moves.length > 0 && me.caps.export && <span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void statement("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void statement("pdf")}><FileText className="size-4" />PDF</Button></span>}
        </div>
        {!c.moves.length ? <p className="text-sm text-muted-foreground">لا حركات بعد — الرصيد يبدأ عند الصرف الفعلي.</p> : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["التاريخ", "الحركة", "المرجع", "البيان", "بواسطة", "المبلغ", "الرصيد", "الإثبات"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>{(c.moves as Row[]).map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2">{fmt(m.at)}</td><td className="px-3 py-2">{MOVE[m.kind] ?? m.kind}{m.method ? ` (${METHOD[m.method] ?? m.method})` : ""}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.expense_id ? <button className="text-primary" onClick={() => openExpense(m.expense_id)}>{m.ref}</button> : m.ref}</td>
                  <td className="px-3 py-2">{m.note ?? m.external_ref ?? ""}{m.ack_at ? <span className="ms-1 text-xs text-muted-foreground">· استُلم</span> : ""}</td><td className="px-3 py-2">{m.actor}</td>
                  <td className={`px-3 py-2 tabular-nums ${Number(m.amount) < 0 ? "text-destructive" : ""}`}>{sar(m.amount)}</td><td className="px-3 py-2 tabular-nums">{sar(m.balance)}</td>
                  <td className="px-3 py-2">{m.file && <button className="text-primary" onClick={() => void openFile(m.file)}>{m.file.name}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {c.expenses.length > 0 && (
        <section className="space-y-2"><h3 className="font-semibold">المصروفات على العهدة</h3>
          <ul className="divide-y rounded-xl border bg-card text-sm">{(c.expenses as Row[]).map((e) => (
            <li key={e.id} className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 hover:bg-muted/40" onClick={() => openExpense(e.id)}>
              <span className="font-mono text-xs">{e.ref}</span><span>{e.description}</span><span className="text-muted-foreground">{e.supplier}{e.invoice_no ? ` · ${e.invoice_no}` : ""}</span>
              <span className="ms-auto tabular-nums">{sar(e.total)}</span><Pill tone={TONE[e.status] ?? "muted"}>{e.status === "approved" ? "معتمد" : e.status === "draft" ? "مسودة" : e.status === "returned" ? "معاد" : e.status === "rejected" ? "مرفوض" : e.status === "cancelled" ? "ملغى" : "قيد المراجعة"}</Pill>
            </li>
          ))}</ul>
        </section>
      )}
      {c.files.length > 0 && <section className="space-y-2"><h3 className="font-semibold">المرفقات</h3><FileList files={files(c.files)} /></section>}
      <LogList log={c.log} />
    </div>
  );
}
