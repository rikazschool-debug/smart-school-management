// Proves test cleanup is scoped to the run: cleaning run A never deletes
// notifications of run B or of a non-test user, and refuses when the run's
// schools contain rows of outsiders.
// Run: NODE_PATH=node_modules bun scripts/cleanup-scope-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { TestRun } from "./lib/test-run";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
const stamp = Date.now();
const mk = async (tag: string) => (await admin.auth.admin.createUser({ email: `scope-${tag}-${stamp}@rikaz.test`, password: "Scope-" + stamp, email_confirm: true })).data.user!.id;
const uA = await mk("a"), uB = await mk("b"), uReal = await mk("real");
const school = (await admin.from("schools").select("id").limit(1).single()).data!.id; // any existing school; only notifications are written
const note = async (u: string, k: string) => (await admin.from("notifications").insert({ user_id: u, school_id: school, kind: "test", title: "t", dedupe_key: `scope:${stamp}:${k}` }).select("id").single()).data!.id;
const nA = await note(uA, "a"), nB = await note(uB, "b"), nReal = await note(uReal, "real");

// Run A scoped to its user but sharing a school with others -> must refuse.
const runA = new TestRun(admin, "scope-A"); runA.addUser(uA); runA.addSchool(school);
let refused = false; try { await runA.deleteNotifications(); } catch { refused = true; }
const still = await admin.from("notifications").select("id").in("id", [nA, nB, nReal]);
check("cleanup refuses when run school has outsider rows, deletes nothing", refused && still.data?.length === 3, still.data);

// Run A without school claim -> only its own personal-school rows; school row not in scope is kept.
const runA2 = new TestRun(admin, "scope-A2"); runA2.addUser(uA);
const n = await runA2.deleteNotifications();
const after = await admin.from("notifications").select("id").in("id", [nA, nB, nReal]);
check("cleanup without school claim deletes nothing outside run schools", n === 0 && after.data?.length === 3, after.data);

// Direct removal of A's row by id leaves B and real user's rows.
await admin.from("notifications").delete().eq("id", nA);
const left = (await admin.from("notifications").select("id").in("id", [nB, nReal])).data ?? [];
check("other run and real user notifications untouched", left.length === 2, left);

await admin.from("notifications").delete().in("id", [nB, nReal]);
for (const u of [uA, uB, uReal]) await admin.auth.admin.deleteUser(u);
console.log(`\n${ok} passed, ${bad} failed`);
