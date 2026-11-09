// Online status (presence_*): server-clock beats, multi-tab, sign-out end, 90s timeout, owner/conversation scope, no manual writes.
// Run: NODE_PATH=node_modules bun scripts/presence-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "prs");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
async function user(tag: string) {
  const email = `prs-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const get = (rows: any, id: string) => ((rows ?? []) as any[]).find((r) => r.user_id === id);
try {
  const owner = await user("owner"), t = await user("t"), st = await user("st"), g = await user("g"), other = await user("other");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الحالة", _school_name: "فرع" })).data; orgs.push(org);
  const org2 = (await other.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع" })).data; orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert([{ user_id: t.id, org_id: org, school_id: A, role: "teacher" }, { user_id: st.id, org_id: org, school_id: A, role: "student" }, { user_id: g.id, org_id: org, school_id: A, role: "guardian" }]);

  let po = await owner.c.rpc("presence_org", { _org: org });
  const t0 = get(po.data, t.id);
  check("never-seen teacher: offline, no last seen («آخر ظهور غير متاح»)", !po.error && t0 && t0.online === false && t0.last_seen === null, po.error ?? t0);

  const tabA = randomUUID(), tabB = randomUUID();
  await t.c.rpc("presence_beat", { _tab: tabA });
  po = await owner.c.rpc("presence_org", { _org: org });
  check("teacher beat → owner sees «متصل»", get(po.data, t.id)?.online === true, po.data);

  const conv = (await owner.c.rpc("start_direct_conversation", { _school: A, _other: t.id })).data as string;
  const pc = await owner.c.rpc("presence_conv", { _conv: conv });
  check("owner sees teacher's status in their direct chat", get(pc.data, t.id)?.online === true, pc.error ?? pc.data);
  const pm = await owner.c.rpc("presence_my_convs", { _school: A });
  check("conversation list shows the other party online", ((pm.data ?? []) as any[]).some((r) => r.conversation_id === conv && r.online), pm.error ?? pm.data);

  await t.c.rpc("presence_beat", { _tab: tabB });
  await t.c.rpc("presence_end", { _tab: tabA });
  po = await owner.c.rpc("presence_org", { _org: org });
  check("one device signs out, another stays active → still online", get(po.data, t.id)?.online === true, po.data);

  await t.c.rpc("presence_end", { _tab: tabB });
  po = await owner.c.rpc("presence_org", { _org: org });
  const t2 = get(po.data, t.id);
  check("last session signed out → offline at once with last seen", t2?.online === false && !!t2?.last_seen, t2);

  await t.c.rpc("presence_beat", { _tab: tabA });
  await admin.from("presence_sessions").update({ last_beat: new Date(Date.now() - 100_000).toISOString() }).eq("user_id", t.id);
  po = await owner.c.rpc("presence_org", { _org: org });
  check("tab closed / network lost (no beat for >90s) → offline", get(po.data, t.id)?.online === false, po.data);

  const sb = (await st.c.rpc("presence_beat", { _tab: randomUUID() })).error; const gb = (await g.c.rpc("presence_beat", { _tab: randomUUID() })).error;
  po = await owner.c.rpc("presence_org", { _org: org });
  check("student and guardian sessions are tracked too", !sb && !gb && get(po.data, st.id)?.online && get(po.data, g.id)?.online, [sb, gb, po.data]);

  check("teacher cannot read the org's status list", !!(await t.c.rpc("presence_org", { _org: org })).error);
  check("student cannot read the org's status list (no staff directory)", !!(await st.c.rpc("presence_org", { _org: org })).error);
  check("guardian cannot read the org's status list", !!(await g.c.rpc("presence_org", { _org: org })).error);
  check("another org's owner cannot read this org", !!(await other.c.rpc("presence_org", { _org: org })).error);
  check("owner list never includes another org's users", !get((await owner.c.rpc("presence_org", { _org: org })).data, other.id));
  const sc = await st.c.rpc("presence_conv", { _conv: conv });
  check("student gets nothing for a chat he is not in", !((sc.data ?? []) as any[]).length, sc.data);
  const gm = await g.c.rpc("presence_my_convs", { _school: A });
  check("guardian's chat list has no foreign chats", !((gm.data ?? []) as any[]).some((r) => r.conversation_id === conv), gm.data);

  const ins = await t.c.from("presence_sessions" as never).insert({ user_id: owner.id, tab_key: randomUUID() } as never);
  const up = await t.c.from("user_last_seen" as never).upsert({ user_id: t.id, last_seen: "2030-01-01T00:00:00Z" } as never);
  const rd = await st.c.from("user_last_seen" as never).select("*");
  check("teacher cannot write status rows directly (own or others')", !!ins.error && !!up.error, [ins.error, up.error]);
  check("no direct read of last-seen table", !!rd.error || !((rd.data ?? []) as any[]).length, rd.data);
  const ls = (await admin.from("user_last_seen").select("last_seen").eq("user_id", t.id).single()).data?.last_seen;
  check("last seen comes from the server clock (not the forged 2030 value)", !!ls && new Date(ls).getFullYear() < 2030, ls);
  check("bad tab key refused", !!(await t.c.rpc("presence_beat", { _tab: "x" })).error);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  const ids = tr["users"] as unknown as string[] | undefined;
  if (Array.isArray(ids) && ids.length) { await admin.from("presence_sessions").delete().in("user_id", ids); await admin.from("user_last_seen").delete().in("user_id", ids); }
  for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.error("purge", e));
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
}
