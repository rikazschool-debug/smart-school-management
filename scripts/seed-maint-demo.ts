// Creates the four maintenance demo accounts in the demo owner's org (every branch), assigned by the owner via perm_assign.
// Run: NODE_PATH=node_modules bun scripts/seed-maint-demo.ts   (idempotent)
import { createClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo-accounts";

const URL = process.env.SUPABASE_URL!, PK = process.env.SUPABASE_PUBLISHABLE_KEY!;
const a = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const shim = (key: string) => (input: any, init?: any) => { const h = new Headers(init?.headers); if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const owner = createClient(URL, PK, { auth: { persistSession: false }, global: { fetch: shim(PK) as any } });
const s = await owner.auth.signInWithPassword({ email: "demo-owner@rikaz.demo", password: DEMO_PASSWORD });
if (s.error) throw s.error;
const { data: om } = await a.from("memberships").select("org_id").eq("user_id", s.data.user!.id).eq("role", "org_owner").limit(1).single();
const org = om!.org_id as string;
const { data: schools } = await a.from("schools").select("id,name").eq("org_id", org);
const ids = schools!.map((x) => x.id);
const { data: roles } = await owner.rpc("perm_roles_list", { _org: org });
const { data: list } = await a.auth.admin.listUsers({ perPage: 1000 });
for (const acc of DEMO_ACCOUNTS.filter((d) => d.template)) {
  let uid = list.users.find((u) => u.email === acc.email)?.id;
  if (!uid) { const r = await a.auth.admin.createUser({ email: acc.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: acc.name } }); if (r.error) throw r.error; uid = r.data.user!.id; }
  await a.from("profiles").upsert({ id: uid, full_name: acc.name });
  for (const sc of ids) {
    const ex = await a.from("memberships").select("id").eq("user_id", uid).eq("school_id", sc).maybeSingle();
    if (!ex.data) { const m = await a.from("memberships").insert({ user_id: uid, org_id: org, school_id: sc, role: "teacher" }); if (m.error) throw m.error; }
  }
  const tpl = (roles as any[]).find((r) => r.name === acc.template);
  const r = await owner.rpc("perm_assign", { _org: org, _user: uid, _role: tpl.id, _assign: true, _school_ids: ids, _limit: null, _reason: "حساب تجريبي" });
  console.log(acc.label, r.error ? r.error.message : "ok");
}
console.log("branches:", schools!.map((x) => x.name).join("، "));
