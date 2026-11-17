import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Printer } from "lucide-react";
import { db } from "@/components/crud-page";
import { askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { printReport } from "@/lib/export";
import { IMPACT, impactNeedsEvidence, type Visit } from "./work-model";
import { riyadhText, type SvMe } from "./model";
import { ANON_NOTE, ATTEND, NEED_STATUS, PLAN_STATUS, ENROLL, INTERNAL_CERT, MODE, OUTCOME_KIND, OUTCOME_STATE, outcomeLine, PROG_STATUS, validMeetingUrl, verifiedHours, type Feedback, type Outcome, type Program } from "./pd-model";
import { sv4 } from "./pd-api";
import { useUnsaved } from "./use-unsaved";
import type { PdData } from "./pd";

const toIso = (local: string) => (local ? new Date(local + ":00+03:00").toISOString() : "");

export function PdPrograms({ me, d, fd, org }: { me: SvMe; d: PdData; fd: PdData; org: string }) {
  const [open, setOpen] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const canCreate = me.owner || me.schools.some((s) => s.principal) || me.live.length > 0;
  const cur = d.programs.find((p) => p.id === open);
  return <div className="space-y-4">
    {cur ? <ProgramDetail key={cur.id + cur.rev} p={cur} d={d} onBack={() => setOpen(null)} /> : <>
      {canCreate && !creating && <Button onClick={() => setCreating(true)}><Plus />برنامج تطوير</Button>}
      {creating && <ProgramForm me={me} d={d} onDone={() => setCreating(false)} />}
      {!fd.programs.length ? <EmptyState title="لا برامج في هذا النطاق" /> : <ul className="grid gap-3 md:grid-cols-2">{fd.programs.map((p) => <li key={p.id} className="rounded-lg border p-3">
        <div className="flex justify-between gap-2"><b>{p.title}</b><span className="text-xs">{PROG_STATUS[p.status]}</span></div>
        <p className="mt-1 text-sm text-muted-foreground">{p.school} · {MODE[p.mode]} · {p.trainer_name} · {p.sessions.filter((s) => s.status === "scheduled").length} جلسات</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setOpen(p.id)}>فتح البرنامج</Button></li>)}</ul>}
      <Meetings d={d} fd={fd} org={org} />
    </>}
  </div>;
}

