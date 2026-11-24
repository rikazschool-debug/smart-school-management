import { PlacementHistory, placementLabel } from "@/components/placement-history";
import { ask } from "@/components/confirm";
import { StudentGuardianLinks } from "@/components/guardian-link-panel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, CreditCard, MapPin, Users } from "lucide-react";
import { CrudTable, db, RecordForm, type Row } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { type Role } from "@/lib/roles";
import { useSchoolPerms } from "@/lib/school-perms";
import { AccountButton } from "@/components/account-button";
import { PeopleImport } from "@/components/people-import-dialog";
import { ContractMatch } from "@/components/contract-match";
import { AccountPanel } from "@/components/account-panel";
import { GuardianQuickAdd, autoSummary } from "@/components/guardian-quick-add";
import { autoAccounts } from "@/lib/accounts.functions";
import { useServerFn } from "@tanstack/react-start";
import { studentReadiness } from "@/lib/people-import";
import { studentPresence, STUDENT_PRESENCE, STUDENT_PRESENCE_VALUES } from "@/lib/student-presence";
import { arabicError, type AppContext } from "@/lib/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentFinance } from "@/components/student-finance/student-finance";

export const Route = createFileRoute("/_authenticated/app/students")({ component: Page, head: () => ({ meta: [{ title: "الطلاب والتسكين — ركاز" }, { name: "description", content: "سجلات الطلاب وتسكينهم في الشعب حسب الصلاحيات." }, { property: "og:title", content: "الطلاب والتسكين — ركاز" }, { property: "og:description", content: "سجلات الطلاب وتسكينهم في الشعب حسب الصلاحيات." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

const STATUS = [
  { value: "active", label: "منتظم" },
  { value: "transferred", label: "منقول" },
  { value: "graduated", label: "متخرج" },
  { value: "withdrawn", label: "منسحب" },
];

function Page() {
  return <RequireSchool nav="students" peopleRead extra={(p) => !!p["people_family.view"] || !!p["people_family.edit"]}>{(ctx) => <Students ctx={ctx} />}</RequireSchool>;
}

function Students({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const qc = useQueryClient();
  const sp = useSchoolPerms(ctx.schoolId);
  // edit = owner or people_family.edit (owner-grantable); principal/vice view only — server re-checks (can_manage_students)
  const w = ctx.role === "org_owner" || !!sp?.["people_family.edit"];
  const placeCan = useQuery({ queryKey: ["can-place-students", ctx.schoolId], queryFn: async () => { const { data, error } = await db.rpc("can_place_students", { _school: ctx.schoolId }); if (error) throw error; return !!data; } });
  const auto = useServerFn(autoAccounts);
  const [linking, setLinking] = useState<Row | null>(null);
  const [placing, setPlacing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [payMode, setPayMode] = useState(false);
  const canPay = useQuery({ queryKey: ["sf-can-collect", ctx.schoolId], enabled: !!ctx.schoolId, queryFn: async () => { const { data, error } = await db.rpc("sf_can", { _school: ctx.schoolId, _action: "collect" }); if (error) return false; return data === true; } });
  const [guarding, setGuarding] = useState<Row | null>(null);
  // contract filters list every value present in this school (+ «لا يوجد» for empty)
  const ctVals = useQuery({ queryKey: ["ct-vals", ctx.schoolId], queryFn: async () => {
    const { data } = await db.from("students").select("contract_year, contract_status, contract_type").eq("school_id", ctx.schoolId).limit(5000);
    const opts = (k: string) => [{ value: "__none", label: "لا يوجد" }, ...[...new Set(((data ?? []) as Row[]).map((r) => r[k]).filter((x) => x && x !== "لا يوجد"))].sort().map((x) => ({ value: x as string, label: x as string }))];
    return { year: opts("contract_year"), status: opts("contract_status"), type: opts("contract_type") };
  } });
  const ctCan = useQuery({ queryKey: ["ct-can", ctx.schoolId], queryFn: async () => { const { data } = await db.rpc("ct_can", { _school: ctx.schoolId }); return !!data; } });


  const place = useMutation({
    mutationFn: async (v: Row) => {
      const sid = placing?.["id"];
      if (!sid || !v["section_id"]) throw new Error("اختر الطالب والشعبة");
      const { data: cur } = await db.from("enrollments").select("section_id, sections(name, grades(name))").eq("student_id", sid).eq("status", "active").maybeSingle();
      if (cur) {
        if (cur["section_id"] === v["section_id"]) throw new Error("الطالب مسكّن في هذه الشعبة نفسها");
        if (!(await ask(`الطالب مسكّن حاليًا في ${placementLabel(cur as Row)}. هل تريد تعديل التسكين؟ يُنهى التسكين الحالي ويُحفظ في السجل.`, { ok: "نعم، عدّل التسكين" }))) throw new Error("__cancel");
      }
      const { error } = await db.rpc("student_place", { _student: sid, _section: v["section_id"] });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم التسكين"); setPlacing(null); qc.invalidateQueries(); },
    onError: (e) => { if ((e as Error).message !== "__cancel") toast.error(arabicError(e)); },
  });

  return (
    <>
      <PageHeader title="الطلاب والتسكين" desc="ملف الطالب، ربط ولي الأمر، والتسكين في الشعبة. لا يلزم أن يكون للطالب حساب دخول." />
      <CrudTable person={{ kind: "student" }} title="الطلاب" table="students" schoolId={ctx.schoolId} canWrite={w} order="full_name"
        select="*, enrollments(status, sections(name, grades(name))), student_guardians(id)"
        searchKeys={["full_name", "display_name", "national_id"]} searchPlaceholder="اسم الطالب أو رقم هويته" multiTags
        filters={[
          { key: "stage", label: "المرحلة", multi: true, remote: { table: "stages", label: "name", order: "sort_order" }, path: "enrollments.sections.grades.stage_id", inner: "enrollments,sections,grades", extra: { "enrollments.status": "active" } },
          { key: "grade", label: "الصف", multi: true, cascade: { parent: "stage", column: "stage_id" }, remote: { table: "grades", label: "name", order: "sort_order" }, path: "enrollments.sections.grade_id", inner: "enrollments,sections", extra: { "enrollments.status": "active" } },
          { key: "section", label: "الشعبة", multi: true, cascade: { parent: "grade", column: "grade_id" }, remote: { table: "sections", label: "name" }, path: "enrollments.section_id", inner: "enrollments", extra: { "enrollments.status": "active" } },
          { key: "contract_type", label: "نوع العقد", multi: true, options: ctVals.data?.type ?? [{ value: "__none", label: "لا يوجد" }] },
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
        onUpdated={(sid) => { void auto({ data: { studentId: sid } }).then((r) => { if (r.student && r.student.state !== "linked") toast.info(autoSummary(r)); }).catch(() => undefined); }}
        columns={[
          { label: "الطالب", text: (r) => r["full_name"], render: (r) => (
            <div className="flex min-w-[13rem] items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{String(r["display_name"] || r["full_name"] || "؟").trim().charAt(0)}</span>
              <div className="min-w-0">
                <button className="block max-w-[16rem] truncate text-start font-semibold text-primary hover:underline" title={r["full_name"]} onClick={() => setViewing(r)}>{r["display_name"] || r["full_name"]}</button>
                {r["display_name"] && r["display_name"] !== r["full_name"] && <span className="block max-w-[16rem] truncate text-xs text-muted-foreground" title={r["full_name"]}>{r["full_name"]}</span>}
              </div>
            </div>) },
          { label: "الهوية / C‑Smart", text: (r) => r["national_id"] ?? "", render: (r) => (
            <div className="space-y-0.5 whitespace-nowrap text-xs" dir="ltr"><div className="font-medium text-foreground">{r["national_id"] ?? "—"}</div><div className="text-muted-foreground">{r["csmart_no"] ? `C‑Smart ${r["csmart_no"]}` : "C‑Smart —"}</div></div>) },
          { label: "رقم C‑Smart", exportOnly: true, text: (r) => r["csmart_no"] ?? "", render: () => null },
          { label: "الصف والشعبة", text: (r) => { const e = (r["enrollments"] as Row[] | undefined)?.find((x) => x["status"] === "active"); return e ? `${e["sections"]?.grades?.name} / ${e["sections"]?.name}` : "غير مسكّن"; }, render: (r) => {
            const e = (r["enrollments"] as Row[] | undefined)?.find((x) => x["status"] === "active");
            return e ? <div className="whitespace-nowrap text-xs"><div className="font-medium">{e["sections"]?.grades?.name}</div><span className="mt-0.5 inline-block rounded-md bg-muted px-1.5 py-0.5">شعبة {e["sections"]?.name}</span></div> : <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">غير مسكّن</span>;
          } },
          { label: "أولياء الأمور", text: (r) => r["student_guardians"]?.length ?? 0, render: (r) => { const n = r["student_guardians"]?.length ?? 0; return <span className={`inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-bold ${n ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{n}</span>; } },
          { label: "الحالة", text: (r) => studentPresence(r["status"]), render: (r) => <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{studentPresence(r["status"])}</span> },
          { label: "جاهزية الدخول", text: (r) => { const m = studentReadiness(r); return m.length ? `ينقص: ${m.join("، ")}` : "جاهز"; }, render: (r) => {
            const m = studentReadiness(r);
            return m.length ? <span className="text-xs text-destructive">ينقص: {m.join("، ")}</span> : <span className="flex items-center gap-1 whitespace-nowrap text-xs text-primary"><BadgeCheck className="size-3.5" /> جاهز</span>;
          } },
          { label: "العقد", text: (r) => r["contract_year"] ?? "لا يوجد", render: (r) => {
            const none = !r["contract_year"] && !r["contract_status"] && !r["contract_type"];
            if (none) return <span className="whitespace-nowrap text-xs text-muted-foreground">لا يوجد عقد</span>;
            return <div className="min-w-[8rem] space-y-0.5 text-xs"><div className={r["contract_year"] === "يحتاج تحديث" ? "font-medium text-destructive" : "font-medium"}>{r["contract_year"] ?? "—"}</div><div className="text-muted-foreground">{[r["contract_status"], r["contract_type"]].filter(Boolean).join(" · ") || "—"}</div></div>;
          } },
          { label: "آخر حالة العقد", exportOnly: true, text: (r) => r["contract_status"] ?? "لا يوجد", render: () => null },
          { label: "آخر نوع العقد", exportOnly: true, text: (r) => r["contract_type"] ?? "لا يوجد", render: () => null },
        ]}
        extraActions={(r) => w || ctCan.data || placeCan.data || canPay.data ? (
          <>
            {canPay.data && <Button variant="ghost" size="icon" title="سداد الرسوم" aria-label="سداد الرسوم" onClick={() => { setPayMode(true); setViewing(r); }}><CreditCard className="size-4" /></Button>}
            {placeCan.data && <Button variant="ghost" size="icon" title="تسكين" aria-label="تسكين" onClick={() => setPlacing(r)}><MapPin className="size-4" /></Button>}
            {w && <>
            <Button variant="ghost" size="icon" title="أولياء الأمر المرتبطون" aria-label="أولياء الأمر المرتبطون" onClick={() => setLinking(r)}><Users className="size-4" /></Button>
            </>}
          </>
        ) : null} />

      <Dialog open={!!placing} onOpenChange={(o) => !o && setPlacing(null)}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>تسكين {placing?.["full_name"]}</DialogTitle></DialogHeader>
          {placing && <PlacementHistory studentId={placing["id"]} />}
          {placing && (
            <RecordForm schoolId={ctx.schoolId} initial={{}} submitting={place.isPending} onSubmit={(v) => place.mutate(v)}
              fields={[{ key: "section_id", label: "الشعبة", type: "select", required: true, options: { table: "sections", label: "name" } }]} />
          )}
          <p className="text-xs text-muted-foreground">يُنهى التسكين النشط السابق في نفس السنة تلقائيًا، ويُرفض إن امتلأت الشعبة.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linking} onOpenChange={(o) => !o && setLinking(null)}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>أولياء أمر {linking?.["full_name"]}</DialogTitle></DialogHeader>
          {linking && <StudentGuardianLinks schoolId={ctx.schoolId} studentId={linking["id"]} onLinked={() => { void auto({ data: { studentId: linking["id"] } }).then((r) => toast.info(autoSummary(r))).catch(() => undefined); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!guarding} onOpenChange={(o) => !o && setGuarding(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>ولي أمر {guarding?.["full_name"]}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">يُنشأ حساب الطالب وحساب ولي الأمر تلقائيًا برقم الهوية بعد الحفظ، وتصل رسالة على جوال ولي الأمر إن كان مسجلًا.</p>
          {guarding && <GuardianQuickAdd key={guarding["id"]} studentId={guarding["id"]} studentName={guarding["full_name"]} onDone={() => setGuarding(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) { setViewing(null); setPayMode(false); } }}>
        <DialogContent dir="rtl" className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto sm:max-w-6xl">
          <DialogHeader><DialogTitle>{viewing?.["full_name"]}</DialogTitle></DialogHeader>
          {viewing && <Tabs defaultValue={payMode ? "finance" : "family"} dir="rtl">
            <TabsList><TabsTrigger value="family">ولي الأمر والحساب</TabsTrigger><TabsTrigger value="finance">المالية والنقل</TabsTrigger></TabsList>
            <TabsContent value="family"><StudentLinks studentId={viewing["id"]} schoolId={ctx.schoolId} canWrite={w} email={viewing["email"]} hasAccount={!!viewing["user_id"]} role={ctx.role} /></TabsContent>
            <TabsContent value="finance"><StudentFinance studentId={viewing["id"]} startCollect={payMode} /></TabsContent>
          </Tabs>}
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
      <AccountPanel kind="student" id={studentId} canWrite={role === "org_owner"} />
      {canWrite && email && !hasAccount && role === "org_owner" && (
        <AccountButton role={role} kind="student" recordId={studentId} email={email} schoolId={schoolId} label="دعوة ببريد الطالب (بديل)" />
      )}
    </div>
  );
}
