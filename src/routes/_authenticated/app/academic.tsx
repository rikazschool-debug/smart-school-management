import { CalendarDays, Layers, LayoutGrid, BookOpen, UserCog } from "lucide-react";
import { OrgYears } from "@/components/org-years";
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
import { AcademicAllocation, AcademicCatalogEditor } from "@/components/academic-allocation";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { SubjectNameSelect } from "@/components/subject-preset-picker";
import { SUBJECT_PRESETS } from "@/lib/subject-presets";
import { selectCls } from "@/components/ui/native-select";
import { AcademicPresetPicker, GradeNameSelect } from "@/components/academic-preset-picker";
import { formatAcademicYear } from "@/lib/academic-year";

const ACAD_TABS = [
  { v: "years", label: "السنوات والفصول", hint: "التقويم الدراسي", icon: CalendarDays },
  { v: "structure", label: "المراحل والصفوف", hint: "هيكل المدرسة", icon: Layers },
  { v: "sections", label: "الشعب", hint: "الفصول والسعة", icon: LayoutGrid },
  { v: "subjects", label: "الأقسام والمقررات", hint: "المواد الدراسية", icon: BookOpen },
  { v: "scopes", label: "نطاق الوكلاء والمشرفين", hint: "توزيع المسؤوليات", icon: UserCog },
];

