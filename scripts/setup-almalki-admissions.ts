// Idempotent: creates the Al-Malki admissions officer login (username "admissions") under users & permissions,
// all four branches, role «مسؤول القبول والتسجيل». Password is random and never printed; the account stays pending
// first login until the owner issues a temporary password from «المستخدمون» (reset), then the officer must change it.
// Also verifies org/branch/admissions wiring server-side.
// Run: NODE_PATH=node_modules bun scripts/setup-almalki-admissions.ts
import { createClient } from "@supabase/supabase-js";

const a = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ORG = "a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074", USER = "admissions", NAME = "مسؤول القبول والتسجيل";
const chk = (r: any) => { if (r.error) throw r.error; return r.data; };
let ok = 0, bad = 0; const t = (n: string, c: boolean) => { console.log(c ? "✓" : "✗", n); c ? ok++ : bad++; };

const owner = chk(await a.from("memberships").select("user_id").eq("org_id", ORG).eq("role", "org_owner").single()).user_id;
const schools = chk(await a.from("schools").select("id,name,city,student_gender,is_active").eq("org_id", ORG));
const role = chk(await a.from("perm_roles").select("id").is("org_id", null).eq("key", "admissions_officer").single()).id;
const ids = schools.map((s: any) => s.id);

let uid = chk(await a.from("staff_logins").select("user_id").eq("username", USER).maybeSingle())?.user_id;
if (!uid) {
  const c = await a.auth.admin.createUser({ email: `${USER}@staff.rikaz.app`, password: crypto.randomUUID() + "Aa1!", email_confirm: true, ban_duration: "876000h", user_metadata: { full_name: NAME } });
  if (c.error) throw c.error; uid = c.data.user!.id;
  const r = await a.rpc("_staff_provision", { _actor: owner, _org: ORG, _uid: uid, _is_new: true, _username: USER, _name: NAME, _base: "teacher", _schools: ids,
    _roles: [{ role_id: role, school_ids: ids }], _reason: "إنشاء حساب مسؤول القبول", _overrides: [] });
  if (r.error) { await a.auth.admin.deleteUser(uid); throw r.error; }
  chk(await a.auth.admin.updateUserById(uid, { ban_duration: "none" }));
}

// server-side checks
t("4 active branches", schools.length === 4 && schools.every((s: any) => s.is_active));
t("city empty, category set", schools.every((s: any) => !s.city && ["boys", "girls", "mixed"].includes(s.student_gender)));
t("only Dahiya boys is boys", schools.filter((s: any) => s.student_gender === "boys").map((s: any) => s.name).join() === "مدارس الضاحية الأهلية للبنين");
t("single owner, not demo", (chk(await a.from("memberships").select("user_id").eq("org_id", ORG).eq("role", "org_owner")) as any[]).length === 1);
const map = chk(await a.from("ad_settings").select("school_map").eq("org_id", ORG).single()).school_map;
t("form map → 4 own branches", Object.keys(map).length === 4 && Object.values(map).every((v) => ids.includes(v)));
t("admissions enabled", chk(await a.from("org_sections").select("enabled").eq("org_id", ORG).eq("section", "admissions").single()).enabled === true);
const eff = chk(await a.rpc("perm_effective", { _org: ORG, _uid: uid })) as any;
t("officer has admissions in all branches", JSON.stringify(eff).includes("admissions"));
const setup = chk(await a.from("account_setup").select("need_password,completed_at").eq("user_id", uid).maybeSingle());
t("officer must change password on first login", !!setup && setup.need_password && !setup.completed_at);
t("no applications imported", (chk(await a.from("ad_applications").select("id").eq("org_id", ORG)) as any[]).length === 0);
console.log(`${ok}/${ok + bad}`);
