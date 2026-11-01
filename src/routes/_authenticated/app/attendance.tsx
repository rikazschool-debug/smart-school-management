import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { CardsTab, FollowupTab, GateTab, PickupsTab, RecordsTab, TodayTab } from "@/components/attendance/staff";
import { CallsTab, SettingsTab } from "@/components/attendance/calls-settings";
import { attTabs, canManage, type AttTab } from "@/lib/roles";
import type { AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/attendance")({
  head: () => ({ meta: [{ title: "الحضور والخروج — ركاز" }, { name: "description", content: "الحضور بالباركود، الاستئذان والاستلام، النداء والسجلات." }] }),
  component: Page,
});

const LABEL: Record<AttTab, string> = { today: "لوحة اليوم", gate: "البوابة", pickups: "الاستلام والاستئذان", calls: "النداء", cards: "البطاقات والمستلمون", records: "السجلات", followup: "متابعة المواظبة", settings: "الإعدادات" };

function Page() {
  return <RequireSchool nav="attendance">{(ctx) => <Att ctx={ctx} />}</RequireSchool>;
}

function Att({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const tabs = attTabs(ctx.role);
  const [tab, setTab] = useState<AttTab>(tabs[0] ?? "today");
  // UI mirrors SQL: approvals = managers + policy approver roles (default vice principal, student affairs); gate = student affairs/managers/security
  const canApprove = canManage(ctx.role) || ctx.role === "student_affairs";
  const gate = ctx.role !== "teacher" && ctx.role !== "counselor";
  return (
    <>
      <PageHeader title={ctx.role === "teacher" ? "طلبات تجهيز الطلاب" : "الحضور والمواظبة والخروج"} desc="الحضور الصباحي بالباركود منفصل عن طلبات الخروج والاستئذان. الطلب أو الموافقة أو النداء لا يعني أن الطالب خرج؛ الخروج يُسجَّل عند التسليم الفعلي فقط." />
      {tabs.length > 1 && (
        <div role="tablist" className="mb-5 flex flex-wrap gap-1 rounded-xl border bg-card p-1">
          {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{LABEL[t]}</button>)}
        </div>
      )}
      {tab === "today" && <TodayTab ctx={ctx} canApprove={canApprove} />}
      {tab === "gate" && <GateTab ctx={ctx} canApprove={canApprove} />}
      {tab === "pickups" && <PickupsTab ctx={ctx} canApprove={canApprove} gate={gate} />}
      {tab === "calls" && <CallsTab ctx={ctx} />}
      {tab === "cards" && <CardsTab ctx={ctx} />}
      {tab === "records" && <RecordsTab ctx={ctx} canCorrect={gate} />}
      {tab === "followup" && <FollowupTab ctx={ctx} />}
      {tab === "settings" && <SettingsTab ctx={ctx} />}
    </>
  );
}
