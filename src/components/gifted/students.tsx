import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { GT_DOMAINS, GT_STATUS, PLAN_STATUS } from "./model";
import { gtToday } from "./nomination-wizard";

type Row = { id: string; name: string; csmart: string | null; grade: string | null; section: string | null; stage: string | null; domains: string[]; care: string; last: string | null };
type File = { student: Row; coord: boolean; nominations: { id: string; no: number; domains: string[]; status: string; decision_reason: string | null; year: string | null; indicator_count: number }[]; measures: { id: string; name: string; issuer: string; taken_on: string; result: string; verified: boolean; note: string | null; by: string | null }[] | null; plans: { id: string; no: number; title: string; status: string; goals: number; activities: number; achieved: number; acts_done: number; last: string | null }[] };
const CARE: Record<string, string> = { nominated: "مرشّح قيد الدراسة", approved: "مُقرّ للرعاية", active: "في خطة جارية" };

export function GtStudents({ school, openId, onSel, openPlan }: { school: string; openId?: string | undefined; onSel: (id: string | null) => void; openPlan: (id: string) => void }) {
  const list = useQuery({ queryKey: ["gt-students", school], queryFn: async () => { const r = await db.rpc("gt_students", { _school: school }); if (r.error) throw r.error; return r.data as Row[]; } });
  const [q, setQ] = useState(""); const [dom, setDom] = useState(""); const [care, setCare] = useState("");
  if (list.isLoading) return <LoadingState />; if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const rows = (list.data ?? []).filter((r) => (!q || r.name.includes(q) || (r.csmart ?? "").includes(q)) && (!dom || r.domains.includes(dom)) && (!care || r.care === care));
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث" className="ps-9" placeholder="اسم الطالب أو C‑Smart" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <select aria-label="المجال" className={selectCls()} value={dom} onChange={(e) => setDom(e.target.value)}><option value="">كل المجالات</option>{Object.entries(GT_DOMAINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="حالة الرعاية" className={selectCls()} value={care} onChange={(e) => setCare(e.target.value)}><option value="">كل الحالات</option>{Object.entries(CARE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    {!rows.length ? <EmptyState title="لا يوجد طلبة في سجل الرعاية" hint="يظهر الطالب هنا بعد إرسال ترشيحه أو إضافته إلى خطة." /> :
      <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50 text-start"><tr>{["الطالب", "المرحلة / الصف / الشعبة", "المجالات المقرّة", "حالة الرعاية", "آخر متابعة"].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className={`cursor-pointer border-t hover:bg-muted/30 ${openId === r.id ? "bg-primary/5" : ""}`} onClick={() => onSel(r.id)}><td className="p-3 font-semibold">{r.name}{r.csmart && <span className="block text-xs font-normal text-muted-foreground">C‑Smart {r.csmart}</span>}</td><td className="p-3">{[r.stage, r.grade, r.section].filter(Boolean).join(" / ")}</td><td className="p-3">{r.domains.map((d) => GT_DOMAINS[d]).join("، ") || "—"}</td><td className="p-3">{CARE[r.care]}</td><td className="p-3">{r.last ?? "—"}</td></tr>)}</tbody></table></div>}
    {openId && <StudentFile school={school} id={openId} openPlan={openPlan} />}
  </div>;
}

