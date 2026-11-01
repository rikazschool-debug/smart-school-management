import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, useOptions, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, invitableRoles, type Role } from "@/lib/roles";
import { arabicError, type AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/members")({
  head: () => ({ meta: [{ title: "المستخدمون والأدوار — ركاز" }, { name: "description", content: "إدارة مستخدمي المؤسسة ودعواتهم وأدوارهم لمالك المؤسسة." }] }),
  component: Page,
});

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const KIND: Record<string, string> = { teacher: "معلم", guardian: "ولي أمر", student: "طالب" };
const ACTION: Record<string, string> = {
  invite_create: "إنشاء دعوة", invite_resend: "تجديد دعوة", invite_revoke: "إلغاء دعوة", invite_review_reissue: "مراجعة وإعادة إصدار دعوة", invite_flag_review: "تعليق دعوة للمراجعة",
  membership_activate: "تفعيل عضوية", membership_deactivate: "إيقاف عضوية", membership_role_change: "تغيير دور", account_request_approve: "اعتماد طلب حساب", account_request_reject: "رفض طلب حساب",
};

function Page() {
  // Server-enforced too: every action below is an owner-only RPC (is_org_owner) — the menu only mirrors it.
  return <RequireSchool nav="members">{(ctx) => <Members ctx={ctx} />}</RequireSchool>;
}

