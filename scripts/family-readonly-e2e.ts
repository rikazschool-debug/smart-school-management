// Guardian/student accounts are read-only for displayed records: direct writes and staff RPCs are refused by the server,
// own actions (profile photo) stay available as separate rows, and the owner keeps full edit rights inside the org.
// Isolated frx- data, cleaned through TestRun. Run: NODE_PATH=node_modules bun scripts/family-readonly-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "frx");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}, emails: Record<string, string> = {}; let org = "";
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
/** a write is refused when it errors or touches no row */
const refused = (r: { data: any; error: any }) => !!r.error || (Array.isArray(r.data) && r.data.length === 0);
try {
  for (const t of ["owner", "g1", "s1"]) {
    const email = `frx-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (r.error) throw r.error; users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة القراءة فقط", _school_name: "مدرسة القراءة" })) as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single())!.id; tr.addSchool(S);
  must(await admin.from("memberships").insert([{ user_id: users.g1, org_id: org, school_id: S, role: "guardian" }, { user_id: users.s1, org_id: org, school_id: S, role: "student" }]));
  must(await admin.from("profiles").upsert([{ id: users.g1, full_name: "ولي القراءة" }, { id: users.s1, full_name: "طالب القراءة" }]));
  const y = must(await admin.from("academic_years").insert({ school_id: S, name: "1448", start_date: "2026-08-01", end_date: "2027-06-30" }).select("id").single())!.id;
  const st = must(await admin.from("stages").insert({ school_id: S, name: "ابتدائي" }).select("id").single())!.id;
  const gr = must(await admin.from("grades").insert({ school_id: S, stage_id: st, name: "الخامس" }).select("id").single())!.id;
  const sec = must(await admin.from("sections").insert({ school_id: S, grade_id: gr, year_id: y, name: "أ" }).select("id").single())!.id;
  const kid = must(await admin.from("students").insert({ school_id: S, full_name: "ابن القراءة", national_id: "1100000091", csmart_no: "00091", status: "active", user_id: users.s1 }).select("id").single())!.id;
  const other = must(await admin.from("students").insert({ school_id: S, full_name: "طالب آخر", national_id: "1100000092", csmart_no: "00092", status: "active" }).select("id").single())!.id;
  must(await admin.from("enrollments").insert([{ school_id: S, student_id: kid, section_id: sec, year_id: y, status: "active" }, { school_id: S, student_id: other, section_id: sec, year_id: y, status: "active" }]));
  const gid = must(await admin.from("guardians").insert({ school_id: S, user_id: users.g1, full_name: "ولي القراءة", national_id: "1200000091", phone: "966501110091" }).select("id").single())!.id;
  const link = must(await admin.from("student_guardians").insert({ school_id: S, student_id: kid, guardian_id: gid, relationship: "father", verified: true, can_pickup: true }).select("id").single())!.id;

  const G = await as("g1"), St = await as("s1");
  // reading: own data only
  check("guardian sees linked child", !(await G.rpc("family_child", { _student: kid })).error);
  check("guardian cannot open another student", !!(await G.rpc("family_child", { _student: other })).error);
  const sRows = must(await St.from("students").select("id")) as any[];
  check("student reads only own student record", sRows.every((r) => r.id === kid), sRows);
  const gRows = must(await G.from("students").select("id")) as any[];
  check("guardian direct read never lists other students", !gRows.some((r) => r.id === other), gRows);

  // direct writes refused for both accounts
  for (const [who, c] of [["guardian", G], ["student", St]] as const) {
    check(`${who}: edit student record refused`, refused(await c.from("students").update({ full_name: "تغيير" }).eq("id", kid).select("id")));
    check(`${who}: delete student refused`, refused(await c.from("students").delete().eq("id", kid).select("id")));
    check(`${who}: edit guardian record refused`, refused(await c.from("guardians").update({ phone: "966509999999" }).eq("id", gid).select("id")));
    check(`${who}: add guardian link refused`, refused(await c.from("student_guardians").insert({ school_id: S, student_id: other, guardian_id: gid, verified: true }).select("id")));
    check(`${who}: change link refused`, refused(await c.from("student_guardians").update({ can_pickup: false }).eq("id", link).select("id")));
    check(`${who}: change enrollment refused`, refused(await c.from("enrollments").update({ status: "ended" }).eq("student_id", kid).select("id")));
    check(`${who}: rename own profile refused`, refused(await c.from("profiles").update({ full_name: "اسم جديد" }).eq("id", users[who === "guardian" ? "g1" : "s1"]!).select("id")));
    check(`${who}: add pickup person refused`, !!(await c.rpc("add_authorized_pickup", { _student: kid, _name: "شخص", _national_id: "1", _relationship: "عم", _phone: "966500000000" })).error);
    check(`${who}: verify guardian link refused`, !!(await c.rpc("verify_guardian_link", { _id: link })).error);
  }
  const kidRow = must(await admin.from("students").select("full_name, status").eq("id", kid).single()) as any;
  const gRow = must(await admin.from("guardians").select("phone").eq("id", gid).single()) as any;
  const enr = must(await admin.from("enrollments").select("status").eq("student_id", kid).single()) as any;
  const prof = must(await admin.from("profiles").select("id, full_name").in("id", [users.g1, users.s1])) as any[];
  check("original records unchanged after attempts", kidRow.full_name === "ابن القراءة" && kidRow.status === "active" && gRow.phone === "966501110091" && enr.status === "active"
    && prof.every((p) => p.full_name !== "اسم جديد"), { kidRow, gRow, enr, prof });

  // own action stays available and writes only its own field
  check("guardian can still set own photo", !(await G.rpc("set_my_avatar", { _path: `${users.g1}/avatar-${run}.png` })).error);
  const pg = must(await admin.from("profiles").select("full_name, avatar_path").eq("id", users.g1).single()) as any;
  check("photo action leaves name untouched", pg.full_name === "ولي القراءة" && String(pg.avatar_path).includes(String(run)), pg);
  check("guardian cannot set another user's photo path", !!(await G.rpc("set_my_avatar", { _path: `${users.s1}/x.png` })).error);

  // owner keeps full edit rights inside the org
  check("owner edits student", !refused(await oc.from("students").update({ full_name: "ابن القراءة المعدل" }).eq("id", kid).select("id")));
  check("owner edits guardian", !refused(await oc.from("guardians").update({ phone: "966501110099" }).eq("id", gid).select("id")));
  check("owner edits link", !refused(await oc.from("student_guardians").update({ can_pickup: false }).eq("id", link).select("id")));
  check("owner can rename own profile", !refused(await oc.from("profiles").upsert({ id: users.owner, full_name: "مالك القراءة" }).select("id")));
} catch (e) { fail++; console.log("FAIL exception", (e as Error).message ?? e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) await tr.purgeOrg(org).catch((e) => console.log("cleanup:", e.message));
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u).catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
