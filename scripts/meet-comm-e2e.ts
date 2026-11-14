// Package-next item 5: meetings inside Communication (adm_my_meetings) + accept / reject / excuse with reasons.
// Run: NODE_PATH=node_modules bun scripts/meet-comm-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "meet-comm-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `mcm-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id, email };
}
const notes = async (u: string, like: string) => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u).ilike("title", `%${like}%`)).count ?? 0;
const tomorrow = new Date(Date.now() + 26 * 3600e3).toISOString();
const orgs: string[] = [];
const KEEP = process.argv.includes("--keep");
if (process.argv.includes("--teardown")) {
  const f = JSON.parse(readFileSync("/tmp/browser/mcm/fixture.json", "utf8"));
  f.schools.forEach((x: string) => tr.addSchool(x)); f.users.forEach((x: string) => tr.addUser(x));
  await tr.deleteNotifications(); await tr.purgeOrg(f.org); for (const u of f.users) await admin.auth.admin.deleteUser(u);
  console.log("teardown ok"); process.exit(0);
}
let fx: any = {};
try {
  const owner = await user("owner"), pr = await user("pr"), t1 = await user("t1"), t2 = await user("t2"), t3 = await user("t3"), out = await user("out");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة اجتماعات التواصل", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"], [t2, "teacher"], [t3, "teacher"], [out, "teacher"]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  fx = { org, schools: [S], pw, pr: pr.email, t1: t1.email, t2: t2.email };
  const mk = async (title: string, mode: string, send = true) => {
    const m = (await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title, starts_at: tomorrow, duration_min: 30, mode, location: mode === "in_person" ? "قاعة الاجتماعات" : "", privacy: "normal", needs_rsvp: true, members: [t1.id, t2.id, t3.id] }, _rev: null, _client: null })).data as any;
    if (send) await pr.c.rpc("adm_meeting_send", { _id: m.id, _rev: m.rev });
    return m.id as string;
  };
  const P = await mk("اجتماع حضوري للتواصل", "in_person"), V = await mk("اجتماع افتراضي للتواصل", "virtual"), D = await mk("مسودة لم ترسل", "in_person", false);

  // ---- list ----
  const l1 = ((await t1.c.rpc("adm_my_meetings")).data ?? []) as any[];
  const ip = l1.find((x) => x.id === P);
  check("1a invitee sees both in-person and virtual meetings", !!ip && l1.some((x) => x.id === V), l1.map((x) => x.title));
  check("1b row has invitation date, time, organizer, type, place, status, reply", !!ip?.invited_at && !!ip?.starts_at && ip?.organizer_name === "pr" && ip?.mode === "in_person" && ip?.location === "قاعة الاجتماعات" && ip?.status === "scheduled" && ip?.my_rsvp === "pending", ip);
  check("1c unsent draft is not listed", !l1.some((x) => x.id === D));
  const lo = ((await out.c.rpc("adm_my_meetings")).data ?? []) as any[];
  check("1d non-invitee sees none of them", !lo.some((x) => [P, V, D].includes(x.id)));
  const lp = ((await pr.c.rpc("adm_my_meetings")).data ?? []) as any[];
  check("1e organizer sees own sent meetings marked as organizer", lp.filter((x) => [P, V].includes(x.id) && x.am_organizer).length === 2);

  // ---- replies ----
  const noReason = await t1.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "rejected", _note: "  " });
  const noReason2 = await t1.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "declined", _note: null });
  check("2a reject and excuse require a reason", !!noReason.error && !!noReason2.error);
  const n0 = await notes(pr.id, "رفض دعوة اجتماع");
  const rj = await t1.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "rejected", _note: "لدي حصة" });
  const rj2 = await t1.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "rejected", _note: "لدي حصة" });
  check("2b reject saved with reason; organizer notified once (retry safe)", !rj.error && !rj2.error && (await notes(pr.id, "رفض دعوة اجتماع")) === n0 + 1, rj.error);
  const ex = await t2.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "declined", _note: "إجازة" });
  check("2c excuse saved separately from reject", !ex.error && (await notes(pr.id, "اعتذار عن اجتماع")) === 1);
  const ac = await t1.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "accepted", _note: "ignored" });
  const mem = (await admin.from("adm_meeting_members").select("user_id, rsvp, rsvp_note, attended").eq("meeting_id", P)).data ?? [];
  const m1 = mem.find((x) => x.user_id === t1.id), m2 = mem.find((x) => x.user_id === t2.id);
  check("2d accepting later clears the reason; acceptance is not attendance", !ac.error && m1?.rsvp === "accepted" && m1?.rsvp_note === null && m1?.attended === null && m2?.rsvp === "declined" && m2?.rsvp_note === "إجازة", mem);
  const bogus = await t3.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "maybe", _note: "x" });
  const outR = await out.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "accepted", _note: null });
  check("2e invalid reply and non-invitee reply refused", !!bogus.error && !!outR.error);
  await t3.c.rpc("adm_meeting_rsvp", { _id: P, _rsvp: "rejected", _note: "سبب" });
  const day = new Date(Date.parse(tomorrow) + 3 * 3600e3).toISOString().slice(0, 10);
  const cal3 = ((await t3.c.rpc("adm_calendar", { _school: S, _from: day, _to: day })).data ?? []) as any[];
  const cal1 = ((await t1.c.rpc("adm_calendar", { _school: S, _from: day, _to: day })).data ?? []) as any[];
  check("2f rejected meeting leaves the personal calendar; accepted stays", !cal3.some((x) => x.ref_id === P || x.id === P) && cal1.some((x) => x.ref_id === P || x.id === P), [cal3, cal1]);
  // ---- join gating: invitee cannot join a virtual room that is not live ----
  const join = await t1.c.rpc("adm_live_join", { _id: V });
  check("3a invitee cannot enter a virtual room before the organizer starts it", !!join.error, join.error?.message);
  const outJoin = await out.c.rpc("adm_live_join", { _id: V });
  check("3b non-invitee cannot enter the room", !!outJoin.error);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  if (KEEP && orgs[0]) { const fs = await import("fs"); fs.mkdirSync("/tmp/browser/mcm", { recursive: true }); fs.writeFileSync("/tmp/browser/mcm/fixture.json", JSON.stringify({ ...fx, users: [...tr.users] })); console.log("kept fixture"); }
  else { try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); } catch (e) { console.log("cleanup error", e); } }
}
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
