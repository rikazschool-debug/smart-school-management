// HR P5 location punch + asset custody: school site settings, distance/accuracy/freshness/assignment checks on the server,
// asset hand/ack/transfer/return/loss, one open custody per asset, own-only views, principal has no default HR access.
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/hr-loc-assets-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hla");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hla-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
// metres → degrees latitude
const dLat = (m: number) => m / 111195;
const orgs: string[] = [];
try {
  const owner = await user("owner"), mgr = await user("mgr"), e1 = await user("e1"), e2 = await user("e2"), pr = await user("pr"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة موقع", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const u of [mgr, e1, e2]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: A, role: "teacher" });
  await admin.from("memberships").insert({ user_id: pr.id, org_id: org, school_id: A, role: "principal" });
  const emp = async (u: any, no: string, name: string, school: string) => {
    const id = (await admin.from("hr_employees").insert({ org_id: org, employee_no: no, user_id: u.id, full_name: name }).select("id").single()).data!.id;
    await admin.from("hr_assignments").insert({ org_id: org, employee_id: id, school_id: school, start_date: "2026-01-01", is_primary: true }); await owner.c.rpc("hr_self_access_set", { _emp: id, _active: true }); return id;
  };
  const E1 = await emp(e1, "L1", "موظفة أولى", A), E2 = await emp(e2, "L2", "موظفة ثانية", A);
  const PR = await emp(pr, "L3", "مديرة المدرسة", A);

  // principal: no default HR access, own file only
  const prList = await pr.c.rpc("hr_employee_list", { _org: org });
  check("principal sees no employee files by default", !prList.error && (prList.data as any[]).length === 0, prList);
  const prMine = await pr.c.rpc("hr_my_employment", { _org: org });
  check("principal still sees own employee file", !prMine.error && !!prMine.data, prMine.error);

  // site settings
  const LAT = 24.7136, LNG = 46.6753;
  const noPerm = await mgr.c.rpc("hr_att_site_save", { _school: A, _lat: LAT, _lng: LNG, _radius: 100, _accuracy: 30 }); check("site settings need owner/delegate", has(noPerm, "غير مصرح"), noPerm.error);
  const badR = await owner.c.rpc("hr_att_site_save", { _school: A, _lat: LAT, _lng: LNG, _radius: 5, _accuracy: 30 }); check("radius bounds validated", has(badR, "النطاق"), badR.error);
  await owner.c.rpc("hr_att_settings_save", { _org: org, _self: true });
  const P = (u: any, k: string, o: Partial<Record<string, unknown>> = {}) => u.c.rpc("hr_att_self_punch", { _org: org, _key: k + run, _school: A, _lat: LAT, _lng: LNG, _accuracy: 10, _read_at: new Date().toISOString(), ...o });
  const unset = await P(e1, "u"); check("school without approved site refuses mobile punch", has(unset, "لم يُضبط موقع"), unset.error);
  const s1 = await owner.c.rpc("hr_att_site_save", { _school: A, _lat: LAT, _lng: LNG, _radius: 100, _accuracy: 30 }); check("owner saves school site", !s1.error, s1.error);
  const sl = (await owner.c.rpc("hr_att_sites_list", { _org: org })).data as any[]; check("sites list: A set, B unset", sl.find((x) => x.school_id === A)?.radius_m === 100 && sl.find((x) => x.school_id === B)?.lat === null, sl);

  // punches
  const inR = await P(e1, "in"); check("check-in inside range recorded with distance", !inR.error && inR.data.duplicate === false && inR.data.distance_m < 5, inR);
  const edge = await P(e1, "edge", { _lat: LAT + dLat(95) }); check("check-out at the boundary (95 m of 100) recorded", !edge.error && edge.data.distance_m <= 100, edge);
  const out = await P(e1, "out", { _lat: LAT + dLat(140) }); check("outside range refused with distance", has(out, "خارج نطاق"), out.error);
  const acc = await P(e1, "acc", { _accuracy: 80 }); check("weak accuracy refused", has(acc, "دقة الموقع"), acc.error);
  const old = await P(e1, "old", { _read_at: new Date(Date.now() - 5 * 60e3).toISOString() }); check("stale reading refused", has(old, "قديمة"), old.error);
  const fut = await P(e1, "fut", { _read_at: new Date(Date.now() + 5 * 60e3).toISOString() }); check("future reading refused", has(fut, "قديمة"), fut.error);
  const denied = await P(e1, "den", { _lat: null, _lng: null, _accuracy: null }); check("no location (permission denied) refused", has(denied, "تعذّر الحصول على موقعك"), denied.error);
  const other = await P(e1, "oth", { _school: B }); check("punch for an unassigned school refused", has(other, "لست معيّنًا"), other.error);
  const dup = await P(e1, "in"); check("same key not recorded twice", dup.data?.duplicate === true, dup);
  const pun = (await admin.from("hr_att_punches").select("school_id,distance_m,accuracy_m").eq("employee_id", E1).eq("source", "mobile")).data!;
  check("only accepted punches stored, with school/distance/accuracy (no coordinates)", pun.length === 2 && pun.every((p: any) => p.school_id === A && p.accuracy_m === 10) && !("lat" in pun[0]!), pun);
  const strangerP = await stranger.c.rpc("hr_att_self_punch", { _org: org, _key: "s", _school: A, _lat: LAT, _lng: LNG, _accuracy: 5, _read_at: new Date().toISOString() }); check("non-employee refused", has(strangerP, "غير مصرح"), strangerP.error);
  const my = (await e1.c.rpc("hr_att_my", { _org: org, _from: "2026-11-01", _to: "2026-11-01" })).data; check("employee sees allowed punch schools", my.punch_schools.length === 1 && my.punch_schools[0].id === A && my.punch_schools[0].configured, my.punch_schools);

  // assets
  const ga = (a: string) => owner.c.rpc("perm_override_set", { _org: org, _user: mgr.id, _section: "hr_assets", _action: a, _effect: "grant", _scope: "branch", _reason: "اختبار" });
  const x0 = await mgr.c.rpc("hr_asset_save", { _org: org, _id: null, _school: A, _name: "حاسب", _category: "device", _serial: "SN-" + run, _notes: null }); check("no manage permission → refused", has(x0, "غير مصرح"), x0.error);
  await ga("view"); await ga("manage");
  const AS = (await mgr.c.rpc("hr_asset_save", { _org: org, _id: null, _school: A, _name: "حاسب محمول", _category: "device", _serial: "SN-" + run, _notes: null })).data;
  check("manager adds asset", !!AS);
  const dupS = await mgr.c.rpc("hr_asset_save", { _org: org, _id: null, _school: A, _name: "آخر", _category: "device", _serial: "sn-" + run, _notes: null }); check("duplicate serial refused", has(dupS, "الرقم التسلسلي"), dupS.error);
  const otherB = await mgr.c.rpc("hr_asset_save", { _org: org, _id: null, _school: B, _name: "مفتاح", _category: "key", _serial: null, _notes: null }); check("branch scope: no add in another branch", has(otherB, "غير مصرح"), otherB.error);
  const noCond = await mgr.c.rpc("hr_asset_hand", { _asset: AS, _emp: E1, _condition: "" }); check("handover needs condition", has(noCond, "حالة الصنف"), noCond.error);
  const C1 = (await mgr.c.rpc("hr_asset_hand", { _asset: AS, _emp: E1, _condition: "جديد بالكرتون" })).data; check("handed to employee 1", !!C1);
  const twice = await mgr.c.rpc("hr_asset_hand", { _asset: AS, _emp: E2, _condition: "جيد" }); check("second active custody for same asset refused", has(twice, "عهدة أخرى"), twice.error);
  const n = (await admin.from("notifications").select("id").eq("user_id", e1.id).eq("dedupe_key", "asset:" + C1)).data!; check("employee notified once", n.length === 1, n);
  const otherAck = await e2.c.rpc("hr_asset_ack", { _custody: C1 }); check("another employee cannot acknowledge", has(otherAck, "غير مصرح"), otherAck.error);
  const ack = await e1.c.rpc("hr_asset_ack", { _custody: C1 }); check("employee acknowledges own custody", !ack.error, ack.error);
  const m1 = (await e1.c.rpc("hr_asset_my", { _org: org })).data as any[], m2 = (await e2.c.rpc("hr_asset_my", { _org: org })).data as any[];
  check("employee sees only own custody", m1.length === 1 && !!m1[0].ack_at && m2.length === 0, [m1, m2]);
  const e2list = await e2.c.rpc("hr_asset_list", { _org: org }); check("employee without permission sees no register", (e2list.data as any[]).length === 0, e2list);
  const open = (await owner.c.rpc("hr_asset_emp_open", { _emp: E1 })).data as any[]; check("open custody shown in employee file (end of service)", open.length === 1 && open[0].asset === "حاسب محمول", open);
  const selfClose = await e1.c.rpc("hr_asset_close", { _custody: C1, _outcome: "returned", _condition: "جيد", _note: null }); check("employee cannot close own custody", has(selfClose, "غير مصرح"), selfClose.error);
  const tr2 = (await mgr.c.rpc("hr_asset_close", { _custody: C1, _outcome: "transferred", _condition: "جيد", _note: "نقل", _to_emp: E2 })).data; check("transfer opens custody for employee 2", !!tr2);
  const m2b = (await e2.c.rpc("hr_asset_my", { _org: org })).data as any[], m1b = (await e1.c.rpc("hr_asset_my", { _org: org })).data as any[];
  check("history: e1 closed as transferred, e2 open", m1b[0].outcome === "transferred" && m2b.length === 1 && !m2b[0].closed_at, [m1b, m2b]);
  const lostNo = await mgr.c.rpc("hr_asset_close", { _custody: tr2, _outcome: "lost", _condition: null, _note: "" }); check("loss needs description", has(lostNo, "وصف"), lostNo.error);
  const ret = await mgr.c.rpc("hr_asset_close", { _custody: tr2, _outcome: "returned", _condition: "خدش بسيط", _note: null }); check("return closes custody", !ret.error, ret.error);
  const again = await mgr.c.rpc("hr_asset_close", { _custody: tr2, _outcome: "returned", _condition: "x", _note: null }); check("closed custody cannot close again", has(again, "مغلقة"), again.error);
  const lst = (await mgr.c.rpc("hr_asset_list", { _org: org })).data as any[]; check("asset available again with 2-entry history", lst[0].status === "available" && lst[0].history.length === 2 && lst[0].open === null, lst[0]);
  const C3 = (await mgr.c.rpc("hr_asset_hand", { _asset: AS, _emp: E1, _condition: "خدش بسيط" })).data;
  const lost = await mgr.c.rpc("hr_asset_close", { _custody: C3, _outcome: "lost", _condition: null, _note: "فُقد في رحلة" }); check("loss documented", !lost.error, lost.error);
  const st = (await mgr.c.rpc("hr_asset_list", { _org: org })).data as any[]; check("lost asset cannot be handed", st[0].status === "lost" && has(await mgr.c.rpc("hr_asset_hand", { _asset: AS, _emp: E2, _condition: "x" }), "غير متاح"), st[0].status);
  const money = (await admin.from("hr_decisions").select("id").eq("org_id", org)).data!; check("loss creates no financial decision automatically", money.length === 0, money);
  const xorg = await stranger.c.rpc("hr_asset_list", { _org: org }); check("other org sees nothing", (xorg.data as any[]).length === 0, xorg);
  const ev = (await admin.from("hr_events").select("action").eq("org_id", org).eq("entity", "asset_custody")).data!.map((x: any) => x.action);
  check("custody actions logged", ["hand", "ack", "transferred", "returned", "lost"].every((a) => ev.includes(a)), ev);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
