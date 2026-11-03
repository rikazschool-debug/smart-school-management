// Isolated data (acb-) for the account/import browser journey + synthetic XLSX files in /tmp/browser/acc (fake names/IDs only).
// Run: NODE_PATH=node_modules bun scripts/accounts-browser-fixture.ts setup|teardown
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import * as XLSX from "xlsx";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "accounts-browser");
const DIR = "/tmp/browser/acc";
if (process.argv[2] === "teardown") {
  const f = JSON.parse(readFileSync(`${DIR}/fixture.json`, "utf8"));
  f.schools.forEach((x: string) => tr.addSchool(x));
  // accounts created by the app for this school (students/teachers/guardians) are removed too
  const staged = ((await admin.from("account_setup").select("user_id").in("school_id", f.schools)).data ?? []).map((x: any) => x.user_id);
  const linked = [
    ...((await admin.from("students").select("user_id").in("school_id", f.schools)).data ?? []),
    ...((await admin.from("teachers").select("user_id").in("school_id", f.schools)).data ?? []),
    ...((await admin.from("guardians").select("user_id").in("school_id", f.schools)).data ?? []),
  ].map((x: any) => x.user_id).filter(Boolean);
  const all = [...new Set([...f.users, ...staged, ...linked])];
  all.forEach((x) => tr.addUser(x));
  await tr.purgeOrg(f.org); for (const u of all) await admin.auth.admin.deleteUser(u).catch(() => undefined);
  console.log("teardown ok", all.length); process.exit(0);
}
const run = Date.now(), pw = "Test-pass-" + run, sfx = String(run).slice(-7);
async function user(tag: string) {
  const email = `acb-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id, email };
}
const owner = await user("owner"), pr = await user("pr"), sa = await user("sa");
const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الاستيراد", _school_name: "فرع الاستيراد" })).data;
const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
for (const [u, r] of [[pr, "principal"], [sa, "student_affairs"]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + r.error.message); return r.data as any; };
const year = await ins("academic_years", { name: "1448", start_date: "2026-08-20", end_date: "2027-06-30", is_current: true });
const stage = await ins("stages", { name: "ابتدائي" });
const g1 = await ins("grades", { name: "الأول الابتدائي", stage_id: stage.id }), g2 = await ins("grades", { name: "الثاني الابتدائي", stage_id: stage.id });
await ins("sections", { name: "أ", grade_id: g1.id, year_id: year.id, capacity: 30 });
await ins("sections", { name: "أ", grade_id: g2.id, year_id: year.id, capacity: 1 });
await ins("departments", { name: "العلوم" });
const id = (n: number) => `1${sfx}0${n}`.slice(0, 10);
const ph = (n: number) => `05${sfx}${n}`.slice(0, 10);
// ministry-like report: titles, labels, two-line header, English duplicate lines, one sheet per section
function sheet(grade: string, fasl: string, people: [string, string, string][]) {
  const aoa: any[][] = []; aoa[1] = [null, null, "المملكة العربية السعودية"]; aoa[6] = [null, null, null, grade, null, ":", null, "الصف"];
  aoa[14] = [null, null, fasl, null, null, ":", null, "الفصل"]; aoa[21] = [null, null, null, "كشف بيانات الطلاب"];
  aoa[24] = ["ملاحظات", "بيانات القيد", "تاريخ الميلاد", "بيانات الهوية", null, "اسم الطالب", "م"];
  aoa[25] = [null, "حالة القيد", "Date of birth", "رقمها", "نوعها", "Student's Name", null];
  people.forEach(([n, i, d], k) => { aoa.push(["", "مستجد", d, i, "رقم الهوية", n, k + 1]); aoa.push(["", "", d, "", "", "TEST NAME", ""]); });
  aoa.push([]); aoa.push(["طُبع آليًا"]);
  return XLSX.utils.aoa_to_sheet(aoa.map((r) => r ?? []));
}
mkdirSync(DIR, { recursive: true });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet("الأول الابتدائي", "1", [["سالم تجريبي الأول", id(1), "1436/05/10"], ["سعد تجريبي الثاني", id(2), "2015-04-02"]]), "Sheet1");
XLSX.utils.book_append_sheet(wb, sheet("الثاني الابتدائي", "1", [["فهد تجريبي الثالث", id(3), "2014-01-05"], ["خالد تجريبي الرابع", id(4), "2014-02-06"]]), "Sheet2");
writeFileSync(`${DIR}/students-report.xlsx`, Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })));
const tw = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(tw, XLSX.utils.aoa_to_sheet([["الإسم", "رقم الهوية", "الجوال", "البريد الإلكتروني", "التخصص", "القسم"], ["معلم تجريبي أول", id(7), ph(1), "", "علوم", "العلوم"], ["معلم تجريبي ثان", "", ph(2), "", "", "غير موجود"]]), "البيانات");
writeFileSync(`${DIR}/teachers.xlsx`, Buffer.from(XLSX.write(tw, { type: "buffer", bookType: "xlsx" })));
writeFileSync(`${DIR}/fixture.json`, JSON.stringify({ org, schools: [S], users: [...tr.users], pw, pr: pr.email, sa: sa.email, ids: [id(1), id(2), id(3), id(4)], single: { id: id(5), gphone: ph(5) } }));
console.log("setup ok");
