// Purchase needs: principal need → linked officer → invoices with line links (partial, remaining, no over-quantity), separation of duties.
// Run: NODE_PATH=node_modules bun scripts/pc-need-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "pc-need-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `pcn-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const k = () => crypto.randomUUID();
try {
  const owner = await user("owner"), owner2 = await user("owner2"), pri = await user("principal"), tch = await user("teacher"), off = await user("officer"), off2 = await user("officer2"), apr = await user("approver");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة احتياج", _school_name: "فرع أ" }); orgs.push(org);
  const { data: org2 } = await owner2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "فرع س" }); orgs.push(org2);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const X = (await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id; tr.addSchool(X);
  await admin.from("memberships").insert([{ user_id: pri.id, org_id: org, school_id: A, role: "principal" }, ...[tch, off, off2, apr].map((u) => ({ user_id: u.id, org_id: org, school_id: A, role: "teacher" }))]);
  const roles = (await owner.c.rpc("perm_roles_list", { _org: org })).data as any[];
  const R = (n: string) => roles.find((r) => r.name === n).id;
  const asg = (u: string, r: string) => owner.c.rpc("perm_assign", { _org: org, _user: u, _role: r, _assign: true, _school_ids: [A], _limit: null, _reason: "اختبار" });
  await asg(apr.id, R("معتمد مالي"));
  const get = async (cl: any, id: string) => (await cl.rpc("pc_need_get", { _id: id })) as any;
  const act = async (cl: any, id: string, action: string, reason: string | null = null, u: string | null = null) => cl.rpc("pc_need_action", { _id: id, _action: action, _rev: (await get(owner.c, id)).data.rev, _reason: reason, _user: u });
  const lines = [{ description: "أقلام", qty: 10, unit_price: 2 }, { description: "دفاتر", qty: 5, unit_price: 10 }];

  const tNo = await tch.c.rpc("pc_need_save", { _org: org, _id: null, _d: { school_id: A, purpose: "احتياج قرطاسية", lines }, _rev: 0, _key: k() });
  const n1 = await pri.c.rpc("pc_need_save", { _org: org, _id: null, _d: { school_id: A, purpose: "احتياج قرطاسية", lines }, _rev: 0, _key: k() });
  check("1 only the principal creates a need for his school", !!tNo.error && !n1.error, [tNo.error, n1.error]);
  const N = n1.data as string;
  let g = (await get(pri.c, N)).data;
  check("1b estimate = sum(qty×price) = 70", Number(g.amount) === 70, g.amount);
  const offSeesDraft = await get(off.c, N);
  await act(pri.c, N, "approve");
  g = (await get(owner.c, N)).data;
  const ownNote = await admin.from("notifications").select("id").eq("user_id", owner.id).like("dedupe_key", `pc-need-wait:${N}%`);
  check("2 no authorized officer → awaiting assignment + owner notified", g.status === "awaiting_assignment" && g.officers_count === 0 && (ownNote.data?.length ?? 0) === 1 && !!offSeesDraft.error, [g.status, ownNote.data]);
  const priAssign = await act(owner.c, N, "assign", null, pri.id);
  const tchAssign = await act(owner.c, N, "assign", null, tch.id);
  check("3 cannot assign the need approver or someone without purchase permission", !!priAssign.error && !!tchAssign.error, [priAssign.error, tchAssign.error]);
  await asg(off.id, R("مسؤول مشتريات")); await asg(off2.id, R("مسؤول مشتريات"));
  const claimOther = await act(off.c, N, "assign", null, off2.id);
  const claim = await act(off.c, N, "assign", null, off.id);
  g = (await get(pri.c, N)).data;
  check("4 officer can only claim for himself; claim → in progress", !!claimOther.error && !claim.error && g.status === "in_progress" && g.assigned_to === off.id, [claimOther.error, claim.error, g.status]);
  const generic = await pri.c.rpc("pc_request_action", { _id: N, _action: "cancel", _rev: g.rev, _reason: "تجاوز" });
  check("5 generic request RPC refuses needs", !!generic.error, generic.error);
  const L1 = g.lines[0].id, L2 = g.lines[1].id;
  const exp = (cl: any, ls: any[]) => cl.rpc("pc_expense_save", { _org: org, _id: null, _d: { own_funds: true, school_id: A, purchase_date: today, description: "شراء قرطاسية", supplier: "مورد " + Math.random().toString(36).slice(2, 6), purchase_request_id: N, lines: ls }, _rev: 0, _key: k() });
  const by2 = await exp(off2.c, [{ description: "أقلام", amount: 8, need_line_id: L1, qty: 4 }]);
  const over = await exp(off.c, [{ description: "أقلام", amount: 30, need_line_id: L1, qty: 15 }]);
  const dup = await exp(off.c, [{ description: "أقلام", amount: 4, need_line_id: L1, qty: 2 }, { description: "أقلام", amount: 4, need_line_id: L1, qty: 2 }]);
  check("6 only the assigned officer links invoices; over-quantity and duplicate line refused", !!by2.error && !!over.error && !!dup.error, [by2.error, over.error, dup.error]);
  const e1 = await exp(off.c, [{ description: "أقلام", amount: 12, need_line_id: L1, qty: 6 }, { description: "دفاتر", amount: 50, need_line_id: L2, qty: 5 }]);
  if (e1.error) throw e1.error;
  const file = async (cl: any, id: string) => { const r = await cl.rpc("create_pc_file", { _entity: "expense", _id: id, _name: "p.pdf", _mime: "application/pdf", _size: 100 }); if (r.error) throw r.error; };
  const eget = async (cl: any, id: string) => (await cl.rpc("pc_expense_get", { _id: id })).data as any;
  const eact = async (cl: any, id: string, a: string) => cl.rpc("pc_expense_action", { _id: id, _action: a, _rev: (await eget(owner.c, id)).rev, _reason: null });
  await file(off.c, e1.data); const s1 = await eact(off.c, e1.data, "submit");
  const selfA = await eact(off.c, e1.data, "approve");
  const a1 = await eact(apr.c, e1.data, "approve");
  g = (await get(pri.c, N)).data;
  check("7 officer cannot approve own invoice; partial delivery keeps need in progress with remaining 4", !s1.error && !!selfA.error && !a1.error && g.status === "in_progress" && Number(g.lines[0].remaining) === 4 && Number(g.lines[1].remaining) === 0, [s1.error, selfA.error, a1.error, g.status, g.lines]);
  const closeNoReason = await act(off.c, N, "close", null);
  const cancelLate = await act(pri.c, N, "cancel", "تراجع");
  check("8 partial close needs a reason; cancel blocked once invoices exist", !!closeNoReason.error && !!cancelLate.error, [closeNoReason.error, cancelLate.error]);
  const e2 = await exp(off.c, [{ description: "أقلام", amount: 8, need_line_id: L1, qty: 4 }]); if (e2.error) throw e2.error;
  await file(off.c, e2.data); await eact(off.c, e2.data, "submit"); const a2 = await eact(apr.c, e2.data, "approve");
  g = (await get(pri.c, N)).data;
  check("9 full delivery approved → need done automatically", !a2.error && g.status === "done", [a2.error, g.status]);
  const outsider = await get(owner2.c, N);
  const list2 = (await owner2.c.rpc("pc_need_list", { _org: org2, _status: null, _limit: 50, _offset: 0 })).data as any;
  check("10 other organization cannot read the need", !!outsider.error && !list2.rows.some((r: any) => r.id === N), outsider.error);
  // auto-assign with exactly one officer
  await owner.c.rpc("perm_assign", { _org: org, _user: off2.id, _role: R("مسؤول مشتريات"), _assign: false, _school_ids: null, _limit: null, _reason: "اختبار" });
  const n2 = await pri.c.rpc("pc_need_save", { _org: org, _id: null, _d: { school_id: A, purpose: "احتياج آخر", lines: [{ description: "حبر", qty: 1 }] }, _rev: 0, _key: k() });
  await act(pri.c, n2.data, "approve"); g = (await get(off.c, n2.data)).data;
  check("11 one authorized officer → assigned automatically", g.status === "in_progress" && g.assigned_to === off.id, [g.status, g.assigned_to]);
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  await tr.deleteNotifications().catch((e) => console.log("notif cleanup", e.message));
  for (const o of orgs) { await admin.from("perm_log").delete().eq("org_id", o); await admin.from("perm_assignments").delete().eq("org_id", o); await admin.from("org_section_log").delete().eq("org_id", o); await admin.from("org_sections").delete().eq("org_id", o); await tr.purgeOrg(o).catch((e) => console.log(e.message)); }
  for (const u of tr.users) { await admin.auth.admin.deleteUser(u); }
  process.exit(bad ? 1 : 0);
}
