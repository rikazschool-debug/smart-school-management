import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { KIND_LABEL, SF_KEY, TERM_LABEL, money, num } from "@/lib/student-finance/labels";

type CRow = { obligation_id: string; student_id: string; name: string; school_id: string; school: string; year: string; term: number; kind: string; net: number; recorded: number; remaining: number; credit: number; direction: "debit" | "credit"; carried: boolean };
type Stu = { id: string; name: string; school: string; years: Set<string>; net: number; recorded: number; debit: number; credit: number; carried: number; items: number };

/** «الأرصدة السابقة والمرحلة» (owner only): server preview, then one approved carry run. Carrying links to the original obligation — no new debt. */
export function CarryForward({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const years = useQuery({ queryKey: [...SF_KEY, "org-years", orgId], queryFn: async () => { const { data, error } = await db.rpc("sf_org_years", { _org: orgId }); if (error) throw error; return data as Row[]; } });
  const schools = useQuery({ queryKey: ["sf-org-schools", orgId], queryFn: async () => { const { data, error } = await db.from("schools").select("id,name").eq("org_id", orgId).order("name"); if (error) throw error; return data as Row[]; } });
  const runs = useQuery({ queryKey: [...SF_KEY, "carry-runs", orgId], queryFn: async () => { const { data, error } = await db.rpc("sf_carry_runs_list", { _org: orgId }); if (error) throw error; return data as Row[]; }, retry: false });
  const ys = years.data ?? [];
  const curIdx = Math.max(0, ys.findIndex((y) => y["current"]));
  const [to, setTo] = useState(""); const [from, setFrom] = useState("");
  const toKey = to || String(ys[curIdx]?.["name"] ?? ""); const fromKey = from || String(ys[ys.findIndex((y) => y["name"] === toKey) + 1]?.["name"] ?? "");
  const [sch, setSch] = useState<string[]>([]); const [dirs, setDirs] = useState<string[]>(["debit", "credit"]); const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string> | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const args = { _org: orgId, _from: fromKey, _to: toKey, _schools: sch, _students: [] as string[], _dirs: dirs };
  const pv = useQuery({ enabled: !!fromKey && !!toKey && dirs.length > 0, queryKey: [...SF_KEY, "carry-preview", orgId, fromKey, toKey, sch.join(","), dirs.join(",")], queryFn: async () => { const { data, error } = await db.rpc("sf_carry_preview", args); if (error) throw error; return data as CRow[]; }, retry: false });
  const students = useMemo(() => { const m = new Map<string, Stu>(); for (const r of pv.data ?? []) { const s = m.get(r.student_id) ?? { id: r.student_id, name: r.name, school: r.school, years: new Set<string>(), net: 0, recorded: 0, debit: 0, credit: 0, carried: 0, items: 0 }; s.years.add(r.year); s.net += num(r.net); s.recorded += num(r.recorded); if (r.direction === "debit") s.debit += num(r.remaining); else s.credit += num(r.credit); if (r.carried) s.carried++; s.items++; m.set(r.student_id, s); } return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "ar")); }, [pv.data]);
  if (years.isLoading) return <LoadingState />;
  if (years.error) return <ErrorState message={arabicError(years.error)} />;
  const pending = students.filter((s) => s.carried < s.items);
  const sel = picked ?? new Set(pending.map((s) => s.id));
  const shown = students.filter((s) => !search || s.name.includes(search));
  const chosen = pending.filter((s) => sel.has(s.id));
  const k = { all: students.length, debitN: students.filter((s) => s.debit > 0).length, creditN: students.filter((s) => s.credit > 0).length, debit: students.reduce((a, s) => a + s.debit, 0), credit: students.reduce((a, s) => a + s.credit, 0), carried: (pv.data ?? []).filter((r) => r.carried).length, todo: chosen.reduce((a, s) => a + s.debit + s.credit, 0) };
  const H = ["الطالب", "المدرسة الأصلية", "العام السابق", "صافي المستحقات", "المسدد", "الرصيد المدين", "الرصيد الدائن", "حالة الترحيل"];
  const state = (s: Stu) => (s.carried === s.items ? "مرحّل سابقًا" : s.carried ? "مرحّل جزئيًا" : "غير مرحّل");
  const data = shown.map((s) => [s.name, s.school, [...s.years].map(formatAcademicYear).join("، "), money(s.net), money(s.recorded), money(s.debit), money(s.credit), state(s)]);
  const meta = { totals: true, title: "الأرصدة السابقة والمرحلة", filters: [`من ${formatAcademicYear(fromKey)} إلى ${formatAcademicYear(toKey)}`] };
  const apply = async () => {
    if (!chosen.length) return;
    if (!(await ask(`اعتماد ترحيل أرصدة ${chosen.length} طالبًا من ${formatAcademicYear(fromKey)} إلى ${formatAcademicYear(toKey)}؟ يُعاد التحقق من الأرصدة الفعلية لحظة الاعتماد، ولا يُنشأ دين جديد ولا تتغير المستحقات أو السندات الأصلية.`, { ok: "اعتماد الترحيل" }))) return;
    setBusy(true);
    const ids = chosen.length === pending.length ? [] : chosen.map((s) => s.id);
    const { data: d, error } = await db.rpc("sf_carry_apply", { ...args, _students: ids, _request_key: crypto.randomUUID(), _reason: reason });
    setBusy(false);
    if (error) toast.error(arabicError(error)); else { const c = (d as Row)["counts"] as Row; toast.success(`رُحّل ${String(c["items"] ?? 0)} رصيدًا لـ ${String(c["students"] ?? 0)} طالبًا`); setPicked(null); setReason(""); void qc.invalidateQueries({ queryKey: SF_KEY }); }
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <label className="space-y-1 text-xs"><span className="block font-semibold">العام المصدر</span><select aria-label="العام المصدر" className={selectCls("min-w-40", true)} value={fromKey} onChange={(e) => { setFrom(e.target.value); setPicked(null); }}>{ys.map((y) => <option key={String(y["name"])} value={String(y["name"])}>{formatAcademicYear(String(y["name"]))}</option>)}</select></label>
        <ArrowLeftRight className="mb-2 size-4 text-muted-foreground" />
        <label className="space-y-1 text-xs"><span className="block font-semibold">العام المستهدف</span><select aria-label="العام المستهدف" className={selectCls("min-w-40", true)} value={toKey} onChange={(e) => { setTo(e.target.value); setFrom(""); setPicked(null); }}>{ys.map((y) => <option key={String(y["name"])} value={String(y["name"])}>{formatAcademicYear(String(y["name"]))}{y["current"] ? " (الحالي)" : ""}</option>)}</select></label>
        <fieldset className="space-y-1 text-xs"><legend className="font-semibold">نوع الأرصدة</legend><span className="flex gap-3">{[["debit", "مدينة"], ["credit", "دائنة"]].map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="checkbox" checked={dirs.includes(v!)} onChange={(e) => { setDirs(e.target.checked ? [...dirs, v!] : dirs.filter((x) => x !== v)); setPicked(null); }} />{l}</label>)}</span></fieldset>
        <fieldset className="space-y-1 text-xs"><legend className="font-semibold">المدارس</legend><span className="flex flex-wrap gap-3">{(schools.data ?? []).map((s) => <label key={s["id"]} className="flex items-center gap-1"><input type="checkbox" checked={sch.includes(s["id"])} onChange={(e) => { setSch(e.target.checked ? [...sch, s["id"]] : sch.filter((x) => x !== s["id"])); setPicked(null); }} />{s["name"]}</label>)}<span className="text-muted-foreground">{sch.length ? "" : "(كل المدارس)"}</span></span></fieldset>
      </div>
      {ys.length < 2 ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">يلزم عامان دراسيان على الأقل في الهيكل الأكاديمي لترحيل الأرصدة.</p> : pv.isLoading ? <LoadingState /> : pv.error ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{arabicError(pv.error)}</p> : <>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          {[["إجمالي الطلاب", String(k.all)], ["لديهم أرصدة مدينة", String(k.debitN)], ["لديهم أرصدة دائنة", String(k.creditN)], ["إجمالي المدين", money(k.debit)], ["إجمالي الدائن", money(k.credit)], ["أرصدة مرحّلة سابقًا", String(k.carried)], ["تحتاج مراجعة (دائن)", String(k.creditN)], ["المطلوب ترحيله", money(k.todo)]].map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold tabular-nums">{v}</div></div>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-xs" placeholder="بحث باسم الطالب" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button size="sm" variant="outline" onClick={() => setPicked(new Set(pending.map((s) => s.id)))}>تحديد الكل</Button>
          <Button size="sm" variant="outline" onClick={() => setPicked(new Set())}>إلغاء التحديد</Button>
          <span className="ms-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => void exportPdf(meta, H, data).catch((e) => toast.error(arabicError(e)))}>PDF</Button><Button size="sm" variant="outline" onClick={() => exportXlsx(meta, H, data)}>Excel</Button><Button size="sm" variant="outline" onClick={() => printReport(meta, H, data)}>طباعة</Button></span>
        </div>
        <div className="max-h-[28rem] overflow-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-muted/80 text-xs"><tr><th className="p-2" />{H.map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{shown.map((s, i) => <tr key={s.id} className="border-t"><td className="p-2"><input type="checkbox" aria-label={`تحديد ${s.name}`} disabled={s.carried === s.items} checked={sel.has(s.id) && s.carried < s.items} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(s.id); else n.delete(s.id); setPicked(n); }} /></td>{data[i]!.map((c, j) => <td key={j} className={`p-2 ${j >= 3 && j <= 6 ? "tabular-nums" : ""} ${j === 5 && s.debit > 0 ? "font-semibold text-destructive" : ""}`}>{c}</td>)}</tr>)}</tbody></table>
          {!shown.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد أرصدة قابلة للترحيل في هذا النطاق.</p>}
        </div>
        <details className="rounded-xl border bg-card p-3 text-xs"><summary className="cursor-pointer font-semibold">تفاصيل البنود ({(pv.data ?? []).length})</summary>
          <ul className="mt-2 space-y-1">{(pv.data ?? []).filter((r) => !search || r.name.includes(search)).map((r) => <li key={r.obligation_id}>{r.name} · {formatAcademicYear(r.year)} · {KIND_LABEL[r.kind]} {TERM_LABEL(r.term)} · {r.direction === "debit" ? `مدين ${money(r.remaining)}` : `دائن ${money(r.credit)}`}{r.carried ? " · مرحّل" : ""}</li>)}</ul></details>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <Input className="max-w-md" placeholder="سبب الترحيل (إلزامي) — مثل: إقفال العام ماليًا" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button disabled={busy || !chosen.length || reason.trim().length < 3} onClick={() => void apply()}>اعتماد ترحيل {chosen.length} طالبًا</Button>
          <span className="text-xs text-muted-foreground">الترحيل لمدير النظام فقط، ولا يتكرر للرصيد نفسه، ويُسجَّل في السجل ويُشعَر أولياء الأمور.</span>
        </div>
      </>}
      <section className="space-y-2"><h3 className="font-semibold">سجل عمليات الترحيل</h3>
        {runs.error ? <p className="text-sm text-muted-foreground">{arabicError(runs.error)}</p> : !(runs.data ?? []).length ? <p className="text-sm text-muted-foreground">لا توجد عمليات ترحيل سابقة.</p> :
          <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["التاريخ", "من", "إلى", "الطلاب", "البنود", "المدين", "الدائن", "السبب", "المنفّذ"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{(runs.data ?? []).map((r) => { const c = (r["counts"] ?? {}) as Row; return <tr key={r["id"]} className="border-t"><td className="p-2">{new Date(r["created_at"]).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</td><td className="p-2">{formatAcademicYear(r["from_key"])}</td><td className="p-2">{formatAcademicYear(r["to_key"])}</td><td className="p-2">{String(c["students"] ?? 0)}</td><td className="p-2">{String(c["items"] ?? 0)}</td><td className="p-2 tabular-nums">{money(c["debit"])}</td><td className="p-2 tabular-nums">{money(c["credit"])}</td><td className="p-2">{r["reason"]}</td><td className="p-2">{r["actor_name"]}</td></tr>; })}</tbody></table></div>}
      </section>
    </section>
  );
}
