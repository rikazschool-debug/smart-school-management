import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { SF_KEY, TRANSPORT_LABEL, TRANSPORT_TYPES, money } from "@/lib/student-finance/labels";
import { amountInWords } from "@/lib/student-finance/words";
import { exportLetterPdf, exportPdf, exportXlsx, printReport } from "@/lib/export";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudentFinance } from "./student-finance";

const STATE: Record<string, string> = { new: "جديد — سيُنشأ", exists: "لديه مستحقات", partial: "مستحقات جزئية — مراجعة منفصلة", no_price: "لا توجد رسوم معتمدة لصفه" };

function useYears(schoolId: string) {
  return useQuery({ queryKey: ["sf-years", schoolId], queryFn: async () => { const { data, error } = await db.from("academic_years").select("id,name,is_current").eq("school_id", schoolId).order("start_date", { ascending: false }); if (error) throw error; return data as Row[]; } });
}

/** «تهيئة مستحقات الطلاب»: server preview first; creation only after the owner confirms (sf_bulk_apply). */
export function BulkSetup({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const years = useYears(schoolId);
  const [year, setYear] = useState(""); const [grade, setGrade] = useState("");
  const yearId = year || (years.data?.find((y) => y["is_current"]) ?? years.data?.[0])?.["id"] || "";
  const grades = useQuery({ queryKey: ["sf-grades", schoolId], queryFn: async () => { const { data, error } = await db.from("grades").select("id,name,stages(name)").eq("school_id", schoolId); if (error) throw error; return data as Row[]; } });
  const pv = useQuery({ enabled: !!yearId, queryKey: [...SF_KEY, "bulk", schoolId, yearId, grade], queryFn: async () => { const { data, error } = await db.rpc("sf_bulk_preview", { _school: schoolId, _year: yearId, _grade: grade || null, _students: null }); if (error) throw error; return data as Row; }, retry: false });
  const [busy, setBusy] = useState(false);
  const rows = (pv.data?.["rows"] ?? []) as Row[];
  const newCount = rows.filter((r) => r["state"] === "new").length;
  const apply = async () => {
    if (!(await ask(`إنشاء مستحقات ${newCount} طالبًا بإجمالي ${money(pv.data?.["new_total"])} قبل الخصومات؟ لن تُمس الحسابات التي لديها مستحقات سابقة.`))) return;
    setBusy(true); const { data, error } = await db.rpc("sf_bulk_apply", { _school: schoolId, _year: yearId, _grade: grade || null, _students: null }); setBusy(false);
    if (error) toast.error(arabicError(error)); else { toast.success(`أُنشئت ${(data as Row)["obligations"]} مستحقات لـ ${(data as Row)["students"]} طالب`); void qc.invalidateQueries({ queryKey: SF_KEY }); }
  };
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">تهيئة مستحقات الطلاب</h2>
      <div className="flex flex-wrap gap-2">
        <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={yearId} onChange={(e) => setYear(e.target.value)}>{(years.data ?? []).map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select>
        <select aria-label="الصف" className={selectCls("min-w-40", true)} value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">كل الصفوف</option>{(grades.data ?? []).map((g) => <option key={g["id"]} value={g["id"]}>{g["stages"]?.name} — {g["name"]}</option>)}</select>
      </div>
      {pv.error ? <p className="text-sm text-muted-foreground">{arabicError(pv.error)}</p> : pv.data && <>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[["الطلاب المحددون", String(pv.data["selected"])], ["لديهم مستحقات سابقة", String(pv.data["existing"])], ["بلا تهيئة رسوم", String(pv.data["no_price"])], ["سيُنشأ لهم", String(newCount)], ["إجمالي المستحقات الجديدة", money(pv.data["new_total"])]].map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold">{v}</div></div>)}
        </div>
        <p className="text-xs text-muted-foreground">{pv.data["note"]} المدفوعات والأرصدة السابقة لا تتغير.</p>
        <div className="max-h-80 overflow-auto rounded-2xl border bg-card">
          <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/80 text-xs"><tr>{["الطالب", "الصف", "الشعبة", "الفصول", "الرسوم", "حالة الحساب"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r["student_id"]} className="border-t"><td className="p-2">{r["name"]}</td><td className="p-2">{r["grade"]}</td><td className="p-2">{r["section"]}</td><td className="p-2">{(r["terms"] as number[]).map((t) => t === 1 ? "الأول" : "الثاني").join("، ") || "—"}</td><td className="p-2">{money(r["price"])}</td><td className="p-2">{STATE[r["state"]]}</td></tr>)}</tbody></table>
          {!rows.length && <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد طلاب مسكّنون في هذا النطاق.</p>}
        </div>
        <Button disabled={!newCount || busy} onClick={apply}>اعتماد إنشاء المستحقات ({newCount})</Button>
      </>}
    </section>
  );
}

/** Bus seats per direction from the actual subscriptions (sf_bus_occupancy). */
export function BusOccupancy({ schoolId }: { schoolId: string }) {
  const years = useYears(schoolId);
  const [year, setYear] = useState(""); const [term, setTerm] = useState(1); const [bus, setBus] = useState<Row | null>(null);
  const yearId = year || (years.data?.find((y) => y["is_current"]) ?? years.data?.[0])?.["id"] || "";
  const q = useQuery({ enabled: !!yearId, queryKey: [...SF_KEY, "buses", schoolId, yearId, term], queryFn: async () => { const { data, error } = await db.rpc("sf_bus_occupancy", { _school: schoolId, _year: yearId, _term: term }); if (error) throw error; return data as Row[]; }, retry: false });
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">إشغال الباصات</h2>
      <div className="flex flex-wrap gap-2">
        <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={yearId} onChange={(e) => setYear(e.target.value)}>{(years.data ?? []).map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select>
        <select aria-label="الفصل" className={selectCls("min-w-32", true)} value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></select>
      </div>
      {q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["الباص", "السعة", "الطلاب", "ذهاب وعودة", "ذهاب فقط", "عودة فقط", "متاح للذهاب", "متاح للعودة", "الإشغال"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(q.data ?? []).map((b) => <tr key={b["bus_id"]} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setBus(b)}><td className="p-2">{b["code"]} <span className="text-xs text-muted-foreground">{b["plate"]}</span></td><td className="p-2">{b["capacity"]}</td><td className="p-2">{b["students"]}</td><td className="p-2">{b["round_trip"]}</td><td className="p-2">{b["outbound"]}</td><td className="p-2">{b["return"]}</td><td className="p-2">{b["free_out"]}</td><td className="p-2">{b["free_ret"]}</td><td className="p-2 font-semibold">{b["occupancy"]}%</td></tr>)}</tbody></table>
        {!q.isLoading && !(q.data ?? []).length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد باصات مسجلة لهذا الفرع.</p>}
      </div>}
      {bus && <BusRoster bus={bus} yearId={yearId} term={term} onClose={() => setBus(null)} />}
    </section>
  );
}

