// Guardian access follows two live facts only: a verified guardian↔student link and the student's active enrollment.
// Imported (unverified) link → nothing; verify → child, section classroom, posts and files; transfer → access moves;
// revoke → access gone (incl. direct file/post reads). Isolated fax- data, cleaned through TestRun.
// Run: NODE_PATH=node_modules bun scripts/family-access-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "fax");
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
const run = Date.now(), pw = "Test-pass-" + run;
let pass = 0, fail = 0; const check = (n: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(extra ?? "")); };
const users: Record<string, string> = {}, emails: Record<string, string> = {}; let org = "";
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: emails[k]!, password: pw }); if (s.error) throw s.error; return c; }
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };
try {
  for (const t of ["owner", "g1"]) {
    const email = `fax-${t}-${run}@rikaz.test`;
    const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (r.error) throw r.error; users[t] = r.data.user!.id; emails[t] = email; tr.addUser(r.data.user!.id);
  }
  const oc = await as("owner");
  org = must(await oc.rpc("create_organization", { _org_name: "مجموعة تجربة وصول الأسرة", _school_name: "مدرسة الوصول" })) as string;
  const S = must(await admin.from("schools").select("id").eq("org_id", org).single())!.id; tr.addSchool(S);
  must(await admin.from("memberships").insert({ user_id: users.g1, org_id: org, school_id: S, role: "guardian" }));
  const y = must(await admin.from("academic_years").insert({ school_id: S, name: "1448", start_date: "2026-08-01", end_date: "2027-06-30" }).select("id").single())!.id;
  const st = must(await admin.from("stages").insert({ school_id: S, name: "ابتدائي" }).select("id").single())!.id;
  const gr = must(await admin.from("grades").insert({ school_id: S, stage_id: st, name: "الخامس" }).select("id").single())!.id;
  const secA = must(await admin.from("sections").insert({ school_id: S, grade_id: gr, year_id: y, name: "أ" }).select("id").single())!.id;
  const secB = must(await admin.from("sections").insert({ school_id: S, grade_id: gr, year_id: y, name: "ب" }).select("id").single())!.id;
  const sj = must(await admin.from("subjects").insert({ school_id: S, name: "العلوم" }).select("id").single())!.id;
  const course = async (sec: string) => must(await admin.from("courses").insert({ school_id: S, year_id: y, subject_id: sj, section_id: sec, weekly_periods: 1 }).select("id").single())!.id as string;
  const coA = await course(secA), coB = await course(secB);
  const room = async (co: string, t: string) => must(await admin.from("classrooms").upsert({ school_id: S, course_id: co, title: t }, { onConflict: "course_id" }).select("id").single())!.id as string;
  const rA = await room(coA, "علوم أ"), rB = await room(coB, "علوم ب");
  const post = async (r: string) => must(await admin.from("classroom_posts").insert({ school_id: S, classroom_id: r, author_user_id: users.owner, title: "إعلان", status: "published", audience: "students_guardians", published_at: new Date().toISOString() }).select("id").single())!.id as string;
  const pA = await post(rA), pB = await post(rB);
  const file = must(await admin.from("files").insert({ school_id: S, storage_path: `fax/${run}.pdf`, name: "a.pdf", mime_type: "application/pdf", size_bytes: 10, source_type: "post", source_id: pA, uploaded_by: users.owner }).select("id").single())!.id;
  const kid = must(await admin.from("students").insert({ school_id: S, full_name: "ابن الوصول", national_id: "1100000077", csmart_no: "00077", status: "active" }).select("id").single())!.id;
  must(await admin.from("enrollments").insert({ school_id: S, student_id: kid, section_id: secA, year_id: y, status: "active" }));
  // the import path: guardian record by ID+mobile, link unverified
  const imp = must(await oc.rpc("import_guardian_row", { _school: S, _row: { full_name: "ولي الوصول", national_id: "1200000077", phone: "966501110077", relationship: "father", student_csmart: "00077" }, _dry: false })) as any;
  check("import creates an unverified link", imp.action === "create");
  must(await admin.from("guardians").update({ user_id: users.g1 }).eq("id", imp.guardian_id));
  const G = await as("g1");
  const can = async (co: string) => must(await G.rpc("can_view_course", { _course: co, _school: S })) as boolean;
  const postSeen = async (p: string) => ((await G.from("classroom_posts").select("id").eq("id", p)).data ?? []).length === 1;
  const fileOk = async () => must(await G.rpc("can_read_file", { _file: file })) as boolean;
  const kids0 = must(await G.rpc("family_children")) as any[];
  check("before approval: child listed without name/number", kids0.length === 1 && kids0[0].student === null && kids0[0].csmart_no === null, kids0);
  check("before approval: child overview blocked", !!(await G.rpc("family_child", { _student: kid })).error);
  check("before approval: no classroom access", !(await can(coA)));
  const link = must(await admin.from("student_guardians").select("id").eq("guardian_id", imp.guardian_id).single())!.id;
  must(await oc.rpc("verify_guardian_link", { _id: link }));
  const kids1 = must(await G.rpc("family_children")) as any[];
  check("after approval: child card shows name and C‑Smart number", kids1[0]?.student === "ابن الوصول" && kids1[0]?.csmart_no === "00077" && kids1[0]?.section === "أ", kids1);
  const ov = must(await G.rpc("family_child", { _student: kid })) as any;
  check("after approval: section classroom reachable automatically", (ov.classrooms ?? []).some((c: any) => c.id === rA), ov.classrooms);
  check("after approval: course A visible, B not", (await can(coA)) && !(await can(coB)));
  check("after approval: post + attachment of A readable", (await postSeen(pA)) && (await fileOk()) && !(await postSeen(pB)));
  const mem = must(await admin.from("memberships").select("role").eq("user_id", users.g1)) as any[];
  check("family access grants no student role", mem.every((m) => m.role === "guardian"));
  const cm = must(await admin.from("conversation_members").select("id").eq("user_id", users.g1)) as any[];
  check("family access adds no staff/manual group membership", cm.length === 0);
  // transfer A → B
  must(await admin.from("enrollments").update({ status: "ended", end_date: "2026-11-07" }).eq("student_id", kid).eq("status", "active"));
  must(await admin.from("enrollments").insert({ school_id: S, student_id: kid, section_id: secB, year_id: y, status: "active" }));
  check("after transfer: B visible, A gone", (await can(coB)) && !(await can(coA)));
  check("after transfer: old post and file closed, new post open", !(await postSeen(pA)) && !(await fileOk()) && (await postSeen(pB)));
  // revoke
  must(await oc.from("student_guardians").delete().eq("id", link));
  check("after revoke: no course access", !(await can(coB)));
  check("after revoke: post closed", !(await postSeen(pB)));
  check("after revoke: child overview blocked", !!(await G.rpc("family_child", { _student: kid })).error);
  check("after revoke: child no longer listed", (must(await G.rpc("family_children")) as any[]).length === 0);
} catch (e) { fail++; console.log("FAIL exception", (e as Error).message ?? e); }
finally {
  await tr.deleteNotifications().catch(() => {});
  if (org) await tr.purgeOrg(org).catch((e) => console.log("cleanup:", e.message));
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u).catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
