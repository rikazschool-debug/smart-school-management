// Used by verifyIdCode in src/lib/id-login.server.ts.
// Runs ONLY after _idl_verify has accepted the code. It never creates an account and never touches roles or links.
import { GUARDIAN_DOMAIN, STAFF_DOMAIN } from "@/lib/guardian-login";

type Admin = {
  auth: { admin: {
    getUserById: (id: string) => Promise<{ data: { user: { id: string; email?: string | null } | null } }>;
    updateUserById: (id: string, attrs: { email: string; email_confirm: boolean }) => Promise<{ error: unknown }>;
  } };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Staged guardian logins are phone-only. Sessions are issued with the platform's existing magic-link token
 * (no email is sent: the hashed token goes straight back to the caller). That needs an email on the login,
 * so we attach the platform's own guardian login address (<ID>@guardian.rikaz.app) — the same address the web
 * sign-in already derives from an ID (src/lib/guardian-login.ts) — confirmed by the admin API.
 */
export async function ensureGuardianLoginEmail(sb: Admin, uid: string, nid: string, kind: "guardian" | "teacher" = "guardian"): Promise<"ok" | "conflict" | "error"> {
  if (!/^[12]\d{9}$/.test(nid)) return "error";
  const { data } = await sb.auth.admin.getUserById(uid);
  if (!data.user) return "error";
  if (data.user.email) return "ok"; // never replace an existing email
  // teachers use the platform staff domain (same family as owner-created staff logins); guardians the guardian domain
  const email = `${nid}@${kind === "teacher" ? STAFF_DOMAIN : GUARDIAN_DOMAIN}`;
  const { data: found } = await sb.rpc("_auth_user_lookup", { _email: email, _phone: null });
  const other = (found as { user_id: string }[] | null)?.[0];
  if (other && other.user_id !== uid) return "conflict"; // duplicate login for this ID: refuse, an admin must resolve
  const { error } = await sb.auth.admin.updateUserById(uid, { email, email_confirm: true });
  return error ? "error" : "ok";
}
