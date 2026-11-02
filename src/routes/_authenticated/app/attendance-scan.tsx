import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { AttendanceScanner } from "@/components/attendance/scanner";
import { attTabs } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/attendance-scan")({
  head: () => ({ meta: [{ title: "مسح بطاقات الحضور — ركاز" }, { name: "description", content: "تسجيل الحضور الصباحي بقارئ الباركود أو كاميرا الهاتف بوقت الخادم." }] }),
  component: Page,
});

function Page() {
  return (
    <RequireSchool nav="attendance">
      {(ctx) => (
        <>
          <PageHeader title="مسح بطاقات الحضور" desc="الحضور الصباحي فقط. الوقت والحالة يحددهما الخادم." />
          <Link to="/app/attendance" className="mb-4 inline-block text-sm text-primary hover:underline">← العودة إلى الحضور</Link>
          {attTabs(ctx.role).includes("gate") ? <AttendanceScanner schoolId={ctx.schoolId} schoolName={ctx.schoolName} /> : <EmptyState title="المسح متاح للأمن والاستقبال والمخولين فقط" />}
        </>
      )}
    </RequireSchool>
  );
}
