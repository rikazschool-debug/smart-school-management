// Vice principal + attendance: no default access; owner grants view/actions separately per branch; individual grants survive the template change.
// Run: NODE_PATH=node_modules bun scripts/vice-att-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "vice-att-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `va-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const perms = async (c: any, s: string) => ((await c.rpc("perm_my_school", { _school: s })).data ?? {}) as Record<string, boolean>;
const today = new Date().toISOString().slice(0, 10);
try {
  const owner = await user("owner"), v1 = await user("vice1"), v2 = await user("vice2"), vsa = await user("vicesa"), prin = await user("prin");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة وكيل", _school_name: "فرع أ" }); orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert([
    { user_id: v1.id, org_id: org, school_id: A, role: "vice_principal" }, { user_id: v2.id, org_id: org, school_id: A, role: "vice_principal" },
    { user_id: v2.id, org_id: org, school_id: B, role: "vice_principal" },
    { user_id: vsa.id, org_id: org, school_id: A, role: "vice_principal" }, { user_id: vsa.id, org_id: org, school_id: A, role: "student_affairs" },
    { user_id: prin.id, org_id: org, school_id: A, role: "principal" }]);

  const p1 = await perms(v1.c, A);
  check("1 vice without grant: no attendance or gate action", !p1["attendance.view"] && !p1["attendance.record"] && !p1["attendance.approve"] && !p1["attendance.follow"] && !p1["gate.operate"], p1);
  const b1 = await v1.c.rpc("attendance_board", { _school: A, _date: today });
  check("2 vice without grant: direct server request returns nothing", !!b1.error || b1.data === null, b1.data);
  const pp = await perms(prin.c, A);
  check("3 principal keeps attendance by default", !!pp["attendance.approve"] && !!pp["gate.operate"], pp);
  const ps = await perms(vsa.c, A);
  check("4 vice who is also student affairs keeps that role's gate access", !!ps["gate.operate"], ps);

  const tpl = ((await owner.c.rpc("perm_roles_list", { _org: org })).data as any[]).find((r) => r.name === "وكيل");
  const tg = (tpl?.grants ?? []).map((g: any) => g.section);
  check("5 vice template in the permissions tree has no attendance/gate", !tg.includes("attendance") && !tg.includes("gate"), tg);

  const g = await owner.c.rpc("perm_override_set", { _org: org, _user: v2.id, _section: "attendance", _action: "view", _effect: "grant", _scope: "branch", _reason: "عرض فقط" });
  check("6 owner grants view only", !g.error, g.error?.message);
  const p2 = await perms(v2.c, A);
  check("7 view-only vice: view yes, record/approve/gate no", !!p2["attendance.view"] && !p2["attendance.record"] && !p2["attendance.approve"] && !p2["gate.operate"], p2);
  const b2 = await v2.c.rpc("attendance_board", { _school: A, _date: today });
  check("8 view-only vice reads the board by direct request", !b2.error && b2.data !== null, b2.error?.message);
  const self = await v1.c.rpc("perm_override_set", { _org: org, _user: v1.id, _section: "attendance", _action: "view", _effect: "grant", _scope: "org", _reason: "ذاتي" });
  check("9 vice cannot self-grant", !!self.error);
  const ovr = await admin.from("perm_overrides").select("*").eq("user_id", v2.id).eq("section", "attendance"); if (ovr.error) console.log(ovr.error.message); const ov = ovr.data ?? [];
  const rec = await v2.c.rpc("manual_attendance", { _student: "00000000-0000-0000-0000-000000000000", _status: "arrived", _reason: "تجربة" });
  check("10a view-only vice cannot record by direct request", !!rec.error);
  check("10 explicit individual grant kept after default removal", ov.length === 1, ov.length);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  for (const o of orgs) {
    await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_overrides").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o).catch(() => {});
  }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
