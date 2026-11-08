// Support desk run by the platform owner: every ticket goes to platform admins; school managers don't see it; the assignee replies and changes status.
// Run: NODE_PATH=node_modules bun scripts/support-platform-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "spl");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
async function user(tag: string) {
  const email = `spl-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = []; let plat = "";
const ids = (r: any) => ((r.data ?? []) as any[]).map((x) => x.id ?? x.ticket_id ?? Object.values(x)[0]);
try {
  const owner = await user("owner"), pr = await user("pr"), t = await user("t"), g = await user("g"), p = await user("plat");
  plat = p.id; await admin.from("platform_admins").insert({ user_id: p.id });
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة دعم", _school_name: "فرع" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  await admin.from("memberships").insert([{ user_id: pr.id, org_id: org, school_id: A, role: "principal" }, { user_id: t.id, org_id: org, school_id: A, role: "teacher" }, { user_id: g.id, org_id: org, school_id: A, role: "guardian" }]);
  const mk = (c: any) => c.rpc("support_create", { _scope: "school", _school: A, _title: "مشكلة دخول", _body: "لا أستطيع فتح الصفحة", _priority: "normal", _category: null, _student: null, _client_key: randomUUID() });
  const tt = await mk(t.c), tg = await mk(g.c), tp = await mk(pr.c), to = await mk(owner.c);
  check("teacher, guardian, principal and group owner can all open a ticket", !tt.error && !tg.error && !tp.error && !to.error, [tt.error, tg.error, tp.error, to.error]);
  const L = (c: any, box: string) => c.rpc("support_list", { _box: box, _school: null, _q: null, _status: null, _priority: null, _category: null, _from: null, _to: null, _limit: 100, _offset: 0, _assignee: null, _dept: null });
  const pl = JSON.stringify((await L(p.c, "manage")).data);
  check("platform owner's support desk lists all four tickets", [tt.data, tg.data, tp.data, to.data].every((x) => pl.includes(x)), pl.slice(0, 200));
  check("principal cannot read the teacher's ticket", !(await pr.c.rpc("support_can_read", { _ticket: tt.data })).data);
  check("group owner cannot read the guardian's ticket", !(await owner.c.rpc("support_can_read", { _ticket: tg.data })).data);
  check("principal's manage box is empty", !((await L(pr.c, "manage")).data ?? []).length);
  const n = (await admin.from("notifications").select("user_id").eq("user_id", p.id)).data ?? [];
  check("platform owner notified of new tickets", n.length >= 4, n.length);
  const asg = await p.c.rpc("support_action", { _ticket: tg.data, _action: "assign", _assignee: t.id, _rev: null, _reason: null });
  const tget = await admin.from("support_tickets").select("assignee").eq("id", tg.data).single();
  check("platform owner assigns the guardian's ticket to a teacher", tget.data?.assignee === t.id, asg.error ?? tget.data);
  check("assignee can read it", !!(await t.c.rpc("support_can_read", { _ticket: tg.data })).data);
  const rep = await t.c.rpc("support_reply", { _ticket: tg.data, _body: "تمت المعالجة", _client_key: randomUUID() });
  check("assignee replies", !rep.error, rep.error);
  check("principal still cannot read the assigned ticket", !(await pr.c.rpc("support_can_read", { _ticket: tg.data })).data);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  if (plat) await admin.from("platform_admins").delete().eq("user_id", plat);
  for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.error("purge", e));
  await tr.cleanup?.();
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
