import { useQuery } from "@tanstack/react-query";
import { Award, BarChart3, ClipboardList, LayoutDashboard, ListChecks, Send, ShieldCheck, Users } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { EducationDesk } from "@/components/education/desk";
import { OfflineNote } from "@/components/education/offline-note";
import { GT_STATUS, type GtMe, type GtSearch, type GtTab } from "./model";
import { Board } from "./board";
import { Reports } from "./reports";
import { Nominations } from "./nominations";
import { Plans } from "./plans";
import { GtStudents } from "./students";
import { Programs } from "./programs";
import { Works } from "./works";

const TABS: { id: GtTab; label: string; hint: string; icon: typeof Send }[] = [
  { id: "board", label: "لوحة العمل", hint: "ما ينتظرك اليوم", icon: LayoutDashboard },
  { id: "nominations", label: "الترشيحات", hint: "ترشيح ومراجعة", icon: Send },
  { id: "students", label: "سجل الطلبة", hint: "ملف كل طالب", icon: Users },
  { id: "plans", label: "خطط الرعاية", hint: "فردية وجماعية", icon: ListChecks },
  { id: "programs", label: "البرامج والمشاركات", hint: "مدرسية وخارجية", icon: ClipboardList },
  { id: "works", label: "المشروعات والإنجازات", hint: "ملف الأعمال", icon: Award },
  { id: "reports", label: "التقارير", hint: "حصر وإحصاء", icon: BarChart3 },
];

export function GiftedHub({ sp, go }: { sp: GtSearch; go: (s: GtSearch, replace?: boolean) => void }) {
  const { active } = useSession(); const school = active?.schoolId;
  const me = useQuery({ queryKey: ["gt-me", school], enabled: !!school, queryFn: async () => { const r = await db.rpc("gt_me", { _school: school }); if (r.error) throw r.error; return r.data as GtMe; } });
  if (!school) return <EmptyState title="اختر مدرسة أولًا" />;
  if (me.isLoading) return <LoadingState />; if (me.error || !me.data) return <ErrorState message={arabicError(me.error)} onRetry={() => me.refetch()} />;
  const m = me.data;
  const tabs = TABS.filter((t) => m.coord || m.viewer || t.id === "nominations");
  if (!m.coord && !m.viewer && !m.nominate) return <><PageHeader title="رعاية الموهوبين" /><EmptyState title="لا توجد صلاحية على رعاية الموهوبين" hint="يرشّح المعلم طلابه، ويراجع المنسق المخوّل من مالك المجموعة." /></>;
  const cur: GtTab = sp.tab && tabs.some((t) => t.id === sp.tab) ? sp.tab : tabs[0]!.id;
  return <div className="space-y-5">
    <PageHeader title="رعاية الموهوبين" desc={m.coord ? "اكتشاف المواهب وترشيحها ورعايتها وتوثيق تقدمها" : "ترشيح طلابك ومتابعة قرارات الترشيح"} />
    <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />الترشيح المدرسي منفصل عن نتائج المقاييس الرسمية والتأهيل للبرامج الخارجية.</p>
    <OfflineNote />
    {tabs.length > 1 && <nav aria-label="أقسام رعاية الموهوبين" className="rounded-2xl border bg-gradient-to-b from-card to-muted/40 p-2 shadow-sm">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-7 lg:overflow-visible">
        {tabs.map((t) => { const on = cur === t.id; return <button key={t.id} type="button" aria-label={t.label} aria-current={on ? "page" : undefined} onClick={() => go({ tab: t.id })} className={`group flex min-w-[9rem] shrink-0 items-center gap-2 rounded-xl px-2.5 py-2.5 text-start transition-all lg:min-w-0 ${on ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "hover:-translate-y-0.5 hover:bg-card hover:shadow-md"}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${on ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"}`}><t.icon className="size-4" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{t.label}</span><span className={`block truncate text-[11px] ${on ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{t.hint}</span></span>
        </button>; })}
      </div></nav>}
    {cur === "board" && <Board school={school} go={go} />}
    {cur === "nominations" && <Nominations school={school} me={m} openId={sp.tab === "nominations" ? sp.id : undefined} onSel={(id) => go({ tab: "nominations", ...(id ? { id } : {}) }, false)} />}
    {cur === "students" && <div className="space-y-4"><GtStudents school={school} openId={sp.tab === "students" ? sp.id : undefined} onSel={(id) => go({ tab: "students", ...(id ? { id } : {}) }, false)} openPlan={(id) => go({ tab: "plans", id }, false)} />
      <details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">السجلات السابقة لرعاية الموهوبين (محفوظة كما هي)</summary><div className="mt-3"><EducationDesk title="السجلات السابقة" kinds={["talent"]} /></div></details></div>}
    {cur === "plans" && <Plans school={school} me={m} openId={sp.tab === "plans" ? sp.id : undefined} onSel={(id) => go({ tab: "plans", ...(id ? { id } : {}) }, false)} />}
    {cur === "programs" && <Programs school={school} me={m} openId={sp.tab === "programs" ? sp.id : undefined} onSel={(id) => go({ tab: "programs", ...(id ? { id } : {}) }, false)} />}
    {cur === "works" && <Works school={school} me={m} openId={sp.tab === "works" ? sp.id : undefined} onSel={(id) => go({ tab: "works", ...(id ? { id } : {}) }, false)} />}
    {cur === "reports" && <Reports school={school} me={m} />}
  </div>;
}

