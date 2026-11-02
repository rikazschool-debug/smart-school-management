import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { AttendanceScanner } from "@/components/attendance/scanner";
import { StudentSearchCheckin } from "@/components/attendance/student-search";
import { GateTab } from "@/components/attendance/staff";
import { CallsTab } from "@/components/attendance/calls-settings";
import { attTabs, canManage } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/attendance-station")({
  head: () => ({ meta: [{ title: "حضور الطلاب والنداء بالمسح — ركاز" }, { name: "description", content: "مسح بطاقات الحضور، البحث بالاسم، البوابة والنداء في مكان واحد." }] }),
  component: Page,
});

type T = "scan" | "gate" | "calls";
const LABEL: Record<T, string> = { scan: "مسح الحضور والبحث", gate: "البوابة", calls: "النداء" };

function Page() {
  const [tab, setTab] = useState<T>("scan");
  return (
    <RequireSchool nav="attendance">
      {(ctx) => {
        const allowed = attTabs(ctx.role);
        if (!allowed.includes("gate")) return <EmptyState title="هذا القسم متاح للأمن والاستقبال والمخولين فقط" />;
        const canApprove = canManage(ctx.role) || ctx.role === "student_affairs";
        const tabs: T[] = ["scan", "gate", ...(allowed.includes("calls") ? (["calls"] as T[]) : [])];
        return (
          <>
            <PageHeader title="حضور الطلاب والنداء بالمسح" desc="الحضور الصباحي بالبطاقة أو بالبحث، وحركة البوابة، وطابور النداء. الوقت والحالة يحددهما الخادم." />
            <Link to="/app/attendance" className="mb-4 inline-block text-sm text-primary hover:underline">← العودة إلى الحضور والمواظبة</Link>
            <div role="tablist" className="mb-5 flex flex-wrap gap-1 rounded-xl border bg-card p-1">
              {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{LABEL[t]}</button>)}
            </div>
            {tab === "scan" && <div className="space-y-6"><AttendanceScanner schoolId={ctx.schoolId} schoolName={ctx.schoolName} /><StudentSearchCheckin schoolId={ctx.schoolId} /></div>}
            {tab === "gate" && <GateTab ctx={ctx} canApprove={canApprove} />}
            {tab === "calls" && <CallsTab ctx={ctx} />}
          </>
        );
      }}
    </RequireSchool>
  );
}
