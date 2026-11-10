import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CalendarCheck, CalendarDays, ClipboardList, GraduationCap, Layers, MessagesSquare, PartyPopper, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import { Bars, Donut, Kpi, KpiGrid, Meter, NoData, Panel, Trend, lastDays } from "@/components/dashboard/kit";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { ChildOverview } from "@/components/family/child-overview";
import { NAV_BY_ROLE, ROLE_LABELS, canManage, type NavKey } from "@/lib/roles";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { OwnerPortal } from "@/components/owner-portal";
import { PlatformHome } from "@/components/platform/platform-home";
import { WorkToday } from "@/components/work-today";
import { OpsHome } from "@/components/maintenance/ops-home";
import { useOpsStaff } from "@/lib/ops-staff";


async function count(table: string, schoolId: string, extra?: (q: ReturnType<typeof db.from>) => unknown) {
  let q = db.from(table).select("id", { count: "exact", head: true }).eq("school_id", schoolId);
  if (extra) q = extra(q);
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

const today = () => new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(new Date());

const QUICK: Partial<Record<NavKey, { label: string; hint: string; to: string; icon: LucideIcon }>> = {
  students: { label: "الطلاب والتسكين", hint: "إضافة طالب وتسكينه في شعبة", to: "/app/students", icon: GraduationCap },
  teachers: { label: "الكادر التعليمي", hint: "ملفات المعلمين التعليمية", to: "/app/teachers", icon: UsersRound },
  courses: { label: "المقررات والتكليفات", hint: "توزيع المعلمين واعتماده", to: "/app/courses", icon: BookOpen },
  schedule: { label: "الجدول المدرسي", hint: "إعداد الجدول ونشره", to: "/app/schedule", icon: CalendarDays },
  communication: { label: "التواصل", hint: "الرسائل والمجموعات والتعاميم", to: "/app/communication", icon: MessagesSquare },
  homework: { label: "الواجبات", hint: "متابعة الواجبات والنتائج", to: "/app/homework", icon: ClipboardList },
};

/** Role home dashboard for /app (kept outside the route file so the route stays code-split). */
export function Home() {
  const { active, user } = useSession();
  const ops = useOpsStaff(active ?? null, user?.id);
  const opsOnly = ops.opsOnly;

  if (!active) return null;
  return (
    <>
      <PageHeader eyebrow={today()} title="لوحة التحكم المركزية" desc={`${ops.title ?? ROLE_LABELS[active.role]} · ${active.schoolName}${active.orgName ? ` — ${active.orgName}` : ""}`} />
      {!active.schoolId && ops.central ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {([["/app/hr", "ملفات الموظفين", "إضافة الموظفين وتعديل ملفاتهم"], ["/app/hr/leave", "الإجازات والاستئذان", "الطلبات بانتظار اعتماد الموارد البشرية"], ["/app/hr/payroll", "مسير الرواتب", "إعداد المسير ومراجعته"]] as const).map(([to, t, h]) => (
            <Link key={to} to={to} className="rounded-2xl border bg-card p-5 shadow-sm hover:border-primary"><p className="font-bold">{t}</p><p className="mt-1 text-sm text-muted-foreground">{h}</p></Link>))}
        </div>
      ) : active.role === "platform_admin" && !active.schoolId ? (
        <PlatformHome />
      ) : !active.schoolId ? (
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

const HW_STATUS: Record<string, string> = { draft: "مسودة", scheduled: "مجدول", published: "منشور", closed: "مغلق", cancelled: "ملغى" };
const ATT_KEYS = [{ key: "present", name: "حاضر" }, { key: "late", name: "متأخر" }, { key: "absent", name: "غائب" }];

function tally<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) ?? "—"; m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

export function StaffHome({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const s = ctx.schoolId;
  const nav = NAV_BY_ROLE[ctx.role];
  const has = (k: NavKey) => nav.includes(k);
  const go = (k: NavKey, to: string) => (has(k) ? to : undefined);
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
  const days = lastDays(7);
  const charts = useQuery({
    queryKey: ["dash-charts", s],
    queryFn: async () => {
      const safe = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>) => { const r = await p; return r.error ? ([] as unknown as T) : ((r.data ?? []) as T); };
      const [secs, enr, studs, att, hw, tch] = await Promise.all([
        safe<Row[]>(db.from("sections").select("id,name,capacity,grades(name)").eq("school_id", s).limit(200)),
        safe<Row[]>(db.from("enrollments").select("section_id").eq("school_id", s).eq("status", "active").limit(5000)),
        safe<Row[]>(db.from("students").select("gender").eq("school_id", s).eq("status", "active").limit(5000)),
        safe<Row[]>(db.from("attendance_days").select("date,status").eq("school_id", s).gte("date", days[0]!.iso).limit(10000)),
        safe<Row[]>(db.from("homework").select("status,kind,due_at").eq("school_id", s).limit(3000)),
        safe<Row[]>(db.from("teachers").select("specialization").eq("school_id", s).eq("status", "active").limit(1000)),
      ]);
      const per = tally(enr, (r) => r["section_id"]);
      const sections = secs.map((x) => ({ name: `${x["grades"]?.name ? x["grades"].name + " / " : ""}${x["name"]}`, value: per.get(x["id"]) ?? 0, max: x["capacity"] ?? 0 })).sort((a, b) => b.value - a.value);
      const g = tally(studs, (r) => r["gender"]);
      const gender = [{ name: "ذكور", value: g.get("male") ?? 0 }, { name: "إناث", value: g.get("female") ?? 0 }, { name: "غير محدد", value: (g.get("—") ?? 0) }].filter((x) => x.value);
      const attendance = days.map((d) => {
        const r = att.filter((a) => a["date"] === d.iso);
        return { name: d.name, present: r.filter((a) => a["status"] === "present").length, late: r.filter((a) => a["status"] === "late").length, absent: r.filter((a) => a["status"] === "absent" || a["status"] === "in_school_absent").length };
      });
      const today = attendance[attendance.length - 1]!;
      const hws = tally(hw, (r) => r["status"]);
      const homework = [...hws].map(([k, v]) => ({ name: HW_STATUS[k] ?? k, value: v }));
      const now = Date.now();
      const dueSoon = hw.filter((h) => h["status"] === "published" && h["due_at"] && new Date(h["due_at"]).getTime() > now && new Date(h["due_at"]).getTime() < now + 7 * 86400000).length;
      const spec = [...tally(tch, (r) => (r["specialization"] || "غير محدد") as string)].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
      return { sections, gender, attendance, today, homework, dueSoon, spec };
    },
  });
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data, c = charts.data;
  const attention = d ? [
    d.unplaced > 0 && has("students") && { text: `${d.unplaced} طالب منتظم بلا تسكين في شعبة`, to: "/app/students", cta: "تسكين" },
    d.pending > 0 && has("courses") && { text: `${d.pending} تكليف معلم بانتظار الاعتماد`, to: "/app/courses", cta: "مراجعة" },
    d.courses > 0 && d.classrooms < d.courses && { text: `${d.courses - d.classrooms} مقرر بلا فصل رقمي (يُنشأ عند اعتماد التكليف)`, to: "/app/courses", cta: "المقررات" },
    c && c.today.absent > 0 && has("attendance") && { text: `${c.today.absent} غياب مسجّل اليوم`, to: "/app/attendance", cta: "الحضور" },
  ].filter(Boolean) as { text: string; to: string; cta: string }[] : [];
  const quick = nav.map((k) => QUICK[k]).filter(Boolean) as NonNullable<(typeof QUICK)[NavKey]>[];
  const rate = c && c.today.present + c.today.late + c.today.absent ? Math.round(((c.today.present + c.today.late) / (c.today.present + c.today.late + c.today.absent)) * 100) : null;
  return (
    <div className="space-y-6">
      <KpiGrid>
        <Kpi tone={0} label="طالب منتظم" value={d?.students} icon={GraduationCap} to={go("students", "/app/students")} hint={d ? `${d.students - d.unplaced} مسكّن في شعبة` : undefined} />
        <Kpi tone={1} label="معلم نشط" value={d?.teachers} icon={UsersRound} to={go("teachers", "/app/teachers")} hint={d && d.teachers ? `${(d.students / d.teachers).toFixed(1)} طالب لكل معلم` : undefined} />
        <Kpi tone={2} label="شعبة" value={d?.sections} icon={Layers} to={go("academic", "/app/academic")} />
        <Kpi tone={3} label="مقرر" value={d?.courses} icon={BookOpen} to={go("courses", "/app/courses")} hint={d?.pending ? `${d.pending} تكليف بانتظار الاعتماد` : undefined} />
        <Kpi tone={4} label="حضور اليوم" value={rate == null ? "—" : `${rate}%`} icon={CalendarCheck} to={go("attendance", "/app/attendance")} hint={c ? `${c.today.present + c.today.late} حاضر · ${c.today.absent} غائب` : undefined} />
        <Kpi tone={0} label="واجبات هذا الأسبوع" value={c?.dueSoon} icon={ClipboardList} to={go("homework", "/app/homework")} />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="الحضور خلال آخر 7 أيام" to={go("attendance", "/app/attendance")} className="lg:col-span-2">
          {!c ? <LoadingState rows={3} /> : <Trend data={c.attendance} keys={ATT_KEYS} height={220} />}
        </Panel>
        <Panel title="الطلاب حسب الجنس" to={go("students", "/app/students")}>
          {!c ? <LoadingState rows={3} /> : <Donut data={c.gender} center="طالب" />}
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="تسكين الشعب (الطلاب / السعة)" to={go("students", "/app/students")} className="lg:col-span-2">
          {!c ? <LoadingState rows={3} /> : <Meter rows={c.sections.slice(0, 8)} />}
        </Panel>
        <Panel title="الواجبات والاختبارات" to={go("homework", "/app/homework")}>
          {!c ? <LoadingState rows={3} /> : <Donut data={c.homework} center="عنصر" />}
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="المعلمون حسب التخصص" to={go("teachers", "/app/teachers")}>
          {!c ? <LoadingState rows={3} /> : <Bars data={c.spec} color={1} />}
        </Panel>
        <Panel title="يحتاج إلى متابعة">
          {!d ? <LoadingState rows={2} /> : !attention.length ? <NoData text="لا توجد بنود معلقة الآن ✓" /> : (
            <ul className="divide-y">
              {attention.map((a) => (
                <li key={a.text} className="flex items-center gap-3 py-3">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
                  <span className="min-w-0 flex-1 text-sm">{a.text}</span>
                  <Link to={a.to} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-secondary">{a.cta}<ArrowLeft className="size-3.5" /></Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="انتقال سريع">
          <div className="grid gap-2">
            {quick.slice(0, 6).map((x) => (
              <Link key={x.to} to={x.to} className="group flex items-center gap-3 rounded-xl border p-2.5 transition-colors hover:border-primary/40 hover:bg-secondary/40">
                <x.icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{x.label}</span><span className="block truncate text-xs text-muted-foreground">{x.hint}</span></span>
                <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
              </Link>
            ))}
          </div>
        </Panel>
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
        .select("id, status, start_date, end_date, teachers!inner(user_id), courses(section_id, subjects(name), sections(name, grades(name)), classrooms(id))")
        .eq("school_id", schoolId)
        .eq("teachers.user_id", auth.user.id)
        .in("status", ["approved", "pending"]);
      if (error) throw error;
      return data as Row[];
    },
  });
  const hw = useQuery({
    queryKey: ["teacher-dash-hw", schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data } = await db.from("homework").select("id,status,kind,due_at").eq("school_id", schoolId).eq("created_by", auth.user!.id).limit(1000);
      const rows = (data ?? []) as Row[];
      const ids = rows.filter((r) => r["status"] === "published").map((r) => r["id"]);
      let toGrade = 0, graded = 0;
      if (ids.length) {
        const sub = await db.from("homework_submissions").select("homework_id", { count: "exact", head: true }).in("homework_id", ids);
        const gr = await db.from("homework_grades").select("homework_id", { count: "exact", head: true }).in("homework_id", ids);
        graded = gr.count ?? 0; toGrade = Math.max(0, (sub.count ?? 0) - graded);
      }
      const now = Date.now();
      const due = rows.filter((r) => r["status"] === "published" && r["due_at"] && new Date(r["due_at"]).getTime() > now).length;
      const byStatus = [...tally(rows, (r) => r["status"])].map(([k, v]) => ({ name: HW_STATUS[k] ?? k, value: v }));
      const byKind = [...tally(rows, (r) => (r["kind"] === "test" ? "اختبار" : "واجب"))].map(([name, value]) => ({ name, value }));
      return { total: rows.length, due, toGrade, graded, byStatus, byKind };
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const approved = (q.data ?? []).filter((a) => a["status"] === "approved");
  const sections = new Set(approved.map((a) => a["courses"]?.section_id)).size;
  const h = hw.data;
  return (
    <div className="space-y-6">
      <KpiGrid>
        <Kpi tone={0} label="مقرر معتمد" value={approved.length} icon={BookOpen} to="/app/classrooms" />
        <Kpi tone={1} label="شعبة أدرّسها" value={sections} icon={Layers} to="/app/classrooms" />
        <Kpi tone={2} label="واجبات واختبارات" value={h?.total} icon={ClipboardList} to="/app/homework" />
        <Kpi tone={3} label="مفتوحة الآن" value={h?.due} icon={CalendarDays} to="/app/homework" />
        <Kpi tone={4} label="تسليمات بانتظار التصحيح" value={h?.toGrade} icon={ClipboardList} to="/app/homework" />
        <Kpi tone={0} label="التواصل" value="←" icon={MessagesSquare} to="/app/communication" hint="الرسائل والمجموعات" />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="واجباتي حسب الحالة" to="/app/homework">{!h ? <LoadingState rows={3} /> : <Donut data={h.byStatus} center="عنصر" />}</Panel>
        <Panel title="الواجبات مقابل الاختبارات" to="/app/homework">{!h ? <LoadingState rows={3} /> : <Bars data={h.byKind} color={2} height={160} />}</Panel>
      </div>
      <Panel title="موادي وشعبي" to="/app/classrooms" cta="الفصول الرقمية">
        {!q.data?.length ? <EmptyState title="لا توجد مقررات مكلف بها" hint="تظهر هنا المواد والشعب بعد اعتماد تكليفك." /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data.map((a) => {
              const c = a["courses"];
              const room = Array.isArray(c?.classrooms) ? c.classrooms[0] : c?.classrooms;
              const ok = a["status"] === "approved";
              return (
                <div key={a["id"]} className="flex flex-col rounded-xl border bg-background p-4">
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
      </Panel>
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
  const open = (kids.data ?? []).filter((k) => k["verified"] && k["can_follow"]);
  const ids = open.map((k) => k["student_id"] as string);
  const stats = useQuery({
    queryKey: ["family-dash", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const from = lastDays(30)[0]!.iso;
      const [att, fin] = await Promise.all([
        db.from("attendance_days").select("student_id,status").in("student_id", ids).gte("date", from).limit(5000),
        db.from("fin_student_accounts").select("student_id,balance,currency").in("student_id", ids),
      ]);
      const a = (att.data ?? []) as Row[];
      const per = ids.map((id) => {
        const r = a.filter((x) => x["student_id"] === id);
        const pres = r.filter((x) => x["status"] === "present" || x["status"] === "late").length;
        return { id, days: r.length, rate: r.length ? Math.round((pres / r.length) * 100) : null, absent: r.filter((x) => x["status"] === "absent").length };
      });
      const f = (fin.data ?? []) as Row[];
      const balance = f.length ? f.reduce((s, x) => s + Number(x["balance"] ?? 0), 0) : null;
      return { per, balance, currency: f[0]?.["currency"] ?? "ر.س", absent: per.reduce((s, x) => s + x.absent, 0) };
    },
  });
  if (kids.isLoading) return <LoadingState />;
  if (kids.error) return <ErrorState message={arabicError(kids.error)} onRetry={() => kids.refetch()} />;
  const st = stats.data;
  const avg = st && st.per.some((p) => p.rate != null) ? Math.round(st.per.filter((p) => p.rate != null).reduce((s, p) => s + p.rate!, 0) / st.per.filter((p) => p.rate != null).length) : null;
  const first = ids[0];
  return (
    <div className="space-y-6">
      <KpiGrid>
        <Kpi tone={0} label="أبناء مرتبطون" value={kids.data?.length ?? 0} icon={GraduationCap} hint={`${open.length} موثّق`} />
        <Kpi tone={1} label="نسبة الحضور (30 يومًا)" value={avg == null ? "—" : `${avg}%`} icon={CalendarCheck} to={first ? `/app/child/${first}` : undefined} />
        <Kpi tone={2} label="أيام غياب (30 يومًا)" value={st?.absent ?? (ids.length ? undefined : 0)} icon={CalendarDays} to={first ? `/app/child/${first}` : undefined} />
        <Kpi tone={3} label="الرصيد المالي" value={st?.balance == null ? "—" : `${st.balance} ${st.currency}`} icon={Wallet} hint={st?.balance == null ? "بانتظار الربط المالي" : "الرصيد المتبقي"} to={first ? `/app/child/${first}` : undefined} />
        <Kpi tone={4} label="الفعاليات والرحلات" value="←" icon={PartyPopper} to="/app/events" />
        <Kpi tone={0} label="التواصل مع المدرسة" value="←" icon={MessagesSquare} to="/app/communication" />
      </KpiGrid>
      {!!st?.per.length && (
        <Panel title="حضور الأبناء خلال 30 يومًا">
          <Meter rows={st.per.map((p) => ({ name: open.find((k) => k["student_id"] === p.id)?.["student"] ?? "", value: p.rate ?? 0, max: 100 }))} />
        </Panel>
      )}
      <section>
        <h2 className="mb-3 text-lg font-bold">أبنائي</h2>
        {!kids.data?.length ? <EmptyState title="لا يوجد أبناء مرتبطون بحسابك" hint="تواصل مع المدرسة لربط أبنائك بحسابك." /> : (
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {kids.data.map((k) => {
              const ok = k["verified"] && k["can_follow"];
              const p = st?.per.find((x) => x.id === k["student_id"]);
              const body = (
                <>
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary font-display text-lg text-primary-foreground">{String(k["student"] ?? "؟").trim().charAt(0)}</span>
                    <div className="min-w-0"><p className="truncate font-bold">{k["student"] ?? "بانتظار توثيق العلاقة"}</p><p className="truncate text-sm text-muted-foreground">{k["school"]}</p></div>
                  </div>
                  {ok && <p className="mt-3 text-sm">{k["grade"] ? `${k["grade"]} / شعبة ${k["section"]}` : "لم يُسكَّن في شعبة بعد"}</p>}
                  {ok && p?.rate != null && <p className="text-xs text-muted-foreground">الحضور: {p.rate}% · غياب {p.absent} يوم</p>}
                  <p className="mt-2 text-xs text-primary">{ok ? "الجدول · الواجبات · الدرجات · الزيارات · البيانات المالية ←" : "ستظهر البيانات بعد توثيق المدرسة للعلاقة"}</p>
                </>
              );
              return (
                <li key={k["student_id"]}>
                  {ok ? <Link to="/app/child/$id" params={{ id: k["student_id"] }} className="block h-full rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40">{body}</Link>
                    : <div className="h-full rounded-2xl border bg-card p-4 opacity-80">{body}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
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
