import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { ExportButtons } from "@/components/list-tools";
import { arabicError } from "@/lib/session";
import { CORR_STATUS, ENTRY_STATUS, GB_STATUS, GB_TONE } from "./common";

const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${GB_TONE[s] ?? "bg-muted"}`} data-testid="gb-status">{GB_STATUS[s] ?? s}</span>;

/* ================= Overview (completion, pending, averages) ================= */
export function OverviewTab({ S, school, period, onOpen, canOpen }: { S: string; school: string; period: Row | undefined; onOpen: (gb: string) => void; canOpen: boolean }) {
  const qc = useQueryClient();
  const [st, setSt] = useState(""); const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["gb-overview", S, period?.["id"]], enabled: !!period, queryFn: async () => {
    const { data, error } = await db.rpc("gb_overview", { _school: S, _period: period!["id"] }); if (error) throw error; return data as Row[];
  } });
  const rows = (q.data ?? []).filter((r) => (!st || r["status"] === st) && (!search || `${r["course_label"]} ${r["teacher_name"] ?? ""}`.includes(search)));
  const open = async (r: Row) => {
    if (r["gradebook_id"]) return onOpen(r["gradebook_id"]);
    const { data, error } = await db.rpc("gb_open", { _course: r["course_id"], _period: period!["id"] });
    if (error) return void toast.error(arabicError(error));
    qc.invalidateQueries({ queryKey: ["gb-overview", S] }); onOpen(data);
  };
  if (!period) return <EmptyState title="لا توجد فترة رصد" hint="تُنشئها الإدارة من تبويب فترات الرصد." />;
  const cols = ["المقرر", "المعلم", "الحالة", "الطلاب", "الخانات المرصودة", "غير المرصودة", "اكتمال الرصد %", "نتائج مكتملة", "المتوسط (من المكتمل)", "تصحيحات معلقة"];
  const line = (r: Row) => [r["course_label"], r["teacher_name"] ?? "—", GB_STATUS[r["status"]], r["students"] ?? 0, r["filled"] ?? 0, r["missing"] ?? 0,
    r["cells"] ? Math.round((1000 * r["filled"]) / r["cells"]) / 10 : "—", r["computed"] ?? 0, r["average"] ?? "—", r["pending_corrections"] ?? 0];
  return (
    <Section title={`سجلات الدرجات — ${period["name"]}`} desc="المتوسط يُحسب من النتائج المكتملة فقط، ولا تُعدّ الخانات غير المرصودة أصفارًا؛ يظهر بجانبه عدد الطلاب الداخلين فيه.">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input placeholder="ابحث بالمادة أو الشعبة أو المعلم" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select aria-label="الحالة" className={selectCls("w-44")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(GB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <ExportButtons title={`اكتمال الرصد — ${period["name"]}`} school={school} filters={[st ? GB_STATUS[st]! : "كل الحالات", search].filter(Boolean)} headers={cols} rows={() => rows.map(line)} />
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title="لا توجد مقررات ضمن صلاحيتك" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{cols.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}<th /></tr></thead>
          <tbody>{rows.map((r) => { const l = line(r); return <tr key={r["course_id"]} className="border-t" data-testid="gb-row">
            <td className="px-3 py-2 font-medium">{l[0]}{r["dept_missing"] && <div className="text-xs text-warning-foreground">لا رئيس قسم مخوّل — تراجع الإدارة</div>}{Number(r["drift"]) > 0 && <div className="text-xs text-destructive">تغيّر مصدر واجبات في {r["drift"]} خانة</div>}</td><td className="px-3">{l[1]}</td><td className="px-3"><Badge s={r["status"]} /></td>{l.slice(3).map((v, i) => <td key={i} className="px-3">{v}</td>)}
            <td className="px-3">{(r["gradebook_id"] || canOpen) && <Button size="sm" variant="outline" onClick={() => open(r)}>{r["gradebook_id"] ? "فتح" : "بدء الرصد"}</Button>}</td></tr>; })}</tbody></table></div>
      )}
    </Section>
  );
}

export { GradebookView } from "./sheet";

/* ================= Corrections ================= */
export function CorrectionsTab({ S, school, period, admin }: { S: string; school: string; period: Row | undefined; admin: boolean }) {
  const qc = useQueryClient(); const [busy, setBusy] = useState("");
  const q = useQuery({ queryKey: ["gb-corr", S, period?.["id"]], enabled: !!period, queryFn: async () => { const { data, error } = await db.rpc("gb_corrections_report", { _school: S, _period: period!["id"] }); if (error) throw error; return data as Row[]; } });
  const decide = async (r: Row, ok: boolean) => {
    const note = ok ? ((await ask("اعتماد التصحيح؟ يُعاد الحساب، وإن كانت النتيجة منشورة يُنشر إصدار جديد ويُبلَّغ الطالب وأسرته.")) ? "" : null) : await askText("سبب الرفض", { required: true });
    if (note === null) return;
    setBusy(r["id"]); const { error } = await db.rpc("gb_decide_correction", { _id: r["id"], _approve: ok, _note: note }); setBusy("");
    if (error) return void toast.error(arabicError(error)); toast.success(ok ? "اعتُمد التصحيح" : "رُفض الطلب");
    qc.invalidateQueries({ queryKey: ["gb-corr"] }); qc.invalidateQueries({ queryKey: ["gb-overview"] });
  };
  const v = (s: string, n: unknown) => (s === "score" ? String(n) : ENTRY_STATUS[s] ?? s);
  const cols = ["المقرر", "الطالب", "البند", "الحالي", "المقترح", "السبب", "الدليل", "الحالة", "مقدم الطلب", "تاريخ الطلب", "البات", "ملاحظة القرار"];
  if (!period) return <EmptyState title="لا توجد فترة رصد" />;
  return (
    <Section title="طلبات تصحيح النتائج" desc="لا يعدّل المعلم نتيجة مقفلة مباشرة. القرار لمدير المدرسة، ويُحفظ القديم والجديد والفاعل والسبب.">
      <div className="mb-3"><ExportButtons title={`تعديلات النتائج — ${period["name"]}`} school={school} headers={cols} rows={() => (q.data ?? []).map((r) => [r["course_label"], r["student_name"], r["item_name"], v(r["old_status"], r["old_score"]), v(r["new_status"], r["new_score"]), r["reason"], r["evidence"] ?? "", CORR_STATUS[r["status"]], r["requested_by"] ?? "", r["requested_at"]?.slice(0, 16), r["decided_by"] ?? "", r["decision_note"] ?? ""])} /></div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد طلبات تصحيح" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{["المقرر", "الطالب", "البند", "الحالي ← المقترح", "السبب", "الحالة", ""].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{q.data.map((r) => <tr key={r["id"]} className="border-t" data-testid="corr-row"><td className="px-3 py-2">{r["course_label"]}</td><td className="px-3">{r["student_name"]}</td><td className="px-3">{r["item_name"]}</td>
            <td className="px-3">{v(r["old_status"], r["old_score"])} ← <b>{v(r["new_status"], r["new_score"])}</b></td><td className="px-3">{r["reason"]}{r["evidence"] ? <div className="text-xs text-muted-foreground">{r["evidence"]}</div> : null}</td>
            <td className="px-3">{CORR_STATUS[r["status"]]}{r["decision_note"] ? <div className="text-xs text-muted-foreground">{r["decision_note"]}</div> : null}</td>
            <td className="px-3">{admin && r["status"] === "pending" && <div className="flex gap-1"><Button size="sm" disabled={busy === r["id"]} onClick={() => decide(r, true)}>اعتماد</Button><Button size="sm" variant="outline" disabled={busy === r["id"]} onClick={() => decide(r, false)}>رفض</Button></div>}</td></tr>)}</tbody></table></div>
      )}
    </Section>
  );
}

/* ================= Organization owner: branch summary ================= */
export function OrgSummary({ org, name }: { org: string; name: string }) {
  const q = useQuery({ queryKey: ["gb-org", org], queryFn: async () => { const { data, error } = await db.rpc("gb_org_summary", { _org: org }); if (error) throw error; return data as Row[]; } });
  const cols = [["school_name", "الفرع"], ["gradebooks", "السجلات"], ["draft", "مسودة/معاد"], ["submitted", "بانتظار المراجعة"], ["reviewed", "بانتظار الاعتماد"], ["approved", "معتمد"], ["published", "منشور"], ["pending_corrections", "تصحيحات معلقة"]] as const;
  return (
    <Section title="متابعة الفروع" desc="لمالك المؤسسة: حالة الرصد في الفروع دون درجات الطلاب الفردية، ودون صلاحية تعديل.">
      <div className="mb-3">{q.data && <ExportButtons title="متابعة رصد الفروع" school={name} headers={cols.map(([, l]) => l)} rows={() => (q.data ?? []).map((r) => cols.map(([c]) => r[c] ?? 0))} />}</div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد بيانات" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{cols.map(([c, l]) => <th key={c} className="px-3 py-2 text-start">{l}</th>)}</tr></thead>
          <tbody>{q.data.map((r) => <tr key={r["school_id"]} className="border-t">{cols.map(([c]) => <td key={c} className="px-3 py-2">{r[c] ?? 0}</td>)}</tr>)}</tbody></table></div>
      )}
    </Section>
  );
}
