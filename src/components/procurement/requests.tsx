import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { FileList, Uploader } from "@/components/homework/files";
import { Pill, fmt } from "@/components/admin/shared";
import { PeoplePicker } from "@/components/people-picker";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { METHOD, day, sar, todayRiyadh, type PcMe, type Row } from "@/components/procurement/shared";
import { LogList, useInvalidate } from "@/components/procurement/custody";

export const R_KIND: Record<string, string> = { topup: "تعزيز عهدة", settlement: "تسوية عهدة", purchase: "شراء مسبق", adjust: "معالجة عجز/زيادة", transfer: "نقل عهدة لشخص آخر" };
export const R_STATUS: Record<string, string> = { draft: "مسودة", submitted: "بانتظار القرار", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى", done: "منفّذ" };
const R_TONE: Record<string, "muted" | "warn" | "ok" | "bad"> = { draft: "muted", submitted: "warn", approved: "ok", rejected: "bad", cancelled: "muted", done: "ok" };
const files = (fs: Row[]) => (fs ?? []).map((f: Row) => ({ ...f, size_bytes: f.size ?? 0 }));
const run = async (p: PromiseLike<{ error: unknown }>, ok?: string) => {
  const { error } = await p;
  if (error) { toast.error(arabicError(error)); return false; }
  if (ok) toast.success(ok);
  return true;
};
const PAGE = 20;
const amountText = (r: Row) => (r.amount == null ? "—" : sar(r.amount));

export function RequestList({ orgId, me, open, onNew, orgName }: { orgId: string; me: PcMe; open: (id: string) => void; onNew?: (() => void) | undefined; orgName: string }) {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const args = { _org: orgId, _kind: kind || null, _status: status || null, _q: q || null, _custody: null };
  const list = useQuery({
    queryKey: ["pc-requests", args, page],
    queryFn: async () => { const { data, error } = await db.rpc("pc_request_list", { ...args, _limit: PAGE, _offset: page * PAGE }); if (error) throw error; return data as { total: number; rows: Row[] }; },
  });
  async function exp(kindX: "xlsx" | "pdf") {
    const { data, error } = await db.rpc("pc_request_list", { ...args, _limit: 5000, _offset: 0 });
    if (error) { toast.error(arabicError(error)); return; }
    const rows = (data.rows as Row[]).map((r) => [r.ref, R_KIND[r.kind] ?? r.kind, r.custody_ref ?? "", r.creator, r.purpose, r.amount == null ? "" : Number(r.amount), R_STATUS[r.status] ?? r.status, day(r.created_at)]);
    const meta = { title: "سجل طلبات المشتريات والعهد", school: orgName, filters: [kind && R_KIND[kind], status && R_STATUS[status], q && `بحث: ${q}`].filter(Boolean) as string[] };
    const h = ["المرجع", "النوع", "العهدة", "مقدّم الطلب", "الغرض", "المبلغ", "الحالة", "التاريخ"];
    if (kindX === "xlsx") exportXlsx(meta, h, rows); else await exportPdf(meta, h, rows);
  }
  const total = list.data?.total ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input className="w-56" placeholder="بحث بالمرجع أو الغرض أو العهدة" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className={selectCls("w-44")} value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }} aria-label="النوع">
          <option value="">كل الأنواع</option>{Object.entries(R_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selectCls("w-40")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="الحالة">
          <option value="">كل الحالات</option><option value="open">المفتوحة</option>{Object.entries(R_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="ms-auto flex gap-2">
          {me.caps.export && <><Button size="sm" variant="outline" onClick={() => void exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exp("pdf")}><FileText className="size-4" />PDF</Button></>}
          {onNew && <Button size="sm" onClick={onNew}><Plus className="size-4" />طلب جديد</Button>}
        </span>
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => void list.refetch()} /> : !list.data?.rows.length ? (
        <EmptyState title="لا توجد طلبات" hint="التعزيز والتسوية والشراء المسبق ومعالجة الفروق ونقل العهدة تُطلب من هنا أو من داخل العهدة." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["المرجع", "النوع", "العهدة", "مقدّم الطلب", "الغرض", "المبلغ", "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{list.data.rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => open(r.id)}>
                <td className="px-3 py-2 font-mono text-xs">{r.ref}</td><td className="px-3 py-2">{R_KIND[r.kind]}</td><td className="px-3 py-2 font-mono text-xs">{r.custody_ref ?? "—"}</td>
                <td className="px-3 py-2">{r.creator}</td><td className="max-w-56 truncate px-3 py-2">{r.purpose}</td><td className="px-3 py-2 tabular-nums">{amountText(r)}</td>
                <td className="px-3 py-2"><Pill tone={R_TONE[r.status] ?? "muted"}>{R_STATUS[r.status]}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
          <span>{page + 1} / {Math.ceil(total / PAGE)}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>التالي</Button>
        </div>
      )}
    </div>
  );
}

export function RequestForm({ orgId, me, kind: kind0, custodyId, initial, onDone, onCancel, newCustody }: {
  orgId: string; me: PcMe; kind?: string | undefined; custodyId?: string | undefined; initial?: Row; onDone: (id: string) => void; onCancel: () => void; newCustody: () => void;
}) {
  const [kind, setKind] = useState<string>(initial?.kind ?? kind0 ?? "topup");
  const [custody, setCustody] = useState<string>(initial?.custody_id ?? custodyId ?? "");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [cat, setCat] = useState(initial?.category_id ?? "");
  const [school, setSchool] = useState(initial?.school_id ?? me.create_schools[0] ?? "");
  const [to, setTo] = useState<string[]>(initial?.to_holder ? [initial.to_holder] : []);
  const [sign, setSign] = useState<"-" | "+">(initial?.amount != null && Number(initial.amount) > 0 ? "+" : "-");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const inv = useInvalidate();
  const custodies = useQuery({
    queryKey: ["pc-req-custodies", orgId],
    queryFn: async () => { const { data, error } = await db.rpc("pc_custody_list", { _org: orgId, _status: null, _q: null, _school: null, _mine: false, _limit: 200, _offset: 0 }); if (error) throw error; return (data.rows as Row[]).filter((c) => ["approved", "disbursed", "settling"].includes(c.status)); },
  });
  const sel = custodies.data?.find((c) => c.id === custody);
  const needsAmount = ["topup", "purchase", "adjust"].includes(kind);
  async function save(submit: boolean) {
    setBusy(true);
    const amt = needsAmount ? (kind === "adjust" ? Number(`${sign}${Math.abs(Number(amount))}`) : Number(amount)) : null;
    const d = { kind, custody_id: custody || null, amount: amt, purpose, supplier: supplier || null, category_id: cat || null, school_id: custody ? null : school, to_holder: to[0] ?? null };
    const { data, error } = await db.rpc("pc_request_save", { _org: orgId, _id: initial?.id ?? null, _d: d, _rev: initial?.rev ?? 0, _key: initial ? null : key });
    if (error) { setBusy(false); toast.error(arabicError(error)); return; }
    const id = data as string;
    if (submit) {
      const g = await db.rpc("pc_request_get", { _id: id });
      if (!g.error) await run(db.rpc("pc_request_action", { _id: id, _action: "submit", _rev: g.data.rev, _reason: null }), "أُرسل الطلب");
    } else toast.success("حُفظت المسودة — يمكنك إرفاق المستندات قبل الإرسال");
    setBusy(false); inv(); onDone(id);
  }
  const hint: Record<string, string> = {
    topup: "يزيد الرصيد فقط بعد الاعتماد ثم الصرف الفعلي بإثبات.",
    settlement: "تتحول العهدة إلى «تحت التسوية». الإغلاق لاحقًا بعد المطابقة وتصفير المتبقي.",
    purchase: "اعتماده لا يخصم من الرصيد ولا يُعد إثبات دفع.",
    adjust: "عجز (سالب) أو زيادة (موجبة) بسبب واضح، ويُنفذ كقيد بعد اعتماد شخص آخر.",
    transfer: "يُعتمد ثم يتسلّمها الشخص الجديد؛ تُغلق العهدة الحالية وتُفتح له عهدة بالرصيد نفسه.",
  };
  return (
    <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-5">
      <h2 className="font-bold">{initial ? `تعديل ${initial.ref}` : "طلب جديد"}</h2>
      {!initial && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={newCustody}>عهدة جديدة</Button>
          {Object.entries(R_KIND).map(([k, v]) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{v}</Button>)}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{hint[kind]}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>العهدة{kind === "purchase" ? " (اختياري)" : ""}</Label>
          <select className={selectCls()} value={custody} disabled={!!initial} onChange={(e) => setCustody(e.target.value)}>
            <option value="">— اختر —</option>{(custodies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.ref} · {c.holder} · المتاح {sar(c.bal.available)}</option>)}
          </select>
          {sel && <p className="mt-1 text-xs text-muted-foreground">الرصيد {sar(sel.bal.book)} · المعلّق {sar(sel.bal.pending)} · المتاح {sar(sel.bal.available)}</p>}
        </div>
        {kind === "purchase" && !custody && <div><Label>الفرع</Label><select className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)}>{me.schools.filter((s) => me.create_schools.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        {needsAmount && (
          <div><Label>{kind === "purchase" ? "المبلغ التقديري (ريال)" : kind === "adjust" ? "مبلغ الفرق (ريال)" : "المبلغ (ريال)"}</Label>
            <div className="flex gap-2">
              {kind === "adjust" && <select className={selectCls("w-28")} value={sign} onChange={(e) => setSign(e.target.value as "-" | "+")} aria-label="نوع الفرق"><option value="-">عجز −</option><option value="+">زيادة +</option></select>}
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        )}
        {kind === "purchase" && <>
          <div><Label>المورد المتوقع</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
          {me.categories.length > 0 && <div><Label>التصنيف</Label><select className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">بدون</option>{me.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        </>}
        <div className="sm:col-span-2"><Label>{kind === "adjust" ? "سبب الفرق" : "الغرض"}</Label><Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
      </div>
      {kind === "transfer" && <PeoplePicker purpose="pc_transfer" school={sel?.school_id ?? null} org={orgId} value={to} onChange={setTo} single label="المستلم الجديد" compact exclude={sel ? [sel.holder_id] : []} />}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void save(true)}>حفظ وإرسال</Button>
        <Button disabled={busy} variant="outline" onClick={() => void save(false)}>حفظ مسودة</Button>
        <Button variant="ghost" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}

function TopupDisburse({ r, onDone }: { r: Row; onDone: () => void }) {
  const [method, setMethod] = useState("transfer");
  const [ext, setExt] = useState("");
  const [doc, setDoc] = useState(todayRiyadh());
  const [file, setFile] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const inv = useInvalidate();
  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="font-semibold">صرف التعزيز {sar(r.amount)}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label>طريقة الصرف</Label><select className={selectCls()} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><Label>رقم العملية{method !== "cash" ? " (إلزامي)" : ""}</Label><Input value={ext} onChange={(e) => setExt(e.target.value)} /></div>
        <div><Label>تاريخ المستند</Label><Input type="date" max={todayRiyadh()} value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
      </div>
      <Uploader label="رفع إثبات الصرف" create={async (f) => { const { data, error } = await db.rpc("create_pc_file", { _entity: "request", _id: r.id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }}
        release={(id) => db.rpc("pc_file_remove", { _file: id })} onDone={inv} />
      {r.files.length > 0 && <select className={selectCls()} value={file} onChange={(e) => setFile(e.target.value)} aria-label="الإثبات"><option value="">— اختر ملف الإثبات —</option>{(r.files as Row[]).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
      <Button disabled={!file || (method !== "cash" && !ext.trim())} onClick={async () => {
        if (!(await ask(`تأكيد صرف تعزيز ${sar(r.amount)} إلى ${r.holder}؟`))) return;
        if (await run(db.rpc("pc_topup_disburse", { _id: r.id, _rev: r.rev, _method: method, _external_ref: ext || null, _file: file, _doc_date: doc, _note: null, _key: key }), "سُجّل صرف التعزيز")) { inv(); onDone(); }
      }}>تأكيد الصرف</Button>
    </div>
  );
}

export function RequestDetail({ id, me, back, openCustody, openExpense, edit }: { id: string; me: PcMe; back: () => void; openCustody: (id: string) => void; openExpense: (id: string) => void; edit: (r: Row) => void }) {
  const q = useQuery({ queryKey: ["pc-request", id], queryFn: async () => { const { data, error } = await db.rpc("pc_request_get", { _id: id }); if (error) throw error; return data as Row; } });
  const [pay, setPay] = useState(false);
  const inv = useInvalidate();
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const r = q.data!;
  const act = async (action: string, msg: string, prompt?: string) => {
    let reason: string | null = null;
    if (prompt) { reason = await askText(prompt, { required: true }); if (!reason) return; }
    else if (action === "approve" && !(await ask(`اعتماد ${R_KIND[r.kind]} ${r.ref}${r.amount != null ? ` بمبلغ ${sar(r.amount)}` : ""}؟`))) return;
    if (await run(db.rpc("pc_request_action", { _id: r.id, _action: action, _rev: r.rev, _reason: reason }), msg)) inv();
  };
  return (
    <div className="space-y-4">
      <button className="inline-flex items-center gap-1 text-sm text-primary" onClick={back}><ArrowRight className="size-4" />العودة</button>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-5">
        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{r.ref} · {R_KIND[r.kind]}</p>
          <h2 className="text-lg font-bold">{r.purpose}</h2>
          <p className="text-sm text-muted-foreground">
            {r.custody_id ? <>العهدة: <button className="text-primary" onClick={() => openCustody(r.custody_id)}>{r.custody_ref}</button> ({r.holder}) · </> : null}الفرع: {r.school} · مقدّم الطلب: {r.creator} · {fmt(r.created_at)}
          </p>
          {r.amount != null && <p className="text-sm">المبلغ: <b className={Number(r.amount) < 0 ? "text-destructive" : ""}>{sar(r.amount)}</b>{r.kind === "adjust" ? (Number(r.amount) < 0 ? " (عجز)" : " (زيادة)") : ""}</p>}
          {r.supplier && <p className="text-sm text-muted-foreground">المورد المتوقع: {r.supplier}{r.category ? ` · ${r.category}` : ""}</p>}
          {r.to_holder_name && <p className="text-sm">المستلم الجديد: <b>{r.to_holder_name}</b>{r.new_custody_ref ? <> · العهدة الجديدة: <button className="text-primary" onClick={() => openCustody(r.new_custody_id)}>{r.new_custody_ref}</button></> : null}</p>}
          {r.bal && <p className="text-xs text-muted-foreground">رصيد العهدة الآن {sar(r.bal.book)} · المعلّق {sar(r.bal.pending)} · المتاح {sar(r.bal.available)}</p>}
          {r.decider && <p className="text-sm text-muted-foreground">القرار: {r.decider} — {fmt(r.decided_at)}{r.decision_reason ? ` «${r.decision_reason}»` : ""}</p>}
          {r.kind === "purchase" && r.status === "approved" && <p className="text-xs text-muted-foreground">طلب الشراء المعتمد لا يخصم الرصيد؛ اربطه بالفاتورة عند تسجيل المصروف.</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Pill tone={R_TONE[r.status] ?? "muted"}>{R_STATUS[r.status]}</Pill>
          <div className="flex flex-wrap justify-end gap-2">
            {r.can.edit && <><Button size="sm" variant="outline" onClick={() => edit(r)}>تعديل</Button><Button size="sm" onClick={() => void act("submit", "أُرسل الطلب")}>إرسال</Button></>}
            {r.can.decide && <><Button size="sm" onClick={() => void act("approve", r.kind === "adjust" ? "اعتُمد ونُفّذ القيد" : "اعتُمد الطلب")}>اعتماد</Button>
              <Button size="sm" variant="outline" onClick={() => void act("return", "أُعيد للاستكمال", "ما المطلوب استكماله؟")}>إعادة للاستكمال</Button>
              <Button size="sm" variant="destructive" onClick={() => void act("reject", "رُفض", "سبب الرفض")}>رفض</Button></>}
            {r.status === "submitted" && !r.can.decide && me.caps.approve && <span className="text-xs text-muted-foreground">لا يمكنك البت فيه (طلبك أو عهدتك، أو يتجاوز حدّك)</span>}
            {r.can.disburse && !pay && <Button size="sm" onClick={() => setPay(true)}>صرف التعزيز</Button>}
            {r.can.accept && <><Button size="sm" onClick={async () => { if (await ask(`تسلّم العهدة ${r.custody_ref} برصيد ${sar(r.bal?.book)}؟ ستصبح مسؤولًا عنها.`) && (await run(db.rpc("pc_transfer_accept", { _id: r.id }), "تسلّمت العهدة"))) inv(); }}>تسلّم العهدة</Button>
              <Button size="sm" variant="outline" onClick={() => void act("decline", "اعتذرت عن التسلّم", "سبب الاعتذار")}>اعتذار</Button></>}
            {r.can.cancel && <Button size="sm" variant="ghost" onClick={() => void act("cancel", "أُلغي", "سبب الإلغاء")}>إلغاء</Button>}
          </div>
        </div>
      </div>
      {pay && <TopupDisburse r={r} onDone={() => setPay(false)} />}
      <section className="space-y-2">
        <h3 className="font-semibold">المرفقات</h3>
        <FileList files={files(r.files)} onRemove={r.can.edit ? async (f) => { if (await run(db.rpc("pc_file_remove", { _file: f["id"] }), "أُزيل الملف")) inv(); } : undefined} />
        {!r.files.length && <p className="text-sm text-muted-foreground">لا مرفقات.</p>}
        {r.can.edit && <Uploader label="إرفاق مستند" create={async (f) => { const { data, error } = await db.rpc("create_pc_file", { _entity: "request", _id: r.id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }} release={(fid) => db.rpc("pc_file_remove", { _file: fid })} onDone={inv} />}
      </section>
      {r.expenses.length > 0 && <section className="space-y-1"><h3 className="font-semibold">الفواتير المرتبطة</h3>{(r.expenses as Row[]).map((e) => <button key={e.id} className="block text-sm text-primary" onClick={() => openExpense(e.id)}>{e.ref} · {sar(e.total)}</button>)}</section>}
      <LogList log={r.log} />
    </div>
  );
}

/** Settlement checklist + return / carry / close actions on a custody (all checks repeated on the server). */
export function CustodyOps({ c, me, newRequest, openRequest }: { c: Row; me: PcMe; newRequest: (kind: string) => void; openRequest: (id: string) => void }) {
  const q = useQuery({ queryKey: ["pc-caps", c.id, c.rev], queryFn: async () => { const { data, error } = await db.rpc("pc_custody_caps", { _id: c.id }); if (error) throw error; return data as Row; } });
  const [mode, setMode] = useState<"" | "return" | "carry">("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [file, setFile] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const inv = useInvalidate();
  if (!q.data) return null;
  const k = q.data;
  const reset = () => { setMode(""); setAmount(""); setFile(""); setTarget(""); setReason(""); setKey(crypto.randomUUID()); inv(); };
  const fs = (c.files as Row[]) ?? [];
  const anyReq = k.topup || k.settle || k.adjust || k.transfer || k.purchase;
  return (
    <div className="space-y-3">
      {(anyReq || k.return_cash || k.carry || k.close) && (
        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
          {k.topup && <Button size="sm" variant="outline" onClick={() => newRequest("topup")}>طلب تعزيز</Button>}
          {k.purchase && <Button size="sm" variant="outline" onClick={() => newRequest("purchase")}>طلب شراء مسبق</Button>}
          {k.settle && <Button size="sm" variant="outline" onClick={() => newRequest("settlement")}>طلب تسوية</Button>}
          {k.adjust && <Button size="sm" variant="outline" onClick={() => newRequest("adjust")}>معالجة عجز/زيادة</Button>}
          {k.transfer && <Button size="sm" variant="outline" onClick={() => newRequest("transfer")}>نقل لشخص آخر</Button>}
          {k.return_cash && <Button size="sm" variant="outline" onClick={() => setMode(mode === "return" ? "" : "return")}>استلام مبلغ معاد</Button>}
          {k.carry && <Button size="sm" variant="outline" onClick={() => setMode(mode === "carry" ? "" : "carry")}>ترحيل لعهدة جديدة</Button>}
        </div>
      )}
      {mode === "return" && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="font-semibold">استلام المتبقي من {c.holder} (المتاح {sar(c.bal.available)})</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>المبلغ</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>الطريقة</Label><select className={selectCls()} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHOD).map(([x, v]) => <option key={x} value={x}>{v}</option>)}</select></div>
            <div><Label>ملاحظة</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <Uploader label="رفع سند الاستلام" create={async (f) => { const { data, error } = await db.rpc("create_pc_file", { _entity: "custody", _id: c.id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }} release={(id) => db.rpc("pc_file_remove", { _file: id })} onDone={inv} />
          {fs.length > 0 && <select className={selectCls()} value={file} onChange={(e) => setFile(e.target.value)} aria-label="سند الاستلام"><option value="">— اختر السند —</option>{fs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
          <Button disabled={!file || !Number(amount)} onClick={async () => { if (await ask(`تأكيد استلام ${sar(amount)} نقدًا/تحويلًا من ${c.holder}؟`) && (await run(db.rpc("pc_return_cash", { _custody: c.id, _amount: Number(amount), _method: method, _file: file, _doc_date: todayRiyadh(), _note: reason || null, _key: key }), "سُجّل الاستلام"))) reset(); }}>تأكيد الاستلام</Button>
        </div>
      )}
      {mode === "carry" && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="font-semibold">ترحيل إلى عهدة أخرى للمستلم نفسه (حركتان متقابلتان)</h3>
          {!k.carry_targets.length ? <p className="text-sm text-muted-foreground">لا توجد عهدة معتمدة أو مفتوحة أخرى لـ {c.holder}. اطلب له عهدة جديدة أولًا.</p> : <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>العهدة الجديدة</Label><select className={selectCls()} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">— اختر —</option>{(k.carry_targets as Row[]).map((t) => <option key={t.id} value={t.id}>{t.ref} · {t.purpose}</option>)}</select></div>
              <div><Label>المبلغ (حتى {sar(c.bal.available)})</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>السبب</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            </div>
            <Button disabled={!target || !Number(amount) || reason.trim().length < 3} onClick={async () => { if (await ask(`ترحيل ${sar(amount)}؟`) && (await run(db.rpc("pc_carry", { _from: c.id, _to: target, _amount: Number(amount), _reason: reason, _key: key }), "تم الترحيل"))) reset(); }}>اعتماد الترحيل</Button>
          </>}
        </div>
      )}
      {k.settlement && (c.status === "settling" || c.status === "closed") && (
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">{c.status === "closed" ? "التسوية (مغلقة)" : "مطابقة التسوية"}</h3>
          <p className="text-sm text-muted-foreground">المصروفات المعتمدة: {k.settlement.expenses.approved} · قبل الضريبة {sar(k.settlement.expenses.net)} · الضريبة {sar(k.settlement.expenses.vat)} · الإجمالي {sar(k.settlement.expenses.total)} · المعاد {sar(k.settlement.bal.returned)} · المرحّل {sar(k.settlement.bal.carried)} · الفروق المعالجة {sar(k.settlement.bal.adjusted)}</p>
          <ul className="space-y-1 text-sm">{(k.settlement.items as Row[]).map((x) => <li key={x.key} className={x.ok ? "text-primary" : "text-destructive"}>{x.ok ? "✓" : "✗"} {x.label}{!x.ok && x.value != null ? ` (${x.key === "balance" || x.key === "pending" ? sar(x.value) : x.value})` : ""}</li>)}</ul>
          {c.closed_at && <p className="text-sm text-muted-foreground">أُغلقت {fmt(c.closed_at)} — {k.closed_by}</p>}
          {k.close && <Button size="sm" disabled={!k.settlement.ok} onClick={async () => { const why = await askText("ملاحظة الإغلاق (المطابقة الفعلية)", { required: true }); if (why && (await run(db.rpc("pc_custody_close", { _id: c.id, _rev: c.rev, _reason: why }), "أُغلقت العهدة"))) inv(); }}>إغلاق العهدة</Button>}
          {c.status === "settling" && !k.close && me.caps.approve && <p className="text-xs text-muted-foreground">الإغلاق لمعتمد غير مستلم العهدة ولا مقدّم طلبها.</p>}
        </section>
      )}
      {k.requests.length > 0 && (
        <section className="space-y-2"><h3 className="font-semibold">طلبات العهدة</h3>
          <ul className="divide-y rounded-xl border bg-card text-sm">{(k.requests as Row[]).map((r) => (
            <li key={r.id} className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 hover:bg-muted/40" onClick={() => openRequest(r.id)}>
              <span className="font-mono text-xs">{r.ref}</span><span>{R_KIND[r.kind]}</span><span className="text-muted-foreground">{r.purpose}</span>
              <span className="ms-auto tabular-nums">{amountText(r)}</span><Pill tone={R_TONE[r.status] ?? "muted"}>{R_STATUS[r.status]}</Pill>
            </li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
