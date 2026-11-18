import { useSchoolPerms } from "@/lib/school-perms";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, IdCard } from "lucide-react";
import { CrudTable, db, type Row } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canManageAcademic, seesStaffDirectory, teachersLabel } from "@/lib/roles";
import { StaffDirectory } from "@/components/staff-directory";
import { AccountButton } from "@/components/account-button";
import { PeopleImport } from "@/components/people-import-dialog";
import { localPhone } from "@/lib/people-import";
import { arabicError } from "@/lib/session";
import { StaffPresence, useStaffPresence } from "@/components/education/staff-presence";

export const Route = createFileRoute("/_authenticated/app/teachers")({
  component: Page,
  head: () => ({ meta: [{ title: "الكادر التعليمي — ركاز" }, { name: "description", content: "دليل الكادر التعليمي والإداري وسجلات المعلمين" }, { property: "og:title", content: "الكادر التعليمي — ركاز" }, { property: "og:description", content: "سجلات المعلمين وعرضها وطباعتها وتصديرها حسب الصلاحيات." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

// national_id is not selectable directly; read through teacher_id_status (people_identity.view)
const COLS = "id, school_id, user_id, full_name, display_name, email, phone, specialization, department_id, status, created_at, departments(name)";
type IdState = { teacher_id: string; national_id: string | null; hr_national_id: string | null; state: "ready" | "missing" | "conflict"; problem: string | null };

function Page() {
  return <RequireSchool nav="teachers">{(ctx) => <Teachers schoolId={ctx.schoolId} role={ctx.role} />}</RequireSchool>;
}

function Teachers({ schoolId, role }: { schoolId: string; role: Parameters<typeof canManageAcademic>[0] }) {
  const presence = useStaffPresence(schoolId);
  const perms0 = useSchoolPerms(schoolId);
  // edit = owner or people_staff.edit (owner-grantable); principal views only — server re-checks (can_edit_staff)
  const w = role === "org_owner" || !!perms0?.["people_staff.edit"];
  // ID view/edit follow the permission tree (people_identity), not a role name; the server re-checks.
  const perms = useSchoolPerms(schoolId);
  const idView = !!perms?.["people_identity.view"], idEdit = !!perms?.["people_identity.edit"];
  const [editing, setEditing] = useState<Row | null>(null);
  const ids = useQuery({
    enabled: idView,
    queryKey: ["teacher-id-status", schoolId],
    queryFn: async () => {
      const { data, error } = await db.rpc("teacher_id_status", { _school: schoolId });
      if (error) throw error;
      return new Map(((data ?? []) as IdState[]).map((x) => [x.teacher_id, x]));
    },
  });
  const st = (r: Row) => ids.data?.get(r["id"]);
  // HR-sourced extras (employee no., assignment title, stages) — staff_extra re-checks access
  type Extra = { employee_id: string | null; teacher_id: string | null; employee_no: string | null; assignment_title: string | null; school_name: string | null; stages: string | null };
  const extra = useQuery({ queryKey: ["staff-extra", schoolId, "t"], queryFn: async () => {
    const { data, error } = await db.rpc("staff_extra" as never, { _school: schoolId } as never); if (error) throw error;
    return new Map(((data ?? []) as Extra[]).flatMap((x) => x.teacher_id ? [[x.teacher_id, x] as const] : []));
  } });
  const ex = (r: Row) => extra.data?.get(r["id"]);
  const hrIds = useQuery({ enabled: idView, queryKey: ["staff-hr-identity", schoolId], queryFn: async () => {
    const { data, error } = await db.rpc("staff_hr_identity", { _school: schoolId });
    if (error) throw error;
    return new Map<string, string | null>(((data ?? []) as { employee_id: string; national_id: string | null }[]).map((x) => [x.employee_id, x.national_id]));
  } });
  const hrId = (r: Row) => { const employee = ex(r)?.employee_id; return employee ? hrIds.data?.get(employee) : st(r)?.hr_national_id; };
  const exVals = (k: "assignment_title" | "stages") => [...new Set([...(extra.data?.values() ?? [])].flatMap((x) => (x[k] ?? "").split("، ")).filter(Boolean))].sort().map((v) => ({ value: v, label: v }));
  const exIds = (k: "assignment_title" | "stages") => async (_s: string, v: string) => {
    const m = extra.data ?? new Map<string, Extra>();
    const { data } = await db.from("teachers").select("id").eq("school_id", schoolId).limit(10000);
    return ((data ?? []) as Row[]).map((t) => t["id"] as string).filter((id) => { const val = m.get(id)?.[k] ?? ""; return v === "__none" ? !val : val.split("، ").includes(v); });
  };
  const dir = seesStaffDirectory(role) || !!perms0?.["people_staff.view"];
  const [tab, setTab] = useState<"dir" | "teachers">(dir ? "dir" : "teachers");
  return (
    <>
      {dir && (
        <div role="tablist" className="mb-4 inline-flex rounded-xl border bg-card p-1">
          {([["dir", "الكادر التعليمي والإداري"], ["teachers", "سجلات المعلمين"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`min-h-9 rounded-lg px-4 text-sm ${tab === k ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{l}</button>
          ))}
        </div>
      )}
      {tab === "dir" ? (<>
        <PageHeader title={teachersLabel(role)} desc="الكادر التابع لمدرستك من سجلات الموارد البشرية، كل موظف مرة واحدة مع حالة حساب الدخول." />
        <StaffDirectory schoolId={schoolId} />
      </>) : (<>
      <PageHeader title={dir ? "سجلات المعلمين" : teachersLabel(role)} desc="يدخل المعلم برقم الهوية أو الإقامة ثم رمز تحقق يصل إلى جواله المعتمد لدى الإدارة. التخصصات والأقسام إدارة تعليمية فقط." />
      <CrudTable person={{ kind: "teacher" }} title="المعلمون" table="teachers" schoolId={schoolId} canWrite={w} order="full_name"
        select={COLS} searchKeys={["full_name", "display_name", "email", "phone", "specialization"]}
        filters={[
          { key: "x_stage", label: "المرحلة", options: [{ value: "__none", label: "بلا مرحلة" }, ...exVals("stages")], ids: exIds("stages") },
          { key: "x_title", label: "مسمى الإسناد", options: [{ value: "__none", label: "غير مسند في الموارد" }, ...exVals("assignment_title")], ids: exIds("assignment_title") },
          { key: "x_acc", label: "الحساب", options: [{ value: "yes", label: "حساب مرتبط" }, { value: "no", label: "بلا حساب" }], ids: async (sid, v) => { const { data } = await db.from("teachers").select("id, user_id").eq("school_id", sid).limit(10000); return ((data ?? []) as Row[]).filter((t) => (v === "yes") === !!t["user_id"]).map((t) => t["id"] as string); } },
          { key: "department_id", label: "القسم", remote: { table: "departments", label: "name" } },
          { key: "status", label: "الحالة", options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "موقوف" }] },
        ]}
        canCreate={false}
        toolbar={w ? <PeopleImport kind="teachers" schoolId={schoolId} /> : undefined}
        fields={[
          { key: "full_name", label: "الاسم الرسمي الكامل", required: true },
          { key: "display_name", label: "الاسم المعروض (يُملأ تلقائيًا إن تُرك فارغًا)" },
          { key: "phone", label: "الجوال المعتمد لرمز التحقق" },
          { key: "email", label: "البريد (اختياري)", type: "email" },
          { key: "specialization", label: "التخصص" },
          { key: "department_id", label: "القسم", type: "select", options: { table: "departments", label: "name" } },
          { key: "status", label: "الحالة", type: "select", options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "موقوف" }] },
        ]}
        defaults={{ status: "active" }}
        columns={[
          { label: "الاسم", text: (r) => r["display_name"] || r["full_name"], render: (r) => <>{r["display_name"] || r["full_name"]}{r["display_name"] && r["display_name"] !== r["full_name"] && <span className="block text-xs text-muted-foreground">{r["full_name"]}</span>}</> },
          { label: "الرقم الوظيفي", text: (r) => ex(r)?.employee_no ?? "", render: (r) => <span dir="ltr">{ex(r)?.employee_no ?? "—"}</span> },
          ...(idView ? [{ label: "الهوية / الإقامة", text: (r: Row) => hrId(r) ?? st(r)?.national_id ?? "", render: (r: Row) => { const value = hrId(r) ?? st(r)?.national_id; return value ? <span dir="ltr" title={hrId(r) ? "من ملف الموارد البشرية" : undefined}>{value}</span> : <>—</>; } }] : []),
          { label: "مسمى الإسناد", text: (r) => ex(r)?.assignment_title ?? "", render: (r) => ex(r)?.assignment_title ?? <span className="text-xs text-muted-foreground">غير مسند في الموارد</span> },
          { label: "المدرسة", text: (r) => ex(r)?.school_name ?? "", render: (r) => ex(r)?.school_name ?? "—" },
          { label: "المرحلة", text: (r) => ex(r)?.stages ?? "", render: (r) => ex(r)?.stages || "—" },
          { label: "الحالة", render: (r) => <StaffPresence data={presence.data?.get(r["id"])} /> },
          { label: "القسم", render: (r) => r["departments"]?.name ?? "—" },
          { label: "الجوال", render: (r) => <span dir="ltr">{localPhone(r["phone"]) || "—"}</span> },
          ...(idView ? [{ label: "الدخول بالهوية", text: (r: Row) => { const s = st(r); return !s ? "" : s.state === "ready" ? "جاهز" : s.problem ?? ""; }, render: (r: Row) => {
            const s = st(r); if (!s) return <span className="text-muted-foreground">…</span>;
            if (s.state === "ready") return <span className="flex items-center gap-1 text-xs text-primary"><BadgeCheck className="size-3.5" /> جاهز للدخول بالهوية</span>;
            return <span className={`text-xs ${s.state === "conflict" ? "text-destructive" : "text-muted-foreground"}`}>{s.state === "conflict" ? "تعارض: " : "ينقص: "}{s.problem}</span>;
          } }] : []),
          { label: "الحساب", text: (r) => r["user_id"] ? "حساب مرتبط" : "بلا حساب", render: (r) => r["user_id"] ? <span className="flex items-center gap-1 whitespace-nowrap text-xs text-primary"><BadgeCheck className="size-3.5" />حساب مرتبط</span> : <span className="whitespace-nowrap text-xs text-muted-foreground">بلا حساب</span> },
        ]}
        extraActions={(r) => w || idEdit ? (
          <>
            {idEdit && <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><IdCard className="size-4" /> الهوية</Button>}
            {w && !r["user_id"] && r["email"] ? <AccountButton role={role} kind="teacher" recordId={r["id"]} email={r["email"]} schoolId={schoolId} /> : null}
          </>
        ) : null} />
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>هوية {editing?.["full_name"]}</DialogTitle></DialogHeader>
          {editing && <NidForm key={editing["id"]} teacherId={editing["id"]} state={st(editing)} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      </>)}
    </>
  );
}

function NidForm({ teacherId, state, onDone }: { teacherId: string; state: IdState | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(state?.national_id ?? "");
  const [busy, setBusy] = useState(false);
  async function save(val: string) {
    setBusy(true);
    const { error } = await db.rpc("teacher_nid_save", { _teacher: teacherId, _nid: val });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظت الهوية"); qc.invalidateQueries(); onDone();
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="t-nid">رقم الهوية أو الإقامة</Label>
        <Input id="t-nid" dir="ltr" inputMode="numeric" maxLength={10} value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      {state?.hr_national_id && state.hr_national_id !== state.national_id && (
        <div className="rounded-lg border p-2 text-sm">
          ملف الموارد البشرية لنفس الحساب يحمل الهوية <span dir="ltr">{state.hr_national_id}</span>
          <Button size="sm" variant="secondary" className="ms-2" disabled={busy} onClick={() => void save(state.hr_national_id!)}>اعتمدها</Button>
        </div>
      )}
      {state?.state === "conflict" && <p className="text-sm text-destructive">{state.problem}</p>}
      <p className="text-xs text-muted-foreground">تُرفض الهوية إن كانت مسجلة لحساب شخص آخر. الحساب الحالي والربط اليدوي لا يتغيران.</p>
      <Button disabled={busy} onClick={() => void save(v)}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
    </div>
  );
}
