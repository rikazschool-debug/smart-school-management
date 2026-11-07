// Guardians template import (import_guardian_row): dry run vs write, create/link/exists/conflict, re-import idempotent,
// links unverified, C‑Smart leading zeros, non-manager rejected. Isolated data (gix-), cleaned up through TestRun.
// Run: NODE_PATH=node_modules bun scripts/guardian-import-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "gix");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const emails: Record<string, string> = {}; let org = "";
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
try {
  for (const t of ["owner", "out"]) {
    const email = `gix-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (r.error) throw r.error; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة الاستيراد", _school_name: "مدرسة الاستيراد" })) as string;
  const school = must(await admin.from("schools").select("id").eq("org_id", org).single())!.id; tr.addSchool(school);
  const s1 = must(await oc.from("students").insert({ school_id: school, full_name: "ابن أول", national_id: "1100000001", csmart_no: "٠٠٤٥", status: "active" }).select("id, csmart_no").single())!;
  check("C‑Smart stored as text with leading zeros (Arabic digits converted)", s1.csmart_no === "0045", s1);
  const s2 = must(await oc.from("students").insert({ school_id: school, full_name: "ابن ثان", national_id: "1100000002", csmart_no: "0046", status: "active" }).select("id").single())!;
  const dup = await oc.from("students").insert({ school_id: school, full_name: "مكرر", national_id: "1100000003", csmart_no: "0045", status: "active" });
  check("duplicate C‑Smart in school rejected", !!dup.error);
  const row = (o: Record<string, string> = {}) => ({ full_name: "ولي أمر", national_id: "1200000001", phone: "966501112233", email: "", relationship: "father", student_nid: "", student_csmart: "0045", ...o });
  const rpc = async (c: any, r: any, dry: boolean) => must(await c.rpc("import_guardian_row", { _school: school, _row: r, _dry: dry })) as any;
  const d1 = await rpc(oc, row(), true);
  check("dry run says create", d1.action === "create", d1);
  check("dry run writes nothing", (await admin.from("guardians").select("id").eq("school_id", school)).data!.length === 0);
  const w1 = await rpc(oc, row(), false);
  check("write creates guardian", w1.action === "create", w1);
  const w2 = await rpc(oc, row({ student_csmart: "", student_nid: "1100000002" }), false);
  check("same guardian, second child → link to existing", w2.action === "link" && w2.guardian_id === w1.guardian_id, w2);
  const w3 = await rpc(oc, row(), false);
  check("re-import → exists, no duplicate", w3.action === "exists", w3);
  const links = must(await admin.from("student_guardians").select("verified").eq("school_id", school)) as any[];
  check("two links only, both unverified", links.length === 2 && links.every((l) => !l.verified), links);
  check("one guardian record", (await admin.from("guardians").select("id").eq("school_id", school)).data!.length === 1);
  const c1 = await rpc(oc, row({ phone: "966509999999" }), true);
  check("same ID with different mobile → conflict", c1.action === "conflict", c1);
  const c2 = await rpc(oc, row({ national_id: "1200000009" }), true);
  check("mobile of another guardian ID → conflict", c2.action === "conflict", c2);
  const c3 = await rpc(oc, row({ student_nid: "1100000002", student_csmart: "0045" }), true);
  check("child ID and C‑Smart of different students → conflict", c3.action === "conflict", c3);
  const c4 = await rpc(oc, row({ relationship: "mother" }), true);
  check("existing link with other relationship → conflict", c4.action === "conflict", c4);
  const e1 = await rpc(oc, row({ student_csmart: "9999" }), true);
  check("unknown child → error", e1.action === "error", e1);
  const out = await as("out");
  const x = await out.rpc("import_guardian_row", { _school: school, _row: row(), _dry: true });
  check("non-manager rejected", !!x.error, x.data);
  const ph = await oc.from("guardians").update({ phone: "0507776655" }).eq("id", w1.guardian_id);
  const log = must(await oc.from("guardian_phone_log").select("old_phone, new_phone").eq("guardian_id", w1.guardian_id)) as any[];
  check("phone change normalized and logged", !ph.error && log.length === 1 && log[0].new_phone === "966507776655", { e: ph.error, log });
  const bad = await oc.from("guardians").update({ phone: "123" }).eq("id", w1.guardian_id);
  check("invalid mobile rejected", !!bad.error);
} catch (e) { fail++; console.log("FAIL exception", e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) await tr.purgeOrg(org).catch((e) => console.log("cleanup:", e.message));
  await tr.deleteUsers?.().catch?.(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
