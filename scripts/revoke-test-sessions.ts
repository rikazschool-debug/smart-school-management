// Phase 6: end every session of demo (@rikaz.demo) and synthetic (@rikaz.test) accounts on the TEST database and leave
// each with a fresh random password that is never printed or stored. Never touches other accounts (real staff, guardians,
// platform owner). Run: NODE_PATH=node_modules bun scripts/revoke-test-sessions.ts   (refuses any non-test host)
import { createClient } from "@supabase/supabase-js";
const URL_ = process.env["SUPABASE_URL"] ?? "", PK = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
if (!URL_.includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database only");
const admin = createClient(URL_, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const users: { id: string; email?: string }[] = [];
for (let p = 1; ; p++) { const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: 1000 }); if (error) throw error; users.push(...data.users); if (data.users.length < 1000) break; }
const targets = users.filter((u) => /@rikaz\.(demo|test)$/.test(u.email ?? ""));
let done = 0, failed = 0; const reasons = new Map<string, number>();
const why = (m: string) => { failed++; reasons.set(m, (reasons.get(m) ?? 0) + 1); };
for (const u of targets) {
  const pw = "Rv-" + crypto.randomUUID() + "-" + crypto.randomUUID().slice(0, 12);
  const up = await admin.auth.admin.updateUserById(u.id, { password: pw });
  if (up.error) { why("password: " + up.error.message); continue; }
  const c = createClient(URL_, PK, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await c.auth.signInWithPassword({ email: u.email!, password: pw });
  if (s.error) { why("sign-in: " + s.error.message); await new Promise((r) => setTimeout(r, 2000)); continue; }
  const o = await c.auth.signOut({ scope: "global" }); // revokes every refresh token / session of this user
  o.error ? why("sign-out: " + o.error.message) : done++;
}
console.log([...reasons].map(([k, v]) => `${v} × ${k}`).join("\n"));
console.log(`accounts: ${targets.length}, sessions ended + random password: ${done}, failed: ${failed}`);
