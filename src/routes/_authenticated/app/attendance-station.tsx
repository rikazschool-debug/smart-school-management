import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { AttendanceScanner } from "@/components/attendance/scanner";
import { StudentSearchCheckin } from "@/components/attendance/student-search";
import { GateTab } from "@/components/attendance/staff";
import { CallsTab } from "@/components/attendance/calls-settings";
import { FieldTestGuide } from "@/components/attendance/field-test-guide";
import { attTabsWith, canApproveAttendanceWith, canScanWith } from "@/lib/roles";
import { useSchoolPerms } from "@/lib/school-perms";
import type { AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/attendance-station")({
  head: () => ({ meta: [{ title: "حضور الطلاب والنداء بالمسح — ركاز" }, { name: "description", content: "مسح بطاقات الحضور، البحث بالاسم، البوابة والنداء في مكان واحد." }, { property: "og:title", content: "حضور الطلاب والنداء بالمسح — ركاز" }, { property: "og:description", content: "مسح الحضور والبوابة والنداء في مكان واحد." }] }),
  component: Page,
});

type T = "scan" | "gate" | "calls" | "guide";
const LABEL: Record<T, string> = { scan: "مسح الحضور والبحث", gate: "البوابة", calls: "النداء", guide: "دليل الاختبار الميداني" };

function Page() {
  const [picked, setTab] = useState<T | null>(null);
  return (
    <RequireSchool nav="attendance" extra={(p) => !!p["gate.operate"]}>
      {(ctx) => <Station ctx={ctx} picked={picked} setTab={setTab} />}
    </RequireSchool>
  );
}

function Station({ ctx, picked, setTab }: { ctx: AppContext & { schoolId: string }; picked: T | null; setTab: (t: T) => void }) {
        const perms = useSchoolPerms(ctx.schoolId);
        const allowed = attTabsWith(ctx.role, perms);
        if (!allowed.includes("gate")) return <EmptyState title="هذا القسم متاح للأمن والاستقبال والمخولين فقط" />;
        const canApprove = canApproveAttendanceWith(ctx.role, perms);
        // scanning (camera/reader/name search) is for the gate account only — mirrors att_scanner
        const tabs: T[] = [...(canScanWith(ctx.role, perms) ? (["scan"] as T[]) : []), "gate", ...(allowed.includes("calls") ? (["calls"] as T[]) : []), ...(canScanWith(ctx.role, perms) ? (["guide"] as T[]) : [])];
        const tab: T = picked && tabs.includes(picked) ? picked : tabs[0]!;
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
            {tab === "guide" && <FieldTestGuide schoolName={ctx.schoolName} />}
          </>
        );
}
