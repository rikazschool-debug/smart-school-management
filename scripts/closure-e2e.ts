// Closure checks (Nov 3): teachers without a login appear in loads/availability but never as chat members, invitees or circular
// recipients; the staff name list is not exposed to platform admins of other orgs. Isolated data only.
// Run: NODE_PATH=node_modules bun scripts/closure-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "closure-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `clo-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
let org: string | null = null, padmin: string | null = null;
try {
  const owner = await user("owner"), pr = await user("pr"), tw = await user("tw"), pa = await user("pa");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الإغلاق", _school_name: "فرع الإغلاق" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  for (const [u, r] of [[pr, "principal"], [tw, "teacher"]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  const year = (await admin.from("academic_years").insert({ school_id: S, name: "1448", start_date: "2026-08-20", end_date: "2027-06-30", is_current: true }).select().single()).data!;
  const tW = (await admin.from("teachers").insert({ school_id: S, full_name: "معلم بحساب", user_id: tw.id, status: "active" }).select().single()).data!;
  const tN = (await admin.from("teachers").insert({ school_id: S, full_name: "معلم بلا حساب", status: "active" }).select().single()).data!;

  const list = ((await pr.c.from("teachers").select("id, user_id").eq("school_id", S)).data ?? []) as any[];
  const load = await pr.c.from("teacher_loads").insert({ school_id: S, teacher_id: tN.id, year_id: year.id, weekly_max: 20, daily_max: 5 });
  const una = await pr.c.from("teacher_unavailability").insert({ school_id: S, teacher_id: tN.id, kind: "day", day: 2, hard: true, reason: "اختبار" });
  check("1 teacher without a login is listed for loads and availability, and both can be saved", list.some((x) => x.id === tN.id && !x.user_id) && !load.error && !una.error, [load.error, una.error]);

  const pick = (u: any, purpose: string) => u.c.rpc("people_pick", { _purpose: purpose, _school: S, _org: null, _q: null, _role: null, _dept: null, _branch: null, _post: null, _ids: null, _limit: 200 });
  const pools = await Promise.all(["group", "meeting", "task", "duty", "direct"].map((p) => pick(pr, p)));
  const names = pools.map((r) => ((r.data ?? []) as any[]).map((x) => x.full_name));
  check("2 he never appears as a choosable chat member, invitee, task or duty assignee (only accounts can sign in)", pools.every((r) => !r.error) && names.every((n) => !n.includes("معلم بلا حساب")) && names[1]!.includes("مستخدم tw"), [pools.map((r) => r.error?.message), names]);
  const dir = ((await pr.c.rpc("staff_directory", { _school: S })).data ?? []) as any[];
  const aud = await admin.rpc("_circular_audience", { _school: S, _aud: { roles: ["teacher"] } });
  check("3 circular people list and teacher audience contain only the teacher with a login", !dir.some((x) => x.full_name === "معلم بلا حساب") && JSON.stringify(aud.data) === JSON.stringify([tw.id]), [dir.map((x) => x.full_name), aud.data]);

  // platform admin of no org: no org-wide staff names
  await admin.from("platform_admins").insert({ user_id: pa.id }); padmin = pa.id;
  const paDir = await pa.c.rpc("staff_directory", { _school: null, _org: org });
  const owDir = await owner.c.rpc("staff_directory", { _school: null, _org: org });
  check("4 org-wide staff names are for the org owner only (platform admin gets none)", ((paDir.data ?? []) as any[]).length === 0 && ((owDir.data ?? []) as any[]).length >= 2, [paDir.error, (owDir.data ?? []).length]);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  if (padmin) await admin.from("platform_admins").delete().eq("user_id", padmin);
  try { if (org) await tr.purgeOrg(org); for (const u of tr.users) await admin.auth.admin.deleteUser(u); } catch (e) { console.log("cleanup error", e); }
}
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
