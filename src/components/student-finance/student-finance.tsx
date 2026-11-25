import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bus, CreditCard, Percent, Receipt, RotateCcw, History, Users, Wallet, CircleCheck, type LucideIcon } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { LoadingState } from "@/components/states";
import { ReceiptButtons, receiptLines } from "./finance-tools";
import { StatementButton } from "./statement";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { COLLECTION_STATUS, KIND_LABEL, METHODS, METHOD_LABEL, SF_KEY, TERM_LABEL, TRANSPORT_LABEL, TRANSPORT_TYPES, money, num, paymentState, validAllocation, type Obligation } from "@/lib/student-finance/labels";

export type Prev = { carry_id: string; direction: "debit" | "credit"; carried_amount: number; carried_at: string; year: string; school: string; days_late: number | null; obligation: Obligation & { due_date?: string | null } };
type Fin = { student: Row; caps: Record<string, boolean>; years: Row[]; obligations: Obligation[]; previous: Prev[]; credit_moves: Row[]; transport: Row[]; discounts: Row[]; collections: Row[]; summary: Record<string, Row>; events: Row[]; available_discounts: Row[]; buses: Row[] };

const EVENT_LABEL: Record<string, string> = { transfer_attach: "إرفاق صورة الحوالة", obligation_create: "إنشاء مستحق", discount_apply: "تطبيق خصم", transport_save: "تحديث اشتراك النقل", collection_record: "تسجيل سداد", collection_reverse: "إلغاء سداد", discount_edit: "تعديل خصم", discount_remove: "حذف خصم", exception_clear: "إعادة تقييم خصم", transport_edit: "تعديل رسوم النقل", transport_exempt: "إعفاء من رسوم النقل", transport_cancel: "إلغاء اشتراك النقل", sibling_ineligible: "انتهاء استحقاق خصم الإخوة", reprice: "تعديل سعر المستحق", auto_no_price: "تعذر الإنشاء التلقائي: الرسوم غير مهيأة", auto_create_failed: "تعذر الإنشاء التلقائي", carry_apply: "ترحيل رصيد سابق", credit_apply: "استخدام رصيد دائن", credit_refund: "استرداد رصيد دائن", due_apply: "تعديل تاريخ الاستحقاق" };

