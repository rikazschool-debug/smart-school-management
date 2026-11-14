// Whole-category meeting invitations + platform switch for the comm hub (comm_hub).
// Run: NODE_PATH=node_modules bun scripts/hub-aud-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hub-aud-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `hau-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const soon = new Date(Date.now() + 10 * 60e3).toISOString();
const orgs: string[] = []; let pa: string | null = null;
try {
  const owner = await user("owner"), plat = await user("plat"), g1 = await user("g1"), g2 = await user("g2"), gB = await user("gB"), tA = await user("tA"), tB = await user("tB"), sB = await user("sB"), other = await user("other"), gX = await user("gX");
  await admin.from("platform_admins").insert({ user_id: plat.id }); pa = plat.id;
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الدعوات", _school_name: "الفرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "الفرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(org2);
  const C = (await other.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(C);
  const mem = async (u: any, s: string, r: string, o = org) => { const x = await admin.from("memberships").insert({ user_id: u.id, org_id: o, school_id: s, role: r }); if (x.error) throw x.error; };
  await mem(g1, A, "guardian"); await mem(g1, B, "guardian"); await mem(g2, A, "guardian"); await mem(gB, B, "guardian"); await mem(gX, C, "guardian", org2);
  await mem(tA, A, "teacher"); await mem(tB, B, "teacher"); await mem(sB, B, "student_affairs");
  await admin.from("teachers").insert([{ school_id: A, full_name: "معلم أ", user_id: tA.id, status: "active" }, { school_id: B, full_name: "معلم ب", user_id: tB.id, status: "active" }]);
  // g1 has children in both branches; gB only in B; gX in another org
  const st = async (s: string, n: string) => (await admin.from("students").insert({ school_id: s, full_name: n, status: "active" }).select("id").single()).data!.id;
  const gd = async (s: string, u: string, n: string) => (await admin.from("guardians").insert({ school_id: s, user_id: u, full_name: n }).select("id").single()).data!.id;
  const a1 = await st(A, "ابن1"), a2 = await st(A, "ابن2"), b1 = await st(B, "ابن3"), b2 = await st(B, "ابن4"), c1 = await st(C, "ابن5");
  const G1 = await gd(A, g1.id, "ولية1"), G1b = await gd(B, g1.id, "ولية1"), G2 = await gd(A, g2.id, "ولي2"), GB = await gd(B, gB.id, "ولي3"), GX = await gd(C, gX.id, "ولي4");
  const sg = await admin.from("student_guardians").insert([
    { school_id: A, student_id: a1, guardian_id: G1, verified: true, relationship: "أم" }, { school_id: A, student_id: a2, guardian_id: G1, verified: true, relationship: "أم" },
    { school_id: B, student_id: b1, guardian_id: G1b, verified: true, relationship: "أم" }, { school_id: A, student_id: a2, guardian_id: G2, verified: true, relationship: "أب" },
    { school_id: B, student_id: b2, guardian_id: GB, verified: true, relationship: "أب" }, { school_id: C, student_id: c1, guardian_id: GX, verified: true, relationship: "أب" }]);
  if (sg.error) throw sg.error;

  const prev = (s: string, scope: string, t: any, picks: string[] = []) => owner.c.rpc("adm_meeting_audience_preview", { _school: s, _scope: scope, _t: t, _picks: picks });
  const p1 = await prev(A, "school", { mode: "all", categories: ["guardian"] });
  check("1 all guardians of branch A = 2 unique (g1 with two children counted once)", (p1.data as any)?.count === 2, [p1.error, p1.data]);
  const p2 = await prev(A, "org", { mode: "all", schools: [A, B], categories: ["guardian", "teacher"] });
  check("2 two categories from two branches = 5 unique (g1 in both branches once)", (p2.data as any)?.count === 5, [p2.error, (p2.data as any)?.count]);
  const p3 = await prev(A, "org", { mode: "all", schools: [A, C], categories: ["guardian"] });
  check("3 branch from another org refused", !!p3.error);
  const p4 = await prev(A, "school", { mode: "all", categories: ["student"] });
  check("4 students category refused for meetings", !!p4.error);
  const p5 = await prev(A, "org", { mode: "all", all_schools: true, categories: ["staff"] }, [tA.id]);
  check("5 all branches + staff + one picked teacher = 2", (p5.data as any)?.count === 2, p5.data);
  const p6 = await tA.c.rpc("adm_meeting_audience_preview", { _school: A, _scope: "school", _t: { mode: "all", categories: ["guardian"] }, _picks: [] });
  check("6 teacher without organize permission cannot preview", !!p6.error);

  const s1 = await owner.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { title: "اجتماع أولياء الأمور", starts_at: soon, duration_min: 30, mode: "virtual", privacy: "normal", scope: "org", members: [] }, _rev: null, _client: null });
  const M = (s1.data as any)?.id;
  const sa = await owner.c.rpc("adm_meeting_set_audience", { _id: M, _rev: (s1.data as any)?.rev, _t: { mode: "all", schools: [A, B], categories: ["guardian", "teacher"] } });
  check("7 stored audience materializes 5 members", (sa.data as any)?.count === 5 && ((await admin.from("adm_meeting_members").select("user_id").eq("meeting_id", M)).data?.length === 5), [s1.error, sa.error]);
  // list changes after the preview: a new guardian joins branch B
  const late = await user("late"); await mem(late, B, "guardian");
  const GL = await gd(B, late.id, "متأخر"); await admin.from("student_guardians").insert({ school_id: B, student_id: b2, guardian_id: GL, verified: true, relationship: "أم" });
  const sd0 = await owner.c.rpc("adm_meeting_send", { _id: M, _rev: (s1.data as any)?.rev });
  check("8 send refused when the list changed since the preview", !!sd0.error && /تغيّرت/.test(sd0.error.message), sd0.error);
  await owner.c.rpc("adm_meeting_set_audience", { _id: M, _rev: (s1.data as any)?.rev, _t: { mode: "all", schools: [A, B], categories: ["guardian", "teacher"] } });
  const sd1 = await owner.c.rpc("adm_meeting_send", { _id: M, _rev: (s1.data as any)?.rev });
  check("9 send after re-preview succeeds", !sd1.error, sd1.error);
  const inv = async (u: string) => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u).like("dedupe_key", `adm:meet:${M}:inv:%`)).count;
  check("10 g1 (two branches, two children) gets exactly one invitation", (await inv(g1.id)) === 1);
  check("11 other-org guardian not invited", (await inv(gX.id)) === 0);
  await owner.c.rpc("adm_live_start", { _id: M });
  const jg = await g1.c.rpc("adm_live_join", { _id: M, _kind: "join" });
  check("12 invited guardian joins the room as member", !jg.error && (jg.data as any)?.host === false, jg.error);
  const jx = await gX.c.rpc("adm_live_join", { _id: M, _kind: "join" });
  check("13 other-org guardian refused by direct link", !!jx.error);

  // platform switch
  const ns = await owner.c.rpc("platform_set_section", { _org: org, _section: "comm_hub", _enabled: false, _reason: "تجربة" });
  check("14 org owner cannot toggle the section", !!ns.error);
  const off = await plat.c.rpc("platform_set_section", { _org: org, _section: "comm_hub", _enabled: false, _reason: "تعليق تجريبي" });
  const secs = (await owner.c.rpc("org_sections_get", { _org: org })).data as any[];
  check("15 platform suspends the hub with a reason and it shows for the org", !off.error && secs.some((s) => s.section === "comm_hub" && s.enabled === false && s.reason === "تعليق تجريبي"), off.error);
  const bs = (await owner.c.rpc("bc_scope", { _org: org })).data as any;
  check("16 suspended: owner has no notice scope", bs && !bs.any, bs);
  const rn = await g1.c.rpc("adm_live_join", { _id: M, _kind: "renew" });
  const rh = await owner.c.rpc("adm_live_join", { _id: M, _kind: "renew" });
  check("17 suspended: open session token renewal refused for guardian and host", !!rn.error && !!rh.error);
  const nm = await owner.c.rpc("adm_meeting_save", { _id: null, _school: A, _d: { title: "x", starts_at: soon, duration_min: 30, mode: "virtual", scope: "org", members: [] }, _rev: null, _client: null });
  check("18 suspended: new org-wide meeting refused", !!nm.error);
  const kept = (await admin.from("adm_meeting_members").select("user_id", { count: "exact", head: true }).eq("meeting_id", M)).count;
  check("19 suspended: records preserved", (kept ?? 0) >= 6);
  const lg = (await plat.c.rpc("platform_section_log", { _org: org })).data as any[];
  check("20 audit log has the suspension", lg?.some((l) => l.section === "comm_hub" && l.after === false), lg);
  await plat.c.rpc("platform_set_section", { _org: org, _section: "comm_hub", _enabled: true, _reason: "إعادة تفعيل" });
  const bs2 = (await owner.c.rpc("bc_scope", { _org: org })).data as any;
  const rn2 = await g1.c.rpc("adm_live_join", { _id: M, _kind: "join" });
  check("21 re-enabled: notices scope and room access return", bs2?.any && !rn2.error, [bs2, rn2.error]);
  const o2 = (await other.c.rpc("org_sections_get", { _org: org }));
  check("22 another org cannot read this org's sections", !!o2.error);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try {
    if (pa) await admin.from("platform_admins").delete().eq("user_id", pa);
    for (const o of orgs) if (o) await admin.from("org_section_log").delete().eq("org_id", o);
    await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok");
  } catch (e) { console.log("cleanup error", e); }
  console.log(`\n${ok} passed, ${bad} failed`);
}
