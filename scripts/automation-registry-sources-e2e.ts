// Phase G regression: au_registry "sources" follows the same permission rule as events/variables. Synthetic isolated org only.
// Run through the SQL stand-in: python3 scripts/lib/au-sql-runner.py automation-registry-sources-e2e
import { sqlAdmin } from "./lib/sql-admin";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const admin: any = sqlAdmin(); const run = Date.now(), pw = "Test-" + crypto.randomUUID();
const tr = new TestRun(admin, "automation-registry-sources-e2e");
let ok = 0, bad = 0; const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); };
const mk = async (tag: string) => { const email = `aurs-${tag}-${run}@rikaz.test`; await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } }); const c = createClient(URL, PK, { auth: { persistSession: false } }); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error; tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id as string }; };
const orgs: string[] = [];
try {
  const owner = await mk("owner"), fin = await mk("fin"), hr = await mk("hr"), plain = await mk("plain");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مصادر الكتالوج " + run, _school_name: "فرع" })).data as string; orgs.push(org);
  const S = (await admin.from("schools").select("id").eq("org_id", org).single()).data.id; tr.addSchool(S);
  for (const u of [fin, hr, plain]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: "teacher" });
  const grant = async (u: any, k: string) => { const [s, a] = k.split("."); const r = await owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: s, _action: a, _effect: "grant", _scope: "org", _reason: "اختبار" }); if (r.error) throw new Error(k + r.error.message); };
  for (const k of ["au_view.center", "au_view.rules", "student_finance.view"]) await grant(fin, k);
  for (const k of ["au_view.center", "au_view.rules"]) await grant(hr, k);
  const d = await owner.c.rpc("au_deleg_save", { _org: org, _user: fin.id, _schools: [S], _central: false, _sections: null, _events: ["ds.student_accounts"], _actions: null, _recipients: null, _starts: null, _ends: null, _reason: "اختبار" }); if (d.error) throw new Error(d.error.message);
  const all = (await admin.from("au_sources").select("key", { count: "exact", head: true })).count as number;
  const o = (await owner.c.rpc("au_registry", { _org: org })).data as any, f = (await fin.c.rpc("au_registry", { _org: org })).data as any;
  check(`owner still sees every registered source (${all})`, (o.sources ?? []).length === all, { n: o.sources?.length, all });
  const evs = new Set((f.events ?? []).map((e: any) => e.code));
  check("delegate: every listed source belongs to an event the delegate can see", (f.sources ?? []).length > 0 && (f.sources ?? []).every((s: any) => s.event_code && evs.has(s.event_code)), (f.sources ?? []).map((s: any) => s.key).slice(0, 5));
  check("delegate: list is smaller than the full list and has no source of an event outside the delegation", (f.sources ?? []).length < all && !(f.sources ?? []).some((s: any) => ["ds.hr_employees", "ds.attendance_daily"].includes(s.event_code)), { n: f.sources?.length, all });
  check("delegate with only the student-accounts event sees that source only among operational ones", (f.sources ?? []).filter((s: any) => String(s.event_code).startsWith("ds.")).every((s: any) => s.event_code === "ds.student_accounts"), (f.sources ?? []).filter((s: any) => String(s.event_code).startsWith("ds.")).map((s: any) => s.event_code));
  const h = await hr.c.rpc("au_registry", { _org: org }); const p = await plain.c.rpc("au_registry", { _org: org });
  check("grant without delegation: refused", !!h.error, h.data && Object.keys(h.data));
  check("no automation permission: refused", !!p.error);
  const direct = await fin.c.from("au_sources").select("key"); check("sources table not directly readable by the delegate", (direct.data ?? []).length === 0, direct.data?.length);
} catch (e) { check("suite ran", false, (e as Error).message); }
finally {
  await tr.deleteNotifications().catch(() => {}); for (const o of orgs) await tr.purgeOrg(o).catch(() => {}); for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
