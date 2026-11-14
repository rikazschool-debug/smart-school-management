// Owner hub over a 4-school org (needs hub4-fixture setup): org-wide circular to all four schools, circular to two
// same-named groups in two branches, single-school notice, two-school meeting with category + picked people,
// principal and other-org owner refused. Run: NODE_PATH=node_modules bun scripts/hub4-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/h4/fixture.json", "utf8"));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: f[k], password: f.pw }); if (s.error) throw s.error; return c; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const [S1, S2, S3, S4] = f.schools; const id = f.ids; const org = f.org;
const owner = await as("owner"), p1 = await as("p1"), other = await as("other");
const rcp = async (c: string) => new Set(((await admin.from("circular_recipients").select("user_id, school_id").eq("circular_id", c)).data ?? []).map((r) => r.user_id));

// 1. org-wide circular to teachers of all four schools; saved with S4 as home (last visited school must not narrow)
const T1title = "تعميم المدارس الأربع " + Date.now();
const aud = { roles: ["teacher"], departments: [], groups: [], users: [] };
const pv = await owner.rpc("preview_circular_audience", { _school: S4, _aud: aud, _scope: "org", _schools: null });
const inc = ((pv.data ?? []) as any[]).filter((r) => r.included);
check("1 preview covers 4 schools", new Set(inc.map((r) => r.school_id)).size === 4 && inc.length === 6, [pv.error, inc.length]);
const c1 = await owner.rpc("save_circular", { _id: null, _school: S4, _title: T1title, _body: "نص", _publisher: null, _priority: "normal", _requires_ack: false, _ack_due: null, _aud: aud, _scope: "org", _schools: null });
const pb1 = await owner.rpc("publish_circular", { _id: c1.data });
const r1 = await rcp(c1.data as string);
check("2 published to a sample teacher in each school", ["t1", "t2", "t3", "t4"].every((k) => r1.has(id[k])), [c1.error, pb1.error, r1.size]);
check("3 non-teachers excluded (guardian, admin staff)", !r1.has(id.g1) && !r1.has(id.a1));
check("4 one operation logged as one circular", ((await admin.from("circulars").select("id", { count: "exact", head: true }).eq("org_id", org).eq("title", T1title)).count) === 1);

// 2. two same-titled groups from two branches
const aud2 = { roles: [], departments: [], groups: f.groups, users: [id.t1] }; // t1 also in group 1 → counted once
const c2 = await owner.rpc("save_circular", { _id: null, _school: S1, _title: "تعميم لجنتي الأنشطة", _body: "نص", _publisher: null, _priority: "normal", _requires_ack: false, _ack_due: null, _aud: aud2, _scope: "branches", _schools: [S1, S2] });
const pb2 = await owner.rpc("publish_circular", { _id: c2.data });
const r2 = await rcp(c2.data as string);
check("5 both groups' members receive it", ["t1", "a1", "t2", "a2"].every((k) => r2.has(id[k])), [c2.error, pb2.error, [...r2]]);
check("6 non-members of the groups excluded", !r2.has(id.x1) && !r2.has(id.x2) && !r2.has(id.t3) && r2.size === 4);
const n2 = (await admin.from("circular_recipients").select("user_id").eq("circular_id", c2.data).eq("user_id", id.t1)).data?.length;
check("7 person matching group + picked counted once", n2 === 1);

// 3. notice for one school
const T = { schools: [S1], categories: ["teacher"], departments: [], mode: "all", users: [] };
const np = (await owner.rpc("bc_preview", { _org: org, _t: T })).data as any;
check("8 notice preview one school = 2 teachers", np?.count === 2, np);
const nd = (await owner.rpc("bc_save", { _org: org, _id: null, _p: { title: "إشعار مدرسة واحدة", body: "نص الإشعار", target: T }, _client: crypto.randomUUID() })).data as any;
const ns = await owner.rpc("bc_send", { _id: nd.id, _rev: nd.rev, _fingerprint: np.fingerprint });
check("9 notice sent once to S1 teachers only", !ns.error && (ns.data as any)?.count === 2, ns.error);

// 4. meeting for two schools: whole category + a picked person
const mp = await owner.rpc("adm_meeting_audience_preview", { _school: S1, _scope: "org", _t: { mode: "all", schools: [S1, S2], categories: ["teacher"] }, _picks: [id.a1, id.t1] });
check("10 meeting preview: 4 teachers + 1 picked admin (picked teacher once) = 5", (mp.data as any)?.count === 5, [mp.error, mp.data]);
const soon = new Date(Date.now() + 864e5).toISOString();
const ms = await owner.rpc("adm_meeting_save", { _id: null, _school: S1, _d: { title: "اجتماع مدرستين", starts_at: soon, duration_min: 30, mode: "virtual", privacy: "normal", scope: "org", members: [id.a1] }, _rev: null, _client: null });
const M = (ms.data as any)?.id;
const sa = await owner.rpc("adm_meeting_set_audience", { _id: M, _rev: (ms.data as any)?.rev, _t: { mode: "all", schools: [S1, S2], categories: ["teacher"] } });
const sd = await owner.rpc("adm_meeting_send", { _id: M, _rev: (ms.data as any)?.rev });
const mm = (await admin.from("adm_meeting_members").select("user_id").eq("meeting_id", M)).data ?? [];
const mids = new Set(mm.map((r) => r.user_id));
check("11 meeting invites S1+S2 teachers and picked admin, nobody from S3", ["t1", "t2", "x1", "x2", "a1"].every((k) => mids.has(id[k])) && !mids.has(id.t3) && !sd.error, [ms.error, sa.error, sd.error, mm.length]);

// 5. refusals
const pr = await p1.rpc("save_circular", { _id: null, _school: S1, _title: "تجاوز", _body: "x", _publisher: null, _priority: "normal", _requires_ack: false, _ack_due: null, _aud: aud, _scope: "org", _schools: null });
check("12 principal cannot publish org-wide", !!pr.error);
const pr2 = await p1.rpc("preview_circular_audience", { _school: S2, _aud: aud, _scope: "school", _schools: null });
check("13 principal cannot target another school", !!pr2.error);
const pr3 = await p1.rpc("bc_preview", { _org: org, _t: { ...T, schools: [S2] } });
check("14 principal without hub permission cannot send notices to another school", !!pr3.error || ((pr3.data as any)?.count ?? 0) === 0, pr3.data);
const o1 = await other.rpc("save_circular", { _id: null, _school: S1, _title: "اختراق", _body: "x", _publisher: null, _priority: "normal", _requires_ack: false, _ack_due: null, _aud: aud, _scope: "org", _schools: null });
check("15 other-org owner refused (circular)", !!o1.error);
const o2 = await other.rpc("bc_preview", { _org: org, _t: T });
check("16 other-org owner refused (notice)", !!o2.error);
const o3 = await other.rpc("adm_meeting_audience_preview", { _school: S1, _scope: "org", _t: { mode: "all", schools: [S1], categories: ["teacher"] }, _picks: [] });
check("17 other-org owner refused (meeting)", !!o3.error);
const o4 = await owner.rpc("save_circular", { _id: null, _school: S1, _title: "فرع خارجي", _body: "x", _publisher: null, _priority: "normal", _requires_ack: false, _ack_due: null, _aud: aud, _scope: "branches", _schools: [S1, f.schools[4]] });
check("18 owner cannot add a branch of another org", !!o4.error);
const gx = (await other.from("conversations").select("id").in("id", f.groups)).data ?? [];
check("19 other-org owner cannot see this org's groups", gx.length === 0);
console.log(`\n${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
