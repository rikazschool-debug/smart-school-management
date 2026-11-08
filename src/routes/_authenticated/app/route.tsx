import { createFileRoute, Link, Outlet, useCanGoBack, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ConfirmHost } from "@/components/confirm";
import { SchoolLogo } from "@/components/school-logo";
import { selectCls } from "@/components/ui/native-select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOpsStaff } from "@/lib/ops-staff";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Award, Briefcase,
  Bell, MonitorPlay, BookOpen, LifeBuoy, Megaphone, UserCircle, DoorOpen, ScanLine, ClipboardList, MessagesSquare, Building2, CalendarDays, GraduationCap, Home, LogOut, Menu, Network, School, ShieldCheck, UserCog, Users, UsersRound,
  ReceiptText, Wallet, Construction, KeyRound, LayoutDashboard, Wrench, Bus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SessionProvider, arabicError, useSession } from "@/lib/session";
import { usePcMe } from "@/components/procurement/shared";
import { canFleet, hasKind, useMtMe } from "@/components/maintenance/shared";
import { useSchoolPerms } from "@/lib/school-perms";
import { FileText, IdCard, Tags, PartyPopper, UserPlus } from "lucide-react";
import { hasEvents, useEvtCaps } from "@/components/events/shared";
import { hasAdmissions, useAdMe } from "@/components/admissions/shared";
import { NAV_BY_ROLE, OWNER_SECTION_LABELS, ROLE_LABELS, SUPPORT_TAB_LABELS, supportTabs, commTabs, ownerSection, ownerSectionNav, scheduleLabel, type NavKey, type OwnerSection } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/states";
import { NotificationBell } from "@/components/notification-bell";
import { useSupportCaps } from "@/components/support/caps";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "لوحة ركاز" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

const NAV: Record<NavKey, { to: string; label: string; icon: typeof Home; tab?: "groups" | "manage" | "notices" | "meetings" | "circulars" }> = {
  home: { to: "/app", label: "الرئيسية", icon: Home },
  platform: { to: "/app/platform", label: "المؤسسات", icon: ShieldCheck },
  schools: { to: "/app/schools", label: "المدارس والفروع", icon: Building2 },
  members: { to: "/app/members", label: "المستخدمون والأدوار", icon: UserCog },
  academic: { to: "/app/academic", label: "الإعداد الأكاديمي", icon: Network },
  teachers: { to: "/app/teachers", label: "المعلمون", icon: UsersRound },
  courses: { to: "/app/courses", label: "المقررات والتكليفات", icon: BookOpen },
  students: { to: "/app/students", label: "الطلاب والتسكين", icon: GraduationCap },
  guardians: { to: "/app/guardians", label: "أولياء الأمور", icon: Users },
  tags: { to: "/app/tags", label: "الوسوم", icon: Tags },
  chat_settings: { to: "/app/chat-settings", label: "ضبط المحادثات", icon: MessagesSquare },
  classrooms: { to: "/app/classrooms", label: "الفصول الرقمية", icon: School },
  virtual: { to: "/app/virtual-classes", label: "الحصص الافتراضية", icon: MonitorPlay },
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
  school_home: { to: "/app/school-home", label: "لوحة المدرسة", icon: LayoutDashboard },
  finance: { to: "/app/finance", label: "بوابة المالية", icon: Wallet },
  hr: { to: "/app/hr", label: "الموارد البشرية", icon: IdCard },
  my_hr: { to: "/app/my-employment", label: "ملفي الوظيفي", icon: IdCard },
  permissions: { to: "/app/permissions", label: "الأدوار والصلاحيات", icon: KeyRound },
  operations: { to: "/app/operations", label: "بوابة النقل والصيانة", icon: Bus },
  transport: { to: "/app/transport", label: "النقل المدرسي", icon: Construction },
  maintenance: { to: "/app/maintenance", label: "إدارة صيانة المباني", icon: Wrench },
  bus_maintenance: { to: "/app/bus-maintenance", label: "إدارة تشغيل وصيانة الباصات", icon: Bus },
  admissions: { to: "/app/admissions", label: "القبول والتسجيل", icon: UserPlus },
  org_docs: { to: "/app/org-docs", label: "الوثائق والعقود", icon: FileText },
  hr_training: { to: "/app/hr/training", label: "التدريب والتطوير", icon: GraduationCap },
  visits: { to: "/app/visits", label: "الزيارات الصفية", icon: ClipboardList },
  family_visits: { to: "/app/family-visits", label: "الزيارات", icon: CalendarDays },
  events: { to: "/app/events", label: "الفعاليات", icon: PartyPopper },
  evaluation: { to: "/app/evaluation", label: "نظام التقييم الشامل", icon: Award },
  hub_notices: { to: "/app/hub", tab: "notices", label: "الإشعارات", icon: Megaphone },
  hub_meetings: { to: "/app/hub", tab: "meetings", label: "الاجتماعات", icon: CalendarDays },
  hub_circulars: { to: "/app/hub", tab: "circulars", label: "التعاميم", icon: Megaphone },
};

