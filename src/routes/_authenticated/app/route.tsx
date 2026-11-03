import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ConfirmHost } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Award, Briefcase,
  Bell, BookOpen, LifeBuoy, Megaphone, UserCircle, DoorOpen, ScanLine, ClipboardList, MessagesSquare, Building2, CalendarDays, GraduationCap, Home, LogOut, Menu, Network, School, ShieldCheck, UserCog, Users, UsersRound,
  ReceiptText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SessionProvider, arabicError, useSession } from "@/lib/session";
import { usePcMe } from "@/components/procurement/shared";
import { NAV_BY_ROLE, ROLE_LABELS, commTabs, scheduleLabel, type NavKey } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/states";
import { NotificationBell } from "@/components/notification-bell";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "لوحة ركاز" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

const NAV: Record<NavKey, { to: string; label: string; icon: typeof Home; tab?: "groups" | "manage" }> = {
  home: { to: "/app", label: "الرئيسية", icon: Home },
  platform: { to: "/app/platform", label: "المؤسسات", icon: ShieldCheck },
  schools: { to: "/app/schools", label: "المدارس والفروع", icon: Building2 },
  members: { to: "/app/members", label: "المستخدمون والأدوار", icon: UserCog },
  academic: { to: "/app/academic", label: "الإعداد الأكاديمي", icon: Network },
  teachers: { to: "/app/teachers", label: "المعلمون", icon: UsersRound },
  courses: { to: "/app/courses", label: "المقررات والتكليفات", icon: BookOpen },
  students: { to: "/app/students", label: "الطلاب والتسكين", icon: GraduationCap },
  guardians: { to: "/app/guardians", label: "أولياء الأمور", icon: Users },
  classrooms: { to: "/app/classrooms", label: "الفصول الرقمية", icon: School },
  homework: { to: "/app/homework", label: "الواجبات والاختبارات", icon: ClipboardList },
  grades: { to: "/app/grades", label: "أرشيف الدرجات الفصلية", icon: Award },
  results: { to: "/app/results", label: "النتائج", icon: Award },
  schedule: { to: "/app/schedule", label: "الجدول المدرسي", icon: CalendarDays },
  attendance: { to: "/app/attendance", label: "الحضور والخروج", icon: ScanLine },
  station: { to: "/app/attendance-station", label: "المسح والبوابة والنداء", icon: ScanLine },
  pickup: { to: "/app/pickup", label: "الخروج والاستئذان", icon: DoorOpen },
  admin: { to: "/app/admin", label: "التكليفات والطلبات", icon: Briefcase },
  duties: { to: "/app/admin/duties", label: "المناوبات", icon: ShieldCheck },
  meetings: { to: "/app/admin/meetings", label: "الاجتماعات", icon: UsersRound },
  calendar: { to: "/app/admin/calendar", label: "تقويمي", icon: CalendarDays },
  communication: { to: "/app/communication", label: "التواصل", icon: MessagesSquare },
  comm_groups: { to: "/app/communication", label: "المجموعات", icon: Users, tab: "groups" },
  circulars: { to: "/app/circulars", label: "التعاميم", icon: Megaphone },
  comm_manage: { to: "/app/communication", label: "إدارة المجموعات", icon: UserCog, tab: "manage" },
  profile: { to: "/app/profile", label: "الملف الشخصي", icon: UserCircle },
  notifications: { to: "/app/notifications", label: "الإشعارات", icon: Bell },
  support: { to: "/app/support", label: "الدعم والمساعدة", icon: LifeBuoy },
  procurement: { to: "/app/procurement", label: "المشتريات والعهد", icon: ReceiptText },
};

const NAV_GROUPS: { label: string; keys: NavKey[] }[] = [
  { label: "", keys: ["home", "profile"] },
  { label: "المنصة والمؤسسة", keys: ["platform", "schools", "members"] },
  { label: "منطقة العمل", keys: ["academic", "courses", "admin", "duties", "calendar", "schedule", "procurement"] },
  { label: "الكادر التعليمي والطلاب", keys: ["teachers", "students", "guardians"] },
  { label: "التعليم", keys: ["classrooms", "homework", "grades", "results"] },
  { label: "الحضور والمواظبة", keys: ["attendance", "pickup", "station"] },
  { label: "التواصل والمحادثات", keys: ["communication", "comm_groups", "meetings", "circulars", "comm_manage"] },
  { label: "التنبيهات والدعم", keys: ["notifications", "support"] },
];

