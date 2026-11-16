import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, ClipboardList, FolderLock, LayoutDashboard, ListChecks, Send, ShieldCheck } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { EducationDesk } from "@/components/education/desk";
import { GuidanceBoard } from "./board";
import { Referrals } from "./referrals";

type Me = { counselor: boolean; can_refer: boolean; can_export: boolean };
type Tab = "board" | "referrals" | "cases" | "sessions" | "plans" | "programs" | "reports";
const TABS: { id: Tab; label: string; icon: typeof Send; counselor: boolean }[] = [
  { id: "board", label: "لوحة العمل والمواعيد", icon: LayoutDashboard, counselor: true },
  { id: "referrals", label: "الإحالات الطلابية", icon: Send, counselor: false },
  { id: "cases", label: "الحالات ودراسة الحالة", icon: FolderLock, counselor: true },
  { id: "sessions", label: "الجلسات والمتابعات", icon: CalendarCheck, counselor: true },
  { id: "plans", label: "خطط التدخل", icon: ListChecks, counselor: true },
  { id: "programs", label: "البرامج والخطة السنوية", icon: ClipboardList, counselor: true },
  { id: "reports", label: "التقارير", icon: BarChart3, counselor: true },
];
const LATER: Partial<Record<Tab, string>> = {
  sessions: "توثيق الجلسات الفردية والجماعية والمتابعات والمواعيد — قيد البناء في المرحلة الثالثة؛ لم يكتمل بعد.",
  plans: "خطط التدخل وتعديل السلوك بأهداف ومسؤولين ومؤشرات تحقق — قيد البناء في المرحلة الثانية؛ لم يكتمل بعد.",
  programs: "البرامج الوقائية والإنمائية والخطة السنوية — قيد البناء في المرحلة الرابعة؛ لم يكتمل بعد.",
  reports: "التقارير التشغيلية والإحصائية المنفصلة — قيد البناء في المرحلة الرابعة؛ لم يكتمل بعد.",
};

export function GuidanceHub() {
  const { active } = useSession(); const school = active?.schoolId;
  const me = useQuery({ queryKey: ["guidance-me", school], enabled: !!school, queryFn: async () => { const r = await db.rpc("edu_guidance_me", { _school: school }); if (r.error) throw r.error; return r.data as Me; } });
  const [tab, setTab] = useState<Tab | null>(null); const [refStatus, setRefStatus] = useState<string | undefined>(); const [openId, setOpenId] = useState<string | undefined>(); const [nonce, setNonce] = useState(0);
  if (!school) return <EmptyState title="اختر مدرسة أولًا" />;
  if (me.isLoading) return <LoadingState />; if (me.error || !me.data) return <ErrorState message={arabicError(me.error)} onRetry={() => me.refetch()} />;
  const m = me.data; const tabs = TABS.filter((t) => m.counselor || !t.counselor);
  if (!tabs.length || (!m.counselor && !m.can_refer)) return <><PageHeader title="التوجيه الطلابي" /><EmptyState title="لا توجد صلاحية على التوجيه الطلابي" hint="يحتاج الاطلاع إلى دور الموجّه الطلابي أو تفويض صريح من مالك المجموعة." /></>;
  const cur: Tab = tab ?? (m.counselor ? "board" : "referrals");
  const go = (t: Tab, o?: { status?: string; id?: string }) => { setTab(t); setRefStatus(o?.status); setOpenId(o?.id); setNonce(nonce + 1); };
  return <div className="space-y-5">
    <PageHeader title="التوجيه الطلابي" desc={m.counselor ? "الإحالات والحالات والمتابعات ضمن نطاقك" : "إحالة طلابك إلى الموجّه الطلابي ومتابعة مراحلها"} />
    <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />السجلات سرية؛ يظهر لكل مستخدم ما تسمح به صلاحيته فقط، ويُتحقق من ذلك في الخادم.</p>
    {tabs.length > 1 && <nav aria-label="أقسام التوجيه الطلابي" className="flex gap-2 overflow-x-auto pb-1">{tabs.map((t) => <button key={t.id} type="button" aria-current={cur === t.id ? "page" : undefined} onClick={() => go(t.id)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm ${cur === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}><t.icon className="size-4" />{t.label}</button>)}</nav>}
    {cur === "board" && <GuidanceBoard school={school} go={(t, o) => go(t, o)} />}
    {cur === "referrals" && <ReferralsTab key={nonce} school={school} m={m} status={refStatus} openId={openId} openCase={(id) => go("cases", { id })} />}
    {cur === "cases" && <EducationDesk key={nonce} title="الحالات الخاصة" kinds={["case"]} openId={openId} />}
    {LATER[cur] && <EmptyState title="غير مكتمل" hint={LATER[cur]} />}
  </div>;
}

function ReferralsTab({ school, m, status, openId, openCase }: { school: string; m: Me; status?: string | undefined; openId?: string | undefined; openCase: (id: string) => void }) {
  return <Referrals school={school} counselor={m.counselor} canRefer={m.can_refer} openCase={openCase} initialStatus={status} initialId={openId} />;
}
