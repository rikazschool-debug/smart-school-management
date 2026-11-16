import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { ask } from "@/components/confirm";
import { ACT_TYPES, GT_DOMAINS, planIssues, type Plan, type PlanDraft } from "./model";

type Pool = { id: string; name: string; grade: string | null; section: string | null };
const blankGoal = () => ({ text: "", criteria: "", owner: "", due: "" });

export function PlanEditor({ school, row, close }: { school: string; row?: Plan | undefined; close: (id?: string) => void }) {
  const [d, setD] = useState<PlanDraft>(() => ({ kind: row?.kind ?? "individual", title: row?.title ?? "", domain: row?.domain ?? "creative", need: row?.need ?? "", owner_name: row?.owner_name ?? "", start_date: row?.start_date ?? "", end_date: row?.end_date ?? "", strengths: row?.strengths ?? "", resources: row?.resources ?? "", outputs: row?.outputs ?? "", students: row?.students.map((s) => s.id) ?? [], goals: row?.goals?.length ? row.goals : [blankGoal()], activities: row?.activities?.length ? row.activities : [{ type: "applied", title: "" }] }));
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [q, setQ] = useState("");
  const locked = !!row && row.status !== "draft"; const fixedGoals = locked ? row!.goals.length : 0; const fixedActs = locked ? row!.activities.length : 0;
  const pool = useQuery({ queryKey: ["gt-students", school], queryFn: async () => { const r = await db.rpc("gt_students", { _school: school }); if (r.error) throw r.error; return r.data as Pool[]; } });
  const extra = useQuery({ queryKey: ["edu-pool", school, "talent", q], enabled: q.length > 1, queryFn: async () => { const r = await db.rpc("edu_pool", { _school: school, _kind: "talent", _q: q }); if (r.error) throw r.error; return r.data as Pool[]; } });
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  const set = (p: Partial<PlanDraft>) => { setDirty(true); setD((x) => ({ ...x, ...p })); };
  const names = new Map([...(pool.data ?? []), ...(extra.data ?? []), ...(row?.students ?? []).map((s) => ({ id: s.id, name: s.name, grade: null, section: null }))].map((s) => [s.id, s]));
  const choices = q.length > 1 ? extra.data ?? [] : pool.data ?? [];
  const issues = planIssues(d);
  async function save() {
    setBusy(true); try { const r = await db.rpc("gt_plan_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: d }); if (r.error) throw r.error; setDirty(false); toast.success("حُفظت الخطة"); close(r.data as string); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const field = (k: keyof PlanDraft, label: string, ph = "") => <div className="space-y-1"><Label htmlFor={`gp-${k}`}>{label}</Label><Textarea id={`gp-${k}`} rows={2} placeholder={ph} value={d[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<PlanDraft>)} /></div>;
  return <div className="mx-auto max-w-4xl space-y-4 pb-24">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{row ? "تعديل خطة الرعاية" : "خطة رعاية جديدة"}</h2><Button variant="ghost" onClick={async () => { if (!dirty || (await ask("ستفقد التغييرات غير المحفوظة. هل تريد الخروج؟"))) close(); }}>إلغاء</Button></div>
    <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="gp-title">عنوان الخطة</Label><Input id="gp-title" value={d.title} onChange={(e) => set({ title: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="gp-kind">النوع</Label><select id="gp-kind" className={selectCls("w-full")} disabled={locked} value={d.kind} onChange={(e) => set({ kind: e.target.value as PlanDraft["kind"] })}><option value="individual">فردية (طالب واحد)</option><option value="group">جماعية (احتياج مشترك)</option></select></div>
      <div className="space-y-1"><Label htmlFor="gp-dom">المجال</Label><select id="gp-dom" className={selectCls("w-full")} value={d.domain} onChange={(e) => set({ domain: e.target.value })}>{Object.entries(GT_DOMAINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="gp-owner">المسؤول</Label><Input id="gp-owner" value={d.owner_name} onChange={(e) => set({ owner_name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label htmlFor="gp-s">من</Label><Input id="gp-s" type="date" value={d.start_date} onChange={(e) => set({ start_date: e.target.value })} /></div><div className="space-y-1"><Label htmlFor="gp-e">إلى</Label><Input id="gp-e" type="date" value={d.end_date} onChange={(e) => set({ end_date: e.target.value })} /></div></div>
    </section>
    <section className="space-y-2 rounded-2xl border bg-card p-4"><h3 className="font-semibold">الطلبة ({d.students.length})</h3>
      <div className="flex flex-wrap gap-1.5">{d.students.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm">{names.get(id)?.name ?? "طالب"}{!locked && <button type="button" aria-label="إزالة" onClick={() => set({ students: d.students.filter((x) => x !== id) })}><Trash2 className="size-3" /></button>}</span>)}</div>
      <Input aria-label="بحث عن طالب" placeholder="ابحث لإضافة طالب آخر (المقرّون يظهرون أولًا)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">{choices.filter((s) => !d.students.includes(s.id)).slice(0, 30).map((s) => <button key={s.id} type="button" onClick={() => set({ students: d.kind === "individual" ? [s.id] : [...d.students, s.id] })} className="rounded-full border px-2.5 py-1 text-sm hover:bg-muted"><Plus className="inline size-3" /> {s.name}{s.grade ? ` · ${s.grade}` : ""}</button>)}</div>
    </section>
    <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">{field("strengths", "نقاط القوة والاهتمامات")}{field("need", "الاحتياج", "ما الذي يحتاجه الطالب ليتقدم في مجاله؟")}{field("resources", "الموارد")}{field("outputs", "المخرجات المتوقعة")}</section>
    <section className="space-y-2 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">الأهداف المرقّمة</h3><Button size="sm" variant="outline" onClick={() => set({ goals: [...d.goals, blankGoal()] })}><Plus className="size-4" />هدف</Button></div>
      {d.goals.map((g, i) => <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[2rem_1fr_1fr]"><span className="grid size-7 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
        <Input aria-label={`نص الهدف ${i + 1}`} placeholder="هدف قابل للقياس" value={g.text} onChange={(e) => set({ goals: d.goals.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
        <Input aria-label={`معيار التحقق ${i + 1}`} placeholder="معيار التحقق" value={g.criteria} onChange={(e) => set({ goals: d.goals.map((x, j) => (j === i ? { ...x, criteria: e.target.value } : x)) })} />
        <span /><Input aria-label={`مسؤول الهدف ${i + 1}`} placeholder="المسؤول" value={g.owner} onChange={(e) => set({ goals: d.goals.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)) })} />
        <div className="flex gap-2"><Input aria-label={`موعد الهدف ${i + 1}`} type="date" value={g.due} onChange={(e) => set({ goals: d.goals.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)) })} /><Button size="icon" variant="ghost" aria-label="حذف الهدف" disabled={i < fixedGoals || d.goals.length === 1} onClick={() => set({ goals: d.goals.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>
      </div>)}</section>
    <section className="space-y-2 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">الأنشطة الإثرائية</h3><Button size="sm" variant="outline" onClick={() => set({ activities: [...d.activities, { type: "workshop", title: "" }] })}><Plus className="size-4" />نشاط</Button></div>
      {d.activities.map((a, i) => <div key={i} className="flex gap-2"><select aria-label={`نوع النشاط ${i + 1}`} className={selectCls("w-44")} value={a.type} onChange={(e) => set({ activities: d.activities.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>{Object.entries(ACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Input aria-label={`عنوان النشاط ${i + 1}`} value={a.title} onChange={(e) => set({ activities: d.activities.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Button size="icon" variant="ghost" aria-label="حذف النشاط" disabled={i < fixedActs || d.activities.length === 1} onClick={() => set({ activities: d.activities.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>)}
      <p className="text-xs text-muted-foreground">أنواع الأنشطة للتنظيم فقط وليست تصنيفًا رسميًا.</p></section>
    {issues.length > 0 && <div role="status" className="rounded-lg border bg-muted/40 p-3 text-sm"><b>قبل «جاهزة للتنفيذ»:</b><ul className="list-inside list-disc">{issues.map((s) => <li key={s}>{s}</li>)}</ul></div>}
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur"><div className="mx-auto flex max-w-4xl justify-end"><Button disabled={busy || d.title.trim().length < 3} onClick={save}><Save className="size-4" />حفظ</Button></div></div>
  </div>;
}