export const Route = createFileRoute("/_authenticated/app/academic")({
  head: () => ({ meta: [{ title: "الهيكل الأكاديمي — ركاز" }, { name: "description", content: "محددات الدراسة المعتمدة من المالك وتخصيصها للفروع وتكوين الشعب للوكيل." }, { property: "og:title", content: "الهيكل الأكاديمي — ركاز" }, { property: "og:description", content: "محددات المؤسسة والشعب المتاحة للفرع." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
        const owner = ctx.role === "org_owner" || ctx.role === "platform_admin";
        const vice = ctx.role === "vice_principal";
        const principal = ctx.role === "principal";
        const central = ["academic_years", "academic_terms", "academic_stages", "academic_grades"];
const stages = useQuery({ queryKey: ["academic-stage-options", ctx.schoolId], queryFn: async () => { const { data, error } = await db.from("stages").select("id,name").eq("school_id", ctx.schoolId).eq("available", true).order("sort_order"); if (error) throw error; return data as Row[]; } });
        if (!p) return <LoadingState />;
        const access = (key: string) => vice ? key === "academic_sections" : (owner || (principal && central.includes(key)) || academicAccess(p, key));
        const edit = (key: string) => central.includes(key) ? owner : key === "academic_sections" ? owner || vice : !!p[`${key}.edit`];
        const tabs = [...new Set(ACADEMIC_PARTS.filter((part) => access(part.key)).map((part) => part.tab))];
        const firstTab = tabs[0];
        if (!firstTab) return <ForbiddenState />;
        const s = ctx.schoolId;
        return (
          <>
            <PageHeader title="الإعداد الأكاديمي" desc={`${ctx.schoolName} — السنوات، المراحل، الصفوف، الشعب، الأقسام والمقررات`} />
            {owner && ctx.orgId && <><AcademicCatalogEditor org={ctx.orgId} /><AcademicAllocation school={s} org={ctx.orgId} /></>}
            <Tabs defaultValue={firstTab} key={tabs.join(",")} dir="rtl">
              <TabsList className="mb-6 flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl border bg-card p-2 shadow-sm [scrollbar-width:none] lg:grid lg:grid-cols-5">
                {ACAD_TABS.filter((t) => (tabs as string[]).includes(t.v)).map((t) => (
                  <TabsTrigger key={t.v} value={t.v} aria-label={t.label} className="group flex min-w-[11rem] shrink-0 items-center justify-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-start transition-all hover:bg-muted data-[state=active]:border-primary/20 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md lg:min-w-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary group-data-[state=active]:bg-primary-foreground/15 group-data-[state=active]:text-primary-foreground"><t.icon className="size-4" /></span>
                    <span className="min-w-0"><span className="block truncate text-sm font-bold">{t.label}</span><span className="block truncate text-xs font-normal opacity-70">{t.hint}</span></span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="years" className="space-y-10">
                {ctx.orgId && <OrgYears org={ctx.orgId} owner={owner} />}
              </TabsContent>
              <TabsContent value="structure" className="space-y-10">
                {access("academic_stages") && <CrudTable title="المراحل" table="stages" schoolId={s} defaults={{ available: true }} filter={owner ? {} : { available: true }} canDelete={false} canWrite={edit("academic_stages")} order="sort_order" searchKeys={["name"]}
                  formExtra={ctx.orgId ? (fill) => <AcademicPresetPicker kind="stage" org={ctx.orgId ?? ""} school={s} onSelect={fill} /> : undefined}
                  fields={[{ key: "name", label: "الاسم", required: true }, { key: "sort_order", label: "الترتيب", type: "number" }, { key: "available", label: "متاح للفرع", type: "checkbox" }]}
                  columns={[{ label: "المرحلة", render: (r) => r["name"] }, { label: "الترتيب", render: (r) => r["sort_order"] }]} />}
                {access("academic_grades") && <CrudTable title="الصفوف" table="grades" schoolId={s} defaults={{ available: true }} filter={owner ? {} : { available: true }} canDelete={false} canWrite={edit("academic_grades")} order="sort_order" select="*, stages(name)" searchKeys={["name"]}
                  filters={[{ key: "stage_id", label: "المرحلة", remote: { table: "stages", label: "name" } }]}
                  fields={[
                    { key: "stage_id", label: "المرحلة", type: "select", required: true, options: { table: "stages", label: "name" }, resetFields: ["name", "sort_order"] },
                    { key: "name", label: "الصف", required: true, custom: (p) => <GradeNameSelect org={ctx.orgId ?? ""} school={s} {...p} /> },
                    { key: "sort_order", label: "الترتيب", type: "number" },
                    { key: "available", label: "متاح للفرع", type: "checkbox" },
                  ]}
                  columns={[{ label: "الصف", render: (r) => r["name"] }, { label: "المرحلة", render: (r) => r["stages"]?.name }]} />}
              </TabsContent>
              <TabsContent value="sections">
                {access("academic_sections") && <CrudTable title="الشعب" table="sections" schoolId={s} canWrite={edit("academic_sections")} order="name"
                  select="*, grades(name,stage_id), academic_years(name), enrollments(count)" searchKeys={["name"]}
                  fields={[
                    { key: "year_id", label: "السنة", type: "select", required: true, options: { table: "academic_years", label: "name", filter: { available: true } }, resetFields: ["term_id"] },
                    { key: "term_id", label: "الفصل الدراسي", type: "select", required: true, options: { table: "terms", label: "name", filter: { available: true } }, dependsOn: { field: "year_id", column: "year_id" } },
                    { key: "_stage", label: "المرحلة", type: "select", transient: true, initialPath: ["grades", "stage_id"], required: true, options: (stages.data ?? []).map((r) => ({ value: r["id"] as string, label: r["name"] as string })), resetFields: ["grade_id"] },
                    { key: "grade_id", label: "الصف", type: "select", required: true, options: { table: "grades", label: "name", order: "sort_order", filter: { available: true } }, dependsOn: { field: "_stage", column: "stage_id" } },
                    { key: "name", label: "اسم الشعبة", required: true },
                    { key: "capacity", label: "السعة", type: "number", required: true },
                  ]}
                  defaults={{ capacity: 30 }}
                  columns={[
                    { label: "الشعبة", render: (r) => r["name"] },
                    { label: "الصف", render: (r) => r["grades"]?.name },
                    { label: "السنة", render: (r) => formatAcademicYear(r["academic_years"]?.name) },
                    { label: "المسجلون / السعة", render: (r) => `${r["enrollments"]?.[0]?.count ?? 0} / ${r["capacity"]}` },
                  ]} />}
              </TabsContent>
              <TabsContent value="subjects" className="space-y-10">
                {access("academic_departments") && <CrudTable title="الأقسام التعليمية" table="departments" schoolId={s} canWrite={edit("academic_departments")} order="name" searchKeys={["name"]}
                  fields={[{ key: "name", label: "اسم القسم", required: true }]}
                  columns={[{ label: "القسم", render: (r) => r["name"] }]} />}
                {access("academic_subjects") && <CrudTable title="المقررات" table="subjects" schoolId={s} canWrite={edit("academic_subjects")} order="name" select="*, departments(name)" searchKeys={["name", "code"]}
                  fields={[
                    { key: "_subjectStage", label: "المرحلة", type: "select", transient: true, options: Object.keys(SUBJECT_PRESETS).map(value => ({ value, label: value })), resetFields: ["_subjectGrade", "name"] },
                    { key: "_subjectGrade", label: "الصف / المستوى", transient: true, custom: ({ value, values, set }) => <select id="_subjectGrade" className={selectCls("w-full")} disabled={!values["_subjectStage"]} value={String(value ?? "")} onChange={e => set({ _subjectGrade: e.target.value, name: "" })}><option value="">{values["_subjectStage"] ? "اختر الصف / المستوى" : "اختر المرحلة أولًا"}</option>{Object.keys(SUBJECT_PRESETS[String(values["_subjectStage"] ?? "")] ?? {}).map(g => <option key={g} value={g}>{g}</option>)}</select> },
                    { key: "name", label: "المقرر", required: true, custom: (p) => <SubjectNameSelect {...p} /> },
                    { key: "code", label: "الرمز" },
                    { key: "department_id", label: "القسم", type: "select", options: { table: "departments", label: "name" } },
                  ]}
                  columns={[
                    { label: "المقرر", render: (r) => r["name"] },
                    { label: "الرمز", render: (r) => r["code"] ?? "—" },
                    { label: "القسم", render: (r) => r["departments"]?.name ?? "—" },
                  ]} />}
              </TabsContent>
              {access("academic_scopes") && <TabsContent value="scopes"><StaffScopes schoolId={s} canWrite={edit("academic_scopes")} /></TabsContent>}
            </Tabs>
          </>
        );
}
