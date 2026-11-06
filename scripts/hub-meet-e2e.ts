// Hub meetings permissions: hub_meetings.create/start/attend on the server, revoke mid-session, section switch, org isolation.
// Run: NODE_PATH=node_modules bun scripts/hub-meet-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hub-meet-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `hmt-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const notes = async (u: string, like?: string) => { let q = admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u); if (like) q = q.ilike("title", `%${like}%`); return (await q).count ?? 0; };
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const soon = new Date(Date.now() + 10 * 60e3).toISOString();
const orgs: string[] = [];
try {
  const owner = await user("owner"), coord = await user("coord"), tA = await user("tA"), tB = await user("tB"), other = await user("other"), out = await user("out");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة البوابة", _school_name: "الفرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "الفرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "فرع" })).data; orgs.push(org2);
  const C = (await other.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(C);
  const mem = async (u: any, s: string, r: string, o = org) => { const x = await admin.from("memberships").insert({ user_id: u.id, org_id: o, school_id: s, role: r }); if (x.error) throw x.error; };
  await mem(coord, A, "teacher"); await mem(tA, A, "teacher"); await mem(tB, B, "teacher"); await mem(out, C, "teacher", org2);
  const base = { title: "اجتماع منسق", starts_at: soon, duration_min: 30, mode: "virtual", privacy: "normal", scope: "school", members: [tA.id] };
  const save = (u: any, s: string, d: any = base) => u.c.rpc("adm_meeting_save", { _id: null, _school: s, _d: d, _rev: null, _client: null });
  const grant = (action: string, effect: string | null) => owner.c.rpc("perm_override_set", { _org: org, _user: coord.id, _section: "hub_meetings", _action: action, _effect: effect, _scope: effect ? "branch" : null, _reason: "اختبار البوابة" });

  const n0 = await save(coord, A);
  check("1 teacher without hub_meetings.create cannot organize", !!n0.error);
  const g1 = await grant("create", "grant");
  const m1 = await save(coord, A); const M = (m1.data as any)?.id;
  check("2 hub_meetings.create lets the coordinator organize in their branch", !g1.error && !m1.error && !!M, [g1.error, m1.error]);
  const send = await coord.c.rpc("adm_meeting_send", { _id: M, _rev: (m1.data as any)?.rev ?? 1 });
  check("3 organizer sends invitations", !send.error, send.error);
  const st0 = await coord.c.rpc("adm_live_start", { _id: M });
  check("4 without hub_meetings.start the organizer cannot start the Agora room", !!st0.error);
  await grant("start", "grant");
  const st1 = await coord.c.rpc("adm_live_start", { _id: M });
  const j1 = await coord.c.rpc("adm_live_join", { _id: M, _kind: "join" });
  check("5 with hub_meetings.start the organizer starts and joins as host", !st1.error && (j1.data as any)?.host === true, [st1.error, j1.error]);
  const jt = await tA.c.rpc("adm_live_join", { _id: M, _kind: "join" });
  check("6 invited teacher joins as member", !jt.error && (jt.data as any)?.host === false, jt.error);
  const jo = await out.c.rpc("adm_live_join", { _id: M, _kind: "join" });
  const jb = await tB.c.rpc("adm_live_join", { _id: M, _kind: "join" });
  check("7 other-org user and uninvited branch-B teacher are refused (direct link)", !!jo.error && !!jb.error);
  const rd = await out.c.from("adm_meetings").select("id").eq("id", M);
  check("8 other-org user cannot read the meeting row", !rd.data?.length);
  await grant("start", "deny");
  const j2 = await coord.c.rpc("adm_live_join", { _id: M, _kind: "renew" });
  const mute = await coord.c.rpc("adm_live_host", { _id: M, _action: "mute", _user: tA.id });
  check("9 revoking start mid-session: token renewal refused and host controls refused", !!j2.error && !!mute.error, [j2.data, mute.error]);
  await grant("start", null);
  const att0 = await tB.c.rpc("adm_meeting_attendance", { _id: M, _marks: [{ user_id: tA.id, attended: true }] });
  check("10 non-organizer without attend permission cannot record attendance", !!att0.error);
  await admin.from("org_sections").upsert({ org_id: org, section: "comm_hub", enabled: false }, { onConflict: "org_id,section" });
  const off = await save(coord, A, { ...base, title: "بعد الإيقاف" });
  check("11 platform switch off for comm_hub removes the extra organize right", !!off.error);
  await admin.from("org_sections").delete().eq("org_id", org);
  const ob = await save(coord, B, { ...base, members: [tB.id] });
  check("12 branch-scoped grant does not reach branch B", !!ob.error);
  const oc = await save(coord, C, { ...base, members: [out.id] });
  check("13 cannot organize in another organization", !!oc.error);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try { await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok"); } catch (e) { console.log("cleanup error", e); }
  console.log(`\n${ok} passed, ${bad} failed`);
}
