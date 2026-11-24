import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bus, CreditCard, Percent, Receipt, RotateCcw } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { LoadingState } from "@/components/states";
import { ReceiptButtons } from "./finance-tools";
import { StatementButton } from "./statement";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { COLLECTION_STATUS, KIND_LABEL, METHODS, METHOD_LABEL, SF_KEY, TERM_LABEL, TRANSPORT_LABEL, TRANSPORT_TYPES, money, num, paymentState, validAllocation, type Obligation } from "@/lib/student-finance/labels";

type Fin = { student: Row; caps: Record<string, boolean>; years: Row[]; obligations: Obligation[]; transport: Row[]; discounts: Row[]; collections: Row[]; summary: Record<string, Row>; events: Row[]; available_discounts: Row[]; buses: Row[] };

const EVENT_LABEL: Record<string, string> = { obligation_create: "إنشاء مستحق", discount_apply: "تطبيق خصم", transport_save: "تحديث اشتراك النقل", collection_record: "تسجيل سداد", collection_reverse: "إلغاء سداد", discount_edit: "تعديل خصم", discount_remove: "حذف خصم", exception_clear: "إعادة تقييم خصم", transport_edit: "تعديل رسوم النقل", transport_exempt: "إعفاء من رسوم النقل", transport_cancel: "إلغاء اشتراك النقل", sibling_ineligible: "انتهاء استحقاق خصم الإخوة", reprice: "تعديل سعر المستحق", auto_no_price: "تعذر الإنشاء التلقائي: الرسوم غير مهيأة", auto_create_failed: "تعذر الإنشاء التلقائي" };

