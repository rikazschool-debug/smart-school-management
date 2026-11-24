import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { ReceiptButtons } from "./finance-tools";
import { StatementButton } from "./statement";
import { arabicError } from "@/lib/session";
import { KIND_LABEL, METHOD_LABEL, SF_KEY, TERM_LABEL, TRANSPORT_LABEL, money, num, paymentState, type Obligation } from "@/lib/student-finance/labels";

type Fin = { student: Row; updated_at: string; obligations: Obligation[]; transport: Row[]; discounts: Row[]; summary: Record<string, Row> };
const sumOf = (os: Obligation[], k: keyof Obligation["balance"]) => os.reduce((s, o) => s + num(o.balance[k]), 0);

/** Guardian «الحسابات المالية» + «سندات القبض»: read-only views of sf_children / sf_student_receipts (server checks the link). */
export function FamilyFinance() {
  const q = useQuery({ queryKey: [...SF_KEY, "family"], queryFn: async () => { const { data, error } = await db.rpc("sf_children"); if (error) throw error; return data as Fin[]; }, retry: false });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{(q.error as { code?: string }).code === "42501" ? "القسم المالي غير مفعّل لمدرسة أحد الأبناء." : arabicError(q.error)}</p>;
  const kids = q.data ?? [];
  const live = (f: Fin) => f.obligations.filter((o) => o.status !== "void");
  const all = kids.flatMap(live);
  const by = (k: string) => all.filter((o) => o.kind === k);
  const sib = kids.flatMap((f) => f.discounts).filter((d) => d["active"] !== false && (d["snapshot"] as Row | undefined)?.["kind"] === "sibling").reduce((s, d) => s + num(d["amount"]), 0);
  const net = sumOf(all, "net"), rec = sumOf(all, "recorded");
  const kpis: [string, string][] = [
    ["الأبناء المسجلون", String(kids.length)], ["الرسوم الدراسية", money(sumOf(by("tuition"), "gross"))], ["رسوم النقل", money(sumOf(by("transport"), "gross"))],
    ["خصومات الرسوم الدراسية", money(sumOf(by("tuition"), "discount"))], ["خصومات النقل", money(sumOf(by("transport"), "discount"))], ["منها خصم الإخوة", money(sib)],
    ["الإجمالي قبل الخصومات", money(sumOf(all, "gross"))], ["صافي المستحقات", money(net)], ["إجمالي المسدد", money(rec)],
    ["إجمالي المتبقي", money(sumOf(all, "remaining"))], ["الأرصدة الدائنة", money(sumOf(all, "credit"))], ["نسبة السداد", net > 0 ? `${Math.round((Math.min(rec, net) * 100) / net)}%` : "—"],
  ];
  const latest = kids.map((k) => k.updated_at).sort().at(-1);
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">الحسابات المالية</h2>{kids.length > 1 && <StatementButton fins={kids} title="كشف حساب مجمع لجميع الأبناء" />}</div>
        {!kids.length ? <p className="text-sm text-muted-foreground">لا توجد بيانات مالية للأبناء المرتبطين بحسابك.</p> : <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">{kpis.map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold">{v}</div></div>)}</div>
          <p className="text-xs text-muted-foreground">آخر تحديث: {latest ? new Date(latest).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) : "—"} · خصم الإخوة محسوب ضمن الخصومات مرة واحدة · المبالغ للاطلاع فقط</p>
          <ul className="space-y-2">{kids.map((f) => {
            const id = String(f.student["id"]); const os = live(f);
            return <li key={id} className="rounded-xl border bg-card">
              <button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-start" onClick={() => setOpen(open === id ? null : id)}>
                <span className="font-semibold">{String(f.student["name"])} <span className="text-xs font-normal text-muted-foreground">· {String(f.student["school"])}</span></span>
                <span className="text-sm">{os.length ? `المتبقي ${money(sumOf(os, "remaining"))}` : "الرسوم غير مهيأة"}</span>
              </button>
              {open === id && <ChildTable f={f} />}
            </li>;
          })}</ul>
        </>}
      </section>
      <FamilyReceipts kids={kids} />
    </div>
  );
}

