import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CalendarDays, ClipboardList, GraduationCap, Layers, MessagesSquare, School, UserPlus, UsersRound, type LucideIcon } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/states";
import { ChildOverview } from "@/components/family/child-overview";
import { NAV_BY_ROLE, ROLE_LABELS, canManage, type NavKey } from "@/lib/roles";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { OwnerPortal } from "@/components/owner-portal";
import { WorkToday } from "@/components/work-today";
import { OpsHome } from "@/components/maintenance/ops-home";
import { useOpsStaff } from "@/lib/ops-staff";

export const Route = createFileRoute("/_authenticated/app/")({ component: Home });

async function count(table: string, schoolId: string, extra?: (q: ReturnType<typeof db.from>) => unknown) {
  let q = db.from(table).select("id", { count: "exact", head: true }).eq("school_id", schoolId);
  if (extra) q = extra(q);
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

const today = () => new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(new Date());

function Stat({ label, value, icon: Icon, to }: { label: string; value: number | undefined; icon: LucideIcon; to?: string | undefined }) {
  const body = (
    <div className="flex h-full items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Icon className="size-5" /></span>
      <div className="min-w-0">
        <p className="font-display text-2xl leading-none">{value ?? "…"}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

const QUICK: Partial<Record<NavKey, { label: string; hint: string; to: string; icon: LucideIcon }>> = {
  students: { label: "الطلاب والتسكين", hint: "إضافة طالب وتسكينه في شعبة", to: "/app/students", icon: GraduationCap },
  teachers: { label: "المعلمون", hint: "ملفات المعلمين التعليمية", to: "/app/teachers", icon: UsersRound },
  courses: { label: "المقررات والتكليفات", hint: "توزيع المعلمين واعتماده", to: "/app/courses", icon: BookOpen },
  schedule: { label: "الجدول المدرسي", hint: "إعداد الجدول ونشره", to: "/app/schedule", icon: CalendarDays },
  communication: { label: "التواصل", hint: "الرسائل والمجموعات والتعاميم", to: "/app/communication", icon: MessagesSquare },
  homework: { label: "الواجبات", hint: "متابعة الواجبات والنتائج", to: "/app/homework", icon: ClipboardList },
};

function Home() {
  const { active, user } = useSession();
  const ops = useOpsStaff(active ?? null, user?.id);
  const opsOnly = ops.opsOnly;

  if (!active) return null;
  return (
    <>
      <PageHeader eyebrow={today()} title={ops.title ? `لوحة ${ops.title}` : `لوحة ${ROLE_LABELS[active.role]}`} desc={`${active.schoolName}${active.orgName ? ` — ${active.orgName}` : ""}`} />
      {!active.schoolId ? (
        <EmptyState title="اختر مدرسة من شريط السياق" hint={active.role === "platform_admin" ? "أو افتح صفحة المؤسسات." : "أو أضف مدرسة من صفحة المدارس."} />
      ) : active.role === "org_owner" ? (
        <OwnerPortal orgId={active.orgId} />
      ) : (
        <div className="space-y-8">
          {active.role !== "platform_admin" && <WorkToday schoolId={active.schoolId} />}
          {canManage(active.role) || active.role === "student_affairs" || active.role === "dept_head" || active.role === "supervisor" ? (
        <StaffHome ctx={active as AppContext & { schoolId: string }} />
      ) : ops.loading ? <LoadingState /> : opsOnly ? <OpsHome orgId={active.orgId} me={ops.me} jobs={ops.jobs} pc={ops.hasPc} /> : active.role === "teacher" ? (
        <TeacherHome schoolId={active.schoolId} />
      ) : active.role === "guardian" ? (
        <GuardianHome />
      ) : active.role === "student" ? (
        <StudentHome schoolId={active.schoolId} />
      ) : (
        <EmptyState title="لا توجد مؤشرات إضافية لهذا الدور بعد" hint="سجلات هذا الدور الخاصة (الزيارات، الانصراف…) ستُبنى في حزم لاحقة؛ أعمالك المعلّقة تظهر أعلاه." />
      )}
        </div>
      )}
    </>
  );
}

export function StaffHome({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const s = ctx.schoolId;
  const nav = NAV_BY_ROLE[ctx.role];
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
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  const attention = d ? [
    d.unplaced > 0 && nav.includes("students") && { text: `${d.unplaced} طالب منتظم بلا تسكين في شعبة`, to: "/app/students", cta: "تسكين" },
    d.pending > 0 && nav.includes("courses") && { text: `${d.pending} تكليف معلم بانتظار الاعتماد`, to: "/app/courses", cta: "مراجعة" },
    d.courses > 0 && d.classrooms < d.courses && { text: `${d.courses - d.classrooms} مقرر بلا فصل رقمي (يُنشأ عند اعتماد التكليف)`, to: "/app/courses", cta: "المقررات" },
  ].filter(Boolean) as { text: string; to: string; cta: string }[] : [];
  const quick = nav.map((k) => QUICK[k]).filter(Boolean) as NonNullable<(typeof QUICK)[NavKey]>[];
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="طالب منتظم" value={d?.students} icon={GraduationCap} to={nav.includes("students") ? "/app/students" : undefined} />
        <Stat label="معلم نشط" value={d?.teachers} icon={UsersRound} to={nav.includes("teachers") ? "/app/teachers" : undefined} />
        <Stat label="شعبة" value={d?.sections} icon={Layers} />
        <Stat label="مقرر" value={d?.courses} icon={BookOpen} to={nav.includes("courses") ? "/app/courses" : undefined} />
        <Stat label="فصل رقمي" value={d?.classrooms} icon={School} to={nav.includes("classrooms") ? "/app/classrooms" : undefined} />
        <Stat label="بلا تسكين" value={d?.unplaced} icon={UserPlus} to={nav.includes("students") ? "/app/students" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="يحتاج إلى متابعة">
          {!d ? <LoadingState rows={2} /> : !attention.length ? (
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">لا توجد بنود معلقة الآن.</div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {attention.map((a) => (
                <li key={a.text} className="flex items-center gap-3 p-4">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
                  <span className="min-w-0 flex-1 text-sm">{a.text}</span>
                  <Link to={a.to} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-secondary">{a.cta}<ArrowLeft className="size-4" /></Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {!!quick.length && (
          <Section title="انتقال سريع">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {quick.slice(0, 5).map((x) => (
                <Link key={x.to} to={x.to} className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-secondary/40">
                  <x.icon className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{x.label}</span><span className="block truncate text-xs text-muted-foreground">{x.hint}</span></span>
                  <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
                </Link>
              ))}
            </div>
          </Section>
        )}
      </div>
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
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-8">
      <div className="grid gap-2 sm:grid-cols-3">
        {(["homework", "communication", "schedule"] as const).map((k) => { const x = QUICK[k]!; return (
          <Link key={k} to={x.to} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><x.icon className="size-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold">{x.label}</span><span className="block truncate text-xs text-muted-foreground">{x.hint}</span></span>
          </Link>
        ); })}
      </div>
      <Section title="موادي وشعبي">
        {!q.data?.length ? <EmptyState title="لا توجد مقررات مكلف بها" hint="تظهر هنا المواد والشعب بعد اعتماد تكليفك." /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {q.data.map((a) => {
              const c = a["courses"];
              const room = Array.isArray(c?.classrooms) ? c.classrooms[0] : c?.classrooms;
              const ok = a["status"] === "approved";
              return (
                <div key={a["id"]} className="flex flex-col rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-bold">{c?.subjects?.name}</p><p className="text-sm text-muted-foreground">{c?.sections?.grades?.name} / شعبة {c?.sections?.name}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"}`}>{ok ? "معتمد" : "بانتظار الاعتماد"}</span>
                  </div>
                  {room && <Link to="/app/classrooms/$id" params={{ id: room.id }} className="mt-4 inline-flex min-h-9 items-center gap-1 self-start rounded-lg bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-secondary/70">فتح الفصل الرقمي <ArrowLeft className="size-4" /></Link>}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function GuardianHome() {
  // first screen: every child linked to this account in all schools of the group (server: family_children)
  const kids = useQuery({
    queryKey: ["family-children"],
    queryFn: async () => {
      const { data, error } = await db.rpc("family_children");
      if (error) throw error;
      return data as Row[];
    },
  });
  if (kids.isLoading) return <LoadingState />;
  if (kids.error) return <ErrorState message={arabicError(kids.error)} onRetry={() => kids.refetch()} />;
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">أبنائي</h2>
      {!kids.data?.length ? <EmptyState title="لا يوجد أبناء مرتبطون بحسابك" hint="تواصل مع المدرسة لربط أبنائك بحسابك." /> : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {kids.data.map((k) => {
            const open = k["verified"] && k["can_follow"];
            const body = (
              <>
                <p className="font-bold">{k["student"] ?? "بانتظار توثيق العلاقة"}</p>
                <p className="text-sm text-muted-foreground">{k["school"]}</p>
                {open && <p className="text-sm">{k["grade"] ? `${k["grade"]} / شعبة ${k["section"]}` : "لم يُسكَّن في شعبة بعد"}</p>}
                {open && <p className="mt-1 text-xs text-muted-foreground">رقم C‑Smart: {k["csmart_no"] ?? "غير مسجّل"}</p>}
                <p className="mt-2 text-xs">{open ? "الجدول · الفصل الرقمي · الواجبات · الزيارات · البيانات المالية ←" : "ستظهر البيانات بعد توثيق المدرسة للعلاقة"}</p>
              </>
            );
            return (
              <li key={k["student_id"]}>
                {open ? <Link to="/app/child/$id" params={{ id: k["student_id"] }} className="block h-full rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">{body}</Link>
                  : <div className="h-full rounded-xl border bg-card p-4 opacity-80">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StudentHome({ schoolId }: { schoolId: string }) {
  const me = useQuery({
    queryKey: ["me-student", schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data, error } = await db.from("students").select("id").eq("school_id", schoolId).eq("user_id", auth.user!.id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  if (me.isLoading) return <LoadingState />;
  if (!me.data) return <EmptyState title="لم يُربط ملفك بعد" hint="تواصل مع إدارة المدرسة." />;
  return <ChildOverview studentId={me.data["id"]} />;
}
