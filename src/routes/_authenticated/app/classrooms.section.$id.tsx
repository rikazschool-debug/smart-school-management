import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, MessagesSquare } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { ClassroomPosts } from "@/components/classroom-posts";
import { Button } from "@/components/ui/button";
import { ROOM_TABS, type RoomTab, roomTabsFor, type RoomView } from "@/components/classroom-room-tabs";
import { arabicError } from "@/lib/session";
import { cn } from "@/lib/utils";

type Room = {
  id: string; title: string; school_id: string; view: RoomView;
  subjects: { classroom_id: string; course_id: string; subject: string; can_post: boolean; teachers: string[] }[];
  students: string[] | null;
  guardians: { name: string; child: string; relationship: string; verified: boolean; account: boolean }[] | null;
  class_group: string | null;
};
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
      <PageHeader title={r.title} desc={r.view === "family" ? "مواد الفصل ومعلموها ومشاركاتها." : "فصل الشعبة: كل مادة لها مشاركاتها، والمعلم ينشر في مواده فقط."} />
      {tabs.length > 1 && (
        <div role="tablist" aria-label="أقسام الفصل" className="mb-4 flex flex-wrap gap-2 border-b pb-3">
          {tabs.map((k) => <Button key={k} role="tab" aria-selected={cur === k} size="sm" variant={cur === k ? "default" : "outline"} onClick={() => go(k)}>{ROOM_TABS.find(([x]) => x === k)![1]}</Button>)}
        </div>
      )}

      {cur === "subjects" && (!r.subjects.length ? <EmptyState title="لا توجد مواد متاحة لك في هذا الفصل" /> : (
        <>
          <div role="tablist" aria-label="مواد الفصل" className="mb-4 flex flex-wrap gap-2">
            {r.subjects.map((s) => (
              <button key={s.classroom_id} role="tab" aria-selected={subj?.classroom_id === s.classroom_id}
                onClick={() => nav({ to: "/app/classrooms/section/$id", params: { id }, search: { tab: "subjects", subject: s.classroom_id }, replace: true })}
                className={cn("rounded-full border px-4 py-2 text-sm", subj?.classroom_id === s.classroom_id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
                {s.subject}{s.can_post ? " · موادي" : ""}
              </button>
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              {subj && (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Link to="/app/homework" search={{ course: subj.course_id }} className="rounded-md border px-3 py-1.5 text-sm text-primary">واجبات {subj.subject} ←</Link>
                  </div>
                  <ClassroomPosts key={subj.classroom_id} classroom={subj.classroom_id} courseId={subj.course_id} />
                </>
              )}
            </div>
            <aside className="rounded-2xl border bg-card p-5">
              <h3 className="mb-2 font-semibold">المواد والمعلمون</h3>
              <ul className="space-y-1 text-sm">
                {r.subjects.map((s) => <li key={s.classroom_id} className="flex justify-between gap-2"><span>{s.subject}</span><span className="text-muted-foreground">{s.teachers.join("، ") || "—"}</span></li>)}
              </ul>
            </aside>
          </div>
        </>
      ))}

      {cur === "students" && (
        <section className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 font-semibold">الطلاب ({r.students?.length ?? 0})</h3>
          {r.students?.length ? <ol className="grid list-decimal gap-1 ps-5 text-sm sm:grid-cols-2">{r.students.map((n, i) => <li key={i}>{n}</li>)}</ol>
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
        <section className="rounded-2xl border bg-card p-5">
          <h3 className="mb-2 font-semibold">مجموعة الفصل</h3>
          {r.class_group ? (
            <Button asChild><Link to="/app/communication" search={{ c: r.class_group }}><MessagesSquare className="size-4" /> فتح مجموعة الفصل</Link></Button>
          ) : <p className="text-sm text-muted-foreground">لست عضوًا في مجموعة هذا الفصل. العضوية في المجموعة مستقلة عن الفصل الرقمي وتُدار من التواصل.</p>}
        </section>
      )}
    </>
  );
}
