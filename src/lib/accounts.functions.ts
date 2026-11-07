import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STAFF_DOMAIN } from "@/lib/guardian-login";
import { normPhone, studentLoginEmail, strongEnough } from "@/lib/people-import";

type Kind = "student" | "teacher" | "guardian";
const UUID = /^[0-9a-f-]{36}$/i;

function tempPassword() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => a[x % a.length]).join("") + "7a";
}

/**
 * Creates or links the fixed-role login for students (national ID + initial password), teachers and guardians (mobile + WhatsApp code).
 * The caller's permission is checked with their own RLS client; only then the service role creates/links. New accounts have no access
 * until the first-login step (account_setup); existing accounts are linked without touching their password or roles.
 */
export const provisionAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: Kind; ids: string[] }) => {
    if (!["student", "teacher", "guardian"].includes(d?.kind)) throw new Error("نوع غير صالح");
    if (!Array.isArray(d.ids) || d.ids.length > 200 || !d.ids.every((x) => UUID.test(x))) throw new Error("معرّفات غير صالحة");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "student" ? "students" : data.kind === "teacher" ? "teachers" : "guardians";
    const { data: rows, error } = await (data.kind === "teacher" ? context.supabase.from("teachers").select("id, school_id, user_id, phone, email, full_name") : context.supabase.from(table).select("*")).in("id", data.ids); // teachers.national_id is not readable directly // teachers.national_id is not readable directly
    if (error) throw new Error("تعذّرت قراءة السجلات");
    const out: { id: string; state: string; msg?: string }[] = [];
    const allowed = new Map<string, boolean>();
    for (const r of (rows ?? []) as Record<string, string | null>[]) {
      const id = r["id"]!, school = r["school_id"]!;
      try {
        if (!allowed.has(school)) {
          const fn = data.kind === "teacher" ? "is_school_principal" : "can_manage_students";
          const { data: ok } = await context.supabase.rpc(fn as never, { _school: school } as never);
          allowed.set(school, !!ok);
        }
        if (!allowed.get(school)) throw new Error("لا تملك صلاحية إنشاء هذا الحساب");
        if (r["user_id"]) { out.push({ id, state: "linked" }); continue; }
        let email: string | null = null, phone: string | null = null;
        if (data.kind === "student") {
          const nid = String(r["national_id"] ?? "").replace(/\D/g, "");
          if (!nid) throw new Error("رقم هوية الطالب مطلوب لإنشاء حسابه");
          email = studentLoginEmail(nid);
        } else {
          phone = normPhone(r["phone"]);
          if (!phone) throw new Error("جوال سعودي صحيح مطلوب لإنشاء الحساب");
        }
        const { data: found } = await supabaseAdmin.rpc("_auth_user_lookup" as never, { _email: email, _phone: phone } as never);
        const ex = (found as unknown as { user_id: string; phone_confirmed: boolean }[] | null)?.[0];
        let uid = ex?.user_id ?? null;
        let pending = true;
        if (uid) {
          // existing login: link without changing password/roles; an unconfirmed phone still has to be confirmed
          pending = data.kind !== "student" && !ex!.phone_confirmed;
        } else {
          const created = data.kind === "student"
            ? await supabaseAdmin.auth.admin.createUser({ email: email!, password: tempPassword(), email_confirm: true, user_metadata: { full_name: r["full_name"] } })
            : await supabaseAdmin.auth.admin.createUser({ phone: phone!, phone_confirm: false, user_metadata: { full_name: r["full_name"] } });
          if (created.error || !created.data.user) throw new Error("تعذّر إنشاء الحساب");
          uid = created.data.user.id;
        }
        const { data: st, error: e2 } = await supabaseAdmin.rpc("_provision_link" as never, { _kind: data.kind, _subject: id, _uid: uid, _actor: context.userId, _pending: pending } as never);
        if (e2) throw new Error(e2.message);
        out.push({ id, state: String(st) });
      } catch (e) {
        out.push({ id, state: "error", msg: (e as Error).message });
      }
    }
    for (const id of data.ids) if (!out.some((o) => o.id === id)) out.push({ id, state: "error", msg: "السجل غير متاح" });
    return out;
  });

