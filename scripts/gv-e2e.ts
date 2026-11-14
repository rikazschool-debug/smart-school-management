// Guardian visits (needs gv-fixture setup): settings, guardian request + school call, confirm/propose/keep/decline/cancel,
// concurrent booking, calendar, reception check-in/out/no-show, field redaction, branch isolation, unlinked student.
// Run: NODE_PATH=node_modules bun scripts/gv-fixture.ts && NODE_PATH=node_modules bun scripts/gv-e2e.ts; then gv-fixture.ts teardown
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/gv/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: f[k], password: f.pw }); if (s.error) throw s.error; return c; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const [S1, S2] = f.schools; const id = f.ids; const K = f.kids;
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const tmr = new Date(Date.now() + 27 * 3600e3).toISOString().slice(0, 10);
const [owner, p1, p2, r1, h1, g1, g2] = await Promise.all(["owner", "p1", "p2", "r1", "h1", "g1", "g2"].map(as));
const get = async (c: any, v: string) => (await c.rpc("gv_get", { _id: v })) as { data: any; error: any };
const act = (c: any, v: string, rev: number, a: string, p: any = {}) => c.rpc("gv_act", { _id: v, _action: a, _rev: rev, _p: p });
const rev = async (v: string) => (await admin.from("gv_visits").select("rev").eq("id", v).single()).data!.rev as number;

const st = await p1.rpc("gv_settings_save", { _school: S1, _p: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start_time: "07:00", end_time: "13:00", slot_minutes: 20 } });
check("1 principal saves morning visit settings", !st.error, st.error);
await p2.rpc("gv_settings_save", { _school: S2, _p: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start_time: "07:00", end_time: "13:00", slot_minutes: 20 } });
check("2 reception cannot change settings", !!(await r1.rpc("gv_settings_save", { _school: S1, _p: { days: [0], start_time: "07:00", end_time: "08:00", slot_minutes: 20 } })).error);
check("3 end before start refused", !!(await p1.rpc("gv_settings_save", { _school: S1, _p: { days: [0], start_time: "15:00", end_time: "13:00", slot_minutes: 20 } })).error);
const kids = (await g1.rpc("gv_my_children")).data as any[];
check("4 guardian with two children sees both with their schools", kids.length === 2 && kids.some((k) => k.school_id === S1) && kids.some((k) => k.school_id === S2), kids);
const slots = (await g1.rpc("gv_slots", { _school: S1, _from: tmr, _to: tmr })).data as any[];
check("5 guardian sees free slots for tomorrow", slots.length === 18 && slots.every((s) => s.free), slots?.length);

// closure removes the day
await p1.rpc("gv_closure_add", { _school: S1, _date: tmr, _reason: "اختبار" });
check("6 closed day has no slots", ((await g1.rpc("gv_slots", { _school: S1, _from: tmr, _to: tmr })).data as any[]).length === 0);
check("7 booking on a closed day is refused", !!(await g1.rpc("gv_create", { _p: { source: "guardian", student_id: K.k1, reason_cat: "academic", details: "متابعة المستوى", slot_date: tmr, slot_time: "08:00" } })).error);
const cl = (await p1.rpc("gv_settings_get", { _school: S1 })).data.closures[0]; await p1.rpc("gv_closure_del", { _id: cl.id });

