import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { ClassroomGrid, useClassrooms } from "./classrooms.index";
import { ROLE_LABELS, canManage } from "@/lib/roles";
import { arabicError, useSession, type AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/")({ component: Home });

async function count(table: string, schoolId: string, extra?: (q: ReturnType<typeof db.from>) => unknown) {
  let q = db.from(table).select("id", { count: "exact", head: true }).eq("school_id", schoolId);
  if (extra) q = extra(q);
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

function Stat({ label, value, to }: { label: string; value: number | undefined; to?: string }) {
  const body = (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl text-primary">{value ?? "…"}</p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function Home() {
  const { active } = useSession();
  if (!active) return null;
  return (
    <>
      <PageHeader title={`لوحة ${ROLE_LABELS[active.role]}`} desc={`${active.schoolName}${active.orgName ? ` — ${active.orgName}` : ""}`} />
      {!active.schoolId ? (
        <EmptyState title="اختر مدرسة من شريط السياق" hint={active.role === "platform_admin" ? "أو افتح صفحة المؤسسات." : "أو أضف مدرسة من صفحة المدارس."} />
      ) : canManage(active.role) || active.role === "student_affairs" || active.role === "dept_head" || active.role === "supervisor" ? (
        <StaffHome ctx={active as AppContext & { schoolId: string }} />
      ) : active.role === "teacher" ? (
        <TeacherHome schoolId={active.schoolId} />
      ) : active.role === "guardian" ? (
        <GuardianHome schoolId={active.schoolId} />
      ) : active.role === "student" ? (
        <StudentHome schoolId={active.schoolId} />
      ) : (
        <EmptyState title="هذه اللوحة جاهزة هيكليًا فقط" hint="وظائف هذا الدور (السجلات الخاصة، الزيارات، الانصراف) ستُبنى في حزم لاحقة، ولا تُعرض بيانات حساسة هنا." />
      )}
    </>
  );
}

function StaffHome({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const s = ctx.schoolId;
  const q = useQuery({
    queryKey: ["stats", s],
    queryFn: async () => {
      const [students, teachers, sections, courses, pending, classrooms, enrolled] = await Promise.all([
        count("students", s, (q) => q.eq("status", "active")),
        count("teachers", s, (q) => q.eq("status", "active")),
        count("sections", s),
        count("courses", s),
        count("teacher_assignments", s, (q) => q.eq("status", "pending")),
        count("classrooms", s),
        count("enrollments", s, (q) => q.eq("status", "active")),
      ]);
      return { students, teachers, sections, courses, pending, classrooms, unplaced: Math.max(0, students - enrolled) };
    },
  });
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const d = q.data;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="الطلاب المنتظمون" value={d?.students} to="/app/students" />
      <Stat label="طلاب غير مسكّنين" value={d?.unplaced} to="/app/students" />
      <Stat label="المعلمون" value={d?.teachers} />
      <Stat label="الشعب" value={d?.sections} />
      <Stat label="المقررات" value={d?.courses} />
      <Stat label="تكليفات بانتظار الاعتماد" value={d?.pending} />
      <Stat label="الفصول الرقمية" value={d?.classrooms} />
    </div>
  );
}

function TeacherHome({ schoolId }: { schoolId: string }) {
  const q = useQuery({
    queryKey: ["my-assignments", schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data, error } = await db
        .from("teacher_assignments")
        .select("id, status, start_date, end_date, teachers!inner(user_id), courses(subjects(name), sections(name, grades(name)), classrooms(id))")
        .eq("school_id", schoolId)
        .eq("teachers.user_id", auth.user.id)
        .in("status", ["approved", "pending"]);
      if (error) throw error;
      return data as Row[];
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  if (!q.data?.length) return <EmptyState title="لا توجد مقررات مكلف بها" hint="تظهر هنا المواد والشعب بعد اعتماد تكليفك." />;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">موادي وشعبي</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {q.data.map((a) => {
          const c = a["courses"];
          const room = Array.isArray(c?.classrooms) ? c.classrooms[0] : c?.classrooms;
          return (
            <div key={a["id"]} className="rounded-xl border bg-card p-4">
              <p className="font-bold">{c?.subjects?.name}</p>
              <p className="text-sm text-muted-foreground">{c?.sections?.grades?.name} / شعبة {c?.sections?.name}</p>
              <p className="mt-2 text-xs">{a["status"] === "approved" ? "معتمد" : "بانتظار الاعتماد"}</p>
              {room && <Link to="/app/classrooms/$id" params={{ id: room.id }} className="mt-2 inline-block text-sm text-primary">فتح الفصل الرقمي ←</Link>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuardianHome({ schoolId }: { schoolId: string }) {
  const kids = useQuery({
    queryKey: ["my-children", schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data, error } = await db
        .from("student_guardians")
        .select("id, relationship, can_follow, can_pickup, verified, guardians!inner(user_id), students(id, full_name, enrollments(status, sections(name, grades(name))))")
        .eq("school_id", schoolId)
        .eq("guardians.user_id", auth.user.id);
      if (error) throw error;
      return data as Row[];
    },
  });
  const rooms = useClassrooms(schoolId);
  if (kids.isLoading) return <LoadingState />;
  if (kids.error) return <ErrorState message={arabicError(kids.error)} />;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-bold">أبنائي</h2>
        {!kids.data?.length ? <EmptyState title="لا يوجد أبناء مرتبطون بحسابك" /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {kids.data.map((k) => {
              const e = (k["students"]?.enrollments as Row[] | undefined)?.find((x) => x["status"] === "active");
              return (
                <div key={k["id"]} className="rounded-xl border bg-card p-4">
                  <p className="font-bold">{k["students"]?.full_name ?? "بانتظار توثيق العلاقة"}</p>
                  {e && <p className="text-sm text-muted-foreground">{e["sections"]?.grades?.name} / شعبة {e["sections"]?.name}</p>}
                  <p className="mt-2 text-xs">{k["verified"] ? "علاقة موثقة" : "العلاقة لم توثق بعد — ستظهر البيانات بعد التوثيق"}{k["can_pickup"] ? " · مفوض بالاستلام" : ""}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">فصول أبنائي</h2>
        {rooms.data?.length ? <ClassroomGrid rows={rooms.data} /> : <EmptyState title="لا توجد فصول رقمية بعد" />}
      </section>
    </div>
  );
}

function StudentHome({ schoolId }: { schoolId: string }) {
  const me = useQuery({
    queryKey: ["me-student", schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data, error } = await db.from("students").select("full_name, status, enrollments(status, sections(name, grades(name)))").eq("school_id", schoolId).eq("user_id", auth.user.id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const rooms = useClassrooms(schoolId);
  if (me.isLoading) return <LoadingState />;
  const e = (me.data?.["enrollments"] as Row[] | undefined)?.find((x) => x["status"] === "active");
  return (
    <div className="space-y-8">
      <div className="rounded-xl border bg-card p-5">
        <p className="font-bold">{me.data?.["full_name"] ?? "لم يُربط ملفك بعد"}</p>
        {e && <p className="text-sm text-muted-foreground">{e["sections"]?.grades?.name} / شعبة {e["sections"]?.name}</p>}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-bold">فصولي</h2>
        {rooms.data?.length ? <ClassroomGrid rows={rooms.data} /> : <EmptyState title="لا توجد فصول رقمية بعد" />}
      </section>
    </div>
  );
}
