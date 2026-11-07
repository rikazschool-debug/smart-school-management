// Support working hours: holidays skipped, branch/department hour exceptions, pause needs a reason (shown, cleared on resume),
// settings RPCs owner-only and org-isolated. Run: NODE_PATH=node_modules bun scripts/support9-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "support9-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `sup9-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "مستخدم " + tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const get = (u: any, T: string) => u.c.rpc("support_get", { _ticket: T });
const act = async (u: any, T: string, a: string, value: string | null, reason: string | null = null) =>
  u.c.rpc("support_action", { _ticket: T, _action: a, _rev: (await get(u, T)).data.ticket.rev, _reason: reason, _value: value });
const sla = { urgent: { response: 2, resolve: 4 }, high: { response: 4, resolve: 24 }, normal: { response: 8, resolve: 40 }, low: { response: 24, resolve: 80 } };
const riyadh = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
// Riyadh local "YYYY-MM-DD HH:MM" → ISO
const at = (local: string) => new Date(local.replace(" ", "T") + ":00+03:00").toISOString();
try {
  const owner = await user("owner"), pr = await user("pr"), tch = await user("tch"), owner2 = await user("owner2");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة دعم 9", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى 9", _school_name: "فرع س" })).data; orgs.push(org2);
  const X = (await owner2.c.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  const dept = (await admin.from("departments").insert({ school_id: A, name: "تقنية المعلومات" }).select().single()).data!.id;
  for (const [u, r, s] of [[pr, "principal", A], [tch, "teacher", A]] as any[]) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: r });
  // general hours Sun–Thu 07:00–15:00
  const s0 = await owner.c.rpc("support_save_settings", { _org: org, _note: "نرد خلال يوم", _reopen: 7, _days: [0, 1, 2, 3, 4], _start: "07:00", _end: "15:00", _sla: sla, _escalate: null });
  check("0 general settings saved", !s0.error, s0.error);

  // 1-3 rights and validation
  const hPr = await pr.c.rpc("support_hours_save", { _org: org, _school: A, _dept: null, _days: [0, 1, 2, 3, 4], _start: "08:00", _end: "12:00" });
  const hX = await owner.c.rpc("support_hours_save", { _org: org, _school: X, _dept: null, _days: [0], _start: "08:00", _end: "12:00" });
  const hBad = await owner.c.rpc("support_hours_save", { _org: org, _school: A, _dept: null, _days: [0], _start: "12:00", _end: "08:00" });
  check("1 only the owner edits hours; other-org branch and end-before-start rejected", !!hPr.error && !!hX.error && !!hBad.error, [hPr.error?.message, hX.error?.message, hBad.error?.message]);
  const lO2 = await owner2.c.rpc("support_hours_list", { _org: org });
  const hol2 = await owner2.c.rpc("support_holiday_save", { _org: org, _school: null, _from: "2026-12-01", _to: "2026-12-02", _name: "تجربة" });
  check("2 another org's owner cannot read or add holidays here", !!lO2.error && !!hol2.error);
  const holBad = await owner.c.rpc("support_holiday_save", { _org: org, _school: null, _from: "2026-12-05", _to: "2026-12-01", _name: "خطأ" });
  check("3 holiday end before start rejected", !!holBad.error);

  const add = (start: string, hours: number, days: number[], s: string, e: string, school: string) =>
    admin.rpc("_support_add_work_h", { _start: at(start), _hours: hours, _days: days, _s: s, _e: e, _org: org, _school: school });
  // 4 baseline: Sun 2026-11-29 14:00 + 2h → Mon 2026-11-30 08:00
  const b0 = await add("2026-11-29 14:00", 2, [0, 1, 2, 3, 4], "07:00", "15:00", A);
  check("4 baseline (no holiday): Sun 14:00 + 2h → Mon 08:00", riyadh(b0.data) === "2026-11-30 08:00", [b0.data, b0.error]);
  // 5 org-wide holiday on Mon–Tue → Wed 08:00
  const hol = await owner.c.rpc("support_holiday_save", { _org: org, _school: null, _from: "2026-11-30", _to: "2026-12-01", _name: "إجازة اختبار" });
  const b1 = await add("2026-11-29 14:00", 2, [0, 1, 2, 3, 4], "07:00", "15:00", A);
  check("5 org-wide holiday Mon–Tue skipped: → Wed 08:00", !hol.error && riyadh(b1.data) === "2026-12-02 08:00", [hol.error, b1.data]);
  // 6 branch holiday applies only to that branch
  const holB = await owner.c.rpc("support_holiday_save", { _org: org, _school: B, _from: "2026-12-02", _to: "2026-12-02", _name: "إجازة فرع ب" });
  const bA = await add("2026-11-29 14:00", 2, [0, 1, 2, 3, 4], "07:00", "15:00", A), bB = await add("2026-11-29 14:00", 2, [0, 1, 2, 3, 4], "07:00", "15:00", B);
  check("6 branch holiday affects only its branch (A Wed 08:00, B Thu 08:00)", !holB.error && riyadh(bA.data) === "2026-12-02 08:00" && riyadh(bB.data) === "2026-12-03 08:00", [bA.data, bB.data]);

  // 7-9 which hours a ticket uses
  const hA = await owner.c.rpc("support_hours_save", { _org: org, _school: A, _dept: null, _days: [0, 1, 2, 3, 4, 5, 6], _start: "00:00", _end: "23:59" });
  const hD = await owner.c.rpc("support_hours_save", { _org: org, _school: A, _dept: dept, _days: [0, 1, 2, 3, 4], _start: "07:00", _end: "15:00" });
  check("7 branch and department hours saved", !hA.error && !hD.error, [hA.error, hD.error]);
  const hours = async (school: string, d: string | null) => (await admin.rpc("_support_hours_for", { _org: org, _school: school, _dept: d, _scope: "school" })).data?.[0];
  const [pA, pD, pB] = [await hours(A, null), await hours(A, dept), await hours(B, null)];
  check("8 department row wins, then branch row, else general hours",
    pD?.s === "07:00:00" && pD?.days?.length === 5 && pA?.s === "00:00:00" && pA?.days?.length === 7 && pB?.s === "07:00:00" && pB?.days?.length === 5, [pA, pD, pB]);
  const T = (await tch.c.rpc("support_create", { _scope: "school", _school: A, _title: "طابعة", _body: "الطابعة لا تعمل", _priority: "urgent", _category: null, _student: null, _client_key: null })).data as string;
  const t = (await get(pr, T)).data.ticket;
  const h = (new Date(t.response_due).getTime() - new Date(t.created_at).getTime()) / 3600e3;
  check("9 branch with all-day hours: urgent response due ≈2 clock hours (unless today is a test holiday)", Math.abs(h - 2) < 0.05, [t.created_at, t.response_due]);
  const list = await owner.c.rpc("support_hours_list", { _org: org });
  check("10 settings list shows branch/department rows and holidays", list.data?.hours?.length === 2 && list.data?.holidays?.length === 2 && list.data.hours.some((r: any) => r.department === "تقنية المعلومات"), list.data);

  // 11-14 pause reason
  await act(pr, T, "claim", null);
  const noR = await act(pr, T, "waiting_requester", null, null);
  check("11 pausing without a reason is refused", !!noR.error && /سبب/.test(noR.error.message), noR.error);
  const yes = await act(pr, T, "waiting_requester", null, "نحتاج رقم الطابعة");
  const tp = (await get(tch, T)).data;
  check("12 pause reason stored and visible to the requester; clock paused", !yes.error && tp.ticket.pause_reason === "نحتاج رقم الطابعة" && !!tp.ticket.paused_at, [yes.error, tp.ticket.pause_reason]);
  check("13 pause reason logged in the timeline", (tp.events as any[]).some((e) => e.action === "waiting_requester" && JSON.stringify(e).includes("نحتاج رقم الطابعة")), tp.events);
  await act(pr, T, "in_progress", null);
  const tr2 = (await get(pr, T)).data.ticket;
  check("14 resuming clears the pause and its reason", tr2.pause_reason == null && tr2.paused_at == null, tr2);

  // 15 delete exception → back to general
  const hid = list.data.hours.find((r: any) => !r.department_id).id;
  const del = await owner.c.rpc("support_hours_delete", { _id: hid });
  const after = await hours(A, null);
  check("15 deleting a branch row returns the branch to general hours", !del.error && after?.s === "07:00:00", [del.error, after]);
  const delPr = await pr.c.rpc("support_holiday_delete", { _id: list.data.holidays[0].id });
  check("16 principal cannot delete holidays", !!delPr.error);
  const direct = await owner.c.from("support_hours").select("id");
  check("17 no direct table access", !!direct.error || (direct.data ?? []).length === 0);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try {
    for (const o of orgs) {
      const ts = ((await admin.from("support_tickets").select("id").eq("org_id", o)).data ?? []).map((x: any) => x.id);
      if (ts.length) {
        for (const tb of ["support_messages", "support_events", "support_notes", "support_info_requests"]) await admin.from(tb).delete().in("ticket_id", ts);
        await admin.from("support_tickets").delete().in("id", ts);
      }
      for (const tb of ["support_hours", "support_holidays", "support_categories", "support_settings"]) await admin.from(tb).delete().eq("org_id", o);
      await tr.deleteNotifications().catch(() => 0);
      await tr.purgeOrg(o);
    }
    for (const u of tr.users) await admin.auth.admin.deleteUser(u);
  } catch (e) { console.log("cleanup error", e); }
}
console.log(`support9-e2e: ${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