// guardian request
const R = await g1.rpc("gv_create", { _p: { source: "guardian", student_id: K.k1, reason_cat: "academic", details: "متابعة المستوى في الرياضيات", slot_date: tmr, slot_time: "08:00" } });
check("8 guardian requests a visit for own child", !R.error, R.error);
const V1 = R.data as string;
check("9 request for a student not linked to the guardian is refused", !!(await g1.rpc("gv_create", { _p: { source: "guardian", student_id: K.k3, reason_cat: "academic", details: "محاولة", slot_date: tmr, slot_time: "10:00" } })).error);
check("10 off-grid time refused", !!(await g1.rpc("gv_create", { _p: { source: "guardian", student_id: K.k1, reason_cat: "academic", details: "وقت غير صحيح", slot_date: tmr, slot_time: "08:05" } })).error);
const n1 = (await admin.from("notifications").select("id").eq("user_id", id.p1).eq("kind", "visit")).data ?? [];
check("11 principal notified of the new request", n1.length >= 1, n1);
check("12 principal of another school cannot open it (URL change)", !!(await get(p2, V1)).error);
check("13 other school list refused for principal", !!(await p1.rpc("gv_list", { _school: S2, _view: "school" })).error);
check("14 guardian cannot confirm own request", !!(await act(g1, V1, await rev(V1), "confirm")).error);
check("15 confirm without host is refused", !!(await act(p1, V1, await rev(V1), "confirm")).error);
const c1 = await act(p1, V1, await rev(V1), "confirm", { host_id: id.h1 });
check("16 principal confirms with host", !c1.error && c1.data.status === "confirmed", c1.error ?? c1.data);
check("17 stale version refused", !!(await act(p1, V1, 1, "cancel", { reason: "x" })).error);
const calG = (await g1.rpc("gv_list", { _school: null, _view: "calendar", _from: today, _to: tmr })).data as any[];
const calH = (await h1.rpc("gv_list", { _school: null, _view: "calendar", _from: today, _to: tmr })).data as any[];
check("18 confirmed visit appears in guardian and host calendars", calG.some((x) => x.id === V1) && calH.some((x) => x.id === V1), { calG, calH });
const gn = (await admin.from("notifications").select("title").eq("user_id", id.g1).eq("kind", "visit")).data ?? [];
check("19 guardian notified of confirmation", gn.some((x: any) => x.title.includes("تأكد")), gn);

// concurrent booking on the same slot
const [a, b] = await Promise.all([
  g1.rpc("gv_create", { _p: { source: "guardian", student_id: K.k1, reason_cat: "behavior", details: "حجز متزامن", slot_date: tmr, slot_time: "08:20" } }),
  g2.rpc("gv_create", { _p: { source: "guardian", student_id: K.k3, reason_cat: "behavior", details: "حجز متزامن", slot_date: tmr, slot_time: "08:20" } }),
]);
check("20 simultaneous booking: exactly one wins", [a, b].filter((x) => !x.error).length === 1, [a.error?.message, b.error?.message]);
const V2 = (a.data ?? b.data) as string;
const d2 = await act(p1, V2, await rev(V2), "decline", { reason: "الموعد يتعارض مع الاختبارات" });
check("21 school rejects a request with a reason", !d2.error && d2.data.status === "rejected", d2.error ?? d2.data);
const g2v = a.data ? g1 : g2;
const seen = (await get(g2v, V2)).data;
check("22 guardian sees the rejection reason", seen?.status === "rejected" && seen?.decision_reason?.includes("الاختبارات"), seen);
check("23 rejected slot is free again", !(await g2.rpc("gv_create", { _p: { source: "guardian", student_id: K.k3, reason_cat: "admin", details: "إعادة حجز", slot_date: tmr, slot_time: "08:20" } })).error);

// school call → guardian proposes → school confirms → school proposes → guardian keeps → guardian cancels
const C = await p1.rpc("gv_create", { _p: { source: "school", student_id: K.k1, guardian_id: (await p1.rpc("gv_guardians", { _student: K.k1 })).data[0].id, reason_cat: "behavior", details: "ملاحظات سلوكية", host_id: id.h1, slot_date: tmr, slot_time: "09:00" } });
check("24 principal calls the guardian", !C.error, C.error);
const V3 = C.data as string;
check("25 school call requires a linked guardian", !!(await p1.rpc("gv_create", { _p: { source: "school", student_id: K.k3, guardian_id: (await p1.rpc("gv_guardians", { _student: K.k1 })).data[0].id, reason_cat: "behavior", host_id: id.h1, slot_date: tmr, slot_time: "09:40" } })).error);
const pr = await act(g1, V3, await rev(V3), "propose", { slot_date: tmr, slot_time: "09:20" });
check("26 guardian requests a change → proposed, awaiting school", !pr.error && pr.data.status === "proposed" && pr.data.awaiting === "school", pr.error ?? pr.data);
check("27 taken slot cannot be proposed", !!(await act(p1, V3, await rev(V3), "propose", { slot_date: tmr, slot_time: "08:00" })).error);
const cf = await act(p1, V3, await rev(V3), "confirm");
check("28 school accepts the new time", !cf.error && cf.data.status === "confirmed" && cf.data.slot_time === "09:20", cf.error ?? cf.data);
const pr2 = await act(p1, V3, await rev(V3), "propose", { slot_date: tmr, slot_time: "10:00" });
check("29 change proposed on a confirmed visit keeps the last confirmed time", !pr2.error && pr2.data.status === "proposed" && pr2.data.conf_time === "09:20", pr2.error ?? pr2.data);
const kp = await act(g1, V3, await rev(V3), "keep");
check("30 guardian keeps the confirmed time", !kp.error && kp.data.status === "confirmed" && kp.data.slot_time === "09:20", kp.error ?? kp.data);
await act(p1, V3, await rev(V3), "note", { note: "ملاحظة داخلية حساسة" });
const fam = (await get(g1, V3)).data;
check("31 guardian never sees the internal note or internal events", fam && !("internal_note" in fam) && !fam.events.some((e: any) => e.internal), fam);
const full = (await get(p1, V3)).data;
check("32 history keeps every decision with its actor", full.events.map((e: any) => e.action).join(",") === "create,propose,confirm,propose,keep,note" && full.events.every((e: any) => e.by), full.events);
const cn = await act(g1, V3, await rev(V3), "cancel", { reason: "ظرف طارئ" });
check("33 guardian cancels with reason; calendar drops it", !cn.error && !((await g1.rpc("gv_list", { _school: null, _view: "calendar", _from: today, _to: tmr })).data as any[]).some((x) => x.id === V3), cn.error);
check("34 cancelled visit cannot be confirmed", !!(await act(p1, V3, await rev(V3), "confirm")).error);

