// Support package 6 on the 4-school fixture (needs hub4-fixture setup): route by branch → department → person,
// department without assignee, branch-wide search, empty department, out-of-scope assignee refused, attachments at create
// (pending until uploaded, linked on create, type/size checked), department change logged, transfer clears department.
// Run: NODE_PATH=node_modules bun scripts/support6-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/h4/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: f[k], password: f.pw }); if (s.error) throw s.error; return c; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const [S1, S2] = f.schools; const id = f.ids;
const owner = await as("owner"), p1 = await as("p1"), t1 = await as("t1"), other = await as("other");
const rev = async (t: string) => (await admin.from("support_tickets").select("rev").eq("id", t).single()).data!.rev;

// departments: «الرياضيات» with t1 in S1, an empty one in S1, one in S2
for (const n of ["الرياضيات h4x", "قسم فارغ h4x", "العلوم h4x"]) await admin.from("departments").delete().eq("name", n).in("school_id", f.schools);
const mk = async (school: string, name: string) => (await admin.from("departments").insert({ school_id: school, name }).select("id").single()).data!.id as string;
const MATH = await mk(S1, "الرياضيات h4x"), EMPTY = await mk(S1, "قسم فارغ h4x"), D2 = await mk(S2, "العلوم h4x");
await admin.from("memberships").update({ department_id: MATH }).eq("user_id", id.t1).eq("school_id", S1);

const ds = await owner.rpc("support_route_departments", { _school: S1 });
const dl = (ds.data ?? []) as any[];
check("1 branch departments listed with eligible counts", !ds.error && dl.find((d) => d.id === MATH)?.eligible >= 1 && dl.find((d) => d.id === EMPTY)?.eligible === 0 && !dl.some((d) => d.id === D2), ds.error ?? dl);
const mc = ((await owner.rpc("support_route_candidates", { _school: S1, _dept: MATH })).data ?? []) as any[];
check("2 department shows only its eligible people with role/department/branch", mc.length >= 1 && mc.every((c) => c.dept_name === "الرياضيات h4x" && c.role && c.school_name) && mc.some((c) => c.user_id === id.t1), mc);
const t1name = mc.find((c) => c.user_id === id.t1)?.name as string;
const sq = ((await owner.rpc("support_route_candidates", { _school: S1, _dept: MATH, _q: t1name.slice(0, 3) })).data ?? []) as any[];
check("3 search by part of the name inside the department", sq.some((c) => c.user_id === id.t1));
const br = ((await owner.rpc("support_route_candidates", { _school: S1, _dept: null })).data ?? []) as any[];
check("4 branch-wide search lists S1 staff only (no guardian/owner)", br.length > mc.length && br.every((c) => c.school_name === br[0].school_name) && !br.some((c) => c.user_id === id.g1 || c.user_id === id.owner), br.length);
const em = ((await owner.rpc("support_route_candidates", { _school: S1, _dept: EMPTY })).data ?? []) as any[];
check("5 empty department returns nobody", em.length === 0);
check("6 department from another branch refused", !!(await owner.rpc("support_route_candidates", { _school: S1, _dept: D2 })).error);

// attachment at create
const df = await owner.rpc("create_support_draft_file", { _school: S1, _name: "صورة.png", _mime: "image/png", _size: 10 });
const rec = (df.data as any[])?.[0];
check("7 pending attachment row created", !df.error && !!rec?.id, df.error);
check("8 disallowed type refused", !!(await owner.rpc("create_support_draft_file", { _school: S1, _name: "x.exe", _mime: "application/x-msdownload", _size: 10 })).error);
check("9 oversize refused", !!(await owner.rpc("create_support_draft_file", { _school: S1, _name: "big.pdf", _mime: "application/pdf", _size: 500 * 1048576 })).error);
check("10 teacher cannot create draft attachments", !!(await t1.rpc("create_support_draft_file", { _school: S1, _name: "a.png", _mime: "image/png", _size: 10 })).error);
const notUp = await owner.rpc("support_open", { _school: S1, _title: "قبل الرفع", _body: "الملف لم يُرفع بعد", _files: [rec.id], _client_key: crypto.randomUUID() });
check("11 create refused while the file is not uploaded", !!notUp.error);
const up = await owner.storage.from("rikaz-files").upload(rec.storage_path, new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6])], { type: "image/png" }), { contentType: "image/png" });
check("12 file uploaded", !up.error, up.error);

