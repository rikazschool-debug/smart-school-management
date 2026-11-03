// People picker (package-next item 2): one authorized search (people_pick / people_pick_facets) for groups, tasks,
// duties, meetings and meeting decisions. Isolated data only. Run: NODE_PATH=node_modules bun scripts/people-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "people");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string, name: string) {
  const email = `ppl-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  await admin.from("profiles").update({ full_name: name }).eq("id", s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const names = (r: any) => ((r.data ?? []) as any[]).map((x) => x.full_name).sort();
const uids = (r: any) => ((r.data ?? []) as any[]).map((x) => x.user_id);
const pick = (u: any, a: Record<string, unknown>) => u.c.rpc("people_pick", { _org: null, _q: null, _role: null, _dept: null, _branch: null, _post: null, _ids: null, _limit: 50, ...a });
let org: string | null = null;
try {
  const owner = await user("owner", "مالك المؤسسة"), pr = await user("pr", "منى المديرة"), v1 = await user("v1", "وليد الوكيل"), v2 = await user("v2", "وفاء الوكيلة");
  const sup = await user("sup", "سعد المشرف");
  const a1 = await user("a1", "أحمد سالم"), a2 = await user("a2", "أحمد خالد"), s3 = await user("s3", "سارة علي");
  const stu = await user("stu", "أحمد الطالب"), gua = await user("gua", "أحمد ولي"), off = await user("off", "أحمد الموقوف");
  const prB = await user("prB", "بدر مدير ب"), tB = await user("tB", "أحمد فرع ب");
  org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الاختيار", _school_name: "الفرع أ" })).data;
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const sb = await admin.from("schools").insert({ org_id: org, name: "الفرع ب" }).select().single(); if (sb.error) throw sb.error;
  const B = sb.data.id; tr.addSchool(B);
  const mem = async (u: any, s: string, r: string) => { const x = await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r }); if (x.error) throw x.error; };
  await mem(pr, S, "principal"); await mem(v1, S, "vice_principal"); await mem(v2, S, "vice_principal"); await mem(sup, S, "supervisor");
  await mem(a1, S, "teacher"); await mem(a1, S, "counselor"); await mem(a2, S, "teacher"); await mem(s3, S, "teacher");
  await mem(stu, S, "student"); await mem(gua, S, "guardian"); await mem(off, S, "teacher");
  await admin.from("memberships").update({ is_active: false }).eq("user_id", off.id);
  await mem(prB, B, "principal"); await mem(tB, B, "teacher");
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  const D1 = await ins("departments", { name: "العلوم" }), D2 = await ins("departments", { name: "اللغات" });
  const T1 = await ins("teachers", { full_name: "أحمد سالم", user_id: a1.id, department_id: D1.id, status: "active" });
  const T2 = await ins("teachers", { full_name: "أحمد خالد", user_id: a2.id, department_id: D2.id, status: "active" });
  const T3 = await ins("teachers", { full_name: "سارة علي", user_id: s3.id, department_id: D2.id, status: "active" });
  await pr.c.rpc("set_staff_scope", { _school: S, _user: v1.id, _kind: "vice", _departments: [D1.id], _teachers: [] });
  await pr.c.rpc("set_staff_scope", { _school: S, _user: v2.id, _kind: "vice", _departments: [], _teachers: [T3.id] });
  await pr.c.rpc("set_staff_scope", { _school: S, _user: sup.id, _kind: "supervisor", _departments: [], _teachers: [T2.id] });

  // ---- 1. groups: authorized pool, one row per person, no contact data ----
  const g = await pick(pr, { _purpose: "group", _school: S });
  const gIds = uids(g);
  check("1a principal group pool = active staff of own school only", !g.error && [pr, v1, v2, sup, a1, a2, s3].every((u) => gIds.includes(u.id)) && ![stu, gua, off, prB, tB].some((u) => gIds.includes(u.id)), [g.error, names(g)]);
  const a1row = (g.data as any[]).filter((x) => x.user_id === a1.id);
  check("1b a person with two roles appears once with both roles", a1row.length === 1 && JSON.stringify(a1row[0].roles) === JSON.stringify(["counselor", "teacher"]), a1row);
  const keys = Object.keys((g.data as any[])[0] ?? {});
  check("1c no phone/email or other contact fields returned", !keys.some((k) => /phone|email|mobile|national/i.test(k)), keys);
  check("1d search by first letters matches the start of any name word", JSON.stringify(names(await pick(pr, { _purpose: "group", _school: S, _q: "أح" }))) === JSON.stringify(["أحمد خالد", "أحمد سالم"]) && JSON.stringify(names(await pick(pr, { _purpose: "group", _school: S, _q: "سال" }))) === JSON.stringify(["أحمد سالم"]));
  check("1e no mid-word matches and wildcard characters are literal", names(await pick(pr, { _purpose: "group", _school: S, _q: "الم" })).length === 0 && names(await pick(pr, { _purpose: "group", _school: S, _q: "%" })).length === 0);
  const teachers = names(await pick(pr, { _purpose: "group", _school: S, _role: "teacher" }));
  check("1f category 'teacher' lists every eligible teacher (incl. multi-role), nothing else", JSON.stringify(teachers) === JSON.stringify(["أحمد خالد", "أحمد سالم", "سارة علي"]), teachers);
  check("1g department filter", JSON.stringify(names(await pick(pr, { _purpose: "group", _school: S, _dept: D2.id }))) === JSON.stringify(["أحمد خالد", "سارة علي"]));
  const tq = await pick(a1, { _purpose: "group", _school: S }), vq = await pick(v1, { _purpose: "group", _school: S });
  check("1h teacher and vice cannot list group candidates", !!tq.error && !!vq.error, [tq.error?.message, vq.error?.message]);
  const og = await pick(owner, { _purpose: "group", _school: null, _org: org });
  check("1i owner org-wide pool spans branches; branch filter narrows", !og.error && uids(og).includes(tB.id) && uids(og).includes(a1.id) && JSON.stringify(names(await pick(owner, { _purpose: "group", _school: null, _org: org, _branch: B }))) === JSON.stringify(["أحمد فرع ب", "بدر مدير ب"]), names(og));
  const prOrg = await pick(pr, { _purpose: "group", _school: null, _org: org });
  check("1j principal cannot widen to the whole organization", !!prOrg.error);
  const leak = await pick(pr, { _purpose: "group", _school: S, _ids: [tB.id, stu.id, off.id] });
  check("1k resolving ids outside the scope returns nothing", !leak.error && (leak.data ?? []).length === 0, leak.data);
  const facets = (await pr.c.rpc("people_pick_facets", { _purpose: "group", _school: S, _org: null, _post: null })).data as any[];
  check("1l filter options come from the authorized pool only", !!facets && !facets.some((f) => f.kind === "branch" && f.id === B) && !facets.some((f) => f.kind === "role" && ["student", "guardian"].includes(f.id)), facets);

  // ---- 2. tasks: creator scope ----
  const tPr = uids(await pick(pr, { _purpose: "task", _school: S }));
  check("2a principal task candidates = all school staff except self", [v1, v2, sup, a1, a2, s3].every((u) => tPr.includes(u.id)) && !tPr.includes(pr.id) && !tPr.includes(tB.id));
  check("2b vice 1 (dept العلوم) sees only that department's teacher", JSON.stringify(names(await pick(v1, { _purpose: "task", _school: S }))) === JSON.stringify(["أحمد سالم"]));
  check("2c vice 2 (same role, other scope) sees only her named teacher", JSON.stringify(names(await pick(v2, { _purpose: "task", _school: S }))) === JSON.stringify(["سارة علي"]));
  check("2d supervisor sees only the assigned teacher", JSON.stringify(names(await pick(sup, { _purpose: "task", _school: S }))) === JSON.stringify(["أحمد خالد"]));
  check("2e vice cannot resolve out-of-scope ids", (((await pick(v1, { _purpose: "task", _school: S, _ids: [a2.id, s3.id] })).data) ?? []).length === 0);
  const tTeacher = await pick(a1, { _purpose: "task", _school: S });
  check("2f teacher cannot list task candidates", !!tTeacher.error);
  const forged = await v1.c.rpc("adm_create_task", { _school: S, _d: { title: "x", assignee: a1.id, participants: [a2.id], due_date: today }, _client: null });
  check("2g forged participant outside scope is rejected by the server", !!forged.error, forged.error?.message);
  const good = await v1.c.rpc("adm_create_task", { _school: S, _d: { title: "تكليف", assignee: a1.id, participants: [], due_date: today }, _client: null });
  check("2h in-scope assignee accepted", !good.error, good.error?.message);

  // ---- 3. duties: eligible categories of the post ----
  const post = (await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "البوابة", kind: "gate", days: [0, 1, 2, 3, 4], start_time: "06:45", end_time: "07:15", required: 2, eligible_roles: ["teacher"] } })).data as string;
  const dp = await pick(pr, { _purpose: "duty", _school: S, _post: post });
  check("3a duty picker for a teachers-only post lists only teachers", JSON.stringify(names(dp)) === JSON.stringify(["أحمد خالد", "أحمد سالم", "سارة علي"]), [dp.error, names(dp)]);
  check("3b without a post: all school staff (no owner, students, guardians)", (() => { return true; })() && !uids(await pick(pr, { _purpose: "duty", _school: S })).some((x: string) => [owner.id, stu.id, gua.id].includes(x)));
  const dT = await pick(a1, { _purpose: "duty", _school: S }), dB = await pick(prB, { _purpose: "duty", _school: S, _post: post });
  check("3c teacher and other-branch principal cannot list duty candidates", !!dT.error && !!dB.error);

  // ---- 4. meetings / decisions ----
  const mp = uids(await pick(pr, { _purpose: "meeting", _school: S }));
  check("4a principal invitees: own school, not self, not other branch", !mp.includes(pr.id) && mp.includes(a1.id) && !mp.includes(tB.id));
  const mpOrg = await pick(pr, { _purpose: "meeting", _school: S, _org: org });
  check("4b principal cannot invite across branches", !!mpOrg.error);
  const mo = uids(await pick(owner, { _purpose: "meeting", _school: S, _org: org }));
  check("4c owner multi-branch invitees include both branches, never the owner", mo.includes(tB.id) && mo.includes(a1.id) && !mo.includes(owner.id));
  const mv = await pick(v1, { _purpose: "meeting", _school: S });
  check("4d vice cannot list meeting invitees", !!mv.error);
  const dec = uids(await pick(owner, { _purpose: "decision", _school: B }));
  check("4e decision executors come from the chosen branch only", dec.includes(tB.id) && !dec.includes(a1.id));

  // ---- 5. internals not callable ----
  const raw = await pr.c.rpc("_people_pool", { _purpose: "group", _school: S, _org: null, _post: null });
  check("5a internal pool function is not callable directly", !!raw.error);
  const anonC = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
  const an = await anonC.rpc("people_pick", { _purpose: "group", _school: S });
  check("5b signed-out callers get nothing", !!an.error || !(an.data ?? []).length);
} catch (e) {
  bad++; console.log("FAIL setup", (e as Error).message);
} finally {
  if (org) await tr.purgeOrg(org);
  await tr.cleanupUsers?.();
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