// reception (today's confirmed visits, inserted as past-time fixtures)
const base = { org_id: f.org, school_id: S1, guardian_user: id.g1, source: "school", reason_cat: "health", details: "تفاصيل صحية سرية", host_id: id.h1, slot_date: today, status: "confirmed", created_by: id.p1 };
const gidRow = (await admin.from("student_guardians").select("guardian_id").eq("student_id", K.k1).single()).data!.guardian_id;
const T1 = (await admin.from("gv_visits").insert({ ...base, student_id: K.k1, guardian_id: gidRow, slot_time: "07:00", conf_date: today, conf_time: "07:00" }).select("id").single()).data!.id;
const T2 = (await admin.from("gv_visits").insert({ ...base, student_id: K.k1, guardian_id: gidRow, slot_time: "07:20", conf_date: today, conf_time: "07:20" }).select("id").single()).data!.id;
const rl = (await r1.rpc("gv_list", { _school: S1, _view: "reception" })).data as any[];
check("35 reception sees today's confirmed visits without reason or details", rl.length === 2 && rl.every((x) => !("reason_cat" in x) && !("details" in x) && x.guardian_id_tail === "5432"), rl);
check("36 reception cannot open the school list", !!(await r1.rpc("gv_list", { _school: S1, _view: "school" })).error);
check("37 reception cannot open tomorrow's visit", !!(await get(r1, V1)).error);
check("38 reception cannot check in a future visit", !!(await act(r1, V1, await rev(V1), "arrive")).error);
const ar = await act(r1, T1, await rev(T1), "arrive");
check("39 reception records arrival", !ar.error && ar.data.status === "arrived", ar.error ?? ar.data);
const dp = await act(r1, T1, await rev(T1), "depart");
check("40 reception records departure → completed", !dp.error && dp.data.status === "completed" && !!dp.data.left_at, dp.error ?? dp.data);
const ns = await act(r1, T2, await rev(T2), "no_show");
check("41 reception records a no-show after the time passed", !ns.error && ns.data.status === "no_show", ns.error ?? ns.data);
const log = (await get(p1, T1)).data;
check("42 log shows arrival and departure by reception", log.events.filter((e: any) => ["arrive", "depart"].includes(e.action)).length === 2 && !!log.arrived_at, log.events);
const ol = (await owner.rpc("gv_list", { _school: S1, _view: "school" })).data as any[];
check("43 owner sees the school's visit log", ol.length >= 5, ol?.length);
check("44 host picker pool only for visit managers", !!(await r1.rpc("people_pick", { _purpose: "visit_host", _school: S1 })).error && ((await p1.rpc("people_pick", { _purpose: "visit_host", _school: S1 })).data as any[]).some((p) => p.user_id === id.h1));
check("45 no direct table read", ((await g1.from("gv_visits" as any).select("id")).data ?? []).length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
