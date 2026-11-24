import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { SF_KEY, TRANSPORT_LABEL, TRANSPORT_TYPES, money } from "@/lib/student-finance/labels";
import { amountInWords } from "@/lib/student-finance/words";
import { exportPagePdf, exportPdf, exportXlsx, printPage, printReport } from "@/lib/export";
import { brandHeaderHtml } from "@/lib/export-brand";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudentFinance } from "./student-finance";

const STATE: Record<string, string> = { new: "جديد — سيُنشأ", exists: "لديه مستحقات", partial: "مستحقات جزئية — مراجعة منفصلة", no_price: "لا توجد رسوم معتمدة لصفه" };


/** «تهيئة مستحقات الطلاب»: server preview first; creation only after the owner confirms (sf_bulk_apply). */
export function BulkSetup({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const qc = useQueryClient();
  const [grade, setGrade] = useState("");
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
export function BusOccupancy({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const [term, setTerm] = useState(1); const [bus, setBus] = useState<Row | null>(null);
  const q = useQuery({ enabled: !!yearId, queryKey: [...SF_KEY, "buses", schoolId, yearId, term], queryFn: async () => { const { data, error } = await db.rpc("sf_bus_occupancy", { _school: schoolId, _year: yearId, _term: term }); if (error) throw error; return data as Row[]; }, retry: false });
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">إشغال الباصات</h2>
      <div className="flex flex-wrap gap-2">
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
  const s = r["snapshot"] as Row; const after = (s["after"] ?? {}) as Row; const st = (s["student"] ?? {}) as Row;
  const cls = [st["stage"], st["grade"], st["section"] && `شعبة ${st["section"]}`].filter(Boolean).join(" — ");
  return [
    ["رقم السند", r["number"]], ["تاريخ السداد", s["paid_at"]], ["تاريخ ووقت التسجيل", issuedAt(r)],
    ["المدرسة", s["school"]], ["الطالب", st["name"]], ["رقم الهوية", st["national_id"] ?? "—"], ...(st["csmart_no"] ? [["الرقم الطلابي", st["csmart_no"]]] : []),
    ...(cls ? [["الصف", cls]] : []), ...(st["guardian"] ? [["ولي الأمر", st["guardian"]]] : []),
    ["العام الدراسي", s["year"] ? formatAcademicYear(s["year"]) : "—"],
    ...allocs(s).map((a) => [a.label, money(a.amount)] as [string, string]),
    ["المبلغ", money(s["amount"])], ["المبلغ كتابة", amountInWords(s["amount"])], ["طريقة السداد", METHOD_AR[s["method"]] ?? s["method"]], ["الرقم المرجعي", s["ref"] || "—"],
    ["الموظف المسدِّد", s["actor"] || s["payer"] || "—"], ["إجمالي المسدد بعد العملية", money(after["recorded"])], ["المتبقي بعد العملية", money(after["remaining"])],
    ["ملاحظات", s["notes"] || "—"], ["حالة السند", r["status"] === "cancelled" ? "ملغى" : "ساري"],
  ].map(([a, b]) => [String(a), String(b ?? "—")]);
}
const issuedAt = (r: Row) => new Date(r["issued_at"]).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
const allocs = (s: Row) => ((s["allocations"] ?? []) as Row[]).map((a) => ({ label: `${KIND_AR[a["kind"]] ?? a["kind"]} — ${TERM_AR(a["term"])}`, prev: a["year"] && a["year"] !== s["year"] ? `رصيد سابق — ${formatAcademicYear(a["year"])}` : "", year: a["year"] ? formatAcademicYear(a["year"]) : "—", amount: a["amount"] }));
const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Printable receipt: letterhead, title band, student / payment sections, a simple items table and totals. Built only from the frozen snapshot. */
export function receiptHtml(r: Row) {
  const s = r["snapshot"] as Row; const after = (s["after"] ?? {}) as Row; const st = (s["student"] ?? {}) as Row;
  const cancelled = r["status"] === "cancelled"; const G = "#1f5f4f";
  const box = (title: string, rows: [string, unknown][]) => `<div style="flex:1;border:1px solid #d9e2df;border-radius:10px;overflow:hidden">
    <div style="background:#eef4f2;color:${G};font-weight:700;font-size:12px;padding:6px 12px">${h(title)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">${rows.map(([k, v]) => `<tr><td style="padding:5px 12px;color:#667;width:38%;border-top:1px solid #eef1f0">${h(k)}</td><td style="padding:5px 12px;font-weight:700;border-top:1px solid #eef1f0">${h(v || "—")}</td></tr>`).join("")}</table></div>`;
  const items = allocs(s);
  const TH = `padding:7px 10px;text-align:right;font-size:11px;background:${G};color:#fff`, TDc = `padding:7px 10px;border-bottom:1px solid #e5ebe9;font-size:12px`;
  return `${brandHeaderHtml({ fallbackName: String(s["school"] ?? ""), side: `رقم السند: <bdi dir="ltr"><b>${h(r["number"])}</b></bdi><br>تاريخ السداد: <bdi dir="ltr">${h(s["paid_at"])}</bdi>` })}
  <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 14px">
    <div><div style="font-size:22px;font-weight:700;color:#1f2a44">سند قبض</div><div style="font-size:11px;color:#667">سند داخلي من ركاز — ليس مستندًا محاسبيًا رسميًا</div></div>
    <div style="border:2px solid ${cancelled ? "#b42318" : G};color:${cancelled ? "#b42318" : G};border-radius:999px;padding:4px 16px;font-weight:700;font-size:12px">${cancelled ? "ملغى — غير صالح" : "ساري"}</div></div>
  <div style="display:flex;gap:12px;margin-bottom:14px">
    ${box("بيانات الطالب", [["اسم الطالب", st["name"]], ["رقم الهوية", st["national_id"]], ["الرقم الطلابي", st["csmart_no"]], ["المرحلة والصف", [st["stage"], st["grade"]].filter(Boolean).join(" — ")], ["الشعبة", st["section"]], ["ولي الأمر", st["guardian"]]])}
    ${box("بيانات السداد", [["العام الدراسي", s["year"] ? formatAcademicYear(s["year"]) : ""], ["طريقة السداد", METHOD_AR[s["method"]] ?? s["method"]], ["الرقم المرجعي", s["ref"]], ["تاريخ ووقت التسجيل", issuedAt(r)], ["الموظف المسدِّد", s["actor"] || s["payer"]], ["المدرسة", s["school"]]])}
  </div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #d9e2df;border-radius:10px;overflow:hidden">
    <thead><tr><th style="${TH};width:40px">#</th><th style="${TH}">البند</th><th style="${TH}">العام الدراسي</th><th style="${TH};text-align:left">المبلغ</th></tr></thead>
    <tbody>${items.map((a, i) => `<tr><td style="${TDc}">${i + 1}</td><td style="${TDc}">${h(a.label)}${a.prev ? ` <span style="color:#b42318;font-size:10px">(${h(a.prev)})</span>` : ""}</td><td style="${TDc}">${h(a.year)}</td><td style="${TDc};text-align:left;font-weight:700">${h(money(a.amount))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="3" style="padding:9px 10px;font-weight:700;background:#eef4f2">الإجمالي المسدد</td><td style="padding:9px 10px;font-weight:700;background:#eef4f2;text-align:left;color:${G};font-size:14px">${h(money(s["amount"]))}</td></tr></tfoot>
  </table>
  <div style="margin-top:8px;font-size:12px;background:#faf8f3;border:1px dashed #d9d2c0;border-radius:8px;padding:7px 12px">المبلغ كتابة: <b>${h(amountInWords(s["amount"]))}</b></div>
  <div style="display:flex;gap:12px;margin-top:12px">
    ${[["إجمالي المسدد بعد العملية", after["recorded"]], ["المتبقي على الطالب", after["remaining"]]].map(([k, v]) => `<div style="flex:1;border:1px solid #d9e2df;border-radius:10px;padding:8px 12px"><div style="font-size:11px;color:#667">${h(k)}</div><div style="font-size:16px;font-weight:700;color:#1f2a44">${h(money(v))}</div></div>`).join("")}
  </div>
  ${s["notes"] ? `<div style="margin-top:12px;font-size:12px"><span style="color:#667">ملاحظات: </span>${h(s["notes"])}</div>` : ""}
  <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px">
    <div style="text-align:center;width:40%"><div style="color:#667">الموظف المسدِّد</div><div style="font-weight:700;margin-top:4px">${h(s["actor"] || s["payer"] || "—")}</div><div style="border-top:1px solid #999;margin-top:28px;padding-top:4px;color:#888;font-size:10px">التوقيع</div></div>
    <div style="text-align:center;width:40%"><div style="color:#667">الختم</div><div style="border-top:1px solid #999;margin-top:52px;padding-top:4px;color:#888;font-size:10px">ختم المدرسة</div></div>
  </div>
  <div style="margin-top:28px;border-top:1px solid #ddd;padding-top:6px;font-size:10px;color:#888;text-align:center">صادر من نظام ركاز — المستند المحاسبي الرسمي يصدر من وافق بعد تفعيل الربط.</div>`;
}
export async function receiptPdf(r: Row) { await exportPagePdf(`سند قبض ${r["number"]}`, receiptHtml(r)); }
export function receiptPrint(r: Row) { printPage(`سند قبض ${r["number"]}`, receiptHtml(r)); }
export function ReceiptButtons({ r }: { r: Row }) {
  return <span className="flex gap-1">
    <Button size="sm" variant="ghost" onClick={() => void receiptPdf(r).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
    <Button size="sm" variant="ghost" onClick={() => receiptPrint(r)}>طباعة</Button>
  </span>;
}

/** Receipts register with search by number/reference/name and date/method filters. */
export function ReceiptsList({ schoolId, yearName }: { schoolId: string; yearName: string }) {
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [method, setMethod] = useState(""); const [allYears, setAllYears] = useState(false);
  const inYear = (r: Row) => { const s = r["snapshot"] as Row; return allYears || s["year"] === yearName || ((s["allocations"] ?? []) as Row[]).some((a) => a["year"] === yearName); };
  const list = useQuery({ queryKey: [...SF_KEY, "receipts", schoolId, q, from, to, method], queryFn: async () => { const { data, error } = await db.rpc("sf_receipts", { _school: schoolId, _q: q || null, _from: from || null, _to: to || null, _method: method || null }); if (error) throw error; return data as Row[]; }, retry: false });
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">سندات القبض الداخلية</h2>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="رقم السند أو الرقم المرجعي أو اسم الطالب" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input type="date" aria-label="من تاريخ" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="إلى تاريخ" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <select aria-label="طريقة السداد" className={selectCls("min-w-32", true)} value={method} onChange={(e) => setMethod(e.target.value)}><option value="">كل الطرق</option>{Object.entries(METHOD_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allYears} onChange={(e) => setAllYears(e.target.checked)} /> كل الأعوام الدراسية</label>
      </div>
      {list.error ? <p className="text-sm text-muted-foreground">{arabicError(list.error)}</p> : <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["رقم السند", "التاريخ", "الطالب", "المبلغ", "الطريقة", "المرجع", "الحالة", ""].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(list.data ?? []).filter(inYear).map((r) => { const s = r["snapshot"] as Row; return <tr key={r["id"]} className="border-t"><td className="p-2 font-mono" dir="ltr">{r["number"]}</td><td className="p-2">{s["paid_at"]}</td><td className="p-2">{s["student"]?.name}</td><td className="p-2">{money(s["amount"])}</td><td className="p-2">{METHOD_AR[s["method"]]}</td><td className="p-2" dir="ltr">{s["ref"] || "—"}</td><td className="p-2">{r["status"] === "cancelled" ? <span className="rounded bg-destructive/10 px-1 text-destructive">ملغى</span> : "ساري"}</td><td className="p-2"><ReceiptButtons r={r} /></td></tr>; })}</tbody></table>
        {!list.isLoading && !(list.data ?? []).filter(inYear).length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد سندات قبض لهذا العام.</p>}
      </div>}
      <p className="text-xs text-muted-foreground">سندات داخلية من ركاز وليست مستندات محاسبية رسمية؛ الطباعة والتحميل لا ينشئان سندًا جديدًا.</p>
    </section>
  );
}

const PENDING_REASON: Record<string, string> = { no_price: "رسوم الصف غير مهيأة أو غير معتمدة", failed: "تعذر الإنشاء التلقائي", not_created: "لم تُنشأ بعد" };
/** «طلاب لم تُنشأ مستحقاتهم» with individual or group retry through the same creation service. */
export function PendingCreation({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ enabled: !!yearId, queryKey: [...SF_KEY, "pending", schoolId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_pending_creation", { _school: schoolId, _year: yearId }); if (error) throw error; return data as Row[]; }, retry: false });
  const retry = async (ids: string[]) => { const { data, error } = await db.rpc("sf_bulk_apply", { _school: schoolId, _year: yearId, _grade: null, _students: ids }); if (error) toast.error(arabicError(error)); else { toast.success(`أُنشئت ${(data as Row)["obligations"]} مستحقات`); void qc.invalidateQueries({ queryKey: SF_KEY }); } };
  const ready = (q.data ?? []).filter((r) => r["reason"] !== "no_price").map((r) => String(r["student_id"]));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">طلاب لم تُنشأ مستحقاتهم</h2>
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
  const H = ["الطالب", "الاتجاه", "رسوم الباص", "الخصم", "الصافي", "المسدد", "المتبقي", "الحالة"];
  const data = rows.map((r) => { const b = (r["balance"] ?? null) as Row | null; const rem = Number(b?.["remaining"] ?? 0);
    const st = r["exempt"] ? "معفى" : !b ? "لم تُنشأ الرسوم" : rem <= 0 ? "مسدد" : Number(b["recorded"] ?? 0) > 0 ? "مسدد جزئيًا" : "غير مسدد";
    return [String(r["name"]), TRANSPORT_LABEL[String(r["transport_type"])] ?? "—", b ? money(b["original"] ?? b["amount"] ?? b["gross"] ?? Number(b["net"] ?? 0) + Number(b["discount"] ?? 0)) : "—", b ? money(b["discount"] ?? 0) : "—", b ? money(b["net"]) : "—", b ? money(b["recorded"]) : "—", b ? money(b["remaining"]) : "—", st]; });
  const meta = { title: `كشف طلاب الباص ${String(bus["code"])}`, filters: [TERM_AR(term), t ? TRANSPORT_LABEL[t] ?? "" : "", s].filter(Boolean) };
  return <section className="space-y-2 rounded-2xl border bg-card p-3">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">كشف طلاب الباص {String(bus["code"])}</h3>
      <Input className="w-40" placeholder="بحث بالاسم" value={s} onChange={(e) => setS(e.target.value)} />
      <select aria-label="نوع الاشتراك" className={selectCls("min-w-32", true)} value={t} onChange={(e) => setT(e.target.value)}><option value="">كل الأنواع</option>{TRANSPORT_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      <Button size="sm" variant="outline" onClick={() => void exportPdf(meta, H, data).catch((e) => toast.error(arabicError(e)))}>PDF</Button>
      <Button size="sm" variant="outline" onClick={() => exportXlsx(meta, H, data)}>Excel</Button>
      <Button size="sm" variant="outline" onClick={() => printReport(meta, H, data)}>طباعة</Button>
      <Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button></div>
    {q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{H.map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
        <tbody>{data.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={"p-2 tabular-nums " + (j === 6 && c !== "—" && c !== money(0) ? "font-semibold text-destructive" : j === 7 && c === "مسدد" ? "font-semibold text-primary" : "")}>{j === 1 ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">{c}</span> : c}</td>)}</tr>)}</tbody></table>
      {!q.isLoading && !data.length && <p className="p-3 text-center text-sm text-muted-foreground">لا يوجد طلاب مشتركون.</p>}</div>}
  </section>;
}

const ARREAR_STATE: Record<string, string> = { overdue: "متأخر", upcoming: "مستحق لاحقًا", no_due: "بلا تاريخ استحقاق" };
/** «المستحقات والمتأخرات»: overdue only after an approved due date has passed (server computes days late). */
export function Arrears({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const q = useQuery({ queryKey: [...SF_KEY, "arrears", schoolId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_arrears", { _school: schoolId, _year: yearId }); if (error) throw error; return data as Row[]; }, retry: false });
  const [s, setS] = useState(""); const [st, setSt] = useState(""); const [kind, setKind] = useState(""); const [term, setTerm] = useState(0); const [origin, setOrigin] = useState(""); const [open, setOpen] = useState<Row | null>(null);
  const rows = (q.data ?? []).filter((r) => (!s || String(r["name"]).includes(s)) && (!st || r["state"] === st) && (!kind || r["kind"] === kind) && (!term || r["term"] === term) && (!origin || (origin === "prev") === !!r["previous"]));
  const H = ["الطالب", "الصف", "العام الأصلي", "الفصل", "النوع", "صافي المستحق", "المسدد", "المتبقي", "تاريخ الاستحقاق", "أيام التأخير", "الحالة"];
  const data = rows.map((r) => { const b = r["balance"] as Row; return [String(r["name"]), [r["grade"], r["section"]].filter(Boolean).join(" / "), `${formatAcademicYear(String(r["year"] ?? ""))}${r["previous"] ? " · رصيد سابق" : ""}`, TERM_AR(Number(r["term"])), KIND_AR[String(r["kind"])] ?? "", money(b["net"]), money(b["recorded"]), money(b["remaining"]), String(r["due_date"] ?? "—"), r["days_late"] == null ? "—" : String(r["days_late"]), ARREAR_STATE[String(r["state"])] ?? ""]; });
  const meta = { title: "المستحقات والمتأخرات", filters: [s, ARREAR_STATE[st] ?? "", KIND_AR[kind] ?? "", term ? TERM_AR(term) : "", origin === "prev" ? "الأعوام السابقة" : origin === "cur" ? "العام الحالي" : ""].filter(Boolean) };
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
    <p className="text-sm">إجمالي المتأخر: <b>{money(total)}</b> · لا يُعد المستحق متأخرًا إلا بعد تجاوز تاريخ استحقاق معتمد، وتُحسب أيام تأخير الرصيد السابق من تاريخ استحقاقه الأصلي.</p>
    <div className="flex flex-wrap gap-2">
      <Input className="w-40" placeholder="بحث بالاسم" value={s} onChange={(e) => setS(e.target.value)} />
      <select aria-label="الحالة" className={selectCls("min-w-32", true)} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(ARREAR_STATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="النوع" className={selectCls("min-w-32", true)} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الرسوم</option><option value="tuition">الرسوم الدراسية</option><option value="transport">النقل المدرسي</option></select>
      <select aria-label="الفصل" className={selectCls("min-w-32", true)} value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={0}>الفصلان</option><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></select>
      <select aria-label="عام المستحق" className={selectCls("min-w-36", true)} value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">العام الحالي والسابق</option><option value="cur">مستحقات العام الحالي</option><option value="prev">أرصدة الأعوام السابقة</option></select>
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

/** Finance KPIs from sf_dashboard for the chosen year (same balances as every other finance screen; previous balances kept apart). */
export function FinanceDashboard({ schoolId, yearId, yearName }: { schoolId: string; yearId: string; yearName: string }) {
  const q = useQuery({ queryKey: [...SF_KEY, "dashboard", schoolId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_dashboard", { _school: schoolId, _year: yearId }); if (error) throw error; return data as Row; }, retry: false });
  const pend = useQuery({ queryKey: [...SF_KEY, "pending-count", schoolId, yearId], queryFn: async () => { const { data, error } = await db.rpc("sf_pending_creation", { _school: schoolId, _year: yearId }); if (error) throw error; return (data as Row[]).length; }, retry: false });
  const d = q.data ?? {}; const n = (k: string) => Number(d[k] ?? 0);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((Math.min(a, b) * 100) / b)}%` : "—");
  const prevBase = n("previous_remaining") + n("previous_collected");
  const groups: { title: string; tone: string; items: [string, string, string?][] }[] = [
    { title: "الرسوم والمستحقات", tone: "border-s-primary", items: [["الرسوم الدراسية", money(n("tuition"))], ["رسوم النقل", money(n("transport"))], ["الإجمالي قبل الخصومات", money(n("tuition") + n("transport"))], ["إجمالي الخصومات", money(n("discount"))], ["منها خصم الإخوة", money(n("sibling"))], ["صافي رسوم العام", money(n("net"))], ["الأرصدة السابقة المستحقة", money(n("previous_remaining")), "previous"], ["إجمالي المطلوب تحصيله", money(n("remaining") + n("previous_remaining"))]] },
    { title: "التحصيل", tone: "border-s-primary", items: [["المسدد من رسوم العام", money(n("recorded"))], ["المحصل من الأرصدة السابقة", money(n("previous_collected"))], ["التحصيل النقدي الفعلي", money(n("cash") + n("previous_collected"))], ["تحصيل اليوم", money(n("today"))], ["تحصيل الشهر", money(n("month"))], ["نسبة تحصيل رسوم العام", pct(n("recorded"), n("net"))], ["نسبة تحصيل الأرصدة السابقة", pct(n("previous_collected"), prevBase)]] },
    { title: "المتبقي والمتأخرات", tone: "border-s-destructive", items: [["المتبقي من رسوم العام", money(n("remaining")), "arrears"], ["المتبقي من الأعوام السابقة", money(n("previous_remaining")), "previous"], ["إجمالي المتبقي", money(n("remaining") + n("previous_remaining"))], ["إجمالي المتأخرات", money(n("overdue") + n("previous_overdue")), "arrears"], ["الأرصدة الدائنة", money(n("credit") + n("previous_credit"))]] },
    { title: "حالات الطلاب", tone: "border-s-muted-foreground", items: [["مسددون بالكامل", String(n("paid_full"))], ["مسددون جزئيًا", String(n("paid_partial"))], ["غير مسددين", String(n("unpaid"))], ["معفيون", String(n("exempt"))], ["لم تُنشأ مستحقاتهم", pend.isLoading ? "…" : String(pend.data ?? 0), "pending"], ["لديهم أرصدة سابقة", String(n("previous_students")), "previous"]] },
  ];
  const meta = { title: "المؤشرات المالية", filters: [formatAcademicYear(yearName)] };
  const [tab, setTab] = useState<string>("overview");
  const TABS: [string, string][] = [["overview", "نظرة عامة"], ...groups.map((g) => [g.title, g.title] as [string, string])];
  const hero: [string, string, string][] = [["صافي رسوم العام", money(n("net")), `قبل الخصومات ${money(n("tuition") + n("transport"))}`], ["المحصّل", money(n("recorded") + n("previous_collected")), `نسبة التحصيل ${pct(n("recorded"), n("net"))}`], ["إجمالي المتبقي", money(n("remaining") + n("previous_remaining")), `منها أرصدة سابقة ${money(n("previous_remaining"))}`], ["المتأخرات", money(n("overdue") + n("previous_overdue")), `تحصيل اليوم ${money(n("today"))}`]];
  const daily = ((d["daily"] as Row[] | undefined) ?? []).slice().reverse(), monthly = ((d["monthly"] as Row[] | undefined) ?? []).slice().reverse();
  const exp = (kind: "pdf" | "xlsx" | "print") => { const H = ["المجموعة", "المؤشر", "القيمة"]; const rows = [...groups.flatMap((g) => g.items.map(([l, v]) => [g.title, l, v])), ...monthly.map((m) => ["التحصيل الشهري", String(m["month"]), money(m["amount"])]), ...daily.map((x) => ["التحصيل اليومي", String(x["day"]), money(x["amount"])])]; if (kind === "pdf") void exportPdf(meta, H, rows).catch((e) => toast.error(arabicError(e))); else if (kind === "xlsx") exportXlsx(meta, H, rows); else printReport(meta, H, rows); };
  const compare: [string, number][] = [["صافي رسوم العام", n("net")], ["المسدد", n("recorded")], ["المتبقي", n("remaining")], ["الأرصدة السابقة", n("previous_remaining")]];
  const status: [string, number, string][] = [["مسدد بالكامل", n("paid_full"), "bg-primary"], ["مسدد جزئيًا", n("paid_partial"), "bg-accent-foreground/60"], ["غير مسدد", n("unpaid"), "bg-destructive"], ["معفى", n("exempt"), "bg-muted-foreground/50"]];
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">المؤشرات المالية — {formatAcademicYear(yearName)}</h2>
      <span className="ms-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => exp("pdf")}>PDF</Button><Button size="sm" variant="outline" onClick={() => exp("xlsx")}>Excel</Button><Button size="sm" variant="outline" onClick={() => exp("print")}>طباعة</Button></span></div>
    <div role="tablist" aria-label="أقسام المؤشرات" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={"min-h-9 rounded-lg px-3 text-sm font-semibold transition-colors " + (tab === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{l}</button>)}</div>
    {q.isLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل المؤشرات…</p> : q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : <>
      {tab === "overview" && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{hero.map(([l, v, sub], i) => <div key={l} className={"rounded-2xl border p-4 shadow-sm " + (i === 0 ? "border-primary bg-primary text-primary-foreground" : i === 3 ? "border-destructive/30 bg-destructive/5" : "bg-card")}>
        <div className={"text-xs font-medium " + (i === 0 ? "text-primary-foreground/80" : "text-muted-foreground")}>{l}</div>
        <div className="mt-1.5 font-display text-2xl font-bold tabular-nums">{v}</div>
        <div className={"mt-1 text-xs " + (i === 0 ? "text-primary-foreground/80" : "text-muted-foreground")}>{sub}</div></div>)}</div>}
      {groups.filter((g) => tab === "overview" ? false : g.title === tab).map((g) => <div key={g.title} className="space-y-2"><h3 className="text-sm font-semibold text-muted-foreground">{g.title}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">{g.items.map(([l, v, to]) => { const inner = <><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold tabular-nums">{v}</div></>;
          return to ? <Link key={l} to="/app/finance" search={(p: Record<string, unknown>) => ({ ...p, v: to }) as never} className={`rounded-xl border border-s-4 ${g.tone} bg-card p-3 transition-colors hover:bg-muted/40`}>{inner}</Link> : <div key={l} className={`rounded-xl border border-s-4 ${g.tone} bg-card p-3`}>{inner}</div>; })}</div></div>)}
      {tab === "overview" && <>      <div className="grid gap-3 lg:grid-cols-2">
        <Bars title="التحصيل الشهري" rows={monthly.map((m) => [String(m["month"]), Number(m["amount"] ?? 0)])} />
        <Bars title="التحصيل اليومي (آخر 30 يومًا)" rows={daily.map((x) => [String(x["day"]).slice(5), Number(x["amount"] ?? 0)])} />
        <Bars title="مقارنة المستحقات بالتحصيل" rows={compare} />
        <div className="rounded-xl border bg-card p-3"><h3 className="mb-2 text-sm font-semibold">توزيع حالات السداد</h3>
          {status.every(([, v]) => !v) ? <p className="text-sm text-muted-foreground">لا توجد مستحقات لهذا العام.</p> : <>
            <div className="flex h-4 overflow-hidden rounded-full bg-muted">{status.map(([l, v, c]) => v ? <div key={l} className={c} style={{ width: `${(v * 100) / status.reduce((a, [, x]) => a + x, 0)}%` }} title={`${l}: ${v}`} /> : null)}</div>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">{status.map(([l, v, c]) => <li key={l} className="flex items-center gap-2"><span className={`size-3 rounded-sm ${c}`} />{l}: <b>{v}</b></li>)}</ul></>}
        </div>
      </div></>}
      <p className="text-xs text-muted-foreground">أرقام تشغيلية من ركاز · المتأخرات بعد تاريخ استحقاق معتمد فقط · استخدام الرصيد الدائن لا يُحتسب تحصيلًا نقديًا · الأرصدة السابقة لا تُضاف إلى رسوم العام</p></>}
  </section>;
}

/** Simple horizontal bars from real amounts; shows an empty note when there is no data. */
function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(0, ...rows.map(([, v]) => v));
  return <div className="rounded-xl border bg-card p-3"><h3 className="mb-2 text-sm font-semibold">{title}</h3>
    {!rows.length || max === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات.</p> : <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs">{rows.map(([l, v]) => <li key={l} className="grid grid-cols-[5.5rem_1fr_7rem] items-center gap-2"><span className="truncate text-muted-foreground">{l}</span><span className="h-2.5 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(v * 100) / max}%` }} /></span><span className="text-end tabular-nums">{money(v)}</span></li>)}</ul>}
  </div>;
}
