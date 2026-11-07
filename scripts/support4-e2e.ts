// Support closure checks: resolve clock pause while waiting on the requester, re-alerts after priority change / transfer / reopen,
// cross-branch info request privacy, private notes absent from search/notifications/exports, platform admin scope, direct-table denial.
// Run: NODE_PATH=node_modules bun scripts/support4-e2e.ts   (--cron waits for the real scheduled job instead of calling the tick)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "support4-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sup4-${tag}-${run}@rikaz.test`;
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
const sla = { urgent: { response: 1, resolve: 2 }, high: { response: 4, resolve: 24 }, normal: { response: 8, resolve: 40 }, low: { response: 24, resolve: 80 } };
const notifs = async (uid: string, T: string) => ((await admin.from("notifications").select("title, body, dedupe_key").eq("user_id", uid).like("link", `%${T}%`)).data ?? []) as any[];
const late = (n: any[]) => n.filter((x) => x.title.includes("تأخر") || x.title.includes("تجاوزت"));
const past = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const CRON = process.argv.includes("--cron");
const tick = async (T: string[]) => {
  if (!CRON) return (await admin.rpc("support_sla_tick", { _only: T })).data;
  // wait for the real pg_cron job (rikaz-homework-tick, every 15 min) to stamp the ticket
  const t0 = Date.now();
  while (Date.now() - t0 < 17 * 60e3) {
    const r = (await admin.from("support_tickets").select("response_alerted_at, resolve_alerted_at").in("id", T)).data as any[];
    if (r.every((x) => x.response_alerted_at || x.resolve_alerted_at)) return r.length;
    await new Promise((s) => setTimeout(s, 20e3));
  }
  return -1;
};
try {
  const owner = await user("owner"), pr1 = await user("pr1"), pr2 = await user("pr2"), tch = await user("tch"), tchB = await user("tchB"), pa = await user("pa"), owner2 = await user("owner2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة دعم 4", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى 4", _school_name: "فرع س" })).data; orgs.push(org2);
  tr.addSchool((await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, r, s] of [[pr1, "principal", A], [pr2, "principal", B], [tch, "teacher", A], [tchB, "teacher", B]] as any[])
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  await admin.from("platform_admins").insert({ user_id: pa.id }); padmin = pa.id;
  await owner.c.rpc("support_save_settings", { _org: org, _note: "", _reopen: 7, _days: [0, 1, 2, 3, 4, 5, 6], _start: "00:00", _end: "23:59", _sla: sla, _escalate: null });
  const mk = async (title: string, prio = "urgent") => (await tch.c.rpc("support_create", { _scope: "school", _school: A, _title: title, _body: "وصف عام", _priority: prio, _category: null, _student: null, _client_key: null })).data as string;

  // 1 pause/resume
  const T1 = await mk("انتظار");
  await pr1.c.rpc("support_reply", { _ticket: T1, _body: "نحتاج صورة الشاشة", _client_key: null });
  await act(pr1, T1, "waiting_requester", null, "نحتاج صورة الخطأ");
  const due0 = (await get(pr1, T1)).data.ticket.resolve_due;
  await admin.from("support_tickets").update({ paused_at: past(1.5) }).eq("id", T1);
  const odW = await list(pr1, "manage", { _status: "overdue" });
  await act(pr1, T1, "in_progress", null);
  const t1 = (await get(pr1, T1)).data.ticket;
  const shift = (new Date(t1.resolve_due).getTime() - new Date(due0).getTime()) / 3600e3;
  check("1 waiting on the requester is never overdue; resuming pushes the resolution target by the waiting time (1.5h)", !ids(odW).includes(T1) && Math.abs(shift - 1.5) < 0.05, [shift]);

  // 2 one alert per breach; priority change re-arms once
  const T2 = await mk("أولوية");
  await pr1.c.rpc("support_reply", { _ticket: T2, _body: "تم الاستلام", _client_key: null });
  await admin.from("support_tickets").update({ resolve_due: past(0.5) }).eq("id", T2);
  const a1 = await tick([T2]); const a1b = CRON ? 0 : (await admin.rpc("support_sla_tick", { _only: [T2] })).data;
  const nA = late(await notifs(pr1.id, T2)).length;
  await act(pr1, T2, "priority", "high");
  const t2 = (await get(pr1, T2)).data.ticket;
  await admin.from("support_tickets").update({ resolve_due: past(0.1) }).eq("id", T2);
  await tick([T2]); await admin.rpc("support_sla_tick", { _only: [T2] });
  const nB = late(await notifs(pr1.id, T2)).length;
  check(`2 ${CRON ? "the real scheduled job" : "the tick"} alerts once; a repeat run sends nothing; changing priority re-arms exactly one more alert`, a1 >= 1 && a1b === 0 && nA === 1 && new Date(t2.resolve_due) > new Date() && nB === 2, [a1, a1b, nA, nB]);
  const nTch = late(await notifs(tch.id, T2)).length;
  check("3 the requester never receives delay alerts", nTch === 0, nTch);

  // 4 transfer: alerts go to the new branch only
  const T3 = await mk("تحويل");
  await act(owner, T3, "transfer", B, "اختصاص فرع ب");
  await admin.from("support_tickets").update({ response_due: past(0.2) }).eq("id", T3);
  await admin.rpc("support_sla_tick", { _only: [T3] });
  check("4 after a branch transfer the delay alert goes to the new branch principal, not the old one", late(await notifs(pr2.id, T3)).length === 1 && late(await notifs(pr1.id, T3)).length === 0, [await notifs(pr2.id, T3)]);

  // 5 reopen re-arms the resolution alert
  await pr1.c.rpc("support_reply", { _ticket: T2, _body: "تم الحل", _client_key: null });
  await act(pr1, T2, "resolve", null, "تم الإصلاح");
  await act(tch, T2, "reopen", null, "عادت");
  const t5 = (await get(pr1, T2)).data.ticket;
  await admin.from("support_tickets").update({ resolve_due: past(0.1) }).eq("id", T2);
  await tick([T2]);
  check("5 reopening gives a fresh target and one new alert when it is missed", new Date(t5.resolve_due) > new Date() && late(await notifs(pr1.id, T2)).length === 3, [t5.resolve_due]);

  // 6 cross-branch info request keeps privacy
  const T6 = await mk("إفادة بين الفروع", "normal");
  const iq = await pr1.c.rpc("support_request_info", { _ticket: T6, _to: tchB.id, _question: "هل تواجه المشكلة نفسها في فرع ب؟", _client_key: null });
  const inbox = ((await tchB.c.rpc("support_info_inbox")).data ?? []) as any[];
  const bGet = await get(tchB, T6), prB = await get(pr2, T6), pr1OnB = await list(pr1, "manage", { _school: B });
  check("6 a branch principal can ask a teacher in another branch; the teacher sees only the question; the other branch principal gains no access; the asker gains no access to the other branch",
    !iq.error && inbox.length === 1 && !JSON.stringify(inbox).includes("وصف عام") && !!bGet.error && !!prB.error && ids(pr1OnB).length === 0, [iq.error, bGet.error?.message, prB.error?.message]);

  // 7 private notes stay out of search, notifications, lists and reports
  await act(pr1, T6, "assign", tchB.id);
  await pr1.c.rpc("support_add_note", { _ticket: T6, _kind: "private", _recipient: tchB.id, _body: "سرّيxyz لا تنشر", _client_key: null });
  const [s1, s2, s3, st] = await Promise.all([list(pr1, "manage", { _q: "سرّيxyz" }), list(tchB, "assigned", { _q: "سرّيxyz" }), list(owner, "manage", {}), owner.c.rpc("support_stats", { _school: null, _from: null, _to: null })]);
  const allN = ((await admin.from("notifications").select("title, body").like("link", `%${T6}%`)).data ?? []) as any[];
  check("7 private note text is not searchable, not in any notification, not in list rows or report data used for export",
    ids(s1).length === 0 && ids(s2).length === 0 && !JSON.stringify(s3.data).includes("سرّيxyz") && !JSON.stringify(st.data).includes("سرّيxyz") && !JSON.stringify(allN).includes("سرّيxyz"), [ids(s1), ids(s2)]);
  const reassign = await act(owner, T6, "assign", pr2.id);
  const newNotes = (((await get(pr2, T6)).data?.notes ?? []) as any[]).map((n) => n.body), oldA = await get(tchB, T6);
  check("8 a new person in charge does not inherit the private note; the old one loses access", !reassign.error && !newNotes.some((b) => b.includes("سرّيxyz")) && !!oldA.error, [reassign.error, newNotes]);

  // 9 platform admin + direct access
  const paInt = await get(pa, T6), paList = await list(pa, "manage", {});
  const direct = await Promise.all(["support_tickets", "support_notes", "support_messages", "support_info_requests", "support_events"].map((t) => tch.c.from(t).select("id").limit(5)));
  const fake = await tch.c.rpc("support_get", { _ticket: "00000000-0000-0000-0000-000000000000" });
  const x2 = await owner2.c.rpc("support_get", { _ticket: T6 });
  check("9 platform admin can't open school tickets or list them; direct table reads return nothing; unknown/foreign ticket links are refused",
    !!paInt.error && !ids(paList).some((i: string) => [T1, T2, T3, T6].includes(i)) && direct.every((d) => !!d.error || (d.data ?? []).length === 0) && !!fake.error && !!x2.error,
    [paInt.error, direct.map((d) => d.error?.message ?? d.data?.length)]);
  // 10 internal helpers are not callable from the app
  const h = await Promise.all([tch.c.rpc("support_sla_tick", { _only: null }), tch.c.rpc("_support_add_work", { _start: new Date().toISOString(), _hours: 1, _days: [0], _s: "07:00", _e: "15:00" }),
    tch.c.rpc("_gb_roster", { _gb: "00000000-0000-0000-0000-000000000000" }), tch.c.rpc("_gb_total", { _gb: "00000000-0000-0000-0000-000000000000", _student: "00000000-0000-0000-0000-000000000000" })]);
  check("10 the delay check and internal helpers (incl. grade roster/total) are refused for signed-in users", h.every((r) => !!r.error), h.map((r) => r.error?.code));
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
