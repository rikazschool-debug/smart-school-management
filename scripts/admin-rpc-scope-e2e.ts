// Role / scope / input checks over every signed-in-callable duty, meeting, minutes, decision, calendar and live-room RPC.
// Run: NODE_PATH=node_modules bun scripts/admin-rpc-scope-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "admin-rpc-scope-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `ars-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const riyadh = () => new Date(Date.now() + 3 * 3600e3);
const today = riyadh().toISOString().slice(0, 10);
const orgs: string[] = [];
const dow = riyadh().getUTCDay();
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const week = addDays(today, -dow);
const notes = async (u: string, like?: string) => { let q = admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u); if (like) q = q.ilike("title", `%${like}%`); return (await q).count ?? 0; };
const empty = (d: any) => d == null || (Array.isArray(d) && d.length === 0) || (typeof d === "object" && !Array.isArray(d) && (Object.keys(d).length === 0 || (Array.isArray(d.rows) && d.rows.length === 0) || (Array.isArray(d.items) && d.items.length === 0)));
const denied = (r: any) => !!r.error || empty(r.data);
const fail = (r: any) => !!r.error;
try {
  const pr = await user("pr"), vp = await user("vp"), t = await user("t"), tx = await user("tx"), st = await user("st"), owner = await user("owner"), ownerB = await user("ownerb"), prB = await user("prb");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة النطاق", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  const orgB = (await ownerB.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(orgB);
  const SB = (await ownerB.c.from("schools").select("id").eq("org_id", orgB).single()).data!.id; tr.addSchool(SB);
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [t, "teacher"], [tx, "teacher"], [st, "student"]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });
  await admin.from("memberships").insert({ user_id: prB.id, org_id: orgB, school_id: SB, role: "principal" });
  await admin.from("school_day_settings").insert({ school_id: S, study_days: [0, 1, 2, 3, 4, 5, 6] });
  const days = [0, 1, 2, 3, 4, 5, 6];
  const post = (await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "البوابة", kind: "gate", days, start_time: "06:45", end_time: "07:15", required: 1 } })).data as string;
  const R = ((await pr.c.rpc("adm_duty_roster_open", { _school: S, _week: week })).data as any);
  const RID = typeof R === "string" ? R : R?.id;
  const as = await pr.c.rpc("adm_duty_assign", { _roster: RID, _post: post, _date: addDays(today, 1), _user: t.id, _client: crypto.randomUUID() });
  const ro = (await admin.from("adm_duty_rosters").select("rev").eq("id", RID).single()).data!;
  const pub = await pr.c.rpc("adm_duty_publish", { _roster: RID, _rev: ro.rev });
  const A = (await admin.from("adm_duty_assignments").select("id, rev").eq("roster_id", RID).eq("user_id", t.id).limit(1).single()).data!;
  check("setup duty: post, roster, assignment, publish", !!post && !!RID && !as.error && !pub.error && !!A, [post, R, as.error, pub.error]);
  const at = new Date(Date.parse(addDays(today, 2) + "T10:00:00+03:00")).toISOString();
  const m = (await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "اجتماع النطاق", starts_at: at, mode: "virtual", members: [t.id] }, _rev: null, _client: null })).data as any;
  await pr.c.rpc("adm_meeting_send", { _id: m.id, _rev: 1 });
  const mn = (await pr.c.rpc("adm_minutes_save", { _meeting: m.id, _d: { topics: [{ title: "بند" }] }, _rev: null })).data as any;
  check("setup meeting + minutes", !!m?.id && !!mn, [m, mn]);
  console.log("DBG", JSON.stringify((await admin.from("adm_meetings").select("organizer, minutes_writer").eq("id", m.id).single()).data), pr.id, prB.id);

  // ---- outsiders: other-org principal, student, uninvited teacher ----
  const attackers: [string, any][] = [["other-org principal", prB], ["student", st], ["uninvited teacher", tx]];
  for (const [who, u] of attackers) {
    const c = u.c;
    const w: [string, any][] = [
      ["save_post", await c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "x", kind: "gate", days, start_time: "06:00", end_time: "07:00", required: 1 } })],
      ["edit post", await c.rpc("adm_duty_save_post", { _id: post, _school: S, _d: { name: "x", kind: "gate", days, start_time: "06:00", end_time: "07:00", required: 1 } })],
      ["save_settings", await c.rpc("adm_duty_save_settings", { _school: S, _max: 1, _weeks: 1 })],
      ["set_exempt", await c.rpc("adm_duty_set_exempt", { _school: S, _user: t.id, _reason: "x", _until: null, _remove: false })],
      ["roster_open", await c.rpc("adm_duty_roster_open", { _school: S, _week: addDays(week, 7) })],
      ["assign", await c.rpc("adm_duty_assign", { _roster: RID, _post: post, _date: addDays(today, 1), _user: tx.id, _client: crypto.randomUUID() })],
      ["suggest", await c.rpc("adm_duty_suggest", { _roster: RID, _rev: ro.rev + 1 })],
      ["publish", await c.rpc("adm_duty_publish", { _roster: RID, _rev: ro.rev + 1 })],
      ["remove", await c.rpc("adm_duty_remove", { _id: A.id, _reason: "x" })],
      ["substitute", await c.rpc("adm_duty_substitute", { _id: A.id, _user: tx.id, _reason: "x", _client: crypto.randomUUID() })],
      ["ack other's duty", await c.rpc("adm_duty_ack", { _id: A.id })],
      ["exec other's duty", await c.rpc("adm_duty_exec", { _id: A.id, _status: "done", _note: "", _rev: A.rev })],
      ["request change on other's duty", await c.rpc("adm_duty_request_change", { _id: A.id, _kind: "excuse", _reason: "x" })],
      ["edit meeting", await c.rpc("adm_meeting_save", { _id: m.id, _school: S, _d: { title: "تغيير", starts_at: at, mode: "virtual", members: [t.id], change_reason: "x" }, _rev: 2, _client: null })],
      ["send meeting", await c.rpc("adm_meeting_send", { _id: m.id, _rev: 2 })],
      ["cancel meeting", await c.rpc("adm_meeting_cancel", { _id: m.id, _reason: "x", _rev: 2 })],
      ["rsvp uninvited", await c.rpc("adm_meeting_rsvp", { _id: m.id, _rsvp: "accepted", _note: null })],
      ["attendance", await c.rpc("adm_meeting_attendance", { _id: m.id, _marks: [{ user_id: t.id, attended: true }] })],
      ["minutes save", await c.rpc("adm_minutes_save", { _meeting: m.id, _d: { topics: [{ title: "x" }] }, _rev: mn?.rev ?? 1 })],
      ["minutes confirm", await c.rpc("adm_minutes_confirm", { _id: mn?.id, _rev: mn?.rev ?? 1 })],
      ["decision create", await c.rpc("adm_decision_create", { _meeting: m.id, _d: { body: "x", assignee: t.id, due_date: addDays(today, 3), priority: "normal" }, _client: null })],
      ["live start", await c.rpc("adm_live_start", { _id: m.id })],
      ["live join", await c.rpc("adm_live_join", { _id: m.id, _kind: "join" })],
      ["live host action", await c.rpc("adm_live_host", { _id: m.id, _action: "remove", _user: t.id })],
      ["live self", await c.rpc("adm_live_self", { _id: m.id, _action: "hand_up" })],
      ["live beat", await c.rpc("adm_live_beat", { _id: m.id })],
      ["live leave", await c.rpc("adm_live_leave", { _id: m.id })],
    ];
    const writeLeaks = w.filter(([, r]) => !r.error).map(([n, r]) => n + "=" + JSON.stringify(r.data).slice(0, 60));
    check(`W ${who}: all ${w.length} write/room calls refused`, writeLeaks.length === 0, writeLeaks);
    const rd: [string, any][] = [
      ["duty_list", await c.rpc("adm_duty_list", { _school: S, _scope: "all", _q: null, _from: null, _to: null, _status: null, _post: null, _limit: 25, _offset: 0 })],
      ["duty_load", await c.rpc("adm_duty_load", { _school: S, _from: week, _to: addDays(week, 6) })],
      ["duty_preview", await c.rpc("adm_duty_preview", { _roster: RID })],
      ["duty_coverage", await c.rpc("adm_duty_coverage", { _roster: RID })],
      ["duty_change_list", await c.rpc("adm_duty_change_list", { _school: S, _status: null })],
      ["meeting_list", await c.rpc("adm_meeting_list", { _school: S, _org: null, _scope: "all", _q: null, _status: null, _mode: null, _from: null, _to: null, _limit: 25, _offset: 0 })],
      ["meeting_candidates", await c.rpc("adm_meeting_candidates", { _school: S, _scope: "school", _q: null, _branch: null, _role: null, _dept: null })],
      ["meeting_conflicts", await c.rpc("adm_meeting_conflicts", { _id: m.id })],
      ["decision_list", await c.rpc("adm_decision_list", { _school: S, _scope: "all", _meeting: null, _q: null, _status: null, _limit: 25, _offset: 0 })],
      ["calendar of school", await c.rpc("adm_calendar", { _school: S, _from: today, _to: addDays(today, 7) })],
      ["live roster", await c.rpc("adm_live_roster", { _id: m.id })],
      ["meeting row", await c.from("adm_meetings").select("id").eq("id", m.id)],
      ["minutes row", await c.from("adm_minutes").select("id").eq("meeting_id", m.id)],
    ];
    const readLeaks = rd.filter(([, r]) => !denied(r)).map(([n, r]) => n + "=" + JSON.stringify(r.data).slice(0, 80));
    check(`R ${who}: all ${rd.length} reads empty or refused`, readLeaks.length === 0, readLeaks);
  }
  // ---- teacher (invited, assigned) cannot act as organizer/scheduler ----
  const tw: [string, any][] = [
    ["publish", await t.c.rpc("adm_duty_publish", { _roster: RID, _rev: ro.rev + 1 })],
    ["assign self more", await t.c.rpc("adm_duty_assign", { _roster: RID, _post: post, _date: addDays(today, 2), _user: t.id, _client: crypto.randomUUID() })],
    ["decide change", await t.c.rpc("adm_duty_decide_change", { _id: crypto.randomUUID(), _accept: true, _note: null })],
    ["edit meeting", await t.c.rpc("adm_meeting_save", { _id: m.id, _school: S, _d: { title: "x", starts_at: at, mode: "virtual", members: [t.id], change_reason: "x" }, _rev: 2, _client: null })],
    ["start room", await t.c.rpc("adm_live_start", { _id: m.id })],
    ["host remove", await t.c.rpc("adm_live_host", { _id: m.id, _action: "remove", _user: pr.id })],
    ["create meeting", await t.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "x", starts_at: at, mode: "in_person", location: "x", members: [tx.id] }, _rev: null, _client: null })],
    ["decision create", await t.c.rpc("adm_decision_create", { _meeting: m.id, _d: { body: "x", assignee: tx.id, due_date: addDays(today, 3), priority: "normal" }, _client: null })],
  ];
  const tl = tw.filter(([, r]) => !r.error).map(([n]) => n);
  check(`T invited teacher: ${tw.length} organizer/scheduler calls refused`, tl.length === 0, tl);
  // ---- input validation by the legitimate principal ----
  const iv: [string, any][] = [
    ["post end before start", await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "x", kind: "gate", days, start_time: "08:00", end_time: "07:00", required: 1 } })],
    ["post empty name", await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "  ", kind: "gate", days, start_time: "06:00", end_time: "07:00", required: 1 } })],
    ["post required 0", await pr.c.rpc("adm_duty_save_post", { _id: null, _school: S, _d: { name: "x", kind: "gate", days, start_time: "06:00", end_time: "07:00", required: 0 } })],
    ["settings negative cap", await pr.c.rpc("adm_duty_save_settings", { _school: S, _max: -1, _weeks: 4 })],
    ["assign student", await pr.c.rpc("adm_duty_assign", { _roster: RID, _post: post, _date: addDays(today, 3), _user: st.id, _client: crypto.randomUUID() })],
    ["assign other-org user", await pr.c.rpc("adm_duty_assign", { _roster: RID, _post: post, _date: addDays(today, 3), _user: prB.id, _client: crypto.randomUUID() })],
    ["assign outside roster week", await pr.c.rpc("adm_duty_assign", { _roster: RID, _post: post, _date: addDays(week, 30), _user: tx.id, _client: crypto.randomUUID() })],
    ["remove without reason", await pr.c.rpc("adm_duty_remove", { _id: A.id, _reason: "" })],
    ["exec bad status", await t.c.rpc("adm_duty_exec", { _id: A.id, _status: "hacked", _note: "", _rev: A.rev })],
    ["change bad kind", await t.c.rpc("adm_duty_request_change", { _id: A.id, _kind: "hack", _reason: "x" })],
    ["meeting no title", await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "", starts_at: at, mode: "in_person", location: "x", members: [t.id] }, _rev: null, _client: null })],
    ["meeting in-person no room", await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "x", starts_at: at, mode: "in_person", members: [t.id] }, _rev: null, _client: null })],
    ["meeting bad mode", await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "x", starts_at: at, mode: "video", location: "x", members: [t.id] }, _rev: null, _client: null })],
    ["meeting invites student", await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "x", starts_at: at, mode: "virtual", members: [st.id] }, _rev: null, _client: null })],
    ["meeting invites other org", await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "x", starts_at: at, mode: "virtual", members: [prB.id] }, _rev: null, _client: null })],
    ["principal org scope", await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "x", starts_at: at, mode: "virtual", scope: "org", members: [t.id] }, _rev: null, _client: null })],
    ["edit sent w/o reason", await pr.c.rpc("adm_meeting_save", { _id: m.id, _school: S, _d: { title: "تغيير", starts_at: at, mode: "virtual", members: [t.id] }, _rev: 2, _client: null })],
    ["stale rev", await pr.c.rpc("adm_meeting_send", { _id: m.id, _rev: 1 })],
    ["cancel no reason", await pr.c.rpc("adm_meeting_cancel", { _id: m.id, _reason: "", _rev: 2 })],
    ["rsvp bad value", await t.c.rpc("adm_meeting_rsvp", { _id: m.id, _rsvp: "maybe-ish", _note: null })],
    ["decision no body", await pr.c.rpc("adm_decision_create", { _meeting: m.id, _d: { body: "", assignee: t.id, due_date: addDays(today, 3), priority: "normal" }, _client: null })],
    ["decision assignee student", await pr.c.rpc("adm_decision_create", { _meeting: m.id, _d: { body: "x", assignee: st.id, due_date: addDays(today, 3), priority: "normal" }, _client: null })],
    ["decision bad priority", await pr.c.rpc("adm_decision_create", { _meeting: m.id, _d: { body: "x", assignee: t.id, due_date: addDays(today, 3), priority: "mega" }, _client: null })],
    ["live host bad action", await pr.c.rpc("adm_live_host", { _id: m.id, _action: "drop_table", _user: t.id })],
    ["live self bad action", await t.c.rpc("adm_live_self", { _id: m.id, _action: "become_host" })],
    ["live join bad kind", await t.c.rpc("adm_live_join", { _id: m.id, _kind: "admin" })],
    ["unknown meeting id", await pr.c.rpc("adm_live_start", { _id: crypto.randomUUID() })],
    ["calendar huge range", await t.c.rpc("adm_calendar", { _school: S, _from: "2000-01-01", _to: "2100-01-01" })],
  ];
  const ivl = iv.filter(([, r]) => !r.error).map(([n, r]) => n + "=" + JSON.stringify(r.data).slice(0, 60));
  check(`I ${iv.length} malformed/out-of-scope inputs rejected`, ivl.length === 0, ivl);
  // ---- sanity: the same legitimate calls work ----
  const okc = [
    await t.c.rpc("adm_duty_ack", { _id: A.id }), await t.c.rpc("adm_meeting_rsvp", { _id: m.id, _rsvp: "accepted", _note: null }),
    await t.c.rpc("adm_calendar", { _school: S, _from: today, _to: addDays(today, 7) }), await pr.c.rpc("adm_meeting_conflicts", { _id: m.id }),
  ];
  check("OK legitimate owner/assignee calls succeed (no blanket denial)", okc.every((r) => !r.error), okc.map((r) => r.error?.message));
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok"); } catch (e) { console.log("cleanup error", e); }
  console.log(`\n${ok} passed, ${bad} failed`);
}