/** Finance tab inside the existing student side panel. Every action is re-checked by sf_* RPCs. */
export function StudentFinance({ studentId, startCollect = false }: { studentId: string; startCollect?: boolean }) {
  const qc = useQueryClient();
  const [year, setYear] = useState<string>("");
  const q = useQuery({ queryKey: [...SF_KEY, "student", studentId, year], queryFn: async () => { const { data, error } = await db.rpc("sf_get", { _student: studentId, _year: year || null }); if (error) throw error; return data as Fin; }, retry: false });
  const [dlg, setDlg] = useState<"collect" | "discount" | "transport" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: SF_KEY });
  const [started, setStarted] = useState(false);
  useEffect(() => { if (startCollect && !started && q.data?.caps["collect"]) { setStarted(true); setDlg("collect"); } }, [startCollect, started, q.data]);
  const rq = useQuery({ queryKey: [...SF_KEY, "student-receipts", studentId], queryFn: async () => { const { data, error } = await db.rpc("sf_student_receipts", { _student: studentId }); if (error) throw error; return data as Row[]; }, retry: false });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{(q.error as { code?: string }).code === "42501" ? "لا تتوفر لك صلاحية عرض البيانات المالية لهذا الطالب، أو القسم المالي غير مفعّل." : arabicError(q.error)}</p>;
  const f = q.data!;
  const yearId = year || (f.years[0]?.["id"] as string) || "";
  const a = f.summary["annual"] ?? {};
  const cell = (kind: string, term: number) => f.obligations.find((o) => o.kind === kind && o.term === term && (!year || o.year_id === year));
  const run = async (fn: () => Promise<{ error: unknown }>, ok: string) => { const { error } = await fn(); if (error) toast.error(arabicError(error)); else { toast.success(ok); void refresh(); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={year} onChange={(e) => setYear(e.target.value)}><option value="">كل الأعوام</option>{f.years.map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select>
        <StatementButton fins={[f]} title={`كشف حساب ${String(f.student["name"])}`} />
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">تشغيلي — الربط المحاسبي مع وافق غير مفعّل</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["إجمالي الرسوم قبل الخصم", a["gross"]], ["إجمالي الخصومات", a["discount"]], ["صافي المستحقات", a["net"]], ["المسجل سداده", a["recorded"]], ["المتبقي", a["remaining"]], ["الرصيد الدائن", a["credit"]], ["نسبة السداد", null]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold">{v === null ? `${num(a["collection_percent"])}%` : money(v)}</div></div>))}
      </div>
      <FeeTable rows={(["tuition", "transport"] as const).flatMap((k) => [1, 2].map((t) => ({ k, t, o: cell(k, t) })))
        .filter((r) => r.k === "tuition" || (!!r.o && r.o.status !== "void"))} />
      <div className="flex flex-wrap gap-2">
        {f.caps["setup"] && yearId && <Button size="sm" variant="outline" onClick={() => run(() => db.rpc("sf_create_tuition", { _student: studentId, _year: yearId }), "أُنشئت مستحقات الرسوم الدراسية")}><Receipt className="size-4" /> إنشاء مستحقات الرسوم الدراسية</Button>}
        {f.caps["transport"] && <Button size="sm" variant="outline" onClick={() => setDlg("transport")}><Bus className="size-4" /> إدارة اشتراك النقل</Button>}
        {f.caps["discount"] && <Button size="sm" variant="outline" disabled={!f.obligations.length} onClick={() => setDlg("discount")}><Percent className="size-4" /> تطبيق خصم</Button>}
        {f.caps["collect"] && <Button size="sm" disabled={!f.obligations.some((o) => num(o.balance.remaining) > 0)} onClick={() => setDlg("collect")}><CreditCard className="size-4" /> سداد الرسوم</Button>}
      </div>

      <Section title="النقل المدرسي">{f.transport.length ? f.transport.map((t) => <div key={t["id"]} className="flex flex-wrap gap-2 text-xs"><b>{TERM_LABEL(t["term"])}</b>{t["active"] ? <><span>{TRANSPORT_LABEL[t["transport_type"]]}</span><span>الباص {t["bus"]?.code ?? "—"} ({t["bus"]?.plate ?? ""})</span><span>من {t["starts"]}</span></> : <span className="text-muted-foreground">غير مشترك</span>}{t["exempt"] && <span className="rounded bg-muted px-1">معفى</span>}</div>) : <p className="text-xs text-muted-foreground">غير مشترك في النقل المدرسي.</p>}</Section>

      {yearId && <Siblings studentId={studentId} yearId={yearId} />}

      <Section title="الخصومات المطبقة">{f.discounts.length ? f.discounts.map((d) => (
        <div key={d["id"]} className="flex flex-wrap items-center gap-2 text-xs"><b>{d["name"]}</b><span>{KIND_LABEL[d["kind"]]} — {TERM_LABEL(d["term"])}</span><span>{money(d["amount"])}</span>{!d["active"] && <span className="rounded bg-muted px-1">غير فعال{d["manual_override"] ? " (مستثنى يدويًا)" : ""}</span>}
          {f.caps["setup"] && <span className="ms-auto flex gap-1">
            {d["active"] && <Button size="sm" variant="ghost" onClick={async () => { const amt = await askText("القيمة الجديدة للخصم (ر.س)", { required: true, initial: String(d["amount"]) }); if (amt === null) return; const r = await askText("سبب التعديل", { required: true }); if (r) void run(() => db.rpc("sf_override", { _student: studentId, _action: "discount_edit", _id: d["id"], _amount: Number(amt), _reason: r }), "عُدّل الخصم"); }}>تعديل</Button>}
            {d["active"] && <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب حذف الخصم (يبقى في السجل ولا يُعاد تطبيقه تلقائيًا)", { required: true }); if (r) void run(() => db.rpc("sf_override", { _student: studentId, _action: "discount_remove", _id: d["id"], _amount: null, _reason: r }), "حُذف الخصم"); }}>حذف</Button>}
            {d["manual_override"] && !d["active"] && <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب إعادة تقييم الخصم", { required: true }); if (r) void run(() => db.rpc("sf_override", { _student: studentId, _action: "exception_clear", _id: d["id"], _amount: null, _reason: r }), "أُعيد التقييم"); }}>إعادة التقييم</Button>}
          </span>}
        </div>)) : <p className="text-xs text-muted-foreground">لا توجد خصومات.</p>}</Section>

      <Section title="سجل السداد">{f.collections.length ? f.collections.map((c) => (
        <div key={c["id"]} className="flex flex-wrap items-center gap-2 text-xs"><b>{money(c["amount"])}</b><span>{METHOD_LABEL[c["method"]]}</span><span>{c["paid_at"]}</span>{c["ref"] && <span dir="ltr">{c["ref"]}</span>}<span className="rounded bg-muted px-1">{COLLECTION_STATUS[c["status"]] ?? c["status"]}</span>{(() => { const r = rq.data?.find((x) => x["collection_id"] === c["id"]); return r ? <><span className="font-mono" dir="ltr">{r["number"]}</span><ReceiptButtons r={r} /></> : null; })()}
          {f.caps["setup"] && c["status"] !== "reversed" && !c["accounting_confirmed"] && <Button size="sm" variant="ghost" className="ms-auto" onClick={async () => { const r = await askText("سبب إلغاء عملية السداد (تبقى في السجل)", { required: true }); if (r) void run(() => db.rpc("sf_reverse", { _student: studentId, _collection: c["id"], _reason: r }), "أُلغيت العملية"); }}><RotateCcw className="size-4" /> إلغاء</Button>}
        </div>)) : <p className="text-xs text-muted-foreground">لا توجد عمليات سداد.</p>}
        <p className="text-[11px] text-muted-foreground">لكل عملية سند قبض داخلي من ركاز؛ المستند المحاسبي الرسمي يصدر من وافق بعد تفعيل الربط.</p></Section>

      {f.events.length > 0 && <Section title="سجل العمليات المالية">{[...f.events].reverse().slice(0, 30).map((e) => <div key={e["id"]} className="flex gap-2 text-xs"><span className="text-muted-foreground">{new Date(e["created_at"]).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</span><span>{EVENT_LABEL[e["action"]] ?? e["action"]}</span>{e["reason"] && <span className="text-muted-foreground">— {e["reason"]}</span>}</div>)}</Section>}

      {dlg === "collect" && <CollectDialog f={f} studentId={studentId} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void refresh(); }} />}
      {dlg === "discount" && <DiscountDialog f={f} studentId={studentId} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void refresh(); }} />}
      {dlg === "transport" && yearId && <TransportDialog f={f} studentId={studentId} yearId={yearId} onClose={() => setDlg(null)} onDone={() => { setDlg(null); void refresh(); }} />}
    </div>
  );
}

