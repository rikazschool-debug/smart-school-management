import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, Radio, Users } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Pill, fmt } from "@/components/admin/shared";
import { meetingAction } from "@/lib/meeting-live.functions";
import { arabicError } from "@/lib/session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await db.rpc(fn as never, args as never); if (error) throw error; return data as Row; };
const STATUS = (s: Row) => s.status === "cancelled" ? ["ملغاة", "muted"] : s.live_status === "live" ? ["جارية الآن", "ok"] : s.live_status === "ended" ? ["انتهت", "muted"] : ["مجدولة", "warn"];
const localNow = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const mins = (m: Row) => (m == null ? "—" : `${m} د`);

/** Class virtual sessions: scheduling is independent from the timetable; access, roles and attendance are decided by vc_* / adm_live_* in the database. */
export function VirtualClasses({ school, canManage, isStudent }: { school: string; canManage: boolean; isStudent: boolean }) {
  const [tab, setTab] = useState<"list" | "report">("list");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState(false);
  const [att, setAtt] = useState<Row | null>(null);
  const list = useQuery({ queryKey: ["vc-list", school, from, to], queryFn: () => rpc("vc_list", { _school: school, _course: null, _from: from || null, _to: to || null }), refetchInterval: 20000 });
  const courses = useQuery({ enabled: !isStudent, queryKey: ["vc-courses", school], queryFn: () => rpc("vc_courses", { _school: school }) });
  const canSchedule = !isStudent && (canManage || (courses.data ?? []).some((c: Row) => c.teachers.length));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {canManage && <div className="flex gap-1"><Button size="sm" variant={tab === "list" ? "default" : "outline"} onClick={() => setTab("list")}>الحصص</Button><Button size="sm" variant={tab === "report" ? "default" : "outline"} onClick={() => setTab("report")}>تقرير المعلمين والطلاب</Button></div>}
        <label className="text-xs">من<Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs">إلى<Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {canSchedule && tab === "list" && <Button size="sm" className="ms-auto" onClick={() => setForm(true)}><CalendarPlus className="size-4" />جدولة حصة / جلسة فورية</Button>}
      </div>
      {form && <ScheduleForm school={school} courses={courses.data ?? []} canManage={canManage} onDone={() => setForm(false)} />}
      {tab === "report" && canManage ? <Report school={school} from={from} to={to} /> : att ? <Attendance s={att} back={() => setAtt(null)} /> :
        list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data.length ? (
          <EmptyState title="لا توجد حصص افتراضية" hint={isStudent ? "ستظهر هنا الحصص التي يجدولها معلموك، ويصلك إشعار بموعدها." : "جدول حصة لفصل، أو ابدأ جلسة فورية: صوت جماعي ومشاركة شاشة لطلاب الشعبة."} />
        ) : <SessionList rows={list.data} onAttendance={setAtt} />}
    </div>
  );
}

function SessionList({ rows, onAttendance }: { rows: Row[]; onAttendance: (s: Row) => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const action = useServerFn(meetingAction);
  async function start(s: Row) {
    try { await action({ data: { id: s.id, action: "start" } }); nav({ to: "/app/virtual-classes/room/$id", params: { id: s.id } }); }
    catch (e) { toast.error(arabicError(e)); }
  }
  async function cancel(s: Row) {
    const why = await askText("سبب إلغاء الحصة (يصل للطلاب)", { required: true }); if (!why) return;
    try { await rpc("vc_cancel", { _id: s.id, _reason: why }); toast.success("أُلغيت الحصة"); qc.invalidateQueries({ queryKey: ["vc-list"] }); } catch (e) { toast.error(arabicError(e)); }
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((s) => {
        const [label, tone] = STATUS(s);
        const open = s.status === "scheduled" && s.live_status !== "ended";
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.course} · المعلم: {s.teacher} · {fmt(s.starts_at)} · {s.duration_min} دقيقة{s.my_role !== "member" ? ` · حضر ${s.attended} من ${s.invited}` : ""}</p>
              {s.cancel_reason && <p className="text-xs text-destructive">سبب الإلغاء: {s.cancel_reason}</p>}
            </div>
            <Pill tone={tone as "ok"}>{label}</Pill>
            {open && s.my_role === "host" && <Button size="sm" onClick={() => void start(s)}><Radio className="size-4" />{s.live_status === "live" ? "العودة للغرفة" : "بدء الجلسة"}</Button>}
            {open && s.my_role === "member" && (s.live_status === "live"
              ? <Button size="sm" asChild><Link to="/app/virtual-classes/room/$id" params={{ id: s.id }}><Radio className="size-4" />انضمام</Link></Button>
              : <span className="text-xs text-muted-foreground">بانتظار بدء المعلم</span>)}
            {s.can_manage && s.my_role !== "member" && <Button size="sm" variant="outline" onClick={() => onAttendance(s)}><Users className="size-4" />الحضور</Button>}
            {s.can_manage && s.status === "scheduled" && s.live_status === "idle" && <Button size="sm" variant="ghost" onClick={() => void cancel(s)}>إلغاء</Button>}
          </li>
        );
      })}
    </ul>
  );
}

