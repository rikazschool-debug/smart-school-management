import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, UserPlus, X } from "lucide-react";
import { CrudTable, db, RecordForm, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { MultiSectionAssign } from "@/components/multi-section-assign";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolPerms } from "@/lib/school-perms";
import { anyPermission, workspacePages } from "@/lib/workspace-perms";
import { arabicError, type AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/courses")({ head: () => ({ meta: [{ title: "المقررات والتكليفات — ركاز" }, { name: "description", content: "المقررات وتكليفات المعلمين حسب التفويض والنطاق." }, { property: "og:title", content: "المقررات والتكليفات — ركاز" }, { property: "og:description", content: "عرض المقررات وإدارة تكليفات المعلمين حسب الصلاحيات." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Page });

export const STATUS_LABEL: Record<string, string> = { pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", ended: "منتهٍ" };

function courseName(r: Row) {
  return `${r["subjects"]?.name ?? ""} — ${r["sections"]?.grades?.name ?? ""} / ${r["sections"]?.name ?? ""}`;
}

function Page() {
  return <RequireSchool nav="courses" extra={(p) => workspacePages(p).includes("courses")}>{(ctx) => <Courses ctx={ctx} />}</RequireSchool>;
}

function Courses({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const qc = useQueryClient();
  const p = useSchoolPerms(ctx.schoolId);
  const manage = !!p?.["course_setup.edit"];
  const create = !!p?.["course_setup.create"];
  const canAssign = !!p?.["course_assignments.assign"];
  const approve = !!p?.["course_assignments.approve"];
  const [assigning, setAssigning] = useState<Row | null>(null);
  const teachers = useQuery({ queryKey: ["workspace-teachers", ctx.schoolId], enabled: canAssign || !!p?.["course_assignments.view"], queryFn: async () => {
    const result = await db.rpc("workspace_teacher_options", { _school: ctx.schoolId });
    if (result.error) throw result.error;
    return (result.data ?? []) as Row[];
  } });
  const assignmentsView = anyPermission(p, ["course_assignments.view", "course_assignments.assign", "course_assignments.approve", "course_assignments.cancel"]) && p?.["course_assignments.view"] !== false;
  const coursesView = anyPermission(p, ["course_setup.view", "course_setup.create", "course_setup.edit"]) && p?.["course_setup.view"] !== false;

  const pending = useQuery({
    queryKey: ["assignments", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db
        .from("teacher_assignments")
        .select("*, teachers(full_name), courses(subjects(name, department_id), sections(name, grades(name)))")
        .eq("school_id", ctx.schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  const assign = useMutation({
    mutationFn: async (v: Row) => {
      const { error } = await db.from("teacher_assignments").insert({ ...v, course_id: assigning?.["id"], school_id: ctx.schoolId, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("أُرسل التكليف للاعتماد"); setAssigning(null); qc.invalidateQueries(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  async function decide(id: string, approve: boolean) {
    const { error } = await supabase.rpc("decide_assignment", { _id: id, _approve: approve });
    if (error) return void toast.error(arabicError(error));
    toast.success(approve ? "اعتُمد التكليف وأُنشئ الفصل الرقمي" : "رُفض التكليف");
    qc.invalidateQueries();
  }
  async function end(id: string) {
    const { error } = await supabase.rpc("end_assignment", { _id: id });
    if (error) return void toast.error(arabicError(error));
    toast.success("أُنهي التكليف");
    qc.invalidateQueries();
  }
  const visible = (pending.data ?? []).filter(
    (a) => ctx.role !== "dept_head" || a["courses"]?.subjects?.department_id === ctx.departmentId,
  );

  return (
    <>
      <PageHeader title="المقررات والتكليفات" desc="المقرر = مادة + شعبة + سنة. يُكلَّف به معلم ثم يعتمده رئيس القسم أو الإدارة." />
      <section className="mb-10 space-y-3">
        {assignmentsView && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">التكليفات</h2>
          {canAssign && <MultiSectionAssign schoolId={ctx.schoolId} canCreateCourses={create} canApprove={approve} />}
        </div>
        {pending.isLoading ? <LoadingState /> : pending.error ? <ErrorState message={arabicError(pending.error)} onRetry={() => pending.refetch()} /> : visible.length === 0 ? (
          <EmptyState title="لا توجد تكليفات" hint={ctx.role === "dept_head" ? "تظهر هنا تكليفات مواد قسمك فقط." : undefined} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {visible.map((a) => (
              <li key={a["id"]} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a["teachers"]?.full_name ?? teachers.data?.find((t) => t["id"] === a["teacher_id"])?.["full_name"]}</p>
                  <p className="text-sm text-muted-foreground">{courseName(a["courses"] ?? {})}</p>
                  <p className="text-xs text-muted-foreground">من {a["start_date"]}{a["end_date"] ? ` إلى ${a["end_date"]}` : ""}</p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{STATUS_LABEL[a["status"]]}</span>
                {a["status"] === "pending" && approve && (
                  <>
                    <Button size="sm" onClick={() => decide(a["id"], true)}><Check className="size-4" /> اعتماد</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(a["id"], false)}><X className="size-4" /> رفض</Button>
                  </>
                )}
                {a["status"] === "approved" && p?.["course_assignments.cancel"] && <Button size="sm" variant="ghost" onClick={() => end(a["id"])}>إنهاء</Button>}
              </li>
            ))}
          </ul>
        )}
        </>}
      </section>

      {coursesView && <CrudTable title="المقررات" table="courses" schoolId={ctx.schoolId} canWrite={manage} canCreate={false} searchKeys={[]}
        toolbar={create ? <MultiSectionAssign mode="course" schoolId={ctx.schoolId} canCreateCourses canAssign={canAssign} canApprove={approve} /> : null}
        select="*, academic_years(name), subjects(name, department_id), sections(name, grades(name)), teacher_assignments(status, teachers(full_name))"
        fields={[
          { key: "year_id", label: "السنة", type: "select", required: true, options: { table: "academic_years", label: "name" } },
          { key: "subject_id", label: "المادة", type: "select", required: true, options: { table: "subjects", label: "name" } },
          { key: "section_id", label: "الشعبة", type: "select", required: true, options: { table: "sections", label: "name" } },
          { key: "weekly_periods", label: "الحصص الأسبوعية", type: "number" },
        ]}
        defaults={{ weekly_periods: 4 }}
        columns={[
          { label: "المقرر", render: (r) => courseName(r) },
          { label: "السنة", render: (r) => r["academic_years"]?.name },
          { label: "المعلم", render: (r) => {
            const a = (r["teacher_assignments"] as Row[] | undefined)?.find((x) => x["status"] === "approved" || x["status"] === "pending");
            return a ? `${a["teachers"]?.full_name} (${STATUS_LABEL[a["status"]]})` : "غير مكلف";
          } },
        ]}
        extraActions={(r) => {
          const open = (r["teacher_assignments"] as Row[] | undefined)?.some((x) => x["status"] === "approved" || x["status"] === "pending");
          return canAssign && !open ? (
            <Button variant="ghost" size="sm" onClick={() => setAssigning(r)}><UserPlus className="size-4" /> تكليف</Button>
          ) : null;
        }} />}

      <Dialog open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تكليف معلم — {assigning && courseName(assigning)}</DialogTitle></DialogHeader>
          {assigning && (
            <RecordForm schoolId={ctx.schoolId} initial={{ start_date: new Date().toISOString().slice(0, 10) }} submitting={assign.isPending} onSubmit={(v) => assign.mutate(v)}
              fields={[
                { key: "teacher_id", label: "المعلم", type: "select", required: true, options: (teachers.data ?? []).filter((t) => t["status"] === "active").map((t) => ({ value: String(t["id"]), label: String(t["full_name"]) })) },
                { key: "start_date", label: "بداية السريان", type: "date", required: true },
                { key: "end_date", label: "نهاية السريان", type: "date" },
              ]} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
