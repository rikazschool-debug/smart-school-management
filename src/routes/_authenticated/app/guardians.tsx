import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { CrudTable, db, type Row } from "@/components/crud-page";
import { PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canManageStudents } from "@/lib/roles";
import { useSchoolPerms } from "@/lib/school-perms";
import { AccountButton } from "@/components/account-button";
import { guardianReadiness, localPhone, maskTail } from "@/lib/people-import";
import { CreateAccountButton, MSG_STATE, autoSummary } from "@/components/guardian-quick-add";
import { autoAccounts } from "@/lib/accounts.functions";
import { useServerFn } from "@tanstack/react-start";
import { GuardianImport } from "@/components/guardian-import-dialog";

export const Route = createFileRoute("/_authenticated/app/guardians")({
  component: Page,
  head: () => ({ meta: [{ title: "أولياء الأمور — ركاز" }, { name: "description", content: "سجلات أولياء الأمور وأبناؤهم وحالة الدخول" }] }),
});

const REL: Record<string, string> = { father: "الأب", mother: "الأم", brother: "الأخ", sister: "الأخت", other: "أخرى" };

function Page() {
  return (
    <RequireSchool nav="guardians">
      {(ctx) => <Guardians schoolId={ctx.schoolId} role={ctx.role} />}
    </RequireSchool>
  );
}

