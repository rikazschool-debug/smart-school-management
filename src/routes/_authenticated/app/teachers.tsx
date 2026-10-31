import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { CrudTable } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canManage } from "@/lib/roles";
import { arabicError } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/teachers")({ component: Page });

function Page() {
  return (
    <RequireSchool nav="teachers">
      {(ctx) => (
        <>
          <PageHeader title="المعلمون" desc="حسابات المعلمين وتخصصاتهم وأقسامهم (إدارة تعليمية فقط)." />
          <CrudTable title="المعلمون" table="teachers" schoolId={ctx.schoolId} canWrite={canManage(ctx.role)} order="full_name"
            select="*, departments(name)" searchKeys={["full_name", "email", "specialization"]}
            fields={[
              { key: "full_name", label: "الاسم الكامل", required: true },
              { key: "email", label: "البريد (لدعوته للدخول)", type: "email" },
              { key: "phone", label: "الجوال" },
              { key: "specialization", label: "التخصص" },
              { key: "department_id", label: "القسم", type: "select", options: { table: "departments", label: "name" } },
              { key: "status", label: "الحالة", type: "select", options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "موقوف" }] },
            ]}
            defaults={{ status: "active" }}
            columns={[
              { label: "الاسم", render: (r) => r["full_name"] },
              { label: "التخصص", render: (r) => r["specialization"] ?? "—" },
              { label: "القسم", render: (r) => r["departments"]?.name ?? "—" },
              { label: "الحساب", render: (r) => (r["user_id"] ? "مرتبط" : r["email"] ? "بانتظار الدخول" : "بلا بريد") },
            ]}
            extraActions={(r) =>
              canManage(ctx.role) && !r["user_id"] && r["email"] ? (
                <Button variant="ghost" size="sm" onClick={async () => {
                  const { error } = await supabase.rpc("invite_member", { _email: r["email"], _school: ctx.schoolId, _role: "teacher" });
                  if (error) toast.error(arabicError(error)); else toast.success("أُرسلت الدعوة: يدخل المعلم ببريده ليرتبط حسابه");
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
