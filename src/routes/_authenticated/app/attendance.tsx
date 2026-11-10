import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { useState } from "react";
import { TickStatus } from "@/components/attendance/tick-status";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { CompareTab, CardsTab, FollowupTab, PickupsTab, RecordsTab, TodayTab } from "@/components/attendance/staff";
import { SettingsTab } from "@/components/attendance/calls-settings";
import { LessonsSchoolTab, LessonsTab } from "@/components/attendance/lessons";
import { attTabsWith, canApproveAttendanceWith, type AttTab } from "@/lib/roles";
import { useSchoolPerms } from "@/lib/school-perms";
import { useOpsStaff } from "@/lib/ops-staff";
import { useSession } from "@/lib/session";
import type { AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/attendance")({
  head: () => ({ meta: [{ title: "الحضور والخروج — ركاز" }, { name: "description", content: "الحضور بالباركود، الاستئذان والاستلام، النداء والسجلات." }] }),
  component: Page,
});

const LABEL: Record<AttTab, string> = { lessons: "رصد حضور اليوم", today: "لوحة اليوم", gate: "البوابة", pickups: "الاستلام والاستئذان", calls: "النداء", cards: "البطاقات والمستلمون", records: "السجلات", followup: "متابعة المواظبة", settings: "الإعدادات", compare: "مقارنة الفروع" };

// same grants that add «الحضور» to the side menu (route.tsx); without one the page is closed even by direct link
const ATT_GRANTS = ["gate.operate", "attendance.approve", "attendance.follow", "attendance.view", "attendance.record"];

function Page() {
  return <RequireSchool nav="attendance" extra={(p) => ATT_GRANTS.some((k) => !!p[k])}>{(ctx) => <Att ctx={ctx} />}</RequireSchool>;
}

function Att({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const perms = useSchoolPerms(ctx.schoolId);
  const { user } = useSession();
  const ops = useOpsStaff(ctx, user?.id);
  // administrative assistant (no teacher record): no lesson sheets or pickup preparation, only today's board and records
  const all = attTabsWith(ctx.role, perms).filter((t) => !ops.asst || (t !== "lessons" && t !== "pickups"));
  const station = all.includes("gate");
  const tabs = all.filter((t) => t !== "gate" && t !== "calls");
  const [picked, setTab] = useState<AttTab | null>(null);
  // tabs depend on permissions that load after the first render; fall back to the first allowed tab
  const tab: AttTab = picked && (tabs as AttTab[]).includes(picked) ? picked : tabs[0] ?? "today";
  // UI mirrors SQL: approvals = managers + policy approver roles (default vice principal, student affairs); gate = student affairs/managers/security
  const canApprove = canApproveAttendanceWith(ctx.role, perms);
  const gate = perms && ctx.role !== "org_owner" ? !!perms["gate.operate"] || canApprove : ctx.role !== "teacher" && ctx.role !== "counselor";
  return (
    <>
      <PageHeader title={ctx.role === "teacher" && !ops.asst ? "رصد حضور اليوم وطلبات التجهيز" : "الحضور والمواظبة والخروج"} desc="الحضور الصباحي بالباركود منفصل عن طلبات الخروج والاستئذان. الطلب أو الموافقة أو النداء لا يعني أن الطالب خرج؛ الخروج يُسجَّل عند التسليم الفعلي فقط." />
      {station && <Link to="/app/attendance-station" className="mb-4 inline-flex items-center gap-2 rounded-xl border-2 border-primary bg-primary/5 px-4 py-2 font-semibold text-primary hover:bg-primary/10"><ScanLine className="size-5" />حضور الطلاب والنداء بالمسح</Link>}
      {tabs.length > 1 && (
        <div role="tablist" className="mb-5 flex flex-wrap gap-1 rounded-xl border bg-card p-1">
          {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{LABEL[t]}</button>)}
        </div>
      )}
      {tab === "lessons" && (ctx.role === "teacher" ? <LessonsTab /> : <LessonsSchoolTab schoolId={ctx.schoolId} />)}
      {tab === "today" && <><TickStatus schoolId={ctx.schoolId} /><TodayTab ctx={ctx} canApprove={canApprove} canRecord={!canApprove && !!perms?.["attendance.record"]} /></>}
            {tab === "pickups" && <PickupsTab ctx={ctx} canApprove={canApprove} gate={gate} />}
            {tab === "cards" && <CardsTab ctx={ctx} />}
      {tab === "records" && <RecordsTab ctx={ctx} canCorrect={gate} />}
      {tab === "followup" && <FollowupTab ctx={ctx} />}
      {tab === "settings" && <SettingsTab ctx={ctx} />}
      {tab === "compare" && <CompareTab ctx={ctx} />}
    </>
  );
}