function ChildTable({ f }: { f: Fin }) {
  const os = f.obligations.filter((o) => o.status !== "void");
  const cell = (k: string, t: number) => os.find((o) => o.kind === k && o.term === t);
  const tr = f.transport.find((t) => t["active"] !== false);
  const row = (label: string, pick: (t: number) => number | null) => { const a = pick(1), b = pick(2); return <tr key={label} className="border-t"><td className="p-2">{label}</td><td className="p-2">{a == null ? "—" : money(a)}</td><td className="p-2">{b == null ? "—" : money(b)}</td><td className="p-2 font-semibold">{a == null && b == null ? "—" : money((a ?? 0) + (b ?? 0))}</td></tr>; };
  const line = (k: string, key: keyof Obligation["balance"]) => (t: number) => { const o = cell(k, t); return o ? num(o.balance[key]) : null; };
  const tot = (key: keyof Obligation["balance"]) => (t: number) => { const xs = os.filter((o) => o.term === t); return xs.length ? sumOf(xs, key) : null; };
  const credit = sumOf(os, "credit");
  return <div className="space-y-2 border-t p-3">
    <StatementButton fins={[f]} title={`كشف حساب ${String(f.student["name"])}`} />
    <p className="text-xs text-muted-foreground">النقل المدرسي: {tr ? `مشترك — ${TRANSPORT_LABEL[String(tr["transport_type"])] ?? "—"}` : "غير مشترك"} · حالة السداد: {os.length ? [1, 2].map((t) => `${TERM_LABEL(t)}: ${paymentState(cell("tuition", t))}`).join(" · ") : "الرسوم غير مهيأة"}</p>
    {!os.length ? <p className="text-sm text-muted-foreground">لم تُهيأ رسوم هذا الطالب بعد.</p> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/50"><tr><th className="p-2 text-start">البيان</th><th className="p-2 text-start">الفصل الأول</th><th className="p-2 text-start">الفصل الثاني</th><th className="p-2 text-start">الإجمالي</th></tr></thead><tbody>
      {(["tuition", "transport"] as const).flatMap((k) => { const n = k === "tuition" ? "الرسوم الدراسية" : "النقل"; return [row(k === "tuition" ? "الرسوم الدراسية" : "رسوم النقل المدرسي", line(k, "gross")), row(`خصومات ${n}`, line(k, "discount")), row(`صافي ${n}`, line(k, "net")), row(`المسدد من ${n}`, line(k, "recorded")), row(`المتبقي من ${n}`, line(k, "remaining"))]; })}
      {row("إجمالي صافي المستحقات", tot("net"))}{row("إجمالي المسدد", tot("recorded"))}{row("إجمالي المتبقي", tot("remaining"))}
    </tbody></table></div>}
    {credit > 0 && <p className="text-sm font-semibold">رصيد دائن: {money(credit)}</p>}
  </div>;
}

function FamilyReceipts({ kids }: { kids: Fin[] }) {
  const ids = kids.map((k) => String(k.student["id"]));
  const q = useQuery({ queryKey: [...SF_KEY, "family-receipts", ids.join(",")], enabled: ids.length > 0, retry: false,
    queryFn: async () => (await Promise.all(ids.map(async (id) => { const { data, error } = await db.rpc("sf_student_receipts", { _student: id }); if (error) throw error; return data as Row[]; }))).flat() });
  const [kid, setKid] = useState(""); const [st, setSt] = useState(""); const [s, setS] = useState("");
  const rows = (q.data ?? []).filter((r) => { return (!kid || r["student_id"] === kid) && (!st || r["status"] === st) && (!s || String(r["number"]).includes(s)); })
    .sort((a, b) => String(b["issued_at"]).localeCompare(String(a["issued_at"])));
  return <section className="space-y-3">
    <h2 className="text-lg font-bold">سندات القبض</h2>
    <p className="text-xs text-muted-foreground">سندات داخلية صادرة من ركاز للاطلاع والتحميل والطباعة، وليست سندات محاسبية رسمية.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="الابن" className={selectCls("min-w-40", true)} value={kid} onChange={(e) => setKid(e.target.value)}><option value="">كل الأبناء</option>{kids.map((k) => <option key={String(k.student["id"])} value={String(k.student["id"])}>{String(k.student["name"])}</option>)}</select>
      <select aria-label="الحالة" className={selectCls("min-w-32", true)} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option><option value="valid">صالح</option><option value="cancelled">ملغى</option></select>
      <Input className="w-40" placeholder="رقم السند" value={s} onChange={(e) => setS(e.target.value)} />
    </div>
    {q.isLoading ? <LoadingState /> : q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : !rows.length ? <p className="text-sm text-muted-foreground">لا توجد سندات قبض.</p> :
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{["رقم السند", "اسم الطالب", "التاريخ", "البنود", "المبلغ", "طريقة السداد", "الحالة", "الإجراءات"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead><tbody>
        {rows.map((r) => { const sn = r["snapshot"] as Row; const items = (sn["allocations"] as Row[] | undefined) ?? [];
          return <tr key={String(r["id"])} className="border-t"><td className="p-2 font-mono">{String(r["number"])}</td><td className="p-2">{String((sn["student"] as Row | undefined)?.["name"] ?? "")}</td>
            <td className="p-2">{sn["paid_at"] ? new Date(String(sn["paid_at"])).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) : "—"}</td>
            <td className="p-2">{items.map((i) => `${KIND_LABEL[String(i["kind"])] ?? ""} ${i["term"] ? TERM_LABEL(Number(i["term"])) : ""}`).join("، ") || "—"}</td>
            <td className="p-2">{money(sn["amount"])}</td><td className="p-2">{METHOD_LABEL[String(sn["method"])] ?? "—"}</td>
            <td className="p-2">{r["status"] === "cancelled" ? "ملغى" : "صالح"}</td><td className="p-2"><ReceiptButtons r={r} /></td></tr>; })}
      </tbody></table></div>}
  </section>;
}
