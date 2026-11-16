// Test-account pool. Imported first by every test script: auth.admin.createUser reuses a released
// pooled account (renamed to the requested email, new password) and deleteUser releases it back,
// so test runs stop creating and deleting hundreds of auth users. POOL_OFF=1 restores real calls.
import { GoTrueAdminApi } from "@supabase/auth-js";

const P = GoTrueAdminApi.prototype as any;
if (!P.__pooled && process.env.POOL_OFF !== "1") {
  P.__pooled = true;
  const realCreate = P.createUser, realDelete = P.deleteUser;
  const RUN = crypto.randomUUID();
  let free: string[] | null = null;

  async function loadFree(api: any) {
    if (free) return free;
    free = [];
    for (let page = 1; ; page++) {
      const { data, error } = await api.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) if (u.app_metadata?.pool === true && !u.app_metadata?.pool_run) free.push(u.id);
      if (data.users.length < 1000) break;
    }
    return free;
  }

  P.createUser = async function (attrs: any) {
    const email = String(attrs?.email ?? "");
    if (!email.endsWith("@rikaz.test")) return realCreate.call(this, attrs); // only synthetic test accounts are pooled
    const ids = await loadFree(this);
    while (ids.length) {
      const id = ids.shift()!;
      const r = await this.updateUserById(id, {
        email, password: attrs.password, phone: attrs.phone, email_confirm: true, phone_confirm: attrs.phone_confirm,
        user_metadata: attrs.user_metadata ?? {}, app_metadata: { ...(attrs.app_metadata ?? {}), pool: true, pool_run: RUN },
      });
      if (r.error) continue;
      const check = await this.getUserById(id);
      if (check.data?.user?.app_metadata?.pool_run === RUN) return r; // claimed by this run
    }
    return realCreate.call(this, { ...attrs, app_metadata: { ...(attrs.app_metadata ?? {}), pool: true, pool_run: RUN } });
  };

  P.deleteUser = async function (id: string, soft?: boolean) {
    const g = await this.getUserById(id);
    const u = g.data?.user;
    if (!u?.app_metadata?.pool) return realDelete.call(this, id, soft);
    // release: drop the links a real delete would cascade, then park the account under a neutral name
    const url = (this as any).url.replace(/\/auth\/v1$/, "");
    const key = String((this as any).headers?.Authorization ?? "").replace(/^Bearer /, "") || (this as any).headers?.apikey;
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    for (const t of ["memberships", "platform_admins", "account_setup", "staff_logins", "otp_sends", "hr_login_pending"])
      await fetch(`${url}/rest/v1/${t}?user_id=eq.${id}`, { method: "DELETE", headers: h });
    const r = await this.updateUserById(id, {
      email: `pool-${id.slice(0, 8)}@rikaz.test`, phone: "", password: crypto.randomUUID(),
      user_metadata: {}, app_metadata: { pool: true, pool_run: null },
    });
    if (r.error) return realDelete.call(this, id, soft);
    return { data: { user: r.data.user }, error: null };
  };
}
