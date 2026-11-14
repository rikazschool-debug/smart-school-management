// Cross-branch assignment (needs hub4-fixture setup): normal assignment stays in the ticket branch; assigning to a person
// of another branch needs the referral (support.transfer) right on that branch, is logged as cross_branch, and never moves the ticket.
// Run: NODE_PATH=node_modules bun scripts/support8-e2e.ts
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
const owner = await as("owner"), p1 = await as("p1");
const rev = async (t: string) => (await admin.from("support_tickets").select("rev").eq("id", t).single()).data!.rev;
const act = (c: any, t: string, v: string, r: number) => c.rpc("support_action", { _ticket: t, _action: "assign", _rev: r, _reason: null, _value: v });

const T = (await p1.rpc("support_open", { _school: S1, _title: "طابعة المكتب", _body: "الطابعة لا تعمل منذ الصباح", _assignee: null, _client_key: crypto.randomUUID() })).data as string;
check("1 ticket opened by the principal", !!T);
check("2 principal can assign inside own branch", !(await act(p1, T, id.a1, await rev(T))).error);
const c1 = await p1.rpc("support_route_candidates", { _school: S2, _dept: null, _q: null, _ticket: T });
check("3 principal without referral right cannot list other-branch people", !!c1.error);
const e1 = await act(p1, T, id.t2, await rev(T));
check("4 principal without referral right cannot assign to another branch", !!e1.error, e1.error);
const c2 = await owner.rpc("support_route_candidates", { _school: S2, _dept: null, _q: null, _ticket: T });
check("5 owner lists other-branch people", !c2.error && (c2.data ?? []).some((x: any) => x.user_id === id.t2), c2.error);
check("6 owner assigns to a specialist from another branch", !(await act(owner, T, id.t2, await rev(T))).error);
const tk = (await admin.from("support_tickets").select("school_id, assignee").eq("id", T).single()).data!;
check("7 ticket stays in its branch; assignee is the other-branch person", tk.school_id === S1 && tk.assignee === id.t2, tk);
const ev = (await admin.from("support_events").select("action, details").eq("ticket_id", T).eq("action", "assign").order("created_at", { ascending: false }).limit(1)).data?.[0];
check("8 history records the cross-branch assignment", ev?.details?.cross_branch === true && !!ev.details.to_school, ev);
const g = await owner.rpc("perm_override_set", { _org: f.org, _user: id.p1, _section: "support", _action: "transfer", _effect: "grant", _scope: "org", _reason: "اختبار الإسناد بين الفروع" });
check("9 owner grants the principal the referral right", !g.error, g.error);
check("10 granted principal may now assign to another branch", !(await act(p1, T, id.a2, await rev(T))).error);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
