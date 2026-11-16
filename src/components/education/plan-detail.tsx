import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Plus, ShieldCheck, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { askText } from "@/components/confirm";
import { EvidenceTab, openEvidenceFile } from "./plan-evidence";
import { arabicError } from "@/lib/session";
import { printReport } from "@/lib/export";
import { schoolTime } from "@/lib/homework";
import { DEFAULT_SHARE, SHARE_LABELS, TEACHER_SOURCES, type Share, type TGoal, EDU_AREAS, EDU_CATEGORIES, EDU_LABELS, EDU_PRIORITY, EVIDENCE_SOURCES, OUTCOMES, PHASES, PLAN_STATUS, baselineText, compareMeasures, goalDone, goalMark, isOverdue, measureText, type EduRecord, type Measure } from "./model";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const EVENT_LABEL: Record<string, string> = { create: "إنشاء الخطة", update: "تعديل الخطة / تغيير الحالة", session: "تسجيل جلسة متابعة", measure: "تسجيل قياس", evidence: "إضافة دليل", evidence_share: "مشاركة دليل مع ولي الأمر", evidence_unshare: "إلغاء مشاركة دليل", home_note: "ملاحظة منزلية من ولي الأمر", self_note: "ملاحظة من المعلم", mark: "تأكيد علامة", unmark: "تراجع موثّق عن علامة", follow: "ملاحظة متابعة", ack: "إقرار اطلاع" };
const goalName = (r: EduRecord, g: number | null) => (g === null || g === undefined ? "الخطة عامة" : `الهدف ${g + 1}: ${r.goals[g] ?? ""}`);