/** Issues a one-time initial password for a student (shown once to the authorized manager, never stored). Also the safe recovery path. */
export const issueStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { studentId: string }) => { if (!UUID.test(d?.studentId ?? "")) throw new Error("معرّف غير صالح"); return d; })
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase.from("students").select("id, school_id, national_id, user_id, full_name").eq("id", data.studentId).maybeSingle();
    if (!s) throw new Error("الطالب غير موجود");
    const { data: ok } = await context.supabase.rpc("can_manage_students", { _school: s.school_id });
    if (!ok) throw new Error("لا تملك صلاحية إدارة الطلاب");
    const nid = String(s.national_id ?? "").replace(/\D/g, "");
    if (!nid) throw new Error("رقم هوية الطالب مطلوب");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let uid = s.user_id as string | null;
    if (!uid) {
      const { data: setup } = await supabaseAdmin.from("account_setup" as never).select("user_id").eq("subject_id", s.id).maybeSingle();
      uid = (setup as { user_id: string } | null)?.user_id ?? null;
    }
    if (!uid) {
      const { data: found } = await supabaseAdmin.rpc("_auth_user_lookup" as never, { _email: studentLoginEmail(nid), _phone: null } as never);
      uid = (found as unknown as { user_id: string }[] | null)?.[0]?.user_id ?? null;
    }
    const password = tempPassword();
    if (uid) {
      const u = await supabaseAdmin.auth.admin.updateUserById(uid, { password });
      if (u.error) throw new Error("تعذّر تعيين كلمة المرور");
    } else {
      const c = await supabaseAdmin.auth.admin.createUser({ email: studentLoginEmail(nid), password, email_confirm: true, user_metadata: { full_name: s.full_name } });
      if (c.error || !c.data.user) throw new Error("تعذّر إنشاء الحساب");
      uid = c.data.user.id;
    }
    const { error } = await supabaseAdmin.rpc("_stage_student_password" as never, { _student: s.id, _uid: uid, _actor: context.userId } as never);
    if (error) throw new Error(error.message);
    await supabaseAdmin.auth.admin.signOut(uid, "global").catch(() => undefined);
    return { login: nid, password };
  });

/** First login of a student: sets the new password, then the server unlocks access. Enforced in the database (no access before). */
export const completeFirstPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password: string }) => {
    const err = strongEnough(d?.password ?? "");
    if (err) throw new Error(err);
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a } = await supabaseAdmin.from("account_setup" as never).select("need_password, completed_at").eq("user_id", context.userId).maybeSingle();
    const row = a as { need_password: boolean; completed_at: string | null } | null;
    if (!row || row.completed_at || !row.need_password) throw new Error("لا يلزم تغيير كلمة المرور");
    const u = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (u.error) throw new Error("تعذّر حفظ كلمة المرور");
    const { error } = await supabaseAdmin.rpc("_complete_account_setup" as never, { _uid: context.userId, _password_changed: true } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** After the first WhatsApp-code sign-in (phone confirmed by auth), unlock the staged teacher/guardian account. */
export const completePhoneSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("_complete_account_setup" as never, { _uid: context.userId, _password_changed: false } as never);
    if (error) throw new Error(error.message);
    return { state: String(data) };
  });

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,29}$/;
type StaffInput = { orgId: string; existingUserId?: string | null; username?: string; fullName?: string; password?: string; base: string; schools: string[]; roles: { role_id: string; school_ids: string[] | null; limit: number | null }[]; overrides?: { section: string; action: string; effect: string | null; scope: string | null }[]; reason: string };

/**
 * Owner adds a staff member: a new username/password login (created through Supabase Auth, password never stored by us)
 * or an existing org account (roles added, password untouched). All memberships/roles/gate are written in one transaction.
 */
