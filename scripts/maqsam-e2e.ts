// Maqsam calls inside support: org binding, branch/own scopes, separate listen/download/export/link rights, direct-call isolation,
// ticket create/link without status change, follow-up reminder once, and that tickets keep working without Maqsam.
// Uses synthetic call rows on an isolated test org (no real Maqsam calls). Run: NODE_PATH=node_modules bun scripts/maqsam-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "mqx");
const MALKI = "a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074", DEMO = "916b6457-526a-48d0-b854-85547fb72305";
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 300)); };
async function user(tag: string) {
  const email = `mqx-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); await admin.from("profiles").upsert({ id: s.data.user!.id, full_name: "مستخدم " + tag }); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  // binding
  const links = (await admin.from("mq_link").select("org_id")).data ?? [];
  check("Maqsam account bound to مجموعة المالكي only", links.length === 1 && links[0]!.org_id === MALKI, links);
  const demoIng = await admin.rpc("_mq_ingest", { _org: DEMO, _calls: [], _agents: [] });
  check("demo institution cannot ingest/use the account", !!demoIng.error);

  const owner = await user("owner"), sa = await user("sa"), sb = await user("sb"), ag = await user("ag"), other = await user("other");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة مكالمات", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "مؤسسة أخرى مكالمات", _school_name: "فرع" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  await admin.from("memberships").insert([{ user_id: sa.id, org_id: org, school_id: A, role: "teacher" }, { user_id: sb.id, org_id: org, school_id: B, role: "teacher" }, { user_id: ag.id, org_id: org, school_id: A, role: "teacher" }]);

  check("not linked org: owner sees no calls section", (await owner.c.rpc("mq_caps", { _org: org })).data?.enabled === false);
  await admin.from("mq_link").insert({ org_id: org }); // test-only link for the isolated org
  check("other org owner cannot list this org's calls", !!(await other.c.rpc("mq_calls_list", { _org: org })).error);

  const ts = Math.floor(Date.now() / 1000);
  const calls = [
    { id: 9100000 + run % 100000, callerNumber: "0551110001", calleeNumber: "966920000001", direction: "inbound", type: "inbound", state: "serviced", timestamp: ts - 600, duration: 90, agents: [{ identifier: "agX" }] },
    { id: 9200000 + run % 100000, callerNumber: "966920000002", calleeNumber: "0551110002", direction: "outbound", type: "outbound", state: "completed", timestamp: ts - 500, duration: 40, agents: [{ identifier: "agX" }] },
    { id: 9300000 + run % 100000, callerNumber: "0551110003", calleeNumber: "966920000001", direction: "inbound", type: "inbound", state: "abandoned", timestamp: ts - 400, duration: 0, agents: [] },
  ];
  const ing = await admin.rpc("_mq_ingest", { _org: org, _calls: calls, _agents: [{ identifier: "agX", email: "x@t", name: "وكيل", active: true }] });
  check("ingest 3 calls", ing.data === 3, ing.error);
  const again = await admin.rpc("_mq_ingest", { _org: org, _calls: [{ ...calls[0], state: "serviced", duration: 95 }], _agents: [] });
  const cnt = (await admin.from("mq_calls").select("id", { count: "exact", head: true }).eq("org_id", org)).count;
  check("re-sending an event does not duplicate", !again.error && cnt === 3, cnt);
  const late = await admin.rpc("_mq_ingest", { _org: org, _calls: [{ ...calls[0], duration: 10 }], _agents: [] });
  const d0 = (await admin.from("mq_calls").select("duration").eq("ext_id", calls[0]!.id).single()).data?.duration;
  check("older out-of-order record does not shrink duration", !late.error && d0 === 95, d0);

  // numbers & agents
  check("unmapped number → calls wait for review", ((await owner.c.rpc("mq_calls_list", { _org: org, _review: true })).data?.total) === 3);
  check("branch staff cannot map numbers", !!(await sa.c.rpc("mq_number_map", { _org: org, _number: "966920000001", _school: A, _label: null })).error);
  const nm = await owner.c.rpc("mq_number_map", { _org: org, _number: "966920000001", _school: A, _label: null });
  const nm2 = await owner.c.rpc("mq_number_map", { _org: org, _number: "966920000002", _school: B, _label: null });
  check("owner maps service numbers to branches", !nm.error && !nm2.error, nm.error ?? nm2.error);
  check("owner maps Maqsam agent to a Rikaz user", !(await owner.c.rpc("mq_agent_map", { _org: org, _identifier: "agX", _user: ag.id })).error);
  const all = (await owner.c.rpc("mq_calls_list", { _org: org })).data;
  check("owner sees all branches in one list", all?.total === 3, all);
  const idA = all.rows.find((r: any) => r.direction === "inbound" && !r.missed).id, idB = all.rows.find((r: any) => r.direction === "outbound").id;

  // scopes
  check("staff without permission: no calls", (await sa.c.rpc("mq_caps", { _org: org })).data?.enabled === false && !!(await sa.c.rpc("mq_calls_list", { _org: org })).error);
  const grant = (u: string, action: string, scope = "branch") => admin.from("perm_overrides").insert({ org_id: org, user_id: u, section: "calls", action, effect: "grant", scope, reason: "اختبار", created_by: owner.id });
  await grant(sa.id, "view");
  const la = (await sa.c.rpc("mq_calls_list", { _org: org })).data;
  check("branch A viewer sees only branch A calls", la?.total === 2 && la.rows.every((r: any) => r.school_id === A), la);
  check("direct link to branch B call is refused", !!(await sa.c.rpc("mq_call_get", { _id: idB })).error);
  check("viewer without listen cannot get a recording", !!(await sa.c.rpc("mq_rec_ticket", { _call: idA, _mode: "listen" })).error);
  await grant(sa.id, "listen");
  const lt = await sa.c.rpc("mq_rec_ticket", { _call: idA, _mode: "listen" });
  check("listen right gives a listen token", !lt.error && /^[0-9a-f]{48}$/.test(lt.data), lt.error);
  check("listen right does not allow download", !!(await sa.c.rpc("mq_rec_ticket", { _call: idA, _mode: "download" })).error);
  const lg = (await admin.from("mq_log").select("action").eq("org_id", org).eq("action", "listen")).data ?? [];
  check("listening is logged", lg.length === 1, lg);
  const cons = await admin.rpc("_mq_rec_consume", { _token: lt.data });
  check("token consumed by the recording route", cons.data?.ok === true, cons);
  await admin.from("perm_overrides").delete().eq("org_id", org).eq("user_id", sa.id).eq("action", "listen");
  const cons2 = await admin.rpc("_mq_rec_consume", { _token: lt.data });
  check("revoking listen mid-session stops the same token", cons2.data?.ok === false, cons2);
  check("forged token refused", (await admin.rpc("_mq_rec_consume", { _token: "0".repeat(48) })).data?.ok === false);
  await grant(ag.id, "own");
  const lo = (await ag.c.rpc("mq_calls_list", { _org: org })).data;
  check("'own' scope sees only own calls (both branches)", lo?.total === 2, lo);
  check("view does not grant export/report", !!(await sa.c.rpc("mq_report", { _org: org })).error);
  check("view does not grant linking", !!(await sa.c.rpc("mq_followup_add", { _call: idA, _outcome: "x", _note: null, _due: null, _assignee: null })).error);

  // reports = list totals
  const rep = (await owner.c.rpc("mq_report", { _org: org })).data;
  const missedList = (await owner.c.rpc("mq_calls_list", { _org: org, _kind: "missed" })).data?.total;
  check("report totals match list rows (total/in/out/missed)", rep?.total === 3 && rep.inbound === 2 && rep.outbound === 1 && rep.missed === 1 && missedList === 1, rep);
  check("export is logged", !(await owner.c.rpc("mq_export_log", { _org: org, _what: "t", _rows: 3 })).error);

  // tickets
  await grant(sa.id, "link");
  const t1 = await sa.c.rpc("mq_call_open_ticket", { _id: idA, _title: "استفسار من مكالمة", _body: "تفاصيل", _priority: "normal", _client_key: randomUUID() });
  check("create ticket from call", !t1.error && !!t1.data, t1.error);
  const st0 = (await admin.from("support_tickets").select("status").eq("id", t1.data).single()).data?.status;
  const t2 = (await sa.c.rpc("support_create", { _scope: "school", _school: A, _title: "تذكرة قائمة", _body: "نص التذكرة القائمة", _priority: "normal", _category: null, _student: null, _client_key: randomUUID() })).data;
  check("existing ticket creation still works", !!t2);
  check("link call to existing ticket", !(await sa.c.rpc("mq_call_link_ticket", { _id: idA, _ticket: t2 })).error);
  check("cannot link a call to another org's ticket", !!(await sa.c.rpc("mq_call_link_ticket", { _id: idA, _ticket: randomUUID() })).error);
  await admin.rpc("_mq_ingest", { _org: org, _calls: [{ ...calls[0], state: "completed", duration: 120 }], _agents: [] });
  const st1 = (await admin.from("support_tickets").select("status").eq("id", t1.data).single()).data?.status;
  check("call ending does not change ticket status", st0 === st1, [st0, st1]);
  const g = (await sa.c.rpc("mq_call_get", { _id: idA })).data;
  check("call shows both linked tickets", g?.tickets?.length === 2, g?.tickets);
  check("ticket shows its calls", ((await sa.c.rpc("mq_call_tickets_of", { _ticket: t1.data })).data ?? []).length === 1);

  // follow-up reminder once
  const fu = await sa.c.rpc("mq_followup_add", { _call: idA, _outcome: "يحتاج متابعة", _note: "اتصال لاحق", _due: new Date(Date.now() - 60000).toISOString(), _assignee: sa.id });
  check("follow-up recorded", !fu.error, fu.error);
  check("follow-up assignee from another branch refused", !!(await sa.c.rpc("mq_followup_add", { _call: idA, _outcome: "x", _note: null, _due: null, _assignee: sb.id })).error);
  await admin.rpc("mq_followup_tick"); await admin.rpc("mq_followup_tick");
  const nn = (await admin.from("notifications").select("id").eq("user_id", sa.id).like("dedupe_key", "mqf:%")).data ?? [];
  check("follow-up reminder sent exactly once", nn.length === 1, nn.length);

  // unknown caller / multiple matches
  const miss = all.rows.find((r: any) => r.missed).id;
  check("unknown caller saved as contact (no login)", !(await owner.c.rpc("mq_contact_save", { _id: miss, _name: "متصل جديد", _note: null })).error);
  check("cannot attach a contact that does not match the number", !!(await owner.c.rpc("mq_call_set_contact", { _id: miss, _kind: "guardian", _cid: randomUUID() })).error);
  await admin.from("notifications").delete().eq("user_id", sa.id).like("dedupe_key", "mqf:%");
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  for (const o of orgs) { await admin.from("mq_link").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log("cleanup", e?.message)); }
  await tr.cleanup?.();
  console.log(`\n${ok} passed, ${bad} failed`);
}
