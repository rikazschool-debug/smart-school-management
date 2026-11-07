import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { ClassroomPosts } from "@/components/classroom-posts";
import { arabicError } from "@/lib/session";
import { cn } from "@/lib/utils";

type Room = {
  id: string; title: string; school_id: string;
  subjects: { classroom_id: string; course_id: string; subject: string; can_post: boolean; teachers: string[] }[];
  students: string[];
};

export const Route = createFileRoute("/_authenticated/app/classrooms/section/$id")({
  head: () => ({ meta: [{ title: "فصل الشعبة — ركاز" }, { name: "description", content: "الفصل الرقمي للشعبة: المواد والمعلمون والمشاركات." }] }),
  validateSearch: (s: Record<string, unknown>): { subject?: string } => (s["subject"] ? { subject: String(s["subject"]) } : {}),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { subject } = Route.useSearch();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["section-room", id],
    queryFn: async () => {
      const { data, error } = await db.rpc("section_room_get", { _room: id });
      if (error) throw error;
      return data as Room;
    },
    retry: false,
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return /not_allowed/.test(String((q.error as Error).message)) || (q.error as { code?: string }).code === "42501"
    ? <EmptyState title="الفصل غير موجود أو ليس ضمن صلاحياتك" /> : <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const r = q.data!;
  const cur = r.subjects.find((s) => s.classroom_id === subject) ?? r.subjects[0];
  return (
    <>
      <Link to="/app/classrooms" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />كل الفصول</Link>
      <PageHeader title={r.title} desc="فصل الشعبة: كل مادة لها مشاركاتها، والمعلم ينشر في مواده فقط." />
      {!r.subjects.length ? <EmptyState title="لا توجد مواد متاحة لك في هذا الفصل" /> : (
        <>
          <div role="tablist" aria-label="مواد الفصل" className="mb-4 flex flex-wrap gap-2">
            {r.subjects.map((s) => (
              <button key={s.classroom_id} role="tab" aria-selected={cur?.classroom_id === s.classroom_id}
                onClick={() => nav({ to: "/app/classrooms/section/$id", params: { id }, search: { subject: s.classroom_id }, replace: true })}
                className={cn("rounded-full border px-4 py-2 text-sm", cur?.classroom_id === s.classroom_id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
                {s.subject}{s.can_post ? " · موادي" : ""}
              </button>
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              {cur && (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Link to="/app/homework" search={{ course: cur.course_id }} className="rounded-md border px-3 py-1.5 text-sm text-primary">واجبات {cur.subject} ←</Link>
                  </div>
                  <ClassroomPosts key={cur.classroom_id} classroom={cur.classroom_id} courseId={cur.course_id} />
                </>
              )}
            </div>
            <aside className="space-y-4 rounded-2xl border bg-card p-5">
              <div>
                <h3 className="mb-2 font-semibold">المواد والمعلمون</h3>
                <ul className="space-y-1 text-sm">
                  {r.subjects.map((s) => <li key={s.classroom_id} className="flex justify-between gap-2"><span>{s.subject}</span><span className="text-muted-foreground">{s.teachers.join("، ") || "—"}</span></li>)}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">الطلاب ({r.students.length})</h3>
                {r.students.length ? <ul className="space-y-1 text-sm">{r.students.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p className="text-sm text-muted-foreground">لا يوجد طلاب مسكّنون في الشعبة.</p>}
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
