import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { arabicError } from "@/lib/session";
import { ClassroomPosts } from "@/components/classroom-posts";

export const Route = createFileRoute("/_authenticated/app/classrooms/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const room = useQuery({
    queryKey: ["classroom", id],
    queryFn: async () => {
      const { data, error } = await db.from("classrooms").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const members = useQuery({
    queryKey: ["classroom-members", id],
    enabled: !!room.data,
    queryFn: async () => {
      const { data, error } = await db.rpc("classroom_members", { _classroom: id });
      if (error) throw error;
      return data as Row[];
    },
  });
  if (room.isLoading) return <LoadingState />;
  if (room.error) return <ErrorState message={arabicError(room.error)} onRetry={() => room.refetch()} />;
  if (!room.data) return <EmptyState title="الفصل غير موجود أو ليس ضمن صلاحياتك" />;
  const teachers = members.data?.filter((m) => m["member_type"] === "teacher") ?? [];
  const students = members.data?.filter((m) => m["member_type"] === "student") ?? [];
  return (
    <>
      <Link to="/app/classrooms" className="text-sm text-primary">→ كل الفصول</Link>
      <PageHeader title={room.data["title"]} />
      <Link to="/app/homework" search={{ course: room.data["course_id"] }} className="mb-4 inline-block rounded-md border px-3 py-1.5 text-sm text-primary">واجبات هذا المقرر ←</Link>
      <Link to="/app/virtual-classes" className="mb-4 ms-2 inline-block rounded-md border px-3 py-1.5 text-sm text-primary">الحصص الافتراضية ←</Link>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <ClassroomPosts classroom={id} courseId={room.data["course_id"]} />
        </div>
        <aside className="space-y-4 rounded-2xl border bg-card p-5">
          {members.isLoading ? <LoadingState /> : members.error ? <ErrorState message={arabicError(members.error)} onRetry={() => members.refetch()} /> : (
            <>
              <div>
                <h3 className="mb-2 font-semibold">المعلم</h3>
                {teachers.length ? teachers.map((t) => <p key={t["ref_id"]}>{t["full_name"]}</p>) : <p className="text-sm text-muted-foreground">—</p>}
              </div>
              <div>
                <h3 className="mb-2 font-semibold">الطلاب ({students.length})</h3>
                <ul className="space-y-1 text-sm">
                  {students.map((s) => <li key={s["ref_id"]}>{s["full_name"]}</li>)}
                </ul>
                {!students.length && <p className="text-sm text-muted-foreground">لا يوجد طلاب مسكّنون في الشعبة.</p>}
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
