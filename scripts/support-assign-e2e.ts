// Internal tickets with branch-only assignment + tickets from the live Maqsam panel (pending call link → linked later).
// Run: NODE_PATH=node_modules bun scripts/support-assign-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "sas");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
async function user(tag: string) {
  const email = `sas-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), ta = await user("ta"), tb = await user("tb"), g = await user("g");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة إسناد", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert([{ user_id: ta.id, org_id: org, school_id: A, role: "teacher" }, { user_id: tb.id, org_id: org, school_id: B, role: "teacher" }, { user_id: g.id, org_id: org, school_id: A, role: "guardian" }]);
  const caps = (await owner.c.rpc("support_caps", { _org: org })).data as any;
  check("owner may assign in both branches", (caps?.assign_new ?? []).length === 2, caps?.assign_new);
  const list = ((await owner.c.rpc("support_new_assignees", { _school: A })).data ?? []).map((x: any) => x.user_id);
  check("branch A list has only A's active staff", list.includes(ta.id) && !list.includes(tb.id) && !list.includes(g.id), list);
  const open = (who: string, school: string) => owner.c.rpc("support_open", { _school: school, _title: "عطل في الطابعة", _body: "الطابعة لا تعمل في المكتب", _priority: "normal", _category: null, _assignee: who, _client_key: randomUUID(), _dept: null, _files: null });
  const t1 = await open(ta.id, A);
  check("owner creates an internal ticket assigned to a branch A employee", !t1.error && !!t1.data, t1.error);
  const box = await ta.c.rpc("support_list", { _box: "assigned", _school: null, _q: null, _status: null, _priority: null, _category: null, _from: null, _to: null, _limit: 50, _offset: 0, _assignee: null, _dept: null });
  check("ticket appears in the employee's «المسندة إليّ»", JSON.stringify(box.data ?? []).includes(t1.data), box.error ?? box.data);
  const n = (await admin.from("notifications").select("id").eq("user_id", ta.id).eq("dedupe_key", `support:${t1.data}:assign:${ta.id}`)).data ?? [];
  check("employee received the assignment alert", n.length === 1, n.length);
  const t2 = await open(tb.id, A);
  check("assigning an employee from another branch is refused", !!t2.error, t2.data);
  const t3 = await g.c.rpc("support_open", { _school: A, _title: "تجربة إسناد", _body: "ولي أمر يحاول الإسناد", _priority: "normal", _category: null, _assignee: ta.id, _client_key: randomUUID(), _dept: null, _files: null });
  check("someone without create/assign rights cannot open an assigned internal ticket", !!t3.error, t3.data);
  const own = await ta.c.rpc("support_create", { _scope: "school", _school: A, _title: "دعم المنصة", _body: "طلب لدعم منصة ركاز", _priority: "normal", _category: null, _student: null, _client_key: randomUUID() });
  check("«دعم منصة ركاز» path still works from تذاكري", !own.error, own.error);

  // live Maqsam panel (test org linked only in the DB; the project keys never sync it — MAQSAM_ORG guard)
  await admin.from("mq_link").insert({ org_id: org, enabled: true });
  const lv = await owner.c.rpc("mq_live_ticket", { _org: org, _school: B, _title: "استفسار عن التسجيل", _body: "ولي أمر يسأل عن التسجيل", _priority: "normal", _category: null, _assignee: tb.id, _call: null, _phone: "0551234567", _client_key: randomUUID() });
  check("live-call ticket saves at once with branch B assignee and pending call link", !lv.error && (lv.data as any)?.pending === true, lv.error ?? lv.data);
  const tid = (lv.data as any)?.ticket;
  check("ticket shows «بانتظار ربط المكالمة»", (await owner.c.rpc("mq_ticket_call_state", { _ticket: tid })).data === "pending");
  const lvBad = await owner.c.rpc("mq_live_ticket", { _org: org, _school: B, _title: "استفسار آخر", _body: "إسناد لموظف فرع آخر", _priority: "normal", _category: null, _assignee: ta.id, _call: null, _phone: null, _client_key: randomUUID() });
  check("live-call ticket refuses an assignee outside the chosen branch", !!lvBad.error, lvBad.data);
  const call = (await admin.from("mq_calls").insert({ org_id: org, ext_id: run, direction: "inbound", state: "serviced", other_number: "966551234567", phone_norm: "966551234567", started_at: new Date().toISOString(), duration: 60 }).select("id, phone_norm").single());
  const pend = await owner.c.rpc("mq_pending_tickets", { _org: null, _call: call.data!.id });
  check("synced call lists the pending ticket for linking", JSON.stringify(pend.data ?? []).includes(tid) || (pend.data ?? []).length > 0, pend.error ?? pend.data);
  const lk = await owner.c.rpc("mq_call_link_ticket", { _id: call.data!.id, _ticket: tid });
  check("linking from the call log clears the pending state", !lk.error && (await owner.c.rpc("mq_ticket_call_state", { _ticket: tid })).data === "linked", lk.error);
  const lv2 = await owner.c.rpc("mq_live_ticket", { _org: org, _school: A, _title: "مكالمة معروفة", _body: "المكالمة ظاهرة أثناء الاتصال", _priority: "normal", _category: null, _assignee: null, _call: call.data!.id, _phone: null, _client_key: randomUUID() });
  check("when the call id is known the ticket links on save", !lv2.error && (lv2.data as any)?.pending === false, lv2.error ?? lv2.data);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  for (const o of orgs) {
    const tk = ((await admin.from("support_tickets").select("id").eq("org_id", o)).data ?? []).map((x: any) => x.id);
    await admin.from("mq_ticket_pending").delete().eq("org_id", o);
    const cl = ((await admin.from("mq_calls").select("id").eq("org_id", o)).data ?? []).map((x: any) => x.id);
    await admin.from("mq_call_tickets").delete().in("call_id", cl); await admin.from("mq_log").delete().eq("org_id", o); await admin.from("mq_calls").delete().eq("org_id", o); await admin.from("mq_link").delete().eq("org_id", o);
    for (const tb of ["support_messages", "support_events", "support_info_requests", "support_notes", "support_followers"]) await admin.from(tb).delete().in("ticket_id", tk);
    await admin.from("support_tickets").delete().eq("org_id", o);
    await tr.purgeOrg(o).catch((e: unknown) => console.error("purge", e));
  }
  await tr.cleanup?.();
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
