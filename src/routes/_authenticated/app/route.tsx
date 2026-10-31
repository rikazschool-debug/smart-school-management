import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bell, BookOpen, Building2, CalendarClock, CalendarDays, Repeat, GraduationCap, Home, LogOut, Menu, Network, School, ShieldCheck, UserCog, Users, UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SessionProvider, arabicError, useSession } from "@/lib/session";
import { NAV_BY_ROLE, ROLE_LABELS, type NavKey } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/states";
import { NotificationBell } from "@/components/notification-bell";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "لوحة ركاز" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

const NAV: Record<NavKey, { to: string; label: string; icon: typeof Home }> = {
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
  schoolday: { to: "/app/school-day", label: "إعداد اليوم الدراسي", icon: CalendarClock },
  schedule: { to: "/app/schedule", label: "الجدول المدرسي", icon: CalendarDays },
  substitutions: { to: "/app/substitutions", label: "التبديل والبدلاء", icon: Repeat },
  notifications: { to: "/app/notifications", label: "الإشعارات", icon: Bell },
};

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
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading) return <div className="p-10"><LoadingState /></div>;
  if (!active) return <Onboarding onSignOut={signOut} />;

  const nav = NAV_BY_ROLE[active.role];
  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <span className="mb-6 px-3 font-display text-2xl text-sidebar-primary">ركاز</span>
      {nav.map((k) => {
        const n = NAV[k];
        return (
          <Link
            key={k}
            to={n.to}
            activeOptions={{ exact: k === "home" }}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-primary"
          >
            <n.icon className="size-4" /> {n.label}
          </Link>
        );
      })}
      <div className="mt-auto border-t border-sidebar-border pt-4 text-xs text-sidebar-foreground/70">
        <p className="truncate px-3" dir="ltr">{user.email}</p>
        <button onClick={signOut} className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-sidebar-accent">
          <LogOut className="size-4" /> تسجيل الخروج
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-sidebar md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64 bg-sidebar" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="القائمة" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <label className="text-xs text-muted-foreground" htmlFor="ctx">السياق</label>
          <select
            id="ctx"
            className="h-9 max-w-[70vw] rounded-md border border-input bg-card px-2 text-sm"
            value={active.key}
            onChange={(e) => { setActive(e.target.value); qc.invalidateQueries(); navigate({ to: "/app" }); }}
          >
            {contexts.map((c) => (
              <option key={c.key} value={c.key}>
                {ROLE_LABELS[c.role]} — {c.schoolName}{c.orgName ? ` (${c.orgName})` : ""}
              </option>
            ))}
          </select>
          <NotificationBell />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          <Outlet />
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
