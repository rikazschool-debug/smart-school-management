// Support package 5 on the 4-school fixture (needs hub4-fixture setup): owner opens internal tickets for any branch,
// assign at create, claim/reply/private note, reassign revokes old access, cross-branch transfer, resolve/close,
// summary KPIs + filters, principal limited to own branch, other org refused. Run: NODE_PATH=node_modules bun scripts/support5-e2e.ts
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
const [S1, S2, S3] = f.schools; const id = f.ids;
const owner = await as("owner"), p1 = await as("p1"), t1 = await as("t1"), t2 = await as("t2"), other = await as("other");
const get = async (c: any, t: string) => c.rpc("support_get", { _ticket: t });
const rev = async (t: string) => (await admin.from("support_tickets").select("rev").eq("id", t).single()).data!.rev;

const c1 = await owner.rpc("support_new_candidates", { _school: S3, _q: null });
const names = ((c1.data ?? []) as any[]);
check("1 candidates: org staff with role + branch, no guardian/owner", names.some((x) => x.user_id === id.t3 && x.school_name) && !names.some((x) => x.user_id === id.g1 || x.user_id === id.owner), c1.error);
const key = crypto.randomUUID();
const o1 = await owner.rpc("support_open", { _school: S1, _title: "عطل الطابعة", _body: "الطابعة لا تعمل في غرفة المعلمين", _priority: "high", _assignee: id.t1, _client_key: key });
const T = o1.data as string;
const again = await owner.rpc("support_open", { _school: S1, _title: "عطل الطابعة", _body: "الطابعة لا تعمل في غرفة المعلمين", _priority: "high", _assignee: id.t1, _client_key: key });
check("2 owner opens internal ticket assigned to a teacher; retry returns the same ticket", !o1.error && again.data === T, o1.error);
const notif = (await admin.from("notifications").select("id").eq("user_id", id.t1).like("dedupe_key", `support:${T}:assign:%`)).data ?? [];
check("3 assignee notified once", notif.length === 1);
const asg = await t1.rpc("support_list", { _box: "assigned" });
check("4 ticket appears in the teacher's «assigned to me»", ((asg.data ?? []) as any[]).some((r) => r.id === T), asg.error);
const own = await owner.rpc("support_list", { _box: "manage", _status: "open" });
check("5 owner's own internal ticket listed in the org box", ((own.data ?? []) as any[]).some((r) => r.id === T));
const rp = await t1.rpc("support_reply", { _ticket: T, _body: "سأتابع مع الصيانة", _client_key: crypto.randomUUID() });
const st = (await admin.from("support_tickets").select("status").eq("id", T).single()).data!.status;
check("6 reply does not close the ticket", !rp.error && !["resolved", "closed"].includes(st), [rp.error, st]);
const pn = await owner.rpc("support_add_note", { _ticket: T, _kind: "private", _recipient: id.t1, _body: "ملاحظة خاصة للمعلم", _client_key: crypto.randomUUID() });
check("7 private note to the assignee added", !pn.error, pn.error);
const seen = JSON.stringify((await get(p1, T)).data ?? {});
check("7b principal of the branch does not see the private note", !seen.includes("ملاحظة خاصة للمعلم"));
const ra = await owner.rpc("support_action", { _ticket: T, _action: "assign", _rev: await rev(T), _value: id.t2 });
const lost = await get(t1, T);
check("8 reassign: previous assignee loses access immediately", !ra.error && !!lost.error, [ra.error, lost.error]);
check("9 new assignee reads it", !(await get(t2, T)).error);
const tr = await owner.rpc("support_action", { _ticket: T, _action: "transfer", _rev: await rev(T), _reason: "تخص الفرع الثاني", _value: S2 });
check("10 owner transfers to another branch with reason", !tr.error && (await admin.from("support_tickets").select("school_id").eq("id", T).single()).data!.school_id === S2, tr.error);
check("11 transfer drops the old assignment", !!(await get(t2, T)).error);
const p1r = await get(p1, T);
check("12 principal of the old branch loses access after transfer", !!p1r.error);
await owner.rpc("support_action", { _ticket: T, _action: "claim", _rev: await rev(T) });
const rs = await owner.rpc("support_action", { _ticket: T, _action: "resolve", _rev: await rev(T), _reason: "استُبدل الحبر" });
const cl = await owner.rpc("support_action", { _ticket: T, _action: "close", _rev: await rev(T) });
check("13 resolve with documented solution then close", !rs.error && !cl.error, [rs.error, cl.error]);
const stale = await owner.rpc("support_action", { _ticket: T, _action: "priority", _rev: 1, _value: "low" });
check("14 stale revision refused (concurrent edits)", !!stale.error);
const ev = (await admin.from("support_events").select("action").eq("ticket_id", T)).data ?? [];
check("15 timeline keeps created/assign/transfer/resolve/close", ["created", "assign", "transfer", "resolve", "close"].every((a) => ev.some((e: any) => e.action === a)), ev.map((e: any) => e.action));
// unassigned queue + summary
const o2 = await owner.rpc("support_open", { _school: S3, _title: "طلب بلا مسؤول", _body: "ينتظر من يستلمه", _client_key: crypto.randomUUID() });
const sm = (await owner.rpc("support_summary", { _school: null })).data as any;
const un = await owner.rpc("support_list", { _box: "manage", _status: "unassigned" });
check("16 unassigned ticket counted and filtered", sm?.unassigned >= 1 && ((un.data ?? []) as any[]).some((r) => r.id === o2.data) && sm.resolved >= 1, sm);
// principal + isolation
const pp = await p1.rpc("support_open", { _school: S2, _title: "تجاوز", _body: "فرع آخر لا أديره", _client_key: crypto.randomUUID() });
check("17 principal cannot open tickets for another branch", !!pp.error);
const pc = await p1.rpc("support_new_candidates", { _school: S1, _q: null });
check("18 principal sees only own-branch candidates", !pc.error && ((pc.data ?? []) as any[]).every((x) => x.school_name === "مدرسة الأولى"), pc.error);
check("19 other-org owner cannot read the ticket", !!(await get(other, o2.data as string)).error);
check("20 other-org owner cannot open tickets here", !!(await other.rpc("support_open", { _school: S1, _title: "اختراق", _body: "محاولة من مؤسسة أخرى" })).error);
check("21 other-org owner cannot list candidates", !!(await other.rpc("support_new_candidates", { _school: S1, _q: null })).error);
const os = (await other.rpc("support_summary", { _school: S1 })).data as any;
check("22 other-org summary is empty", os?.open === 0);
const tf = await t1.rpc("support_open", { _school: S1, _title: "معلم", _body: "معلم يحاول الإنشاء الموجّه" });
check("23 teacher cannot open directed tickets", !!tf.error);
console.log(`\n${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
