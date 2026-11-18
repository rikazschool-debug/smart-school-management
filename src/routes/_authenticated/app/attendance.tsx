import { createFileRoute } from "@tanstack/react-router";
import { AttHubNav, ATT_TAB_CLS } from "@/components/attendance/hub-nav";
import { useState } from "react";
import { TickStatus } from "@/components/attendance/tick-status";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { CompareTab, CardsTab, FollowupTab, PickupsTab, RecordsTab, TodayTab } from "@/components/attendance/staff";
import { SettingsTab } from "@/components/attendance/calls-settings";
import { LessonsSchoolTab, LessonsTab } from "@/components/attendance/lessons";
import { ATT_GRANTS, attTabsWith, canApproveAttendanceWith, type AttTab } from "@/lib/roles";
import { useSchoolPerms } from "@/lib/school-perms";
import { useOpsStaff } from "@/lib/ops-staff";
import { useSession } from "@/lib/session";
import type { AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/attendance")({
  head: () => ({ meta: [{ title: "المواظبة والاستئذان — ركاز" }, { name: "description", content: "الحضور بالباركود، المواظبة، الاستئذان والاستلام، النداء والسجلات." }, { property: "og:title", content: "المواظبة والاستئذان — ركاز" }, { property: "og:description", content: "متابعة حضور الطلاب ومواظبتهم والاستئذان." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

const LABEL: Record<AttTab, string> = { lessons: "رصد حضور اليوم", today: "لوحة اليوم", gate: "البوابة", pickups: "الاستلام والاستئذان", calls: "النداء", cards: "البطاقات والمستلمون", records: "السجلات", followup: "متابعة المواظبة", settings: "الإعدادات", compare: "مقارنة الفروع" };

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
      <PageHeader title={ctx.role === "teacher" && !ops.asst ? "رصد حضور اليوم وطلبات التجهيز" : "المواظبة والاستئذان"} desc="الحضور الصباحي بالباركود منفصل عن طلبات الخروج والاستئذان. الطلب أو الموافقة أو النداء لا يعني أن الطالب خرج؛ الخروج يُسجَّل عند التسليم الفعلي فقط." />
      <AttHubNav current="main" station={station} />
      {tabs.length > 1 && (
        <div role="tablist" className="mb-5 flex flex-wrap gap-1 rounded-full border bg-card p-1 shadow-sm">
          {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={ATT_TAB_CLS(tab === t)}>{LABEL[t]}</button>)}
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