const METHOD_AR: Record<string, string> = { cash: "نقدًا", bank: "تحويل بنكي", mada: "مدى", credit_card: "بطاقة ائتمانية", electronic: "دفع إلكتروني", other: "أخرى" };
const TERM_AR = (t: number) => (t === 1 ? "الفصل الأول" : "الفصل الثاني");
const KIND_AR: Record<string, string> = { tuition: "الرسوم الدراسية", transport: "النقل المدرسي" };

/** Receipt lines from the snapshot frozen at issue time — later fee changes never alter it. */
export function receiptLines(r: Row): [string, string][] {
  const s = r["snapshot"] as Row; const after = (s["after"] ?? {}) as Row;
  return [
    ["رقم السند", r["number"]], ["تاريخ السداد", s["paid_at"]], ["وقت الإصدار", new Date(r["issued_at"]).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })],
    ["المدرسة", s["school"]], ["الطالب", s["student"]?.name], ["الرقم الطلابي / الهوية", s["student"]?.national_id ?? "—"], ["الدافع", s["payer"] || "—"],
    ["العام الدراسي", s["year"] ? formatAcademicYear(s["year"]) : "—"],
    ...((s["allocations"] ?? []) as Row[]).map((a) => [`${KIND_AR[a["kind"]]} — ${TERM_AR(a["term"])}`, money(a["amount"])] as [string, string]),
    ["المبلغ", money(s["amount"])], ["المبلغ كتابة", amountInWords(s["amount"])], ["طريقة السداد", METHOD_AR[s["method"]] ?? s["method"]], ["الرقم المرجعي", s["ref"] || "—"],
    ["الموظف المسؤول", s["actor"] || "—"], ["إجمالي المسدد بعد العملية", money(after["recorded"])], ["المتبقي بعد العملية", money(after["remaining"])],
    ["ملاحظات", s["notes"] || "—"], ["حالة السند", r["status"] === "cancelled" ? "ملغى" : "ساري"],
  ].map(([a, b]) => [String(a), String(b ?? "—")]);
}
export async function receiptPdf(r: Row) {
  await exportLetterPdf({ org: String((r["snapshot"] as Row)["school"] ?? ""), title: "سند قبض داخلي", ref: String(r["number"]), issued: String((r["snapshot"] as Row)["paid_at"]),
    body: receiptLines(r).map(([a, b]) => `${a}: ${b}`).join("\n") + "\n\nسند داخلي من ركاز وليس مستندًا محاسبيًا رسميًا؛ المستند الرسمي يصدر من وافق بعد تفعيل الربط.",
    void: r["status"] === "cancelled" ? "سند ملغى" : null });
}
export function receiptPrint(r: Row) {
  printReport({ title: `سند قبض داخلي ${r["number"]}`, school: String((r["snapshot"] as Row)["school"] ?? ""), filters: [], note: "سند داخلي من ركاز وليس مستندًا محاسبيًا رسميًا." }, ["البيان", "القيمة"], receiptLines(r));
}
export function ReceiptButtons({ r }: { r: Row }) {
  return <span className="flex gap-1">
    <Button size="sm" variant="ghost" onClick={() => void receiptPdf(r).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
    <Button size="sm" variant="ghost" onClick={() => receiptPrint(r)}>طباعة</Button>
  </span>;
}

/** Receipts register with search by number/reference/name and date/method filters. */
export function ReceiptsList({ schoolId }: { schoolId: string }) {
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [method, setMethod] = useState("");
  const list = useQuery({ queryKey: [...SF_KEY, "receipts", schoolId, q, from, to, method], queryFn: async () => { const { data, error } = await db.rpc("sf_receipts", { _school: schoolId, _q: q || null, _from: from || null, _to: to || null, _method: method || null }); if (error) throw error; return data as Row[]; }, retry: false });
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">سندات القبض الداخلية</h2>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="رقم السند أو الرقم المرجعي أو اسم الطالب" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input type="date" aria-label="من تاريخ" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="إلى تاريخ" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <select aria-label="طريقة السداد" className={selectCls("min-w-32", true)} value={method} onChange={(e) => setMethod(e.target.value)}><option value="">كل الطرق</option>{Object.entries(METHOD_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {list.error ? <p className="text-sm text-muted-foreground">{arabicError(list.error)}</p> : <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["رقم السند", "التاريخ", "الطالب", "المبلغ", "الطريقة", "المرجع", "الحالة", ""].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(list.data ?? []).map((r) => { const s = r["snapshot"] as Row; return <tr key={r["id"]} className="border-t"><td className="p-2 font-mono" dir="ltr">{r["number"]}</td><td className="p-2">{s["paid_at"]}</td><td className="p-2">{s["student"]?.name}</td><td className="p-2">{money(s["amount"])}</td><td className="p-2">{METHOD_AR[s["method"]]}</td><td className="p-2" dir="ltr">{s["ref"] || "—"}</td><td className="p-2">{r["status"] === "cancelled" ? <span className="rounded bg-destructive/10 px-1 text-destructive">ملغى</span> : "ساري"}</td><td className="p-2"><ReceiptButtons r={r} /></td></tr>; })}</tbody></table>
        {!list.isLoading && !(list.data ?? []).length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد سندات قبض.</p>}
      </div>}
      <p className="text-xs text-muted-foreground">سندات داخلية من ركاز وليست مستندات محاسبية رسمية؛ الطباعة والتحميل لا ينشئان سندًا جديدًا.</p>
    </section>
  );
}