function StudentFile({ school, id, openPlan }: { school: string; id: string; openPlan: (id: string) => void }) {
  const qc = useQueryClient(); const f = useQuery({ queryKey: ["gt-file", school, id], queryFn: async () => { const r = await db.rpc("gt_student_file", { _school: school, _student: id }); if (r.error) throw r.error; return r.data as File; } });
  const [m, setM] = useState({ name: "", issuer: "", taken_on: gtToday(), result: "", verified: false, note: "" }); const [busy, setBusy] = useState(false); const [add, setAdd] = useState(false);
  if (f.isLoading) return <LoadingState />; if (f.error || !f.data) return <p role="alert" className="rounded-lg border p-3 text-sm">هذا الملف غير متاح لحسابك.</p>;
  const d = f.data;
  async function saveM() { setBusy(true); try { const r = await db.rpc("gt_measure_save", { _school: school, _student: id, _p: m }); if (r.error) throw r.error; toast.success("حُفظت نتيجة المقياس"); setAdd(false); qc.invalidateQueries({ queryKey: ["gt-file", school, id] }); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <section aria-label="ملف الطالب" className="space-y-4 rounded-2xl border bg-card p-5">
    <div><h3 className="text-lg font-bold">ملف {d.student.name}</h3><p className="text-xs text-muted-foreground">{[d.student.stage, d.student.grade, d.student.section].filter(Boolean).join(" · ")}</p></div>
    <div className="grid gap-4 lg:grid-cols-3">
      <div><h4 className="mb-2 text-sm font-semibold">الترشيحات وقراراتها</h4>{d.nominations.length ? <ul className="space-y-1.5 text-sm">{d.nominations.map((n) => <li key={n.id} className="rounded-lg bg-muted/40 p-2">TAL-{String(n.no).padStart(4, "0")} · {GT_STATUS[n.status]}<span className="block text-xs text-muted-foreground">{n.domains.map((x) => GT_DOMAINS[x]).join("، ")} · {n.year ?? ""} · {n.indicator_count} شواهد</span>{n.decision_reason && <span className="block text-xs">{n.decision_reason}</span>}</li>)}</ul> : <p className="text-sm text-muted-foreground">لا ترشيحات مرسلة.</p>}</div>
      <div><h4 className="mb-2 text-sm font-semibold">خطط الرعاية</h4>{d.plans.length ? <ul className="space-y-1.5 text-sm">{d.plans.map((p) => <li key={p.id}><button type="button" className="w-full rounded-lg bg-muted/40 p-2 text-start hover:bg-muted" onClick={() => openPlan(p.id)}>{p.title} · {PLAN_STATUS[p.status]}<span className="block text-xs text-muted-foreground">أهداف تحققت {p.achieved}/{p.goals} · أنشطة {p.acts_done}/{p.activities}{p.last ? ` · آخر متابعة ${p.last}` : ""}</span></button></li>)}</ul> : <p className="text-sm text-muted-foreground">لا توجد خطط بعد.</p>}</div>
      <div><h4 className="mb-2 text-sm font-semibold">نتائج المقاييس الخارجية</h4>
        {d.measures === null ? <p className="text-sm text-muted-foreground">مقيّدة بمنسق الموهوبين.</p> : <>
          {d.measures.length ? <ul className="space-y-1.5 text-sm">{d.measures.map((x) => <li key={x.id} className="rounded-lg bg-muted/40 p-2">{x.name} — {x.result}<span className="block text-xs text-muted-foreground">{x.issuer} · {x.taken_on} · {x.verified ? "متحقَّق من المستند" : "غير متحقَّق"}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">لا توجد نتيجة مسجلة — وهذا لا يعني أن الطالب غير موهوب.</p>}
          {d.coord && (!add ? <Button size="sm" variant="outline" className="mt-2" onClick={() => setAdd(true)}>تسجيل نتيجة مقياس</Button> : <div className="mt-2 space-y-2 rounded-lg border p-2">
            <Input aria-label="اسم المقياس" placeholder="اسم المقياس" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /><Input aria-label="الجهة" placeholder="الجهة المصدرة" value={m.issuer} onChange={(e) => setM({ ...m, issuer: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><Input aria-label="تاريخ المقياس" type="date" max={gtToday()} value={m.taken_on} onChange={(e) => setM({ ...m, taken_on: e.target.value })} /><Input aria-label="النتيجة" placeholder="النتيجة كما وردت" value={m.result} onChange={(e) => setM({ ...m, result: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.verified} onChange={(e) => setM({ ...m, verified: e.target.checked })} />اطلعتُ على المستند الأصلي</label>
            <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={saveM}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => setAdd(false)}>إلغاء</Button></div></div>)}</>}
      </div>
    </div>
  </section>;
}
