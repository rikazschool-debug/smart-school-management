import { RsvpActions } from "@/components/admin/rsvp";
import { PeoplePicker } from "@/components/people-picker";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { ask, askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { MeetingForm } from "@/components/admin/meeting-form";
import { AdminFiles, MEETING_STATUS, PRIORITY, Pill, RSVP, TASK_STATUS, Timeline, fmt, riyadhDate, riyadhTime, riyadhToday } from "@/components/admin/shared";

export const Route = createFileRoute("/_authenticated/app/admin/meetings/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الاجتماع | ركاز" }, { name: "description", content: "الدعوة والحضور والمحضر والقرارات" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  if (active?.role === "org_owner" && !active.schoolId) return <Meeting school={null} ctx={active} />;
  // invited guardians (category invitations) open the invite; the database decides what they can read
  if (active?.role === "guardian") return <Meeting school={active.schoolId} ctx={active} />;
  return <RequireSchool nav="meetings">{(ctx) => <Meeting school={ctx.schoolId} ctx={ctx} />}</RequireSchool>;
}

function Meeting({ school, ctx }: { school: string | null; ctx: AppContext }) {
  const { id } = Route.useParams();
  const { user } = useSession();
  const me = user.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["adm-meeting", id],
    queryFn: async () => {
      const { data, error } = await db.from("adm_meetings" as never).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [mem, ps, mins] = await Promise.all([
        db.from("adm_meeting_members" as never).select("*").eq("meeting_id", id),
        db.rpc("adm_party_names" as never, { _entity: "meeting", _id: id } as never),
        db.from("adm_minutes" as never).select("*").eq("meeting_id", id).order("version", { ascending: false }),
      ]);
      const names = Object.fromEntries(((ps.data ?? []) as Row[]).map((p) => [p.user_id, p.full_name]));
      return { m: data as Row, members: (mem.data ?? []) as Row[], names, minutes: (mins.data ?? []) as Row[] };
    },
  });
  const conflicts = useQuery({
    enabled: !!q.data && q.data.m.organizer === me && ["draft", "scheduled"].includes(q.data.m.status),
    queryKey: ["adm-meeting-conf", id, q.data?.m.rev],
    queryFn: async () => ((await db.rpc("adm_meeting_conflicts" as never, { _id: id } as never)).data ?? []) as Row[],
  });
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  if (!q.data) return <ErrorState message="الاجتماع غير موجود أو لا تملك صلاحية رؤيته" />;
  const { m, members, names, minutes } = q.data;
  const nm = (u: string) => names[u] ?? "مستخدم غير متاح";
  const organizer = m.organizer === me;
  const writer = organizer || m.minutes_writer === me;
  const mine = members.find((x) => x.user_id === me);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["adm-meeting", id] }); qc.invalidateQueries({ queryKey: ["adm-events", "meeting", id] }); qc.invalidateQueries({ queryKey: ["adm-meetings"] }); qc.invalidateQueries({ queryKey: ["adm-decisions"] }); };
  async function run(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await db.rpc(fn as never, args as never);
    setBusy(false);
    if (error) { toast.error(arabicError(error)); if (String(error.message).includes("نافذة أخرى")) refresh(); return false; }
    toast.success(ok); refresh(); return true;
  }
  if (editing) return <div className="space-y-4"><PageHeader title="تعديل الاجتماع" /><MeetingForm school={school} ctx={ctx} me={me} meeting={m} members={members.map((x) => x.user_id)} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); refresh(); }} /></div>;
  const started = Date.parse(m.starts_at) - 15 * 60e3 <= Date.now();
  return (
    <div className="space-y-6">
      <Link to="/app/admin/meetings" className="text-sm text-primary">← الاجتماعات والقرارات</Link>
      <PageHeader title={m.title} desc={`${riyadhDate(m.starts_at)} ${riyadhTime(m.starts_at)}–${riyadhTime(new Date(Date.parse(m.starts_at) + m.duration_min * 60e3).toISOString())} (الرياض) · ${m.duration_min} دقيقة${m.location ? ` · ${m.location}` : ""}`}
        action={<div className="flex flex-wrap gap-2"><Pill tone={m.status === "cancelled" ? "muted" : m.status === "held" ? "ok" : "warn"}>{m.live_status === "live" ? "مباشر الآن" : m.live_status === "ended" ? "انتهى" : MEETING_STATUS[m.status]}</Pill><Pill>{m.mode === "virtual" ? "افتراضي — صوت وشاشة" : "حضوري"}</Pill>{m.scope === "org" && <Pill>بين الفروع</Pill>}{m.privacy === "restricted" && <Pill tone="bad">مقيد</Pill>}</div>} />
      {m.mode === "virtual" && m.status === "scheduled" && m.live_status !== "ended" && (organizer || (mine && !mine.banned)) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-primary bg-accent p-4">
          <p className="text-sm">{m.live_status === "live" ? "الاجتماع مباشر الآن." : organizer ? "تستطيع بدء الاجتماع قبل موعده بثلاثين دقيقة." : "يظهر زر الانضمام عند بدء المضيف."}</p>
          <Button asChild className="min-h-11"><Link to="/app/admin/room/$id" params={{ id }}>{m.live_status === "live" ? "انضمام" : organizer ? "فتح الغرفة للبدء" : "فتح الغرفة"}</Link></Button>
        </div>
      )}
      {m.status === "cancelled" && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">أُلغي: {m.cancel_reason}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-3 rounded-xl border bg-card p-4 md:col-span-2">
          {m.purpose && <p className="text-sm"><b>الغرض:</b> {m.purpose}</p>}
          {m.agenda && <div className="text-sm"><b>جدول الأعمال</b><p className="whitespace-pre-wrap">{m.agenda}</p></div>}
          {m.link && <p className="text-sm"><b>الرابط:</b> <a href={m.link} target="_blank" rel="noreferrer" className="text-primary underline" dir="ltr">{m.link}</a></p>}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">المنظم</dt><dd>{nm(m.organizer)}</dd>
            <dt className="text-muted-foreground">كاتب المحضر</dt><dd>{nm(m.minutes_writer ?? m.organizer)}</dd>
          </dl>
          <div>
            <p className="mb-1 font-semibold">المدعوون ({members.length})</p>
            <ul className="space-y-1 text-sm">{members.map((x) => (
              <li key={x.user_id} className="flex flex-wrap items-center gap-2">{nm(x.user_id)}
                {m.needs_rsvp && <Pill tone={x.rsvp === "accepted" ? "ok" : x.rsvp === "declined" || x.rsvp === "rejected" ? "bad" : "muted"}>{RSVP[x.rsvp]}</Pill>}
                {x.rsvp_note && <span className="text-xs text-muted-foreground">{x.rsvp_note}</span>}
                {x.attended !== null && <Pill tone={x.attended ? "ok" : "bad"}>{x.attended ? "حضر" : "لم يحضر"}</Pill>}
              </li>
            ))}</ul>
          </div>
          {organizer && (conflicts.data?.length ?? 0) > 0 && (
            <div className="rounded-lg bg-accent p-3 text-sm">
              <p className="font-medium">تنبيه تعارض (لا يمنع الحفظ):</p>
              <ul>{conflicts.data!.map((c) => <li key={c.user_id}>{c.full_name}: {c.reason}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="font-semibold">الإجراءات</p>
          {organizer && ["draft", "scheduled"].includes(m.status) && <Button className="w-full" variant="outline" onClick={() => setEditing(true)}>تعديل</Button>}
          {organizer && m.status === "draft" && !preview && <Button className="w-full" onClick={() => setPreview(true)}>معاينة وإرسال الدعوة</Button>}
          {organizer && m.status === "draft" && preview && (
            <div className="space-y-2 rounded-lg border-2 border-primary p-2 text-sm">
              <p>ستصل دعوة داخل التطبيق إلى {members.length} مدعو: {members.map((x) => nm(x.user_id)).join("، ") || "—"}.</p>
              {(conflicts.data?.length ?? 0) > 0 && <p className="text-destructive">{conflicts.data!.length} تعارض موضّح جانبًا.</p>}
              <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={async () => { if (await run("adm_meeting_send", { _id: id, _rev: m.rev }, "أُرسلت الدعوات")) setPreview(false); }}>إرسال</Button><Button size="sm" variant="ghost" onClick={() => setPreview(false)}>رجوع</Button></div>
            </div>
          )}
          {organizer && ["draft", "scheduled"].includes(m.status) && <Button className="w-full" variant="outline" disabled={busy} onClick={async () => { const r = await askText("سبب الإلغاء (يُبلغ المدعوون)", { required: true }); if (r) run("adm_meeting_cancel", { _id: id, _reason: r, _rev: m.rev }, "أُلغي الاجتماع"); }}>إلغاء الاجتماع</Button>}
          {mine && m.status === "scheduled" && m.needs_rsvp && <RsvpActions meetingId={id} current={mine.rsvp} onDone={() => qc.invalidateQueries()} />}
          <p className="text-xs text-muted-foreground">الإشعار لا يُعد إثباتًا للحضور؛ الحضور الفعلي يُسجّل منفصلًا.</p>
        </div>
      </div>
      {writer && ["scheduled", "held"].includes(m.status) && started && <Attendance members={members} nm={nm} busy={busy} onSave={(marks) => run("adm_meeting_attendance", { _id: id, _marks: marks }, "سُجّل الحضور")} />}
      {["scheduled", "held"].includes(m.status) && <Minutes meetingId={id} minutes={minutes} members={members} organizerId={m.organizer} nm={nm} writer={writer} organizer={organizer} onChange={refresh} />}
      <Decisions meetingId={id} school={m.school_id} cross={m.scope === "org"} orgId={m.org_id} organizer={organizer && ["scheduled", "held"].includes(m.status)} />
      <AdminFiles entity="meeting" id={id} userId={me} canAdd={writer && m.status !== "cancelled"} title="مرفقات الاجتماع والمحضر" />
      <section><h2 className="mb-2 font-semibold">سجل الاجتماع</h2><Timeline entity="meeting" id={id} /></section>
    </div>
  );
}

function Attendance({ members, nm, busy, onSave }: { members: Row[]; nm: (u: string) => string; busy: boolean; onSave: (m: Row[]) => void }) {
  const [marks, setMarks] = useState<Record<string, boolean | null>>(() => Object.fromEntries(members.map((x) => [x.user_id, x.attended])));
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">الحضور الفعلي</h2>
      <ul className="space-y-1 text-sm">{members.map((x) => (
        <li key={x.user_id} className="flex flex-wrap items-center gap-3">{nm(x.user_id)} <span className="text-xs text-muted-foreground">({RSVP[x.rsvp]})</span>
          <label className="flex items-center gap-1"><input type="radio" name={"a" + x.user_id} checked={marks[x.user_id] === true} onChange={() => setMarks({ ...marks, [x.user_id]: true })} />حضر</label>
          <label className="flex items-center gap-1"><input type="radio" name={"a" + x.user_id} checked={marks[x.user_id] === false} onChange={() => setMarks({ ...marks, [x.user_id]: false })} />لم يحضر</label>
        </li>
      ))}</ul>
      <Button size="sm" disabled={busy} onClick={() => onSave(Object.entries(marks).filter(([, v]) => v !== null && v !== undefined).map(([user_id, attended]) => ({ user_id, attended })))}>حفظ الحضور</Button>
    </section>
  );
}

function Minutes({ meetingId, minutes, members, organizerId, nm, writer, organizer, onChange }: { meetingId: string; minutes: Row[]; members: Row[]; organizerId: string; nm: (u: string) => string; writer: boolean; organizer: boolean; onChange: () => void }) {
  const draft = minutes.find((x) => x.status === "draft");
  const confirmed = minutes.filter((x) => x.status === "confirmed");
  const base = draft ?? confirmed[0];
  const people = [organizerId, ...members.map((x) => x.user_id)];
  const [open, setOpen] = useState(false);
  const init = () => ({
    topics: ((base?.topics as Row[] | undefined)?.length ? (base!.topics as Row[]) : [{ title: "", discussion: "" }]).map((t) => ({ title: t.title ?? "", discussion: t.discussion ?? "" })),
    present: (base?.present as string[] | undefined)?.length ? (base!.present as string[]) : members.filter((x) => x.attended).map((x) => x.user_id),
    absent: (base?.absent as string[] | undefined)?.length ? (base!.absent as string[]) : members.filter((x) => x.attended === false || x.rsvp === "declined" || x.rsvp === "rejected").map((x) => x.user_id),
    notes: base?.notes ?? "", change_note: draft?.change_note ?? "",
  });
  const [d, setD] = useState(init);
  const startEdit = () => { setD(init()); setOpen(true); };
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await db.rpc("adm_minutes_save" as never, { _meeting: meetingId, _d: { ...d, topics: d.topics.filter((t) => t.title.trim()) }, _rev: draft?.rev ?? null } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظت مسودة المحضر"); onChange();
  }
  async function confirm() {
    if (!draft || !(await ask("تثبيت هذا الإصدار؟ لا يُعدّل بعد التثبيت إلا بإصدار جديد موثق."))) return;
    const { error } = await db.rpc("adm_minutes_confirm" as never, { _id: draft.id, _rev: draft.rev } as never);
    if (error) return void toast.error(arabicError(error));
    toast.success("ثُبّت المحضر"); setOpen(false); onChange();
  }
  const toggle = (k: "present" | "absent", u: string, on: boolean) => setD({ ...d, [k]: on ? [...d[k], u] : d[k].filter((x) => x !== u) });
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">المحضر</h2>
        {draft && <Pill tone="warn">مسودة إصدار {draft.version}</Pill>}
        {writer && !open && <Button size="sm" variant="outline" className="ms-auto" onClick={startEdit}>{draft ? "متابعة تحرير المسودة" : confirmed.length ? "إصدار جديد / ملحق" : "كتابة المحضر"}</Button>}
      </div>
      {!minutes.length && !open && <p className="text-sm text-muted-foreground">لا يوجد محضر بعد.</p>}
      {open && writer && (
        <div className="space-y-2 rounded-lg border p-3">
          {confirmed.length > 0 && !draft && <div><Label htmlFor="cn">سبب الإصدار الجديد أو نص الملحق (إلزامي)</Label><Input id="cn" value={d.change_note} onChange={(e) => setD({ ...d, change_note: e.target.value })} /></div>}
          {d.topics.map((t, k) => (
            <div key={k} className="space-y-1 rounded-md border p-2">
              <Input aria-label={`الموضوع ${k + 1}`} placeholder="الموضوع" value={t.title} onChange={(e) => setD({ ...d, topics: d.topics.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)) })} />
              <Textarea aria-label={`المناقشة ${k + 1}`} placeholder="المناقشة" value={t.discussion} onChange={(e) => setD({ ...d, topics: d.topics.map((x, j) => (j === k ? { ...x, discussion: e.target.value } : x)) })} />
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setD({ ...d, topics: [...d.topics, { title: "", discussion: "" }] })}>إضافة موضوع</Button>
          <div className="grid gap-2 md:grid-cols-2">
            <div><p className="text-sm font-medium">الحاضرون</p>{people.map((u) => <label key={u} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.present.includes(u)} onChange={(e) => toggle("present", u, e.target.checked)} />{nm(u)}</label>)}</div>
            <div><p className="text-sm font-medium">المعتذرون/الغائبون</p>{people.map((u) => <label key={u} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={d.absent.includes(u)} onChange={(e) => toggle("absent", u, e.target.checked)} />{nm(u)}</label>)}</div>
          </div>
          <Textarea aria-label="ملاحظات" placeholder="ملاحظات عامة" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={save}>حفظ المسودة</Button>{organizer && draft && <Button size="sm" variant="outline" onClick={confirm}>تثبيت الإصدار</Button>}<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>إغلاق</Button></div>
          {!organizer && <p className="text-xs text-muted-foreground">يثبّت المنظم المحضر بعد مراجعته.</p>}
        </div>
      )}
      {organizer && draft && !open && <Button size="sm" onClick={confirm}>تثبيت إصدار {draft.version}</Button>}
      {[...(draft && writer ? [draft] : []), ...confirmed].map((x) => (
        <details key={x.id} open={x === base} className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">إصدار {x.version} — {x.status === "confirmed" ? `مثبت ${fmt(x.confirmed_at)} بواسطة ${nm(x.confirmed_by)}` : "مسودة"} · كتبه {nm(x.written_by)} {fmt(x.saved_at)}</summary>
          {x.change_note && <p className="mt-1 rounded bg-accent p-1">سبب الإصدار/الملحق: {x.change_note}</p>}
          <ol className="mt-2 list-decimal space-y-1 pe-5">{(x.topics as Row[]).map((t, k) => <li key={k}><b>{t.title}</b>{t.discussion ? ` — ${t.discussion}` : ""}</li>)}</ol>
          <p className="mt-1">الحاضرون: {(x.present as string[]).map(nm).join("، ") || "—"}</p>
          <p>المعتذرون/الغائبون: {(x.absent as string[]).map(nm).join("، ") || "—"}</p>
          {x.notes && <p className="whitespace-pre-wrap">{x.notes}</p>}
        </details>
      ))}
    </section>
  );
}

