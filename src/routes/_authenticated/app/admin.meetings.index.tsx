import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { db } from "@/components/crud-page";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { ExportButtons } from "@/components/list-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { MeetingForm } from "@/components/admin/meeting-form";
import { ADM_PAGE, MEETING_STATUS, PRIORITY, PagerBar, Pill, RSVP, TASK_STATUS, fetchAllRows, riyadhDate, riyadhTime } from "@/components/admin/shared";

export const Route = createFileRoute("/_authenticated/app/admin/meetings/")({
  head: () => ({ meta: [{ title: "الاجتماعات والقرارات | ركاز" }, { name: "description", content: "الاجتماعات المدرسية والمحاضر والقرارات ومتابعتها" }] }),
  component: Page,
});

type Ctx = AppContext;
const ORGANIZERS = ["principal", "vice_principal", "dept_head", "org_owner"];

/** Owners may work at organization level (no branch selected) for their multi-branch meetings. */
function Page() {
  const { active } = useSession();
  if (active?.role === "org_owner" && !active.schoolId) return <Meetings ctx={active} />;
  return <RequireSchool nav="meetings">{(ctx) => <Meetings ctx={ctx} />}</RequireSchool>;
}

function Meetings({ ctx }: { ctx: Ctx }) {
  const [tab, setTab] = useState("meetings");
  return (
    <div>
      <Link to="/app/admin" className="text-sm text-primary">← الإدارة المدرسية</Link>
      <PageHeader eyebrow={ctx.schoolName || ctx.orgName} title="الاجتماعات والقرارات" desc="الدعوات والحضور والمحاضر المثبتة والقرارات المرتبطة بالتكليفات." />
      <div role="tablist" className="mb-4 flex flex-wrap gap-2 border-b pb-2">
        {[["meetings", "الاجتماعات"], ["decisions", "القرارات"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k!)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      {tab === "meetings" ? <MeetingList ctx={ctx} /> : ctx.schoolId ? <DecisionList ctx={ctx as Ctx & { schoolId: string }} /> : <EmptyState title="اختر فرعًا من شريط السياق لعرض قراراته" />}
    </div>
  );
}

function MeetingList({ ctx }: { ctx: Ctx }) {
  const { user } = useSession();
  const nav = useNavigate();
  const canOrganize = ORGANIZERS.includes(ctx.role);
  const [scope, setScope] = useState("mine");
  const [status, setStatus] = useState("upcoming");
  const [mode, setMode] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const args = (limit: number, offset: number) => ({ _school: ctx.schoolId, _org: ctx.schoolId ? null : ctx.orgId, _scope: scope, _q: q.trim() || null, _status: status || null, _mode: mode || null, _from: from || null, _to: to || null, _limit: limit, _offset: offset });
  const list = useQuery({
    queryKey: ["adm-meetings", ctx.schoolId, ctx.orgId, scope, status, mode, q, from, to, page],
    queryFn: async () => { const { data, error } = await db.rpc("adm_meeting_list" as never, args(ADM_PAGE, page * ADM_PAGE) as never); if (error) throw error; return data as Row[]; },
  });
  const total = Number(list.data?.[0]?.total ?? 0);
  const sel = selectCls("", true);
  const reset = () => setPage(0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="بحث في الاجتماعات" placeholder="بحث بالعنوان أو الغرض أو جدول الأعمال" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} className="h-9 w-64" />
        <select aria-label="النطاق" className={sel} value={scope} onChange={(e) => { setScope(e.target.value); reset(); }}><option value="mine">اجتماعاتي</option><option value="all">كل ما أستطيع رؤيته</option></select>
        <select aria-label="الحالة" className={sel} value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
          <option value="">كل الحالات</option><option value="upcoming">القادمة</option><option value="invites">دعوات بانتظار ردي</option><option value="ended">المنتهية</option><option value="cancelled">الملغاة</option><option value="draft">المسودات</option>
        </select>
        <select aria-label="النوع" className={sel} value={mode} onChange={(e) => { setMode(e.target.value); reset(); }}><option value="">حضوري وافتراضي</option><option value="in_person">حضوري</option><option value="virtual">افتراضي</option></select>
        <div><Label htmlFor="mf">من</Label><Input id="mf" type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} className="h-9" /></div>
        <div><Label htmlFor="mt">إلى</Label><Input id="mt" type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} className="h-9" /></div>
        <Button size="sm" variant="ghost" onClick={() => { setQ(""); setStatus(""); setMode(""); setFrom(""); setTo(""); reset(); }}>مسح الفلاتر</Button>
        <div className="ms-auto flex gap-2">
          <ExportButtons title="الاجتماعات" school={ctx.schoolName || ctx.orgName} headers={["العنوان", "النوع", "الفرع المستضيف", "التاريخ", "الوقت", "المدة", "المكان", "المنظم", "المدعوون", "الحالة"]}
            filters={[scope === "mine" ? "اجتماعاتي" : "كل ما أستطيع رؤيته", status ? `الحالة: ${STATUS_FILTER[status] ?? MEETING_STATUS[status]}` : "كل الحالات", ...(mode ? [mode === "virtual" ? "افتراضي" : "حضوري"] : []), ...(from || to ? [`من ${from || "—"} إلى ${to || "—"}`] : []), ...(q.trim() ? [`بحث: ${q.trim()}`] : []), "لا يتضمن المحاضر أو المرفقات"]}
            rows={async () => (await fetchAllRows((o) => db.rpc("adm_meeting_list" as never, args(100, o) as never))).map((m) => [m.title, m.mode === "virtual" ? "افتراضي" : "حضوري", m.school_name ?? "", riyadhDate(m.starts_at), riyadhTime(m.starts_at), `${m.duration_min} د`, m.location ?? "", m.organizer_name, m.members, liveLabel(m)])} />
          {canOrganize && <Button size="sm" onClick={() => setCreating((v) => !v)}>{creating ? "إغلاق" : "اجتماع جديد"}</Button>}
        </div>
      </div>
      {creating && <MeetingForm school={ctx.schoolId} ctx={ctx} me={user.id} onCancel={() => setCreating(false)} onDone={(id) => nav({ to: "/app/admin/meetings/$id", params: { id } })} />}
      <p className="text-xs text-muted-foreground">{total} نتيجة</p>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.length ? <EmptyState title="لا توجد اجتماعات" hint={canOrganize ? "أنشئ اجتماعًا من الزر أعلاه." : "ستظهر هنا الاجتماعات التي دُعيت إليها."} /> : (
        <ul className="space-y-2">{list.data.map((m) => (
          <li key={m.id}>
            <Link to="/app/admin/meetings/$id" params={{ id: m.id }} className="block rounded-xl border bg-card p-4 hover:border-primary">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{m.title}</span>
                <Pill tone={m.status === "cancelled" ? "muted" : m.status === "held" ? "ok" : "warn"}>{liveLabel(m)}</Pill>
                <Pill>{m.mode === "virtual" ? "افتراضي — صوت وشاشة" : "حضوري"}</Pill>
                {m.scope === "org" && <Pill>بين الفروع</Pill>}
                {m.privacy === "restricted" && <Pill tone="bad">مقيد</Pill>}
                {m.my_rsvp && <Pill>{RSVP[m.my_rsvp]}</Pill>}
                {m.am_organizer && <Pill tone="ok">أنا المنظم</Pill>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{riyadhDate(m.starts_at)} {riyadhTime(m.starts_at)} · {m.duration_min} دقيقة{m.school_name ? ` · ${m.school_name}` : ""}{m.location ? ` · ${m.location}` : ""} · المنظم: {m.organizer_name} · {m.members} مدعو</p>
            </Link>
          </li>
        ))}</ul>
      )}
      <PagerBar page={page} total={total} setPage={setPage} />
    </div>
  );
}

