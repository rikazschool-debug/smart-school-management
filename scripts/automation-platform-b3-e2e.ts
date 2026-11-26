import "./lib/user-pool.ts";
import "./lib/au-suite-lock.ts";
// Automation platform phase B closure: the eight catalogue sources that had no test data are proven on isolated
// synthetic records (one synthetic org): exact count, registered fields only, single-record re-read, keyset paging
// without loss/duplicates, other-org isolation; plus the read-only automation data grant (au_data) that reads
// meetings/circulars/gate without the operational permission. Nothing is sent; no rule is created or activated.
// Run: NODE_PATH=node_modules bun scripts/automation-platform-b3-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env["VITE_SUPABASE_URL"]!, PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "automation-platform-b3-e2e");
const run = Date.now(), pw = "Test-" + crypto.randomUUID();
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 900)); return c; };
const must = <T,>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const ins = async (t: string, rows: any[]) => must(await admin.from(t).insert(rows).select(), t) as any[];
async function user(tag: string) {
  const email = `aupb3-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const own = await user("owner"), other = await user("other");
  const org = must(await own.c.rpc("create_organization", { _org_name: `مصادر الأتمتة ب3 ${run}`, _school_name: "فرع ب3" }), "org") as string; orgs.push(org);
  const S = (must(await admin.from("schools").select("id").eq("org_id", org).single(), "s") as any).id as string; tr.addSchool(S);
  const org2 = must(await other.c.rpc("create_organization", { _org_name: `مصادر أخرى ب3 ${run}`, _school_name: "فرع آخر" }), "org2") as string; orgs.push(org2);
  const U = own.id, today = new Date().toISOString().slice(0, 10);
  // ---------- isolated synthetic fixtures: 3 records per source ----------
  const emps = await ins("hr_employees", [0, 1, 2].map((i) => ({ org_id: org, employee_no: `B3-${run}-${i}`, full_name: `موظف اصطناعي ${i}` })));
  const lt = (await ins("hr_leave_types", [{ org_id: org, name: `إجازة اصطناعية ${run}` }]))[0];
  const fid = crypto.randomUUID();
  const form = (await ins("adm_forms", [{ id: fid, root_id: fid, school_id: S, name: "نموذج اصطناعي", handler_user: U, created_by: U, status: "active" }]))[0];
  const N = 3; const counts: Record<string, string[]> = {};
  counts["admin_requests"] = (await ins("adm_requests", [0, 1, 2].map((i) => ({ school_id: S, form_id: form.id, form_version: 1, form_name: "نموذج اصطناعي", fields: [], handler_user: U, submitted_by: U, status: i ? "submitted" : "in_progress" })))).map((r) => r.id);
  // published-only sources: 3 published + 1 draft each; the draft must stay invisible to automation (same rule as the API)
  counts["gifted_programs"] = (await ins("gt_programs", [0, 1, 2, 3].map((i) => ({ school_id: S, title: `برنامج موهبة اصطناعي ${i}`, created_by: U, status: i < 3 ? "open" : "draft" })))).slice(0, 3).map((r) => r.id);
  counts["guidance_programs"] = (await ins("edu_programs", [0, 1, 2].map((i) => ({ school_id: S, kind: "preventive", domain: "academic", title: `برنامج إرشادي اصطناعي ${i}`, start_date: today, end_date: today, status: "planned", created_by: U })))).map((r) => r.id);
  counts["hr_leaves"] = (await ins("hr_leave_requests", emps.map((e) => ({ org_id: org, employee_id: e.id, type_id: lt.id, start_date: today, end_date: today, days: 1, status: "pending_manager", requested_by: U })))).map((r) => r.id);
  counts["hr_vacancies"] = (await ins("hr_rc_vacancies", [0, 1, 2, 3].map((i) => ({ org_id: org, school_id: S, ref: `V-${run}-${i}`, job_title: "معلم اصطناعي", reason: "اختبار", created_by: U, status: i < 3 ? "open" : "requested", seats: 1 })))).slice(0, 3).map((r) => r.id);
  await ins("hr_att_days", emps.map((e) => ({ org_id: org, school_id: S, employee_id: e.id, date: today, status: "present" })));
  counts["hr_attendance"] = emps.map((e) => `${e.id}_${today}`);
  counts["hr_assets"] = (await ins("hr_assets", [0, 1, 2].map((i) => ({ org_id: org, school_id: S, name: `عهدة اصطناعية ${i}`, status: "available" })))).map((r) => r.id);
  counts["notices"] = (await ins("bc_notices", [0, 1, 2, 3].map((i) => ({ org_id: org, title: `إشعار اصطناعي ${i}`, body: "نص اصطناعي للاختبار", created_by: U, status: i < 3 ? "sent" : "draft", ...(i < 3 ? { sent_at: new Date().toISOString() } : {}) })))).slice(0, 3).map((r) => r.id);
  const q = (c: any, ev: string, a: any = {}) => c.rpc("au_query", { _org: org, _event: ev, _schools: null, _params: null, _where: null, _group: null, _aggs: null, _sort: null, _desc: false, _limit: 50, _offset: 0, _entity: null, ...a });
  const vars = must(await admin.from("au_variables").select("event_code,key").like("event_code", "ds.api.%"), "vars") as any[];
  const md5uuid = async (s: string) => { const h = (await import("crypto")).createHash("md5").update(s).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
  for (const [res, ids] of Object.entries(counts)) {
    const ev = "ds.api." + res;
    const want = new Set(await Promise.all(ids.map((i) => (/^[0-9a-f-]{36}$/i.test(i) ? i : md5uuid(i)))));
    const r = await q(own.c, ev);
    const d = r.data as any;
    check(`${res}: owner query sees exactly the ${N} synthetic records, not truncated`, !r.error && d.scanned === N && d.matched === N && !d.truncated, r.error ?? { scanned: d?.scanned, matched: d?.matched });
    const items = (d?.items ?? []) as any[];
    const keys = vars.filter((v) => v.event_code === ev).map((v) => v.key);
    const ctxKeys = new Set(items.flatMap((x) => Object.keys(x.fields ?? {})));
    check(`${res}: records carry the registered fields (branch name only when the record has a branch)`, items.length === N && keys.every((k) => ctxKeys.has(k) || (k === "school_name" && items.every((x) => !x.school))), { keys, got: [...ctxKeys] });
    const pg: string[] = []; let after: string | undefined;
    for (let i = 0; i < 5; i++) { const p = must(await admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: null, _lim: 1, _entity: null, _params: after ? { _after: after } : {} }), "page") as any[]; if (!p.length) break; pg.push(p[0].entity); after = p[0].entity; }
    check(`${res}: keyset paging (1 per batch) returns all ${N}, no duplicates, same identities`, pg.length === N && new Set(pg).size === N && pg.every((e) => want.has(e)), { pg, want: [...want] });
    const one = must(await admin.rpc("_au_srcp", { _ev: ev, _org: org, _schools: null, _lim: 1, _entity: pg[1] ?? null, _params: {} }), "one") as any[];
    check(`${res}: single-record re-read returns that record only`, one.length === 1 && one[0].entity === pg[1]);
    const o2 = must(await admin.rpc("_au_srcp", { _ev: ev, _org: org2, _schools: null, _lim: 50, _entity: null, _params: {} }), "o2") as any[];
    check(`${res}: another group's reader sees none of these records`, o2.every((x) => !want.has(x.entity)));
    const f = await q(other.c, ev);
    check(`${res}: another group's owner is refused`, !!f.error);
  }
  // ---------- read-only automation data grant (au_data) ----------
  const ps = (sec: string, act: string) => admin.rpc("_au_ps_ok", { _school: S, _uid: other.id, _ps: `${sec}:${act}` });
  check("au_data sections are valid permission-tree actions", (await admin.rpc("_perm_valid", { _section: "au_data", _action: "meetings", _scope: null as any })).data === true
    && (await admin.rpc("_perm_valid", { _section: "au_data", _action: "nope", _scope: null as any })).data === false);
  check("outsider without grants has no data read on meetings", (await ps("meetings", "organize")).data === false);
  const rd = await user("reader");
  must(await admin.from("memberships").insert({ user_id: rd.id, org_id: org, school_id: S, role: "teacher", is_active: true }), "mem");
  const rps = (act: string) => admin.rpc("_au_ps_ok", { _school: S, _uid: rd.id, _ps: `meetings:${act}` });
  const opn = () => admin.rpc("_perm_allows_user", { _school: S, _uid: rd.id, _section: "meetings", _action: "organize" });
  check("staff member without the grant: no automation read of meeting data", (await rps("organize")).data === false);
  must(await admin.from("perm_overrides").insert({ org_id: org, user_id: rd.id, section: "au_data", action: "meetings", effect: "grant", reason: "اختبار قراءة الأتمتة", created_by: U }), "grant");
  check("au_data.meetings grant: automation may read meeting data", (await rps("organize")).data === true);
  check("…but the operational permission (organize meetings) is NOT given by it", (await opn()).data === false);
  must(await admin.from("perm_overrides").insert({ org_id: org, user_id: rd.id, section: "au_data", action: "meetings", effect: "deny", reason: "اختبار المنع", created_by: U }).then((r) => r.error?.code === "23505" ? { data: null, error: null } : r), "deny");
  await admin.from("perm_overrides").delete().eq("org_id", org).eq("user_id", rd.id).eq("section", "au_data");
  check("removing the grant removes the automation read again", (await rps("organize")).data === false);
} catch (e) { check("suite ran", false, (e as Error).message); }
finally {
  for (const o of orgs) await tr.purgeOrg(o).catch(() => {});
  await tr.done?.().catch?.(() => {});
}
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