function Guardians({ schoolId, role }: { schoolId: string; role: Parameters<typeof canManageStudents>[0] }) {
  const sp = useSchoolPerms(schoolId);
  const w = role === "org_owner" || !!sp?.["people_family.edit"];
  const [viewing, setViewing] = useState<Row | null>(null);
  const auto = useServerFn(autoAccounts);
  const msgs = useQuery({ queryKey: ["acct-outbox", schoolId], queryFn: async () => {
    const { data } = await db.rpc("acct_outbox_state" as never, { _school: schoolId } as never);
    return new Map(((data ?? []) as unknown as { guardian_id: string; status: string }[]).map((m) => [m.guardian_id, m.status]));
  } });
  // full ID/phone only for those who manage students; others see the last digits
  const full = w || canManageStudents(role);
  const id = (v: string | null) => (v ? (full ? v : maskTail(v)) : "—");
  const ph = (v: string | null) => (v ? (full ? localPhone(v) : maskTail(localPhone(v))) : "—");
  return (
    <>
      <PageHeader title="أولياء الأمور" desc="سجل واحد لكل ولي أمر يجمع أبناءه. الجوال المعتمد هنا هو الذي يُرسل إليه رمز الدخول، وكل تغيير عليه يُسجّل." />
      <CrudTable person={{ kind: "guardian" }} title="أولياء الأمور" table="guardians" schoolId={schoolId} canWrite={w} order="full_name"
        onUpdated={(gid) => { void auto({ data: { guardianId: gid } }).then((r) => { const g = r.guardians[0]; if (g && (g.state !== "linked" || g.message === "queued")) toast.info(autoSummary(r)); }).catch(() => undefined); }}
        formExtra={(fill) => <HrPick schoolId={schoolId} onPick={fill} />}
        toolbar={w ? <GuardianImport schoolId={schoolId} /> : undefined}
        select="*, student_guardians(id, verified)" searchKeys={["full_name", "display_name", "phone", "email", "national_id"]}
        fields={[
          { key: "full_name", label: "الاسم الرسمي الكامل", required: true },
          { key: "display_name", label: "الاسم المعروض (يُملأ تلقائيًا إن تُرك فارغًا)" },
          { key: "national_id", label: "رقم هوية ولي الأمر أو إقامته" },
          { key: "phone", label: "الجوال المعتمد لرمز الدخول" },
          { key: "email", label: "البريد (اختياري)", type: "email" },
        ]}
        columns={[
          { label: "الاسم", text: (r) => r["full_name"], render: (r) => <><button className="text-primary hover:underline" onClick={() => setViewing(r)}>{r["display_name"] || r["full_name"]}</button>{r["display_name"] && r["display_name"] !== r["full_name"] && <span className="block text-xs text-muted-foreground">{r["full_name"]}</span>}</> },
          { label: "الهوية", text: (r) => id(r["national_id"]), render: (r) => <span dir="ltr">{id(r["national_id"])}</span> },
          { label: "الجوال", text: (r) => ph(r["phone"]), render: (r) => <span dir="ltr">{ph(r["phone"])}</span> },
          { label: "الأبناء", text: (r) => String(r["student_guardians"]?.length ?? 0), render: (r) => {
            const l = (r["student_guardians"] ?? []) as Row[]; const v = l.filter((x) => x["verified"]).length;
            return <span>{l.length}{l.length > v && <span className="ms-1 text-xs text-muted-foreground">({l.length - v} بانتظار التوثيق)</span>}</span>;
          } },
          { label: "الحساب", text: (r) => (r["user_id"] ? "مرتبط" : "بلا حساب"), render: (r) => (r["user_id"] ? <span className="text-primary">مرتبط</span> : <span className="text-muted-foreground">بلا حساب</span>) },
          { label: "إشعار التجهيز", text: (r) => MSG_STATE[msgs.data?.get(r["id"]) ?? ""] ?? "—", render: (r) => <span className="text-xs">{MSG_STATE[msgs.data?.get(r["id"]) ?? ""] ?? "—"}</span> },
          { label: "جاهزية الدخول", text: (r) => { const m = guardianReadiness(r); return m.length ? `ينقص: ${m.join("، ")}` : "جاهز"; }, render: (r) => {
            const m = guardianReadiness(r);
            return m.length ? <span className="text-xs text-destructive">ينقص: {m.join("، ")}</span> : <span className="flex items-center gap-1 text-xs text-primary"><BadgeCheck className="size-3.5" /> جاهز</span>;
          } },
        ]}
        extraActions={(r) =>
          role === "org_owner" && !r["user_id"] ? (
            r["phone"] ? <CreateAccountButton guardianId={r["id"]} name={r["full_name"]} />
            : r["email"] ? <AccountButton role={role} kind="guardian" recordId={r["id"]} email={r["email"]} schoolId={schoolId} /> : null
          ) : null
        } />
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader><DialogTitle>{viewing?.["full_name"]}</DialogTitle></DialogHeader>
          {viewing && <GuardianDetail g={viewing} canManage={w} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GuardianDetail({ g, canManage }: { g: Row; canManage: boolean }) {
  const qc = useQueryClient();
  async function approve(id: string) {
    const { error } = await supabase.rpc("verify_guardian_link", { _id: id });
    if (error) toast.error(arabicError(error)); else { toast.success("وُثّقت العلاقة — يرى ولي الأمر ابنه وفصله الآن"); qc.invalidateQueries(); }
  }
  async function reject(id: string) {
    if (!(await ask("رفض العلاقة؟ تُحذف ولا يرى ولي الأمر بيانات هذا الابن.", { destructive: true, ok: "رفض" }))) return;
    const { error } = await db.from("student_guardians").delete().eq("id", id);
    if (error) toast.error(arabicError(error)); else { toast.success("رُفضت العلاقة"); qc.invalidateQueries(); }
  }
  const kids = useQuery({
    queryKey: ["guardian-kids", g["id"]],
    queryFn: async () => {
      const { data, error } = await db.from("student_guardians").select("id, relationship, verified, can_follow, students(full_name, csmart_no)").eq("guardian_id", g["id"]);
      if (error) throw error;
      return data as Row[];
    },
  });
  const log = useQuery({
    enabled: canManage,
    queryKey: ["guardian-phone-log", g["id"]],
    queryFn: async () => {
      const { data, error } = await db.from("guardian_phone_log").select("old_phone, new_phone, created_at").eq("guardian_id", g["id"]).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="mb-2 font-semibold">الأبناء المرتبطون</h3>
        {!kids.data?.length && <p className="text-muted-foreground">لا يوجد أبناء مرتبطون.</p>}
        {kids.data?.map((k) => (
          <div key={k["id"]} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <span className="font-medium">{k["students"]?.full_name}</span>
            <span className="text-muted-foreground">({REL[k["relationship"]] ?? k["relationship"]})</span>
            <span className="text-xs text-muted-foreground" dir="ltr">C‑Smart: {k["students"]?.csmart_no ?? "—"}</span>
            <span className={`ms-auto text-xs ${k["verified"] ? "text-primary" : "text-muted-foreground"}`}>{k["verified"] ? "علاقة موثّقة" : "بانتظار التوثيق"}</span>
            {canManage && !k["verified"] && (
              <span className="flex gap-1">
                <Button size="sm" onClick={() => void approve(k["id"])}>توثيق</Button>
                <Button size="sm" variant="ghost" onClick={() => void reject(k["id"])}>رفض</Button>
              </span>
            )}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">لا يرى ولي الأمر بيانات الابن ولا فصله إلا بعد توثيق العلاقة. راجع الاسم والهوية قبل التوثيق.</p>
      </div>
      {canManage && (
        <div>
          <h3 className="mb-2 font-semibold">سجل تغيير الجوال</h3>
          {!log.data?.length ? <p className="text-muted-foreground">لم يتغير الجوال.</p> : log.data.map((l, i) => (
            <p key={i} className="text-xs"><span dir="ltr">{localPhone(l["old_phone"]) || "—"} ← {localPhone(l["new_phone"]) || "—"}</span> · {new Date(l["created_at"]).toLocaleString("ar-SA")}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** «هل ولي الأمر موظف لدينا؟» — copies name/ID/mobile/email from the group's HR file (server-checked: can_edit_students, same group). */
function HrPick({ schoolId, onPick }: { schoolId: string; onPick: (v: Row) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const res = useQuery({ enabled: open && q.trim().length >= 2, queryKey: ["hr-guardian-cand", schoolId, q.trim()], queryFn: async () => {
    const { data, error } = await db.rpc("hr_guardian_candidates", { _school: schoolId, _q: q.trim() }); if (error) throw error; return data as Row[];
  } });
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="size-4 accent-primary" checked={open} onChange={(e) => setOpen(e.target.checked)} /> ولي الأمر موظف لدينا في الموارد البشرية — استورد بياناته</label>
      {open && <>
        <input className="w-full rounded-md border bg-background px-3 py-2" placeholder="ابحث بالاسم أو الرقم الوظيفي أو الهوية…" value={q} onChange={(e) => setQ(e.target.value)} />
        {res.error && <p className="text-xs text-destructive">{arabicError(res.error)}</p>}
        {res.data && res.data.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد موظف مطابق.</p>}
        <ul className="max-h-48 divide-y overflow-y-auto">
          {(res.data ?? []).map((e) => (
            <li key={e["id"]}><button type="button" className="w-full py-1.5 text-start hover:text-primary" onClick={() => { onPick({ full_name: e["full_name"], national_id: e["national_id"] ?? "", phone: e["phone"] ?? "", email: e["email"] ?? "" }); setOpen(false); toast.success("نُسخت بيانات الموظف — راجعها ثم احفظ"); }}>
              {e["full_name"]} <span className="text-xs text-muted-foreground">{[e["employee_no"], e["job_title"]].filter(Boolean).join(" · ")}</span>
            </button></li>
          ))}
        </ul>
      </>}
    </div>
  );
}