const STATUS_FILTER: Record<string, string> = { upcoming: "القادمة", invites: "دعوات بانتظار ردي", ended: "المنتهية" };
export function liveLabel(m: Row) {
  if (m.live_status === "live") return "مباشر الآن";
  if (m.status === "scheduled" && m.live_status === "ended") return "انتهى";
  return MEETING_STATUS[m.status];
}

function DecisionList({ ctx }: { ctx: Ctx }) {
  const [scope, setScope] = useState("mine");
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const args = (limit: number, offset: number) => ({ _school: ctx.schoolId, _scope: scope, _meeting: null, _q: q.trim() || null, _status: status || null, _limit: limit, _offset: offset });
  const list = useQuery({
    queryKey: ["adm-decisions", ctx.schoolId, scope, status, q, page],
    queryFn: async () => { const { data, error } = await db.rpc("adm_decision_list" as never, args(ADM_PAGE, page * ADM_PAGE) as never); if (error) throw error; return data as Row[]; },
  });
  const total = Number(list.data?.[0]?.total ?? 0);
  const sel = selectCls("", true);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="بحث في القرارات" placeholder="بحث في نص القرار" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-9 w-56" />
        <select aria-label="النطاق" className={sel} value={scope} onChange={(e) => { setScope(e.target.value); setPage(0); }}><option value="mine">المسندة إليّ</option><option value="all">كل ما أستطيع رؤيته</option></select>
        <select aria-label="الحالة" className={sel} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">كل الحالات</option><option value="open">المفتوحة</option><option value="overdue">المتأخرة</option>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="ms-auto"><ExportButtons title="القرارات" school={ctx.schoolName} headers={["القرار", "مسؤول التنفيذ", "الموعد", "الأولوية", "الحالة", "الاجتماع"]}
          filters={[scope === "mine" ? "المسندة إليّ" : "كل ما أستطيع رؤيته", status ? `الحالة: ${TASK_STATUS[status] ?? (status === "open" ? "المفتوحة" : "المتأخرة")}` : "كل الحالات", ...(q.trim() ? [`بحث: ${q.trim()}`] : []), "عنوان الاجتماع المقيد مخفي لغير المخولين"]}
          rows={async () => (await fetchAllRows((o) => db.rpc("adm_decision_list" as never, args(100, o) as never))).map((d) => [d.body, d.assignee_name, d.due_date, PRIORITY[d.priority], TASK_STATUS[d.status], d.meeting_title])} /></div>
      </div>
      <p className="text-xs text-muted-foreground">حالة القرار هي حالة التكليف المرتبط به نفسها. {total} نتيجة</p>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data?.length ? <EmptyState title="لا توجد قرارات" /> : (
        <ul className="space-y-2">{list.data.map((d) => (
          <li key={d.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/app/admin/tasks/$id" params={{ id: d.task_id }} className="font-semibold text-primary hover:underline">{d.body}</Link>
              <Pill tone={d.status === "done" ? "ok" : d.status === "cancelled" ? "muted" : "warn"}>{TASK_STATUS[d.status]}</Pill>
              {d.overdue && <Pill tone="bad">متأخر</Pill>}{d.priority === "high" && <Pill tone="bad">أولوية عالية</Pill>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">المسؤول: {d.assignee_name} · الموعد {d.due_date} · {d.can_open_meeting ? <Link to="/app/admin/meetings/$id" params={{ id: d.meeting_id }} className="text-primary underline">{d.meeting_title}</Link> : d.meeting_title}</p>
          </li>
        ))}</ul>
      )}
      <PagerBar page={page} total={total} setPage={setPage} />
    </div>
  );
}