/** Procurement sub-sections shown under its menu entry (the page re-checks each tab). */
const PC_SUB = [["summary", "الملخص"], ["needs", "طلبات الاحتياج"], ["custodies", "العهد"], ["expenses", "تسجيل المشتريات"], ["invoices", "الفواتير المسجلة"], ["requests", "الطلبات"], ["reports", "التقارير"], ["archive", "الأرشيف"], ["settings", "الإعدادات"]] as const;

/** Admissions sub-sections; "settings" (website connection) only for org-level/settings holders — the page and RPCs re-check. */
const AD_SUB = [["apps", "الطلاب المحتملون"], ["settings", "الإعدادات والربط (WordPress)"]] as const;

/** Evaluation sub-sections (owner/principal/granted platform); class visits is its own page. "forms" needs owner or evaluation.forms — the page and RPCs re-check. */
/** Events sub-sections (the page shows only tabs the server allows). */
const EVT_SUB = [["summary", "الملخص والتقويم"], ["trip", "الرحلات المدرسية"], ["general", "الفعاليات العامة"], ["course", "الدورات"], ["apps", "طلبات التسجيل"], ["forms", "إعدادات النماذج"], ["reports", "التقارير"]] as const;
const EV_SUB = [["summary", "الملخص والمؤشرات"], ["guardians", "تقييمات أولياء الأمور"], ["visits", "الزيارات الصفية"], ["monthly", "التقييم الشهري"], ["forms", "النماذج والإعدادات"]] as const;
const SUB_CLS = "flex min-h-8 items-center rounded-md px-3 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-primary";

