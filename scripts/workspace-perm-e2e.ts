// Isolated workspace delegation; --keep enables browser verification, --teardown cleans only this run.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { TestRun } from "./lib/test-run";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing test credentials");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const pk = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });
const tr = new TestRun(admin, "ws334");
const dir = "/tmp/browser/ws334";
if (process.argv.includes("--teardown")) {
  const f = JSON.parse(readFileSync(`${dir}/cleanup.json`, "utf8"));
  for (const u of f.users) tr.addUser(u);
  for (const s of f.schools) tr.addSchool(s);
  await tr.purgeOrg(f.org);
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(0);
}
const must = <T,>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };
let passed = 0, failed = 0, org = "", keep = false;
const check = (label: string, value: boolean) => { value ? passed++ : failed++; console.log(value ? "PASS" : "FAIL", label); };
const run = Date.now(), password = `Workspace-${run}`;
async function user(label: string) {
  const email = `ws334-${label}-${run}@rikaz.test`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (!created.user) throw new Error("Missing user");
  tr.addUser(created.user.id);
  const c = createClient(url as string, pk, { auth: { persistSession: false }, global: { fetch: (input, init = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${pk}`) h.delete("Authorization"); h.set("apikey", pk); return fetch(input, { ...init, headers: h }); } } });
  const auth = must(await c.auth.signInWithPassword({ email, password }));
  return { id: created.user.id, c, session: auth.session };
}
try {
  const owner = await user("owner"), delegate = await user("delegate"), other = await user("other");
  org = must(await owner.c.rpc("create_organization", { _org_name: "تجربة تخصيص الأقسام", _school_name: "فرع التفويض" })) as string;
  const a = must(await admin.from("schools").select("id").eq("org_id", org).single()).id;
  const b = must(await admin.from("schools").insert({ org_id: org, name: "فرع خارج التفويض" }).select("id").single()).id;
  tr.addSchool(a); tr.addSchool(b);
  must(await admin.from("memberships").insert([{ org_id: org, school_id: a, user_id: delegate.id, role: "nurse" }, { org_id: org, school_id: b, user_id: delegate.id, role: "nurse" }, { org_id: org, school_id: a, user_id: other.id, role: "teacher" }]));
  const override = (section: string, action: string, effect: string | null) => owner.c.rpc("perm_override_set", { _org: org, _user: delegate.id, _section: section, _action: action, _effect: effect, _scope: effect === "grant" ? "branch" : null, _reason: "تجربة التفويض" });
  const catalog = must(await owner.c.rpc("perm_catalog"));
  for (const s of ["academic_years", "academic_terms", "academic_stages", "academic_grades", "academic_sections", "academic_departments", "academic_subjects", "academic_scopes", "course_setup", "course_assignments", "admin_tasks", "admin_requests", "admin_forms", "schedule_drafts", "schedule_day", "schedule_rooms", "schedule_loads", "schedule_requirements", "schedule_availability", "schedule_sub_policy"]) {
    check(`${s} real view/action catalog`, catalog.sections.some((x: { key: string; actions: string[]; locked_reason?: string }) => x.key === s && x.actions.includes("view") && x.actions.length > 1 && !x.locked_reason));
  }
  check("no default academic year write", !!(await delegate.c.from("academic_years").insert({ school_id: a, name: "ممنوع", start_date: "2026-08-01", end_date: "2027-07-31" })).error);
  const grants = [
    { section: "academic_years", action: "edit", scope: "branch" },
    { section: "academic_stages", action: "view", scope: "branch" },
    { section: "schedule_drafts", action: "create", scope: "branch" },
    { section: "admin_forms", action: "view", scope: "branch" },
    { section: "bt_schedule", action: "view", scope: "branch" },
  ];
  const role = must(await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "مفوّض أقسام التجربة", _description: "صلاحيات مستقلة", _grants: grants, _reason: "تجربة" }));
  must(await owner.c.rpc("perm_assign", { _org: org, _user: delegate.id, _role: role, _assign: true, _school_ids: [a], _limit: null, _reason: "تجربة" }));
  const year = must(await delegate.c.from("academic_years").insert({ school_id: a, name: "سنة مفوضة", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single()).id;
  check("role grant creates academic year", !!year);
  check("saved year reads back", must(await delegate.c.from("academic_years").select("name").eq("id", year).single()).name === "سنة مفوضة");
  check("year edit does not grant stage edit", !!(await delegate.c.from("stages").insert({ school_id: a, name: "ممنوع" })).error);
  check("branch role does not follow user to second branch", !!(await delegate.c.from("academic_years").insert({ school_id: b, name: "ممنوع", start_date: "2026-08-01", end_date: "2027-07-31" })).error);
  check("another person has no delegated write", !!(await other.c.from("academic_years").insert({ school_id: a, name: "ممنوع", start_date: "2026-08-01", end_date: "2027-07-31" })).error);
  must(await override("academic_years", "edit", "deny"));
  const denied = await delegate.c.from("academic_years").update({ name: "ممنوع" }).eq("id", year).select("id");
  check("explicit deny defeats role edit", !!denied.error || denied.data?.length === 0);
  must(await override("academic_years", "edit", null));
  check("lifting deny restores role write", must(await delegate.c.from("academic_years").update({ name: "سنة مفوضة" }).eq("id", year).select("id")).length === 1);
  const tt = must(await delegate.c.from("timetables").insert({ school_id: a, year_id: year, name: "مسودة مفوضة", status: "draft" }).select("id").single()).id;
  check("create draft independently", !!tt);
  const tedit = await delegate.c.from("timetables").update({ name: "ممنوع" }).eq("id", tt).select("id");
  check("draft create does not grant edit", !!tedit.error || tedit.data?.length === 0);
  check("draft create does not grant publish", !!(await delegate.c.rpc("publish_timetable", { _id: tt, _from: "2026-11-15" })).error);
  check("authorized draft validation works", !(await delegate.c.rpc("tt_validate", { _tt: tt })).error);
  check("view form does not grant editing", !!(await delegate.c.rpc("adm_save_form", { _id: null, _school: a, _d: {} })).error);
  await must(await override("admin_tasks", "create", "grant"));
  const pool = must(await delegate.c.rpc("people_pick", { _purpose: "task", _school: a, _limit: 20 }));
  check("delegated creator receives protected task pool", Array.isArray(pool) && pool.some((p: { user_id: string }) => p.user_id === other.id));
  check("cannot self-grant permissions", !!(await delegate.c.rpc("perm_role_save", { _org: org, _id: null, _name: "ممنوع", _description: "", _grants: grants, _reason: "ممنوع" })).error);
  must(await owner.c.rpc("perm_assign", { _org: org, _user: delegate.id, _role: role, _assign: false, _school_ids: [a], _limit: null, _reason: "اختبار السحب" }));
  check("role withdrawal stops writes immediately", !!(await delegate.c.from("academic_years").insert({ school_id: a, name: "ممنوع", start_date: "2026-08-01", end_date: "2027-07-31" })).error);
  must(await owner.c.rpc("perm_assign", { _org: org, _user: delegate.id, _role: role, _assign: true, _school_ids: [a], _limit: null, _reason: "تحقق المتصفح" }));
  must(await owner.c.rpc("set_active_context", { _role: "org_owner", _school: a }));
  must(await delegate.c.rpc("set_active_context", { _role: "nurse", _school: a }));
  if (process.argv.includes("--keep") && !failed) {
    keep = true; mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/fixture.json`, JSON.stringify({ org, a, b, year, tt, role, users: { owner, delegate, other } }, (_k, v) => v && typeof v === "object" && "auth" in v && "from" in v ? undefined : v));
    writeFileSync(`${dir}/cleanup.json`, JSON.stringify({ org, schools: [...tr.schools], users: [...tr.users] }));
  }
} catch (e) { failed++; console.error("FAIL", e instanceof Error ? e.message : "test error"); }
finally { if (!keep) { if (org) await tr.purgeOrg(org); for (const id of tr.users) await admin.auth.admin.deleteUser(id); } }
console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);