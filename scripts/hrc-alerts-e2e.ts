// HR contract expiry alerts: 60/30/7 days + expired, recipients = draft/approve holders of that branch + owner,
// never view-only or the employee, one notice per stage, renewal stops alerts, platform switch stops alerts.
// Run: NODE_PATH=node_modules bun scripts/hrc-alerts-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrca");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 300)); };
async function user(tag: string) {
  const email = `hrca-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const riyadh = () => new Date(Date.now() + 3 * 3600e3);
const day = (n: number) => { const d = riyadh(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const orgs: string[] = [];
try {
  const owner = await user("owner"), drafter = await user("draft"), approver = await user("appr"), viewer = await user("view"), emp = await user("emp"), drB = await user("drb");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة تنبيهات عقود", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  for (const [u, s] of [[drafter, A], [approver, A], [viewer, A], [emp, A], [drB, B]] as any)
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: "teacher" });
  const grant = (u: any, action: string, scope: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: "hr_contracts", _action: action, _effect: "grant", _scope: scope, _reason: "اختبار" });
  await grant(drafter, "view", "branch"); await grant(drafter, "draft", "branch");
  await grant(approver, "view", "org"); await grant(approver, "approve", "org");
  await grant(viewer, "view", "branch");
  await grant(drB, "view", "branch"); await grant(drB, "draft", "branch");
  const E = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "موظفة العقد", school_id: A, user_id: emp.id } })).data;
  const p = { employee_id: E, school_id: A, kind: "fixed", job_title: "معلمة", start_date: day(-300), end_date: day(400) };
  const C = (await drafter.c.rpc("hr_contract_save", { _org: org, _id: null, _p: p })).data;
  await approver.c.rpc("hr_contract_issue", { _id: C, _version: 1 });
  const ac = await emp.c.rpc("hr_contract_ack", { _id: C, _version: 1, _decision: "accept" }); check("contract active", !ac.error, ac.error);

  const notes = async (u: { id: string }) => (await admin.from("notifications").select("dedupe_key,link").eq("user_id", u.id).like("dedupe_key", `hrc-exp:${C}:%`)).data!;
  const tick = async () => { const r = await admin.rpc("hr_contract_alerts_tick"); if (r.error) throw r.error; return r.data; };
  const setEnd = (d: string) => admin.from("hr_contracts").update({ end_date: d }).eq("id", C);

  await tick();
  check("far end date: no alert", (await notes(drafter)).length === 0, await notes(drafter));
  await setEnd(day(45)); await tick(); await tick();
  const d1 = await notes(drafter);
  check("60-day alert once for branch drafter", d1.length === 1 && d1[0].dedupe_key.endsWith(":d60") && d1[0].link === `/app/hr/contracts?c=${C}`, d1);
  check("org approver and owner alerted", (await notes(approver)).length === 1 && (await notes(owner)).length === 1, null);
  check("view-only user and the employee are not alerted", (await notes(viewer)).length === 0 && (await notes(emp)).length === 0, null);
  check("other branch drafter not alerted", (await notes(drB)).length === 0, await notes(drB));
  await setEnd(day(20)); await tick();
  await setEnd(day(5)); await tick();
  const st = (await notes(drafter)).map((x) => x.dedupe_key.split(":").pop());
  check("30 and 7 day stages each sent once", ["d60", "d30", "d7"].every((s) => st.filter((x) => x === s).length === 1) && st.length === 3, st);
  const anon = await drafter.c.rpc("hr_contract_alerts_tick"); check("users cannot run the job", !!anon.error, anon);
  await setEnd(day(-1)); await tick(); await tick();
  check("expired notice once", (await notes(drafter)).filter((x) => x.dedupe_key.endsWith(":expired")).length === 1, await notes(drafter));

  // renewal pending → no further alerts for a new end date
  await setEnd(day(25));
  const rn = await drafter.c.rpc("hr_contract_save", { _org: org, _id: null, _p: { ...p, start_date: day(26), end_date: day(400), parent_id: C } });
  const rnRow = rn.data ? (await admin.from("hr_contracts").select("parent_id").eq("id", rn.data).single()).data : null;
  if (rnRow?.parent_id !== C && rn.data) await admin.from("hr_contracts").update({ parent_id: C }).eq("id", rn.data);
  const before = (await notes(drafter)).length; await tick();
  check("renewal draft stops alerts", !rn.error && (await notes(drafter)).length === before, rn.error ?? (await notes(drafter)));

  await admin.from("hr_contracts").update({ status: "cancelled" }).eq("id", rn.data);
  await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false }, { onConflict: "org_id,section" });
  await tick();
  check("HR switched off: no alerts", (await notes(drafter)).length === before, await notes(drafter));
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