function Members({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const qc = useQueryClient();
  const roles = invitableRoles(ctx.role);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [dept, setDept] = useState("");
  const [editing, setEditing] = useState<{ id: string; role: Role; dept: string } | null>(null);
  const depts = useOptions("departments", "name", ctx.schoolId);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => ["members", "invitations", "acct-req", "access-audit"].includes(q.queryKey[0] as string) });
  const mem = useQuery({
    queryKey: ["members", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("memberships").select("id, role, is_active, user_id, department_id, departments(name)").eq("school_id", ctx.schoolId).order("role");
      if (error) throw error;
      const ids = (data as Row[]).map((m) => m["user_id"]);
      const { data: profs } = await db.from("profiles").select("id, full_name, email").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const pm = new Map((profs as Row[] | null ?? []).map((p) => [p["id"], p]));
      return (data as Row[]).map((m) => ({ ...m, profile: pm.get(m["user_id"]) })) as Row[];
    },
  });
  const inv = useQuery({
    queryKey: ["invitations", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("invitations").select("*").eq("school_id", ctx.schoolId).is("accepted_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  const reqs = useQuery({
    queryKey: ["acct-req", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("account_requests").select("*").eq("school_id", ctx.schoolId).eq("status", "pending").order("created_at");
      if (error) throw error;
      return data as Row[];
    },
  });
  const audit = useQuery({
    queryKey: ["access-audit", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("access_audit").select("*").eq("school_id", ctx.schoolId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data as Row[];
    },
  });
  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: unknown }>)(fn, args);
    if (error) { toast.error(arabicError(error)); return false; }
    toast.success(ok); refresh(); return true;
  };

  return (
    <>
      <PageHeader title="المستخدمون والأدوار" desc="هذا القسم لمالك المؤسسة فقط: الدعوات والأدوار وحالة العضويات في مدارس مؤسستك. لا يمكن لأحد منح نفسه دورًا." />
      <form
        className="mb-8 grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!/^\S+@\S+\.\S+$/.test(email)) return void toast.error("بريد غير صحيح");
          if (!role) return void toast.error("اختر الدور");
          const ok = await rpc("invite_member", { _email: email, _school: ctx.schoolId, _role: role, ...(dept ? { _department: dept } : {}) }, "أُنشئت الدعوة. انسخ رابطها من القائمة أدناه وأرسله للمدعو.");
          if (ok) { setEmail(""); setRole(""); setDept(""); }
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="em">البريد الإلكتروني</Label>
          <Input id="em" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rl">الدور</Label>
          <select id="rl" className={sel} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="">— اختر —</option>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        {role === "dept_head" ? (
          <div className="space-y-1.5">
            <Label htmlFor="dp">القسم</Label>
            <select id="dp" className={sel} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">— اختر —</option>
              {depts.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        ) : <div />}
        <Button className="sm:col-span-4 sm:w-fit" disabled={roles.length === 0}>إرسال الدعوة</Button>
      </form>

      {!!reqs.data?.length && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-bold">طلبات حسابات من الإدارة الأكاديمية</h2>
          <p className="mb-3 text-sm text-muted-foreground">رفعها مدير المدرسة أو شؤون الطلاب لسجلات موجودة. الاعتماد ينشئ دعوة بالدور المطلوب فقط.</p>
          <ul className="space-y-2">
            {reqs.data.map((r) => (
              <li key={r["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
                <span>{r["full_name"] ?? "—"} — {KIND[r["kind"]]}</span>
                <span dir="ltr">{r["email"]}</span>
                <span className="flex gap-1">
                  <Button size="sm" onClick={() => rpc("decide_account_request", { _id: r["id"], _approve: true }, "اعتُمد الطلب وأُنشئت الدعوة")}>اعتماد</Button>
                  <Button size="sm" variant="ghost" onClick={() => { const n = window.prompt("سبب الرفض (اختياري)") ?? undefined; void rpc("decide_account_request", { _id: r["id"], _approve: false, _note: n || null }, "رُفض الطلب"); }}>رفض</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-lg font-bold">الأعضاء</h2>
      {mem.isLoading ? <LoadingState /> : mem.error ? <ErrorState message={arabicError(mem.error)} /> : !mem.data?.length ? <EmptyState title="لا يوجد أعضاء بعد" /> : (
        <div className="mb-8 overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead className="text-start">الاسم</TableHead><TableHead className="text-start">البريد</TableHead><TableHead className="text-start">الدور</TableHead><TableHead className="text-start">الحالة</TableHead></TableRow></TableHeader>
            <TableBody>
              {mem.data.map((m) => (
                <TableRow key={m["id"]}>
                  <TableCell>{m["profile"]?.full_name || "—"}</TableCell>
                  <TableCell dir="ltr" className="text-end">{m["profile"]?.email ?? "—"}</TableCell>
                  <TableCell>
                    {editing?.id === m["id"] ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <select aria-label="الدور الجديد" className={sel + " h-8 w-auto"} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}>
                          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                        {editing.role === "dept_head" && (
                          <select aria-label="قسم الدور" className={sel + " h-8 w-auto"} value={editing.dept} onChange={(e) => setEditing({ ...editing, dept: e.target.value })}>
                            <option value="">— القسم —</option>{depts.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </select>
                        )}
                        <Button size="sm" onClick={async () => {
                          const reason = window.prompt("سبب التغيير") ?? "";
                          if (await rpc("change_member_role", { _id: m["id"], _role: editing.role, _department: editing.dept || null, _reason: reason || null }, "تم تغيير الدور")) setEditing(null);
                        }}>حفظ</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>إلغاء</Button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-2">{ROLE_LABELS[m["role"] as Role]}{m["departments"]?.name ? ` — ${m["departments"].name}` : ""}
                        {m["role"] !== "org_owner" && <Button size="sm" variant="ghost" onClick={() => setEditing({ id: m["id"], role: m["role"], dept: m["department_id"] ?? "" })}>تغيير</Button>}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => {
                      const reason = window.prompt(m["is_active"] ? "سبب الإيقاف" : "سبب التفعيل") ?? "";
                      void rpc("set_membership_active", { _id: m["id"], _active: !m["is_active"], _reason: reason || null }, m["is_active"] ? "أُوقفت العضوية" : "فُعّلت العضوية");
                    }}>{m["is_active"] ? "نشط — إيقاف" : "موقوف — تفعيل"}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <h2 className="mb-1 text-lg font-bold">الدعوات المعلقة</h2>
      <p className="mb-3 text-sm text-muted-foreground">لا يرسل النظام رسائل بريد للدعوات حاليًا. انسخ الرابط وأرسله للمدعو بنفسك. لا تُفعّل العضوية إلا بعد دخوله بالبريد نفسه وتأكيده.</p>
      {inv.data?.length ? (
        <ul className="mb-8 space-y-2">
          {inv.data.map((i) => {
            const review = !!i["needs_review"];
            const st = review ? "بانتظار مراجعتك — صدرت من دور لم يعد مخولًا" : i["revoked_at"] ? "ملغاة" : new Date(i["expires_at"]) <= new Date() ? "منتهية" : "صالحة حتى " + new Date(i["expires_at"]).toLocaleDateString("ar");
            const active = !review && !i["revoked_at"] && new Date(i["expires_at"]) > new Date();
            const link = `${window.location.origin}/invite/${i["token"]}`;
            return (
              <li key={i["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
                <span dir="ltr">{i["email"]}</span>
                <span>{ROLE_LABELS[i["role"] as Role]}</span>
                <span className={active ? "text-muted-foreground" : "text-destructive"}>{st}</span>
                <span className="flex gap-1">
                  {active && <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("تم نسخ رابط الدعوة"); }}>نسخ الرابط</Button>}
                  <Button size="sm" variant="ghost" onClick={() => rpc("resend_invitation", { _id: i["id"] }, review ? "اعتمدتَ الدعوة وأُعيد إصدارها برابط جديد" : "تم تجديد الدعوة برابط جديد، والرابط القديم لم يعد يعمل")}>{review ? "اعتماد وإعادة إصدار" : "إعادة إرسال"}</Button>
                  {(active || review) && <Button size="sm" variant="ghost" onClick={() => rpc("revoke_invitation", { _id: i["id"] }, "أُلغيت الدعوة")}>إلغاء</Button>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title="لا توجد دعوات معلقة" />}

      <h2 className="mb-3 mt-8 text-lg font-bold">سجل تغييرات الصلاحيات</h2>
      {audit.data?.length ? (
        <ul className="space-y-1 text-sm">
          {audit.data.map((a) => (
            <li key={a["id"]} className="rounded-lg border bg-card px-3 py-1.5">
              <b>{ACTION[a["action"]] ?? a["action"]}</b> — {new Date(a["created_at"]).toLocaleString("ar")}
              {a["before"] && <span className="text-muted-foreground"> • قبل: {fmt(a["before"])}</span>}
              {a["after"] && <span className="text-muted-foreground"> • بعد: {fmt(a["after"])}</span>}
              {a["reason"] && <span> • السبب: {a["reason"]}</span>}
            </li>
          ))}
        </ul>
      ) : <EmptyState title="لا توجد تغييرات مسجلة بعد" />}
    </>
  );
}

function fmt(v: Record<string, unknown>) {
  return Object.entries(v).map(([k, x]) => `${k}: ${k === "role" && typeof x === "string" ? ROLE_LABELS[x as Role] ?? x : String(x)}`).join("، ");
}
