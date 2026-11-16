import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, ClipboardList, FolderLock, LayoutDashboard, ListChecks, Send, ShieldCheck } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { Cases } from "./cases";
import { GuidanceBoard } from "./board";
import { GuidanceAgenda } from "./agenda";
import { InterventionPlans } from "./plans";
import { Programs } from "./programs";
import { GuidanceReports } from "./reports";
import { Referrals } from "./referrals";
import { OfflineNote } from "@/components/education/offline-note";
import type { GuidanceSearch, GuidanceTab } from "./search";

type Me = { counselor: boolean; can_refer: boolean; can_export: boolean; stats: boolean; stats_export: boolean };
type Tab = GuidanceTab;
/** who: counselor-only, anyone who may refer, or statistics viewers (counselor, principal, vice principal). */
const TABS: { id: Tab; label: string; hint: string; icon: typeof Send; who: "counselor" | "refer" | "stats" }[] = [
  { id: "board", hint: "اليوم والمواعيد", label: "لوحة العمل والمواعيد", icon: LayoutDashboard, who: "counselor" },
  { id: "referrals", hint: "طلبات المعلمين", label: "الإحالات الطلابية", icon: Send, who: "refer" },
  { id: "cases", hint: "الملفات السرية", label: "الحالات ودراسة الحالة", icon: FolderLock, who: "counselor" },
  { id: "sessions", hint: "الجلسات والسجل", label: "الجلسات والمتابعات", icon: CalendarCheck, who: "counselor" },
  { id: "plans", hint: "الأهداف والتقدم", label: "خطط التدخل", icon: ListChecks, who: "counselor" },
  { id: "programs", hint: "الخطة والبرامج", label: "البرامج والخطة السنوية", icon: ClipboardList, who: "stats" },
  { id: "reports", hint: "تشغيلي وإحصائي", label: "التقارير", icon: BarChart3, who: "stats" },
];

/** Tab and open record live in the URL (?tab=&id=) so notifications and shared links open the exact screen; the server still checks every id. */
export function GuidanceHub({ sp, go: nav }: { sp: GuidanceSearch; go: (s: GuidanceSearch, replace?: boolean) => void }) {
  const { active } = useSession(); const school = active?.schoolId;
  const me = useQuery({ queryKey: ["guidance-me", school], enabled: !!school, queryFn: async () => { const r = await db.rpc("edu_guidance_me", { _school: school }); if (r.error) throw r.error; return r.data as Me; } });
  if (!school) return <EmptyState title="اختر مدرسة أولًا" />;
  if (me.isLoading) return <LoadingState />; if (me.error || !me.data) return <ErrorState message={arabicError(me.error)} onRetry={() => me.refetch()} />;
  const m = me.data; const tabs = TABS.filter((t) => m.counselor || (t.who === "refer" ? m.can_refer : t.who === "stats" ? m.stats : false));
  if (!tabs.length) return <><PageHeader title="التوجيه الطلابي" /><EmptyState title="لا توجد صلاحية على التوجيه الطلابي" hint="يحتاج الاطلاع إلى دور الموجّه الطلابي أو تفويض صريح من مالك المجموعة." /></>;
  const cur: Tab = sp.tab && tabs.some((t) => t.id === sp.tab) ? sp.tab : tabs[0]!.id;
  const openId = sp.tab === cur ? sp.id : undefined; const refStatus = sp.tab === cur ? sp.status : undefined;
  const go = (t: Tab, o?: { status?: string; id?: string }) => nav({ tab: t, ...(o?.id ? { id: o.id } : {}), ...(o?.status ? { status: o.status } : {}) });
  const sel = (t: Tab) => (id: string | null) => nav({ tab: t, ...(id ? { id } : {}) }, false);
  return <div className="space-y-5">
    <PageHeader title="التوجيه الطلابي" desc={m.counselor ? "الإحالات والحالات والمتابعات ضمن نطاقك" : m.can_refer ? "إحالة طلابك إلى الموجّه الطلابي ومتابعة مراحلها" : "الخطة السنوية والتقرير الإحصائي — دون أسماء أو حالات"} />
    <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />السجلات سرية؛ يظهر لكل مستخدم ما تسمح به صلاحيته فقط، ويُتحقق من ذلك في الخادم.</p>
    <OfflineNote />
    {sp.tab && sp.tab !== cur && <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">هذا الرابط يخص قسمًا غير متاح لحسابك، فعُرض لك أول قسم متاح.</p>}
    {tabs.length > 1 && <nav aria-label="أقسام التوجيه الطلابي" className="rounded-2xl border bg-gradient-to-b from-card to-muted/40 p-2 shadow-sm">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:overflow-visible" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => { const on = cur === t.id; return <button key={t.id} type="button" aria-label={t.label} aria-current={on ? "page" : undefined} onClick={() => go(t.id)} className={`group relative flex min-w-[9.5rem] shrink-0 items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-start transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0 ${on ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "text-foreground hover:-translate-y-0.5 hover:bg-card hover:shadow-md"}`}>
          <span className={`grid size-9 shrink-0 place-items-center rounded-lg transition-colors ${on ? "bg-primary-foreground/15" : "bg-primary/10 text-primary group-hover:bg-primary/15"}`}><t.icon className="size-[1.1rem]" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{t.label}</span><span className={`block truncate text-[11px] ${on ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{t.hint}</span></span>
          {on && <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary-foreground/60" />}
        </button>; })}
      </div>
    </nav>}
    {cur === "board" && <GuidanceBoard school={school} go={(t, o) => go(t, o)} />}
    {cur === "referrals" && <ReferralsTab key={refStatus ?? ""} school={school} m={m} status={refStatus} openId={openId} onSel={sel("referrals")} openCase={(id) => go("cases", { id })} />}
    {cur === "cases" && <Cases school={school} initialId={openId} onSel={sel("cases")} />}
    {cur === "sessions" && <GuidanceAgenda school={school} openCase={(id) => go("cases", { id })} />}
    {cur === "plans" && <InterventionPlans school={school} openCase={(id) => go("cases", { id })} />}
    {cur === "programs" && <Programs school={school} canExport={m.stats_export} />}
    {cur === "reports" && <GuidanceReports school={school} counselor={m.counselor} canExport={m.can_export} statsExport={m.stats_export} />}
  </div>;
}

function ReferralsTab({ school, m, status, openId, onSel, openCase }: { school: string; m: Me; status?: string | undefined; openId?: string | undefined; onSel: (id: string | null) => void; openCase: (id: string) => void }) {
  return <Referrals school={school} counselor={m.counselor} canRefer={m.can_refer} openCase={openCase} initialStatus={status} initialId={openId} onSel={onSel} />;
}