function ProgramForm({ me, d, p, onDone }: { me: SvMe; d: PdData; p?: Program; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ school_id: p?.school_id ?? (me.schools.length === 1 ? me.schools[0]!.id : ""), title: p?.title ?? "", objectives: p?.objectives ?? "", audience: p?.audience ?? "", trainer_name: p?.trainer_name ?? "", mode: p?.mode ?? "in_person", location: p?.location ?? "", meeting_url: p?.meeting_url ?? "", need_ids: p?.need_ids ?? [] as string[] });
  const guard = useUnsaved(!!v.title || !!v.objectives); const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { guard.changed(); setV({ ...v, [k]: e.target.value }); };
  const urlBad = v.mode !== "in_person" && v.meeting_url !== "" && !validMeetingUrl(v.meeting_url);
  async function save() { try { await sv4("sv4_program_save", { _id: p?.id ?? null, _rev: p?.rev ?? null, _p: v }, "حُفظ البرنامج"); guard.saved(); void qc.invalidateQueries({ queryKey: ["sv4"] }); onDone(); } catch { /* kept */ } }
  const needs = d.needs.filter((n) => n.school_id === v.school_id && (n.status === "accepted" || n.status === "linked"));
  return <form aria-label="برنامج تطوير" className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    {!p && <select aria-label="فرع البرنامج" className={selectCls()} value={v.school_id} onChange={set("school_id")}><option value="">الفرع</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
    <Input aria-label="عنوان البرنامج" placeholder="العنوان" value={v.title} onChange={set("title")} />
    <textarea aria-label="أهداف البرنامج" className="rounded border p-2 sm:col-span-2" rows={2} placeholder="الأهداف" value={v.objectives} onChange={set("objectives")} />
    <Input aria-label="الفئة المستهدفة" placeholder="الفئة المستهدفة" value={v.audience} onChange={set("audience")} /><Input aria-label="المدرب" placeholder="المدرب" value={v.trainer_name} onChange={set("trainer_name")} />
    <select aria-label="وسيلة الانعقاد" className={selectCls()} value={v.mode} onChange={set("mode")}>{Object.entries(MODE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    {v.mode !== "virtual" && <Input aria-label="المكان" placeholder="المكان" value={v.location} onChange={set("location")} />}
    {v.mode !== "in_person" && <><Input aria-label="رابط الاجتماع" placeholder="رابط https من منصة الاجتماعات المعتمدة" value={v.meeting_url} onChange={set("meeting_url")} />{urlBad && <p role="note" className="text-xs text-destructive">الرابط يجب أن يبدأ بـ https://</p>}</>}
    {needs.length > 0 && <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">الاحتياجات المرتبطة</legend>{needs.map((n) => <label key={n.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.need_ids.includes(n.id)} onChange={(e) => setV({ ...v, need_ids: e.target.checked ? [...v.need_ids, n.id] : v.need_ids.filter((x) => x !== n.id) })} />{n.teacher}: {n.domain}</label>)}</fieldset>}
    <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={urlBad}>حفظ</Button><Button type="button" variant="ghost" onClick={() => void guard.leave(onDone)}>إلغاء</Button></div>
  </form>;
}

function ProgramDetail({ p, d, onBack }: { p: Program; d: PdData; onBack: () => void }) {
  const qc = useQueryClient(); const { user } = useSession(); const refresh = () => qc.invalidateQueries({ queryKey: ["sv4"] });
  const [edit, setEdit] = useState(false); const [ses, setSes] = useState({ start: "", end: "" }); const [nom, setNom] = useState("");
  const call = async (fn: string, args: Record<string, unknown>, msg: string) => { try { await sv4(fn, args, msg); void refresh(); } catch { /* shown */ } };
  async function act(action: "open" | "close" | "cancel") { const text = action === "cancel" ? await askText("سبب إلغاء البرنامج", { required: true }) : null; if (action === "cancel" && !text) return; await call("sv4_program_act", { _id: p.id, _rev: p.rev, _action: action, _text: text }, "حُدّثت حالة البرنامج"); }
  async function enroll(action: string, u: string | null, need = false) { const reason = need ? await askText(action === "excuse" ? "سبب الاعتذار" : "سبب الإلغاء", { required: true }) : null; if (need && !reason) return; await call("sv4_enroll", { _program: p.id, _user: u, _action: action, _reason: reason }, "حُدّث التسجيل"); }
  const mine = p.enrollments.find((e) => e.user_id === user.id); const myHours = verifiedHours(p, user.id); const attended = myHours > 0;
  const teachers = d.teachers.filter((t) => t.school_id === p.school_id && t.user_id && !p.enrollments.some((e) => e.user_id === t.user_id && (e.status === "registered" || e.status === "nominated")));
  function certificate() { printReport({ title: INTERNAL_CERT, filters: [`البرنامج: ${p.title}`, `المشارك: ${mine?.name ?? ""}`], note: "تُحسب الساعات من الجلسات التي سُجل حضورك فيها فقط. هذه إفادة داخلية وليست شهادة معتمدة رسميًا." }, ["الجلسة", "الساعات"], p.sessions.filter((s) => s.status === "scheduled" && mine?.attendance.some((a) => a.session_id === s.id && a.status === "present")).map((s) => [riyadhText(s.starts_at), Number(s.hours)]).concat([["المجموع", myHours]])); }
  return <div className="space-y-3">
    <Button variant="ghost" onClick={onBack}>العودة إلى البرامج</Button>
    <header className="rounded-lg border bg-card p-3"><h2 className="text-lg font-bold">{p.title}</h2><p className="text-sm text-muted-foreground">{p.school} · {PROG_STATUS[p.status]} · {MODE[p.mode]} · المدرب: {p.trainer_name}{p.location ? ` · ${p.location}` : ""}</p>
      <p className="mt-1 text-sm">{p.objectives}</p>{p.audience && <p className="text-xs">الفئة: {p.audience}</p>}{p.cancel_reason && <p className="text-sm text-destructive">سبب الإلغاء: {p.cancel_reason}</p>}
      {p.meeting_url && <a className="mt-1 inline-flex items-center gap-1 text-sm text-primary underline" href={p.meeting_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />رابط الاجتماع</a>}</header>
    {p.can_manage && p.status !== "cancelled" && p.status !== "closed" && <div className="flex flex-wrap gap-2">{p.status === "draft" && <Button onClick={() => void act("open")}>فتح التسجيل</Button>}{p.status === "open" && <Button variant="outline" onClick={() => void act("close")}>إغلاق البرنامج</Button>}<Button variant="outline" onClick={() => setEdit(!edit)}>تعديل البيانات</Button><Button variant="ghost" onClick={() => void act("cancel")}>إلغاء البرنامج</Button></div>}
    {edit && <ProgramForm me={{ owner: false, forms_admin: false, schools: [], live: [], now: "" }} d={d} p={p} onDone={() => setEdit(false)} />}
    {!p.can_manage && <section className="rounded-lg border p-3 text-sm"><p>حالتك: {mine ? ENROLL[mine.status] : "غير مسجل"} · الساعات الموثقة بالحضور: <b>{myHours}</b></p>
      <div className="mt-2 flex flex-wrap gap-2">{p.status === "open" && mine?.status !== "registered" && <Button size="sm" onClick={() => void enroll("register", null)}>التسجيل في البرنامج</Button>}{mine && (mine.status === "registered" || mine.status === "nominated") && <Button size="sm" variant="outline" onClick={() => void enroll("excuse", null, true)}>اعتذار</Button>}{attended && <Button size="sm" variant="outline" onClick={certificate}><Printer />{INTERNAL_CERT}</Button>}</div>
      <p className="mt-1 text-xs text-muted-foreground">التسجيل وحده لا يعني الحضور؛ يُوثّق الحضور لكل جلسة.</p></section>}
    <section aria-label="الجلسات" className="rounded-lg border p-3"><h3 className="mb-2 font-bold">الجلسات</h3>
      <ul className="space-y-1 text-sm">{p.sessions.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-2">{riyadhText(s.starts_at)} — {riyadhText(s.ends_at)} · {s.hours} ساعة · {s.status === "cancelled" ? `ملغاة: ${s.cancel_reason}` : "مجدولة"}{p.can_manage && s.status === "scheduled" && <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب إلغاء الجلسة", { required: true }); if (r) await call("sv4_session_cancel", { _id: s.id, _reason: r }, "أُلغيت الجلسة"); }}>إلغاء الجلسة</Button>}</li>)}</ul>
      {p.can_manage && p.status !== "cancelled" && p.status !== "closed" && <div className="mt-2 flex flex-wrap items-center gap-2"><Input type="datetime-local" aria-label="بداية الجلسة" value={ses.start} onChange={(e) => setSes({ ...ses, start: e.target.value })} className="w-56" /><Input type="datetime-local" aria-label="نهاية الجلسة" value={ses.end} onChange={(e) => setSes({ ...ses, end: e.target.value })} className="w-56" /><Button size="sm" disabled={!ses.start || !ses.end} onClick={async () => { await call("sv4_session_save", { _program: p.id, _id: null, _p: { starts_at: toIso(ses.start), ends_at: toIso(ses.end) } }, "أُضيفت الجلسة"); setSes({ start: "", end: "" }); }}>إضافة جلسة</Button><span className="text-xs text-muted-foreground">بتوقيت الرياض</span></div>}
    </section>
    {p.can_manage && <section aria-label="المشاركون والحضور" className="overflow-x-auto rounded-lg border p-3"><h3 className="mb-2 font-bold">المشاركون والحضور</h3>
      {p.status !== "closed" && p.status !== "cancelled" && <div className="mb-2 flex flex-wrap gap-2"><select aria-label="ترشيح معلم" className={selectCls()} value={nom} onChange={(e) => setNom(e.target.value)}><option value="">ترشيح معلم</option>{teachers.map((t) => <option key={t.id} value={t.user_id!}>{t.name}</option>)}</select><Button size="sm" disabled={!nom} onClick={async () => { await enroll("nominate", nom); setNom(""); }}>ترشيح</Button></div>}
      <table className="w-full text-sm"><thead><tr><th className="text-start">المشارك</th><th className="text-start">الحالة</th>{p.sessions.filter((s) => s.status === "scheduled").map((s, i) => <th key={s.id} className="text-start">ج{i + 1}</th>)}<th className="text-start">الساعات</th><th /></tr></thead>
        <tbody>{p.enrollments.map((e) => <tr key={e.user_id} className="border-t"><td>{e.name}</td><td>{ENROLL[e.status]}</td>
          {p.sessions.filter((s) => s.status === "scheduled").map((s) => { const a = e.attendance.find((x) => x.session_id === s.id); const started = new Date(s.starts_at) <= new Date();
            return <td key={s.id}>{(e.status === "registered" || e.status === "excused") && started ? <select aria-label={`حضور ${e.name} ${riyadhText(s.starts_at)}`} className={selectCls()} value={a?.status ?? ""} onChange={(ev) => void call("sv4_attend", { _session: s.id, _user: e.user_id, _status: ev.target.value }, "سُجل الحضور")}><option value="" disabled>—</option>{Object.entries(ATTEND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <span className="text-xs text-muted-foreground">{started ? "—" : "لم تبدأ"}</span>}</td>; })}
          <td>{verifiedHours(p, e.user_id)}</td><td>{e.status !== "cancelled" && <Button size="sm" variant="ghost" onClick={() => void enroll("cancel", e.user_id, true)}>إلغاء التسجيل</Button>}</td></tr>)}</tbody></table></section>}
    {attended && !p.can_manage && <FeedbackForms p={p} />}
    {p.can_manage && <FeedbackSummary p={p} />}
    <Outcomes p={p} />
  </div>;
}

type FForm = { id: string; title: string; version: number; source: { type: string; note?: string }; spec: { sections: { title: string; fields: { key: string; label: string; type: string; options?: string[]; required?: boolean }[] }[] } } | null;
function FeedbackForms({ p }: { p: Program }) {
  return <section aria-label="التقييم" className="space-y-3 rounded-lg border p-3"><h3 className="font-bold">تقييم البرنامج والمدرب</h3><p className="text-xs text-muted-foreground">{ANON_NOTE}</p>
    {(["program_eval", "trainer_eval"] as const).map((k) => <FeedbackOne key={k} p={p} kind={k} />)}</section>;
}
function FeedbackOne({ p, kind }: { p: Program; kind: "program_eval" | "trainer_eval" }) {
  const qc = useQueryClient(); const done = p.my_feedback.includes(kind); const [a, setA] = useState<Record<string, string>>({}); const [named, setNamed] = useState<"" | "yes" | "no">("");
  const f = useQuery({ queryKey: ["sv4", "fform", p.id, kind], enabled: !done, retry: false, queryFn: async () => { const r = await db.rpc("sv4_feedback_form", { _program: p.id, _kind: kind }); if (r.error) throw r.error; return r.data as FForm; } });
  const label = kind === "program_eval" ? "تقييم البرنامج" : "تقييم المدرب";
  if (done) return <p className="text-sm">{label}: سجّلت تقييمك.</p>;
  if (f.error) return <p className="text-sm text-destructive">{arabicError(f.error)}</p>;
  if (!f.data) return <p className="text-sm text-muted-foreground">{label}: {f.isLoading ? "…" : "لم يعتمد المالك أو مفوضه نموذج التقييم بعد؛ لا يمكن التقييم الآن."}</p>;
  const fields = f.data.spec.sections.flatMap((s) => s.fields).filter((x) => x.key !== "program_ref" && x.key !== "trainer");
  async function save() { try { await sv4("sv4_feedback_save", { _program: p.id, _kind: kind, _named: named === "yes", _answers: a }, "سُجل تقييمك"); void qc.invalidateQueries({ queryKey: ["sv4"] }); } catch { /* kept */ } }
  return <form aria-label={label} className="space-y-2 rounded border p-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    <p className="text-sm font-semibold">{label} — {f.data.title} (إصدار {f.data.version}){f.data.source?.type === "internal" ? " · نموذج داخلي" : ""}</p>
    {fields.map((x) => x.type === "select" ? <label key={x.key} className="block text-sm">{x.label}<select aria-label={x.label} className={selectCls("mt-1 w-full")} value={a[x.key] ?? ""} onChange={(e) => setA({ ...a, [x.key]: e.target.value })}><option value="">— اختر —</option>{x.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
      : <label key={x.key} className="block text-sm">{x.label}<textarea aria-label={x.label} className="mt-1 w-full rounded border p-2" rows={2} value={a[x.key] ?? ""} onChange={(e) => setA({ ...a, [x.key]: e.target.value })} /></label>)}
    <fieldset className="flex flex-wrap gap-3 text-sm"><legend className="font-semibold">هوية الاستجابة</legend><label className="flex items-center gap-1"><input type="radio" name={`named-${kind}`} checked={named === "yes"} onChange={() => setNamed("yes")} />مسماة (يظهر اسمي)</label><label className="flex items-center gap-1"><input type="radio" name={`named-${kind}`} checked={named === "no"} onChange={() => setNamed("no")} />غير مسماة في الملخصات</label></fieldset>
    <Button type="submit" size="sm" disabled={!named}>إرسال التقييم</Button></form>;
}
function FeedbackSummary({ p }: { p: Program }) {
  const q = useQuery({ queryKey: ["sv4", "fsum", p.id], retry: false, queryFn: async () => { const r = await db.rpc("sv4_feedback_summary", { _program: p.id }); if (r.error) throw r.error; return r.data as Feedback[]; } });
  return <section aria-label="ملخص التقييم" className="space-y-2 rounded-lg border p-3"><h3 className="font-bold">ملخص الرضا (منفصل عن الحضور والتعلم والتطبيق والأثر)</h3>
    {q.error && <p className="text-sm text-destructive">{arabicError(q.error)}</p>}
    {(q.data ?? []).map((s) => <div key={s.kind} className="text-sm"><p className="font-semibold">{s.kind === "program_eval" ? "تقييم البرنامج" : "تقييم المدرب"}: {s.adopted ? "" : "النموذج غير معتمد بعد · "}{s.responses} استجابة من {s.attendees} حاضر · لم يستجب {s.no_response}</p>
      {s.named.length > 0 && <p className="text-xs">من اختار الاستجابة المسماة (ترتيب أبجدي، دون ربط بإجاباتهم): {s.named.join("، ")}</p>}
      {s.questions === null ? <p className="text-xs text-muted-foreground">{s.hidden === "open" ? "تُعرض أعداد الإجابات بعد إغلاق البرنامج فقط، حتى لا تكشف المقارنة بين عرضين إجابة من قيّم بينهما." : "أقل من 3 استجابات؛ لا تُعرض التفاصيل حتى لا يُستنتج صاحب الإجابة."}</p>
        : <ul className="text-xs">{s.questions.map((x) => <li key={x.key}>{x.label}: {Object.entries(x.counts).map(([o, n]) => `${o} ${n}`).join(" · ")} · بلا إجابة {x.unanswered}</li>)}</ul>}</div>)}
    <p className="text-xs text-muted-foreground">أعداد فقط: لا متوسطات ولا نسب، والإجابة الغائبة ليست صفرًا.</p></section>;
}

function Outcomes({ p }: { p: Program }) {
  const qc = useQueryClient(); const { user } = useSession(); const [v, setV] = useState({ user: "", kind: "application", due: "", tool: "" });
  const call = async (fn: string, args: Record<string, unknown>, msg: string) => { try { await sv4(fn, args, msg); void qc.invalidateQueries({ queryKey: ["sv4"] }); } catch { /* shown */ } };
  const attendees = p.enrollments.filter((e) => verifiedHours(p, e.user_id) > 0);
  if (!p.outcomes.length && !p.can_manage) return null;
  return <section aria-label="متابعة التعلم والتطبيق والأثر" className="space-y-2 rounded-lg border p-3"><h3 className="font-bold">متابعة التعلم والتطبيق والأثر</h3><p className="text-xs text-muted-foreground">كل نوع منفصل؛ لا يُستنتج التعلم من الرضا ولا الأثر من الحضور، ولا نسبة تحسن دون قياسين متماثلين.</p>
    <ul className="space-y-2 text-sm">{p.outcomes.map((o) => <OutcomeRow key={o.id} o={o} p={p} me={user.id} call={call} />)}</ul>
    {p.can_manage && attendees.length > 0 && <div className="flex flex-wrap items-center gap-2"><select aria-label="مشارك المتابعة" className={selectCls()} value={v.user} onChange={(e) => setV({ ...v, user: e.target.value })}><option value="">المشارك</option>{attendees.map((e) => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}</select>
      <select aria-label="نوع المتابعة" className={selectCls()} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{Object.entries(OUTCOME_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <Input type="date" aria-label="موعد المتابعة" className="w-40" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} />{v.kind === "learning" && <Input aria-label="أداة القياس" placeholder="أداة القياس" value={v.tool} onChange={(e) => setV({ ...v, tool: e.target.value })} />}
      <Button size="sm" disabled={!v.user || !v.due} onClick={() => void call("sv4_outcome_plan", { _program: p.id, _user: v.user, _kind: v.kind, _due: v.due, _tool: v.tool || null }, "حُددت المتابعة")}>تحديد متابعة</Button></div>}
  </section>;
}
function OutcomeRow({ o, p, me, call }: { o: Outcome; p: Program; me: string; call: (fn: string, a: Record<string, unknown>, m: string) => Promise<void> }) {
  const [v, setV] = useState({ evidence: "", pre: "", post: "", impact: "not_measured", note: "" });
  const canSubmit = o.state !== "verified" && ((o.kind === "application" && o.user_id === me) || (o.kind !== "application" && p.can_manage && o.user_id !== me));
  const blocked = o.kind === "impact" ? impactNeedsEvidence(v.impact, v.evidence) : o.kind === "application" ? v.evidence.trim().length < 3 : !v.post.trim();
  return <li className="rounded border p-2" data-outcome={`${o.kind}:${o.state}`}><p><b>{OUTCOME_KIND[o.kind]}</b> · {o.name} · موعد {o.due} · {OUTCOME_STATE[o.state]}{o.verifier ? ` (تحقق ${o.verifier})` : ""}</p><p className="text-xs">{outcomeLine(o)}{o.tool ? ` · الأداة: ${o.tool}` : ""}</p>
    {canSubmit && <div className="mt-1 flex flex-wrap gap-2">
      {o.kind === "learning" && <><Input aria-label="القياس القبلي" placeholder="قبلي (اختياري)" value={v.pre} onChange={(e) => setV({ ...v, pre: e.target.value })} className="w-32" /><Input aria-label="القياس البعدي" placeholder="بعدي" value={v.post} onChange={(e) => setV({ ...v, post: e.target.value })} className="w-32" /></>}
      {o.kind === "impact" && <select aria-label="حالة الأثر" className={selectCls()} value={v.impact} onChange={(e) => setV({ ...v, impact: e.target.value })}>{Object.entries(IMPACT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      {o.kind !== "learning" && <Input aria-label="الشاهد" placeholder={o.kind === "application" ? "شاهد التطبيق في العمل" : "دليل الأثر"} value={v.evidence} onChange={(e) => setV({ ...v, evidence: e.target.value })} />}
      <Button size="sm" disabled={blocked} onClick={() => void call("sv4_outcome_submit", { _id: o.id, _rev: o.rev, _p: v }, "سُجلت المتابعة")}>تقديم</Button></div>}
    {p.can_manage && o.state === "submitted" && o.user_id !== me && <Button size="sm" variant="outline" className="mt-1" onClick={() => void call("sv4_outcome_verify", { _id: o.id, _rev: o.rev, _note: null }, "تم التحقق")}>تحقق</Button>}
  </li>;
}

function Meetings({ d, fd, org }: { d: PdData; fd: PdData; org: string }) {
  const qc = useQueryClient(); const [link, setLink] = useState<{ m: string; kind: string; ref: string }>({ m: "", kind: "plan", ref: "" });
  const visits = useQuery({ queryKey: ["sv3-visits", org], enabled: fd.meetings.length > 0, retry: false, queryFn: async () => { const r = await db.rpc("sv3_visit_list", { _org: org }); if (r.error) throw r.error; return r.data as Visit[]; } });
  const all = [...d.plans.map((p) => ({ kind: "plan", id: p.id, school: p.school_id, name: `خطة ${p.teacher} — إصدار ${p.version} (${PLAN_STATUS[p.status] ?? p.status}) · ${p.id.slice(0, 4)}` })), ...d.needs.map((n) => ({ kind: "need", id: n.id, school: n.school_id, name: `احتياج ${n.teacher}: ${n.domain} (${NEED_STATUS[n.status] ?? n.status}) · ${n.id.slice(0, 4)}` })),
    ...(visits.data ?? []).map((v) => ({ kind: "visit", id: v.id, school: v.school_id, name: `زيارة ${v.teacher} — ${riyadhText(v.starts_at)}` })), ...d.programs.map((g) => ({ kind: "program", id: g.id, school: g.school_id, name: `برنامج ${g.title}` }))];
  const mSchool = fd.meetings.find((m) => m.id === link.m)?.school_id;
  const refs = all.filter((r) => r.kind === link.kind && (!mSchool || r.school === mSchool));
  const nameOf = (k: string, id: string) => all.find((r) => r.kind === k && r.id === id)?.name ?? ({ plan: "خطة", need: "احتياج", visit: "زيارة", program: "برنامج" } as Record<string, string>)[k] + " خارج عرضك";
  async function save() { try { await sv4("sv4_meeting_link", { _meeting: link.m, _kind: link.kind, _ref: link.ref }, "رُبط الاجتماع"); setLink({ ...link, ref: "" }); void qc.invalidateQueries({ queryKey: ["sv4"] }); } catch { /* shown */ } }
  return <section aria-label="الاجتماعات ومجتمعات التعلم" className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">الاجتماعات ومجتمعات التعلم المهني</h3><Link to="/app/admin/meetings" className="text-sm text-primary underline">إنشاء اجتماع ومحضره من قسم الاجتماعات</Link></div>
    <p className="text-xs text-muted-foreground">الاجتماعات والمحاضر والقرارات تُدار في قسم الاجتماعات القائم (مراجعة المحضر واعتماده منفصلان عن اطلاع المشاركين). هنا تُربط بالخطة أو الاحتياج أو البرنامج وتُتابع إجراءاتها حتى الإغلاق.</p>
    {!fd.meetings.length ? <p className="text-sm text-muted-foreground">لا اجتماعات متاحة لك في النطاق.</p> : <ul className="space-y-2 text-sm">{fd.meetings.map((m) => <li key={m.id} className="rounded border p-2"><b>{m.title}</b> · {riyadhText(m.starts_at)} · المحضر: {m.minutes ? (m.minutes.status === "confirmed" ? `معتمد (إصدار ${m.minutes.version})` : "مسودة") : "لا محضر"}
      <ul className="text-xs">{m.tasks.map((t) => <li key={t.id}>إجراء: {t.title} · {t.assignee} · {t.due ?? "—"} · {t.status === "done" ? "مغلق" : "مفتوح"}</li>)}</ul>
      {m.links.length > 0 && <ul aria-label={`روابط ${m.title}`} className="text-xs">{m.links.map((l) => <li key={l.kind + l.ref_id}>مرتبط بـ: {nameOf(l.kind, l.ref_id)}</li>)}</ul>}</li>)}</ul>}
    {fd.meetings.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="الاجتماع" className={selectCls("min-w-0 max-w-full")} value={link.m} onChange={(e) => setLink({ ...link, m: e.target.value })}><option value="">الاجتماع</option>{fd.meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
      <select aria-label="نوع الربط" className={selectCls()} value={link.kind} onChange={(e) => setLink({ ...link, kind: e.target.value, ref: "" })}><option value="plan">خطة</option><option value="need">احتياج</option><option value="visit">زيارة</option><option value="program">برنامج</option></select>
      <select aria-label="العنصر المرتبط" className={selectCls("w-full min-w-0 sm:w-auto sm:max-w-md")} value={link.ref} onChange={(e) => setLink({ ...link, ref: e.target.value })}><option value="">اختر</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><Button size="sm" disabled={!link.m || !link.ref} onClick={() => void save()}>ربط</Button></div>}
  </section>;
}
