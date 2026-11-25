import "./lib/user-pool.ts";
// Every option the permission tree offers can be saved, and a saved grant/deny really changes the person's rights.
// Known gap kept on purpose: people.tags_manage works only group-wide, so its branch option stays refused.
// Run: NODE_PATH=node_modules bun scripts/perm-catalog-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
if (!String(process.env.SUPABASE_URL).includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database only");
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "perm-catalog-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `pce-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const KNOWN_GAP = new Set(["people.tags_manage/branch"]);
let org = "";
try {
  const owner = await user("owner"), t = await user("teacher");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة فحص الشجرة", _school_name: "فرع أ" })).data;
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  await admin.from("memberships").insert({ user_id: t.id, org_id: org, school_id: A, role: "teacher" });

  const cat = (await owner.c.rpc("perm_catalog", {})).data as any;
  const refused: string[] = [];
  for (const x of cat.sections as any[]) { if (x.locked_reason || x.base_only) continue;
    for (const a of x.actions) for (const s of x.scopes ?? []) { const r = await admin.rpc("_perm_valid", { _section: x.key, _action: a, _scope: s }); if (r.data !== true && !KNOWN_GAP.has(`${x.key}.${a}/${s}`)) refused.push(`${x.key}.${a}/${s}`); } }
  check("1 every grantable option in the tree is accepted by the server", !refused.length, refused);

  const eff = async (k: string) => ((await owner.c.rpc("perm_effective", { _org: org, _user: t.id })).data.effective as any[]).find((x) => `${x.section}.${x.action}` === k);
  const cases: [string, string, string][] = [["calls", "view", "branch"], ["wa_inbox", "mine", "branch"], ["school_schedule", "view", "branch"], ["customer_service", "handle", "branch"], ["contracts", "match", "branch"], ["chat_settings", "view", "org"]];
  for (const [s, a, sc] of cases) {
    const g = await owner.c.rpc("perm_apply", { _org: org, _user: t.id, _changes: { overrides: [{ section: s, action: a, effect: "grant", scope: sc }] }, _reason: "فحص المنح" });
    const e1 = await eff(`${s}.${a}`);
    const d = await owner.c.rpc("perm_apply", { _org: org, _user: t.id, _changes: { overrides: [{ section: s, action: a, effect: "deny", scope: sc }] }, _reason: "فحص المنع" });
    const e2 = await eff(`${s}.${a}`);
    check(`2 ${s}.${a}: grant saves and gives the right, deny removes it`, !g.error && !d.error && (e1?.allowed_schools ?? []).length > 0 && (e2?.allowed_schools ?? []).length === 0, { g: g.error?.message, d: d.error?.message, e1, e2 });
  }
  const tb = await t.c.rpc("perm_apply", { _org: org, _user: t.id, _changes: { overrides: [{ section: "calls", action: "view", effect: "grant", scope: "branch" }] }, _reason: "تصعيد ذاتي" });
  check("3 a teacher cannot grant himself", !!tb.error);
  const tm = await owner.c.rpc("perm_apply", { _org: org, _user: t.id, _changes: { overrides: [{ section: "people", action: "tags_manage", effect: "grant", scope: "branch" }] }, _reason: "نطاق غير فعال" });
  check("4 known gap: tags management branch-only grant still refused (works group-wide only)", !!tm.error);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  if (org) { await admin.from("perm_log").delete().eq("org_id", org); await admin.from("perm_overrides").delete().eq("org_id", org); await admin.from("memberships").delete().eq("org_id", org); await tr.purgeOrg(org).catch(() => {}); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
