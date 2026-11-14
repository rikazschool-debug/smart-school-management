import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, BookOpen, ClipboardList, MessagesSquare, School, UserRound, Users } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ClassroomPosts } from "@/components/classroom-posts";
import { ROOM_TABS, type RoomTab, roomTabsFor, type RoomView } from "@/components/classroom-room-tabs";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { ClassesTab } from "@/components/comm/classes";
import { cn } from "@/lib/utils";

type Room = {
  id: string; title: string; school_id: string; view: RoomView;
  subjects: { classroom_id: string; course_id: string; subject: string; can_post: boolean; teachers: string[] }[];
  students: string[] | null;
  guardians: { name: string; child: string; relationship: string; verified: boolean; account: boolean }[] | null;
  class_group: string | null;
};
const TAB_ICON: Record<RoomTab, typeof School> = { subjects: BookOpen, students: Users, guardians: UserRound, group: MessagesSquare };
const REL: Record<string, string> = { father: "الأب", mother: "الأم", brother: "الأخ", sister: "الأخت", other: "أخرى" };

export const Route = createFileRoute("/_authenticated/app/classrooms/section/$id")({
  head: () => ({ meta: [{ title: "فصل الشعبة — ركاز" }, { name: "description", content: "الفصل الرقمي للشعبة: المواد والمعلمون والطلاب وأولياء الأمور ومجموعة الفصل." }] }),
  validateSearch: (s: Record<string, unknown>): { subject?: string; tab?: RoomTab } => ({
    ...(s["subject"] ? { subject: String(s["subject"]) } : {}),
    ...(ROOM_TABS.some(([k]) => k === s["tab"]) ? { tab: s["tab"] as RoomTab } : {}),
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { subject, tab } = Route.useSearch();
  const nav = useNavigate();
  const { active } = useSession();
  const q = useQuery({
    queryKey: ["section-room", id],
    queryFn: async () => {
      const { data, error } = await db.rpc("section_room_get", { _room: id });
      if (error) throw error;
      return data as unknown as Room;
    },
    retry: false,
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return /not_allowed/.test(String((q.error as Error).message)) || (q.error as { code?: string }).code === "42501"
    ? <EmptyState title="الفصل غير موجود أو ليس ضمن صلاحياتك" /> : <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const r = q.data!;
  const tabs = roomTabsFor(r.view);
  const cur: RoomTab = tab && tabs.includes(tab) ? tab : "subjects";
  const subj = r.subjects.find((s) => s.classroom_id === subject) ?? r.subjects[0];
  const go = (t: RoomTab) => nav({ to: "/app/classrooms/section/$id", params: { id }, search: { tab: t }, replace: true });
  return (
    <>
      <Link to="/app/classrooms" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />كل الفصول</Link>
      <header className="mb-5 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 bg-gradient-to-l from-primary/15 to-transparent p-5 sm:flex-row sm:items-center">
          <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow"><School className="size-8" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black">{r.title}</h1>
            <p className="text-sm text-muted-foreground">{r.view === "family" ? "مواد الفصل ومعلموها ومشاركاتها ومجموعة الفصل." : "فصل الشعبة: كل مادة لها مشاركاتها، والمعلم ينشر في مواده فقط."}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center sm:w-80">
            <div className="rounded-lg bg-background/70 p-2"><dt className="text-[11px] text-muted-foreground">المواد</dt><dd className="text-lg font-bold">{r.subjects.length}</dd></div>
            <div className="rounded-lg bg-background/70 p-2"><dt className="text-[11px] text-muted-foreground">المعلمون</dt><dd className="text-lg font-bold">{new Set(r.subjects.flatMap((x) => x.teachers)).size}</dd></div>
            <div className="rounded-lg bg-background/70 p-2"><dt className="text-[11px] text-muted-foreground">الطلاب</dt><dd className="text-lg font-bold">{r.students ? r.students.length : "—"}</dd></div>
          </dl>
        </div>
        {tabs.length > 1 && (
          <div role="tablist" aria-label="أقسام الفصل" className="flex gap-1 overflow-x-auto border-t px-3">
            {tabs.map((k) => { const I = TAB_ICON[k]; return (
              <button key={k} role="tab" aria-selected={cur === k} onClick={() => go(k)}
                className={cn("-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition", cur === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <I className="size-4" />{ROOM_TABS.find(([x]) => x === k)![1]}
              </button>
            ); })}
          </div>
        )}
      </header>

      {cur === "subjects" && (!r.subjects.length ? <EmptyState title="لا توجد مواد في هذا الفصل بعد" hint="تظهر المواد هنا عند اعتماد تكليف معلم بمقرر في هذه الشعبة." /> : (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-2">
            <h3 className="px-1 text-sm font-semibold text-muted-foreground">المواد والمعلمون</h3>
            <div role="tablist" aria-label="مواد الفصل" className="flex gap-2 overflow-x-auto lg:flex-col">
              {r.subjects.map((s) => { const on = subj?.classroom_id === s.classroom_id; return (
                <button key={s.classroom_id} role="tab" aria-selected={on}
                  onClick={() => nav({ to: "/app/classrooms/section/$id", params: { id }, search: { tab: "subjects", subject: s.classroom_id }, replace: true })}
                  className={cn("flex min-w-48 shrink-0 items-center gap-3 rounded-xl border p-3 text-start transition", on ? "border-primary bg-primary/10" : "bg-card hover:bg-muted")}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-muted text-primary")}><BookOpen className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.subject}{s.can_post && <span className="ms-1 text-xs text-primary">· موادي</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.teachers.join("، ") || "بلا معلم"}</span>
                  </span>
                </button>
              ); })}
            </div>
          </aside>
          <div className="min-w-0">
            {subj && (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
                  <div className="min-w-0"><p className="truncate font-bold">{subj.subject}</p><p className="truncate text-xs text-muted-foreground">{subj.teachers.join("، ") || "بلا معلم"}</p></div>
                  <Link to="/app/homework" search={{ course: subj.course_id }} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-primary hover:bg-muted"><ClipboardList className="size-4" />واجبات المادة</Link>
                </div>
                <ClassroomPosts key={subj.classroom_id} classroom={subj.classroom_id} courseId={subj.course_id} />
              </>
            )}
          </div>
        </div>
      ))}

      {cur === "students" && (
        <section className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 font-semibold">الطلاب ({r.students?.length ?? 0})</h3>
          {r.students?.length ? <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{r.students.map((n, i) => <li key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs tabular-nums">{i + 1}</span><span className="truncate">{n}</span></li>)}</ol>
            : <p className="text-sm text-muted-foreground">لا يوجد طلاب مسكّنون في الشعبة.</p>}
        </section>
      )}

      {cur === "guardians" && (
        <section className="rounded-2xl border bg-card p-5">
          <h3 className="mb-1 font-semibold">أولياء الأمور ({new Set(r.guardians?.map((g) => g.name)).size})</h3>
          <p className="mb-3 text-xs text-muted-foreground">يدخل ولي الأمر الفصل تلقائيًا ما دام ابنه مسكّنًا فيه وعلاقتهما موثّقة، ويخرج منه عند نقل الابن إلى فصل آخر.</p>
          {r.guardians?.length ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-start text-xs text-muted-foreground"><th className="p-2 text-start">ولي الأمر</th><th className="p-2 text-start">الابن</th><th className="p-2 text-start">الصلة</th><th className="p-2 text-start">العلاقة</th><th className="p-2 text-start">الحساب</th></tr></thead>
              <tbody>{r.guardians.map((g, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2">{g.name}</td><td className="p-2">{g.child}</td><td className="p-2">{REL[g.relationship] ?? g.relationship}</td>
                  <td className="p-2">{g.verified ? <span className="inline-flex items-center gap-1 text-primary"><BadgeCheck className="size-3.5" />موثّقة</span> : <span className="text-muted-foreground">بانتظار التوثيق (لا يدخل الفصل)</span>}</td>
                  <td className="p-2">{g.account ? "مرتبط" : <span className="text-muted-foreground">بلا حساب</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-muted-foreground">لا يوجد أولياء أمور مرتبطون بطلاب هذا الفصل.</p>}
        </section>
      )}

      {cur === "group" && (
        r.class_group && active ? <ClassesTab ctx={{ ...active, schoolId: r.school_id } as AppContext & { schoolId: string }} only={r.class_group} />
          : <EmptyState title="مجموعة الفصل غير متاحة لك" hint="تُجهَّز مجموعة الفصل تلقائيًا للعام الدراسي الحالي، ويدخلها الطلاب المسكّنون وأولياء أمورهم الموثّقون والمعلمون المكلّفون." />
      )}
    </>
  );
}
