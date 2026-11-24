import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { LoadingState, ErrorState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { KIND_LABEL, SF_KEY, TERM_LABEL, TRANSPORT_LABEL, TRANSPORT_TYPES, money, num } from "@/lib/student-finance/labels";
import { StudentFinance } from "./student-finance";
import { SEARCH_HINT, useStudentSearch } from "./search";
import { useRowSelect } from "./row-select";

type Cell = string | number;
const useRpc = (name: string, schoolId: string, yearId: string) => useQuery({ queryKey: [...SF_KEY, name, schoolId, yearId], queryFn: async () => { const { data, error } = await db.rpc(name, { _school: schoolId, _year: yearId || null }); if (error) throw error; return data as Row[]; }, retry: false });
// grade names repeat across stages («أول» الابتدائية / المتوسطة), so grade filters always carry the stage
const gradeKey = (c: Row | null | undefined) => (c?.["grade"] ? [c["stage"], c["grade"]].filter(Boolean).join(" — ") : "");
const clsText = (c: Row | null | undefined) => [c?.["stage"], c?.["grade"], c?.["section"]].filter(Boolean).join(" / ");
const uniq = (xs: unknown[]) => [...new Set(xs.filter(Boolean).map(String))].sort();

export function Kpis({ items }: { items: [string, string, ("bad" | "good")?][] }) {
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">{items.map(([l, v, tone]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className={"mt-1 text-base font-bold " + (tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "")}>{v}</div></div>)}</div>;
}
function Sel({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return <select aria-label={label} className={selectCls("min-w-32", true)} value={value} onChange={(e) => onChange(e.target.value)}><option value="">{label}: الكل</option>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>;
}
/** Shared list body: filters bar, exports from the same rows, table, «فتح الحساب» dialog on the unified student finance panel. */
function ListPage({ title, note, kpis, filters, headers, rows, ids, names, empty, count }: { title: string; note?: string; kpis: ReactNode; filters: ReactNode; headers: string[]; rows: Cell[][]; ids: string[]; names: string[]; empty: string; count: string[] }) {
  const [open, setOpen] = useState<number | null>(null); const rs = useRowSelect(rows.length);
  const meta = { title, filters: count, totals: true }; const out = rs.pick(rows);
  return <section className="space-y-3">
    <div><h2 className="text-lg font-bold">{title}</h2>{note && <p className="text-xs text-muted-foreground">{note}</p>}</div>
    {kpis}
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">{filters}
      <span className="ms-auto flex items-center gap-1">{rs.note}<Button size="sm" variant="outline" onClick={() => void exportPdf(meta, headers, out).catch((e) => toast.error(arabicError(e)))}>PDF</Button><Button size="sm" variant="outline" onClick={() => exportXlsx(meta, headers, out)}>Excel</Button><Button size="sm" variant="outline" onClick={() => printReport(meta, headers, out)}>طباعة</Button></span></div>
    <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-xs"><thead className="bg-muted/50"><tr><th className="p-2">{rs.head}</th>{headers.map((h) => <th key={h} className="whitespace-nowrap p-2 text-start">{h}</th>)}<th className="p-2" /></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t hover:bg-muted/30"><td className="p-2">{rs.cell(i)}</td>{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}<td className="p-2">{ids[i] && <Button size="sm" variant="outline" onClick={() => setOpen(i)}>فتح الحساب</Button>}</td></tr>)}</tbody></table>
      {!rows.length && <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>}</div>
    <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
      <DialogContent dir="rtl" className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{open !== null ? names[open] : ""}</DialogTitle></DialogHeader>{open !== null && ids[open] && <StudentFinance studentId={ids[open]!} />}</DialogContent>
    </Dialog>
  </section>;
}

