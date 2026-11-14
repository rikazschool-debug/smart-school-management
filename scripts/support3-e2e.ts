// Support tickets phase 3: working-hour targets per priority, overdue filter + one-time alerts (designated person or managers),
// assignee filter, scoped KPIs. Two orgs, isolated data only. Run: NODE_PATH=node_modules bun scripts/support3-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "support3-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sup3-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = []; let padmin: string | null = null;
const list = (u: any, box: string, extra: any = {}) => u.c.rpc("support_list", { _box: box, _school: null, _q: null, _status: null, _priority: null, _category: null, _from: null, _to: null, _limit: 100, _offset: 0, _assignee: null, ...extra });
const ids = (r: any) => ((r.data ?? []) as any[]).map((x) => x.id);
const get = (u: any, T: string) => u.c.rpc("support_get", { _ticket: T });
const act = async (u: any, T: string, a: string, value: string | null, reason: string | null = null) =>
  u.c.rpc("support_action", { _ticket: T, _action: a, _rev: (await get(u, T)).data.ticket.rev, _reason: reason, _value: value });
const sla = (r: number, v: number) => ({ urgent: { response: r, resolve: v }, high: { response: 4, resolve: 24 }, normal: { response: 8, resolve: 40 }, low: { response: 24, resolve: 80 } });
const settings = (u: any, org: string | null, extra: any = {}) => u.c.rpc("support_save_settings", { _org: org, _note: "نرد خلال ساعة", _reopen: 7, _days: [0, 1, 2, 3, 4, 5, 6], _start: "00:00", _end: "23:59", _sla: sla(1, 2), _escalate: null, ...extra });
const hoursFrom = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3600e3;
const notifs = async (uid: string, T: string) => ((await admin.from("notifications").select("title, body").eq("user_id", uid).like("link", `%${T}%`)).data ?? []) as any[];
const past = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
try {
  // 1 working-hours arithmetic (Asia/Riyadh): Thu 14:00 + 2h with Sun–Thu 07–15 → Sun 08:00
  const w = await admin.rpc("_support_add_work", { _start: "2026-11-05T11:00:00Z", _hours: 2, _days: [0, 1, 2, 3, 4], _s: "07:00", _e: "15:00" });
  const w2 = await admin.rpc("_support_add_work", { _start: "2026-11-06T09:00:00Z", _hours: 3, _days: [0, 1, 2, 3, 4], _s: "07:00", _e: "15:00" });
  check("1 targets count working hours only: Thu 14:00 + 2h → Sun 08:00; Fri 12:00 + 3h → Sun 10:00", new Date(w.data).toISOString() === "2026-11-08T05:00:00.000Z" && new Date(w2.data).toISOString() === "2026-11-08T07:00:00.000Z", [w.data, w2.data, w.error]);

  const owner = await user("owner"), pr1 = await user("pr1"), pr2 = await user("pr2"), tch = await user("tch"), tchB = await user("tchB"), stu = await user("stu"), pa = await user("pa"), owner2 = await user("owner2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة دعم 3", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى 3", _school_name: "فرع س" })).data; orgs.push(org2);
  tr.addSchool((await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, r, s] of [[pr1, "principal", A], [pr2, "principal", B], [tch, "teacher", A], [tchB, "teacher", B], [stu, "student", A]] as any[])
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  await admin.from("platform_admins").insert({ user_id: pa.id }); padmin = pa.id;

  // 2 settings validation
  const sPr = await settings(pr1, org), sStu = await settings(owner, org, { _escalate: stu.id }), sX = await settings(owner, org, { _escalate: owner2.id }),
    sBadSla = await settings(owner, org, { _sla: sla(5, 2) }), sBadT = await settings(owner, org, { _start: "15:00", _end: "07:00" }), sOk = await settings(owner, org);
  check("2 targets/hours saved by the owner only; escalation person must be active staff of the org; response ≤ resolution; end after start",
    !!sPr.error && !!sStu.error && !!sX.error && !!sBadSla.error && !!sBadT.error && !sOk.error, [sPr.error?.message, sStu.error?.message, sX.error?.message, sBadSla.error?.message, sBadT.error?.message, sOk.error]);

  // 3 due times from priority
  const mk = async (u: any, school: string, prio = "urgent", title = "تذكرة") => (await u.c.rpc("support_create", { _scope: "school", _school: school, _title: title, _body: "وصف التذكرة", _priority: prio, _category: null, _student: null, _client_key: null })).data as string;
  const T = await mk(tch, A);
  let t = (await get(pr1, T)).data.ticket;
  check("3 urgent ticket gets response due ≈1h and resolution due ≈2h", Math.abs(hoursFrom(t.created_at, t.response_due) - 1) < 0.05 && Math.abs(hoursFrom(t.created_at, t.resolve_due) - 2) < 0.05, t);
  await act(pr1, T, "priority", "low");
  t = (await get(pr1, T)).data.ticket;
  const lowOk = Math.abs(hoursFrom(t.created_at, t.response_due) - 24) < 0.1;
  await act(pr1, T, "priority", "urgent");
  const tReq = (await get(tch, T)).data.ticket;
  check("4 changing priority recalculates the targets; alert stamps are never shown", lowOk && !("response_alerted_at" in tReq), t);

  // 5 overdue filter
  await admin.from("support_tickets").update({ response_due: past(2), resolve_due: past(1) }).eq("id", T);
  const TB = await mk(tchB, B, "normal", "فرع ب");
  const [od1, odMine, od2] = await Promise.all([list(pr1, "manage", { _status: "overdue" }), list(tch, "mine"), list(pr2, "manage", { _status: "overdue" })]);
  check("5 overdue filter lists the late ticket for its managers only; requester's own list never flags it",
    ids(od1).includes(T) && (od1.data as any[]).find((r) => r.id === T)?.overdue === true && (odMine.data as any[]).find((r) => r.id === T)?.overdue === false && !ids(od2).includes(T), [ids(od1), ids(od2)]);

  // 6 alerts once per breach, to managers when no designated person
  const k1 = await admin.rpc("support_sla_tick", { _only: [T] }), k2 = await admin.rpc("support_sla_tick", { _only: [T] }), k3 = await admin.rpc("support_sla_tick", { _only: [T] });
  const nP1 = await notifs(pr1.id, T), nO = await notifs(owner.id, T), nP2 = await notifs(pr2.id, T);
  check("6 tick sends the response alert, then the resolution alert, then nothing; managers of the branch notified, other branch not",
    k1.data === 1 && k2.data === 1 && k3.data === 0 && nP1.filter((n) => n.title.includes("تأخر") || n.title.includes("تجاوزت")).length === 2 && nO.length >= 2 && nP2.length === 0, [k1, k2, k3, nP1, nP2]);
  const evM = ((await get(pr1, T)).data.events as any[]).filter((e) => e.action === "sla_breach").length;
  const evR = ((await get(tch, T)).data.events as any[]).filter((e) => e.action === "sla_breach").length;
  check("7 breaches recorded in the timeline for handlers, hidden from the requester", evM === 2 && evR === 0, [evM, evR]);

  // 8 designated person
  await settings(owner, org, { _escalate: tchB.id });
  const T2 = await mk(tch, A, "urgent", "ثانية");
  await admin.from("support_tickets").update({ response_due: past(1) }).eq("id", T2);
  await admin.rpc("support_sla_tick", { _only: [T2] });
  const d1 = await notifs(tchB.id, T2), d2 = (await notifs(pr1.id, T2)).filter((n) => n.title.includes("تأخر"));
  check("8 with a designated person, only that person gets the overdue alert", d1.some((n) => n.title.includes("تأخر")) && d2.length === 0 && d1.every((n) => !n.body.includes("وصف")), [d1, d2]);

  // 9 no alert while waiting for the requester
  const T3 = await mk(tch, A, "urgent", "ثالثة");
  await act(pr1, T3, "waiting_requester", null, "نحتاج صورة الخطأ");
  await admin.from("support_tickets").update({ response_due: past(1), resolve_due: past(1) }).eq("id", T3);
  const k9 = await admin.rpc("support_sla_tick", { _only: [T3] });
  check("9 no overdue alert while waiting for the requester", k9.data === 0, k9);

  // 10 assignee filter
  await act(owner, T2, "assign", tchB.id); // cross-branch assignment needs the owner (support8 rule)
  const fa = await list(owner, "manage", { _assignee: tchB.id }), opts = await pr1.c.rpc("support_assignees", { _school: A });
  check("10 filter by person in charge", ids(fa).length === 1 && ids(fa)[0] === T2 && ((opts.data ?? []) as any[]).some((x) => x.id === tchB.id), [ids(fa), opts.data]);

  // 11 KPIs + rating, scoped
  await pr1.c.rpc("support_reply", { _ticket: T, _body: "نعمل عليها", _client_key: null });
  await act(pr1, T, "resolve", null, "تم الإصلاح");
  await act(tch, T, "confirm", "4");
  const [sP1, sO, sO2, sT, sPa, sP1B] = await Promise.all([
    pr1.c.rpc("support_stats", { _school: null, _from: null, _to: null }), owner.c.rpc("support_stats", { _school: null, _from: null, _to: null }),
    owner2.c.rpc("support_stats", { _school: null, _from: null, _to: null }), tch.c.rpc("support_stats", { _school: null, _from: null, _to: null }),
    pa.c.rpc("support_stats", { _school: null, _from: null, _to: null }), pr1.c.rpc("support_stats", { _school: B, _from: null, _to: null })]);
  const br = (s: any) => ((s.data?.by_branch ?? []) as any[]).map((b) => b.name).sort().join(",");
  check("11 principal's figures cover only own branch; owner sees both branches; other org / teacher / platform see none of it",
    sP1.data.created === 3 && br(sP1) === "فرع أ" && sO.data.created === 4 && br(sO) === "فرع أ,فرع ب" && sO2.data.created === 0 && sT.data.created === 0 && sPa.data.created === 0 && sP1B.data.created === 0,
    [sP1.data?.created, br(sP1), sO.data?.created, br(sO), sO2.data?.created, sT.data?.created, sPa.data?.created, sP1B.data?.created]);
  check("12 KPIs: resolved count, first-response and resolution times, on-time %, rating, load per assignee",
    sO.data.resolved === 1 && sO.data.avg_first_response_h != null && sO.data.avg_resolution_h != null && sO.data.resolve_on_time_pct === 0 && Number(sO.data.avg_rating) === 4 && sO.data.ratings === 1 &&
    (sO.data.by_assignee as any[]).some((a) => a.name.includes("tchB") && a.open === 1), sO.data);
  const rng = await owner.c.rpc("support_stats", { _school: null, _from: "2000-01-01", _to: "2000-01-02" });
  check("13 date range narrows the period figures but keeps the current open/overdue", rng.data.created === 0 && rng.data.open === sO.data.open, rng.data);

  // 14 reopen gives a fresh resolution window
  await act(tch, T, "reopen", null, "عادت المشكلة");
  t = (await get(pr1, T)).data.ticket;
  check("14 reopening sets a fresh resolution target in the future", new Date(t.resolve_due) > new Date(), t.resolve_due);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  if (padmin) await admin.from("platform_admins").delete().eq("user_id", padmin);
  try {
    for (const o of orgs) {
      const ts = ((await admin.from("support_tickets").select("id").eq("org_id", o)).data ?? []).map((x: any) => x.id);
      if (ts.length) {
        const ms = ((await admin.from("support_messages").select("id").in("ticket_id", ts)).data ?? []).map((x: any) => x.id);
        if (ms.length) await admin.from("support_message_revisions").delete().in("message_id", ms);
        for (const tb of ["support_messages", "support_events", "support_notes", "support_info_requests"]) await admin.from(tb).delete().in("ticket_id", ts);
        await admin.from("support_tickets").update({ linked_ticket: null }).in("id", ts);
        await admin.from("support_tickets").delete().in("id", ts);
      }
      await admin.from("support_categories").delete().eq("org_id", o);
      await admin.from("support_settings").delete().eq("org_id", o);
      await tr.purgeOrg(o);
    }
    for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  } catch (e) { console.log("cleanup error", e); }
}
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
