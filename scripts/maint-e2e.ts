// Maintenance roles (step M1): templates assignable per branch, follow-up variants, principal base rule,
// branch scope, platform suspension of the operations area, revocation, isolation.
// Run: NODE_PATH=node_modules bun scripts/maint-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "maint-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `mt-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), owner2 = await user("owner2"), prin = await user("principal"), prinB = await user("principalB"),
    ex1 = await user("exec1"), ex2 = await user("exec2"), fol = await user("follow"), tro = await user("transport"), bex = await user("busexec"), outsider = await user("teacher");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة صيانة", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع خ" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([
    { user_id: prin.id, org_id: org, school_id: A, role: "principal" }, { user_id: prinB.id, org_id: org, school_id: B, role: "principal" },
    ...[ex1, ex2, fol, tro, bex, outsider].map((u) => ({ user_id: u.id, org_id: org, school_id: A, role: "teacher" }))]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const tpl = (n: string) => roles.find((r) => r.name === n).id;
  const as = (u: any, n: string) => owner.c.rpc("perm_assign", { _org: org, _user: u.id, _role: tpl(n), _assign: true, _school_ids: [A], _limit: null, _reason: "تكليف" });
  await as(ex1, "مسؤول صيانة مدارس"); await as(fol, "مسؤول متابعة الصيانة"); await as(tro, "مسؤول حركة النقل بالمدرسة"); await as(bex, "مسؤول صيانة باصات");
  const cats = (await prin.c.rpc("mt_categories_list", { _org: org, _kind: "school" })).data as any[];
  const elec = cats.find((c) => c.name === "كهرباء"), other = cats.find((c) => c.is_other);
  const get = async (c: any, id: string) => (await c.rpc("mt_get", { _id: id })).data;
  const act = async (c: any, id: string, action: string, data: object = {}) => { const g = await get(c, id); return c.rpc("mt_action", { _id: id, _rev: g?.rev ?? null, _action: action, _data: data }); };

  // 1 validation: «أخرى» needs description; teacher cannot request; other-branch refused
  const bad1 = await prin.c.rpc("mt_create", { _school: A, _kind: "school", _data: { title: "عطل", description: "وصف العطل", category_id: other.id, place: "فصل 1" }, _key: null });
  const bad2 = await outsider.c.rpc("mt_create", { _school: A, _kind: "school", _data: { title: "عطل", description: "وصف العطل", category_id: elec.id, place: "فصل 1" }, _key: null });
  const bad3 = await prin.c.rpc("mt_create", { _school: B, _kind: "school", _data: { title: "عطل", description: "وصف العطل", category_id: elec.id, place: "فصل 1" }, _key: null });
  check("1 «أخرى» needs description; teacher and other-branch requests refused", !!bad1.error && !!bad2.error && !!bad3.error);

  // 2 one executor → auto-assigned, idempotent by key, server ref
  const d = { title: "انقطاع الإنارة", description: "الإنارة لا تعمل في الفصل", category_id: elec.id, subcategory_id: elec.subs[0].id, building: "أ", floor: "1", place_type: "فصل", place: "فصل 3/1", priority: "high" };
  const c1 = await prin.c.rpc("mt_create", { _school: A, _kind: "school", _data: d, _key: "k1-" + run });
  const c1b = await prin.c.rpc("mt_create", { _school: A, _kind: "school", _data: d, _key: "k1-" + run });
  const R = c1.data as string; let g = await get(prin.c, R);
  check("2 single officer → auto-assigned; same key returns same request; ref MS-", !c1.error && c1b.data === R && g.status === "assigned" && g.assignee_id === ex1.id && /^MS-\d{4}-\d{4}$/.test(g.ref), [c1.error, g?.status]);
  check("3 unassigned officer and outsider cannot read it", !(await get(ex2.c, R)) && !(await get(outsider.c, R)) && !(await get(owner2.c, R)));

  // clarify → reply returns previous status
  await act(ex1.c, R, "accept");
  const cl = await act(ex1.c, R, "clarify", { body: "أي جهة في الفصل؟" });
  g = await get(prin.c, R); const st1 = g.status;
  await act(prin.c, R, "reply", { body: "الجهة الشمالية" }); g = await get(prin.c, R);
  check("4 accept → clarify → requester reply restores in_progress", !cl.error && st1 === "clarify" && g.status === "in_progress", [cl.error, st1, g.status]);

  // schedule / reschedule
  const t1 = new Date(Date.now() + 86400e3).toISOString(), t2 = new Date(Date.now() + 2 * 86400e3).toISOString();
  const s1 = await act(ex1.c, R, "schedule", { visit_at: t1, expected_done: t2.slice(0, 10) });
  const s2 = await act(ex1.c, R, "schedule", { visit_at: t2 });
  const s3 = await act(ex1.c, R, "schedule", { visit_at: t2, reason: "تعذر الدخول" });
  g = await get(prin.c, R);
  check("5 schedule; reschedule needs reason and keeps old time in log", !s1.error && !!s2.error && !s3.error && g.events.some((e: any) => e.action === "reschedule" && e.before.visit_at), [s1.error, s3.error]);

  const p1 = await act(ex1.c, R, "progress", { progress: 100, body: "تم استبدال القاطع" }); g = await get(prin.c, R);
  check("6 100% progress does not close", !p1.error && g.status === "in_progress" && g.progress === 100);
  await act(ex1.c, R, "note", { body: "ملاحظة داخلية للفريق" });
  check("7 internal note hidden from requester, visible to follow-up", !(await get(prin.c, R)).events.some((e: any) => e.internal) && (await get(fol.c, R)).events.some((e: any) => e.internal));

  await act(ex1.c, R, "submit_completion", { body: "استبدال القاطع واختبار الإنارة" });
  const selfA = await act(ex1.c, R, "approve");
  const ret0 = await act(fol.c, R, "return", {});
  const ret = await act(fol.c, R, "return", { body: "ما زال مصباح لا يعمل" });
  check("8 executor cannot approve own work; return needs notes", !!selfA.error && !!ret0.error && !ret.error && (await get(ex1.c, R)).status === "returned");
  await act(ex1.c, R, "submit_completion", { body: "استبدال المصباح المتبقي" });
  const ap = await act(fol.c, R, "approve", { actual_cost: 150 }); g = await get(prin.c, R);
  check("9 follow-up approves → closed with reopen window", !ap.error && g.status === "closed" && !!g.reopen_until && g.can.reopen, ap.error);
  const ro = await act(prin.c, R, "reopen", { reason: "عاد العطل" });
  g = await get(fol.c, R);
  check("10a requester asks to reopen → stays closed, pending for follow-up", !ro.error && g.status === "closed" && !!g.reopen_pending && g.can.reopen_decide && !(await get(prin.c, R)).can.reopen, ro.error);
  const selfRo = await act(ex1.c, R, "reopen_decide", { approve: true, reason: "أوافق" });
  const noReason = await act(fol.c, R, "reopen_decide", { approve: false });
  const rej = await act(fol.c, R, "reopen_decide", { approve: false, reason: "العطل جديد، افتح طلبًا" });
  g = await get(prin.c, R);
  check("10b executor cannot decide; reason required; reject keeps closure", !!selfRo.error && !!noReason.error && !rej.error && g.status === "closed" && !g.reopen_pending && g.closed_at, [selfRo.error, rej.error]);
  await act(prin.c, R, "reopen", { reason: "عاد العطل مرة أخرى" });
  const acc = await act(fol.c, R, "reopen_decide", { approve: true, reason: "مقبول" });
  g = await get(fol.c, R);
  const ev = g.events.find((e: any) => e.action === "reopen");
  check("10c approve → new cycle, previous completion/closure kept in history", !acc.error && g.status === "returned" && g.reopen_cycle === 1 && !!ev?.before?.closed_at && !!ev?.before?.completion_note
    && g.events.some((e: any) => e.action === "reopen_reject") && g.events.some((e: any) => e.action === "approve"), acc.error);

  // decline / reassign / concurrent claim (two executors now)
  await as(ex2, "مسؤول صيانة مدارس");
  const c2 = await prin.c.rpc("mt_create", { _school: A, _kind: "school", _data: { ...d, title: "تسريب مياه" }, _key: null }); const R2 = c2.data as string;
  check("11 two officers → awaiting assignment; both may see it to claim", (await get(prin.c, R2)).status === "awaiting_assign" && !!(await get(ex2.c, R2)));
  const g2 = await get(ex1.c, R2);
  const [k1, k2] = await Promise.all([ex1.c.rpc("mt_action", { _id: R2, _rev: g2.rev, _action: "claim", _data: {} }), ex2.c.rpc("mt_action", { _id: R2, _rev: g2.rev, _action: "claim", _data: {} })]);
  check("12 concurrent claim: exactly one succeeds", [k1, k2].filter((x) => !x.error).length === 1, [k1.error?.message, k2.error?.message]);
  const winner = !k1.error ? ex1 : ex2, loser = !k1.error ? ex2 : ex1;
  const dc0 = await act(winner.c, R2, "decline", {});
  const dc = await act(winner.c, R2, "decline", { reason: "خارج اختصاصي" });
  check("13 decline needs reason, returns to follow-up (not closed)", !!dc0.error && !dc.error && (await get(fol.c, R2)).status === "awaiting_assign");
  await act(fol.c, R2, "assign", { user: winner.id });
  const re0 = await act(fol.c, R2, "assign", { user: loser.id });
  const re = await act(fol.c, R2, "assign", { user: loser.id, reason: "إعادة توزيع" });
  check("14 reassign needs reason; previous officer loses access", !!re0.error && !re.error && !(await get(winner.c, R2)), re.error);
  await act(loser.c, R2, "accept");
  const cn = await act(prin.c, R2, "cancel", { reason: "لم يعد مطلوبًا" });
  const cn2 = await act(fol.c, R2, "cancel", { reason: "تم حله بطريقة أخرى" });
  check("15 requester cannot cancel after work starts; follow-up can with reason", !!cn.error && !cn2.error && (await get(prin.c, R2)).cancel_reason === "تم حله بطريقة أخرى", [cn.error, cn2.error]);

  // bus journey
  const bus = await tro.c.rpc("mt_bus_save", { _id: null, _school: A, _data: { code: "B-01", plate: "أ ب ج 1234", odometer: 50000, next_service_km: 55000 } });
  const busP = await prin.c.rpc("mt_bus_save", { _id: null, _school: A, _data: { code: "B-02" } });
  check("16 transport officer adds bus; principal cannot", !bus.error && !!busP.error, bus.error);
  const bcats = (await tro.c.rpc("mt_categories_list", { _org: org, _kind: "bus" })).data as any[];
  const brakes = bcats.find((c) => c.name === "فرامل");
  const odoBad = await tro.c.rpc("mt_create", { _school: A, _kind: "bus", _data: { title: "ضعف الفرامل", description: "الفرامل ضعيفة", category_id: brakes.id, bus_id: bus.data, odometer: 40000 }, _key: null });
  const pb = await prin.c.rpc("mt_create", { _school: A, _kind: "bus", _data: { title: "ضعف الفرامل", description: "الفرامل ضعيفة", category_id: brakes.id, bus_id: bus.data }, _key: null });
  const b1 = await tro.c.rpc("mt_create", { _school: A, _kind: "bus", _data: { title: "ضعف الفرامل", description: "الفرامل ضعيفة", category_id: brakes.id, bus_id: bus.data, odometer: 50500, stop_bus: true }, _key: null });
  const BR = b1.data as string;
  const busRow = async () => ((await tro.c.rpc("mt_buses_list", { _org: org })).data as any[]).find((x) => x.id === bus.data);
  check("17 bus request by movement officer (not principal); odometer can't go back; bus stopped", !!odoBad.error && !!pb.error && !b1.error && (await busRow()).op_status === "stopped" && (await busRow()).odometer === 50500, [b1.error]);
  check("18 principal reads branch bus request (read only)", !!(await get(prin.c, BR)) && !(await get(prin.c, BR)).can.cancel);
  await act(bex.c, BR, "accept"); await act(bex.c, BR, "progress", { progress: 60, body: "طلب قطع", waiting: true });
  check("19 waiting for parts status", (await get(tro.c, BR)).status === "waiting_parts");
  const early = await act(bex.c, BR, "submit_completion", { body: "تبديل الفحمات واختبار الفرامل" });
  const folAssign = await act(fol.c, BR, "assign", { user: bex.id });
  const rcv = await act(bex.c, BR, "receive_bus", { body: "استلمت الباص من الساحة" });
  check("19b bus: hand-over blocked before receiving the bus; follow-up cannot assign bus requests; receive logged", !!early.error && !!folAssign.error && !rcv.error && !!(await get(fol.c, BR)).bus_received_at, [early.error, folAssign.error, rcv.error]);
  await act(bex.c, BR, "submit_completion", { body: "تبديل الفحمات واختبار الفرامل" }); await act(fol.c, BR, "approve");
  check("20 closing bus repair moves bus to «awaiting inspection», not back to service", (await get(tro.c, BR)).status === "closed" && (await busRow()).op_status === "inspection");
  const rs0 = await tro.c.rpc("mt_bus_set_status", { _bus: bus.data, _status: "available", _note: "" });
  const rsP = await prin.c.rpc("mt_bus_set_status", { _bus: bus.data, _status: "available", _note: "فحص" });
  const rs = await tro.c.rpc("mt_bus_set_status", { _bus: bus.data, _status: "available", _note: "فحص الفرامل على الطريق سليم" });
  const log = (await tro.c.rpc("mt_bus_log", { _bus: bus.data })).data as any[];
  check("21 return to service is a separate inspected action by the movement officer", !!rs0.error && !!rsP.error && !rs.error && (await busRow()).op_status === "available" && log.some((l) => l.action === "return_to_service"), rs.error);
  await act(tro.c, BR, "reopen", { reason: "الصوت عاد" }); const bro = await act(fol.c, BR, "reopen_decide", { approve: true, reason: "مقبول" });
  const busB = await owner.c.rpc("mt_bus_save", { _id: null, _school: B, _data: { code: "B-B1" } });
  const bexBuses = ((await bex.c.rpc("mt_buses_list", { _org: org })).data as any[]);
  const prBuses = ((await prinB.c.rpc("mt_buses_list", { _org: org })).data as any[]);
  check("21a bus maintenance officer sees all branches' buses; branch-B principal sees none of branch A", !busB.error && bexBuses.some((x) => x.id === busB.data) && !prBuses.some((x) => x.school_id === A), [busB.error, bexBuses.length]);
  check("21b reopening bus repair keeps bus operating status unchanged", !bro.error && (await get(tro.c, BR)).status === "returned" && (await busRow()).op_status === "available", bro.error);

  // inspection / license dates (15-day alert) + bus follow-up cannot add buses
  const bfol = await user("busfollow"); await admin.from("memberships").insert({ user_id: bfol.id, org_id: org, school_id: A, role: "teacher" }); await as(bfol, "مسؤول متابعة صيانة الباصات");
  const dIn = (n: number) => new Date(Date.now() + n * 864e5 + 3 * 36e5).toISOString().slice(0, 10);
  const bfAdd = await bfol.c.rpc("mt_bus_save", { _id: null, _school: A, _data: { code: "B-F" } });
  const bus3 = await tro.c.rpc("mt_bus_save", { _id: null, _school: A, _data: { code: "B-03", license_expiry: dIn(10), inspection_date: dIn(40) } });
  const b3 = ((await tro.c.rpc("mt_buses_list", { _org: org })).data as any[]).find((x) => x.id === bus3.data);
  await admin.rpc("mt_alerts_tick"); await admin.rpc("mt_alerts_tick");
  const ntL = async (u: string) => (await admin.from("notifications").select("title").eq("user_id", u).like("title", "%الترخيص للباص B-03%")).data!.length;
  const insp = (await admin.from("notifications").select("id").eq("user_id", tro.id).like("title", "%الفحص الدوري للباص B-03%")).data!.length;
  check("21c follow-up cannot add bus without the grant; license in 10 days = soon, inspection in 40 = valid; one alert each to transport + follow-up, none for inspection",
    !!bfAdd.error && !bus3.error && b3?.license_state === "soon" && b3?.inspection_state === "valid" && (await ntL(tro.id)) === 1 && (await ntL(bfol.id)) === 1 && insp === 0, [bus3.error, b3?.license_state]);

  // files + isolation + suspension
  const f1 = await prin.c.rpc("create_mt_file", { _id: R, _name: "صورة.jpg", _mime: "image/jpeg", _size: 1000 });
  const f2 = await outsider.c.rpc("create_mt_file", { _id: R, _name: "x.jpg", _mime: "image/jpeg", _size: 1000 });
  const canF = async (c: any) => (await c.rpc("can_read_file", { _file: f1.data?.[0]?.id })).data === true;
  check("22 attachment: requester adds; follow-up reads; outsider cannot add/read", !f1.error && !!f2.error && (await canF(fol.c)) && !(await canF(outsider.c)), [f1.error]);
  const lst = (await owner2.c.rpc("mt_list", { _org: org, _f: {} }));
  const mine = (await prinB.c.rpc("mt_list", { _org: org, _f: {} })).data;
  check("23 other org refused; other-branch principal sees none", !!lst.error && mine.total === 0, mine);
  const fl = (await fol.c.rpc("mt_list", { _org: org, _f: { kind: "school", status: "returned,closed" } })).data;
  check("24 list filters by kind/status for follow-up", fl.total >= 1 && fl.rows.every((r: any) => r.kind === "school"));
  await admin.from("org_sections").upsert({ org_id: org, section: "operations", enabled: false, reason: "اختبار", changed_by: owner.id });
  check("25 suspending the section blocks reads and actions", !(await get(fol.c, R)) && !!(await act(ex1.c, R, "note", { body: "x" })).error);
  await admin.from("org_sections").delete().eq("org_id", org).eq("section", "operations");
  const nt = (await admin.from("notifications").select("dedupe_key").eq("user_id", prin.id).like("dedupe_key", "mt:%")).data ?? [];
  check("26 requester got in-app notifications, no duplicates", nt.length > 3 && new Set(nt.map((x) => x.dedupe_key)).size === nt.length, nt.length);
} catch (e) { bad++; console.error(e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications();
  for (const o of orgs) {
    await admin.from("org_sections").delete().eq("org_id", o); await admin.from("files").delete().eq("source_type","maint").in("school_id",[...tr.schools]);
    for (const t of ["mt_events","mt_requests","mt_bus_events","mt_buses","mt_counters","mt_settings","mt_categories"]) { if (t==="mt_events"||t==="mt_bus_events") continue; await admin.from(t).delete().eq("org_id", o); }
    await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_overrides").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o);
    await admin.from("perm_roles").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o).catch(() => {});
  }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  process.exit(bad ? 1 : 0);
}
