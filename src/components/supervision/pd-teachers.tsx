import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserRound } from "lucide-react";
import { db } from "@/components/crud-page";
import { askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { REC_STATE, VISIT_STATE } from "./work-model";
import { riyadhText, type SvMe } from "./model";
import { NEED_SOURCE, NEED_STATUS, PLAN_STATUS, PRIORITY, ENROLL, type Need } from "./pd-model";
import { sv4 } from "./pd-api";
import { useUnsaved } from "./use-unsaved";
import type { PdData } from "./pd";

type Profile = { id: string; name: string; school_id: string; school: string; specialization: string | null; department: string | null; internal_visible: boolean; courses: { id: string; name: string }[]; visits: { id: string; kind: string; starts_at: string; state: string; purpose: string }[]; recommendations: { id: string; no: number; action: string; due: string; state: string }[]; needs: Need[]; plans: { id: string; version: number; status: string; goals: number; activities: number }[]; programs: { id: string; title: string; status: string; hours: number }[]; evidence: number };

export function PdTeachers({ me, d, fd }: { me: SvMe; d: PdData; fd: PdData }) {
  const [sel, setSel] = useState<string | null>(fd.teachers.length === 1 ? fd.teachers[0]!.id : null); const [q, setQ] = useState("");
  const list = fd.teachers.filter((t) => !q || t.name.includes(q));
  if (!d.teachers.length) return <EmptyState title="لا معلمين ضمن نطاقك الساري" hint="يظهر المعلمون للمشرف ضمن إسناده الساري فقط، وللمعلم ملفه." />;
  return <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
    <aside className="space-y-2"><Input aria-label="بحث المعلمين" placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y rounded-lg border">{list.map((t) => <li key={t.id}><button type="button" onClick={() => setSel(t.id)} aria-current={sel === t.id ? "true" : undefined} className={`flex w-full items-center gap-2 p-2 text-start text-sm ${sel === t.id ? "bg-primary/10 font-semibold" : "hover:bg-muted"}`}><UserRound className="size-4 shrink-0" /><span className="min-w-0"><span className="block truncate">{t.name}</span><span className="block truncate text-xs text-muted-foreground">{t.school} · {t.specialization ?? "التخصص غير مسجل"}</span></span></button></li>)}</ul></aside>
    <div>{sel ? <TeacherProfile key={sel} id={sel} me={me} /> : <EmptyState title="اختر معلمًا لعرض ملفه الإشرافي" />}
      <NeedsBoard needs={fd.needs} title="كل الاحتياجات في النطاق" /></div>
  </div>;
}

function TeacherProfile({ id, me }: { id: string; me: SvMe }) {
  const p = useQuery({ queryKey: ["sv4", "profile", id], retry: false, queryFn: async () => { const r = await db.rpc("sv4_teacher_profile", { _teacher: id }); if (r.error) throw r.error; return r.data as Profile; } });
  const [adding, setAdding] = useState(false);
  if (p.isLoading) return <LoadingState />; if (p.error || !p.data) return <ErrorState message={arabicError(p.error)} />;
  const t = p.data; const self = me.schools.some((s) => s.id === t.school_id && s.teacher) && !t.internal_visible;
  const Sec = ({ title, n, children }: { title: string; n: number; children: React.ReactNode }) => <section className="rounded-lg border p-3"><h3 className="mb-2 font-bold">{title} ({n})</h3>{n ? children : <p className="text-sm text-muted-foreground">لا بيانات متاحة — وهذا لا يعني ضعفًا في الأداء.</p>}</section>;
  return <div className="space-y-3">
    <header className="rounded-lg border bg-card p-3"><h2 className="text-lg font-bold">{t.name}</h2><p className="text-sm text-muted-foreground">{t.school} · {t.specialization ?? "التخصص غير مسجل"}{t.department ? ` · ${t.department}` : ""}</p>
      <p className="mt-1 text-sm">المقررات الحالية: {t.courses.length ? t.courses.map((c) => c.name).join("، ") : "لا إسناد ساري"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t.internal_visible ? "الملاحظات الداخلية تظهر للمشرف والإدارة فقط." : "تعرض ما يخصك وما شُورك معك."} شواهد خطط التطوير: {t.evidence}</p></header>
    <div className="grid gap-3 md:grid-cols-2">
      <Sec title="الزيارات" n={t.visits.length}><ul className="space-y-1 text-sm">{t.visits.map((v) => <li key={v.id}>{riyadhText(v.starts_at)} · {v.kind === "peer" ? "تبادلية" : "صفية"} · {VISIT_STATE[v.state] ?? v.state}</li>)}</ul></Sec>
      <Sec title="التوصيات" n={t.recommendations.length}><ul className="space-y-1 text-sm">{t.recommendations.map((r) => <li key={r.id}>{r.no}. {r.action} — {REC_STATE[r.state] ?? r.state}</li>)}</ul></Sec>
      <Sec title="خطط التطوير" n={t.plans.length}><ul className="space-y-1 text-sm">{t.plans.map((x) => <li key={x.id}>إصدار {x.version} · {PLAN_STATUS[x.status]} · {x.goals} أهداف · {x.activities} أنشطة</li>)}</ul></Sec>
      <Sec title="البرامج والساعات الموثقة" n={t.programs.length}><ul className="space-y-1 text-sm">{t.programs.map((g) => <li key={g.id}>{g.title} · {ENROLL[g.status]} · {g.hours} ساعة موثقة بالحضور</li>)}</ul></Sec>
    </div>
    <div className="flex items-center justify-between"><h3 className="font-bold">الاحتياجات المهنية</h3><Button size="sm" onClick={() => setAdding(true)}><Plus />{self ? "تسجيل احتياج" : "اقتراح احتياج"}</Button></div>
    {adding && <NeedForm teacher={t.id} school={t.school_id} self={self} visits={t.visits} recs={t.recommendations} onDone={() => { setAdding(false); void p.refetch(); }} />}
    <NeedsBoard needs={t.needs} />
  </div>;
}

function NeedForm({ teacher, school, self, visits, recs, onDone }: { teacher: string; school: string; self: boolean; visits: Profile["visits"]; recs: Profile["recommendations"]; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ domain: "", description: "", source: self ? "teacher_request" : "visit", source_ref: "", source_note: "", priority: "medium", priority_reason: "", expected_outcome: "", internal_note: "" });
  const dirty = Object.values(v).some((x) => x && !["teacher_request", "visit", "medium"].includes(x)); const guard = useUnsaved(dirty);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { guard.changed(); setV({ ...v, [k]: e.target.value }); };
  async function save() { try { await sv4("sv4_need_save", { _id: null, _rev: null, _p: { ...v, school_id: school, teacher_id: teacher } }, "حُفظ الاحتياج بانتظار المراجعة"); guard.saved(); void qc.invalidateQueries({ queryKey: ["sv4"] }); onDone(); } catch { /* inputs kept */ } }
  const refs = v.source === "visit" ? visits.map((x) => ({ id: x.id, name: `${riyadhText(x.starts_at)} — ${x.purpose}` })) : v.source === "recommendation" ? recs.map((r) => ({ id: r.id, name: `${r.no}. ${r.action}` })) : [];
  return <form aria-label="احتياج مهني" className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    <Input aria-label="المجال" placeholder="المجال (مثل التقويم البنائي)" value={v.domain} onChange={set("domain")} />
    <select aria-label="المصدر" className={selectCls()} value={v.source} disabled={self} onChange={set("source")}>{Object.entries(NEED_SOURCE).filter(([k]) => self ? k === "teacher_request" : k !== "teacher_request").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    <textarea aria-label="وصف الاحتياج" className="rounded border p-2 sm:col-span-2" rows={2} placeholder="وصف الاحتياج" value={v.description} onChange={set("description")} />
    {!self && <>{refs.length > 0 && <select aria-label="المرجع" className={selectCls()} value={v.source_ref} onChange={set("source_ref")}><option value="">بدون مرجع محدد</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}<Input aria-label="مرجع المصدر" placeholder="مرجع المصدر (مطلوب)" value={v.source_note} onChange={set("source_note")} /></>}
    <select aria-label="الأولوية" className={selectCls()} value={v.priority} onChange={set("priority")}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>أولوية {l}</option>)}</select>
    <Input aria-label="سبب الأولوية" placeholder="سبب الأولوية" value={v.priority_reason} onChange={set("priority_reason")} />
    <Input aria-label="النتيجة المتوقعة" className="sm:col-span-2" placeholder="النتيجة المتوقعة" value={v.expected_outcome} onChange={set("expected_outcome")} />
    {!self && <textarea aria-label="ملاحظة داخلية" className="rounded border p-2 sm:col-span-2" rows={2} placeholder="ملاحظة داخلية (لا يراها المعلم)" value={v.internal_note} onChange={set("internal_note")} />}
    <div className="flex gap-2 sm:col-span-2"><Button type="submit">حفظ الاحتياج</Button><Button type="button" variant="ghost" onClick={() => void guard.leave(onDone)}>إلغاء</Button></div>
  </form>;
}

