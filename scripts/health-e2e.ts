// School health (health_*): health counselor (nurse) runs the section, principal reads, teacher blocked, guardian edits own entries.
// Run: NODE_PATH=node_modules bun scripts/health-e2e.ts  (uses demo accounts; cleans its rows)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(email: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD }); if (s.error) throw new Error(email + " " + s.error.message); return { c, uid: s.data.user!.id }; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const nurse = await as("demo-nurse@rikaz.demo"), pr = await as("demo-principal@rikaz.demo"), te = await as("demo-teacher@rikaz.demo"), gu = await as("demo-guardian@rikaz.demo");
const S = (await admin.from("memberships").select("school_id").eq("user_id", nurse.uid).eq("role", "nurse").single()).data!.school_id;
const g = (await admin.from("guardians").select("id").eq("user_id", gu.uid).eq("school_id", S).single()).data!;
const kid = (await admin.from("student_guardians").select("student_id").eq("guardian_id", g.id).eq("verified", true).eq("can_follow", true).limit(1).single()).data!.student_id;
const other = (await admin.from("students").select("id").eq("school_id", S).neq("id", kid).limit(1).single()).data!.id;

const l = await nurse.c.rpc("health_students", { _school: S });
check("1 health counselor lists all school students", !l.error && (l.data as any[]).length >= 2 && (l.data as any[]).some((x) => x.id === other), l.error);
check("2 teacher cannot list health files", !!(await te.c.rpc("health_students", { _school: S })).error);
check("3 principal can view files", !(await pr.c.rpc("health_file", { _student: kid })).error);
check("4 principal cannot record events by default", !!(await pr.c.rpc("health_event_add", { _student: kid, _p: { kind: "visit", summary: "x" } })).error);
check("5 guardian saves health card for own child", !(await gu.c.rpc("health_profile_save", { _student: kid, _p: { blood_type: "O+", allergies: "فول سوداني" } })).error);
check("6 guardian cannot open another student's file", !!(await gu.c.rpc("health_file", { _student: other })).error);
const gm = await gu.c.rpc("health_med_save", { _student: kid, _id: null, _p: { name: "بخاخ ربو", dose: "بخّتان", times: ["10:00", "bad"], at_school: true } });
check("7 guardian adds a medication (only valid times kept)", !gm.error && (await admin.from("health_meds").select("times").eq("id", gm.data).single()).data!.times.join() === "10:00", gm.error);
const nc = await nurse.c.rpc("health_condition_save", { _student: kid, _id: null, _p: { name: "ربو", severity: "high" } });
check("8 health counselor adds a condition", !nc.error, nc.error);
check("9 guardian cannot edit the school's entry", !!(await gu.c.rpc("health_condition_save", { _student: kid, _id: nc.data, _p: { name: "تغيير" } })).error);
check("10 guardian cannot delete the school's entry", !!(await gu.c.rpc("health_item_remove", { _kind: "condition", _id: nc.data })).error);
const today = (await nurse.c.rpc("health_today", { _school: S })).data as any;
check("11 at-school medication appears in today's doses", today.doses.some((d: any) => d.med_id === gm.data && !d.given), today.doses);
const ev = await nurse.c.rpc("health_event_add", { _student: kid, _p: { kind: "med_given", med_id: gm.data, summary: "إعطاء بخاخ", action_taken: "10:00", shared: true } });
check("12 health counselor records medication given", !ev.error, ev.error);
const t2 = (await nurse.c.rpc("health_today", { _school: S })).data as any;
check("13 dose marked as given", t2.doses.some((d: any) => d.med_id === gm.data && d.given));
const ev2 = await nurse.c.rpc("health_event_add", { _student: kid, _p: { kind: "note", summary: "ملاحظة داخلية", shared: false } });
const gf = (await gu.c.rpc("health_file", { _student: kid })).data as any;
check("14 guardian sees shared events only", gf.events.some((e: any) => e.id === ev.data) && !gf.events.some((e: any) => e.id === ev2.data));
check("15 guardian notified once of shared event", ((await admin.from("notifications").select("id").eq("user_id", gu.uid).eq("dedupe_key", "health-e:" + ev.data)).data ?? []).length === 1);
check("16 health counselor notified of guardian update", ((await admin.from("notifications").select("id").eq("user_id", nurse.uid).like("dedupe_key", "health-g:" + kid + "%")).data ?? []).length >= 1);
check("17 tables not readable directly", ((await nurse.c.from("health_meds" as any).select("id")).data ?? []).length === 0);
// cleanup
await admin.from("health_events").delete().eq("student_id", kid);
await admin.from("health_meds").delete().eq("student_id", kid); await admin.from("health_conditions").delete().eq("student_id", kid);
await admin.from("health_profiles").delete().eq("student_id", kid); await admin.from("health_log").delete().eq("student_id", kid);
await admin.from("notifications").delete().or(`dedupe_key.like.health-e:%,dedupe_key.like.health-g:${kid}%`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
