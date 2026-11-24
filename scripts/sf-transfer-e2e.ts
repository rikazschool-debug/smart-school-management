import "./lib/user-pool.ts";
// Optional bank-transfer image on a student payment (synthetic org «اختبار المالية …», never Al-Malek). In-app only.
// Run: NODE_PATH=node_modules bun scripts/sf-transfer-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const must = <T,>(r: { data: T; error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
async function user(tag: string) {
  const email = `sft-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, id: s.data.user!.id };
}
const owner = await user("owner"), teacher = await user("teacher");
try {
  const org = must(await owner.c.rpc("create_organization", { _org_name: `اختبار المالية ${run}`, _school_name: "فرع الحوالات" }), "org") as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single(), "school")!.id as string;
  must(await admin.from("memberships").insert({ user_id: teacher.id, org_id: org, school_id: S, role: "teacher" }), "membership");
  const Y = must(await owner.c.from("academic_years").insert({ school_id: S, name: "1448/1449", start_date: "2026-08-01", end_date: "2027-07-31", is_current: true }).select("id").single(), "year")!.id as string;
  const STG = must(await owner.c.from("stages").insert({ school_id: S, name: "الثانوية" }).select("id").single(), "stage")!.id;
  const G = must(await owner.c.from("grades").insert({ school_id: S, stage_id: STG, name: "أول" }).select("id").single(), "grade")!.id;
  const T = must(await owner.c.from("terms").insert({ school_id: S, year_id: Y, name: "الفصل الدراسي الأول", start_date: "2026-08-01", end_date: "2027-07-31" }).select("id").single(), "term")!.id;
  const SEC = must(await owner.c.from("sections").insert({ school_id: S, grade_id: G, year_id: Y, term_id: T, name: "أ", capacity: 30 }).select("id").single(), "section")!.id;
  const P = must(await owner.c.from("students").insert({ school_id: S, full_name: `طالب حوالة ${run}`, status: "active" }).select("id").single(), "student")!.id as string;
  must(await owner.c.rpc("sf_setup_save", { _school: S, _kind: "price", _p: { year_id: Y, kind: "tuition", grade_id: G, term1: 5000, term2: 5000, status: "approved" } }), "price");
  must(await admin.from("enrollments").insert({ school_id: S, student_id: P, section_id: SEC, year_id: Y, status: "active" }), "enr");
  await owner.c.rpc("sf_create_tuition", { _student: P, _year: Y });
  const ob = must(await admin.from("sf_obligations").select("id").eq("student_id", P).eq("year_id", Y).order("term").limit(1).single(), "ob")!.id;
  const pay = (method: string) => owner.c.rpc("sf_collect", { _student: P, _request_key: crypto.randomUUID(), _p: { method, paid_at: "2026-11-24", allocations: [{ obligation_id: ob, amount: 100 }] } });
  const bank = must(await pay("bank"), "bank pay") as string, cash = must(await pay("cash"), "cash pay") as string;
  check("bank payment without an image is accepted (image optional)", !!bank);
  const img = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
  const a = await owner.c.rpc("sf_transfer_attach", { _collection: bank, _name: "حوالة.jpg", _mime: "image/jpeg", _size: img.size });
  const up = a.error ? null : await owner.c.storage.from("rikaz-files").upload((a.data as any).path, img, { contentType: "image/jpeg" });
  check("collector attaches and uploads the transfer image", !a.error && !up?.error, a.error?.message ?? up?.error?.message);
  check("cash payment refuses a transfer image", !!(await owner.c.rpc("sf_transfer_attach", { _collection: cash, _name: "x.jpg", _mime: "image/jpeg", _size: 4 })).error);
  check("non-image/PDF file refused", !!(await owner.c.rpc("sf_transfer_attach", { _collection: bank, _name: "x.exe", _mime: "application/x-msdownload", _size: 4 })).error);
  check("teacher cannot attach", !!(await teacher.c.rpc("sf_transfer_attach", { _collection: bank, _name: "x.jpg", _mime: "image/jpeg", _size: 4 })).error);
  const list = must(await owner.c.rpc("sf_transfer_files", { _student: P }), "list") as any[];
  check("owner sees exactly one transfer image on the bank payment", list.length === 1 && list[0].collection_id === bank, list);
  const su = await owner.c.storage.from("rikaz-files").createSignedUrl(list[0].path, 60);
  check("owner opens the image via a short-lived link", !su.error && !!su.data?.signedUrl, su.error?.message);
  check("teacher cannot list or open the image", !!(await teacher.c.rpc("sf_transfer_files", { _student: P })).error && !!(await teacher.c.storage.from("rikaz-files").createSignedUrl(list[0].path, 60)).error);
  for (let i = 0; i < 2; i++) must(await owner.c.rpc("sf_transfer_attach", { _collection: bank, _name: `p${i}.pdf`, _mime: "application/pdf", _size: 4 }), "extra");
  check("at most three attachments per payment", !!(await owner.c.rpc("sf_transfer_attach", { _collection: bank, _name: "4.pdf", _mime: "application/pdf", _size: 4 })).error);
  const forged = must(await owner.c.rpc("sf_collect", { _student: P, _request_key: crypto.randomUUID(), _p: { method: "cash", paid_at: "2026-11-24", payer: "اسم مكتوب يدويًا", allocations: [{ obligation_id: ob, amount: 50 }] } }), "forged") as string;
  const col = must(await admin.from("sf_collections").select("payer").eq("id", forged).single(), "col") as any;
  const rc = must(await admin.from("sf_receipts").select("snapshot").eq("collection_id", forged).single(), "rc") as any;
  check("payer is always the recording employee, never a typed name", col.payer !== "اسم مكتوب يدويًا" && col.payer === rc.snapshot.actor && !!col.payer, { col, actor: rc.snapshot.actor });
  check("new receipt freezes the student's stage, grade and section", rc.snapshot.student.stage === "الثانوية" && rc.snapshot.student.grade === "أول" && rc.snapshot.student.section === "أ", rc.snapshot.student);
  console.log(`\n${ok} passed, ${bad} failed — synthetic org ${org}`);
} finally {
  for (const u of [owner, teacher]) await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
}
process.exit(bad ? 1 : 0);
