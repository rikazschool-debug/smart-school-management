import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Link2, MapPin } from "lucide-react";
import { CrudTable, db, RecordForm, type Row } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { canManageStudents, type Role } from "@/lib/roles";
import { AccountButton } from "@/components/account-button";
import { PeopleImport } from "@/components/people-import-dialog";
import { ContractMatch, ContractEdit } from "@/components/contract-match";
import { AccountPanel } from "@/components/account-panel";
import { GuardianQuickAdd } from "@/components/guardian-quick-add";
import { studentReadiness } from "@/lib/people-import";
import { arabicError, type AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/students")({ component: Page });

const STATUS = [
  { value: "active", label: "منتظم" },
  { value: "transferred", label: "منقول" },
  { value: "graduated", label: "متخرج" },
  { value: "withdrawn", label: "منسحب" },
];

function Page() {
  return <RequireSchool nav="students">{(ctx) => <Students ctx={ctx} />}</RequireSchool>;
}

function Students({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const qc = useQueryClient();
  const w = canManageStudents(ctx.role);
  const [linking, setLinking] = useState<Row | null>(null);
  const [placing, setPlacing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [guarding, setGuarding] = useState<Row | null>(null);
  // contract filters list every value present in this school (+ «لا يوجد» for empty)
  const ctVals = useQuery({ queryKey: ["ct-vals", ctx.schoolId], queryFn: async () => {
    const { data } = await db.from("students").select("contract_year, contract_status, contract_type").eq("school_id", ctx.schoolId).limit(5000);
    const opts = (k: string) => [{ value: "__none", label: "لا يوجد" }, ...[...new Set(((data ?? []) as Row[]).map((r) => r[k]).filter((x) => x && x !== "لا يوجد"))].sort().map((x) => ({ value: x as string, label: x as string }))];
    return { year: opts("contract_year"), status: opts("contract_status"), type: opts("contract_type") };
  } });
  const ctCan = useQuery({ queryKey: ["ct-can", ctx.schoolId], queryFn: async () => { const { data } = await db.rpc("ct_can", { _school: ctx.schoolId }); return !!data; } });

  const link = useMutation({
    mutationFn: async (v: Row) => {
      const { error } = await db.from("student_guardians").insert({ ...v, student_id: linking?.["id"], school_id: ctx.schoolId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الربط — وثّق العلاقة ليتمكن ولي الأمر من المتابعة"); setLinking(null); qc.invalidateQueries(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const place = useMutation({
    mutationFn: async (v: Row) => {
      const sid = placing?.["id"];
      const { data: sec, error: e1 } = await db.from("sections").select("year_id").eq("id", v["section_id"]).single();
      if (e1) throw e1;
      // end any active enrollment in the same year first (transfer between sections)
      const { error: e2 } = await db.from("enrollments").update({ status: "ended", end_date: new Date().toISOString().slice(0, 10) })
        .eq("student_id", sid).eq("year_id", sec.year_id).eq("status", "active");
      if (e2) throw e2;
      const { error } = await db.from("enrollments").insert({ student_id: sid, section_id: v["section_id"], year_id: sec.year_id, school_id: ctx.schoolId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم التسكين"); setPlacing(null); qc.invalidateQueries(); },
    onError: (e) => toast.error(arabicError(e)),
  });

  return (
    <>
      <PageHeader title="الطلاب والتسكين" desc="ملف الطالب، ربط ولي الأمر، والتسكين في الشعبة. لا يلزم أن يكون للطالب حساب دخول." />
      <CrudTable person={{ kind: "student" }} title="الطلاب" table="students" schoolId={ctx.schoolId} canWrite={w} order="full_name"
        select="*, enrollments(status, sections(name, grades(name))), student_guardians(id)"
        searchKeys={["full_name", "display_name", "national_id", "csmart_no"]}
        filters={[
          { key: "status", label: "الحالة", options: STATUS },
          { key: "gender", label: "الجنس", options: [{ value: "male", label: "ذكر" }, { value: "female", label: "أنثى" }] },
          { key: "contract_year", label: "العام الدراسي (العقد)", options: ctVals.data?.year ?? [{ value: "__none", label: "لا يوجد" }] },
          { key: "contract_status", label: "حالة العقد", options: ctVals.data?.status ?? [{ value: "__none", label: "لا يوجد" }] },
          { key: "contract_type", label: "نوع العقد", options: ctVals.data?.type ?? [{ value: "__none", label: "لا يوجد" }] },
          { key: "section", label: "الشعبة", remote: { table: "sections", label: "name" }, path: "enrollments.section_id", inner: "enrollments", extra: { "enrollments.status": "active" } },
        ]}
        canCreate={false}
        toolbar={w || ctCan.data ? <>{w && <PeopleImport kind="students" schoolId={ctx.schoolId} />}{ctCan.data && <ContractMatch schoolId={ctx.schoolId} />}</> : undefined}
        fields={[
          { key: "full_name", label: "الاسم الرسمي الكامل", required: true },
          { key: "display_name", label: "الاسم المعروض (يُملأ تلقائيًا إن تُرك فارغًا)" },
          { key: "national_id", label: "رقم هوية الطالب أو إقامته" },
          { key: "csmart_no", label: "رقم الطالب الداخلي — C‑Smart" },
          { key: "birth_date", label: "تاريخ الميلاد", type: "date" },
          { key: "gender", label: "الجنس", type: "select", options: [{ value: "male", label: "ذكر" }, { value: "female", label: "أنثى" }] },
          { key: "email", label: "بريد الطالب (اختياري)", type: "email" },
          { key: "status", label: "الحالة", type: "select", required: true, options: STATUS },
        ]}
        defaults={{ status: "active" }}
        onCreated={w ? (r) => setGuarding(r) : undefined}
        columns={[
          { label: "الاسم", text: (r) => r["full_name"], render: (r) => <><button className="text-primary hover:underline" onClick={() => setViewing(r)}>{r["display_name"] || r["full_name"]}</button>{r["display_name"] && r["display_name"] !== r["full_name"] && <span className="block text-xs text-muted-foreground">{r["full_name"]}</span>}</> },
          { label: "الهوية", render: (r) => <span dir="ltr">{r["national_id"] ?? "—"}</span> },
          { label: "رقم C‑Smart", text: (r) => r["csmart_no"] ?? "", render: (r) => r["csmart_no"] ? <span dir="ltr">{r["csmart_no"]}</span> : <span className="text-muted-foreground">غير مسجّل</span> },
          { label: "الشعبة", text: (r) => { const e = (r["enrollments"] as Row[] | undefined)?.find((x) => x["status"] === "active"); return e ? `${e["sections"]?.grades?.name} / ${e["sections"]?.name}` : "غير مسكّن"; }, render: (r) => {
            const e = (r["enrollments"] as Row[] | undefined)?.find((x) => x["status"] === "active");
            return e ? `${e["sections"]?.grades?.name} / ${e["sections"]?.name}` : <span className="text-muted-foreground">غير مسكّن</span>;
          } },
          { label: "أولياء الأمور", render: (r) => r["student_guardians"]?.length ?? 0 },
          { label: "الحالة", render: (r) => STATUS.find((s) => s.value === r["status"])?.label },
          { label: "جاهزية الدخول", text: (r) => { const m = studentReadiness(r); return m.length ? `ينقص: ${m.join("، ")}` : "جاهز"; }, render: (r) => {
            const m = studentReadiness(r);
            return m.length ? <span className="text-xs text-destructive">ينقص: {m.join("، ")}</span> : <span className="flex items-center gap-1 text-xs text-primary"><BadgeCheck className="size-3.5" /> جاهز</span>;
          } },
          { label: "العام الدراسي", text: (r) => r["contract_year"] ?? "لا يوجد", render: (r) => <span className={r["contract_year"] === "يحتاج تحديث" ? "text-xs text-destructive" : "text-xs"}>{r["contract_year"] ?? "لا يوجد"}</span> },
          { label: "آخر حالة العقد", text: (r) => r["contract_status"] ?? "لا يوجد", render: (r) => <span className="text-xs">{r["contract_status"] ?? "لا يوجد"}</span> },
          { label: "آخر نوع العقد", text: (r) => r["contract_type"] ?? "لا يوجد", render: (r) => <span className="text-xs">{r["contract_type"] ?? "لا يوجد"}</span> },
        ]}
        extraActions={(r) => w || ctCan.data ? (
          <>
            {ctCan.data && <ContractEdit row={r} schoolId={ctx.schoolId} />}
            {w && <>
            <Button variant="ghost" size="sm" onClick={() => setPlacing(r)}><MapPin className="size-4" /> تسكين</Button>
            <Button variant="ghost" size="sm" onClick={() => setGuarding(r)}><Link2 className="size-4" /> ولي الأمر</Button>
            <Button variant="ghost" size="sm" onClick={() => setLinking(r)}>ربط بولي أمر مسجل</Button>
            </>}
          </>
        ) : null} />

      <Dialog open={!!placing} onOpenChange={(o) => !o && setPlacing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تسكين {placing?.["full_name"]}</DialogTitle></DialogHeader>
          {placing && (
            <RecordForm schoolId={ctx.schoolId} initial={{}} submitting={place.isPending} onSubmit={(v) => place.mutate(v)}
              fields={[{ key: "section_id", label: "الشعبة", type: "select", required: true, options: { table: "sections", label: "name" } }]} />
          )}
          <p className="text-xs text-muted-foreground">يُنهى التسكين النشط السابق في نفس السنة تلقائيًا، ويُرفض إن امتلأت الشعبة.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linking} onOpenChange={(o) => !o && setLinking(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>ربط ولي أمر بـ {linking?.["full_name"]}</DialogTitle></DialogHeader>
          {linking && (
            <RecordForm schoolId={ctx.schoolId} initial={{ can_follow: true, can_pickup: false }} submitting={link.isPending} onSubmit={(v) => link.mutate(v)}
              fields={[
                { key: "guardian_id", label: "ولي الأمر", type: "select", required: true, options: { table: "guardians", label: "full_name" } },
                { key: "relationship", label: "صلة القرابة", type: "select", required: true, options: [
                  { value: "father", label: "الأب" }, { value: "mother", label: "الأم" }, { value: "brother", label: "الأخ" }, { value: "other", label: "أخرى" }] },
                { key: "can_follow", label: "صلاحية متابعة الطالب", type: "checkbox" },
                { key: "can_pickup", label: "مفوّض باستلام الطالب", type: "checkbox" },
              ]} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!guarding} onOpenChange={(o) => !o && setGuarding(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>ولي أمر {guarding?.["full_name"]}</DialogTitle></DialogHeader>
          {guarding && <GuardianQuickAdd key={guarding["id"]} studentId={guarding["id"]} studentName={guarding["full_name"]} onDone={() => setGuarding(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>{viewing?.["full_name"]}</DialogTitle></DialogHeader>
          {viewing && <StudentLinks studentId={viewing["id"]} schoolId={ctx.schoolId} canWrite={w} email={viewing["email"]} hasAccount={!!viewing["user_id"]} role={ctx.role} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const REL: Record<string, string> = { father: "الأب", mother: "الأم", brother: "الأخ", sister: "الأخت", other: "أخرى" };

function StudentLinks({ studentId, schoolId, canWrite, email, hasAccount, role }: { studentId: string; schoolId: string; canWrite: boolean; email: string | null; hasAccount: boolean; role: Role }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["sg", studentId],
    queryFn: async () => {
      const { data, error } = await db.from("student_guardians").select("*, guardians(full_name, phone)").eq("student_id", studentId);
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">أولياء الأمور</h3>
      {!q.data?.length && <p className="text-sm text-muted-foreground">لا يوجد ولي أمر مرتبط.</p>}
      {q.data?.map((l) => (
        <div key={l["id"]} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <span className="font-medium">{l["guardians"]?.full_name}</span>
          <span className="text-muted-foreground">({REL[l["relationship"]] ?? l["relationship"]})</span>
          <span className="rounded bg-muted px-1.5 text-xs">{l["can_follow"] ? "متابعة" : "بلا متابعة"}</span>
          <span className="rounded bg-muted px-1.5 text-xs">{l["can_pickup"] ? "مفوض بالاستلام" : "غير مفوض بالاستلام"}</span>
          {l["verified"] ? (
            <span className="ms-auto flex items-center gap-1 text-primary"><BadgeCheck className="size-4" /> موثّقة</span>
          ) : canWrite ? (
            <Button size="sm" className="ms-auto" onClick={async () => {
              const { error } = await supabase.rpc("verify_guardian_link", { _id: l["id"] });
              if (error) toast.error(arabicError(error)); else { toast.success("وُثّقت العلاقة"); qc.invalidateQueries(); }
            }}>توثيق العلاقة</Button>
          ) : <span className="ms-auto text-xs text-muted-foreground">غير موثّقة</span>}
        </div>
      ))}
      <AccountPanel kind="student" id={studentId} canWrite={canWrite} />
      {canWrite && email && !hasAccount && role === "org_owner" && (
        <AccountButton role={role} kind="student" recordId={studentId} email={email} schoolId={schoolId} label="دعوة ببريد الطالب (بديل)" />
      )}
    </div>
  );
}