function AppLayout() {
  const { user } = Route.useRouteContext();
  return (
    <SessionProvider user={user}>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const { contexts, active, setActive, loading, user } = useSession();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  // Staff granted procurement permissions get a workspace entry; the server (pc_me → perm_scope) is the only source.
  const pcRole = !!active?.orgId && !["org_owner", "platform_admin", "student", "guardian"].includes(active.role);
  const pc = usePcMe(active?.orgId ?? null, pcRole);
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  useEffect(() => {
    if (!active) return;
    const k = `rikaz-login-toast:${user.id}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    toast.success(`تم تسجيل الدخول إلى حساب ${ROLE_LABELS[active.role]}`, { description: active.schoolName });
  }, [active, user.id]);
  if (loading) return <div className="p-10"><LoadingState /></div>;
  if (!active) return <Onboarding onSignOut={signOut} />;

  const ct = commTabs(active.role);
  const nav = [...NAV_BY_ROLE[active.role], "profile", "support", ...(ct.includes("circulars") ? ["circulars"] : []), ...(ct.includes("groups") ? ["comm_groups"] : []), ...(ct.includes("manage") ? ["comm_manage"] : []), ...(pcRole && pc.data?.enabled && pc.data.caps.view ? ["procurement"] : [])] as NavKey[];
  const groups = NAV_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => nav.includes(k)) })).filter((g) => g.keys.length);
  const initial = (user.email ?? "?").trim().charAt(0).toUpperCase();
  const sidebar = (
    <nav aria-label="القائمة الرئيسية" className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground">ر</span>
        <div className="min-w-0">
          <p className="font-display text-xl leading-none text-foreground">ركاز</p>
          <p data-school-name className="mt-1 truncate text-xs text-muted-foreground">{active.schoolName}</p>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.label}>
            {g.label && <p className="mb-1.5 flex items-center gap-2 border-r-[3px] border-primary px-3 py-1 text-[13px] font-bold text-primary">{g.label}</p>}
            <div className="space-y-0.5">
              {g.keys.map((k) => {
                const n = NAV[k];
                return (
                  <Link
                    key={k}
                    to={n.to}
                    {...(n.tab ? { search: { tab: n.tab } } : {})}
                    activeOptions={{ exact: k === "home" || k === "admin", includeSearch: k === "communication" || !!n.tab }}
                    onClick={() => setOpen(false)}
                    className="group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-primary"
                  >
                    <span aria-hidden className="absolute inset-y-2 right-0 w-1 rounded-l-full bg-sidebar-primary opacity-0 group-data-[status=active]:opacity-100" />
                    <n.icon className="size-[18px] shrink-0 opacity-80 group-data-[status=active]:opacity-100" /> <span className="truncate">{k === "schedule" && active ? scheduleLabel(active.role) : n.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">{initial}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{ROLE_LABELS[active.role]}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut className="size-4" /></Button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l border-sidebar-border bg-sidebar lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 max-w-[85vw] bg-sidebar shadow-xl" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="القائمة" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="relative flex min-w-0 flex-1 items-center sm:flex-none">
            <Building2 aria-hidden className="pointer-events-none absolute right-3 size-4 text-primary" />
            <label className="sr-only" htmlFor="ctx">تبديل الدور أو المدرسة</label>
            <select
              id="ctx"
              title="تبديل الدور أو المدرسة"
              className={selectCls("w-full min-w-0 rounded-full bg-card pr-9 font-medium shadow-sm sm:w-auto sm:max-w-md", true)}
              value={active.key}
              onChange={(e) => { setActive(e.target.value); qc.invalidateQueries(); navigate({ to: "/app" }); }}
            >
              {contexts.map((c) => (
                <option key={c.key} value={c.key}>
                  {ROLE_LABELS[c.role]} · {c.schoolName}{c.orgName ? ` (${c.orgName})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-8">
          <Outlet />
          <ConfirmHost />
        </main>
      </div>
    </div>
  );
}

function Onboarding({ onSignOut }: { onSignOut: () => void }) {
  const { refresh } = useSession();
  const [org, setOrg] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => { supabase.rpc("my_link_pending" as never).then(({ data }) => setPending(data === true)); }, []);
  if (pending === null) return <LoadingState />;
  if (pending) return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl">حسابك بانتظار استكمال الربط</h1>
        <p className="text-sm text-muted-foreground">دخلت بنجاح، لكن حسابك غير مرتبط بعد بسجلك في المدرسة. تواصل مع إدارة المدرسة لاستكمال الربط، ثم اضغط «تحديث».</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={refresh}>تحديث</Button>
          <Button type="button" variant="ghost" onClick={onSignOut}>خروج</Button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div>
          <h1 className="font-display text-2xl">مرحبًا بك في ركاز</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            لا توجد لك عضوية بعد. إن كانت مدرستك قد دعتك، اطلب منهم التأكد من بريدك ثم حدّث الصفحة. أو سجّل مؤسستك الآن لتصبح مالكها.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const { error } = await supabase.rpc("create_organization", { _org_name: org, _school_name: school });
            setBusy(false);
            if (error) return void setErr(arabicError(error));
            toast.success("تم إنشاء المؤسسة والمدرسة");
            refresh();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="org">اسم المؤسسة أو المجموعة التعليمية</Label>
            <Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="school">اسم أول مدرسة أو فرع</Label>
            <Input id="school" value={school} onChange={(e) => setSchool(e.target.value)} required />
          </div>
          {err && <ErrorState message={err} />}
          <div className="flex gap-2">
            <Button disabled={busy}>{busy ? "جارٍ…" : "تسجيل المؤسسة"}</Button>
            <Button type="button" variant="outline" onClick={refresh}>تحديث</Button>
            <Button type="button" variant="ghost" onClick={onSignOut}>خروج</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