export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: StaffInput) => {
    if (!UUID.test(d?.orgId ?? "")) throw new Error("مؤسسة غير صالحة");
    if (!Array.isArray(d.schools) || !d.schools.length || !d.schools.every((x) => UUID.test(x))) throw new Error("اختر فرعًا واحدًا على الأقل");
    if (!Array.isArray(d.roles) || d.roles.length > 20 || !d.roles.every((r) => UUID.test(r.role_id))) throw new Error("أدوار غير صالحة");
    if (!d.reason?.trim()) throw new Error("السبب مطلوب");
    if (d.overrides && (!Array.isArray(d.overrides) || d.overrides.length > 200)) throw new Error("تخصيص غير صالح");
    if (d.existingUserId) { if (!UUID.test(d.existingUserId)) throw new Error("حساب غير صالح"); return d; }
    const u = (d.username ?? "").trim().toLowerCase();
    if (!USERNAME.test(u)) throw new Error("اسم المستخدم: 3–30 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو . _ -");
    if ((d.fullName ?? "").trim().length < 3) throw new Error("اسم الموظف مطلوب");
    const err = strongEnough(d.password ?? ""); if (err) throw new Error(err);
    return { ...d, username: u };
  })
  .handler(async ({ data, context }) => {
    const { data: owner } = await context.supabase.rpc("is_org_owner" as never, { _org: data.orgId } as never);
    if (!owner) throw new Error("إضافة الموظفين لمالك المؤسسة");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let uid = data.existingUserId ?? null;
    let created = false;
    if (!uid) {
      const email = `${data.username}@${STAFF_DOMAIN}`;
      const { data: login } = await supabaseAdmin.from("staff_logins" as never).select("user_id").eq("username", data.username!).maybeSingle();
      const prev = login ? null : await supabaseAdmin.rpc("_auth_user_lookup" as never, { _email: email, _phone: null } as never);
      const orphan = ((prev?.data as { user_id: string }[] | null) ?? [])[0]?.user_id;
      if (login) {
        // A previous save finished provisioning but not the final unlock: finish it instead of creating a duplicate.
        const u = await supabaseAdmin.auth.admin.getUserById((login as { user_id: string }).user_id);
        const banned = u.data.user?.banned_until && new Date(u.data.user.banned_until) > new Date();
        const { data: st } = await supabaseAdmin.from("account_setup" as never).select("created_by").eq("user_id", (login as { user_id: string }).user_id).is("completed_at", null).maybeSingle();
        if (!banned || (st as { created_by: string } | null)?.created_by !== context.userId) throw new Error("اسم المستخدم مستخدم من قبل؛ اختر اسمًا آخر");
        const ub = await supabaseAdmin.auth.admin.updateUserById((login as { user_id: string }).user_id, { password: data.password!, ban_duration: "none" });
        if (ub.error) throw new Error("تعذّر إكمال الحساب؛ أعد المحاولة");
        return { userId: (login as { user_id: string }).user_id, created: true, resumed: true };
      }
      if (orphan) { // left from a failed attempt: locked, no roles — reuse it
        await supabaseAdmin.auth.admin.updateUserById(orphan, { password: data.password!, ban_duration: "876000h", user_metadata: { full_name: data.fullName!.trim() } });
        uid = orphan;
      } else {
        const c = await supabaseAdmin.auth.admin.createUser({ email, password: data.password!, email_confirm: true, ban_duration: "876000h", user_metadata: { full_name: data.fullName!.trim() } });
        if (c.error || !c.data.user) throw new Error(/already/i.test(c.error?.message ?? "") ? "اسم المستخدم مستخدم من قبل؛ اختر اسمًا آخر" : "تعذّر إنشاء الحساب");
        uid = c.data.user.id;
      }
      created = true;
    }
    const { data: res, error } = await supabaseAdmin.rpc("_staff_provision" as never, {
      _actor: context.userId, _org: data.orgId, _uid: uid, _is_new: created, _username: data.username ?? null, _name: data.fullName ?? null,
      _base: data.base, _schools: data.schools, _roles: data.roles, _reason: data.reason.trim(), _overrides: data.overrides ?? [] } as never);
    if (error) {
      if (created) await supabaseAdmin.auth.admin.deleteUser(uid!).catch(() => undefined); // stays locked if delete fails; retry reuses it
      throw new Error(error.message);
    }
    if (created) { // login opens only after everything is written
      const ub = await supabaseAdmin.auth.admin.updateUserById(uid!, { ban_duration: "none" });
      if (ub.error) throw new Error("حُفظت الصلاحيات لكن تعذّر فتح الدخول؛ أعد الحفظ لإكماله");
    }
    return { userId: uid!, created, ...(res as object) };
  });

/** Owner issues a new temporary password; access is locked until the employee changes it. The value is never logged. */
export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; userId: string; password: string; reason: string }) => {
    if (!UUID.test(d?.orgId ?? "") || !UUID.test(d?.userId ?? "")) throw new Error("بيانات غير صالحة");
    const err = strongEnough(d.password ?? ""); if (err) throw new Error(err);
    if (!d.reason?.trim()) throw new Error("السبب مطلوب");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: owner } = await context.supabase.rpc("is_org_owner" as never, { _org: data.orgId } as never);
    if (!owner) throw new Error("لمالك المؤسسة فقط");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("_staff_reset" as never, { _actor: context.userId, _org: data.orgId, _uid: data.userId, _reason: data.reason.trim() } as never);
    if (error) throw new Error(error.message);
    const u = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (u.error) throw new Error("تعذّر تعيين كلمة المرور");
    await supabaseAdmin.auth.admin.signOut(data.userId, "global").catch(() => undefined);
    return { ok: true };
  });