function Siblings({ studentId, yearId }: { studentId: string; yearId: string }) {
  const q = useQuery({ queryKey: [...SF_KEY, "siblings", studentId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_siblings", { _student: studentId, _year: yearId }); if (error) throw error; return data as Row[]; }, retry: false });
  const others = (q.data ?? []).filter((x) => x["id"] !== studentId);
  return <Section title="الإخوة في المجموعة">{q.isLoading ? <p className="text-xs text-muted-foreground">جارٍ التحميل…</p> : others.length ? <>{!(q.data ?? []).find((x) => x["id"] === studentId)?.["rank"] && <p className="text-xs font-semibold text-destructive">هذا الطالب غير مسكّن في فصل لهذا العام، لذلك لا تُنشأ له رسوم ولا يُطبق عليه خصم الإخوة حتى يُسكَّن.</p>}{others.map((x) => (
    <div key={x["id"]} className="flex flex-wrap gap-2 text-xs"><b>{x["name"]}</b><span>{x["school"]}</span><span>{[x["stage"], x["grade"]].filter(Boolean).join(" — ") || "غير مسكّن هذا العام"}</span><span>{x["rank"] ? `الترتيب ${x["rank"]}` : "لا يُحتسب في خصم الإخوة حتى يُسكَّن في فصل"}</span><span>{num(x["sibling_discount"]) > 0 ? `خصم إخوة ${money(x["sibling_discount"])}` : "لا يوجد خصم إخوة مطبق"}</span></div>
  ))}</> : <p className="text-xs text-muted-foreground">لا يوجد إخوة مسجلون بعلاقة أسرية موثقة.</p>}</Section>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2 rounded-xl border bg-card p-3"><h4 className="text-sm font-semibold">{title}</h4>{children}</section>;
}

const obLabel = (o: Obligation) => `${KIND_LABEL[o.kind]} — ${TERM_LABEL(o.term)}`;

function CollectDialog({ f, studentId, onClose, onDone }: { f: Fin; studentId: string; onClose: () => void; onDone: () => void }) {
  const key = useMemo(() => crypto.randomUUID(), []);
  const open = f.obligations.filter((o) => o.status === "pending" && num(o.balance.remaining) > 0);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [v, setV] = useState({ method: "cash", paid_at: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }), ref: "", payer: "", notes: "" });
  const rows = open.filter((o) => amounts[o.id]).map((o) => ({ obligation_id: o.id, amount: Number(amounts[o.id]) }));
  const ok = rows.length > 0 && rows.every((r) => validAllocation(r.amount, num(open.find((o) => o.id === r.obligation_id)?.balance.remaining)));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const m = useMutation({
    mutationFn: async () => { const { error } = await db.rpc("sf_collect", { _student: studentId, _request_key: key, _p: { ...v, allocations: rows } }); if (error) throw error; },
    onSuccess: () => { toast.success("سُجلت عملية السداد"); onDone(); }, onError: (e) => toast.error(arabicError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>سداد رسوم {f.student["name"]}</DialogTitle></DialogHeader>
        <div className="space-y-2">{open.map((o) => (
          <div key={o.id} className="flex items-center gap-2 text-sm"><span className="flex-1">{obLabel(o)} <span className="text-xs text-muted-foreground">(المتبقي {money(o.balance.remaining)})</span></span>
            <Button size="sm" variant="ghost" onClick={() => setAmounts({ ...amounts, [o.id]: String(o.balance.remaining) })}>كامل</Button>
            <Input aria-label={`مبلغ ${obLabel(o)}`} className="w-28" type="number" min={0} step="0.01" value={amounts[o.id] ?? ""} onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })} /></div>))}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="cm">طريقة السداد</Label><select id="cm" className={selectCls("w-full")} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="cd">تاريخ السداد</Label><Input id="cd" type="date" value={v.paid_at} onChange={(e) => setV({ ...v, paid_at: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="cr">رقم المرجع</Label><Input id="cr" value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="cp">اسم الدافع</Label><Input id="cp" value={v.payer} onChange={(e) => setV({ ...v, payer: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label htmlFor="cn">ملاحظات</Label><Input id="cn" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
        </div>
        <p className="text-sm">الإجمالي: <b>{money(total)}</b>{!ok && rows.length > 0 && <span className="ms-2 text-xs text-destructive">المبلغ يجب أن يكون موجبًا ولا يتجاوز المتبقي</span>}</p>
        <Button disabled={!ok || m.isPending} onClick={async () => { if (await ask(`تأكيد تسجيل سداد ${money(total)}؟`)) m.mutate(); }}>تسجيل السداد</Button>
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
