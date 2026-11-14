// Isolated student placement and tags delegation; no real accounts or messages.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { TestRun } from "./lib/test-run";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing test credentials");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const pk = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false } });
const tr = new TestRun(admin, "plp");
const run = Date.now(), password = `Placement-test-${run}`;
let org = "", failed = 0, passed = 0;
const check = (label: string, yes: boolean) => { if (yes) passed++; else failed++; console.log(yes ? "PASS" : "FAIL", label); };
const must = <T,>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };
async function user(label: string) {
  const email = `plp-${label}-${run}@rikaz.test`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  if (!created.user) throw new Error("Missing user");
  tr.addUser(created.user.id);
  const c = createClient(url as string, pk, { auth: { persistSession: false }, global: { fetch: (input, init = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${pk}`) h.delete("Authorization"); h.set("apikey", pk); return fetch(input, { ...init, headers: h }); } } });
  const auth = must(await c.auth.signInWithPassword({ email, password }));
  return { id: created.user.id, c, session: auth.session };
}
let keep = false;
try {
  const owner = await user("owner"), vp = await user("vice"), other = await user("other"), teacher = await user("teacher");
  org = must(await owner.c.rpc("create_organization", { _org_name: "تجربة تفويض التسكين", _school_name: "فرع التسكين" })) as string;
  const a = must(await admin.from("schools").select("id").eq("org_id", org).single()).id;
  const b = must(await admin.from("schools").insert({ org_id: org, name: "فرع خارج التفويض" }).select("id").single()).id;
  tr.addSchool(a); tr.addSchool(b);
  must(await admin.from("memberships").insert([{ org_id: org, school_id: a, user_id: vp.id, role: "vice_principal" }, { org_id: org, school_id: a, user_id: other.id, role: "vice_principal" }, { org_id: org, school_id: a, user_id: teacher.id, role: "teacher" }]));
  const year = must(await admin.from("academic_years").insert({ school_id: a, name: "سنة التجربة", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single()).id;
  const stage = must(await admin.from("stages").insert({ school_id: a, name: "مرحلة التجربة" }).select("id").single()).id;
  const grade = must(await admin.from("grades").insert({ school_id: a, stage_id: stage, name: "صف التجربة" }).select("id").single()).id;
  const sec = async (name: string, capacity: number) => must(await admin.from("sections").insert({ school_id: a, year_id: year, grade_id: grade, name, capacity }).select("id").single()).id;
  const s1 = await sec("شعبة أولى", 5), s2 = await sec("شعبة ثانية", 5), full = await sec("شعبة مكتملة", 1);
  const kid = must(await admin.from("students").insert({ school_id: a, full_name: "طالب تفويض التسكين" }).select("id").single()).id;
  const kid2 = must(await admin.from("students").insert({ school_id: a, full_name: "طالب المقعد الوحيد" }).select("id").single()).id;
  const foreign = must(await admin.from("students").insert({ school_id: b, full_name: "طالب الفرع الآخر" }).select("id").single()).id;
  const place = (c: SupabaseClient, student: string, section: string) => c.rpc("student_place", { _student: student, _section: section });
  check("vice cannot place by default", !!(await place(vp.c, kid, s1)).error);
  const grants = [{ section: "people_family", action: "place", scope: "branch" }, { section: "people", action: "view", scope: "branch" }, { section: "people", action: "tags_assign", scope: "branch" }];
  const role = must(await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "تسكين ووسوم فقط", _description: "لا تعديل للملفات", _grants: grants, _reason: "تجربة تفويض" }));
  must(await owner.c.rpc("perm_assign", { _org: org, _user: vp.id, _role: role, _assign: true, _school_ids: [a], _limit: null, _reason: "تجربة تفويض" }));
  const first = must(await place(vp.c, kid, s1));
  check("vice places after owner grant", typeof first === "string");
  check("same placement retry is idempotent", must(await place(vp.c, kid, s1)) === first);
  must(await place(vp.c, kid, s2));
  const enrs = must(await admin.from("enrollments").select("section_id,status").eq("student_id", kid));
  check("transfer keeps exactly one active placement", enrs.filter(x => x.status === "active").length === 1 && enrs.some(x => x.section_id === s2 && x.status === "active") && enrs.some(x => x.section_id === s1 && x.status === "ended"));
  must(await place(owner.c, kid2, full));
  check("full class refuses transfer", !!(await place(vp.c, kid, full)).error);
  check("failed transfer retains old active placement", must(await admin.from("enrollments").select("section_id").eq("student_id", kid).eq("status", "active").single()).section_id === s2);
  const edit = await vp.c.from("students").update({ full_name: "غير مسموح" }).eq("id", kid).select("id");
  check("placement grant cannot edit student records", !!edit.error || edit.data?.length === 0);
  check("placement grant cannot create guardians", !!(await vp.c.from("guardians").insert({ school_id: a, full_name: "غير مسموح" })).error);
  check("other vice stays unable to place", !!(await place(other.c, kid, s1)).error);
  check("cross branch student is refused", !!(await place(vp.c, foreign, s1)).error);
  const tag = must(await owner.c.rpc("pp_tag_save", { _org: org, _id: null, _name: "متابعة التسكين", _color: "green", _kinds: ["student"], _active: true }));
  check("vice assigns tag without record edit", !(await vp.c.rpc("pp_tag_set", { _kind: "student", _id: kid, _tag: tag, _on: true })).error);
  check("tag grant cannot manage dictionary", !!(await vp.c.rpc("pp_tag_save", { _org: org, _id: null, _name: "غير مسموح", _color: "green", _kinds: ["student"], _active: true })).error);
  check("tag branch isolation", !!(await vp.c.rpc("pp_tag_set", { _kind: "student", _id: foreign, _tag: tag, _on: true })).error);
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: vp.id, _section: "people_family", _action: "place", _effect: "deny", _scope: null, _reason: "تجربة المنع" }));
  check("explicit deny defeats role", !!(await place(vp.c, kid, s1)).error);
  const direct = await vp.c.from("enrollments").insert({ school_id: a, student_id: kid, section_id: s1, year_id: year });
  check("direct enrollment insert also refused after deny", !!direct.error);
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: vp.id, _section: "people_family", _action: "place", _effect: null, _scope: null, _reason: "إعادة التفويض" }));
  check("removing deny restores placement", !(await place(vp.c, kid, s1)).error);
  check("teacher cannot self grant", !!(await teacher.c.rpc("perm_role_save", { _org: org, _id: null, _name: "رفع ذاتي", _description: "", _grants: grants, _reason: "غير مسموح" })).error);
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: other.id, _section: "people_family", _action: "edit", _effect: "grant", _scope: "branch", _reason: "توافق التفويض" }));
  check("existing record edit grant retains placement", !(await place(other.c, kid, s2)).error);
  must(await owner.c.rpc("perm_override_set", { _org: org, _user: other.id, _section: "people_family", _action: "place", _effect: "deny", _scope: null, _reason: "منع مستقل" }));
  check("placement deny defeats bundled edit compatibility", !!(await place(other.c, kid, s1)).error);
  const catalog = must(await owner.c.rpc("perm_catalog"));
  check("academic years has independent real view/edit actions", catalog.sections.find((s: { key: string }) => s.key === "academic_years")?.actions.join(",") === "view,edit");
  check("locked catalog entry cannot be forged into role", !!(await owner.c.rpc("perm_role_save", { _org: org, _id: null, _name: "اختبار قفل", _description: "", _grants: [{ section: "academic_setup_info", action: "edit", scope: "branch" }], _reason: "غير مدعوم" })).error);
  if (process.argv.includes("--keep") && failed === 0) {
    keep = true; mkdirSync("/tmp/browser/perm332", { recursive: true });
    writeFileSync("/tmp/browser/perm332/fixture.json", JSON.stringify({ org, a, b, kid, s1, s2, role, users: { owner, vp, other, teacher } }, (_k, v) => v && typeof v === "object" && "auth" in v && "from" in v ? undefined : v));
    writeFileSync("/tmp/browser/perm332/cleanup.json", JSON.stringify({ org, schools: [...tr.schools], users: [...tr.users] }));
  }
} catch (e) { failed++; console.error("FAIL", e instanceof Error ? e.message : "test error"); }
finally {
  if (!keep) { if (org) await tr.purgeOrg(org); for (const id of tr.users) await admin.auth.admin.deleteUser(id); }
}
console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);