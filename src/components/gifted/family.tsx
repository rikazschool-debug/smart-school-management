import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, ListChecks, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { ACT_TYPES, consentOpen, familyNoteIssues, GOAL_STATUS, GT_DOMAINS, NOTE_STATUS, PART_LABELS, PLAN_STATUS, PROG_STATUS, WORK_KIND, WORK_LEVEL, type FamilyFile } from "./model";

const L = <K extends keyof typeof PART_LABELS>(k: K, v: string) => (PART_LABELS[k] as Record<string, string>)[v] ?? v;

/** Student / verified guardian view of one child's gifted care (gt_family checks the link on the server; no measures, internal notes or other students). */
export function FamilyGifted({ studentId }: { studentId: string }) {
  const q = useQuery({ queryKey: ["gt-family", studentId], queryFn: async () => { const r = await db.rpc("gt_family", { _student: studentId }); if (r.error) throw r.error; return r.data as FamilyFile; }, retry: false });
  const [kind, setKind] = useState("note"); const [body, setBody] = useState(""); const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [tried, setTried] = useState(false);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!; const guardian = d.viewer === "guardian";
  const empty = !d.domains.length && !d.plans.length && !d.programs.length && !d.works.length;
  async function consent(pid: string, dec: "granted" | "refused" | "ack") {
    if (dec !== "ack" && !(await ask(dec === "granted" ? "تأكيد الموافقة على مشاركة ابنكم في هذا البرنامج؟" : "تأكيد عدم الموافقة؟ لن يُسجَّل ابنكم في البرنامج."))) return;
    const r = await db.rpc("gt_consent", { _program: pid, _student: studentId, _decision: dec });
    if (r.error) toast.error(arabicError(r.error)); else { toast.success(dec === "ack" ? "سُجّل اطلاعكم (الاطلاع ليس موافقة)" : "سُجّل قراركم"); await q.refetch(); }
  }
  const issues = familyNoteIssues(kind, body, url);
  async function send() {
    setTried(true); if (issues.length) return;
    setBusy(true); const r = await db.rpc("gt_family_note", { _student: studentId, _kind: kind, _body: body, _url: url }); setBusy(false);
    if (r.error) toast.error(arabicError(r.error)); else { toast.success("أُرسلت للمدرسة وهي بانتظار المراجعة"); setBody(""); setUrl(""); setTried(false); await q.refetch(); }
  }
  if (empty && !d.notes.length) return <EmptyState title="لا توجد رعاية موهبة مسجلة" hint="يظهر هنا ما تقرّه المدرسة من مجالات وخطط وبرامج وإنجازات موثقة." />;
  return <div className="space-y-4">
    <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">الرعاية المدرسية لا تعني تأهيلًا رسميًا أو نتيجة مقياس خارجي.</p>
    {!!d.domains.length && <div className="flex flex-wrap items-center gap-2 text-sm"><Sparkles className="size-4 text-primary" />مجالات أقرّتها المدرسة: {d.domains.map((x) => <span key={x} className="rounded-full bg-primary/10 px-3 py-1 text-primary">{GT_DOMAINS[x] ?? x}</span>)}</div>}
    <section className="space-y-2"><h3 className="flex items-center gap-2 font-bold"><ListChecks className="size-4" />خطط الرعاية</h3>
      {!d.plans.length ? <p className="text-sm text-muted-foreground">لا توجد خطة معتمدة بعد.</p> : d.plans.map((p) => <div key={p.id} className="space-y-2 rounded-xl border bg-card p-4">
        <p className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{p.title}</span><span className="text-xs text-muted-foreground">{PLAN_STATUS[p.status]} · {p.start_date ?? ""} ← {p.end_date ?? ""}</span></p>
        <ol className="list-inside list-decimal space-y-1 text-sm">{p.goals.map((g, i) => <li key={i}>{g.text} <span className="text-xs text-muted-foreground">· {GOAL_STATUS[g.status] ?? g.status}{g.due ? ` · موعد ${g.due}` : ""}</span></li>)}</ol>
        {!!p.activities.length && <ul className="flex flex-wrap gap-2 text-xs">{p.activities.map((a, i) => <li key={i} className={`rounded-full border px-2.5 py-1 ${a.done ? "border-primary/40 text-primary" : ""}`}>{ACT_TYPES[a.type] ?? ""}: {a.title}{a.done ? " ✓" : ""}</li>)}</ul>}
        <p className="text-xs text-muted-foreground">إنجاز الأنشطة لا يعني تحقق الأهداف.</p>
        {p.close_result && <p className="rounded-lg bg-muted/40 p-2 text-sm">نتيجة الخطة: {p.close_result}</p>}
      </div>)}</section>
    <section className="space-y-2"><h3 className="flex items-center gap-2 font-bold"><CalendarDays className="size-4" />البرامج والفرص</h3>
      {!d.programs.length ? <p className="text-sm text-muted-foreground">لا توجد برامج.</p> : d.programs.map((p) => <div key={p.id} className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <p className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{p.title}{p.kind === "external" && p.organizer ? ` · ${p.organizer}` : ""}</span><span className="text-xs text-muted-foreground">{PROG_STATUS[p.status]} · يبدأ {p.starts_on}{p.apply_by ? ` · آخر موعد ${p.apply_by}` : ""}</span></p>
        <p className="text-xs">التسجيل: {L("reg", p.reg)} · الحضور: {L("att", p.att)} · الإتمام: {L("done", p.done)}{p.needs_consent ? ` · موافقة ولي الأمر: ${L("consent", p.consent)}` : ""}</p>
        {p.kind === "external" && p.source_url && <p className="text-xs text-muted-foreground">المصدر: <a className="text-primary underline" href={p.source_url} target="_blank" rel="noreferrer noopener">رابط الجهة</a>{p.verified_on ? ` · آخر تحقق من المدرسة ${p.verified_on}` : ""} — لا تسجّل المنصة لدى الجهة الخارجية.</p>}
        {guardian && <div className="flex flex-wrap gap-2">
          {consentOpen(p) && <><Button size="sm" onClick={() => void consent(p.id, "granted")}>أوافق</Button><Button size="sm" variant="outline" onClick={() => void consent(p.id, "refused")}>لا أوافق</Button></>}
          {p.status === "open" && (p.ack_at ? <span className="text-xs text-muted-foreground">اطّلعتم في {p.ack_at.slice(0, 10)}</span> : <Button size="sm" variant="ghost" onClick={() => void consent(p.id, "ack")}>تم الاطلاع</Button>)}
        </div>}
      </div>)}</section>
    <section className="space-y-2"><h3 className="flex items-center gap-2 font-bold"><Award className="size-4" />المشاركات والإنجازات الموثقة</h3>
      {!d.works.length ? <p className="text-sm text-muted-foreground">لا توجد أعمال متحقق منها بعد.</p> : <ul className="grid gap-2 sm:grid-cols-2">{d.works.map((w) => <li key={w.id} className="rounded-xl border bg-card p-3 text-sm"><p className="font-semibold">{w.title}</p><p className="text-xs text-muted-foreground">{WORK_KIND[w.kind]}{w.event_name ? ` · ${w.event_name}` : ""}{w.event_date ? ` · ${w.event_date}` : ""}{w.level ? ` · ${WORK_LEVEL[w.level]}` : ""}{w.group ? " · عمل جماعي" : ""}</p>{w.result && <p className="mt-1">{w.result}</p>}{w.role && <p className="text-xs">الدور: {w.role}</p>}</li>)}</ul>}</section>
    <section className="space-y-2 rounded-xl border bg-card p-4"><h3 className="flex items-center gap-2 font-bold"><Send className="size-4" />أرسل ملاحظة أو شاهدًا للمدرسة</h3>
      {d.can_send ? <>
        <p className="text-xs text-muted-foreground">تبقى المشاركة «بانتظار المراجعة» ولا تُحسب إنجازًا حتى تتحقق منها المدرسة.</p>
        <select aria-label="نوع المشاركة" className={selectCls()} value={kind} onChange={(e) => setKind(e.target.value)}><option value="note">ملاحظة</option><option value="evidence">شاهد برابط</option></select>
        <Textarea aria-label="الوصف" value={body} onChange={(e) => setBody(e.target.value)} placeholder="ماذا تريد أن تشارك؟" />
        <Input aria-label="الرابط" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        {tried && issues.map((i) => <p key={i} className="text-xs text-destructive">{i}</p>)}
        <Button disabled={busy} onClick={() => void send()}>{busy ? "جارٍ الإرسال…" : "إرسال"}</Button>
      </> : <p className="text-sm text-muted-foreground">تُتاح المشاركة بعد إقرار الرعاية أو بدء خطة.</p>}
      {!!d.notes.length && <ul className="divide-y pt-2">{d.notes.map((n) => <li key={n.id} className="py-2 text-sm"><p className="text-xs text-muted-foreground">{n.at.slice(0, 10)} · {n.by_role === "student" ? "الطالب" : "ولي الأمر"} · {NOTE_STATUS[n.status]}</p><p className="whitespace-pre-wrap">{n.body}</p>{n.review_note && <p className="text-xs text-muted-foreground">سبب المدرسة: {n.review_note}</p>}</li>)}</ul>}
    </section>
  </div>;
}
