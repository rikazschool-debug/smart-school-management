import "./lib/user-pool.ts";
// Security fixes (Nov 24 2026): internal role/staff helpers not callable, duty settings still readable by staff,
// invitee with a deactivated membership loses meeting access. Run: NODE_PATH=node_modules bun scripts/security-fixes-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "security-fixes-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sfx-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), t = await user("t"), inv = await user("inv"), stu = await user("stu");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الأمان", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  for (const [u, r] of [[t, "teacher"], [inv, "teacher"], [stu, "student"]] as const) { const x = await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r }); if (x.error) throw x.error; }

  const a = await t.c.rpc("_adm_staff" as never, { _school: S, _user: inv.id } as never);
  check("_adm_staff not callable by signed-in users", !!a.error, a.data);
  const g1 = await t.c.rpc("_cg_generic_label" as never, { _conv: S, _user: stu.id } as never);
  check("_cg_generic_label not callable", !!g1.error, g1.data);
  const g2 = await t.c.rpc("_cg_generic_label2" as never, { _conv: S, _user: stu.id } as never);
  check("_cg_generic_label2 not callable", !!g2.error, g2.data);

  const ds = await admin.from("adm_duty_settings").upsert({ school_id: S }).select(); if (ds.error) console.log("duty settings seed", ds.error.message);
  const seen = await t.c.from("adm_duty_settings").select("school_id").eq("school_id", S);
  check("active staff still reads duty settings", !seen.error && (seen.data ?? []).length === (ds.data ?? []).length && (ds.data ?? []).length > 0, seen);
  const notSeen = await stu.c.from("adm_duty_settings").select("school_id").eq("school_id", S);
  check("student does not read duty settings", !notSeen.error && (notSeen.data ?? []).length === 0, notSeen);

  const m = await admin.from("adm_meetings").insert({ org_id: org, school_id: S, scope: "school", title: "اجتماع سري", organizer: owner.id, status: "scheduled", privacy: "restricted", starts_at: new Date(Date.now() + 864e5).toISOString() }).select().single();
  if (m.error) throw new Error("meeting seed: " + m.error.message);
  await admin.from("adm_meeting_members").insert({ meeting_id: m.data.id, user_id: inv.id, school_id: S });
  const before = await inv.c.rpc("adm_can_read_meeting", { _id: m.data.id });
  check("active invitee reads the meeting", before.data === true, before);
  await admin.from("memberships").update({ is_active: false }).eq("user_id", inv.id).eq("school_id", S);
  const after = await inv.c.rpc("adm_can_read_meeting", { _id: m.data.id });
  check("deactivated invitee no longer reads the meeting", after.data === false, after);
} catch (e) { check("exception", false, String(e)); }
finally {
  try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok"); } catch (e) { console.log("cleanup failed", e); }
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