export function NeedsBoard({ needs, title }: { needs: Need[]; title?: string }) {
  const qc = useQueryClient();
  async function review(n: Need, decision: "accepted" | "declined") {
    const note = decision === "declined" ? await askText("سبب عدم اعتماد الاحتياج", { required: true, long: true }) : null; if (decision === "declined" && !note) return;
    try { await sv4("sv4_need_review", { _id: n.id, _rev: n.rev, _decision: decision, _note: note }, decision === "accepted" ? "اعتُمد الاحتياج" : "سُجل عدم الاعتماد"); void qc.invalidateQueries({ queryKey: ["sv4"] }); } catch { /* shown */ }
  }
  if (!needs.length) return title ? null : <p className="text-sm text-muted-foreground">لا احتياجات مسجلة.</p>;
  return <section aria-label={title ?? "الاحتياجات"} className="mt-3 space-y-2">{title && <h3 className="font-bold">{title}</h3>}
    <ul className="space-y-2">{needs.map((n) => <li key={n.id} className="rounded-lg border p-3 text-sm" data-need={n.status}>
      <div className="flex flex-wrap items-start justify-between gap-2"><b>{n.domain} — {n.teacher}</b><span className="text-xs">{NEED_STATUS[n.status]}</span></div>
      <p className="mt-1">{n.description}</p>
      <p className="mt-1 text-xs text-muted-foreground">المصدر: {NEED_SOURCE[n.source]}{n.source_note ? ` (${n.source_note})` : ""} · الأولوية {PRIORITY[n.priority]}: {n.priority_reason} · المتوقع: {n.expected_outcome} · سجّله {n.creator}{n.reviewer ? ` · راجعه ${n.reviewer}` : ""}</p>
      {n.review_note && <p className="mt-1 text-xs">ملاحظة المراجعة: {n.review_note}</p>}
      {n.internal_note && <p className="mt-1 rounded bg-muted p-1 text-xs">داخلي: {n.internal_note}</p>}
      {(n.plans.length > 0 || n.programs.length > 0) && <p className="mt-1 text-xs">مرتبط بـ {n.plans.length} خطة و{n.programs.length} برنامج (دون تكرار السجل)</p>}
      {n.can_review && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void review(n, "accepted")}>اعتماد الاحتياج</Button><Button size="sm" variant="outline" onClick={() => void review(n, "declined")}>عدم اعتماد</Button></div>}
    </li>)}</ul></section>;
}
