import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { HrPageTop } from "@/components/hr/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { rpc, useHrMe } from "@/components/hr/shared";
import { Pill } from "@/components/hr/money";

export const Route = createFileRoute("/_authenticated/app/hr_/reports")({
  head: () => ({ meta: [{ title: "تقارير الموارد البشرية — ركاز" }, { name: "description", content: "كتالوج تقارير الموارد البشرية الموحد: الفلاتر نفسها للعرض والطباعة والتصدير، والنطاق والحقول الحساسة من الخادم." }, { property: "og:title", content: "تقارير الموارد البشرية — ركاز" }, { property: "og:description", content: "كتالوج تقارير الموارد البشرية في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

type Cat = { key: string; title: string; sec: string; ext?: string; source: string; filters: string[]; rule?: string; unavailable?: string; status: "ready" | "ext_off" | "unavailable"; can_export: boolean; can_print: boolean };
type Rep = { key: string; title: string; columns: string[]; rows: (string | number | boolean | null)[][]; count: number; totals: Record<string, number | string>; note: string | null };
const ST: Record<string, string> = { active: "على رأس العمل", suspended: "موقوف مؤقتًا", ended: "انتهت الخدمة", approved: "معتمد", pending: "بانتظار", rejected: "مرفوض", cancelled: "ملغى", draft: "مسودة", open: "مفتوحة", closed: "مغلقة", included: "مشمول", excluded: "مستبعد", pending_link: "بانتظار إعداد الربط المالي", paid: "مصروف", earning: "استحقاق", deduction: "استقطاع", employee: "موظف", dependent: "تابع", male: "ذكر", female: "أنثى", moved: "نقل", vacated: "إخلاء", returned: "أُرجع", lost: "فُقد", damaged: "تلف", transferred: "نُقل" };
const TOT: Record<string, string> = { count: "العدد", gross: "الإجمالي", deductions: "الاستقطاعات", net: "الصافي", earning: "الاستحقاقات", deduction: "الاستقطاعات", hours: "الساعات", days: "الأيام", amount: "المبالغ", paid: "المسدد", remaining: "المتبقي", capacity: "السعة", occupied: "المشغول", run_status: "حالة المسير", version: "الإصدار", payment: "الصرف", excluded: "المستبعدون" };
const cell = (v: string | number | boolean | null) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "نعم" : "لا") : typeof v === "number" ? v : ST[v] ?? v);

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const me = useHrMe(org);
  const cat = useQuery({ queryKey: ["hr-rep-cat", org], enabled: !!org, queryFn: () => rpc<Cat[]>("hr_report_catalog", { _org: org }) });
  const [key, setKey] = useState<string | null>(null);
  if (!active) return null;
  const list = cat.data ?? [];
  return (
    <>
      <HrPageTop title="تقارير الموارد البشرية" desc="كتالوج موحد للتقارير (R01–R29). الفلاتر نفسها تُطبّق على العرض والمجاميع والطباعة والتصدير، والنطاق والحقول الحساسة يحددها الخادم. كل طباعة وتصدير يُسجّل." />
      {me.data && !me.data.enabled ? <SectionLocked /> : cat.isLoading ? <LoadingState /> : cat.error ? <ErrorState message={arabicError(cat.error)} onRetry={() => cat.refetch()} /> : list.length === 0 ? <EmptyState title="لا توجد تقارير متاحة لك" hint="تظهر التقارير حسب صلاحياتك في أقسام الموارد البشرية." /> : (
        <div className="space-y-4">
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" aria-label="كتالوج التقارير">{list.map((c) => (
            <li key={c.key} className={"rounded-xl border bg-card p-3 text-sm " + (key === c.key ? "border-primary" : "")}>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={c.status !== "ready"} aria-expanded={key === c.key} className="flex-1 text-start font-bold disabled:cursor-not-allowed disabled:opacity-70" onClick={() => setKey(key === c.key ? null : c.key)}><bdi dir="ltr" className="text-xs text-muted-foreground">{c.key}</bdi> {c.title}</button>
                <Pill tone={c.status === "ready" ? "ok" : "muted"}>{c.status === "ready" ? "جاهز" : c.status === "ext_off" ? "الامتداد موقوف" : "غير متاح"}</Pill>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.unavailable ?? `${c.source}${c.rule ? ` · ${c.rule}` : ""}`}</p>
            </li>))}</ul>
          {key && <Runner org={org!} c={list.find((x) => x.key === key)!} school={me.data?.schools ?? []} />}
        </div>)}
    </>
  );
}

