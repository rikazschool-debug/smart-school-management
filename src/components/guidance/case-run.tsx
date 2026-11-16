import { useEffect, useState } from "react";
import { CalendarPlus, Camera, CheckCircle2, Eye, FileText, Paperclip, RotateCw, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { openEvidenceFile, rotated, type Page } from "@/components/education/plan-evidence";
import type { EduRecord, Evidence, Follow, Session } from "@/components/education/model";
import { DOC_TYPE, PROGRESS, SESSION_MODE, SESSION_STATUS, followIssues, sessionIssues } from "./case-model";

export type CaseSession = Session & { status: string; mode: string; group_id: string | null; topic: string; start_time: string | null; place: string; next_step: string; reason: string };
export type CaseShare = { id: string; summary: string; recommendations: string; status: string; withdraw_reason: string; created_at: string; withdrawn_at: string | null; by: string; reads: { name: string; read_at: string }[] };
export type CaseRow = EduRecord & { ref_no?: string; school_id: string; shares?: CaseShare[] };
type Ev = Evidence & { doc_type?: string };
const BUCKET = "rikaz-files"; const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
export const schoolToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const when = (t: string) => new Date(t).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" });
export const StatusChip = ({ s }: { s: string }) => <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${s === "planned" ? "bg-primary/10 text-primary" : s === "done" ? "bg-secondary" : "bg-muted text-muted-foreground"}`}>{SESSION_STATUS[s] ?? s}</span>;

/** Records the outcome of a planned appointment (done / missed / cancelled). Shared by the case page and the agenda. */
export function RecordSession({ s, done }: { s: { id: string; activity: string; session_date: string; group_id: string | null }; done: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ activity: s.activity, achieved: "", note: "", next_step: "", session_date: s.session_date > schoolToday() ? schoolToday() : s.session_date });
  async function send(p: Record<string, unknown>) { setBusy(true); try { await rpc("edu_case_session_record", { _sid: s.id, _p: p }); toast.success("سُجلت نتيجة الموعد"); setOpen(false); await done(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  async function other(status: "missed" | "cancelled") { const reason = await askText(status === "missed" ? "سبب عدم الحضور" : "سبب إلغاء الموعد", { required: true }); if (!reason) return; await send({ status, reason, whole_group: status === "cancelled" && !!s.group_id }); }
  const future = s.session_date > schoolToday();
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || future} title={future ? "يُسجل التنفيذ في يوم الموعد أو بعده" : undefined} onClick={() => setOpen(!open)}><CheckCircle2 className="size-4" />تسجيل التنفيذ</Button><Button size="sm" variant="outline" disabled={busy || future} onClick={() => void other("missed")}>لم يحضر</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void other("cancelled")}>{s.group_id ? "إلغاء الجلسة الجماعية" : "إلغاء الموعد"}</Button></div>
    {open && <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`rd-${s.id}`} className="text-xs">تاريخ التنفيذ</Label><Input id={`rd-${s.id}`} type="date" max={schoolToday()} value={v.session_date} onChange={(e) => setV({ ...v, session_date: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`ra-${s.id}`} className="text-xs">ما نُفّذ في الجلسة</Label><Input id={`ra-${s.id}`} maxLength={1000} value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`rs-${s.id}`} className="text-xs">استجابة الطالب (وقائع)</Label><Textarea id={`rs-${s.id}`} rows={2} maxLength={2000} value={v.achieved} onChange={(e) => setV({ ...v, achieved: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`rn-${s.id}`} className="text-xs">ملاحظات الموجّه (سرية)</Label><Textarea id={`rn-${s.id}`} rows={2} maxLength={4000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor={`rx-${s.id}`} className="text-xs">الخطوة التالية</Label><Input id={`rx-${s.id}`} maxLength={1000} value={v.next_step} onChange={(e) => setV({ ...v, next_step: e.target.value })} /></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">تنفيذ الجلسة لا يعني تحسّن الطالب؛ سجّل التقدم من «المتابعات» بدليل على مؤشر التحقق.</p>
      <Button className="sm:col-span-2 sm:w-fit" disabled={busy || v.activity.trim().length < 2} onClick={() => void send({ status: "done", ...v })}>حفظ التنفيذ</Button>
    </div>}
  </div>;
}

export function CaseSessions({ r, refresh }: { r: CaseRow; refresh: () => Promise<void> }) {
  const ss = (r.sessions ?? []) as CaseSession[]; const active = ["open", "following"].includes(r.status) && r.can_edit;
  const [v, setV] = useState({ status: "planned", session_date: "", start_time: "", place: "", activity: "", goal_index: "", achieved: "", note: "", next_step: "" }); const [busy, setBusy] = useState(false);
  const issues = sessionIssues({ mode: "individual", caseCount: 1, status: v.status, date: v.session_date, topic: "", activity: v.activity }, schoolToday());
  async function save() { setBusy(true); try { await rpc("edu_case_session_save", { _p: { ...v, mode: "individual", case_ids: [r.id] } }); toast.success(v.status === "planned" ? "حُجز الموعد" : "سُجلت الجلسة"); setV({ ...v, session_date: "", start_time: "", activity: "", achieved: "", note: "", next_step: "" }); await refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <div className="space-y-4">
    {active ? <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع الإضافة">{[["planned", "حجز موعد جلسة"], ["done", "تسجيل جلسة منفذة"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={v.status === k} onClick={() => setV({ ...v, status: k! })} className={`rounded-full border px-3 py-1.5 text-sm ${v.status === k ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{l}</button>)}</div>
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="cs-d" className="text-xs">التاريخ</Label><Input id="cs-d" type="date" {...(v.status === "planned" ? { min: schoolToday() } : { max: schoolToday() })} value={v.session_date} onChange={(e) => setV({ ...v, session_date: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="cs-t" className="text-xs">الوقت (اختياري)</Label><Input id="cs-t" type="time" value={v.start_time} onChange={(e) => setV({ ...v, start_time: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="cs-p" className="text-xs">المكان</Label><Input id="cs-p" maxLength={200} placeholder="مكتب التوجيه" value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="cs-g" className="text-xs">الهدف</Label><select id="cs-g" className={selectCls("w-full")} value={v.goal_index} onChange={(e) => setV({ ...v, goal_index: e.target.value })}><option value="">الحالة عامة</option>{r.goals.map((g, i) => <option key={i} value={i}>{i + 1}. {g.slice(0, 40)}</option>)}</select></div>
      </div>
      <div className="space-y-1"><Label htmlFor="cs-a" className="text-xs">{v.status === "planned" ? "هدف الجلسة" : "ما نُفّذ في الجلسة"}</Label><Input id="cs-a" maxLength={1000} value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })} /></div>
      {v.status === "done" && <div className="grid gap-2 sm:grid-cols-3"><Textarea aria-label="استجابة الطالب" placeholder="استجابة الطالب (وقائع)" rows={2} maxLength={2000} value={v.achieved} onChange={(e) => setV({ ...v, achieved: e.target.value })} /><Textarea aria-label="ملاحظات الموجّه" placeholder="ملاحظات الموجّه (سرية)" rows={2} maxLength={4000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /><Textarea aria-label="الخطوة التالية" placeholder="الخطوة التالية" rows={2} maxLength={1000} value={v.next_step} onChange={(e) => setV({ ...v, next_step: e.target.value })} /></div>}
      {v.session_date && issues.length > 0 && <ul className="list-disc ps-5 text-xs text-destructive">{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
      <Button disabled={busy || issues.length > 0} onClick={() => void save()}><CalendarPlus className="size-4" />{v.status === "planned" ? "حجز الموعد" : "حفظ الجلسة"}</Button>
      <p className="text-xs text-muted-foreground">الجلسات الجماعية تُنشأ من تبويب «الجلسات والمتابعات» لأنها تجمع أكثر من حالة.</p>
    </div> : <p className="text-sm text-muted-foreground">{r.status === "draft" ? "اعتمد الحالة أولًا لتسجيل الجلسات." : r.status === "closed" ? "الحالة مغلقة؛ أعد فتحها لإضافة جلسة." : ""}</p>}
    {!ss.length ? <p className="text-sm text-muted-foreground">لا توجد جلسات أو مواعيد بعد.</p> : <ul className="space-y-2">{[...ss].reverse().map((s) => <li key={s.id} className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><div className="min-w-0"><p className="font-medium">{s.mode === "group" ? `جلسة جماعية: ${s.topic}` : s.activity}</p><p className="text-xs text-muted-foreground">{SESSION_MODE[s.mode]} · {s.session_date}{s.start_time ? ` · ${s.start_time.slice(0, 5)}` : ""}{s.place ? ` · ${s.place}` : ""}{s.goal_index !== null ? ` · الهدف ${s.goal_index + 1}` : ""} · {s.actor_name}</p></div><StatusChip s={s.status} /></div>
      {s.mode === "group" && <p className="text-xs text-muted-foreground">النشاط: {s.activity}</p>}
      {s.status === "done" && (s.achieved || s.note || s.next_step) && <dl className="grid gap-1 text-xs sm:grid-cols-3">{s.achieved && <div><dt className="text-muted-foreground">استجابة الطالب</dt><dd className="whitespace-pre-wrap">{s.achieved}</dd></div>}{s.note && <div><dt className="text-muted-foreground">ملاحظات سرية</dt><dd className="whitespace-pre-wrap">{s.note}</dd></div>}{s.next_step && <div><dt className="text-muted-foreground">الخطوة التالية</dt><dd>{s.next_step}</dd></div>}</dl>}
      {s.reason && <p className="text-xs text-muted-foreground">السبب: {s.reason}</p>}
      {s.status === "planned" && active && <RecordSession s={s} done={refresh} />}
    </li>)}</ul>}
  </div>;
}

export function CaseFollow({ r, refresh }: { r: CaseRow; refresh: () => Promise<void> }) {
  const fs = (r.followups ?? []) as (Follow & { progress?: string | null })[]; const active = ["open", "following"].includes(r.status) && r.can_edit;
  const [v, setV] = useState({ goal: r.goals.length ? "0" : "", progress: "in_progress", note: "" }); const [busy, setBusy] = useState(false);
  const issues = followIssues(v); const upcoming = ((r.sessions ?? []) as CaseSession[]).filter((s) => s.status === "planned");
  async function save() { setBusy(true); try { await rpc("edu_case_follow", { _id: r.id, _rev: r.rev, _p: { goal_index: v.goal === "" ? null : Number(v.goal), progress: v.goal === "" ? null : v.progress, note: v.note } }); toast.success("سُجلت المتابعة"); setV({ ...v, note: "" }); await refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded-lg border p-3"><h4 className="mb-2 text-sm font-semibold">تقدّم الأهداف</h4>{!r.goals.length ? <p className="text-sm text-muted-foreground">لا توجد أهداف.</p> : <ol className="space-y-1.5 text-sm">{r.goals.map((g, i) => { const last = fs.filter((f) => f.goal_index === i).at(-1); return <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><span className="min-w-0 truncate">{i + 1}. {g}</span><span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{last?.progress ? PROGRESS[last.progress] : "لم تُسجل متابعة"}</span></li>; })}</ol>}<p className="mt-2 text-xs text-muted-foreground">يُحسب التقدم من آخر متابعة مسجلة لكل هدف، لا من عدد الجلسات.</p></section>
      <section className="rounded-lg border p-3"><h4 className="mb-2 text-sm font-semibold">المواعيد القادمة</h4>{!upcoming.length && !r.due_date ? <p className="text-sm text-muted-foreground">لا توجد مواعيد.</p> : <ul className="space-y-1 text-sm">{r.due_date && <li>مراجعة الحالة · {r.due_date}</li>}{upcoming.map((s) => <li key={s.id}>{s.mode === "group" ? `جلسة جماعية: ${s.topic}` : s.activity} · {s.session_date}{s.start_time ? ` ${s.start_time.slice(0, 5)}` : ""}</li>)}</ul>}</section>
    </div>
    {active && <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="cf-g" className="text-xs">الهدف</Label><select id="cf-g" className={selectCls("w-full")} value={v.goal} onChange={(e) => setV({ ...v, goal: e.target.value })}><option value="">ملاحظة عامة على الحالة</option>{r.goals.map((g, i) => <option key={i} value={i}>{i + 1}. {g.slice(0, 50)}</option>)}</select></div>
        {v.goal !== "" && <div className="space-y-1"><Label htmlFor="cf-p" className="text-xs">مستوى التقدم</Label><select id="cf-p" className={selectCls("w-full")} value={v.progress} onChange={(e) => setV({ ...v, progress: e.target.value })}>{Object.entries(PROGRESS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
      </div>
      <div className="space-y-1"><Label htmlFor="cf-n" className="text-xs">{v.goal !== "" && v.progress === "achieved" ? "دليل تحقق المؤشر" : "ملاحظة المتابعة"}</Label><Textarea id="cf-n" rows={3} maxLength={4000} placeholder={v.goal !== "" ? `مؤشر التحقق: ${(r.plan as { goal_details?: { indicator?: string }[] } | undefined)?.goal_details?.[Number(v.goal)]?.indicator ?? "—"}` : ""} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></div>
      {v.note && issues.length > 0 && <ul className="list-disc ps-5 text-xs text-destructive">{issues.map((x) => <li key={x}>{x}</li>)}</ul>}
      <Button disabled={busy || issues.length > 0} onClick={() => void save()}>حفظ المتابعة</Button>
    </div>}
    {!fs.length ? <p className="text-sm text-muted-foreground">لا توجد متابعات بعد.</p> : <ol className="space-y-2 border-s ps-4 text-sm">{[...fs].reverse().map((f) => <li key={f.id}><p>{f.goal_index !== null ? `الهدف ${f.goal_index + 1}` : "عام"}{f.progress ? ` · ${PROGRESS[f.progress]}` : ""}</p><p className="whitespace-pre-wrap text-muted-foreground">{f.note}</p><p className="text-xs text-muted-foreground">{f.actor_name} · {when(f.created_at)}</p></li>)}</ol>}
  </div>;
}

/** Private attachments: photos (camera), images and PDF; no OCR or AI. Server: edu_case_attach. */
export function CaseFiles({ r, canAdd, refresh, sessions = true }: { r: { id: string; evidence?: Ev[] | undefined; sessions?: Session[] | undefined }; canAdd: boolean; refresh: () => Promise<void>; sessions?: boolean }) {
  const ev = (r.evidence ?? []) as Ev[]; const [busy, setBusy] = useState(false); const [pages, setPages] = useState<Page[]>([]);
  const [v, setV] = useState({ title: "", doc_type: "observation", note: "", session_id: "" });
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);
  function add(files: FileList | null) { const ok = [...(files ?? [])].filter((f) => TYPES.includes(f.type)); if ((files?.length ?? 0) > ok.length) toast.error("يُقبل الصور وملفات PDF فقط"); setPages((ps) => [...ps, ...ok.map((file) => ({ key: crypto.randomUUID(), file, rot: 0, url: URL.createObjectURL(file) }))].slice(0, 20)); }
  async function save() {
    setBusy(true);
    try {
      const prepared = await Promise.all(pages.map(rotated));
      const res = await rpc<{ files: { path: string }[] }>("edu_case_attach", { _id: r.id, _p: { ...v, session_id: v.session_id || null, files: prepared.map((x) => ({ name: x.name, mime: x.mime, size: x.blob.size })) } });
      let failed = 0; for (const [i, f] of res.files.entries()) { const up = await db.storage.from(BUCKET).upload(f.path, prepared[i]!.blob, { contentType: prepared[i]!.mime }); if (up.error) failed++; }
      if (failed) toast.error(`تعذر رفع ${failed} صفحة؛ أضف المرفق مرة أخرى`); else toast.success("أُضيف المرفق");
      setPages([]); setV({ ...v, title: "", note: "" }); await refresh();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return <div className="space-y-3">
    {canAdd && <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor={`fa-t-${r.id}`} className="text-xs">عنوان المرفق</Label><Input id={`fa-t-${r.id}`} maxLength={200} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor={`fa-k-${r.id}`} className="text-xs">نوع المستند</Label><select id={`fa-k-${r.id}`} className={selectCls("w-full")} value={v.doc_type} onChange={(e) => setV({ ...v, doc_type: e.target.value })}>{Object.entries(DOC_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {sessions && <div className="space-y-1"><Label htmlFor={`fa-s-${r.id}`} className="text-xs">الجلسة (اختياري)</Label><select id={`fa-s-${r.id}`} className={selectCls("w-full")} value={v.session_id} onChange={(e) => setV({ ...v, session_id: e.target.value })}><option value="">بدون جلسة</option>{((r.sessions ?? []) as CaseSession[]).filter((s) => s.status === "done").map((s) => <option key={s.id} value={s.id}>{s.session_date} · {s.activity.slice(0, 40)}</option>)}</select></div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"><Camera className="size-4" />تصوير بالكاميرا<input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="تصوير مستند بالكاميرا" onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"><Paperclip className="size-4" />اختيار صور أو PDF<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" aria-label="اختيار صور أو PDF" onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
      </div>
      {pages.length > 0 && <ol className="grid gap-2 sm:grid-cols-4" aria-label="صفحات المرفق">{pages.map((p, i) => <li key={p.key} className="space-y-1 rounded-md border bg-background p-2"><div className="flex h-28 items-center justify-center overflow-hidden rounded bg-muted">{p.file.type.startsWith("image/") ? <img src={p.url} alt={`صفحة ${i + 1}`} className="max-h-28 max-w-full object-contain" style={{ transform: `rotate(${p.rot}deg)` }} /> : <FileText className="size-8 text-muted-foreground" />}</div><p className="truncate text-xs">{i + 1}. {p.file.name}</p><div className="flex justify-between"><Button type="button" size="icon" variant="ghost" aria-label={`تدوير الصفحة ${i + 1}`} disabled={!p.file.type.startsWith("image/")} onClick={() => setPages(pages.map((x) => (x.key === p.key ? { ...x, rot: x.rot + 90 } : x)))}><RotateCw className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`حذف الصفحة ${i + 1}`} onClick={() => setPages(pages.filter((x) => x.key !== p.key))}><Trash2 className="size-4" /></Button></div></li>)}</ol>}
      <Input aria-label="ملاحظة على المرفق" placeholder="ملاحظة (اختياري)" maxLength={2000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <Button disabled={busy || v.title.trim().length < 2 || !pages.length} onClick={() => void save()}>{busy ? "جارٍ الرفع…" : "حفظ المرفق"}</Button>
      <p className="text-xs text-muted-foreground">تُحفظ الملفات في تخزين خاص ولا تُفتح إلا لمن يملك الصلاحية عبر رابط مؤقت. لا يُقرأ محتواها آليًا.</p>
    </div>}
    {!ev.length ? <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p> : <ul className="space-y-2">{[...ev].reverse().map((e) => <li key={e.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{e.title}{e.doc_type ? <span className="ms-2 text-xs text-muted-foreground">· {DOC_TYPE[e.doc_type] ?? ""}</span> : null}</p><p className="text-xs text-muted-foreground">{e.actor_name} · {when(e.created_at)}</p>{e.note && <p className="text-xs">{e.note}</p>}<div className="mt-2 flex flex-wrap gap-2">{e.files.map((f, i) => <Button key={f.id} size="sm" variant="outline" onClick={() => void openEvidenceFile(f.path, f.name)}><Eye className="size-4" />{e.files.length > 1 ? `صفحة ${i + 1}` : f.name}</Button>)}</div></li>)}</ul>}
  </div>;
}

/** Guardian sharing: only the summary text the counselor writes here; the case itself never opens to the family. */
export function CaseShares({ r, refresh }: { r: CaseRow; refresh: () => Promise<void> }) {
  const sh = r.shares ?? []; const can = r.can_edit && r.status !== "draft";
  const [v, setV] = useState({ summary: "", recommendations: "", confirm: false }); const [busy, setBusy] = useState(false);
  async function share() { setBusy(true); try { await rpc("edu_case_share", { _id: r.id, _p: v }); toast.success("شوركت الرسالة مع ولي الأمر"); setV({ summary: "", recommendations: "", confirm: false }); await refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  async function withdraw(id: string) { const why = await askText("سبب سحب الرسالة من ولي الأمر", { required: true }); if (!why) return; try { await rpc("edu_case_share_withdraw", { _share: id, _reason: why }); toast.success("سُحبت الرسالة"); await refresh(); } catch (e) { toast.error(arabicError(e)); } }
  return <div className="space-y-3">
    <h4 className="text-sm font-semibold">التواصل مع ولي الأمر</h4>
    {can ? <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">يرى ولي الأمر هذا النص فقط، ولا يرى الحالة أو التصنيف أو الملاحظات أو المرفقات. اكتب بلغة داعمة غير وصمية.</p>
      <div className="space-y-1"><Label htmlFor="sh-s" className="text-xs">الملخص المشترك</Label><Textarea id="sh-s" rows={3} maxLength={1500} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="sh-r" className="text-xs">توصيات للأسرة (اختياري)</Label><Textarea id="sh-r" rows={2} maxLength={1500} value={v.recommendations} onChange={(e) => setV({ ...v, recommendations: e.target.value })} /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.checked })} />أؤكد أن النص لا يتضمن ملاحظات سرية أو تقارير تخصصية أو معلومات عن طلاب آخرين.</label>
      <Button disabled={busy || v.summary.trim().length < 20 || !v.confirm} onClick={() => void share()}><Send className="size-4" />مشاركة مع ولي الأمر</Button>
      {v.summary && v.summary.trim().length < 20 && <p className="text-xs text-destructive">الملخص 20 حرفًا على الأقل.</p>}
    </div> : r.status === "draft" ? <p className="text-sm text-muted-foreground">اعتمد الحالة قبل التواصل مع ولي الأمر.</p> : null}
    {!sh.length ? <p className="text-sm text-muted-foreground">لم يُشارك شيء مع ولي الأمر.</p> : <ul className="space-y-2">{sh.map((s) => <li key={s.id} className={`rounded-lg border p-3 text-sm ${s.status === "withdrawn" ? "opacity-70" : ""}`}><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><p className="min-w-0 whitespace-pre-wrap">{s.summary}</p><span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{s.status === "shared" ? "مشترك" : "مسحوب"}</span></div>{s.recommendations && <p className="mt-1 text-xs">التوصيات: {s.recommendations}</p>}<p className="mt-1 text-xs text-muted-foreground">{s.by} · {when(s.created_at)} · {s.reads.length ? `اطّلع: ${s.reads.map((x) => x.name).join("، ")}` : "لم يُطّلع عليه بعد"}</p>{s.status === "withdrawn" && <p className="text-xs text-muted-foreground">سُحب: {s.withdraw_reason}</p>}{s.status === "shared" && r.can_edit && <Button className="mt-2" size="sm" variant="ghost" onClick={() => void withdraw(s.id)}><Undo2 className="size-4" />سحب الرسالة</Button>}</li>)}</ul>}
  </div>;
}
