import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Link2, MapPin, Send } from "lucide-react";
import { CrudTable, db, RecordForm, type Row } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { canManageStudents } from "@/lib/roles";
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
      <CrudTable title="الطلاب" table="students" schoolId={ctx.schoolId} canWrite={w} order="full_name"
        select="*, enrollments(status, sections(name, grades(name))), student_guardians(id)"
        searchKeys={["full_name", "national_id"]}
        filters={[{ key: "status", label: "الحالة", options: STATUS }]}
        fields={[
          { key: "full_name", label: "الاسم الكامل", required: true },
          { key: "national_id", label: "رقم الهوية" },
          { key: "birth_date", label: "تاريخ الميلاد", type: "date" },
          { key: "gender", label: "الجنس", type: "select", options: [{ value: "male", label: "ذكر" }, { value: "female", label: "أنثى" }] },
          { key: "email", label: "بريد الطالب (اختياري)", type: "email" },
          { key: "status", label: "الحالة", type: "select", required: true, options: STATUS },
        ]}
        defaults={{ status: "active" }}
        columns={[
          { label: "الاسم", render: (r) => <button className="text-primary hover:underline" onClick={() => setViewing(r)}>{r["full_name"]}</button> },
          { label: "الهوية", render: (r) => r["national_id"] ?? "—" },
          { label: "الشعبة", render: (r) => {
            const e = (r["enrollments"] as Row[] | undefined)?.find((x) => x["status"] === "active");
            return e ? `${e["sections"]?.grades?.name} / ${e["sections"]?.name}` : <span className="text-muted-foreground">غير مسكّن</span>;
          } },
          { label: "أولياء الأمور", render: (r) => r["student_guardians"]?.length ?? 0 },
          { label: "الحالة", render: (r) => STATUS.find((s) => s.value === r["status"])?.label },
        ]}
        extraActions={(r) => w ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setPlacing(r)}><MapPin className="size-4" /> تسكين</Button>
            <Button variant="ghost" size="sm" onClick={() => setLinking(r)}><Link2 className="size-4" /> ربط ولي أمر</Button>
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

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>{viewing?.["full_name"]}</DialogTitle></DialogHeader>
          {viewing && <StudentLinks studentId={viewing["id"]} schoolId={ctx.schoolId} canWrite={w} email={viewing["email"]} hasAccount={!!viewing["user_id"]} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const REL: Record<string, string> = { father: "الأب", mother: "الأم", brother: "الأخ", other: "أخرى" };

function StudentLinks({ studentId, schoolId, canWrite, email, hasAccount }: { studentId: string; schoolId: string; canWrite: boolean; email: string | null; hasAccount: boolean }) {
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
      {canWrite && email && !hasAccount && (
        <Button variant="outline" size="sm" onClick={async () => {
          const { error } = await supabase.rpc("invite_member", { _email: email, _school: schoolId, _role: "student" });
          if (error) toast.error(arabicError(error)); else toast.success("أُرسلت دعوة حساب الطالب");
        }}><Send className="size-4" /> دعوة الطالب لحساب دخول</Button>
      )}
    </div>
  );
}