/** Finance tab inside the existing student side panel. Every action is re-checked by sf_* RPCs. */
export function StudentFinance({ studentId, startCollect = false, initialYear }: { studentId: string; startCollect?: boolean; initialYear?: string }) {
  const qc = useQueryClient();
  // undefined = not chosen yet → the student's current academic year once known; "" = all years
  const [year, setYear] = useState<string | undefined>(initialYear);
  const q = useQuery({ queryKey: [...SF_KEY, "student", studentId, year ?? "?"], queryFn: async () => { const { data, error } = await db.rpc("sf_get", { _student: studentId, _year: year || null }); if (error) throw error; return data as Fin; }, retry: false });
  useEffect(() => { if (year === undefined && q.data) { const cur = q.data.years.find((y) => y["is_current"]) ?? q.data.years[0]; setYear(cur ? String(cur["id"]) : ""); } }, [year, q.data]);
  const [dlg, setDlg] = useState<"collect" | "discount" | "transport" | null>(null);
  const [creditFor, setCreditFor] = useState<{ p: Prev; refund: boolean } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: SF_KEY });
  const [started, setStarted] = useState(false);
  useEffect(() => { if (startCollect && !started && year !== undefined && q.data?.caps["collect"]) { setStarted(true); setDlg("collect"); } }, [startCollect, started, q.data, year]);
  const tq = useQuery({ queryKey: [...SF_KEY, "transfer-files", studentId], queryFn: async () => { const { data, error } = await db.rpc("sf_transfer_files", { _student: studentId }); if (error) throw error; return data as TransferFile[]; }, retry: false });
  const rq = useQuery({ queryKey: [...SF_KEY, "student-receipts", studentId], queryFn: async () => { const { data, error } = await db.rpc("sf_student_receipts", { _student: studentId }); if (error) throw error; return data as Row[]; }, retry: false });
  if (q.isLoading || (year === undefined && !q.error)) return <LoadingState />;
  if (q.error) return <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{(q.error as { code?: string }).code === "42501" ? "لا تتوفر لك صلاحية عرض البيانات المالية لهذا الطالب، أو القسم المالي غير مفعّل." : arabicError(q.error)}</p>;
  const f = q.data;
  if (!f) return null;
  const yearId = year || (f.years[0]?.["id"] as string) || "";
  const a = f.summary["annual"] ?? {};
  const prev = f.previous ?? [];
  const prevRem = prev.reduce((s, p) => s + num(p.obligation.balance.remaining), 0), prevCredit = prev.reduce((s, p) => s + num(p.obligation.balance.credit), 0);
  const placed = f.student["placed"] !== false;
  const cell = (kind: string, term: number) => f.obligations.find((o) => o.kind === kind && o.term === term && (!year || o.year_id === year));
  const run = async (fn: () => Promise<{ error: unknown }>, ok: string) => { const { error } = await fn(); if (error) toast.error(arabicError(error)); else { toast.success(ok); void refresh(); } };

  return (
    <div dir="rtl" className="space-y-4 text-start">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={year ?? ""} onChange={(e) => setYear(e.target.value)}>{f.years.map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}{y["is_current"] ? " (الحالي)" : ""}</option>)}<option value="">كل الأعوام (مجمّع)</option></select>
        <StatementButton fins={[f]} title={`كشف حساب ${String(f.student["name"])}`} />
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">تشغيلي — الربط المحاسبي مع وافق غير مفعّل</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["إجمالي الرسوم قبل الخصم", a["gross"]], ["إجمالي الخصومات", a["discount"]], ["صافي رسوم العام", a["net"]], ["المسدد من رسوم العام", a["recorded"]], ["المتبقي من رسوم العام", a["remaining"]], ...(year ? [["المتبقي من الأرصدة السابقة", prevRem], ["إجمالي المطلوب سداده", num(a["remaining"]) + prevRem]] : []), ["الرصيد الدائن المتاح", num(a["credit"]) + prevCredit], ["نسبة السداد", null]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold">{v === null ? `${num(a["collection_percent"])}%` : money(v)}</div></div>))}
      </div>
      {!placed && !f.obligations.length && <p className="rounded-xl border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">لم يتم تسكين الطالب أكاديميًا بعد، ولم تُنشأ مستحقاته الدراسية الحالية.</p>}
      <FeeTable rows={(["tuition", "transport"] as const).flatMap((k) => [1, 2].map((t) => ({ k, t, o: cell(k, t) })))
        .filter((r) => r.k === "tuition" || (!!r.o && r.o.status !== "void"))} />
      <div className="flex flex-wrap gap-2">
        {f.caps["setup"] && yearId && <Button size="sm" variant="outline" onClick={() => run(() => db.rpc("sf_create_tuition", { _student: studentId, _year: yearId }), "أُنشئت مستحقات الرسوم الدراسية")}><Receipt className="size-4" /> إنشاء مستحقات الرسوم الدراسية</Button>}
        {f.caps["transport"] && <Button size="sm" variant="outline" onClick={() => setDlg("transport")}><Bus className="size-4" /> إدارة اشتراك النقل</Button>}
        {f.caps["discount"] && <Button size="sm" variant="outline" disabled={!f.obligations.length} onClick={() => setDlg("discount")}><Percent className="size-4" /> تطبيق خصم</Button>}
        {f.caps["collect"] && <Button size="sm" disabled={!f.obligations.some((o) => num(o.balance.remaining) > 0) && prevRem <= 0} onClick={() => setDlg("collect")}><CreditCard className="size-4" /> سداد الرسوم</Button>}
      </div>

      {year && <PreviousBalances prev={prev} canSetup={!!f.caps["setup"]} onCredit={(p, refund) => setCreditFor({ p, refund })} />}
      {f.credit_moves?.length > 0 && <Section title="حركات الرصيد الدائن">{f.credit_moves.map((m) => <div key={m["id"]} className="flex flex-wrap gap-2 text-xs"><b>{m["kind"] === "refund" ? "استرداد" : "استخدام لسداد مستحق"}</b><span>{money(m["amount"])}</span><span className="text-muted-foreground">{new Date(m["created_at"]).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}</span>{m["reason"] && <span className="text-muted-foreground">— {m["reason"]}</span>}</div>)}</Section>}

      <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
      <Section title="النقل المدرسي" count={f.transport.length}>{f.transport.length ? f.transport.map((t) => <div key={t["id"]} className="flex flex-wrap gap-2 text-xs"><b>{TERM_LABEL(t["term"])}</b>{t["active"] ? <><span>{TRANSPORT_LABEL[t["transport_type"]]}</span><span>الباص {t["bus"]?.code ?? "—"} ({t["bus"]?.plate ?? ""})</span><span>من {t["starts"]}</span></> : <span className="text-muted-foreground">غير مشترك</span>}{t["exempt"] && <span className="rounded bg-muted px-1">معفى</span>}</div>) : <EmptyDetail text="غير مشترك في النقل المدرسي." />}</Section>

      {yearId && <Siblings studentId={studentId} yearId={yearId} />}

      </div>

      <Section title="الخصومات المطبقة" count={f.discounts.length}>{f.discounts.length ? f.discounts.map((d) => (
        <div key={d["id"]} className="flex flex-wrap items-center gap-2 text-xs"><b>{d["name"]}</b><span>{KIND_LABEL[d["kind"]]} — {TERM_LABEL(d["term"])}</span><span>{money(d["amount"])}</span>{!d["active"] && <span className="rounded bg-muted px-1">غير فعال{d["manual_override"] ? " (مستثنى يدويًا)" : ""}</span>}
          {f.caps["setup"] && <span className="ms-auto flex gap-1">
            {d["active"] && <Button size="sm" variant="ghost" onClick={async () => { const amt = await askText("القيمة الجديدة للخصم (ر.س)", { required: true, initial: String(d["amount"]) }); if (amt === null) return; const r = await askText("سبب التعديل", { required: true }); if (r) void run(() => db.rpc("sf_override", { _student: studentId, _action: "discount_edit", _id: d["id"], _amount: Number(amt), _reason: r }), "عُدّل الخصم"); }}>تعديل</Button>}
            {d["active"] && <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب حذف الخصم (يبقى في السجل ولا يُعاد تطبيقه تلقائيًا)", { required: true }); if (r) void run(() => db.rpc("sf_override", { _student: studentId, _action: "discount_remove", _id: d["id"], _amount: null, _reason: r }), "حُذف الخصم"); }}>حذف</Button>}
            {d["manual_override"] && !d["active"] && <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب إعادة تقييم الخصم", { required: true }); if (r) void run(() => db.rpc("sf_override", { _student: studentId, _action: "exception_clear", _id: d["id"], _amount: null, _reason: r }), "أُعيد التقييم"); }}>إعادة التقييم</Button>}
          </span>}
        </div>)) : <EmptyDetail text="لا توجد خصومات." />}</Section>

      <Section title="سجل السداد" count={f.collections.length}>{f.collections.length ? f.collections.map((c) => (
        <div key={c["id"]} className="rounded-lg border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2"><div className="flex flex-wrap items-center gap-3"><b className="text-lg tabular-nums">{money(c["amount"])}</b><span className={`rounded-md px-2 py-1 text-xs font-medium ${c["status"] === "reversed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{COLLECTION_STATUS[c["status"]] ?? c["status"]}</span></div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{METHOD_LABEL[c["method"]]}</span><span className="tabular-nums" dir="ltr">{c["paid_at"]}</span>{c["ref"] && <span>المرجع: <bdi>{c["ref"]}</bdi></span>}</div>
            </div>
            {(() => { const r = rq.data?.find((x) => x["collection_id"] === c["id"]); return r ? <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-muted px-2 py-1 font-mono text-xs" dir="ltr">{r["number"]}</span><ReceiptButtons r={r} /></div> : null; })()}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2 empty:hidden">
          {c["method"] === "bank" && <TransferFiles files={(tq.data ?? []).filter((x) => x.collection_id === c["id"])} />}
          {c["method"] === "bank" && f.caps["collect"] && c["status"] !== "reversed" && (tq.data ?? []).filter((x) => x.collection_id === c["id"]).length < 3 && <TransferPick label="إرفاق صورة الحوالة" onPick={async (fl) => { const failed = await attachTransfer(c["id"], fl); if (failed) toast.error(failed); else toast.success("أُرفقت صورة الحوالة"); void refresh(); }} />}
          {f.caps["setup"] && c["status"] !== "reversed" && !c["accounting_confirmed"] && <Button size="sm" variant="ghost" className="ms-auto" onClick={async () => { const r = await askText("سبب إلغاء عملية السداد (تبقى في السجل)", { required: true }); if (r) void run(() => db.rpc("sf_reverse", { _student: studentId, _collection: c["id"], _reason: r }), "أُلغيت العملية"); }}><RotateCcw className="size-4" /> إلغاء</Button>}
          </div>
        </div>)) : <EmptyDetail text="لا توجد عمليات سداد." />}
        <p className="text-[11px] text-muted-foreground">لكل عملية سند قبض داخلي من ركاز؛ المستند المحاسبي الرسمي يصدر من وافق بعد تفعيل الربط.</p></Section>

      {f.events.length > 0 && <Section title="سجل العمليات المالية" count={f.events.length}>
        <ol className="ms-2 border-s border-border">{[...f.events].reverse().slice(0, 30).map((e) => <li key={e["id"]} className="relative ps-5 py-3 first:pt-1 last:pb-1">
          <span aria-hidden className="absolute -start-1 top-4 size-2 rounded-full bg-primary ring-4 ring-background" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><span className="text-sm font-medium">{EVENT_LABEL[e["action"]] ?? e["action"]}</span><time className="text-xs tabular-nums text-muted-foreground" dateTime={e["created_at"]}>{new Date(e["created_at"]).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</time></div>
          {e["reason"] && <p className="mt-1 break-words text-xs text-muted-foreground">{e["reason"]}</p>}
        </li>)}</ol>
      </Section>}

      {creditFor && <CreditDialog f={f} studentId={studentId} p={creditFor.p} refund={creditFor.refund} onClose={() => setCreditFor(null)} onDone={() => { setCreditFor(null); void refresh(); }} />}
      {dlg === "collect" && <CollectDialog f={f} studentId={studentId} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void refresh(); }} />}
      {dlg === "discount" && <DiscountDialog f={f} studentId={studentId} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void refresh(); }} />}
      {dlg === "transport" && yearId && <TransportDialog f={f} studentId={studentId} yearId={yearId} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void refresh(); }} />}
    </div>
  );
}

function Siblings({ studentId, yearId }: { studentId: string; yearId: string }) {
  const q = useQuery({ queryKey: [...SF_KEY, "siblings", studentId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_siblings", { _student: studentId, _year: yearId }); if (error) throw error; return data as Row[]; }, retry: false });
  const others = (q.data ?? []).filter((x) => x["id"] !== studentId);
  return <Section title="الإخوة في المجموعة" count={others.length}>{q.isLoading ? <p className="text-xs text-muted-foreground">جارٍ التحميل…</p> : others.length ? <>{!(q.data ?? []).find((x) => x["id"] === studentId)?.["rank"] && <p className="text-xs font-semibold text-destructive">هذا الطالب غير مسكّن في فصل لهذا العام، لذلك لا تُنشأ له رسوم ولا يُطبق عليه خصم الإخوة حتى يُسكَّن.</p>}{others.map((x) => (
    <div key={x["id"]} className="flex flex-wrap gap-2 text-xs"><b>{x["name"]}</b><span>{x["school"]}</span><span>{[x["stage"], x["grade"]].filter(Boolean).join(" — ") || "غير مسكّن هذا العام"}</span><span>{x["rank"] ? `الترتيب ${x["rank"]}` : "لا يُحتسب في خصم الإخوة حتى يُسكَّن في فصل"}</span><span>{num(x["sibling_discount"]) > 0 ? `خصم إخوة ${money(x["sibling_discount"])}` : "لا يوجد خصم إخوة مطبق"}</span></div>
  ))}</> : <EmptyDetail text="لا يوجد إخوة مسجلون بعلاقة أسرية موثقة." />}</Section>;
}

const DETAIL_ICONS: Record<string, LucideIcon> = { "الأرصدة السابقة": Wallet, "حركات الرصيد الدائن": Wallet, "النقل المدرسي": Bus, "الإخوة في المجموعة": Users, "الخصومات المطبقة": Percent, "سجل السداد": Receipt, "سجل العمليات المالية": History };

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const Icon = DETAIL_ICONS[title] ?? Wallet;
  return <section className="min-w-0 space-y-3 border-t py-4">
    <div className="flex items-center gap-2.5"><Icon aria-hidden className="size-4 shrink-0 text-primary" /><h4 className="text-sm font-bold">{title}</h4>{count !== undefined && count > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{count}</span>}</div>
    {children}
  </section>;
}

function EmptyDetail({ text }: { text: string }) {
  return <div className="flex min-h-16 items-center gap-2 rounded-lg bg-muted/30 px-3 py-4 text-xs text-muted-foreground"><CircleCheck aria-hidden className="size-4 shrink-0" /><p>{text}</p></div>;
}

type TransferFile = { id: string; collection_id: string; name: string; mime: string; path: string };
const BUCKET = "rikaz-files";
const TRANSFER_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
/** Optional bank-transfer proof: the server creates the file record (sf_transfer_attach) before the upload. Returns an error message or null. */
async function attachTransfer(collectionId: string, files: File[]): Promise<string | null> {
  let failed = 0;
  for (const file of files) {
    const r = await db.rpc("sf_transfer_attach", { _collection: collectionId, _name: file.name, _mime: file.type, _size: file.size });
    if (r.error) return arabicError(r.error);
    const up = await db.storage.from(BUCKET).upload((r.data as { path: string }).path, file, { contentType: file.type });
    if (up.error) failed++;
  }
  return failed ? `تعذر رفع ${failed} من مرفقات الحوالة؛ أعد إرفاقها من سجل السداد` : null;
}
function TransferPick({ label, onPick }: { label: string; onPick: (f: File[]) => void }) {
  return <label className="cursor-pointer rounded border border-dashed px-2 py-0.5 text-[11px] text-primary hover:bg-muted">{label}<input type="file" className="hidden" accept={TRANSFER_TYPES.join(",")} onChange={(e) => { const fl = Array.from(e.target.files ?? []); e.target.value = ""; if (fl.some((x) => !TRANSFER_TYPES.includes(x.type))) { toast.error("يُقبل الصور وملفات PDF فقط"); return; } if (fl.length) onPick(fl); }} /></label>;
}
function TransferFiles({ files }: { files: TransferFile[] }) {
  const open = async (x: TransferFile) => { const { data, error } = await db.storage.from(BUCKET).createSignedUrl(x.path, 60); if (error || !data) { toast.error("لا تملك صلاحية فتح هذا الملف أو لم يعد متاحًا"); return; } window.open(data.signedUrl, "_blank", "noopener"); };
  return <>{files.map((x, i) => <Button key={x.id} size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => void open(x)}>صورة الحوالة{files.length > 1 ? ` ${i + 1}` : ""}</Button>)}</>;
}

const obLabel = (o: Obligation) => `${KIND_LABEL[o.kind]} — ${TERM_LABEL(o.term)}`;

function CollectDialog({ f, studentId, onClose, onDone }: { f: Fin; studentId: string; onClose: () => void; onDone: () => void }) {
  const key = useMemo(() => crypto.randomUUID(), []);
  const prevYear = new Map((f.previous ?? []).map((p) => [p.obligation.id, p.year]));
  const open = [...f.obligations, ...(f.previous ?? []).map((p) => p.obligation)].filter((o, i, all) => o.status === "pending" && num(o.balance.remaining) > 0 && all.findIndex((x) => x.id === o.id) === i);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [v, setV] = useState({ method: "cash", paid_at: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }), ref: "", payer: "", notes: "" });
  const [receipt, setReceipt] = useState<Row | null>(null);
  const [transfer, setTransfer] = useState<File[]>([]);
  // payer is always the signed-in employee recording the payment (enforced by the server); shown read-only
  const me = useQuery({ queryKey: ["my-profile-name"], queryFn: async () => { const { data: u } = await db.auth.getUser(); if (!u.user) return ""; const { data } = await db.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle(); return String(data?.["full_name"] ?? ""); } });
  useEffect(() => { if (me.data) setV((x) => ({ ...x, payer: me.data! })); }, [me.data]);
  const rows = open.filter((o) => amounts[o.id]).map((o) => ({ obligation_id: o.id, amount: Number(amounts[o.id]) }));
  const ok = rows.length > 0 && rows.every((r) => validAllocation(r.amount, num(open.find((o) => o.id === r.obligation_id)?.balance.remaining)));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("sf_collect", { _student: studentId, _request_key: key, _p: { ...v, allocations: rows } }); if (error) throw error;
      // the transfer image is optional and attached after the payment exists; a failed upload never undoes the payment
      if (v.method === "bank" && transfer.length) { const failed = await attachTransfer(String(data), transfer); if (failed) toast.error(failed); }
      // the receipt number is issued automatically with the payment; read it back to show it at once
      const r = await db.rpc("sf_student_receipts", { _student: studentId });
      return ((r.data as Row[] | null) ?? []).find((x) => x["collection_id"] === data) ?? null;
    },
    onSuccess: (r) => { toast.success(r ? `سُجلت عملية السداد — سند رقم ${r["number"]}` : "سُجلت عملية السداد"); if (r) setReceipt(r); else onDone(); }, onError: (e) => toast.error(arabicError(e)),
  });
  if (receipt) return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>سند القبض {String(receipt["number"])}</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl border bg-card p-3 text-sm">{receiptLines(receipt).map(([a, b], i) => <Fragment key={i}><dt className="text-muted-foreground">{a}</dt><dd className="font-medium">{b}</dd></Fragment>)}{v.method === "bank" && <><dt className="text-muted-foreground">صورة الحوالة</dt><dd className="font-medium">{transfer.length ? transfer.map((x) => x.name).join("، ") : "لم تُرفق"}</dd></>}</dl>
        <div className="flex gap-2"><ReceiptButtons r={receipt} /><Button className="ms-auto" onClick={onDone}>تم</Button></div>
      </DialogContent>
    </Dialog>
  );
  const remainingAll = open.reduce((s, o) => s + num(o.balance.remaining), 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[92dvh] w-[96vw] max-w-3xl gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b bg-muted/30 px-4 py-5 pe-12 sm:px-6 sm:pe-12">
          <DialogTitle className="flex min-w-0 items-center gap-3 text-lg"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CreditCard className="size-5" /></span><span className="min-w-0 break-words">سداد الرسوم<span className="mt-1 block text-sm font-normal text-muted-foreground">{f.student["name"]}</span></span></DialogTitle>
        </DialogHeader>
        <div className="space-y-6 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-4 border-b pb-4"><div><p className="text-xs text-muted-foreground">المتبقي على الطالب</p><p className="mt-1 text-lg font-bold tabular-nums">{money(remainingAll)}</p></div><div className="border-s ps-4"><p className="text-xs text-muted-foreground">المبلغ المحدد للسداد</p><p className="mt-1 text-lg font-bold tabular-nums text-primary">{money(total)}</p></div></div>
          <section className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><h4 className="min-w-0 text-sm font-bold">المبالغ المراد سدادها</h4>
              <Button size="sm" variant="outline" onClick={() => setAmounts(Object.fromEntries(open.map((o) => [o.id, String(o.balance.remaining)])))}>سداد كامل المتبقي</Button></div>
            <div className="divide-y rounded-lg border bg-card">
              {open.map((o) => <div key={o.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 space-y-1.5"><p className="text-sm font-semibold">{obLabel(o)}</p>{prevYear.has(o.id) && <span className="inline-block rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">رصيد سابق — {formatAcademicYear(prevYear.get(o.id))}</span>}<p className="text-xs text-muted-foreground">المتبقي <b className="ms-1 tabular-nums text-foreground">{money(o.balance.remaining)}</b></p></div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:w-56"><div className="min-w-0"><Input aria-label={`مبلغ ${obLabel(o)}`} className="h-11 w-full text-end tabular-nums" dir="ltr" type="number" min={0} step="0.01" placeholder="0.00" value={amounts[o.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })} /></div><Button size="sm" variant="secondary" className="h-11 shrink-0" onClick={() => setAmounts({ ...amounts, [o.id]: String(o.balance.remaining) })}>كامل</Button></div>
              </div>)}
              {!open.length && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد مبالغ متبقية.</p>}
            </div>
            <p className="text-[11px] text-muted-foreground">الأرصدة السابقة تُسدَّد على مستحقها الأصلي ولا تُطبق عليها خصومات العام الحالي.</p>
          </section>
          <section className="space-y-3 border-t pt-5">
            <h4 className="text-sm font-bold">بيانات السداد</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="cm">طريقة السداد</Label><select id="cm" className={selectCls("h-11 w-full")} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="cd">تاريخ السداد</Label><Input id="cd" className="h-11" dir="ltr" type="date" value={v.paid_at} onChange={(e) => setV({ ...v, paid_at: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="cr">رقم المرجع {v.method === "cash" && <span className="text-muted-foreground">(اختياري)</span>}</Label><Input id="cr" className="h-11" value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="cp">الموظف المسدِّد</Label><Input id="cp" value={v.payer} readOnly disabled className="h-11 bg-muted" /></div>
              {v.method === "bank" && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 text-xs sm:col-span-2"><span className="text-muted-foreground">صورة الحوالة (اختياري)</span>
                {transfer.map((x, i) => <span key={i} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">{x.name}<button type="button" aria-label={`إزالة ${x.name}`} className="text-destructive" onClick={() => setTransfer(transfer.filter((_, j) => j !== i))}>×</button></span>)}
                {transfer.length < 3 && <TransferPick label={transfer.length ? "إضافة ملف آخر" : "اختيار صورة أو PDF"} onPick={(fl) => setTransfer([...transfer, ...fl].slice(0, 3))} />}</div>}
              <div className="space-y-1 sm:col-span-2"><Label htmlFor="cn">ملاحظات</Label><Input id="cn" className="h-11" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
            </div>
          </section>
        </div>
        <div className="sticky bottom-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t bg-background px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-6">
          <div><div className="text-xs text-muted-foreground">إجمالي السداد</div><div className="text-xl font-bold text-primary">{money(total)}</div>
            {!ok && rows.length > 0 && <div className="text-xs text-destructive">المبلغ يجب أن يكون موجبًا ولا يتجاوز المتبقي</div>}</div>
          <Button variant="ghost" className="h-11 shrink-0" onClick={onClose}>إلغاء</Button>
          <Button className="col-span-2 h-11 gap-2 sm:col-span-1 sm:min-w-40" disabled={!ok || m.isPending} onClick={async () => { if (await ask(`تأكيد تسجيل سداد ${money(total)}؟`)) m.mutate(); }}>{m.isPending ? "جارٍ التسجيل…" : "تسجيل السداد"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiscountDialog({ f, studentId, onClose, onDone }: { f: Fin; studentId: string; onClose: () => void; onDone: () => void }) {
  const [disc, setDisc] = useState("");
  const [obs, setObs] = useState<string[]>([]);
  const [preview, setPreview] = useState<Row[] | null>(null);
  const d = f.available_discounts.find((x) => x["id"] === disc);
  const eligible = f.obligations.filter((o) => o.status === "pending" && (!d || d["kind"] === "both" || d["kind"] === o.kind) && (!d || (d["terms"] as number[]).includes(o.term)));
  const args = { _student: studentId, _discount: disc, _obligations: obs };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>تطبيق خصم على {f.student["name"]}</DialogTitle></DialogHeader>
        <select aria-label="الخصم" className={selectCls("w-full")} value={disc} onChange={(e) => { setDisc(e.target.value); setObs([]); setPreview(null); }}><option value="">اختر خصمًا ساريًا</option>{f.available_discounts.map((x) => <option key={x["id"]} value={x["id"]}>{x["name"]} — {x["value_type"] === "percent" ? `${x["value"]}%` : money(x["value"])}</option>)}</select>
        {d && <div className="space-y-1">{eligible.map((o) => <label key={o.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={obs.includes(o.id)} onChange={(e) => { setPreview(null); setObs(e.target.checked ? [...obs, o.id] : obs.filter((x) => x !== o.id)); }} />{obLabel(o)} — {money(o.balance.net)}</label>)}{!eligible.length && <p className="text-xs text-muted-foreground">لا توجد مستحقات مؤهلة لهذا الخصم.</p>}</div>}
        {preview && <div className="rounded-lg border p-2 text-xs">{preview.map((p) => <div key={p["obligation_id"]}>{KIND_LABEL[p["kind"]]} — {TERM_LABEL(p["term"])}: خصم {money(p["discount"])}، الصافي {money(p["balance"]?.net)}، المتبقي {money(p["balance"]?.remaining)}</div>)}</div>}
        <div className="flex gap-2">
          <Button variant="outline" disabled={!disc || !obs.length} onClick={async () => { const { data, error } = await db.rpc("sf_discount_preview", args); if (error) toast.error(arabicError(error)); else setPreview(data as Row[]); }}>معاينة</Button>
          <Button disabled={!preview} onClick={async () => { const { error } = await db.rpc("sf_discount_apply", args); if (error) toast.error(arabicError(error)); else { toast.success("طُبق الخصم"); onDone(); } }}>اعتماد الخصم</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransportDialog({ f, studentId, yearId, onClose, onDone }: { f: Fin; studentId: string; yearId: string; onClose: () => void; onDone: () => void }) {
  const cur = (t: number) => f.transport.find((x) => x["term"] === t && x["year_id"] === yearId);
  const init = (t: number) => ({ active: !!cur(t)?.["active"], bus_id: String(cur(t)?.["bus_id"] ?? ""), transport_type: String(cur(t)?.["transport_type"] ?? "round_trip") });
  const [subscribed, setSubscribed] = useState(f.transport.some((x) => x["active"] && x["year_id"] === yearId));
  const [terms, setTerms] = useState({ 1: init(1), 2: init(2) });
  const [starts, setStarts] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }));
  const [busy, setBusy] = useState(false);
  const buses = f.buses.filter((b) => b["op_status"] === "available");
  const save = async () => {
    setBusy(true);
    for (const t of [1, 2] as const) {
      const v = terms[t]; const active = subscribed && v.active;
      if (!active && !cur(t)?.["active"]) continue;
      const { error } = await db.rpc("sf_transport_save", { _student: studentId, _year: yearId, _term: t, _p: { active, bus_id: active ? v.bus_id : null, transport_type: active ? v.transport_type : null, starts } });
      if (error) { toast.error(`${TERM_LABEL(t)}: ${arabicError(error)}`); setBusy(false); return; }
    }
    setBusy(false); toast.success("حُدّث اشتراك النقل وكشف الباص"); onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>اشتراك النقل — {f.student["name"]}</DialogTitle></DialogHeader>
        <select aria-label="حالة الاشتراك" className={selectCls("w-full")} value={subscribed ? "1" : "0"} onChange={(e) => setSubscribed(e.target.value === "1")}><option value="0">غير مشترك في النقل المدرسي</option><option value="1">مشترك في النقل المدرسي</option></select>
        {subscribed && <>
          <div className="space-y-1"><Label htmlFor="ts">تاريخ بداية الاشتراك</Label><Input id="ts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} /></div>
          {([1, 2] as const).map((t) => (
            <fieldset key={t} className="space-y-2 rounded-lg border p-2"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={terms[t].active} onChange={(e) => setTerms({ ...terms, [t]: { ...terms[t], active: e.target.checked } })} />{TERM_LABEL(t)}</label>
              {terms[t].active && <div className="grid grid-cols-2 gap-2">
                <select aria-label={`الباص ${TERM_LABEL(t)}`} className={selectCls("w-full")} value={terms[t].bus_id} onChange={(e) => setTerms({ ...terms, [t]: { ...terms[t], bus_id: e.target.value } })}><option value="">اختر الباص</option>{buses.map((b) => <option key={b["id"]} value={b["id"]}>{b["code"]} — {b["plate"]} (سعة {b["capacity"]})</option>)}</select>
                <select aria-label={`نوع الاشتراك ${TERM_LABEL(t)}`} className={selectCls("w-full")} value={terms[t].transport_type} onChange={(e) => setTerms({ ...terms, [t]: { ...terms[t], transport_type: e.target.value } })}>{TRANSPORT_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
              </div>}</fieldset>))}
          {!buses.length && <p className="text-xs text-destructive">لا توجد باصات متاحة لهذا الفرع في إدارة النقل.</p>}
          <p className="text-xs text-muted-foreground">تُجلب الرسوم من تهيئة رسوم النقل المعتمدة، ويُرفض الاشتراك إن اكتملت سعة الباص أو لم يُعتمد السعر.</p>
        </>}
        <Button disabled={busy || (subscribed && ([1, 2] as const).some((t) => terms[t].active && !terms[t].bus_id))} onClick={save}>حفظ</Button>
      </DialogContent>
    </Dialog>
  );
}

/** Landscape fee table: one row per fee item and term, amounts from the server balance only. */
function FeeTable({ rows }: { rows: { k: "tuition" | "transport"; t: number; o?: Obligation | undefined }[] }) {
  const H = ["البند", "الفصل", "الأصلية", "الخصومات", "الصافي", "المسدد", "المتبقي", "الحالة"];
  const sum = (f: (o: Obligation) => unknown) => rows.reduce((s, r) => s + (r.o ? num(f(r.o)) : 0), 0);
  return <div className="overflow-x-auto rounded-xl border bg-card">
    <table className="w-full min-w-[720px] text-sm">
      <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{H.map((h, i) => <th key={h} className={`p-3 font-semibold ${i > 1 && i < 7 ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(({ k, t, o }) => { const rem = o ? num(o.balance.remaining) : 0; return (
        <tr key={`${k}${t}`} className="border-t transition-colors hover:bg-muted/30">
          <td className="p-3 font-medium">{KIND_LABEL[k]}</td><td className="p-3 text-muted-foreground">{TERM_LABEL(t)}</td>
          {o ? <>
            <td className="p-3 text-end tabular-nums">{money(o.balance.gross)}</td>
            <td className="p-3 text-end tabular-nums text-primary">{num(o.balance.discount) ? `− ${money(o.balance.discount)}` : "—"}</td>
            <td className="p-3 text-end font-semibold tabular-nums">{money(o.balance.net)}</td>
            <td className="p-3 text-end tabular-nums">{money(o.balance.recorded)}</td>
            <td className={`p-3 text-end font-bold tabular-nums ${rem > 0 ? "text-destructive" : "text-primary"}`}>{money(rem)}</td>
          </> : <td colSpan={5} className="p-3 text-center text-muted-foreground">لم تُنشأ المستحقات بعد</td>}
          <td className="p-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${o && rem <= 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{paymentState(o)}</span></td>
        </tr>); })}</tbody>
      <tfoot className="border-t-2 bg-muted/40 font-bold"><tr>
        <td className="p-3" colSpan={2}>الإجمالي</td>
        <td className="p-3 text-end tabular-nums">{money(sum((o) => o.balance.gross))}</td>
        <td className="p-3 text-end tabular-nums text-primary">{money(sum((o) => o.balance.discount))}</td>
        <td className="p-3 text-end tabular-nums">{money(sum((o) => o.balance.net))}</td>
        <td className="p-3 text-end tabular-nums">{money(sum((o) => o.balance.recorded))}</td>
        <td className="p-3 text-end tabular-nums text-destructive">{money(sum((o) => o.balance.remaining))}</td><td />
      </tr></tfoot>
    </table></div>;
}

/** «الأرصدة السابقة»: carried items with the live balance of the original obligation (one source, no new debt). */
function PreviousBalances({ prev, canSetup, onCredit }: { prev: Prev[]; canSetup: boolean; onCredit: (p: Prev, refund: boolean) => void }) {
  const H = ["العام الأصلي", "المدرسة", "البند", "صافي المستحق", "المسدد", "المتبقي", "الرصيد الدائن", "التأخير", ""];
  return <Section title="الأرصدة السابقة">{!prev.length ? <EmptyDetail text="لا توجد أرصدة سابقة مرحّلة إلى هذا العام." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs">
    <thead className="bg-muted/50"><tr>{H.map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
    <tbody>{prev.map((p) => { const b = p.obligation.balance; return <tr key={p.carry_id} className="border-t">
      <td className="p-2">{formatAcademicYear(p.year)}</td><td className="p-2">{p.school}</td><td className="p-2">{obLabel(p.obligation)}</td>
      <td className="p-2 tabular-nums">{money(b.net)}</td><td className="p-2 tabular-nums">{money(b.recorded)}</td>
      <td className={`p-2 font-semibold tabular-nums ${num(b.remaining) > 0 ? "text-destructive" : ""}`}>{money(b.remaining)}</td><td className="p-2 tabular-nums">{money(b.credit)}</td>
      <td className="p-2">{p.days_late ? <span className="text-destructive">متأخر {p.days_late} يومًا</span> : num(b.remaining) > 0 ? "غير متأخر" : num(b.credit) > 0 ? "رصيد دائن" : "مسدد"}</td>
      <td className="p-2">{canSetup && num(b.credit) > 0 && <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => onCredit(p, false)}>استخدام</Button><Button size="sm" variant="ghost" onClick={() => onCredit(p, true)}>استرداد</Button></span>}</td></tr>; })}</tbody>
  </table><p className="mt-1 text-[11px] text-muted-foreground">الرصيد السابق تمثيل للمستحق الأصلي نفسه؛ سداده يسوي المستحق في عامه الأصلي ولا يُحتسب رسومًا جديدة.</p></div>}</Section>;
}

/** Owner-only credit use (pay a selected item) or refund; the server checks the available credit and the target remaining. */
function CreditDialog({ f, studentId, p, refund, onClose, onDone }: { f: Fin; studentId: string; p: Prev; refund: boolean; onClose: () => void; onDone: () => void }) {
  const key = useMemo(() => crypto.randomUUID(), []);
  const avail = num(p.obligation.balance.credit);
  const targets = f.obligations.filter((o) => o.status === "pending" && num(o.balance.remaining) > 0 && o.id !== p.obligation.id);
  const [target, setTarget] = useState(targets[0]?.id ?? ""); const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [method, setMethod] = useState("bank"); const [busy, setBusy] = useState(false);
  const max = refund ? avail : Math.min(avail, num(targets.find((o) => o.id === target)?.balance.remaining));
  const v = Number(amount); const ok = validAllocation(v, max) && reason.trim().length >= 3 && (refund || !!target);
  const save = async () => {
    if (!(await ask(`${refund ? "تأكيد استرداد" : "تأكيد استخدام"} رصيد دائن بمبلغ ${money(v)}؟ لا يُحتسب تحصيلًا نقديًا جديدًا.`))) return;
    setBusy(true);
    const { error } = refund ? await db.rpc("sf_credit_refund", { _student: studentId, _request_key: key, _source: p.obligation.id, _amount: v, _method: method, _reason: reason })
      : await db.rpc("sf_credit_use", { _student: studentId, _request_key: key, _source: p.obligation.id, _target: target, _amount: v, _reason: reason });
    setBusy(false); if (error) toast.error(arabicError(error)); else { toast.success(refund ? "سُجّل الاسترداد" : "استُخدم الرصيد الدائن"); onDone(); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent dir="rtl" className="max-w-lg">
    <DialogHeader><DialogTitle>{refund ? "استرداد رصيد دائن" : "استخدام رصيد دائن"} — {f.student["name"]}</DialogTitle></DialogHeader>
    <p className="text-sm">الرصيد الدائن المتاح من {obLabel(p.obligation)} ({formatAcademicYear(p.year)}): <b>{money(avail)}</b></p>
    {!refund && (targets.length ? <select aria-label="المستحق المراد سداده" className={selectCls("w-full")} value={target} onChange={(e) => setTarget(e.target.value)}>{targets.map((o) => <option key={o.id} value={o.id}>{obLabel(o)} — المتبقي {money(o.balance.remaining)}</option>)}</select> : <p className="text-xs text-destructive">لا توجد مستحقات متبقية في هذا العام لاستخدام الرصيد عليها.</p>)}
    {refund && <select aria-label="طريقة الاسترداد" className={selectCls("w-full")} value={method} onChange={(e) => setMethod(e.target.value)}><option value="bank">تحويل بنكي</option><option value="cash">نقدًا</option><option value="other">أخرى</option></select>}
    <div className="flex gap-2"><Input aria-label="المبلغ" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`حتى ${max}`} /><Button variant="ghost" onClick={() => setAmount(String(max))}>كامل</Button></div>
    <Input aria-label="السبب" placeholder="سبب العملية (إلزامي)" value={reason} onChange={(e) => setReason(e.target.value)} />
    <Button disabled={!ok || busy} onClick={() => void save()}>{refund ? "اعتماد الاسترداد" : "اعتماد الاستخدام"}</Button>
  </DialogContent></Dialog>;
}
