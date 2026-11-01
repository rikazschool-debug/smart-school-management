import { createFileRoute } from "@tanstack/react-router";
import { CrudTable } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { canManageStudents } from "@/lib/roles";
import { AccountButton } from "@/components/account-button";

export const Route = createFileRoute("/_authenticated/app/guardians")({ component: Page });

function Page() {
  return (
    <RequireSchool nav="guardians">
      {(ctx) => (
        <>
          <PageHeader title="أولياء الأمور" desc="أنشئ ولي الأمر ثم اربطه بالطالب من صفحة الطلاب." />
          <CrudTable title="أولياء الأمور" table="guardians" schoolId={ctx.schoolId} canWrite={canManageStudents(ctx.role)} order="full_name"
            select="*, student_guardians(id)" searchKeys={["full_name", "phone", "email", "national_id"]}
            fields={[
              { key: "full_name", label: "الاسم الكامل", required: true },
              { key: "phone", label: "الجوال" },
              { key: "email", label: "البريد (لدعوته)", type: "email" },
              { key: "national_id", label: "رقم الهوية" },
            ]}
            columns={[
              { label: "الاسم", render: (r) => r["full_name"] },
              { label: "الجوال", render: (r) => r["phone"] ?? "—" },
              { label: "الأبناء المرتبطون", render: (r) => r["student_guardians"]?.length ?? 0 },
              { label: "الحساب", render: (r) => (r["user_id"] ? "مرتبط" : r["email"] ? "بانتظار الدخول" : "بلا بريد") },
            ]}
            extraActions={(r) =>
              canManageStudents(ctx.role) && !r["user_id"] && r["email"] ? (
                <AccountButton role={ctx.role} kind="guardian" recordId={r["id"]} email={r["email"]} schoolId={ctx.schoolId} />
              ) : null
            } />
        </>
      )}
    </RequireSchool>
  );
}