/** «الخصومات المطبقة»: read-only register over sf_applied; edits/removal stay in the student panel (sf_override, owner only). */
export function AppliedDiscounts({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const q = useRpc("sf_discount_list", schoolId, yearId); const match = useStudentSearch(schoolId);
  const [s, setS] = useState(""); const [f, setF] = useState({ grade: "", term: "", name: "", fee: "", src: "", st: "", sib: "", from: "", to: "" });
  const all = q.data ?? [];
  const rows = useMemo(() => all.filter((r) => match(s, r["student_id"], r["name"]) && (!f.grade || gradeKey(r["cls"]) === f.grade) && (!f.term || String(r["term"]) === f.term) && (!f.name || r["discount"] === f.name) && (!f.fee || r["fee_kind"] === f.fee)
    && (!f.src || (f.src === "auto") === !!r["automatic"]) && (!f.st || (f.st === "active") === !!r["active"]) && (!f.sib || (f.sib === "yes") === !!r["sibling"]) && (!f.from || String(r["created_at"]).slice(0, 10) >= f.from) && (!f.to || String(r["created_at"]).slice(0, 10) <= f.to)), [all, s, f, match]);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const act = rows.filter((r) => r["active"]); const sum = (xs: Row[]) => xs.reduce((a, r) => a + num(r["amount"]), 0);
  const H = ["الطالب", "الصف", "العام الدراسي", "الفصل", "اسم الخصم", "نوع الرسوم", "قيمة الخصم", "مصدر التطبيق", "الحالة"];
  const data = rows.map((r) => [String(r["name"]), clsText(r["cls"]), formatAcademicYear(String(r["year"])), TERM_LABEL(Number(r["term"])), String(r["discount"]), KIND_LABEL[String(r["fee_kind"])] ?? "", money(r["amount"]), r["automatic"] ? "تلقائي" : "يدوي",
    r["active"] ? (r["edited"] ? "نشط — معدَّل" : "نشط") : r["obligation_status"] === "void" ? "ملغى مع المستحق" : r["manual_override"] ? "ملغى — مستثنى يدويًا" : "غير نشط"]);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return <ListPage title="الخصومات المطبقة" note="الإجماليات تشمل الخصومات النشطة فقط؛ تعديل الخصم أو إلغاؤه من حساب الطالب ولمدير النظام فقط، ولا يُعاد تطبيق الخصم المستثنى."
    kpis={<Kpis items={[["إجمالي الخصومات", money(sum(act)), "good"], ["خصومات الرسوم الدراسية", money(sum(act.filter((r) => r["fee_kind"] === "tuition")))], ["خصومات النقل", money(sum(act.filter((r) => r["fee_kind"] === "transport")))], ["خصم الإخوة", money(sum(act.filter((r) => r["sibling"])))],
      ["الطلاب المستفيدون", String(new Set(act.map((r) => r["student_id"])).size)], ["تلقائية", String(act.filter((r) => r["automatic"]).length)], ["يدوية", String(act.filter((r) => !r["automatic"]).length)], ["معدَّلة", String(rows.filter((r) => r["edited"]).length)], ["ملغاة", String(rows.filter((r) => !r["active"]).length), "bad"], ["استثناءات", String(rows.filter((r) => r["manual_override"]).length)]]} />}
    filters={<><Input className="w-72" placeholder={SEARCH_HINT} value={s} onChange={(e) => setS(e.target.value)} />
      <Sel label="الصف" value={f.grade} onChange={set("grade")} opts={uniq(all.map((r) => gradeKey(r["cls"]))).map((g) => [g, g])} />
      <Sel label="الفصل" value={f.term} onChange={set("term")} opts={[["1", "الفصل الأول"], ["2", "الفصل الثاني"]]} />
      <Sel label="اسم الخصم" value={f.name} onChange={set("name")} opts={uniq(all.map((r) => r["discount"])).map((g) => [g, g])} />
      <Sel label="الرسوم" value={f.fee} onChange={set("fee")} opts={[["tuition", "الدراسية"], ["transport", "النقل"]]} />
      <Sel label="المصدر" value={f.src} onChange={set("src")} opts={[["auto", "تلقائي"], ["manual", "يدوي"]]} />
      <Sel label="الحالة" value={f.st} onChange={set("st")} opts={[["active", "نشط"], ["off", "ملغى"]]} />
      <Sel label="خصم الإخوة" value={f.sib} onChange={set("sib")} opts={[["yes", "خصم الإخوة"], ["no", "غيره"]]} />
      <Input type="date" aria-label="من تاريخ" className="w-36" value={f.from} onChange={(e) => set("from")(e.target.value)} /><Input type="date" aria-label="إلى تاريخ" className="w-36" value={f.to} onChange={(e) => set("to")(e.target.value)} /></>}
    headers={H} rows={data} ids={rows.map((r) => String(r["student_id"]))} names={rows.map((r) => String(r["name"]))} empty="لا توجد خصومات مطابقة." count={[s, f.name, f.grade].filter(Boolean)} />;
}

/** «حسابات النقل المدرسي»: the same sf_transport subscriptions and transport obligations as the bus rosters. */
export function TransportAccounts({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const q = useRpc("sf_transport_accounts", schoolId, yearId); const match = useStudentSearch(schoolId);
  const [s, setS] = useState(""); const [f, setF] = useState({ grade: "", term: "", bus: "", type: "", sub: "", pay: "", ex: "", late: "", prev: "" });
  const all = q.data ?? [];
  const state = (r: Row) => { const b = r["balance"] as Row | null; if (r["exempt"] || r["obligation_status"] === "exempt") return "معفى"; if (!b) return "لم تُنشأ الرسوم"; if (num(b["remaining"]) <= 0) return "مسدد"; if (num(b["recorded"]) > 0) return "مسدد جزئيًا"; return "غير مسدد"; };
  const rows = useMemo(() => all.filter((r) => match(s, r["student_id"], r["name"]) && (!f.grade || gradeKey(r["cls"]) === f.grade) && (!f.term || String(r["term"]) === f.term) && (!f.bus || r["bus"] === f.bus) && (!f.type || r["transport_type"] === f.type)
    && (!f.sub || (f.sub === "on") === !!r["active"]) && (!f.pay || state(r) === f.pay) && (!f.ex || !!r["exempt"]) && (!f.late || !!r["overdue"]) && (!f.prev || !!r["previous"])), [all, s, f, match]);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const on = rows.filter((r) => r["active"]); const bal = (k: string) => rows.reduce((a, r) => a + num((r["balance"] as Row | null)?.[k]), 0);
  const net = bal("net"), rec = bal("recorded");
  const H = ["الطالب", "الصف", "الباص", "العام الدراسي", "الفصل", "نوع الاشتراك", "الرسوم", "الخصومات", "المسدد", "المتبقي", "الحالة"];
  const data = rows.map((r) => { const b = (r["balance"] ?? {}) as Row; return [String(r["name"]), clsText(r["cls"]), String(r["bus"] ?? "—"), formatAcademicYear(String(r["year"])), TERM_LABEL(Number(r["term"])), r["active"] ? TRANSPORT_LABEL[String(r["transport_type"])] ?? "—" : "غير مشترك", money(b["gross"]), money(b["discount"]), money(b["recorded"]), money(b["remaining"]), `${state(r)}${r["overdue"] ? " · متأخر" : ""}${r["previous"] ? " · رصيد سابق" : ""}`]; });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return <ListPage title="حسابات النقل المدرسي" note="مصدرها اشتراكات النقل نفسها في كشوف الباصات؛ الطالب المعفى يبقى في كشف الباص ما دام اشتراكه نشطًا، وإلغاء الرسوم لا يلغي الاشتراك."
    kpis={<Kpis items={[["المشتركون", String(new Set(on.map((r) => r["student_id"])).size)], ["ذهاب وعودة", String(on.filter((r) => r["transport_type"] === "round_trip").length)], ["ذهاب فقط", String(on.filter((r) => r["transport_type"] === "outbound").length)], ["عودة فقط", String(on.filter((r) => r["transport_type"] === "return").length)],
      ["إجمالي رسوم النقل", money(bal("gross"))], ["خصومات النقل", money(bal("discount"))], ["صافي الرسوم", money(net)], ["المسدد", money(rec), "good"], ["المتبقي", money(bal("remaining")), "bad"],
      ["متأخرات النقل", money(rows.filter((r) => r["overdue"]).reduce((a, r) => a + num((r["balance"] as Row)["remaining"]), 0)), "bad"], ["لديهم أرصدة نقل سابقة", String(new Set(rows.filter((r) => r["previous"]).map((r) => r["student_id"])).size)], ["المعفيون", String(rows.filter((r) => r["exempt"]).length)], ["نسبة التحصيل", net > 0 ? `${((rec / net) * 100).toFixed(1)}%` : "—"]]} />}
    filters={<><Input className="w-72" placeholder={SEARCH_HINT} value={s} onChange={(e) => setS(e.target.value)} />
      <Sel label="الصف" value={f.grade} onChange={set("grade")} opts={uniq(all.map((r) => gradeKey(r["cls"]))).map((g) => [g, g])} />
      <Sel label="الفصل" value={f.term} onChange={set("term")} opts={[["1", "الفصل الأول"], ["2", "الفصل الثاني"]]} />
      <Sel label="الباص" value={f.bus} onChange={set("bus")} opts={uniq(all.map((r) => r["bus"])).map((g) => [g, g])} />
      <Sel label="نوع الاشتراك" value={f.type} onChange={set("type")} opts={TRANSPORT_TYPES.map((t) => [t.value, t.label])} />
      <Sel label="الاشتراك" value={f.sub} onChange={set("sub")} opts={[["on", "نشط"], ["off", "غير نشط"]]} />
      <Sel label="السداد" value={f.pay} onChange={set("pay")} opts={["مسدد", "مسدد جزئيًا", "غير مسدد", "معفى", "لم تُنشأ الرسوم"].map((x) => [x, x])} />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!f.ex} onChange={(e) => set("ex")(e.target.checked ? "1" : "")} />المعفيون</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!f.late} onChange={(e) => set("late")(e.target.checked ? "1" : "")} />المتأخرون</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!f.prev} onChange={(e) => set("prev")(e.target.checked ? "1" : "")} />أرصدة سابقة</label></>}
    headers={H} rows={data} ids={rows.map((r) => String(r["student_id"]))} names={rows.map((r) => String(r["name"]))} empty="لا توجد اشتراكات نقل مطابقة." count={[s, f.bus].filter(Boolean)} />;
}