const PENDING_REASON: Record<string, string> = { no_price: "رسوم الصف غير مهيأة أو غير معتمدة", failed: "تعذر الإنشاء التلقائي", not_created: "لم تُنشأ بعد" };
/** «طلاب لم تُنشأ مستحقاتهم» with individual or group retry through the same creation service. */
export function PendingCreation({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient(); const years = useYears(schoolId); const [year, setYear] = useState("");
  const yearId = year || (years.data?.find((y) => y["is_current"]) ?? years.data?.[0])?.["id"] || "";
  const q = useQuery({ enabled: !!yearId, queryKey: [...SF_KEY, "pending", schoolId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_pending_creation", { _school: schoolId, _year: yearId }); if (error) throw error; return data as Row[]; }, retry: false });
  const retry = async (ids: string[]) => { const { data, error } = await db.rpc("sf_bulk_apply", { _school: schoolId, _year: yearId, _grade: null, _students: ids }); if (error) toast.error(arabicError(error)); else { toast.success(`أُنشئت ${(data as Row)["obligations"]} مستحقات`); void qc.invalidateQueries({ queryKey: SF_KEY }); } };
  const ready = (q.data ?? []).filter((r) => r["reason"] !== "no_price").map((r) => String(r["student_id"]));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">طلاب لم تُنشأ مستحقاتهم</h2>
        <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={yearId} onChange={(e) => setYear(e.target.value)}>{(years.data ?? []).map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select>
        {ready.length > 0 && <Button size="sm" onClick={() => void retry(ready)}>إعادة المحاولة للجميع ({ready.length})</Button>}</div>
      {q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : (q.data ?? []).length ? <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["الطالب", "الصف", "الشعبة", "السبب", ""].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(q.data ?? []).map((r) => <tr key={r["student_id"]} className="border-t"><td className="p-2">{r["name"]}</td><td className="p-2">{r["grade"]}</td><td className="p-2">{r["section"]}</td><td className="p-2">{PENDING_REASON[r["reason"]]}{r["error"] ? ` — ${r["error"]}` : ""}</td><td className="p-2">{r["reason"] !== "no_price" && <Button size="sm" variant="ghost" onClick={() => void retry([r["student_id"]])}>إعادة المحاولة</Button>}</td></tr>)}</tbody></table>
      </div> : !q.isLoading && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">كل الطلاب المسكّنين لديهم مستحقات لهذا العام.</p>}
    </section>
  );
}

function BusRoster({ bus, yearId, term, onClose }: { bus: Row; yearId: string; term: number; onClose: () => void }) {
  const q = useQuery({ queryKey: [...SF_KEY, "bus-roster", bus["bus_id"], yearId, term], queryFn: async () => { const { data, error } = await db.rpc("sf_bus_roster", { _bus: bus["bus_id"], _year: yearId, _term: term }); if (error) throw error; return data as Row[]; }, retry: false });
  const [s, setS] = useState(""); const [t, setT] = useState("");
  const rows = (q.data ?? []).filter((r) => (!s || String(r["name"]).includes(s)) && (!t || r["transport_type"] === t));
  const H = ["الطالب", "نوع الاشتراك", "الرسوم"]; const data = rows.map((r) => [String(r["name"]), TRANSPORT_LABEL[String(r["transport_type"])] ?? "—", r["exempt"] ? "معفى" : "—"]);
  const meta = { title: `كشف طلاب الباص ${String(bus["code"])}`, filters: [TERM_AR(term), t ? TRANSPORT_LABEL[t] ?? "" : "", s].filter(Boolean) };
  return <section className="space-y-2 rounded-2xl border bg-card p-3">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">كشف طلاب الباص {String(bus["code"])}</h3>
      <Input className="w-40" placeholder="بحث بالاسم" value={s} onChange={(e) => setS(e.target.value)} />
      <select aria-label="نوع الاشتراك" className={selectCls("min-w-32", true)} value={t} onChange={(e) => setT(e.target.value)}><option value="">كل الأنواع</option>{TRANSPORT_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      <Button size="sm" variant="outline" onClick={() => void exportPdf(meta, H, data).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
      <Button size="sm" variant="outline" onClick={() => exportXlsx(meta, H, data)}>Excel</Button>
      <Button size="sm" variant="outline" onClick={() => printReport(meta, H, data)}>طباعة</Button>
      <Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button></div>
    {q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : <ul className="divide-y text-sm">{data.map((r, i) => <li key={i} className="flex justify-between p-2"><span>{r[0]}</span><span className="text-muted-foreground">{r[1]} {r[2] !== "—" ? `· ${r[2]}` : ""}</span></li>)}{!q.isLoading && !data.length && <li className="p-3 text-center text-muted-foreground">لا يوجد طلاب مشتركون.</li>}</ul>}
  </section>;
}

const ARREAR_STATE: Record<string, string> = { overdue: "متأخر", upcoming: "مستحق لاحقًا", no_due: "بلا تاريخ استحقاق" };
/** «المستحقات والمتأخرات»: overdue only after an approved due date has passed (server computes days late). */
export function Arrears({ schoolId }: { schoolId: string }) {
  const q = useQuery({ queryKey: [...SF_KEY, "arrears", schoolId], queryFn: async () => { const { data, error } = await db.rpc("sf_arrears", { _school: schoolId }); if (error) throw error; return data as Row[]; }, retry: false });
  const [s, setS] = useState(""); const [st, setSt] = useState(""); const [kind, setKind] = useState(""); const [term, setTerm] = useState(0); const [open, setOpen] = useState<Row | null>(null);
  const rows = (q.data ?? []).filter((r) => (!s || String(r["name"]).includes(s)) && (!st || r["state"] === st) && (!kind || r["kind"] === kind) && (!term || r["term"] === term));
  const H = ["الطالب", "الصف", "الفصل", "النوع", "صافي المستحق", "المسدد", "المتبقي", "تاريخ الاستحقاق", "أيام التأخير", "الحالة"];
  const data = rows.map((r) => { const b = r["balance"] as Row; return [String(r["name"]), [r["grade"], r["section"]].filter(Boolean).join(" / "), TERM_AR(Number(r["term"])), KIND_AR[String(r["kind"])] ?? "", money(b["net"]), money(b["recorded"]), money(b["remaining"]), String(r["due_date"] ?? "—"), r["days_late"] == null ? "—" : String(r["days_late"]), ARREAR_STATE[String(r["state"])] ?? ""]; });
  const meta = { title: "المستحقات والمتأخرات", filters: [s, ARREAR_STATE[st] ?? "", KIND_AR[kind] ?? "", term ? TERM_AR(term) : ""].filter(Boolean) };
  const total = rows.filter((r) => r["state"] === "overdue").reduce((a, r) => a + Number((r["balance"] as Row)["remaining"] ?? 0), 0);
  const overdueIds = rows.filter((r) => r["state"] === "overdue").map((r) => String(r["obligation_id"])).slice(0, 500);
  const [busy, setBusy] = useState(false);
  // In-app reminder to verified guardians of the shown overdue rows; the server re-checks overdue state and sends at most once per item per day.
  async function remind() {
    if (!(await ask(`إرسال إشعار تذكير داخل المنصة لأولياء أمور ${overdueIds.length} مستحقًا متأخرًا ظاهرًا في القائمة؟ لا يُرسل أكثر من مرة يوميًا لكل مستحق.`, { ok: "إرسال التذكير" }))) return;
    setBusy(true);
    try {
      const { data, error } = await db.rpc("sf_remind", { _school: schoolId, _obligations: overdueIds }); if (error) throw error;
      const d = data as Row; const n = Number(d["obligations"] ?? 0);
      if (n) toast.success(`أُرسل التذكير لـ ${String(d["guardians"])} من أولياء الأمور عن ${n} مستحقًا.`);
      else toast.info("لم يُرسل تذكير جديد: إما أُرسل اليوم مسبقًا أو لا يوجد ولي أمر موثّق بحساب.");
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return <section className="space-y-3">
    <h2 className="text-lg font-bold">المستحقات والمتأخرات</h2>
    <p className="text-sm">إجمالي المتأخر: <b>{money(total)}</b> · لا يُعد المستحق متأخرًا إلا بعد تجاوز تاريخ استحقاق معتمد.</p>
    <div className="flex flex-wrap gap-2">
      <Input className="w-40" placeholder="بحث بالاسم" value={s} onChange={(e) => setS(e.target.value)} />
      <select aria-label="الحالة" className={selectCls("min-w-32", true)} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(ARREAR_STATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="النوع" className={selectCls("min-w-32", true)} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الرسوم</option><option value="tuition">الرسوم الدراسية</option><option value="transport">النقل المدرسي</option></select>
      <select aria-label="الفصل" className={selectCls("min-w-32", true)} value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={0}>الفصلان</option><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></select>
      <Button size="sm" variant="outline" onClick={() => void exportPdf(meta, H, data).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
      <Button size="sm" variant="outline" onClick={() => exportXlsx(meta, H, data)}>Excel</Button>
      <Button size="sm" variant="outline" onClick={() => printReport(meta, H, data)}>طباعة</Button>
      <Button size="sm" disabled={busy || !overdueIds.length} onClick={() => void remind()}>تذكير أولياء الأمور ({overdueIds.length})</Button>
    </div>
    {q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{H.map((h) => <th key={h} className="p-2 text-start">{h}</th>)}<th className="p-2" /></tr></thead>
      <tbody>{data.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}<td className="p-2"><Button size="sm" variant="outline" onClick={() => setOpen(rows[i] ?? null)}>سداد / الحساب</Button></td></tr>)}</tbody></table>
      {!q.isLoading && !data.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد مستحقات متبقية.</p>}</div>}
    <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
      <DialogContent dir="rtl" className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{String(open?.["name"] ?? "")}</DialogTitle></DialogHeader>{open && <StudentFinance studentId={String(open["student_id"])} />}</DialogContent>
    </Dialog>
  </section>;
}

/** Finance KPIs from sf_dashboard (same balances as every other finance screen; no duplicated totals). */
export function FinanceDashboard({ schoolId }: { schoolId: string }) {
  const years = useYears(schoolId); const [year, setYear] = useState("");
  const q = useQuery({ queryKey: [...SF_KEY, "dashboard", schoolId, year], queryFn: async () => { const { data, error } = await db.rpc("sf_dashboard", { _school: schoolId, _year: year || null }); if (error) throw error; return data as Row; }, retry: false });
  const pend = useQuery({ enabled: !!year, queryKey: [...SF_KEY, "pending-count", schoolId, year], queryFn: async () => { const { data, error } = await db.rpc("sf_pending_creation", { _school: schoolId, _year: year }); if (error) throw error; return (data as Row[]).length; }, retry: false });
  const d = q.data ?? {}; const net = Number(d["net"] ?? 0), rec = Number(d["recorded"] ?? 0);
  const k: [string, string][] = [["الرسوم الدراسية", money(d["tuition"])], ["رسوم النقل", money(d["transport"])], ["إجمالي الخصومات", money(d["discount"])], ["منها خصم الإخوة", money(d["sibling"])], ["صافي المستحقات", money(net)], ["إجمالي المسدد", money(rec)], ["إجمالي المتبقي", money(d["remaining"])], ["إجمالي المتأخرات", money(d["overdue"])], ["الأرصدة الدائنة", money(d["credit"])], ["نسبة التحصيل", net > 0 ? `${Math.round((Math.min(rec, net) * 100) / net)}%` : "—"], ["تحصيل اليوم", money(d["today"])], ["مسددون بالكامل", String(d["paid_full"] ?? 0)], ["مسددون جزئيًا", String(d["paid_partial"] ?? 0)], ["غير مسددين", String(d["unpaid"] ?? 0)], ["معفيون", String(d["exempt"] ?? 0)], ["لم تُنشأ مستحقاتهم", year ? String(pend.data ?? "…") : "اختر العام"]];
  const meta = { title: "المؤشرات المالية", filters: [year ? formatAcademicYear(String((years.data ?? []).find((y) => y["id"] === year)?.["name"] ?? "")) : "كل الأعوام"] };
  const daily = (d["daily"] as Row[] | undefined) ?? [], monthly = (d["monthly"] as Row[] | undefined) ?? [];
  const exp = (kind: "pdf" | "xlsx" | "print") => { const H = ["المؤشر", "القيمة"]; const rows = [...k, ...monthly.map((m) => [`تحصيل ${String(m["month"])}`, money(m["amount"])] as [string, string]), ...daily.map((x) => [`تحصيل ${String(x["day"])}`, money(x["amount"])] as [string, string])]; if (kind === "pdf") void exportPdf(meta, H, rows).catch((e) => toast.error(arabicError(e))); else if (kind === "xlsx") exportXlsx(meta, H, rows); else printReport(meta, H, rows); };
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">المؤشرات المالية</h2>
      <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={year} onChange={(e) => setYear(e.target.value)}><option value="">كل الأعوام</option>{(years.data ?? []).map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select>
      <Button size="sm" variant="outline" onClick={() => exp("pdf")}>PDF</Button><Button size="sm" variant="outline" onClick={() => exp("xlsx")}>Excel</Button><Button size="sm" variant="outline" onClick={() => exp("print")}>طباعة</Button></div>
    {q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">{k.map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold">{v}</div></div>)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-3"><h3 className="mb-2 text-sm font-semibold">التحصيل الشهري</h3>{monthly.length ? <ul className="space-y-1 text-sm">{monthly.map((m) => <li key={String(m["month"])} className="flex justify-between"><span>{String(m["month"])}</span><span>{money(m["amount"])}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">لا يوجد تحصيل.</p>}</div>
        <div className="rounded-xl border bg-card p-3"><h3 className="mb-2 text-sm font-semibold">التحصيل اليومي (30 يومًا)</h3>{daily.length ? <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">{daily.map((x) => <li key={String(x["day"])} className="flex justify-between"><span>{String(x["day"])}</span><span>{money(x["amount"])}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">لا يوجد تحصيل.</p>}</div>
      </div>
      <p className="text-xs text-muted-foreground">أرقام تشغيلية من ركاز · المتأخرات بعد تاريخ استحقاق معتمد فقط · خصم الإخوة جزء من إجمالي الخصومات</p></>}
  </section>;
}
