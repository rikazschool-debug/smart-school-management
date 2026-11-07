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
import { canManageAcademic } from "@/lib/roles";
import { AccountButton } from "@/components/account-button";
import { PeopleImport } from "@/components/people-import-dialog";
import { AccountPanel } from "@/components/account-panel";
import { localPhone } from "@/lib/people-import";
import { arabicError } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/teachers")({
  component: Page,
  head: () => ({ meta: [{ title: "المعلمون — ركاز" }, { name: "description", content: "سجلات المعلمين وجاهزية دخولهم بالهوية" }] }),
});

// national_id is not selectable directly; read through teacher_id_status (people_identity.view)
const COLS = "id, school_id, user_id, full_name, email, phone, specialization, department_id, status, created_at, departments(name)";
type IdState = { teacher_id: string; national_id: string | null; hr_national_id: string | null; state: "ready" | "missing" | "conflict"; problem: string | null };

function Page() {
  return <RequireSchool nav="teachers">{(ctx) => <Teachers schoolId={ctx.schoolId} role={ctx.role} />}</RequireSchool>;
}

function Teachers({ schoolId, role }: { schoolId: string; role: Parameters<typeof canManageAcademic>[0] }) {
  const w = canManageAcademic(role);
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
  return (
    <>
      <PageHeader title="المعلمون" desc="يدخل المعلم برقم الهوية أو الإقامة ثم رمز تحقق يصل إلى جواله المعتمد لدى الإدارة. التخصصات والأقسام إدارة تعليمية فقط." />
      <CrudTable title="المعلمون" table="teachers" schoolId={schoolId} canWrite={w} order="full_name"
        select={COLS} searchKeys={["full_name", "email", "specialization"]}
        filters={[
          { key: "department_id", label: "القسم", remote: { table: "departments", label: "name" } },
          { key: "status", label: "الحالة", options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "موقوف" }] },
        ]}
        canCreate={false}
        toolbar={w ? <PeopleImport kind="teachers" schoolId={schoolId} /> : undefined}
        fields={[
          { key: "full_name", label: "الاسم الكامل", required: true },
          { key: "phone", label: "الجوال المعتمد لرمز التحقق" },
          { key: "email", label: "البريد (اختياري)", type: "email" },
          { key: "specialization", label: "التخصص" },
          { key: "department_id", label: "القسم", type: "select", options: { table: "departments", label: "name" } },
          { key: "status", label: "الحالة", type: "select", options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "موقوف" }] },
        ]}
        defaults={{ status: "active" }}
        columns={[
          { label: "الاسم", render: (r) => r["full_name"] },
          ...(idView ? [{ label: "الهوية / الإقامة", text: (r: Row) => st(r)?.national_id ?? "", render: (r: Row) => <span dir="ltr">{st(r)?.national_id ?? "—"}</span> }] : []),
          { label: "التخصص", render: (r) => r["specialization"] ?? "—" },
          { label: "القسم", render: (r) => r["departments"]?.name ?? "—" },
          { label: "الجوال", render: (r) => <span dir="ltr">{localPhone(r["phone"]) || "—"}</span> },
          ...(idView ? [{ label: "الدخول بالهوية", text: (r: Row) => { const s = st(r); return !s ? "" : s.state === "ready" ? "جاهز" : s.problem ?? ""; }, render: (r: Row) => {
            const s = st(r); if (!s) return <span className="text-muted-foreground">…</span>;
            if (s.state === "ready") return <span className="flex items-center gap-1 text-xs text-primary"><BadgeCheck className="size-3.5" /> جاهز للدخول بالهوية</span>;
            return <span className={`text-xs ${s.state === "conflict" ? "text-destructive" : "text-muted-foreground"}`}>{s.state === "conflict" ? "تعارض: " : "ينقص: "}{s.problem}</span>;
          } }] : []),
          { label: "الحساب", render: (r) => <AccountPanel kind="teacher" id={r["id"]} canWrite={w} /> },
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
