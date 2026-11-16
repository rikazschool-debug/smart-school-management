import { useQuery } from "@tanstack/react-query";
import { Award, BarChart3, ClipboardList, LayoutDashboard, ListChecks, Send, ShieldCheck, Users } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { EducationDesk } from "@/components/education/desk";
import { OfflineNote } from "@/components/education/offline-note";
import { GT_STATUS, type GtMe, type GtSearch, type GtTab } from "./model";
import { Nominations, nomQuery } from "./nominations";
import { Plans } from "./plans";
import { GtStudents } from "./students";

const TABS: { id: GtTab; label: string; hint: string; icon: typeof Send }[] = [
  { id: "board", label: "لوحة العمل", hint: "ما ينتظرك اليوم", icon: LayoutDashboard },
  { id: "nominations", label: "الترشيحات", hint: "ترشيح ومراجعة", icon: Send },
  { id: "students", label: "سجل الطلبة", hint: "ملف كل طالب", icon: Users },
  { id: "plans", label: "خطط الرعاية", hint: "فردية وجماعية", icon: ListChecks },
  { id: "programs", label: "البرامج والمشاركات", hint: "مدرسية وخارجية", icon: ClipboardList },
  { id: "works", label: "المشروعات والإنجازات", hint: "ملف الأعمال", icon: Award },
  { id: "reports", label: "التقارير", hint: "حصر وإحصاء", icon: BarChart3 },
];
const NEXT: Partial<Record<GtTab, string>> = { programs: "المرحلة الثالثة", works: "المرحلة الرابعة", reports: "المرحلة الخامسة" };

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
    {cur === "board" && <Board school={school} go={(id) => go({ tab: "nominations", ...(id ? { id } : {}) })} />}
    {cur === "nominations" && <Nominations school={school} me={m} openId={sp.tab === "nominations" ? sp.id : undefined} onSel={(id) => go({ tab: "nominations", ...(id ? { id } : {}) }, false)} />}
    {cur === "students" && <div className="space-y-4"><GtStudents school={school} openId={sp.tab === "students" ? sp.id : undefined} onSel={(id) => go({ tab: "students", ...(id ? { id } : {}) }, false)} openPlan={(id) => go({ tab: "plans", id }, false)} />
      <details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">السجلات السابقة لرعاية الموهوبين (محفوظة كما هي)</summary><div className="mt-3"><EducationDesk title="السجلات السابقة" kinds={["talent"]} /></div></details></div>}
    {cur === "plans" && <Plans school={school} me={m} openId={sp.tab === "plans" ? sp.id : undefined} onSel={(id) => go({ tab: "plans", ...(id ? { id } : {}) }, false)} />}
    {NEXT[cur] && <EmptyState title={`قيد التنفيذ — ${NEXT[cur]}`} hint="لم يُبنَ هذا القسم بعد؛ السجلات السابقة متاحة أسفل «سجل الطلبة»." />}
  </div>;
}

function Board({ school, go }: { school: string; go: (id?: string) => void }) {
  const q = useQuery({ ...nomQuery(school) });
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  if (!rows.length) return <div className="rounded-2xl border bg-card p-6"><h3 className="mb-3 font-bold">ابدأ من هنا</h3><ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground"><li>يرشّح المعلم طالبًا من «الترشيحات» مع مؤشرات وتاريخ.</li><li>يراجع المنسق الترشيح ويطلب استكمالًا أو يقرّه للرعاية المدرسية مع السبب.</li><li>تُبنى للطلبة المقرّين خطط رعاية وبرامج في المراحل القادمة.</li></ol><Button className="mt-4" onClick={() => go()}>فتح الترشيحات</Button></div>;
  const count = (s: string[]) => rows.filter((r) => s.includes(r.status)).length;
  const students = new Set(rows.filter((r) => r.status === "approved").map((r) => r.student_id)).size;
  const cards = [{ l: "ترشيحات تنتظر المراجعة", v: count(["sent", "review"]) }, { l: "بانتظار استكمال المرشِّح", v: count(["needs_info"]) }, { l: "طلبة أُقرّوا للرعاية المدرسية", v: students }, { l: "مسودات لم تُرسل", v: count(["draft"]) }];
  const wait = rows.filter((r) => ["sent", "review"].includes(r.status)).slice(0, 8);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map((c) => <div key={c.l} className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">{c.l}</p><p className="mt-1 text-3xl font-bold">{c.v}</p></div>)}</div>
    <div className="rounded-2xl border bg-card p-4"><h3 className="mb-2 font-semibold">تنتظر المراجعة</h3>{wait.length ? <ul className="divide-y">{wait.map((r) => <li key={r.id}><button type="button" className="flex w-full justify-between py-2 text-start text-sm hover:text-primary" onClick={() => go(r.id)}><span>{r.student} · {r.grade ?? ""}</span><span className="text-xs text-muted-foreground">{GT_STATUS[r.status]}</span></button></li>)}</ul> : <p className="text-sm text-muted-foreground">لا شيء ينتظر المراجعة.</p>}</div>
    <p className="text-xs text-muted-foreground">الطالب يُحسب مرة واحدة في «طلبة أُقرّوا» حتى لو أُقرّ في أكثر من مجال.</p>
  </div>;
}