const o1 = await owner.rpc("support_open", { _school: S1, _title: "عطل جهاز العرض", _body: "جهاز العرض في فصل الرياضيات لا يعمل", _dept: MATH, _assignee: id.t1, _files: [rec.id], _client_key: crypto.randomUUID() });
const T = o1.data as string;
const tk = (await admin.from("support_tickets").select("department_id, assignee").eq("id", T).single()).data;
check("13 owner creates ticket routed to department + teacher", !o1.error && tk?.department_id === MATH && tk?.assignee === id.t1, o1.error);
const tf = ((await t1.rpc("support_files", { _ticket: T })).data ?? []) as any[];
check("14 attachment linked; assignee sees it", tf.some((x) => x.id === rec.id));
const sig = await t1.storage.from("rikaz-files").createSignedUrl(rec.storage_path, 60);
check("15 assignee gets a temporary download link", !sig.error && !!sig.data?.signedUrl, sig.error);
const sigX = await other.storage.from("rikaz-files").createSignedUrl(rec.storage_path, 60);
check("16 other org cannot download", !!sigX.error || !sigX.data?.signedUrl);
const asg = ((await t1.rpc("support_list", { _box: "assigned" })).data ?? []) as any[];
check("17 shows in «assigned to me» with department name", asg.some((r) => r.id === T && r.department_name === "الرياضيات h4x"));

// department only, no assignee
const o2 = await owner.rpc("support_open", { _school: S1, _title: "طلب للقسم", _body: "يتابعه قسم الرياضيات", _dept: MATH, _client_key: crypto.randomUUID() });
const un = ((await owner.rpc("support_list", { _box: "manage", _status: "unassigned", _dept: MATH })).data ?? []) as any[];
check("18 department-only ticket in unassigned list filtered by department", !o2.error && un.some((r) => r.id === o2.data) && un.every((r) => r.department_name === "الرياضيات h4x"), o2.error);
const tRead = await t1.rpc("support_get", { _ticket: o2.data });
check("19 department member does NOT gain access by routing alone", !!tRead.error);

// refusals
const outDept = await owner.rpc("support_open", { _school: S1, _title: "خارج القسم", _body: "مسؤول من خارج القسم", _dept: EMPTY, _assignee: id.t1, _client_key: crypto.randomUUID() });
check("20 assignee outside the chosen department refused", !!outDept.error);
const outBr = await owner.rpc("support_open", { _school: S1, _title: "خارج الفرع", _body: "مسؤول من فرع آخر", _assignee: id.t2, _client_key: crypto.randomUUID() });
check("21 assignee from another branch refused (direct request)", !!outBr.error);
const deptX = await owner.rpc("support_open", { _school: S1, _title: "قسم فرع آخر", _body: "قسم لا يتبع الفرع", _dept: D2, _client_key: crypto.randomUUID() });
check("22 department of another branch refused", !!deptX.error);
check("23 principal cannot route for another branch", !!(await p1.rpc("support_route_departments", { _school: S2 })).error);
check("24 principal routes in own branch", !(await p1.rpc("support_route_candidates", { _school: S1, _dept: MATH })).error);
check("25 other org cannot list departments/people", !!(await other.rpc("support_route_departments", { _school: S1 })).error && !!(await other.rpc("support_route_candidates", { _school: S1 })).error);

// department change logged; transfer clears department
const sd = await owner.rpc("support_set_department", { _ticket: o2.data, _dept: EMPTY, _rev: await rev(o2.data as string) });
const ev = (await admin.from("support_events").select("action, details").eq("ticket_id", o2.data).eq("action", "department")).data ?? [];
check("26 department change saved and logged in timeline", !sd.error && ev.length === 1, sd.error);
check("27 department change by teacher refused", !!(await t1.rpc("support_set_department", { _ticket: T, _dept: null, _rev: await rev(T) })).error);
const tr = await owner.rpc("support_action", { _ticket: T, _action: "transfer", _rev: await rev(T), _reason: "تخص الفرع الثاني", _value: S2 });
const after = (await admin.from("support_tickets").select("department_id, assignee").eq("id", T).single()).data;
check("28 transfer clears old department and assignee", !tr.error && after?.department_id === null && after?.assignee === null, [tr.error, after]);
check("29 old assignee loses access after transfer", !!(await t1.rpc("support_get", { _ticket: T })).error);

// cleanup test rows
const tickets = ((await admin.from("support_tickets").select("id").eq("org_id", f.org)).data ?? []).map((x: any) => x.id);
for (const t of tickets) { await admin.from("support_events").delete().eq("ticket_id", t); await admin.from("support_messages").delete().eq("ticket_id", t); }
await admin.from("files").update({ source_type: "cleanup_due" }).in("source_id", tickets);
await admin.from("support_tickets").delete().in("id", tickets);
await admin.from("departments").delete().in("id", [MATH, EMPTY, D2]);
console.log(`\n${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