const NAV_GROUPS: { label: string; keys: NavKey[] }[] = [
  { label: "", keys: ["home", "school_home", "finance", "operations", "hr", "hr_training", "profile", "my_hr"] },
  { label: "المنصة والمؤسسة", keys: ["platform", "schools", "members", "permissions"] },
  { label: "منطقة العمل", keys: ["academic", "courses", "admin", "duties", "calendar", "schedule", "visits", "evaluation", "procurement", "transport", "maintenance", "bus_maintenance", "admissions", "org_docs", "family_visits", "events"] },
  { label: "الكادر التعليمي والطلاب", keys: ["teachers", "students", "guardians"] },
  { label: "الوسوم", keys: ["tags"] },
  { label: "التعليم", keys: ["classrooms", "virtual", "homework", "grades", "results"] },
  { label: "الحضور والمواظبة", keys: ["attendance", "pickup", "station"] },
  { label: "التواصل والمحادثات", keys: ["communication", "comm_groups", "meetings", "circulars", "comm_manage", "chat_settings"] },
  { label: "إدارة الإشعارات", keys: ["hub_notices", "hub_circulars"] },
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
  const sp = useSchoolPerms(pcRole ? active?.schoolId : null);
  const mt = useMtMe(active?.orgId ?? null, pcRole);
  const ad = useAdMe(active?.orgId ?? null, pcRole);
  // events: base roles have it in NAV_BY_ROLE; other staff get it from granted evt_* perms or a course delegation (evt_caps re-checks)
  const evt = useEvtCaps(active?.orgId ?? null, pcRole && !["principal", "vice_principal"].includes(active?.role ?? ""));
  const ops = useOpsStaff(active ?? null, user.id);
  // HR: own employment file for any staff member who has one (hr_my_employment returns null otherwise); HR workspace via perm_my_school hr_* keys
  const myHr = useQuery({ queryKey: ["hr-mine", active?.orgId], enabled: pcRole, staleTime: 60_000, queryFn: async () => { const r = await supabase.rpc("hr_my_employment" as never, { _org: active!.orgId } as never); if (r.error) return null; return r.data as unknown; } });
  const hrGranted = !!sp && Object.entries(sp).some(([k, v]) => k.startsWith("hr_") && !!v);
  // evaluation access: owner/platform always see the section; other staff only through the permission tree (perm_my_school ev_* keys; RPCs re-check)
  const evGranted = !!sp && Object.entries(sp).some(([k, v]) => k.startsWith("ev_") && !!v);
  const evOwner = !!active && ["org_owner", "platform_admin"].includes(active.role);
  const evStaff = evOwner || evGranted;
  const evMe = useQuery({ queryKey: ["ev-me", active?.schoolId], enabled: !evOwner && evStaff && !!active?.schoolId, queryFn: async () => { const r = await supabase.rpc("ev_me" as never, { _school: active!.schoolId } as never); if (r.error) throw r.error; return r.data as unknown as { forms: boolean; caps: Record<string, boolean> }; } });
  const evCan = (t: string) => { if (evOwner) return true; const c = evMe.data?.caps ?? {}; return t === "summary" ? !!c["ev_summary.view"] : t === "guardians" ? !!c["ev_guardian.view"] : t === "visits" ? !!(c["ev_visits.view"] || c["ev_visits.execute"]) : t === "monthly" ? !!c["ev_monthly.view"] : !!(c["ev_forms.view"] || c["ev_forms.edit"]); };
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const supTab = useRouterState({ select: (r) => String((r.location.search as Record<string, unknown>)["tab"] ?? "") });
  const evTab = useRouterState({ select: (r) => String((r.location.search as Record<string, unknown>)["tab"] ?? "summary") });
  const lastSection = useRef<OwnerSection | null>(null);
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // support sub-menu mirrors the page's own tabs (supportTabs + support_caps); the page and support_* RPCs re-check
  const inSupport = path === "/app/support" || path.startsWith("/app/support/");
  const sCaps = useSupportCaps(inSupport && active && active.role !== "platform_admin" ? active.orgId : null);

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
    toast.success("تم تسجيل الدخول", { description: active.schoolName });
  }, [active, user.id]);
  if (loading || ops.loading) return <div className="p-10"><LoadingState /></div>;
  if (!active) return <Onboarding onSignOut={signOut} />;

  const ct = commTabs(active.role);
  const owner = active.role === "org_owner";
  const section = owner ? ownerSection(path, lastSection.current) : null;
  lastSection.current = section;
  // Owner home has no side menu; inside a section only that section's menu shows; shared pages (profile…) keep the last section.
  const noSidebar = owner && section === null;
  const baseNav = [...NAV_BY_ROLE[active.role], "profile", "support", ...(ct.includes("circulars") ? ["circulars"] : []), ...(ct.includes("groups") ? ["comm_groups"] : []), ...(ct.includes("manage") ? ["comm_manage"] : []), ...(pcRole && pc.data?.enabled && (pc.data.caps.view || active.role === "principal") ? ["procurement"] : []), ...(pcRole && hasKind(mt.data, "school") ? ["maintenance"] : []), ...(pcRole && (hasKind(mt.data, "bus") || canFleet(mt.data)) ? ["bus_maintenance"] : []), ...(pcRole && (hasAdmissions(ad.data) || !!ad.data?.caps?.students.length) ? ["admissions"] : []),
    // owner-granted school permissions (perm_my_school) add their pages; the server re-checks every action
    ...(sp?.["gate.operate"] || sp?.["attendance.approve"] || sp?.["attendance.follow"] ? ["attendance"] : []), ...(sp?.["gate.operate"] ? ["station"] : []), ...(owner || sp?.["org_docs.view"] ? ["org_docs"] : []), ...(owner || sp?.["people.view"] ? ["tags"] : []), ...(owner || ["view", "replies", "autoreply", "media"].some((a) => sp?.[`chat_settings.${a}`]) ? ["chat_settings"] : []), ...(sp?.["groups.create"] ? ["comm_manage"] : []), ...(evGranted && active.role !== "guardian" ? ["evaluation"] : []), ...(hrGranted ? ["hr", "hr_training"] : []), ...(myHr.data && !(myHr.data as { pending?: boolean }).pending ? ["my_hr"] : []), ...(hasEvents(evt.data) ? ["events"] : [])] as NavKey[];
  const opsOnly = ops.opsOnly;
  if (opsOnly) baseNav.splice(0, baseNav.length, ...baseNav.filter((k) => ["home", "profile", "support", "notifications", "communication", "procurement", "maintenance", "bus_maintenance", "admissions", "evaluation", "hr", "my_hr", "events"].includes(k)));
  const pcNeedsOnly = !owner && !!pc.data && !pc.data.caps.view;
  let nav = owner && section ? ownerSectionNav(section, [...new Set(baseNav)]) : [...new Set(baseNav)];
  // class visits live under the evaluation sub-menu for roles that have both
  if (evStaff && nav.includes("evaluation")) nav = nav.filter((k) => k !== "visits");
  const groups = NAV_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => nav.includes(k)) })).filter((g) => g.keys.length);
  const initial = (user.email ?? "?").trim().charAt(0).toUpperCase();
  const sidebar = (
    <nav aria-label="القائمة الرئيسية" className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <SchoolLogo schoolId={active.schoolId} className="size-10 shrink-0 rounded-xl border" fallback={<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground">ر</span>} />
        <div className="min-w-0">
          <p className="font-display text-xl leading-none text-foreground">ركاز</p>
          <p data-school-name className="mt-1 truncate text-xs text-muted-foreground">{active.schoolName}</p>
        </div>
      </div>
      {owner && section && <p className="mx-3 mb-3 rounded-lg bg-secondary px-3 py-2 text-sm font-bold text-primary">{OWNER_SECTION_LABELS[section]}</p>}
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.label}>
            {g.label && <p className="mb-1.5 flex items-center gap-2 border-r-[3px] border-primary px-3 py-1 text-[13px] font-bold text-primary">{g.label}</p>}
            <div className="space-y-0.5">
              {g.keys.map((k) => {
                const n = NAV[k];
                return (
                  <Fragment key={k}>
                  <Link
                    to={n.to}
                    {...(n.tab ? { search: { tab: n.tab } } : {})}
                    activeOptions={{ exact: k === "home" || k === "admin", includeSearch: k === "communication" || !!n.tab }}
                    onClick={() => setOpen(false)}
                    className="group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-primary"
                  >
                    <span aria-hidden className="absolute inset-y-2 right-0 w-1 rounded-l-full bg-sidebar-primary opacity-0 group-data-[status=active]:opacity-100" />
                    <n.icon className="size-[18px] shrink-0 opacity-80 group-data-[status=active]:opacity-100" /> <span className="truncate">{k === "schedule" && active ? scheduleLabel(active.role) : n.label}</span>
                  </Link>
                  {k === "procurement" && path.startsWith("/app/procurement") && (
                    <div className="mr-6 mt-0.5 space-y-0.5 border-r border-sidebar-border pr-2">
                      {PC_SUB.filter(([t]) => (pcNeedsOnly ? t === "needs" : t !== "settings" || owner || pc.data?.caps.settings === "org")).map(([t, label]) => (
                        <Link key={t} to="/app/procurement" search={{ tab: t }} activeOptions={{ includeSearch: true }} onClick={() => setOpen(false)}
                          className="flex min-h-8 items-center rounded-md px-3 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-primary">{label}</Link>
                      ))}
                    </div>
                  )}
                  {k === "evaluation" && evStaff && (
                    <div className="mr-6 mt-0.5 space-y-0.5 border-r border-sidebar-border pr-2">
                      {EV_SUB.filter(([t]) => evCan(t)).map(([t, label]) => t === "visits" ? (
                        <Link key={t} to="/app/visits" onClick={() => setOpen(false)} className={SUB_CLS}>{label}</Link>
                      ) : (
                        <Link key={t} to="/app/evaluation" search={{ tab: t }} onClick={() => setOpen(false)}
                          activeOptions={{ includeSearch: true }} className={SUB_CLS + (path.startsWith("/app/evaluation") && evTab === t ? " bg-sidebar-accent font-semibold text-sidebar-primary" : "")}>{label}</Link>
                      ))}
                    </div>
                  )}
                  {k === "support" && inSupport && (active.role === "platform_admin" || sCaps.data) && (
                    <div className="mr-6 mt-0.5 space-y-0.5 border-r border-sidebar-border pr-2">
                      {[...supportTabs(active.role, (sCaps.data?.view.length ?? 0) > 0), ...(active.role === "platform_admin" || sCaps.data?.settings ? (["settings"] as const) : [])].map((t, i) => (
                        <Link key={t} to="/app/support" search={{ tab: t }} activeOptions={{ includeSearch: true }} onClick={() => setOpen(false)} className={SUB_CLS + (supTab === t || (!supTab && i === 0) ? " bg-sidebar-accent font-semibold text-sidebar-primary" : "")}>
                          {t === "settings" ? "الإعدادات والتصنيفات" : SUPPORT_TAB_LABELS[t]}
                        </Link>
                      ))}
                    </div>
                  )}
                  {k === "events" && path.startsWith("/app/events") && !["guardian", "student"].includes(active.role) && (
                    <div className="mr-6 mt-0.5 space-y-0.5 border-r border-sidebar-border pr-2">
                      {EVT_SUB.map(([t, label]) => (
                        <Link key={t} to="/app/events" search={{ tab: t }} activeOptions={{ includeSearch: true }} onClick={() => setOpen(false)} className={SUB_CLS}>{label}</Link>
                      ))}
                    </div>
                  )}
                  {k === "admissions" && (
                    <div className="mr-6 mt-0.5 space-y-0.5 border-r border-sidebar-border pr-2">
                      {AD_SUB.filter(([t]) => t !== "settings" || !!ad.data?.org_level || !!ad.data?.caps?.settings.length).map(([t, label]) => (
                        <Link key={t} to="/app/admissions" search={{ tab: t }} activeOptions={{ includeSearch: true }} onClick={() => setOpen(false)}
                          className="flex min-h-8 items-center rounded-md px-3 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-primary">{label}</Link>
                      ))}
                    </div>
                  )}
                  </Fragment>
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
            <p className="truncate text-sm font-semibold">{ops.title === "عملي" ? "متعدد الأدوار" : ops.title ?? ROLE_LABELS[active.role]}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut className="size-4" /></Button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {!noSidebar && <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l border-sidebar-border bg-sidebar lg:block">{sidebar}</aside>}
      {open && !noSidebar && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 max-w-[85vw] bg-sidebar shadow-xl" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-6">
          {noSidebar ? (
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-display text-primary-foreground">ر</span>
          ) : (
            <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="القائمة" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </Button>
          )}
          {path.replace(/\/+$/, "") !== "/app" && (
            <Button variant="outline" size="sm" className="shrink-0 gap-1 rounded-full" aria-label="رجوع" title="رجوع للصفحة السابقة"
              onClick={() => (canGoBack ? router.history.back() : navigate({ to: "/app" }))}>
              <ArrowRight className="size-4" /><span className="hidden sm:inline">رجوع</span>
            </Button>
          )}
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
                  {opsOnly && c.schoolId === active.schoolId && c.role === active.role ? (ops.title === "عملي" ? "متعدد الأدوار" : ops.title) : ROLE_LABELS[c.role]} · {c.schoolName}{c.orgName ? ` (${c.orgName})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <NotificationBell />
            {noSidebar && <Button variant="ghost" size="icon" onClick={signOut} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut className="size-4" /></Button>}
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
