// People management batch 1, parts 1–2: staff job categories (separate from role/permissions) and org-wide unique display names.
// Synthetic data only (isolated org). Run: NODE_PATH=node_modules bun scripts/people1-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "pp1");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `pp1-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), pr = await user("pr"), teacher = await user("t"), multi = await user("multi");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الأشخاص", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert([{ user_id: pr.id, org_id: org, school_id: A, role: "principal" }, { user_id: teacher.id, org_id: org, school_id: A, role: "teacher" },
    { user_id: multi.id, org_id: org, school_id: A, role: "teacher" }]);

  // ---------- categories
  const c1 = await owner.c.rpc("hr_cat_save", { _org: org, _id: null, _name: "  مدير   مدرسة ", _active: true });
  check("owner adds a category (spaces normalized)", !c1.error, c1.error);
  check("duplicate category refused", has(await owner.c.rpc("hr_cat_save", { _org: org, _id: null, _name: "مدير مدرسة", _active: true }), "موجود"));
  check("principal cannot manage categories", has(await pr.c.rpc("hr_cat_save", { _org: org, _id: null, _name: "إداري", _active: true }), "صلاحية"));
  const cT = (await owner.c.rpc("hr_cat_save", { _org: org, _id: null, _name: "معلم", _active: true })).data;
  const list = (await owner.c.rpc("hr_cat_list", { _org: org })).data as any[];
  check("list shows both categories", list.length === 2 && list.some((x) => x.name === "مدير مدرسة"), list);

  const E = await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "خالد عبدالله سعد العتيبي", school_id: A, category_id: c1.data, user_id: multi.id, job_title: "مدير" } });
  check("employee saved with school + category", !E.error, E.error);
  const asg = (await admin.from("hr_assignments").select("category_id").eq("employee_id", E.data)).data!;
  check("first assignment carries the category", asg[0]?.category_id === c1.data, asg);
  const mem = (await admin.from("memberships").select("role").eq("user_id", multi.id)).data!;
  check("category «مدير» grants no role (still teacher only)", mem.length === 1 && mem[0]!.role === "teacher", mem);
  const a2 = await owner.c.rpc("hr_assignment_save", { _employee: E.data, _id: null, _p: { school_id: B, start_date: "2026-01-01", category_id: cT } });
  check("same file assigned to a second school (no duplicate file)", !a2.error && ((await admin.from("hr_employees").select("id").eq("org_id", org)).data!.length === 1), a2.error);
  await owner.c.rpc("hr_cat_save", { _org: org, _id: cT, _name: "معلم", _active: false });
  check("disabled category refused for new assignments", has(await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: "موظف آخر", school_id: A, category_id: cT } }), "غير متاح"));
  check("past use of disabled category kept", (await admin.from("hr_assignments").select("id").eq("category_id", cT)).data!.length === 1);
  const g = (await owner.c.rpc("hr_employee_get", { _id: E.data })).data as any;
  check("employee file shows category per assignment", g.assignments.some((x: any) => x.category === "معلم") && g.assignments.some((x: any) => x.category === "مدير مدرسة"), g.assignments);

  // ---------- display names
  const emp = (await admin.from("hr_employees").select("display_name, display_name_manual").eq("id", E.data).single()).data!;
  check("auto display name = first + last", emp.display_name === "خالد العتيبي" && !emp.display_name_manual, emp);
  const t1 = await admin.from("teachers").insert({ school_id: A, full_name: "خالد محمد العتيبي" }).select("id, display_name").single();
  check("different person with same first+last gets a free variant automatically", t1.data?.display_name === "خالد العتيبي 2", t1);
  const t1b = await admin.from("teachers").insert({ school_id: B, full_name: "سعيد الغامدي", display_name: "  خالد   العتيبي " });
  check("typed duplicate refused across branches + suggestion", String(t1b.error?.message).includes("غير متاح") && String((t1b.error as any)?.hint).includes("مقترح"), t1b.error);
  const same = await admin.from("teachers").insert({ school_id: B, full_name: "خالد عبدالله سعد العتيبي", user_id: multi.id }).select("display_name").single();
  check("same person (same login) as teacher reuses one display name", same.data?.display_name === "خالد العتيبي", same);
  const g1 = await admin.from("guardians").insert({ school_id: A, full_name: "نورة الأحمد", national_id: "1100000001" }).select("id, display_name").single();
  const s1 = await admin.from("students").insert({ school_id: B, full_name: "نوره سالم الأحمد" }).select("id, display_name").single();
  check("student with same short name as guardian gets variant", s1.data?.display_name === "نورة الأحمد 2" || s1.data?.display_name === "نوره الأحمد", s1);
  const twin = await admin.from("hr_employees").insert({ org_id: org, employee_no: "X1", full_name: "نورة الأحمد", national_id: "1100000001" }).select("display_name").single();
  check("same ID number without verified link is stopped for review (never merged)", String(twin.error?.message).includes("تعارض يحتاج مراجعة"), twin);
  await admin.from("guardians").update({ display_name: "أم سالم" }).eq("id", g1.data!.id);
  check("guardian rename saved as manual", (await admin.from("guardians").select("display_name_manual").eq("id", g1.data!.id).single()).data!.display_name_manual === true);
  check("old name released after rename", !(await admin.from("teachers").insert({ school_id: A, full_name: "س", display_name: "نورة الأحمد" })).error);
  await admin.from("guardians").update({ full_name: "نورة محمد الأحمد" }).eq("id", g1.data!.id);
  check("manual name not replaced when official name changes", (await admin.from("guardians").select("display_name").eq("id", g1.data!.id).single()).data!.display_name === "أم سالم");
  await admin.from("students").update({ full_name: "نوره سالم الزهراني" }).eq("id", s1.data!.id);
  check("automatic name follows official name", (await admin.from("students").select("display_name").eq("id", s1.data!.id).single()).data!.display_name === "نوره الزهراني");
  const sameT = await admin.from("teachers").select("id, full_name, display_name").eq("full_name", "خالد عبدالله سعد العتيبي").eq("school_id", B).single();
  check("official full name kept separately", sameT.data?.full_name === "خالد عبدالله سعد العتيبي");
  const hr2 = await owner.c.rpc("hr_employee_save", { _org: org, _id: E.data, _p: { full_name: "خالد عبدالله سعد العتيبي", status: "active", display_name: "أبو عبدالله" } });
  check("HR edit sets display name", !hr2.error && (await admin.from("hr_employees").select("display_name").eq("id", E.data).single()).data!.display_name === "أبو عبدالله", hr2.error);
  check("…and the same person's teacher record follows", (await admin.from("teachers").select("display_name").eq("user_id", multi.id).single()).data!.display_name === "أبو عبدالله");

  // concurrency: two different people claim the same typed name at once → exactly one wins
  const rs = await Promise.all([1, 2].map((i) => admin.from("teachers").insert({ school_id: i === 1 ? A : B, full_name: "متزامن " + i, display_name: "اسم متزامن" })));
  check("concurrent identical names: exactly one saved", rs.filter((r) => !r.error).length === 1, rs.map((r) => r.error?.message));

  const chk = (await teacher.c.rpc("people_dn_check", { _org: org, _name: "أم سالم", _user: null, _nid: null })).data as any;
  check("availability check returns suggestion", chk.ok === false && String(chk.suggestion).startsWith("أم سالم"), chk);

  // existing records: preview only (no change) — owner-only
  const pv0 = await pr.c.rpc("people_dn_preview", { _org: org });
  check("principal cannot open the org-wide preview", has(pv0, "صلاحية"));
  const pv = (await owner.c.rpc("people_dn_preview", { _org: org })).data as any;
  check("owner preview lists proposals without changing data", typeof pv.total === "number", pv);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  for (const o of orgs) await tr.purgeOrg(o).catch((e) => console.error("purge", e.message));
  await admin.from("person_display_names").delete().in("org_id", orgs);
  console.log(`\n${ok} passed, ${bad} failed`);
}
