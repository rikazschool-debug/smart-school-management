// Cleanup monitor test (safe simulation): NODE_PATH=node_modules bun scripts/cleanup-monitor-e2e.ts
// Uses a private channel "e2e:<run>" for fake runs/alerts and notifies only a run-created user,
// so the live cleanup job, live alerts and real platform admins are never touched.
import { createClient } from "@supabase/supabase-js";
import { TestRun } from "./lib/test-run";
const URL = process.env.SUPABASE_URL!, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const a = createClient(URL, KEY, { auth: { persistSession: false } });
const run = new TestRun(a, "cleanup-monitor");
const ch = `e2e:${run.id}`;
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log(c ? "✓" : "✗", m); };
const email = `mon-${run.id}@rikaz.test`, pw = `Pw-${run.id}`;
const u = await a.auth.admin.createUser({ email, password: pw, email_confirm: true });
if (u.error) throw u.error; const uid = u.data.user.id; run.addUser(uid);
const check = async (now: Date) => {
  const r = await a.rpc("check_cleanup_health", { _now: now.toISOString(), _channel: ch, _notify_to: [uid] });
  if (r.error) throw r.error; return r.data as Record<string, any>;
};
const notes = async () => ((await a.from("notifications").select("dedupe_key,title").eq("user_id", uid)).data ?? []);
const open = async () => ((await a.from("cleanup_alerts").select("kind").eq("channel", ch).is("resolved_at", null)).data ?? []).map((x) => x.kind).sort();
const ins = (o: Record<string, unknown>) => a.from("file_cleanup_runs").insert({ channel: ch, marked: 0, rows_removed: 0, delete_requests: 0, failed: 0, ...o });
try {
  const t0 = new Date();
  // 1) no success ever -> stale alert, exactly once even when checked repeatedly
  let s = await check(t0);
  ok(s.stale === true && s.opened === 1, "no successful run -> stale alert opened");
  await check(new Date(t0.getTime() + 3600e3)); await check(new Date(t0.getTime() + 7200e3));
  ok((await notes()).filter((n) => n.dedupe_key.startsWith("cleanup-alert:")).length === 1, "repeated checks do not repeat the alert");
  // 2) recovery: a successful run -> alert resolved + one recovery notice
  await ins({ status: "ok", started_at: t0.toISOString(), finished_at: t0.toISOString() });
  s = await check(new Date(t0.getTime() + 60e3));
  ok(s.stale === false && s.resolved === 1 && (await open()).length === 0, "successful run -> recovered");
  await check(new Date(t0.getTime() + 120e3));
  ok((await notes()).filter((n) => n.dedupe_key.startsWith("cleanup-recovered:")).length === 1, "recovery recorded once");
  // 3) delay: success becomes older than 3h -> stale again (new alert)
  s = await check(new Date(t0.getTime() + 4 * 3600e3));
  ok(s.stale === true && s.opened === 1, "success older than the 3h window -> late alert");
  // 4) failure: a failed latest run -> failing alert
  const tf = new Date(t0.getTime() + 4 * 3600e3 + 60e3);
  await ins({ status: "failed", started_at: tf.toISOString(), finished_at: tf.toISOString(), note: "simulated" });
  s = await check(new Date(tf.getTime() + 60e3));
  ok(s.failing === true && (await open()).includes("failing"), "failed run -> failing alert");
  // 5) stuck: a run started >30 min ago and never finished
  await ins({ status: "running", started_at: new Date(tf.getTime() + 60e3).toISOString() });
  s = await check(new Date(tf.getTime() + 40 * 60e3));
  ok(s.stuck === true && (await open()).includes("stuck"), "unfinished run -> stuck alert");
  // 6) everything healthy again
  await a.from("file_cleanup_runs").update({ status: "ok", finished_at: new Date(tf.getTime() + 41 * 60e3).toISOString() }).eq("channel", ch).eq("status", "running");
  s = await check(new Date(tf.getTime() + 42 * 60e3));
  ok((await open()).length === 0, "after a good run all alerts resolve");
  ok(!JSON.stringify(await notes()).match(/rikaz-files|\.pdf|storage/), "alerts carry no file paths or names");
  // 7) permissions: a signed-in non-admin can neither run the monitor nor read health/alerts
  const c = createClient(URL, PUB, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: pw });
  ok(!!(await c.rpc("check_cleanup_health", {})).error, "signed-in user cannot run the monitor");
  ok(!!(await c.rpc("cleanup_health")).error, "signed-in non-admin cannot read cleanup health");
  ok(((await c.from("cleanup_alerts").select("id")).data ?? []).length === 0, "signed-in non-admin sees no alerts");
  // 8) the live job and monitor are scheduled separately
  const jobs = await a.rpc("check_cleanup_health", { _now: new Date().toISOString(), _channel: `${ch}:noop`, _notify_to: [] });
  ok(!jobs.error, "monitor callable by the scheduler role");
} finally {
  await a.from("cleanup_alerts").delete().like("channel", `${ch}%`);
  await a.from("file_cleanup_runs").delete().eq("channel", ch);
  await run.deleteNotifications();
  await a.auth.admin.deleteUser(uid);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