function Decisions({ meetingId, school, cross, orgId, organizer }: { meetingId: string; school: string; cross: boolean; orgId: string; organizer: boolean }) {
  const qc = useQueryClient();
  const [branch, setBranch] = useState(school);
  const branches = useQuery({ enabled: cross && organizer, queryKey: ["org-schools", orgId], queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", orgId).order("name")).data ?? []) as Row[] });
  const q = useQuery({ queryKey: ["adm-decisions", "meeting", meetingId], queryFn: async () => ((await db.rpc("adm_decision_list" as never, { _school: school, _scope: "all", _meeting: meetingId, _q: null, _status: null, _limit: 100, _offset: 0 } as never)).data ?? []) as Row[] });
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [d, setD] = useState({ body: "", assignee: "", due_date: "", priority: "normal" });
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!d.body.trim() || !d.assignee || !d.due_date) return void toast.error("أكمل نص القرار والمسؤول والموعد");
    setBusy(true);
    const { error } = await db.rpc("adm_decision_create" as never, { _meeting: meetingId, _d: { ...d, school_id: branch }, _client: clientId } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("سُجّل القرار وأُنشئ تكليف مرتبط وأُشعر المسؤول");
    setD({ body: "", assignee: "", due_date: "", priority: "normal" }); setClientId(crypto.randomUUID());
    qc.invalidateQueries({ queryKey: ["adm-decisions"] }); qc.invalidateQueries({ queryKey: ["adm-events", "meeting", meetingId] });
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">القرارات</h2>
      <p className="text-xs text-muted-foreground">كل قرار يُنشئ تكليفًا واحدًا مرتبطًا؛ حالة القرار هي حالة التكليف. مسؤول التنفيذ يرى التكليف فقط، لا المحضر الكامل لاجتماع مقيد.</p>
      {!q.data?.length ? <p className="text-sm text-muted-foreground">لا توجد قرارات.</p> : (
        <ul className="space-y-1 text-sm">{q.data.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <Link to="/app/admin/tasks/$id" params={{ id: x.task_id }} className="font-medium text-primary hover:underline">{x.body}</Link>
            <span className="text-muted-foreground">{x.assignee_name} · {x.due_date} · {PRIORITY[x.priority]}</span>
            <Pill tone={x.status === "done" ? "ok" : x.status === "cancelled" ? "muted" : "warn"}>{TASK_STATUS[x.status]}</Pill>{x.overdue && <Pill tone="bad">متأخر</Pill>}
          </li>
        ))}</ul>
      )}
      {organizer && (
        <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-4">
          <div className="md:col-span-4"><Label htmlFor="dc-b">نص القرار</Label><Textarea id="dc-b" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></div>
          {cross && <div><Label htmlFor="dc-s">فرع التنفيذ</Label><select id="dc-s" className={selectCls("w-full")} value={branch} onChange={(e) => { setBranch(e.target.value); setD({ ...d, assignee: "" }); }}>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          <div className="md:col-span-4"><Label>مسؤول التنفيذ</Label><PeoplePicker purpose="decision" school={branch} label="مسؤول التنفيذ" single compact value={d.assignee ? [d.assignee] : []} onChange={(v) => setD({ ...d, assignee: v[0] ?? "" })} /></div>
          <div><Label htmlFor="dc-d">الموعد</Label><Input id="dc-d" type="date" min={riyadhToday()} value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} /></div>
          <div><Label htmlFor="dc-p">الأولوية</Label><select id="dc-p" className={selectCls("w-full")} value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="self-end"><Button disabled={busy} onClick={add}>إضافة القرار</Button></div>
        </div>
      )}
    </section>
  );
}
