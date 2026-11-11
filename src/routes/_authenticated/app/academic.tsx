import { createFileRoute } from "@tanstack/react-router";
import { CrudTable } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffScopes } from "@/components/staff-scopes";
import { useSchoolPerms } from "@/lib/school-perms";
import { ACADEMIC_PARTS, academicAccess } from "@/lib/workspace-perms";
import type { AppContext } from "@/lib/session";
import { ForbiddenState, LoadingState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/app/academic")({
  head: () => ({ meta: [{ title: "الإعداد الأكاديمي — ركاز" }, { name: "description", content: "السنوات والمراحل والشعب والأقسام والمواد ونطاق الوكلاء والمشرفين." }, { property: "og:title", content: "الإعداد الأكاديمي — ركاز" }, { property: "og:description", content: "إعداد المدرسة الأكاديمي لمدير المدرسة." }] }),
  component: Page,
});

function Page() {
  return (
    <RequireSchool nav="academic" extra={(p) => ACADEMIC_PARTS.some((part) => academicAccess(p, part.key))}>
      {(ctx) => <Academic ctx={ctx} />}
    </RequireSchool>
  );
}

function Academic({ ctx }: { ctx: AppContext & { schoolId: string } }) {
        const p = useSchoolPerms(ctx.schoolId);
        if (!p) return <LoadingState />;
        const access = (key: string) => academicAccess(p, key);
        const edit = (key: string) => !!p[`${key}.edit`];
        const tabs = [...new Set(ACADEMIC_PARTS.filter((part) => access(part.key)).map((part) => part.tab))];
        const firstTab = tabs[0];
        if (!firstTab) return <ForbiddenState />;
        const s = ctx.schoolId;
        return (
          <>
            <PageHeader title="الإعداد الأكاديمي" desc={`${ctx.schoolName} — السنوات، المراحل، الصفوف، الشعب، الأقسام والمواد`} />
            <Tabs defaultValue={firstTab} key={tabs.join(",")} dir="rtl">
              <TabsList className="mb-6 flex-wrap">
                {tabs.includes("years") && <TabsTrigger value="years">السنوات والفصول</TabsTrigger>}
                {tabs.includes("structure") && <TabsTrigger value="structure">المراحل والصفوف</TabsTrigger>}
                {tabs.includes("sections") && <TabsTrigger value="sections">الشعب</TabsTrigger>}
                {tabs.includes("subjects") && <TabsTrigger value="subjects">الأقسام والمواد</TabsTrigger>}
                {tabs.includes("scopes") && <TabsTrigger value="scopes">نطاق الوكلاء والمشرفين</TabsTrigger>}
              </TabsList>
              <TabsContent value="years" className="space-y-10">
                {access("academic_years") && <CrudTable title="السنوات الدراسية" table="academic_years" schoolId={s} canWrite={edit("academic_years")} order="start_date" searchKeys={["name"]}
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
                  ]} />}
                {access("academic_terms") && <CrudTable title="الفصول الدراسية" table="terms" schoolId={s} canWrite={edit("academic_terms")} select="*, academic_years(name)" searchKeys={["name"]}
                  fields={[
                    { key: "year_id", label: "السنة", type: "select", required: true, options: { table: "academic_years", label: "name" } },
                    { key: "name", label: "الاسم", required: true },
                    { key: "start_date", label: "البداية", type: "date" },
                    { key: "end_date", label: "النهاية", type: "date" },
                  ]}
                  columns={[
                    { label: "الفصل", render: (r) => r["name"] },
                    { label: "السنة", render: (r) => r["academic_years"]?.name },
                  ]} />}
              </TabsContent>
              <TabsContent value="structure" className="space-y-10">
                {access("academic_stages") && <CrudTable title="المراحل" table="stages" schoolId={s} canWrite={edit("academic_stages")} order="sort_order" searchKeys={["name"]}
                  fields={[{ key: "name", label: "الاسم", required: true }, { key: "sort_order", label: "الترتيب", type: "number" }]}
                  columns={[{ label: "المرحلة", render: (r) => r["name"] }, { label: "الترتيب", render: (r) => r["sort_order"] }]} />}
                {access("academic_grades") && <CrudTable title="الصفوف" table="grades" schoolId={s} canWrite={edit("academic_grades")} order="sort_order" select="*, stages(name)" searchKeys={["name"]}
                  fields={[
                    { key: "stage_id", label: "المرحلة", type: "select", required: true, options: { table: "stages", label: "name" } },
                    { key: "name", label: "الاسم", required: true },
                    { key: "sort_order", label: "الترتيب", type: "number" },
                  ]}
                  columns={[{ label: "الصف", render: (r) => r["name"] }, { label: "المرحلة", render: (r) => r["stages"]?.name }]} />}
              </TabsContent>
              <TabsContent value="sections">
                {access("academic_sections") && <CrudTable title="الشعب" table="sections" schoolId={s} canWrite={edit("academic_sections")} order="name"
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
                  ]} />}
              </TabsContent>
              <TabsContent value="subjects" className="space-y-10">
                {access("academic_departments") && <CrudTable title="الأقسام التعليمية" table="departments" schoolId={s} canWrite={edit("academic_departments")} order="name" searchKeys={["name"]}
                  fields={[{ key: "name", label: "اسم القسم", required: true }]}
                  columns={[{ label: "القسم", render: (r) => r["name"] }]} />}
                {access("academic_subjects") && <CrudTable title="المواد" table="subjects" schoolId={s} canWrite={edit("academic_subjects")} order="name" select="*, departments(name)" searchKeys={["name", "code"]}
                  fields={[
                    { key: "name", label: "اسم المادة", required: true },
                    { key: "code", label: "الرمز" },
                    { key: "department_id", label: "القسم", type: "select", options: { table: "departments", label: "name" } },
                  ]}
                  columns={[
                    { label: "المادة", render: (r) => r["name"] },
                    { label: "الرمز", render: (r) => r["code"] ?? "—" },
                    { label: "القسم", render: (r) => r["departments"]?.name ?? "—" },
                  ]} />}
              </TabsContent>
              {access("academic_scopes") && <TabsContent value="scopes"><StaffScopes schoolId={s} canWrite={edit("academic_scopes")} /></TabsContent>}
            </Tabs>
          </>
        );
}
