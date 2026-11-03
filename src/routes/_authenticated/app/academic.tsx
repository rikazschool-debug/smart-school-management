import { createFileRoute } from "@tanstack/react-router";
import { CrudTable } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canManageAcademic } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/academic")({ component: Page });

function Page() {
  return (
    <RequireSchool nav="academic">
      {(ctx) => {
        const w = canManageAcademic(ctx.role);
        const s = ctx.schoolId;
        return (
          <>
            <PageHeader title="الإعداد الأكاديمي" desc={`${ctx.schoolName} — السنوات، المراحل، الصفوف، الشعب، الأقسام والمواد`} />
            <Tabs defaultValue="years" dir="rtl">
              <TabsList className="mb-6 flex-wrap">
                <TabsTrigger value="years">السنوات والفصول</TabsTrigger>
                <TabsTrigger value="structure">المراحل والصفوف</TabsTrigger>
                <TabsTrigger value="sections">الشعب</TabsTrigger>
                <TabsTrigger value="subjects">الأقسام والمواد</TabsTrigger>
              </TabsList>
              <TabsContent value="years" className="space-y-10">
                <CrudTable title="السنوات الدراسية" table="academic_years" schoolId={s} canWrite={w} order="start_date" searchKeys={["name"]}
                  fields={[
                    { key: "name", label: "الاسم", required: true },
                    { key: "start_date", label: "البداية", type: "date", required: true },
                    { key: "end_date", label: "النهاية", type: "date", required: true },
                    { key: "is_current", label: "السنة الحالية", type: "checkbox" },
                  ]}
                  columns={[
                    { label: "الاسم", render: (r) => r["name"] },
                    { label: "الفترة", render: (r) => `${r["start_date"]} ← ${r["end_date"]}` },
                    { label: "الحالة", render: (r) => (r["is_current"] ? "حالية" : "—") },
                  ]} />
                <CrudTable title="الفصول الدراسية" table="terms" schoolId={s} canWrite={w} select="*, academic_years(name)" searchKeys={["name"]}
                  fields={[
                    { key: "year_id", label: "السنة", type: "select", required: true, options: { table: "academic_years", label: "name" } },
                    { key: "name", label: "الاسم", required: true },
                    { key: "start_date", label: "البداية", type: "date" },
                    { key: "end_date", label: "النهاية", type: "date" },
                  ]}
                  columns={[
                    { label: "الفصل", render: (r) => r["name"] },
                    { label: "السنة", render: (r) => r["academic_years"]?.name },
                  ]} />
              </TabsContent>
              <TabsContent value="structure" className="space-y-10">
                <CrudTable title="المراحل" table="stages" schoolId={s} canWrite={w} order="sort_order" searchKeys={["name"]}
                  fields={[{ key: "name", label: "الاسم", required: true }, { key: "sort_order", label: "الترتيب", type: "number" }]}
                  columns={[{ label: "المرحلة", render: (r) => r["name"] }, { label: "الترتيب", render: (r) => r["sort_order"] }]} />
                <CrudTable title="الصفوف" table="grades" schoolId={s} canWrite={w} order="sort_order" select="*, stages(name)" searchKeys={["name"]}
                  fields={[
                    { key: "stage_id", label: "المرحلة", type: "select", required: true, options: { table: "stages", label: "name" } },
                    { key: "name", label: "الاسم", required: true },
                    { key: "sort_order", label: "الترتيب", type: "number" },
                  ]}
                  columns={[{ label: "الصف", render: (r) => r["name"] }, { label: "المرحلة", render: (r) => r["stages"]?.name }]} />
              </TabsContent>
              <TabsContent value="sections">
                <CrudTable title="الشعب" table="sections" schoolId={s} canWrite={w} order="name"
                  select="*, grades(name), academic_years(name), enrollments(count)" searchKeys={["name"]}
                  fields={[
                    { key: "year_id", label: "السنة", type: "select", required: true, options: { table: "academic_years", label: "name" } },
                    { key: "grade_id", label: "الصف", type: "select", required: true, options: { table: "grades", label: "name", order: "sort_order" } },
                    { key: "name", label: "اسم الشعبة", required: true },
                    { key: "capacity", label: "السعة", type: "number", required: true },
                  ]}
                  defaults={{ capacity: 30 }}
                  columns={[
                    { label: "الشعبة", render: (r) => r["name"] },
                    { label: "الصف", render: (r) => r["grades"]?.name },
                    { label: "السنة", render: (r) => r["academic_years"]?.name },
                    { label: "المسجلون / السعة", render: (r) => `${r["enrollments"]?.[0]?.count ?? 0} / ${r["capacity"]}` },
                  ]} />
              </TabsContent>
              <TabsContent value="subjects" className="space-y-10">
                <CrudTable title="الأقسام التعليمية" table="departments" schoolId={s} canWrite={w} order="name" searchKeys={["name"]}
                  fields={[{ key: "name", label: "اسم القسم", required: true }]}
                  columns={[{ label: "القسم", render: (r) => r["name"] }]} />
                <CrudTable title="المواد" table="subjects" schoolId={s} canWrite={w} order="name" select="*, departments(name)" searchKeys={["name", "code"]}
                  fields={[
                    { key: "name", label: "اسم المادة", required: true },
                    { key: "code", label: "الرمز" },
                    { key: "department_id", label: "القسم", type: "select", options: { table: "departments", label: "name" } },
                  ]}
                  columns={[
                    { label: "المادة", render: (r) => r["name"] },
                    { label: "الرمز", render: (r) => r["code"] ?? "—" },
                    { label: "القسم", render: (r) => r["departments"]?.name ?? "—" },
                  ]} />
              </TabsContent>
            </Tabs>
          </>
        );
      }}
    </RequireSchool>
  );
}
