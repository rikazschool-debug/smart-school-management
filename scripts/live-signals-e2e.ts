// Live refresh signals (live_signals): who receives which "something changed" note, and that it arrives over Realtime.
// Isolated lse- org A (principal, teacher, guardian) + org B (principal). Run: NODE_PATH=node_modules bun scripts/live-signals-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Lse-pass-" + run;
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${extra ? " — " + extra : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("lse-")).map((u) => u.id);
  if (!uids.length) return;
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "live-signals"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  for (const s of tr.schools) await admin.from("pickup_requests").delete().eq("school_id", s);
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  await admin.from("live_signals").delete().in("user_id", uids);
  for (const s of tr.schools) await admin.from("live_signals").delete().eq("school_id", s);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`cleanup: ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string) {
  const email = `lse-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } }); if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  c.realtime.setAuth(s.data.session!.access_token);
  return { c, email, id: s.data.user!.id };
}
const topics = async (u: any, since: number) => ((await u.c.from("live_signals").select("topic,school_id,user_id").gt("id", since)).data ?? []) as any[];

async function main() {
  await teardown();
  const ownerA = await user("ownera"), pr = await user("pr"), t = await user("t"), g = await user("g"), ownerB = await user("ownerb");
  const { data: orgA } = await ownerA.c.rpc("create_organization", { _org_name: "مؤسسة أ", _school_name: "مدرسة أ" });
  await ownerB.c.rpc("create_organization", { _org_name: "مؤسسة ب", _school_name: "مدرسة ب" });
  const S = (await ownerA.c.from("schools").select("id").eq("org_id", orgA).single()).data!.id;
  for (const [u, r] of [[pr, "principal"], [t, "teacher"], [g, "guardian"]] as any[]) {
    const a = await ownerA.c.rpc("invite_member", { _email: u.email, _school: S, _role: r }); if (a.error) throw a.error;
    const b = await u.c.rpc("accept_my_invitations"); if (b.error) throw b.error;
  }
  const ins = async (tb: string, v: any) => { const r = await admin.from(tb).insert({ school_id: S, ...v }).select().single(); if (r.error) throw new Error(tb + ": " + r.error.message); return r.data as any; };
  const st = await ins("students", { full_name: "طالب الإشارات" });
  const gd = await ins("guardians", { full_name: "ولي", user_id: g.id });
  const base = Number((await admin.from("live_signals").select("id").order("id", { ascending: false }).limit(1)).data?.[0]?.id ?? 0);

  // realtime receipt for the principal
  const got: string[] = [];
  const ch = pr.c.channel("lse-" + run).on("postgres_changes", { event: "INSERT", schema: "public", table: "live_signals" }, (p: any) => got.push(p.new.topic));
  await new Promise<void>((res) => ch.subscribe((s: string) => { if (s === "SUBSCRIBED") res(); }));
  await sleep(1500);

  await admin.from("notifications").insert({ user_id: t.id, school_id: S, kind: "test", title: "اختبار", dedupe_key: "lse-" + run });
  const pk = await ins("pickup_requests", { student_id: st.id, guardian_id: gd.id, requested_by: g.id, kind: "quick", req_date: today, pickup_name: "الأب" });
  ok("1 pickup fixture created", !!pk.id);
  await sleep(4000);

  const tt = await topics(t, base), pt = await topics(pr, base), gt = await topics(g, base), bt = await topics(ownerB, base), ot = await topics(ownerA, base);
  ok("2 teacher gets own notification signal", tt.some((x) => x.topic === "notif" && x.user_id === t.id));
  ok("3 principal does not get the teacher's notification signal", !pt.some((x) => x.topic === "notif"));
  ok("4 school staff get the pickup signal", pt.some((x) => x.topic === "pickup" && x.school_id === S) && tt.some((x) => x.topic === "pickup"));
  ok("5 org owner gets school signal", ot.some((x) => x.topic === "pickup" && x.school_id === S));
  ok("6 guardian gets only own pickup signal, not school-wide", gt.some((x) => x.topic === "pickup" && x.user_id === g.id) && !gt.some((x) => x.school_id));
  ok("7 other organization gets nothing", bt.length === 0, JSON.stringify(bt));
  ok("8 signals carry no record content", Object.keys(pt[0] ?? {}).sort().join(",") === "school_id,topic,user_id");
  ok("9 principal received pickup over Realtime", got.includes("pickup"), JSON.stringify(got));
  ok("10 principal did not receive teacher notification over Realtime", !got.includes("notif"));
  const w = await pr.c.from("live_signals").insert({ topic: "notif", user_id: t.id });
  ok("11 users cannot write signals", !!w.error);
  await pr.c.removeChannel(ch);

  await teardown();
  console.log(`\nlive-signals-e2e: ${pass}/${pass + fail}`);
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown().catch(() => {}); process.exit(1); });
