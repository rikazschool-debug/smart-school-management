import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { guardianLoginEmail } from "@/lib/guardian-login";

function tempPassword() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => a[x % a.length]).join("");
}

/** Creates a ready login for a guardian (login = national ID, else phone) with a temporary password shown once. */
export const createGuardianAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { guardianId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d?.guardianId ?? "")) throw new Error("معرّف غير صالح");
    return d;
  })
  .handler(async ({ data, context }) => {
    // RLS-bound read: the caller must be able to see this guardian and manage students in its school
    const { data: g, error } = await context.supabase.from("guardians").select("id, school_id, user_id, full_name, phone, national_id").eq("id", data.guardianId).maybeSingle();
    if (error || !g) throw new Error("ولي الأمر غير موجود");
    const { data: ok } = await context.supabase.rpc("can_manage_students", { _school: g.school_id });
    if (!ok) throw new Error("لا تملك صلاحية إدارة الطلاب");
    if (g.user_id) throw new Error("لولي الأمر حساب مسبقًا");
    const login = (g.national_id || g.phone || "").replace(/\D/g, "");
    if (!login) throw new Error("لا يوجد رقم هوية أو جوال لولي الأمر");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = tempPassword();
    const created = await supabaseAdmin.auth.admin.createUser({
      email: guardianLoginEmail(login), password, email_confirm: true,
      user_metadata: { full_name: g.full_name, must_change_password: true },
    });
    if (created.error || !created.data.user) {
      throw new Error(/already/i.test(created.error?.message ?? "") ? "يوجد حساب بهذا الرقم مسبقًا" : "تعذّر إنشاء الحساب");
    }
    const uid = created.data.user.id;
    const { error: e2 } = await supabaseAdmin.rpc("link_guardian_account", { _guardian: g.id, _uid: uid, _actor: context.userId });
    if (e2) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error("تعذّر ربط الحساب");
    }
    return { login, password };
  });
