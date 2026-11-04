// One-time, idempotent setup of the real organization «مجموعة المالكي التعليمية» and its owner.
// The owner password is random and never printed; the owner sets their own via the reset email.
// Run: NODE_PATH=node_modules bun scripts/setup-almalki-org.ts
import { createClient } from "@supabase/supabase-js";

const a = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const EMAIL = "gr.almalkigroup@gmail.com";
const ORG = "مجموعة المالكي التعليمية";
const SITE = "https://clever-campus-collective.lovable.app";
const BRANCHES = [
  { name: "مدارس الضاحية الأهلية للبنين", city: "بنين", form: "الضاحية (بنين)" },
  { name: "مدارس الضاحية الأهلية للبنات", city: "بنين وبنات", form: "الضاحية (بنات)" },
  { name: "مدارس أجيال المعالى الاهلية", city: "بنين وبنات", form: "أجيال المعالي" },
  { name: "مدارس قناديل الشرق الاهلية", city: "بنين وبنات", form: "قناديل الشرق" },
];
const chk = (r: any) => { if (r.error) throw r.error; return r.data; };

// 1) owner account (reuse if present, never change its password)
const { data: list } = await a.auth.admin.listUsers({ perPage: 1000 });
let uid = list.users.find((u) => u.email?.toLowerCase() === EMAIL)?.id;
let created = false;
if (!uid) {
  const pw = crypto.randomUUID() + crypto.randomUUID();
  uid = chk(await a.auth.admin.createUser({ email: EMAIL, password: pw, email_confirm: true, user_metadata: { full_name: "مالك مجموعة المالكي" } })).user.id;
  created = true;
  await a.from("profiles").upsert({ id: uid, full_name: "مالك مجموعة المالكي" });
}

// 2) organization
let org = chk(await a.from("organizations").select("id").eq("name", ORG).maybeSingle())?.id;
if (!org) org = chk(await a.from("organizations").insert({ name: ORG, created_by: uid }).select("id").single()).id;

// 3) owner membership (org-level, school null)
const om = chk(await a.from("memberships").select("id").eq("user_id", uid).eq("org_id", org).eq("role", "org_owner").maybeSingle());
if (!om) chk(await a.from("memberships").insert({ user_id: uid, org_id: org, school_id: null, role: "org_owner" }));

// 4) four branches (reuse by name within this org only)
const map: Record<string, string> = {};
for (const b of BRANCHES) {
  let id = chk(await a.from("schools").select("id").eq("org_id", org).eq("name", b.name).maybeSingle())?.id;
  if (!id) id = chk(await a.from("schools").insert({ org_id: org, name: b.name, city: b.city }).select("id").single()).id;
  map[b.form] = id;
}

// 5) admissions on + form-value mapping
chk(await a.from("org_sections").upsert({ org_id: org, section: "admissions", enabled: true, reason: "تفعيل عند الإعداد", changed_by: uid }));
const st = chk(await a.from("ad_settings").select("school_map").eq("org_id", org).maybeSingle());
if (st) chk(await a.from("ad_settings").update({ school_map: { ...st.school_map, ...map }, updated_by: uid }).eq("org_id", org));
else chk(await a.from("ad_settings").insert({ org_id: org, school_map: map, updated_by: uid }));

// 6) owner chooses their own password via email
if (created) {
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const r = await anon.auth.resetPasswordForEmail(EMAIL, { redirectTo: `${SITE}/reset-password` });
  console.log("password email:", r.error ? r.error.message : "sent");
}
console.log(JSON.stringify({ created, org, branches: Object.keys(map).length }));