function ScheduleForm({ school, courses, canManage, onDone }: { school: string; courses: Row[]; canManage: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const action = useServerFn(meetingAction);
  const usable = courses.filter((c) => c.teachers.length);
  const [course, setCourse] = useState(usable[0]?.id ?? "");
  const sel = usable.find((c) => c.id === course);
  const [teacher, setTeacher] = useState("");
  const tch = teacher && sel?.teachers.some((t: Row) => t.user_id === teacher) ? teacher : sel?.teachers[0]?.user_id ?? "";
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(localNow());
  const [dur, setDur] = useState("45");
  const [busy, setBusy] = useState(false);
  async function save(now: boolean) {
    if (!course || !tch) { toast.error("اختر الفصل والمعلم"); return; }
    setBusy(true);
    try {
      const id = await rpc("vc_save", { _id: null, _course: course, _teacher: tch, _title: title, _starts: now ? new Date().toISOString() : new Date(when).toISOString(), _duration: Number(dur), _rev: 0 });
      qc.invalidateQueries({ queryKey: ["vc-list"] });
      if (now) { await action({ data: { id, action: "start" } }); nav({ to: "/app/virtual-classes/room/$id", params: { id } }); return; }
      toast.success("جُدولت الحصة وأُبلغ الطلاب"); onDone();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  void school;
  if (!usable.length) return <EmptyState title="لا مقررات بمعلم مسند" hint="تُجدول الحصة لمقرر له معلم مسند حاليًا." />;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>الفصل (المقرر)</Label><select className={selectCls()} value={course} onChange={(e) => setCourse(e.target.value)}>{usable.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
        {canManage && <div><Label>المعلم</Label><select className={selectCls()} value={tch} onChange={(e) => setTeacher(e.target.value)}>{sel?.teachers.map((t: Row) => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}</select></div>}
        <div><Label>العنوان (اختياري)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: مراجعة الوحدة الثانية" /></div>
        <div><Label>الموعد</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        <div><Label>المدة (دقيقة)</Label><Input type="number" min={5} max={600} value={dur} onChange={(e) => setDur(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">يُدعى طلاب الشعبة المسجّلون تلقائيًا ويصلهم إشعار. الجلسة صوت جماعي ومشاركة شاشة؛ يبدؤها المعلم قبل الموعد بثلاثين دقيقة كحد أقصى.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void save(false)}>جدولة</Button>
        {!canManage || sel?.teachers.some((t: Row) => t.user_id === tch) ? <Button disabled={busy} variant="outline" onClick={() => void save(true)}><Radio className="size-4" />بدء جلسة فورية الآن</Button> : null}
        <Button variant="ghost" onClick={onDone}>إغلاق</Button>
      </div>
    </div>
  );
}

function Attendance({ s, back }: { s: Row; back: () => void }) {
  const q = useQuery({ queryKey: ["vc-att", s.id], queryFn: () => rpc("vc_attendance", { _id: s.id }), refetchInterval: 15000 });
  return (
    <div className="space-y-2">
      <button className="text-sm text-primary" onClick={back}>→ الحصص</button>
      <h3 className="font-semibold">حضور: {s.title}</h3>
      <p className="text-xs text-muted-foreground">{s.course} · {fmt(s.starts_at)}</p>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["الاسم", "الصفة", "أول دخول", "آخر ظهور/خروج", "مرات الدخول", "المدة", "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{(q.data as Row[]).map((r) => (
              <tr key={r.user_id} className="border-t">
                <td className="px-3 py-2">{r.full_name}</td><td className="px-3 py-2">{r.is_teacher ? "المعلم" : "طالب"}</td>
                <td className="px-3 py-2">{r.first_joined_at ? fmt(r.first_joined_at) : "—"}</td><td className="px-3 py-2">{r.last_at ? fmt(r.last_at) : "—"}</td>
                <td className="px-3 py-2">{r.joins ?? 0}</td><td className="px-3 py-2">{mins(r.minutes)}</td>
                <td className="px-3 py-2"><Pill tone={r.attended ? "ok" : "bad"}>{r.attended ? "حضر" : "لم يحضر"}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Report({ school, from, to }: { school: string; from: string; to: string }) {
  const q = useQuery({ queryKey: ["vc-report", school, from, to], queryFn: () => rpc("vc_report", { _school: school, _from: from || null, _to: to || null }) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const T = q.data.teachers as Row[], S = q.data.students as Row[];
  const table = (h: string[], rows: Row[], cells: (r: Row) => React.ReactNode[]) => (
    <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{h.map((x) => <th key={x} className="px-3 py-2 text-start font-medium">{x}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.user_id} className="border-t">{cells(r).map((c, i) => <td key={i} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
  return (
    <div className="space-y-5">
      <section className="space-y-2"><h3 className="font-semibold">المعلمون</h3>
        {!T.length ? <p className="text-sm text-muted-foreground">لا حصص في الفترة.</p> : table(["المعلم", "مجدولة", "عُقدت", "ملغاة", "إجمالي الدقائق", "أول حصة", "آخر حصة"], T, (r) => [r.full_name, r.scheduled, r.held, r.cancelled, mins(r.minutes), r.first_at ? fmt(r.first_at) : "—", r.last_at ? fmt(r.last_at) : "—"])}
      </section>
      <section className="space-y-2"><h3 className="font-semibold">الطلاب</h3>
        {!S.length ? <p className="text-sm text-muted-foreground">لا دعوات في الفترة.</p> : table(["الطالب", "مدعو", "حضر", "نسبة الحضور", "إجمالي الدقائق", "آخر دخول"], S, (r) => [r.full_name, r.invited, r.attended, r.invited ? `${Math.round((100 * r.attended) / r.invited)}%` : "—", mins(r.minutes), r.last_at ? fmt(r.last_at) : "—"])}
      </section>
    </div>
  );
}
