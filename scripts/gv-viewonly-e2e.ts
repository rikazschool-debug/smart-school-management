// Guardian visits: role templates vs approved permissions + view-only holder (needs gv-fixture setup).
// Templates: principal/vice hold view/manage/settings/reception, security reception only, all branch scope.
// A staff member granted only guardian_visits.view in S1 reads S1 visits but cannot act, change settings or open S2.
// Run: NODE_PATH=node_modules bun scripts/gv-fixture.ts && NODE_PATH=node_modules bun scripts/gv-viewonly-e2e.ts; then gv-fixture.ts teardown
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/gv/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: f[k], password: f.pw }); if (s.error) throw s.error; return c; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const [S1, S2] = f.schools; const id = f.ids; const K = f.kids;
const tmr = new Date(Date.now() + 27 * 3600e3).toISOString().slice(0, 10);
const [owner, p1, h1, g2] = await Promise.all(["owner", "p1", "h1", "g2"].map(as));
const rev = async (v: string) => (await admin.from("gv_visits").select("rev").eq("id", v).single()).data!.rev as number;

// 1) ready-made templates match the approved matrix
const { data: tg } = await admin.from("perm_role_grants").select("section, action, scope, perm_roles!inner(key, org_id)").in("section", ["guardian_visits", "support"]).is("perm_roles.org_id", null);
const set = (k: string, s: string) => new Set((tg ?? []).filter((r: any) => r.perm_roles.key === k && r.section === s).map((r: any) => r.action));
const eq = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
check("1 principal template: visits view/manage/settings/reception", eq(set("base_principal", "guardian_visits"), ["view", "manage", "settings", "reception"]), [...set("base_principal", "guardian_visits")]);
check("2 vice template: visits view/manage/settings/reception", eq(set("base_vice", "guardian_visits"), ["view", "manage", "settings", "reception"]), [...set("base_vice", "guardian_visits")]);
check("3 security template: reception only", eq(set("base_security", "guardian_visits"), ["reception"]), [...set("base_security", "guardian_visits")]);
check("4 principal support template: no transfer / settings", eq(set("base_principal", "support"), ["view", "create", "assign", "status", "follow", "followers", "export"]), [...set("base_principal", "support")]);
check("5 every template grant is branch-scoped", (tg ?? []).every((r: any) => r.scope === "branch"), tg?.filter((r: any) => r.scope !== "branch"));

// 2) view-only holder
await p1.rpc("gv_settings_save", { _school: S1, _p: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start_time: "07:00", end_time: "13:00", slot_minutes: 20 } });
const V = (await g2.rpc("gv_create", { _p: { source: "guardian", student_id: K.k3, reason_cat: "behavior", details: "زيارة اختبار العرض", slot_date: tmr, slot_time: "09:40" } })).data as string;
check("6 before grant the teacher cannot list school visits", !!(await h1.rpc("gv_list", { _school: S1, _view: "school" })).error);
const gr = await owner.rpc("perm_override_set", { _org: f.org, _user: id.h1, _section: "guardian_visits", _action: "view", _effect: "grant", _scope: "branch", _reason: "اختبار عرض فقط" });
check("7 owner grants view only (branch S1)", !gr.error, gr.error);
const l = await h1.rpc("gv_list", { _school: S1, _view: "school" });
check("8 view-only lists S1 visits", !l.error && ((l.data ?? []) as any[]).some((x) => x.id === V), l.error);
check("9 view-only cannot confirm", !!(await h1.rpc("gv_act", { _id: V, _action: "confirm", _rev: await rev(V), _p: {} })).error);
check("10 view-only cannot decline", !!(await h1.rpc("gv_act", { _id: V, _action: "decline", _rev: await rev(V), _p: { reason: "x" } })).error);
check("11 view-only cannot change settings", !!(await h1.rpc("gv_settings_save", { _school: S1, _p: { days: [0], start_time: "07:00", end_time: "08:00", slot_minutes: 20 } })).error);
check("12 view-only cannot open the other school", !!(await h1.rpc("gv_list", { _school: S2, _view: "school" })).error);
check("13 view-only cannot create a school call", !!(await h1.rpc("gv_create", { _p: { source: "school", student_id: K.k3, reason_cat: "behavior", details: "استدعاء", slot_date: tmr, slot_time: "10:00" } })).error);
const clr = await owner.rpc("perm_override_set", { _org: f.org, _user: id.h1, _section: "guardian_visits", _action: "view", _effect: null as never, _scope: null as never, _reason: "إنهاء الاختبار" });
const after = await h1.rpc("gv_list", { _school: S1, _view: "school" });
check("14 removing the grant cuts access at the next request", !clr.error && !!after.error, { clr: clr.error, rows: (after.data as any[] | null)?.length });

await admin.from("gv_visits").delete().eq("id", V);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