function Runner({ org, c, school }: { org: string; c: Cat; school: { id: string; name: string }[] }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["hr-rep", org, c.key, applied], queryFn: () => rpc<Rep>("hr_report", { _org: org, _key: c.key, _f: applied, _mode: "view" }) });
  const out = useMutation({
    mutationFn: async (kind: "export" | "pdf" | "print") => {
      // the server re-checks the permission, re-applies the same filters and logs the action
      const r = await rpc<Rep>("hr_report", { _org: org, _key: c.key, _f: applied, _mode: kind === "print" ? "print" : "export" });
      const filters = Object.entries(applied).filter(([, v]) => v).map(([k, v]) => `${({ school: "المدرسة", status: "الحالة", from: "من", to: "إلى", month: "الشهر" } as Record<string, string>)[k] ?? k}: ${k === "school" ? school.find((s) => s.id === v)?.name ?? v : ST[v] ?? v}`);
      const meta = { title: `${c.key} — ${r.title}`, filters, note: [r.note, totalsLine(r)].filter(Boolean).join(" · ") };
      const rows = r.rows.map((x) => x.map(cell));
      if (kind === "export") exportXlsx(meta, r.columns, rows);
      else await exportPdf(meta, r.columns, rows);
      return kind;
    },
    onSuccess: (k) => toast.success(k === "export" ? "صُدّر الملف" : k === "print" ? "جُهّز ملف الطباعة" : "صُدّر PDF"),
    onError: (e) => toast.error(arabicError(e)),
  });
  const has = (k: string) => c.filters.includes(k);
  const r = q.data;
  return (
    <Section title={`${c.key} — ${c.title}`} desc={c.rule ?? ""}>
      {c.filters.length > 0 && <form aria-label="فلاتر التقرير" className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setApplied({ ...f }); }}>
        {has("school") && school.length > 0 && <div><Label htmlFor="r-s">المدرسة</Label><select id="r-s" className={selectCls("w-44")} value={f["school"] ?? ""} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">كل المدارس المصرح بها</option>{school.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        {has("status") && <div><Label htmlFor="r-st">الحالة</Label><Input id="r-st" className="w-36" placeholder="مثل approved" dir="ltr" value={f["status"] ?? ""} onChange={(e) => setF({ ...f, status: e.target.value })} /></div>}
        {has("from") && <div><Label htmlFor="r-f">من</Label><Input id="r-f" type="date" value={f["from"] ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>}
        {has("to") && <div><Label htmlFor="r-t">إلى</Label><Input id="r-t" type="date" value={f["to"] ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>}
        {has("month") && <div><Label htmlFor="r-m">الشهر</Label><Input id="r-m" type="month" value={(f["month"] ?? "").slice(0, 7)} onChange={(e) => setF({ ...f, month: e.target.value ? `${e.target.value}-01` : "" })} /></div>}
        <Button type="submit">تطبيق</Button>
      </form>}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="flex-1">{r ? `${r.count} سجل${totalsLine(r) ? ` · ${totalsLine(r)}` : ""}` : ""}</span>
        {c.can_print && <Button size="sm" variant="outline" disabled={!r?.count || out.isPending} onClick={() => out.mutate("print")}><Printer className="size-4" />طباعة</Button>}
        {c.can_export && <><Button size="sm" variant="ghost" disabled={!r?.count || out.isPending} onClick={() => out.mutate("export")}><Download className="size-4" />Excel</Button>
          <Button size="sm" variant="ghost" disabled={!r?.count || out.isPending} onClick={() => out.mutate("pdf")}><FileText className="size-4" />PDF</Button></>}
      </div>
      {r?.note && <p className="mb-2 rounded bg-secondary/40 p-2 text-xs">{r.note}</p>}
      {q.isLoading ? <LoadingState rows={3} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !r || r.count === 0 ? <EmptyState title="لا توجد سجلات بهذه الفلاتر" /> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm"><thead className="bg-secondary/50"><tr>{r.columns.map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{r.rows.slice(0, 500).map((row, i) => <tr key={i} className="border-t">{row.map((v, j) => <td key={j} className="p-2">{String(cell(v))}</td>)}</tr>)}</tbody></table>
          {r.count > 500 && <p className="p-2 text-xs text-muted-foreground">يُعرض أول 500 سجل؛ التصدير يشمل الكل.</p>}
        </div>)}
    </Section>
  );
}

function totalsLine(r: Rep) {
  return Object.entries(r.totals ?? {}).map(([k, v]) => `${TOT[k] ?? k}: ${typeof v === "number" ? v.toLocaleString("ar-SA-u-nu-latn") : ST[String(v)] ?? v}`).join(" · ");
}
