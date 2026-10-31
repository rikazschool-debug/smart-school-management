import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { CrudTable } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canManageStudents } from "@/lib/roles";
import { arabicError } from "@/lib/session";

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
                <Button variant="ghost" size="sm" onClick={async () => {
                  const { error } = await supabase.rpc("invite_member", { _email: r["email"], _school: ctx.schoolId, _role: "guardian" });
                  if (error) toast.error(arabicError(error)); else toast.success("أُرسلت الدعوة");
                }}>
                  <Send className="size-4" /> دعوة
                </Button>
              ) : null
            } />
        </>
      )}
    </RequireSchool>
  );
}
