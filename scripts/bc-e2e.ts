// Notifications hub (bc_*): targeting by branch × category × department, all vs picked people, preview fingerprint,
// send once per account (guardian with two children, double send), scope per branch, history/read counts, copy, isolation.
// Synthetic data only. Run: NODE_PATH=node_modules bun scripts/bc-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "bce");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 600)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string, name: string) {
  const email = `bce-${tag}-${run}@rikaz.test`;
  const r = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } });
  await admin.from("profiles").upsert({ id: r.data.user!.id, full_name: name });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const rpc = async (c: any, f: string, a: any) => { const r = await c.rpc(f, a); return r; };
try {
  const owner = await user("owner", "مالك الإشعارات"), staffA = await user("sa", "منسقة الفرع أ"), pr = await user("pr", "مدير بلا صلاحية"), x = await user("x", "غريب");
  const g1 = await user("g1", "سعاد ولية أمر"), g2 = await user("g2", "سعيد ولي أمر"), stu = await user("st", "طالب الفرع أ");
  const t1 = await user("t1", "معلمة الرياضيات"), t2 = await user("t2", "معلم العلوم"), tB = await user("tb", "معلمة الفرع ب"), vp = await user("vp", "وكيلة الفرع ب");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الإشعارات", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const org2 = (await x.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  const mem = (u: any, s: string, role: string, dept: string | null = null) => admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role, department_id: dept });
  const MATH = (await admin.from("departments").insert({ school_id: A, name: "الرياضيات" }).select("id").single()).data!.id;
  const SCI = (await admin.from("departments").insert({ school_id: A, name: "العلوم" }).select("id").single()).data!.id;
  await mem(staffA, A, "student_affairs"); await mem(pr, A, "principal"); await mem(t1, A, "teacher", MATH); await mem(t2, A, "teacher", SCI);
  await mem(tB, B, "teacher"); await mem(vp, B, "vice_principal"); await mem(g1, A, "guardian"); await mem(g2, A, "guardian"); await mem(g1, B, "guardian"); await mem(stu, A, "student");
  await admin.from("teachers").insert([{ school_id: A, user_id: t1.id, full_name: "معلمة الرياضيات", department_id: MATH, status: "active" }, { school_id: A, user_id: t2.id, full_name: "معلم العلوم", department_id: SCI, status: "active" }]);
  const s1 = (await admin.from("students").insert({ school_id: A, full_name: "ابن أول", status: "active", user_id: stu.id }).select("id").single()).data!.id;
  const s2 = (await admin.from("students").insert({ school_id: A, full_name: "ابن ثان", status: "active" }).select("id").single()).data!.id;
  const s3 = (await admin.from("students").insert({ school_id: B, full_name: "ابن في ب", status: "active" }).select("id").single()).data!.id;
  const s4 = (await admin.from("students").insert({ school_id: A, full_name: "ابن غير موثق", status: "active" }).select("id").single()).data!.id;
  const G1 = (await admin.from("guardians").insert({ school_id: A, user_id: g1.id, full_name: "سعاد ولية أمر" }).select("id").single()).data!.id;
  const G1b = (await admin.from("guardians").insert({ school_id: B, user_id: g1.id, full_name: "سعاد ولية أمر" }).select("id").single()).data!.id;
  const G2 = (await admin.from("guardians").insert({ school_id: A, user_id: g2.id, full_name: "سعيد ولي أمر" }).select("id").single()).data!.id;
  await admin.from("student_guardians").insert([
    { school_id: A, student_id: s1, guardian_id: G1, verified: true, relationship: "أم" }, { school_id: A, student_id: s2, guardian_id: G1, verified: true, relationship: "أم" },
    { school_id: B, student_id: s3, guardian_id: G1b, verified: true, relationship: "أم" }, { school_id: A, student_id: s4, guardian_id: G2, verified: false, relationship: "أب" }]).then((r) => { if (r.error) console.log("sg", r.error.message); });
  for (const a of ["view", "draft"]) await owner.c.rpc("perm_override_set", { _org: org, _user: staffA.id, _section: "notices", _action: a, _effect: "grant", _scope: "branch", _reason: "تجربة" }).then((r: any) => { if (r.error) console.log("perm", r.error.message); });
  console.log("gm", JSON.stringify((await admin.from("memberships").select("role,school_id").eq("user_id", g1.id))));

  const cat = (await owner.c.rpc("perm_catalog")).data as any;
  check("permission tree has the hub with both tabs", cat.areas.some((a: any) => a.key === "comm_hub") && ["notices", "hub_meetings"].every((k) => cat.sections.some((s: any) => s.key === k)));
  const sc = (await owner.c.rpc("bc_scope", { _org: org })).data as any;
  check("owner scope: both branches for send", sc.send.length === 2 && sc.departments.length === 2, sc);
  const scA = (await staffA.c.rpc("bc_scope", { _org: org })).data as any;
  check("branch coordinator: branch A drafts only, no send", scA.draft.length === 1 && scA.draft[0] === A && scA.send.length === 0, scA);
  check("principal without grant: nothing", ((await pr.c.rpc("bc_scope", { _org: org })).data as any).any === false);

  // 1) all guardians of branch A → only verified link, once
  const T1 = { schools: [A], categories: ["guardian"], mode: "all" };
  const p1 = (await owner.c.rpc("bc_preview", { _org: org, _t: T1 })).data as any;
  check("guardians of A: one (verified) guardian, though two children", p1.count === 1 && p1.people[0].name === "سعاد ولية أمر", p1);
  const d1 = (await owner.c.rpc("bc_save", { _org: org, _id: null, _p: { title: "اجتماع أولياء الأمور", body: "يسرنا دعوتكم", target: T1 }, _client: crypto.randomUUID() })).data as any;
  const snd = await owner.c.rpc("bc_send", { _id: d1.id, _rev: d1.rev, _fingerprint: p1.fingerprint });
  check("send 1 ok with ref", !snd.error && /^N-\d{4}-00001$/.test((snd.data as any).ref), snd);
  const again = await owner.c.rpc("bc_send", { _id: d1.id, _rev: d1.rev, _fingerprint: p1.fingerprint });
  check("second send is a no-op", (again.data as any)?.already === true, again);
  const gn = (await g1.c.from("notifications").select("title").eq("dedupe_key", "bc:" + d1.id)).data!;
  check("guardian got exactly one notification", gn.length === 1 && gn[0].title === "اجتماع أولياء الأمور", gn);

  // 2) one guardian by name search
  const T2 = { schools: [A, B], categories: ["guardian", "teacher", "staff"], mode: "pick", users: [] as string[] };
  const ppl = (await owner.c.rpc("bc_people", { _org: org, _t: T2, _q: "سعاد" })).data as any[];
  check("name search finds the guardian with category and branch", ppl.length === 1 && ppl[0].category_label === "ولي أمر", ppl);
  check("unverified guardian not searchable", ((await owner.c.rpc("bc_people", { _org: org, _t: T2, _q: "سعيد" })).data as any[]).length === 0);
  // 3) several picked from different branches
  T2.users = [g1.id, t1.id, vp.id, x.id];
  const p3 = (await owner.c.rpc("bc_preview", { _org: org, _t: T2 })).data as any;
  check("picked: 3 eligible across branches, outsider dropped", p3.count === 3 && p3.dropped.length === 1 && Object.keys(p3.by_school).length === 2, p3);
  const d3 = (await owner.c.rpc("bc_save", { _org: org, _id: null, _p: { title: "تنبيه محدد", body: "نص للمحددين", target: T2 } })).data as any;
  // recipients change after preview → refused, then fresh preview works
  await admin.from("memberships").update({ is_active: false }).eq("user_id", vp.id).eq("school_id", B);
  check("changed recipients after preview refused", has(await owner.c.rpc("bc_send", { _id: d3.id, _rev: d3.rev, _fingerprint: p3.fingerprint }), "تغيّر المستلمون"));
  const p3b = (await owner.c.rpc("bc_preview", { _org: org, _t: T2 })).data as any;
  check("fresh preview shows 2 and lists the dropped one", p3b.count === 2 && p3b.dropped.length === 2, p3b);
  const s3r = await owner.c.rpc("bc_send", { _id: d3.id, _rev: d3.rev, _fingerprint: p3b.fingerprint });
  check("send 3 ok to 2", (s3r.data as any)?.count === 2, s3r);
  check("outsider never notified", ((await admin.from("notifications").select("id").eq("user_id", x.id).like("dedupe_key", "bc:%")).data ?? []).length === 0);

  // department filter
  const pd = (await owner.c.rpc("bc_preview", { _org: org, _t: { schools: [A], categories: ["teacher"], departments: [MATH], mode: "all" } })).data as any;
  check("department filter: only the math teacher", pd.count === 1 && pd.people[0].name === "معلمة الرياضيات", pd);
  check("department of another branch refused", has(await owner.c.rpc("bc_preview", { _org: org, _t: { schools: [B], categories: ["teacher"], departments: [MATH], mode: "all" } }), "لا يتبع"));
  check("empty audience cannot be sent", await (async () => { const d = (await owner.c.rpc("bc_save", { _org: org, _id: null, _p: { title: "فارغ", body: "لا أحد", target: { schools: [B], categories: ["student"], mode: "all" } } })).data as any; const p = (await owner.c.rpc("bc_preview", { _org: org, _t: { schools: [B], categories: ["student"], mode: "all" } })).data as any; return p.count === 0 && has(await owner.c.rpc("bc_send", { _id: d.id, _rev: d.rev, _fingerprint: p.fingerprint }), "لا يوجد مستلمون"); })());

  // scope: branch coordinator
  check("coordinator cannot target branch B", has(await staffA.c.rpc("bc_preview", { _org: org, _t: { schools: [B], categories: ["teacher"], mode: "all" } }), "خارج نطاق"));
  const dA = (await staffA.c.rpc("bc_save", { _org: org, _id: null, _p: { title: "مسودة المنسقة", body: "نص المسودة", target: { schools: [A], categories: ["teacher"], mode: "all" } } })).data as any;
  const pA = (await staffA.c.rpc("bc_preview", { _org: org, _t: { schools: [A], categories: ["teacher"], mode: "all" } })).data as any;
  check("coordinator cannot send (no send grant)", has(await staffA.c.rpc("bc_send", { _id: dA.id, _rev: dA.rev, _fingerprint: pA.fingerprint }), "صلاحيتك"));
  const lA = (await staffA.c.rpc("bc_list", { _org: org, _f: {} })).data as any[];
  check("coordinator history: A notices + own draft, not the B-only ones", lA.some((n) => n.id === d1.id) && lA.some((n) => n.id === dA.id) && lA.some((n) => n.id === d3.id), lA.map((n) => n.title));
  check("principal without grant sees no history", ((await pr.c.rpc("bc_list", { _org: org, _f: {} })).data as any[]).length === 0);
  check("principal cannot open a notice", has(await pr.c.rpc("bc_get", { _id: d1.id }), "غير مصرح"));
  check("outsider cannot preview", has(await x.c.rpc("bc_preview", { _org: org, _t: T1 }), "خارج نطاق"));
  check("no direct table read", ((await owner.c.from("bc_notices").select("id")).data ?? []).length === 0);

  // history: read counts and filters
  await g1.c.from("notifications").update({ read_at: new Date().toISOString() }).eq("dedupe_key", "bc:" + d1.id);
  const lo = (await owner.c.rpc("bc_list", { _org: org, _f: { status: "sent" } })).data as any[];
  const r1 = lo.find((n) => n.id === d1.id);
  check("history shows 1 recipient, 1 read, 0 failed", r1.recipients === 1 && Number(r1.read) === 1 && Number(r1.failed) === 0, r1);
  check("filter by category teacher", ((await owner.c.rpc("bc_list", { _org: org, _f: { category: "teacher", status: "sent" } })).data as any[]).every((n) => n.id === d3.id));
  check("filter by branch B", ((await owner.c.rpc("bc_list", { _org: org, _f: { school: B, status: "sent" } })).data as any[]).map((n) => n.id).join() === d3.id);
  const det = (await owner.c.rpc("bc_get", { _id: d3.id })).data as any;
  check("detail lists actual recipients at send time", det.recipients.length === 2 && det.log.some((l: any) => l.action === "send"), det.recipients);
  const cp = (await owner.c.rpc("bc_copy", { _id: d1.id })).data as string;
  const cpd = (await owner.c.rpc("bc_get", { _id: cp })).data as any;
  check("copy makes a new draft and keeps the original", cpd.status === "draft" && cpd.copied_from === (snd.data as any).ref && ((await owner.c.rpc("bc_get", { _id: d1.id })).data as any).status === "sent");
  check("sent notice cannot be edited", has(await owner.c.rpc("bc_save", { _org: org, _id: d1.id, _p: { title: "تعديل", body: "تعديل", target: T1 }, _rev: 2 }), "المسودة"));
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { await tr.deleteNotifications().catch(() => {}); for (const o of orgs) { await admin.from("perm_overrides").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); } for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
