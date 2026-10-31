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

export const Route = createFileRoute("/_authenticated/app/members")({ component: Page });

function Page() {
  return <RequireSchool nav="members">{(ctx) => <Members ctx={ctx} />}</RequireSchool>;
}

function Members({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const qc = useQueryClient();
  const roles = invitableRoles(ctx.role);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [dept, setDept] = useState("");
  const depts = useOptions("departments", "name", ctx.schoolId);
  const mem = useQuery({
    queryKey: ["members", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("memberships").select("id, role, is_active, user_id, departments(name)").eq("school_id", ctx.schoolId).order("role");
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

  return (
    <>
      <PageHeader title="المستخدمون والأدوار" desc="ادعُ المستخدمين بالبريد وحدد دورهم في هذه المدرسة. لا يمكن لأحد منح نفسه دورًا." />
      <form
        className="mb-8 grid gap-3 rounded-2xl border bg-card p-5 sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!/^\S+@\S+\.\S+$/.test(email)) return void toast.error("بريد غير صحيح");
          if (!role) return void toast.error("اختر الدور");
          const { error } = await supabase.rpc("invite_member", { _email: email, _school: ctx.schoolId, _role: role as Exclude<Role, "platform_admin">, ...(dept ? { _department: dept } : {}) });
          if (error) return void toast.error(arabicError(error));
          toast.success("أُنشئت الدعوة. انسخ رابطها من القائمة أدناه وأرسله للمدعو.");
          setEmail(""); setRole(""); setDept("");
          qc.invalidateQueries();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="em">البريد الإلكتروني</Label>
          <Input id="em" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rl">الدور</Label>
          <select id="rl" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="">— اختر —</option>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        {role === "dept_head" ? (
          <div className="space-y-1.5">
            <Label htmlFor="dp">القسم</Label>
            <select id="dp" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">— اختر —</option>
              {depts.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        ) : <div />}
        <Button className="sm:col-span-4 sm:w-fit" disabled={roles.length === 0}>إرسال الدعوة</Button>
      </form>

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
                  <TableCell>{ROLE_LABELS[m["role"] as Role]}{m["departments"]?.name ? ` — ${m["departments"].name}` : ""}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      const { error } = await db.from("memberships").update({ is_active: !m["is_active"] }).eq("id", m["id"]);
                      if (error) toast.error(arabicError(error)); else qc.invalidateQueries();
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
        <ul className="space-y-2">
          {inv.data.map((i) => {
            const st = i["revoked_at"] ? "ملغاة" : new Date(i["expires_at"]) <= new Date() ? "منتهية" : "صالحة حتى " + new Date(i["expires_at"]).toLocaleDateString("ar");
            const active = !i["revoked_at"] && new Date(i["expires_at"]) > new Date();
            const link = `${window.location.origin}/invite/${i["token"]}`;
            return (
              <li key={i["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
                <span dir="ltr">{i["email"]}</span>
                <span>{ROLE_LABELS[i["role"] as Role]}</span>
                <span className={active ? "text-muted-foreground" : "text-destructive"}>{st}</span>
                <span className="flex gap-1">
                  {active && <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("تم نسخ رابط الدعوة"); }}>نسخ الرابط</Button>}
                  <Button size="sm" variant="ghost" onClick={async () => {
                    const { error } = await supabase.rpc("resend_invitation", { _id: i["id"] });
                    if (error) toast.error(arabicError(error)); else { toast.success("تم تجديد الدعوة برابط جديد، والرابط القديم لم يعد يعمل"); qc.invalidateQueries(); }
                  }}>إعادة إرسال</Button>
                  {active && <Button size="sm" variant="ghost" onClick={async () => {
                    const { error } = await supabase.rpc("revoke_invitation", { _id: i["id"] });
                    if (error) toast.error(arabicError(error)); else { toast.success("أُلغيت الدعوة"); qc.invalidateQueries(); }
                  }}>إلغاء</Button>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title="لا توجد دعوات معلقة" />}
    </>
  );
}
