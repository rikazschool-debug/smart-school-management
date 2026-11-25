// Demo-account sign-in for test scripts without any stored password. On the TEST database only, each call gives
// the @rikaz.demo account a fresh random password (service role) and returns it, so no demo password ever lives in
// source, logs or environment files. Refuses other hosts and non-demo accounts (platform-owner logins are never touched).
import { createClient } from "@supabase/supabase-js";

const TEST_REF = "czoaudsfbinpkwqsmhrd";
const cache = new Map<string, string>();

export async function demoPassword(email: string): Promise<string> {
  const url = process.env["SUPABASE_URL"] ?? "";
  if (!url.includes(TEST_REF)) throw new Error("demo sign-in is allowed on the test database only");
  if (!/^demo-[a-z0-9-]+@rikaz\.demo$/.test(email)) throw new Error("only @rikaz.demo demo accounts can be signed in this way");
  const hit = cache.get(email);
  if (hit) return hit;
  const admin = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
  let id: string | null = null;
  for (let page = 1; !id; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    id = data.users.find((u) => u.email === email)?.id ?? null;
    if (data.users.length < 1000) break;
  }
  if (!id) throw new Error("demo account not found: " + email);
  const pw = "Dm-" + crypto.randomUUID() + "-" + crypto.randomUUID().slice(0, 8);
  const r = await admin.auth.admin.updateUserById(id, { password: pw });
  if (r.error) throw r.error;
  cache.set(email, pw);
  return pw;
}
