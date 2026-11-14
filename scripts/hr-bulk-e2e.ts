// HR bulk actions (hr_employee_bulk) + guardian children (hr_employee_children) on a temp employee in the demo org.
// Run: NODE_PATH=node_modules bun scripts/hr-bulk-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(email: string, pw: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw new Error(email + " " + s.error.message); return c; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const owner = await as("demo-owner@rikaz.demo", process.env.DEMO_OWNER_PW ?? "25011741Aamm");
const teacher = await as("demo-teacher@rikaz.demo", DEMO_PASSWORD);
const gu = (await admin.from("guardians").select("school_id, national_id, full_name").not("national_id", "is", null).limit(1).single()).data!;
const org = (await admin.from("schools").select("org_id").eq("id", gu.school_id).single()).data!.org_id;
const schools = ((await admin.from("schools").select("id").eq("org_id", org)).data ?? []).map((s: any) => s.id);
const S1 = gu.school_id, S2 = schools.find((s: string) => s !== S1);
const e = (await admin.from("hr_employees").insert({ org_id: org, employee_no: "BLK-" + Date.now(), full_name: "اختبار نقل جماعي", national_id: gu.national_id, status: "active" }).select("id").single()).data!.id;
await admin.from("hr_assignments").insert({ org_id: org, employee_id: e, school_id: S1, job_title: "إداري", start_date: "2025-01-01", is_primary: true });
const run = (c: any, action: string, p: object = {}) => c.rpc("hr_employee_bulk", { _org: org, _ids: [e], _action: action, _p: p, _reason: "اختبار" });
const ch = await owner.rpc("hr_employee_children", { _emp: e });
check("1 children of an employee-guardian (same ID) are listed", !ch.error && (ch.data as any[]).length > 0, ch.error ?? ch.data);
check("2 teacher cannot run bulk actions", ((await run(teacher, "suspend")).data ?? [{ ok: false }])[0].ok === false);
check("3 reason required", !!(await owner.rpc("hr_employee_bulk", { _org: org, _ids: [e], _action: "suspend", _p: {}, _reason: "" })).error);
if (S2) {
  const t = await run(owner, "transfer", { school_id: S2 });
  const asg = (await admin.from("hr_assignments").select("school_id,end_date,is_primary,job_title").eq("employee_id", e)).data ?? [];
  check("4 transfer: new primary assignment in target branch, job kept", !t.error && asg.some((a: any) => a.school_id === S2 && a.is_primary && a.job_title === "إداري" && !a.end_date), t.error ?? asg);
  check("5 transfer: old branch assignment ended", asg.some((a: any) => a.school_id === S1 && a.end_date), asg);
} else console.log("SKIP 4-5 only one branch");
const st = async () => (await admin.from("hr_employees").select("status").eq("id", e).single()).data!.status;
await run(owner, "suspend"); check("6 suspend", (await st()) === "suspended");
await run(owner, "activate"); check("7 back to work", (await st()) === "active");
await run(owner, "archive"); check("8 delete moves to archive (file kept)", (await st()) === "archived");
check("9 archive ends open assignments", ((await admin.from("hr_assignments").select("id").eq("employee_id", e).is("end_date", null)).data ?? []).length === 0);
const l = (await owner.rpc("hr_employee_list", { _org: org, _status: "archived" })).data as any[];
check("10 archive list shows it", l.some((x) => x.id === e));
await run(owner, "restore"); check("11 restore from archive", (await st()) === "active");
check("12 actions logged", ((await admin.from("hr_events").select("id").eq("entity_id", e).like("action", "status:%")).data ?? []).length >= 4);
await admin.from("hr_events").delete().eq("entity_id", e); await admin.from("hr_assignments").delete().eq("employee_id", e); await admin.from("hr_employees").delete().eq("id", e);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
