import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, History, Pencil, Plus, StopCircle } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { ACTION_LABEL, ASG_STATE, fromRiyadhInput, riyadhText, toRiyadhInput, type Named, type SvAssignment, type SvMe } from "./model";

type Pool = { supervisors: Named[]; teachers: (Named & { specialization: string | null })[]; subjects: Named[]; courses: (Named & { subject_id: string; teacher_ids: string[] })[] };
const stTone: Record<string, string> = { current: "bg-success/15 text-success", future: "bg-primary/10 text-primary", ended: "bg-muted", cancelled: "bg-muted" };

export function Assignments({ org, me }: { org: string; me: SvMe }) {
  const q = useQuery({ queryKey: ["sv-asg", org], queryFn: async () => { const r = await db.rpc("sv_asg_list", { _org: org }); if (r.error) throw r.error; return r.data as SvAssignment[]; } });
  const [edit, setEdit] = useState<SvAssignment | "new" | null>(null); const [st, setSt] = useState<"current" | "future" | "ended">("current"); const [hist, setHist] = useState<string | null>(null);
  const manage = me.schools.filter((s) => s.can_assign);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const all = q.data ?? []; const rows = all.filter((a) => (st === "ended" ? a.state === "ended" || a.state === "cancelled" : a.state === st));
  async function end(a: SvAssignment) { const why = await askText(a.state === "future" ? "سبب إلغاء الإسناد قبل بدايته" : "سبب إنهاء الإسناد الآن (يتوقف وصول المشرف فورًا)", { required: true, ok: "تأكيد" }); if (!why) return;
    const r = await db.rpc("sv_asg_end", { _id: a.id, _rev: a.rev, _reason: why }); if (r.error) { toast.error(arabicError(r.error)); return; } toast.success("انتهى الإسناد"); q.refetch(); }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">الإسناد بمدة يخص المشرف وحده؛ صلاحيات المعلم والمدير والمالك الأصلية لا تحتاج إسنادًا. الأوقات بتوقيت الرياض.</p>
    <div className="flex flex-wrap gap-2">{(["current", "future", "ended"] as const).map((k) => <Button key={k} size="sm" variant={st === k ? "default" : "outline"} onClick={() => setSt(k)}>{k === "current" ? "الحالية" : k === "future" ? "المستقبلية" : "المنتهية"} ({all.filter((a) => (k === "ended" ? a.state === "ended" || a.state === "cancelled" : a.state === k)).length})</Button>)}
      {manage.length > 0 && <Button size="sm" className="ms-auto" onClick={() => setEdit("new")}><Plus className="size-4" />إسناد جديد</Button>}</div>
    {edit && <AsgForm me={me} a={edit === "new" ? null : edit} onDone={(ok) => { setEdit(null); if (ok) q.refetch(); }} />}
    {!rows.length ? <EmptyState title="لا توجد إسنادات هنا" hint={manage.length ? "أنشئ إسنادًا: اختر المشرف والفرع والمعلمين والمدة والسبب." : me.owner ? "" : "الإسناد يديره مدير النظام، أو مدير الفرع بتفويض صريح منه."} />
      : <ul className="grid gap-3 lg:grid-cols-2">{rows.map((a) => <li key={a.id} className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{a.supervisor}</p><p className="text-xs text-muted-foreground">{a.school}</p></div><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stTone[a.state]}`}>{ASG_STATE[a.state]}</span></div>
        <p className="mt-2 flex items-center gap-1 text-xs"><CalendarClock className="size-3.5" />{riyadhText(a.starts_at)} ← {riyadhText(a.ends_at)}</p>
        <p className="mt-2 text-sm"><b>المعلمون:</b> {a.teachers.map((t) => t.name).join("، ") || "—"}</p>
        {a.courses.length > 0 && <p className="text-sm"><b>المقررات:</b> {a.courses.map((t) => t.name).join("، ")}</p>}
        {a.subjects.length > 0 && <p className="text-sm"><b>التخصصات:</b> {a.subjects.map((t) => t.name).join("، ")}</p>}
        <p className="mt-1 text-xs text-muted-foreground">السبب: {a.reason}{a.cancel_reason ? ` · سبب الإنهاء: ${a.cancel_reason}` : ""}</p>
        <p className="text-xs text-muted-foreground">أنشأه {a.created_by_name} · آخر تعديل {a.updated_by_name}</p>
        {a.handover > 0 && <p className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">{a.handover} سجل مفتوح يحتاج تحديد مسؤول مخوّل (من تبويب السجلات).</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {a.can_manage && (a.state === "current" || a.state === "future") && <><Button size="sm" variant="outline" onClick={() => setEdit(a)}><Pencil className="size-4" />تعديل</Button><Button size="sm" variant="outline" onClick={() => end(a)}><StopCircle className="size-4" />{a.state === "future" ? "إلغاء" : "إنهاء الآن"}</Button></>}
          <Button size="sm" variant="ghost" onClick={() => setHist(hist === a.id ? null : a.id)}><History className="size-4" />سجل التغيير</Button>
        </div>
        {hist === a.id && <AsgHistory id={a.id} />}
      </li>)}</ul>}
  </div>;
}

function AsgHistory({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["sv-asg-ev", id], queryFn: async () => { const r = await db.rpc("sv_asg_events", { _id: id }); if (r.error) throw r.error; return r.data as { action: string; actor: string; at: string }[]; } });
  if (q.isLoading) return <LoadingState rows={1} />;
  return <ol className="mt-2 space-y-1 border-t pt-2 text-xs">{(q.data ?? []).map((e, i) => <li key={i}>{ACTION_LABEL[e.action] ?? e.action} — {e.actor} · {riyadhText(e.at)}</li>)}</ol>;
}

function AsgForm({ me, a, onDone }: { me: SvMe; a: SvAssignment | null; onDone: (ok: boolean) => void }) {
  const schools = me.schools.filter((s) => s.can_assign);
  const [school, setSchool] = useState(a?.school_id ?? schools[0]?.id ?? ""); const [sup, setSup] = useState(a?.supervisor_id ?? "");
  const [tch, setTch] = useState<string[]>(a?.teacher_ids ?? []); const [crs, setCrs] = useState<string[]>(a?.course_ids ?? []); const [sub, setSub] = useState<string[]>(a?.subject_ids ?? []);
  const [st, setSt] = useState(toRiyadhInput(a?.starts_at ?? new Date().toISOString())); const [en, setEn] = useState(toRiyadhInput(a?.ends_at)); const [why, setWhy] = useState(a?.reason ?? ""); const [busy, setBusy] = useState(false);
  const pool = useQuery({ queryKey: ["sv-pool", school], enabled: !!school, queryFn: async () => { const r = await db.rpc("sv_pool", { _school: school }); if (r.error) throw r.error; return r.data as Pool; } });
  const started = !!a && a.state === "current";
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const courses = (pool.data?.courses ?? []).filter((c) => c.teacher_ids.some((t) => tch.includes(t)));
  async function save() { setBusy(true); try {
    const r = await db.rpc("sv_asg_save", { _id: a?.id ?? null, _rev: a?.rev ?? null, _p: { school_id: school, supervisor_id: sup, teacher_ids: tch, course_ids: crs.filter((c) => courses.some((x) => x.id === c)), subject_ids: sub, starts_at: started ? a!.starts_at : fromRiyadhInput(st), ends_at: fromRiyadhInput(en), reason: why } });
    if (r.error) throw r.error; toast.success("حُفظ الإسناد"); onDone(true); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  const Box = ({ items, sel, set, label }: { items: Named[]; sel: string[]; set: (v: string[]) => void; label: string }) => <fieldset className="rounded-xl border p-3"><legend className="px-1 text-sm font-medium">{label}</legend>
    {!items.length ? <p className="text-xs text-muted-foreground">لا يوجد</p> : <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">{items.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.includes(t.id)} onChange={() => toggle(sel, set, t.id)} />{t.name}</label>)}</div>}</fieldset>;
  return <div className="space-y-3 rounded-2xl border bg-card p-4">
    <h3 className="font-bold">{a ? "تعديل الإسناد" : "إسناد جديد"}</h3>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">الفرع (فرع واحد)<select className={selectCls("mt-1 w-full")} disabled={!!a} value={school} onChange={(e) => { setSchool(e.target.value); setSup(""); setTch([]); setCrs([]); setSub([]); }}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-sm">المشرف<select className={selectCls("mt-1 w-full")} disabled={!!a} value={sup} onChange={(e) => setSup(e.target.value)}><option value="">— اختر —</option>{(pool.data?.supervisors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        {pool.data && !pool.data.supervisors.length && <span className="mt-1 block text-xs text-muted-foreground">لا يوجد مشرف نشط في هذا الفرع. أضف الدور من «المستخدمون والأدوار».</span>}</label>
      <label className="text-sm">البداية (الرياض)<Input className="mt-1" type="datetime-local" disabled={started} value={st} onChange={(e) => setSt(e.target.value)} />{started && <span className="text-xs text-muted-foreground">لا تتغير بداية إسناد بدأ</span>}</label>
      <label className="text-sm">النهاية (الرياض)<Input className="mt-1" type="datetime-local" value={en} onChange={(e) => setEn(e.target.value)} /></label>
    </div>
    {pool.isLoading ? <LoadingState rows={2} /> : pool.data && <div className="grid gap-3 lg:grid-cols-3">
      <Box label="المعلمون المسندون" items={pool.data.teachers.map((t) => ({ id: t.id, name: t.name + (t.specialization ? ` — ${t.specialization}` : "") }))} sel={tch} set={setTch} />
      <Box label="المقررات (من مقررات المعلمين المختارين)" items={courses} sel={crs} set={setCrs} />
      <Box label="التخصصات أو المواد" items={pool.data.subjects} sel={sub} set={setSub} />
    </div>}
    <label className="block text-sm">سبب الإسناد<Input className="mt-1" value={why} onChange={(e) => setWhy(e.target.value)} /></label>
    <div className="flex gap-2"><Button disabled={busy || !sup || !tch.length || !en || why.trim().length < 3} onClick={save}>حفظ الإسناد</Button><Button variant="ghost" onClick={() => onDone(false)}>إلغاء</Button></div>
  </div>;
}