const ADJ_LABEL: Record<string, string> = { reprice: "تعديل سعر الرسوم", discount_edit: "تعديل خصم", discount_remove: "إلغاء خصم", exception_clear: "إعادة تقييم خصم", transport_edit: "تعديل رسوم النقل", transport_exempt: "إعفاء من رسوم النقل", transport_cancel: "إلغاء مستحقات النقل", collection_reverse: "عكس سداد", credit_apply: "استخدام رصيد دائن", credit_refund: "استرداد رصيد دائن", carry_apply: "ترحيل أرصدة سابقة" };
/** «التسويات المالية»: read-only register of the approved adjustments already logged in sf_events (no new write path). */
export function Adjustments({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const q = useRpc("sf_adjustments", schoolId, yearId); const match = useStudentSearch(schoolId);
  const [s, setS] = useState(""); const [k, setK] = useState(""); const [d, setD] = useState<Row | null>(null);
  const all = q.data ?? [];
  const rows = all.filter((r) => (!s || match(s, r["student_id"], r["name"], r["number"])) && (!k || r["action"] === k));
  const rsA = useRowSelect(rows.length);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const diff = (r: Row) => (r["old"] == null || r["new"] == null ? null : num(r["new"]) - num(r["old"]));
  const H = ["رقم التسوية", "التاريخ", "الطالب", "العام", "نوع التسوية", "القيمة السابقة", "القيمة الجديدة", "الفرق", "المستخدم", "الحالة"];
  const data = rows.map((r) => { const df = diff(r); return [String(r["number"]), new Date(String(r["created_at"])).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }), String(r["name"] ?? "على مستوى المجموعة"), r["year"] ? formatAcademicYear(String(r["year"])) : "—", ADJ_LABEL[String(r["action"])] ?? String(r["action"]), r["old"] == null ? "—" : money(r["old"]), r["new"] == null ? "—" : money(r["new"]), df == null ? "—" : `${df > 0 ? "+" : ""}${money(df)}`, String(r["actor"] || "—"), String(r["status"])]; });
  const outA = rsA.pick(data);
  const up = rows.reduce((a, r) => a + Math.max(0, diff(r) ?? 0), 0), down = rows.filter((r) => !["credit_apply", "credit_refund"].includes(String(r["action"]))).reduce((a, r) => a + Math.max(0, -(diff(r) ?? 0)), 0);
  return <section className="space-y-3">
    <div><h2 className="text-lg font-bold">التسويات المالية</h2><p className="text-xs text-muted-foreground">سجل للاطلاع: كل تسوية معتمدة مرتبطة بمستحقها الأصلي ولا تُحذف؛ تنفيذها من حساب الطالب ولمدير النظام فقط. استخدام الرصيد الدائن لا يُحتسب تحصيلًا نقديًا.</p></div>
    <Kpis items={[["عدد التسويات", String(rows.length)], ["بالزيادة", money(up)], ["بالتخفيض", money(down)], ["رصيد دائن مستخدم", money(rows.filter((r) => r["action"] === "credit_apply").reduce((a, r) => a + num(r["new"]), 0))], ["أرصدة مستردة", money(rows.filter((r) => r["action"] === "credit_refund").reduce((a, r) => a + num(r["new"]), 0))], ["عمليات عكس السداد", String(rows.filter((r) => r["action"] === "collection_reverse").length), "bad"], ["الطلاب المتأثرون", String(new Set(rows.map((r) => r["student_id"]).filter(Boolean)).size)]]} />
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2"><Input className="w-72" placeholder={`${SEARCH_HINT} أو رقم التسوية`} value={s} onChange={(e) => setS(e.target.value)} /><Sel label="نوع التسوية" value={k} onChange={setK} opts={Object.entries(ADJ_LABEL)} />
      <span className="ms-auto flex items-center gap-1">{rsA.note}<Button size="sm" variant="outline" onClick={() => void exportPdf({ title: "التسويات المالية", filters: [s] }, H, outA).catch((e) => toast.error(arabicError(e)))}>PDF</Button><Button size="sm" variant="outline" onClick={() => exportXlsx({ title: "التسويات المالية", filters: [s] }, H, outA)}>Excel</Button><Button size="sm" variant="outline" onClick={() => printReport({ title: "التسويات المالية", filters: [s] }, H, outA)}>طباعة</Button></span></div>
    <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-xs"><thead className="bg-muted/50"><tr><th className="p-2">{rsA.head}</th>{H.map((h) => <th key={h} className="whitespace-nowrap p-2 text-start">{h}</th>)}</tr></thead>
      <tbody>{data.map((r, i) => <tr key={i} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setD(rows[i] ?? null)}><td className="p-2">{rsA.cell(i)}</td>{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}</tr>)}</tbody></table>
      {!data.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد تسويات مسجلة.</p>}</div>
    <Dialog open={!!d} onOpenChange={(o) => !o && setD(null)}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>التسوية {String(d?.["number"] ?? "")}</DialogTitle></DialogHeader>
      {d && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">{([["الطالب", d["name"] ?? "على مستوى المجموعة"], ["المدرسة", d["school"]], ["العام الدراسي الأصلي", d["year"] ? formatAcademicYear(String(d["year"])) : "—"], ["الفصل", d["term"] ? TERM_LABEL(Number(d["term"])) : "—"], ["نوع الرسوم", KIND_LABEL[String(d["fee_kind"])] ?? "—"], ["نوع التسوية", ADJ_LABEL[String(d["action"])]], ["القيمة قبل", d["old"] == null ? "—" : money(d["old"])], ["القيمة بعد", d["new"] == null ? "—" : money(d["new"])], ["الفرق", diff(d) == null ? "—" : money(diff(d))],
        ["رصيد المستحق الآن — المسدد", d["balance_now"] ? money((d["balance_now"] as Row)["recorded"]) : "—"], ["رصيد المستحق الآن — المتبقي", d["balance_now"] ? money((d["balance_now"] as Row)["remaining"]) : "—"], ["السبب", d["reason"] || "—"], ["المستخدم المسؤول", d["actor"] || "—"], ["التاريخ والوقت", new Date(String(d["created_at"])).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" })]] as [string, unknown][]).map(([a, b]) => <Fragment key={a}><dt className="text-muted-foreground">{a}</dt><dd className="font-medium">{String(b)}</dd></Fragment>)}</dl>}
      {d?.["student_id"] && <p className="text-xs text-muted-foreground">سجل التدقيق الكامل ومستندات الطالب في «سجل العمليات المالية» داخل حسابه.</p>}
    </DialogContent></Dialog>
  </section>;
}