export function PlanDetail({ id, school, schoolName, changed, openWizard }: { id: string; school: string; schoolName?: string | undefined; changed: () => void; openWizard: (r: EduRecord) => void }) {
  const detail = useQuery({ queryKey: ["edu-detail", id], queryFn: () => rpc<EduRecord>("edu_detail", { _id: id }) });
  const [busy, setBusy] = useState(false);
  if (detail.isLoading) return <LoadingState />; if (detail.error) return <ErrorState message={arabicError(detail.error)} />; const r = detail.data; if (!r) return null;
  const refresh = async () => { changed(); await detail.refetch(); };
  if (r.guardian_view) return <GuardianPlan r={r} busy={busy} setBusy={setBusy} refresh={refresh} />;
  const live = r.status === "active" || r.status === "review"; const edit = r.can_edit;
  const fu = r.followups ?? []; const ms = r.measures ?? []; const ss = r.sessions ?? []; const det = r.plan?.goal_details ?? [];
  const actDone = r.goals.filter((_, i) => goalDone(fu, i, "activity")).length; const mastered = r.goals.filter((_, i) => goalDone(fu, i, "mastery")).length;
  async function act(fn: () => Promise<unknown>, ok: string) { setBusy(true); try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  async function mark(i: number, kind: "activity" | "mastery", done: boolean) {
    let note = "";
    if (!done) { const t = await askText(`سبب التراجع عن علامة «${kind === "activity" ? "تنفيذ الأنشطة" : "تحقق الإتقان"}» للهدف ${i + 1}`, { required: true, long: true, ok: "تسجيل التراجع" }); if (t === null) return; note = t; }
    await act(() => rpc("edu_mark", { _id: r!.id, _goal: i, _mark: kind, _done: done, _note: note }), done ? "سُجلت العلامة" : "سُجل التراجع");
  }
  const print = () => printReport({ title: `${EDU_LABELS[r.kind]} — ${r.title}`, school: schoolName, filters: [r.person, r.course ?? ""].filter(Boolean) }, ["البند", "القيمة"],
    ([["الحالة", PLAN_STATUS[r.status] ?? r.status], ["المهارات", (r.plan?.skills ?? []).join("، ")], ["الاحتياج", r.description], ["مستوى البداية", baselineText(r.plan?.baseline)], ["موعد المراجعة", r.due_date ?? ""],
      ...r.goals.flatMap((g, i) => { const c = compareMeasures(ms.filter((m) => m.goal_index === i)); return [[`${i + 1}. ${g}`, `الأنشطة: ${goalDone(fu, i) ? "منفذة" : "قيد التنفيذ"} · الإتقان: ${goalDone(fu, i, "mastery") ? "متحقق" : "غير مؤكد"}`], [`قياس الهدف ${i + 1}`, c.latest ? `${measureText(c.start!)} ← ${measureText(c.latest)}${c.change ? ` (${c.change})` : ""}` : "لا قياس"]]; }),
      ...ss.map((x) => [`جلسة ${x.session_date}`, `${x.activity}${x.achieved ? ` — ${x.achieved}` : ""}`]),
      ["نتيجة الإغلاق", r.plan?.outcome ? `${OUTCOMES[r.plan.outcome]} — ${r.plan.outcome_note ?? ""}` : ""]] as [string, string][]).filter(([, x]) => x));
  return <div className="space-y-4">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-bold">{r.title}</h2><p className="mt-1 text-sm text-muted-foreground">{r.person}{r.course ? ` · ${r.course}` : ""} · <span className="rounded bg-secondary px-1.5">{PLAN_STATUS[r.status] ?? r.status}</span>{isOverdue(r, today()) && r.status !== "draft" && <span className="ms-2 text-destructive">متأخرة عن موعد المراجعة</span>}</p></div>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={print}><Printer className="size-4" />تقرير الخطة</Button>{edit && r.status !== "closed" && <Button variant="outline" size="sm" onClick={() => openWizard(r)}>{r.status === "draft" ? "استكمال الخطة" : "تعديل"}</Button>}</div></div>
    {edit && <PlanStatusBar r={r} school={school} changed={() => void refresh()} />}
    <Tabs defaultValue="summary" dir="rtl"><TabsList className="h-auto w-full flex-wrap justify-start">
      {([["summary", "الملخص"], ["goals", "الأهداف والأنشطة"], ["sessions", `الجلسات والمتابعة (${ss.length})`], ["evidence", `الأدلة (${(r.evidence ?? []).length})`], ["measures", `القياس (${ms.length})`], (r.kind === "teacher_plan" ? ["selfnotes", `ملاحظات المعلم (${(r.self_notes ?? []).length})`] : ["guardian", "مشاركة ولي الأمر"]), ["log", "سجل الإجراءات"]] as [string, string][]).map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList>
      <TabsContent value="summary" className="space-y-3 pt-3">
        <div className="grid gap-2 sm:grid-cols-3"><Stat label="تنفيذ الأنشطة" value={`${actDone} / ${r.goals.length}`} hint="أهداف أُكّد تنفيذ أنشطتها" /><Stat label="تحقق الإتقان" value={`${mastered} / ${r.goals.length}`} hint="مؤكد بقياس — منفصل عن التنفيذ" /><Stat label="آخر متابعة" value={ss.at(-1)?.session_date ?? "—"} hint={`${ss.length} جلسة · ${ms.length} قياس`} /></div>
        {r.kind === "teacher_plan" ? <TeacherFacts r={r} /> : <PlanFacts r={r} />}
        <dl className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">{([["مجال التعثر", EDU_CATEGORIES[r.kind][r.category] ?? r.category], [EDU_AREAS[r.kind].label, EDU_AREAS[r.kind].options[r.area] ?? ""], ["الأولوية", EDU_PRIORITY[r.priority] ?? ""], ["تاريخ الخطة", r.record_date], ["موعد المراجعة", r.due_date ?? ""], ["ترتيبات المتابعة", r.actions]] as [string, string][]).filter(([, x]) => x).map(([k, x]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{x}</dd></div>)}</dl>
      </TabsContent>
      <TabsContent value="goals" className="space-y-3 pt-3">
        {!live && edit && <p className="text-xs text-muted-foreground">علامات التنفيذ والإتقان متاحة عندما تكون الخطة جارية أو بانتظار المراجعة.</p>}
        {r.goals.map((g, i) => { const d = det[i]; const am = goalMark(fu, i, "activity"); const mm = goalMark(fu, i, "mastery"); const hasM = ms.some((m) => m.goal_index === i);
          return <section key={i} className="space-y-2 rounded-lg border p-3" aria-label={`الهدف ${i + 1}`}><p className="font-semibold">{i + 1}. {g}</p>
            {d && <p className="text-xs leading-6 text-muted-foreground">{[d.skill && `المهارة: ${d.skill}`, d.baseline && `البداية: ${d.baseline}`, d.target && `المستهدف: ${d.target}`, d.mastery && `معيار الإتقان: ${d.mastery}`, d.activity && `النشاط: ${d.activity}`, d.strategy && `الاستراتيجية: ${d.strategy}`, d.resources && `الموارد: ${d.resources}`, d.owner && `المسؤول: ${d.owner}`, d.verify && `أداة التحقق: ${d.verify}`, d.start && `من ${d.start}`, d.review && `مراجعة ${d.review}`, d.end && `إلى ${d.end}`].filter(Boolean).join(" · ")}</p>}
            <div className="grid gap-2 sm:grid-cols-2">{(["activity", "mastery"] as const).map((k) => { const m = k === "activity" ? am : mm; const on = m?.completed === true;
              return <div key={k} className={`rounded-md border p-2 text-sm ${on ? "border-primary/50 bg-primary/5" : ""}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 font-medium">{on && <CheckCircle2 className="size-4 text-primary" />}{k === "activity" ? "تنفيذ الأنشطة" : "تحقق الإتقان"}</span>
                {edit && live && (on ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void mark(i, k, false)}><RotateCcw className="size-4" />تراجع</Button> : <Button size="sm" variant="outline" disabled={busy || (k === "mastery" && !hasM)} title={k === "mastery" && !hasM ? "سجّل قياسًا لهذا الهدف أولًا" : undefined} onClick={() => void mark(i, k, true)}>تأكيد</Button>)}</div>
                <p className="mt-1 text-xs text-muted-foreground">{m ? `${on ? "أكّده" : "تراجع"} ${m.actor_name} · ${schoolTime(m.created_at)}${!on ? ` — ${m.note}` : ""}` : k === "mastery" && !hasM ? "يتطلب قياسًا مسجلًا لهذا الهدف" : "لم يُسجل بعد"}</p></div>; })}</div>
          </section>; })}
        <p className="text-xs text-muted-foreground">إنهاء الأنشطة لا يعني تحسن الطالب تلقائيًا؛ الإتقان يُؤكد بقياس.</p>
      </TabsContent>
      <TabsContent value="sessions" className="space-y-3 pt-3">
        {edit && live && <SessionForm r={r} busy={busy} submit={(p) => act(() => rpc("edu_session_add", { _id: r.id, _p: p }), "سُجلت الجلسة")} />}
        {!ss.length ? <p className="text-sm text-muted-foreground">لا توجد جلسات مسجلة بعد.</p> : <ol className="space-y-2">{[...ss].reverse().map((x) => <li key={x.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{x.session_date} · {x.activity}</p><p className="text-xs text-muted-foreground">{goalName(r, x.goal_index)}</p>{x.achieved && <p className="mt-1">ما أُنجز: {x.achieved}</p>}{x.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{x.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{x.actor_name} · {schoolTime(x.created_at)}</p></li>)}</ol>}
      </TabsContent>
      <TabsContent value="evidence" className="space-y-2 pt-3"><p className="text-xs text-muted-foreground">مصادر الاستدلال في التشخيص: {(r.plan?.evidence ?? []).map((e) => EVIDENCE_SOURCES[e] ?? e).join("، ") || "—"}</p><EvidenceTab r={r} canAdd={edit && (live || r.status === "ready")} refresh={refresh} /></TabsContent>
      <TabsContent value="measures" className="space-y-3 pt-3">
        {edit && (live || r.status === "ready") && <MeasureForm r={r} busy={busy} preOnly={r.status === "ready"} submit={(p) => act(() => rpc("edu_measure_add", { _id: r.id, _p: p }), "سُجل القياس")} />}
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{["الهدف", "المستهدف", "البداية", "آخر قياس", "التغير", "العينة"].map((h) => <th key={h} className="whitespace-nowrap p-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>{r.goals.map((g, i) => { const mine = ms.filter((m) => m.goal_index === i); const c = compareMeasures(mine); return <tr key={i} className="border-t"><td className="p-2">{i + 1}. {g}</td><td className="p-2">{det[i]?.target || "—"}</td><td className="whitespace-nowrap p-2">{c.start ? `${measureText(c.start)} · ${PHASES[c.start.phase]}` : "—"}</td><td className="whitespace-nowrap p-2">{c.latest ? `${measureText(c.latest)} · ${c.latest.measured_on}` : "—"}</td><td className="p-2">{c.change ?? <span className="text-xs text-muted-foreground">{c.reason}</span>}</td><td className="p-2">{mine.length} قياس{c.latest?.sample ? ` · ${c.latest.sample} بند` : ""}</td></tr>; })}</tbody></table></div>
        {ms.length > 0 && <ol className="space-y-1 text-sm">{[...ms].reverse().map((m) => <li key={m.id} className="rounded border p-2"><span className="font-medium">{PHASES[m.phase]} · {measureText(m)}</span> — {m.tool} · {goalName(r, m.goal_index)} · {m.measured_on}<span className="block text-xs text-muted-foreground">{m.actor_name}{m.note ? ` — ${m.note}` : ""}</span></li>)}</ol>}
      </TabsContent>
      <TabsContent value="selfnotes" className="space-y-2 pt-3 text-sm"><SelfNotes r={r} busy={busy} act={act} /></TabsContent>
      <TabsContent value="guardian" className="space-y-2 pt-3 text-sm">
        <p>{r.shared ? "الخطة مشتركة مع ولي الأمر الموثّق." : "الخطة غير مشتركة مع ولي الأمر."} الجلسات والقياسات والملاحظات الداخلية لا تظهر له.</p>
        {r.can_ack && <Button variant="outline" disabled={busy || !!r.acks?.length} onClick={() => void act(() => rpc("edu_ack", { _id: r.id, _rev: r.rev }), "سُجل إقرار الاطلاع")}><ClipboardCheck className="size-4" />{r.acks?.length ? "تم إقرار الاطلاع" : "أقر باطلاعي على الخطة"}</Button>}
        {r.shared && <p className="text-xs text-muted-foreground">يظهر له: {(Object.keys(SHARE_LABELS) as (keyof Share)[]).filter((k) => (r.plan?.share ?? DEFAULT_SHARE)[k]).map((k) => SHARE_LABELS[k]).join("، ")} · الأدلة المشتركة: {(r.evidence ?? []).filter((e) => e.shared).length}. يُعدّل ذلك من «تعديل» ← المتابعة والمشاركة.</p>}
        {(r.home_notes ?? []).length > 0 && <div className="space-y-1"><p className="font-medium">ملاحظات ولي الأمر المنزلية</p>{(r.home_notes ?? []).map((h) => <p key={h.id} className="rounded bg-muted/40 p-2">{h.note}<span className="block text-xs text-muted-foreground">{h.name} · {schoolTime(h.created_at)}</span></p>)}</div>}
        {edit && r.shared && <p className="text-xs text-muted-foreground">{r.acks?.length ? r.acks.map((a) => `أقر ${a.name} بالاطلاع — ${schoolTime(a.created_at)}`).join(" · ") : "لم يُقر ولي الأمر بالاطلاع على النسخة الحالية بعد"}</p>}
      </TabsContent>
      <TabsContent value="log" className="pt-3">{!(r.events ?? []).length ? <p className="text-sm text-muted-foreground">لا يوجد سجل.</p> : <ol className="space-y-2 border-s ps-4 text-sm">{(r.events ?? []).map((e, k) => <li key={k}><p>{EVENT_LABEL[e.action] ?? e.action}{typeof e.details?.["status"] === "string" ? ` — ${PLAN_STATUS[e.details["status"] as string] ?? String(e.details["status"])}` : ""}{typeof e.details?.["goal"] === "number" ? ` — الهدف ${Number(e.details["goal"]) + 1}` : ""}</p><p className="text-xs text-muted-foreground">{e.actor_name} · {schoolTime(e.created_at)}</p></li>)}</ol>}</TabsContent>
    </Tabs>
  </div>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) { return <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{hint}</p></div>; }

function SessionForm({ r, busy, submit }: { r: EduRecord; busy: boolean; submit: (p: Record<string, unknown>) => Promise<void> }) {
  const empty = { session_date: today(), goal_index: "", activity: "", achieved: "", note: "" }; const [v, setV] = useState(empty);
  return <form className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await submit({ ...v, goal_index: v.goal_index === "" ? null : Number(v.goal_index) }); setV(empty); }}>
    <div className="space-y-1"><Label htmlFor="ses-date" className="text-xs">التاريخ</Label><Input id="ses-date" type="date" max={today()} value={v.session_date} onChange={(e) => setV({ ...v, session_date: e.target.value })} /></div>
    <div className="space-y-1"><Label htmlFor="ses-goal" className="text-xs">الهدف</Label><select id="ses-goal" className={selectCls("w-full")} value={v.goal_index} onChange={(e) => setV({ ...v, goal_index: e.target.value })}><option value="">الخطة عامة</option>{r.goals.map((g, i) => <option key={i} value={i}>{i + 1}. {g}</option>)}</select></div>
    <div className="space-y-1"><Label htmlFor="ses-act" className="text-xs">النشاط المنفّذ</Label><Input id="ses-act" required minLength={2} maxLength={1000} placeholder="مثال: تدريب موجه على 5 مسائل" value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })} /></div>
    <div className="space-y-1"><Label htmlFor="ses-ach" className="text-xs">ما أُنجز</Label><Input id="ses-ach" maxLength={2000} placeholder="مثال: حل 3 مسائل بمساعدة" value={v.achieved} onChange={(e) => setV({ ...v, achieved: e.target.value })} /></div>
    <div className="space-y-1 sm:col-span-2"><Label htmlFor="ses-note" className="text-xs">ملاحظات</Label><Textarea id="ses-note" rows={2} maxLength={4000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></div>
    <Button className="sm:col-span-2 sm:w-fit" disabled={busy || v.activity.trim().length < 2}><Plus className="size-4" />تسجيل الجلسة</Button>
  </form>;
}

function MeasureForm({ r, busy, preOnly, submit }: { r: EduRecord; busy: boolean; preOnly: boolean; submit: (p: Record<string, unknown>) => Promise<void> }) {
  const empty = { phase: preOnly ? "pre" : "formative", goal_index: r.goals.length ? "0" : "", scale: "count" as Measure["scale"], score: "", total: "", level: "", scale_label: "", tool: "", sample: "", measured_on: today(), note: "" };
  const [v, setV] = useState(empty); const f = (k: keyof typeof v) => ({ value: String(v[k]), onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }) });
  const ok = v.tool.trim().length >= 2 && (v.scale === "count" ? v.score !== "" && v.total !== "" && Number(v.total) > 0 && Number(v.score) <= Number(v.total) && Number(v.score) >= 0 : !!v.level.trim());
  return <form className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); await submit({ ...v, goal_index: v.goal_index === "" ? null : Number(v.goal_index), sample: v.sample || null }); setV({ ...empty, phase: v.phase, goal_index: v.goal_index, tool: v.tool, total: v.total }); }}>
    <div className="space-y-1"><Label htmlFor="ms-phase" className="text-xs">نوع القياس</Label><select id="ms-phase" className={selectCls("w-full")} {...f("phase")}>{Object.entries(PHASES).filter(([k]) => !preOnly || k === "pre").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    <div className="space-y-1"><Label htmlFor="ms-goal" className="text-xs">الهدف</Label><select id="ms-goal" className={selectCls("w-full")} {...f("goal_index")}>{r.goals.map((g, i) => <option key={i} value={i}>{i + 1}. {g.slice(0, 50)}</option>)}</select></div>
    <div className="space-y-1"><Label htmlFor="ms-date" className="text-xs">التاريخ</Label><Input id="ms-date" type="date" max={today()} {...f("measured_on")} /></div>
    <div className="space-y-1"><Label htmlFor="ms-tool" className="text-xs">أداة القياس</Label><Input id="ms-tool" placeholder="مثال: اختبار قصير من 5 مسائل" maxLength={300} {...f("tool")} /></div>
    <div className="space-y-1"><Label htmlFor="ms-scale" className="text-xs">المقياس</Label><select id="ms-scale" className={selectCls("w-full")} {...f("scale")}><option value="count">صحيح من إجمالي</option><option value="scale">سلم تقدير</option></select></div>
    {v.scale === "count" ? <div className="flex items-end gap-2 text-sm"><div className="space-y-1"><Label htmlFor="ms-score" className="text-xs">الصحيح</Label><Input id="ms-score" inputMode="decimal" className="w-20" {...f("score")} /></div><span className="pb-2">من</span><div className="space-y-1"><Label htmlFor="ms-total" className="text-xs">الإجمالي</Label><Input id="ms-total" inputMode="decimal" className="w-20" {...f("total")} /></div></div>
      : <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label htmlFor="ms-level" className="text-xs">المستوى</Label><Input id="ms-level" {...f("level")} /></div><div className="space-y-1"><Label htmlFor="ms-sl" className="text-xs">السلم</Label><Input id="ms-sl" placeholder="1–4" {...f("scale_label")} /></div></div>}
    <div className="space-y-1"><Label htmlFor="ms-sample" className="text-xs">حجم العينة (عدد البنود)</Label><Input id="ms-sample" inputMode="numeric" {...f("sample")} /></div>
    <div className="space-y-1 sm:col-span-2"><Label htmlFor="ms-note" className="text-xs">ملاحظة</Label><Input id="ms-note" maxLength={1000} {...f("note")} /></div>
    <Button className="sm:col-span-3 sm:w-fit" disabled={busy || !ok}><Plus className="size-4" />تسجيل القياس</Button>
    <p className="text-xs text-muted-foreground sm:col-span-3">ربط اختبار أو واجب قائم لا يغيّر درجته. يُحسب التغير فقط عند تطابق المقياس والإجمالي والأداة.</p>
  </form>;
}

const NEXT: Record<string, [string, string] | undefined> = { ready: ["active", "بدء التنفيذ"], active: ["review", "إرسال للمراجعة"], review: ["active", "إعادة للتنفيذ"] };
export function PlanStatusBar({ r, school, changed }: { r: EduRecord; school: string; changed: () => void }) {
  const [busy, setBusy] = useState(false); const [closing, setClosing] = useState(false); const [o, setO] = useState({ outcome: "", outcome_note: "", next_step: "" });
  async function move(status: string, extra: Record<string, string> = {}) {
    setBusy(true);
    try { await rpc("edu_save", { _school: school, _id: r.id, _rev: r.rev, _p: { kind: r.kind, title: r.title, description: r.description, category: r.category, area: r.area, priority: r.priority, record_date: r.record_date, due_date: r.due_date, actions: r.actions, level: r.level, rating: r.rating, shared: r.shared, student_id: r.student_id, teacher_id: r.teacher_id, course_id: r.course_id, goals: r.goals, plan: { ...(r.plan ?? {}), ...extra }, status } }); toast.success(`أصبحت الخطة: ${PLAN_STATUS[status]}`); setClosing(false); changed(); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  if (r.status === "draft" || r.status === "closed") return null; const n = NEXT[r.status];
  return <div className="space-y-3 rounded-lg border p-3"><div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">حالة الخطة:</span><span className="rounded-md bg-secondary px-2 py-0.5 font-medium">{PLAN_STATUS[r.status]}</span><span className="flex-1" />{n && <Button size="sm" variant="outline" disabled={busy} onClick={() => void move(n[0])}>{n[1]}</Button>}{r.status === "review" && <Button size="sm" disabled={busy} onClick={() => setClosing(!closing)}>إغلاق الخطة</Button>}</div>
    {closing && <div className="grid gap-2 sm:grid-cols-3"><select aria-label="نتيجة الخطة" className={selectCls("w-full")} value={o.outcome} onChange={(e) => setO({ ...o, outcome: e.target.value })}><option value="">النتيجة</option>{Object.entries(OUTCOMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Input aria-label="الدليل على النتيجة" placeholder="الدليل، مثال: القياس البعدي 4 من 5" value={o.outcome_note} onChange={(e) => setO({ ...o, outcome_note: e.target.value })} /><Input aria-label="الخطوة التالية" placeholder="الخطوة التالية" value={o.next_step} onChange={(e) => setO({ ...o, next_step: e.target.value })} /><Button className="sm:col-span-3" disabled={busy || !o.outcome || !o.outcome_note.trim()} onClick={() => void move("closed", o)}>تأكيد الإغلاق</Button><p className="text-xs text-muted-foreground sm:col-span-3">إنهاء الأنشطة لا يعني تحقق الإتقان؛ اختر النتيجة حسب القياس الفعلي.</p></div>}</div>;
}
export function PlanFacts({ r }: { r: EduRecord }) {
  const p = r.plan; if (!p) return null; const det = p.goal_details ?? [];
  return <div className="space-y-3">
    <dl className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">{([["المهارات غير المتقنة", (p.skills ?? []).join("، ")], ["الوحدة / الموضوع", p.unit], ["نقاط القوة", p.strengths], ["مصدر الاستدلال", (p.evidence ?? []).map((e) => EVIDENCE_SOURCES[e] ?? e).join("، ")], ["مستوى البداية", baselineText(p.baseline)], ["ملاحظات تربوية", p.notes], ["نتيجة الإغلاق", p.outcome ? `${OUTCOMES[p.outcome] ?? p.outcome} — ${p.outcome_note ?? ""}` : ""], ["الخطوة التالية", p.next_step ?? ""]] as [string, string | undefined][]).filter(([, x]) => x).map(([k, x]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{x}</dd></div>)}</dl>
    {det.length > 0 && <ol className="space-y-2">{r.goals.map((g, i) => { const d = det[i]; return <li key={i} className="rounded-lg bg-muted/40 p-3 text-sm"><p className="font-semibold">{i + 1}. {g}</p>{d && <p className="mt-1 text-xs leading-6 text-muted-foreground">{[d.skill && `المهارة: ${d.skill}`, d.baseline && `البداية: ${d.baseline}`, d.target && `المستهدف: ${d.target}`, d.mastery && `الإتقان: ${d.mastery}`, d.activity && `النشاط: ${d.activity}`, d.strategy && `الاستراتيجية: ${d.strategy}`, d.owner && `المسؤول: ${d.owner}`, d.verify && `التحقق: ${d.verify}`, d.review && `المراجعة: ${d.review}`].filter(Boolean).join(" · ")}</p>}</li>; })}</ol>}
  </div>;
}

function GuardianPlan({ r, busy, setBusy, refresh }: { r: EduRecord; busy: boolean; setBusy: (b: boolean) => void; refresh: () => Promise<void> }) {
  const [note, setNote] = useState(""); const det = r.plan?.goal_details ?? []; const pr = r.progress ?? [];
  async function act(fn: () => Promise<unknown>, ok: string) { setBusy(true); try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <div className="space-y-4">
    <div><h2 className="text-lg font-bold">{r.title}</h2><p className="text-sm text-muted-foreground">{r.person}{r.course ? ` · ${r.course}` : ""} · {PLAN_STATUS[r.status] ?? r.status}{r.due_date ? ` · موعد المراجعة ${r.due_date}` : ""}</p></div>
    {r.description && <section><h3 className="mb-1 text-sm font-semibold">الاحتياج</h3><p className="text-sm leading-7">{r.description}</p>{(r.plan?.skills ?? []).length > 0 && <p className="mt-1 text-xs text-muted-foreground">المهارات: {(r.plan?.skills ?? []).join("، ")}</p>}</section>}
    {r.goals.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">الأهداف</h3>{r.goals.map((g, i) => { const d = det[i]; const p = pr[i]; return <div key={i} className="rounded-lg border p-3 text-sm"><p className="font-medium">{i + 1}. {g}</p><p className="text-xs text-muted-foreground">{[d?.target && `المستهدف: ${d.target}`, d?.start && `من ${d.start}`, d?.review && `مراجعة ${d.review}`, d?.end && `إلى ${d.end}`].filter(Boolean).join(" · ")}</p>{p && <p className="mt-1 text-xs">الأنشطة: {p.activity ? "منفذة" : "قيد التنفيذ"} · الإتقان: {p.mastery ? "متحقق" : "لم يتأكد بعد"}{p.latest ? ` · آخر قياس: ${p.latest}` : ""}</p>}</div>; })}</section>}
    {r.plan?.home_activities && <section><h3 className="mb-1 text-sm font-semibold">الأنشطة المنزلية</h3><p className="whitespace-pre-wrap text-sm leading-7">{r.plan.home_activities}</p></section>}
    {(r.evidence ?? []).length > 0 && <section className="space-y-1"><h3 className="text-sm font-semibold">مرفقات مشتركة</h3>{(r.evidence ?? []).map((e) => <div key={e.id} className="flex flex-wrap items-center gap-2 text-sm"><span>{e.title}</span>{e.files.map((f, i) => <Button key={f.id} size="sm" variant="outline" onClick={() => void openEvidenceFile(f.path, f.name)}>صفحة {i + 1}</Button>)}</div>)}</section>}
    {r.can_ack && <div className="space-y-1 border-t pt-3"><Button variant="outline" disabled={busy || !!r.acks?.length} onClick={() => void act(() => rpc("edu_ack", { _id: r.id, _rev: r.rev }), "سُجل إقرار الاطلاع")}><ClipboardCheck className="size-4" />{r.acks?.length ? `تم إقرار الاطلاع — ${schoolTime(r.acks[0]!.created_at)}` : "أقر باطلاعي على الخطة"}</Button><p className="text-xs text-muted-foreground">الإقرار يعني الاطلاع فقط، وليس موافقة علاجية أو إثبات إنجاز.</p></div>}
    {(r.can_home_note || (r.home_notes ?? []).length > 0) && <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">ملاحظات المتابعة المنزلية</h3>{(r.home_notes ?? []).map((h) => <p key={h.id} className="rounded bg-muted/40 p-2 text-sm">{h.note}<span className="block text-xs text-muted-foreground">{schoolTime(h.created_at)}</span></p>)}
      {r.can_home_note && <><Textarea aria-label="ملاحظة المتابعة المنزلية" maxLength={2000} placeholder="مثال: حل المسائل المنزلية ثلاثة أيام هذا الأسبوع" value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" variant="outline" disabled={busy || note.trim().length < 2} onClick={() => void act(async () => { await rpc("edu_home_note", { _id: r.id, _note: note }); setNote(""); }, "أُرسلت الملاحظة")}><Plus className="size-4" />إضافة ملاحظة</Button></>}</section>}
  </div>;
}

function TeacherFacts({ r }: { r: EduRecord }) {
  const p = r.plan ?? ({} as NonNullable<EduRecord["plan"]>); const det = (p.goal_details ?? []) as unknown as Partial<TGoal>[];
  return <div className="space-y-3"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" />خطة دعم مهني سرية؛ ليست جزاءً ولا تقييمًا وظيفيًا.</p>
    <dl className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">{([["مصدر الاحتياج", TEACHER_SOURCES[p.source ?? ""] ?? ""], ["الزيارة المرتبطة", r.visit ? (r.visit.visible ? `${r.visit.record_date} · ${r.visit.title}` : "زيارة مرتبطة غير متاحة لك") : ""], ["نقاط القوة", (p as { strengths?: string }).strengths ?? ""], ["فرصة التحسين", p.opportunity ?? ""], ["نتيجة الإغلاق", p.outcome ? `${OUTCOMES[p.outcome] ?? p.outcome} — ${p.outcome_note ?? ""}` : ""]] as [string, string][]).filter(([, x]) => x).map(([k, x]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="whitespace-pre-wrap">{x}</dd></div>)}</dl>
    {r.goals.length > 0 && <ol className="space-y-2">{r.goals.map((g, i) => { const d = det[i]; return <li key={i} className="rounded-lg bg-muted/40 p-3 text-sm"><p className="font-semibold">{i + 1}. {g}</p>{d && <p className="mt-1 text-xs leading-6 text-muted-foreground">{[d.indicator && `المؤشر: ${d.indicator}`, d.support && `الدعم: ${d.support}`, d.owner && `المسؤول: ${d.owner}`, d.evidence && `الشواهد: ${d.evidence}`, d.impact && `قياس الأثر: ${d.impact}`, d.feedback && `التغذية الراجعة: ${d.feedback}`, d.review && `المراجعة: ${d.review}`].filter(Boolean).join(" · ")}</p>}</li>; })}</ol>}</div>;
}
function SelfNotes({ r, busy, act }: { r: EduRecord; busy: boolean; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [note, setNote] = useState(""); const [goal, setGoal] = useState("");
  return <>{!(r.self_notes ?? []).length ? <p className="text-muted-foreground">لا توجد ملاحظات من المعلم بعد.</p> : (r.self_notes ?? []).map((n) => <p key={n.id} className="rounded bg-muted/40 p-2">{n.goal_index !== null ? `الهدف ${n.goal_index + 1}: ` : ""}{n.note}<span className="block text-xs text-muted-foreground">{n.name} · {schoolTime(n.created_at)}</span></p>)}
    {r.can_self_note && <div className="space-y-2"><select aria-label="الهدف" className={selectCls("w-full sm:w-72")} value={goal} onChange={(e) => setGoal(e.target.value)}><option value="">الخطة عامة</option>{r.goals.map((g, i) => <option key={i} value={i}>{i + 1}. {g.slice(0, 50)}</option>)}</select><Textarea aria-label="ملاحظة المعلم" maxLength={3000} placeholder="ما نفّذته، وما تحتاجه من دعم" value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" variant="outline" disabled={busy || note.trim().length < 2} onClick={() => void act(async () => { await rpc("edu_self_note", { _id: r.id, _goal: goal === "" ? null : Number(goal), _note: note }); setNote(""); }, "أُضيفت الملاحظة")}><Plus className="size-4" />إضافة ملاحظتي</Button></div>}</>;
}
