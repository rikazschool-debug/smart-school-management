// Chat settings (ضبط المحادثات): permissions, saved replies, auto replies, voice limits, attachments gallery.
// Run: bun scripts/cs-e2e.ts   (`teardown` removes only csx- users/orgs)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(), pw = "Csx-pass-" + run;
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${extra ? " — " + extra : ""}`); };
async function teardown() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const uids = (list?.users ?? []).filter((u) => u.email?.startsWith("csx-")).map((u) => u.id);
  if (!uids.length) return;
  const { data: os } = await admin.from("organizations").select("id").in("created_by", uids);
  const tr = new TestRun(admin, "cs"); uids.forEach((u) => tr.addUser(u));
  for (const o of os ?? []) { const { data: ss } = await admin.from("schools").select("id").eq("org_id", o.id); (ss ?? []).forEach((x) => tr.addSchool(x.id)); }
  await tr.deleteNotifications();
  for (const o of os ?? []) await tr.purgeOrg(o.id);
  for (const u of uids) await admin.auth.admin.deleteUser(u);
  console.log(`cleanup: ${uids.length} users, ${os?.length ?? 0} orgs`);
}
async function user(tag: string, name: string) {
  const email = `csx-${tag}-${run}@rikaz.test`;
  const { error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }); if (error) throw error;
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  return { c, email, id: s.data.user!.id };
}
async function main() {
  if (process.argv[2] === "teardown") return teardown();
  await teardown();
  const owner = await user("owner", "مالك"), pr = await user("pr", "مدير"), t1 = await user("t1", "معلم"), sa = await user("sa", "شؤون طلاب"), o2 = await user("o2", "مالك آخر");
  const { data: org, error } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة ضبط المحادثات", _school_name: "مدرسة الضبط" }); if (error) throw error;
  const { data: org2 } = await o2.c.rpc("create_organization", { _org_name: "مؤسسة أخرى", _school_name: "مدرسة أخرى" });
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  for (const [u, r] of [[pr, "principal"], [t1, "teacher"], [sa, "student_affairs"]] as any[]) {
    const a = await owner.c.rpc("invite_member", { _email: u.email, _school: S, _role: r }); if (a.error) throw a.error;
    const b = await u.c.rpc("accept_my_invitations"); if (b.error) throw b.error;
  }
  // 1) permissions
  ok("1 owner reads own org settings", !(await owner.c.rpc("cs_admin", { _org: org })).error);
  ok("2 other org owner cannot read/manage this org", !!(await o2.c.rpc("cs_admin", { _org: org })).error && !!(await o2.c.rpc("cs_reply_save", { _org: org, _id: null, _title: "x", _shortcut: "x", _body: "x", _roles: ["all"], _active: true })).error);
  ok("3 principal without explicit grant is refused", !!(await pr.c.rpc("cs_admin", { _org: org })).error);
  await admin.from("perm_overrides").insert({ org_id: org, user_id: sa.id, section: "chat_settings", action: "replies", effect: "grant", scope: "org", reason: "اختبار تفويض", created_by: owner.id });
  const saAdm = await sa.c.rpc("cs_admin", { _org: org });
  ok("4 delegated person (replies grant) can view + manage replies only", !saAdm.error && saAdm.data?.caps?.replies === true && saAdm.data?.caps?.autoreply === false
    && !!(await sa.c.rpc("cs_settings_save", { _org: org, _voice: false, _max_sec: 30, _max_mb: 1, _attach: true })).error);
  ok("5 owner of org2 manages only org2", !(await o2.c.rpc("cs_admin", { _org: org2 })).error);

  // 2) saved replies
  const r1 = await owner.c.rpc("cs_reply_save", { _org: org, _id: null, _title: "ترحيب", _shortcut: "/Hello", _body: "<b>مرحبًا</b> بكم", _roles: ["all"], _active: true });
  ok("6 owner creates reply (shortcut normalized)", !r1.error);
  ok("7 duplicate shortcut (case-insensitive) refused", !!(await owner.c.rpc("cs_reply_save", { _org: org, _id: null, _title: "مكرر", _shortcut: "HELLO", _body: "x", _roles: ["all"], _active: true })).error);
  ok("8 shortcut with spaces refused", !!(await owner.c.rpc("cs_reply_save", { _org: org, _id: null, _title: "س", _shortcut: "a b", _body: "x", _roles: ["all"], _active: true })).error);
  const r2 = await sa.c.rpc("cs_reply_save", { _org: org, _id: null, _title: "للمديرين", _shortcut: "pr1", _body: "نص للمدير", _roles: ["principal"], _active: true });
  ok("9 delegated person creates role-limited reply", !r2.error);
  const dm = await t1.c.rpc("start_direct_conversation", { _school: S, _other: pr.id }); if (dm.error) throw dm.error;
  const conv = (typeof dm.data === "string" ? dm.data : dm.data?.[0]?.id ?? dm.data?.id) as string;
  const tR = (await t1.c.rpc("cs_my_replies", { _conv: conv })).data ?? [], pR = (await pr.c.rpc("cs_my_replies", { _conv: conv })).data ?? [];
  ok("10 teacher sees 'all' reply but not principal-only reply", tR.some((x: any) => x.shortcut === "hello") && !tR.some((x: any) => x.shortcut === "pr1"));
  ok("11 principal sees both", pR.some((x: any) => x.shortcut === "pr1") && pR.some((x: any) => x.shortcut === "hello"));
  ok("12 non-member gets no replies for a foreign conversation", ((await sa.c.rpc("cs_my_replies", { _conv: conv })).data ?? []).length === 0 || !!(await sa.c.rpc("cs_my_replies", { _conv: conv })).error);
  await owner.c.rpc("cs_reply_save", { _org: org, _id: r1.data, _title: "ترحيب", _shortcut: "hello", _body: "<b>مرحبًا</b> بكم", _roles: ["all"], _active: false });
  ok("13 disabled reply disappears from composer list", !((await t1.c.rpc("cs_my_replies", { _conv: conv })).data ?? []).some((x: any) => x.shortcut === "hello"));
  ok("14 reply text stored as plain text (no HTML execution path)", ((await owner.c.rpc("cs_admin", { _org: org })).data?.replies ?? []).some((x: any) => x.body === "<b>مرحبًا</b> بكم"));

  // 3) auto replies
  const first = await t1.c.rpc("send_message", { _conv: conv, _body: "قبل التفعيل", _client_id: crypto.randomUUID(), _reply_to: null, _files: [] });
  const ruleW = await owner.c.rpc("cs_rule_save", { _org: org, _id: null, _kind: "welcome", _name: "استقبال", _body: "شكرًا لتواصلك", _schools: [], _roles: ["principal"], _priority: 10, _cooldown: 12, _hours: {}, _label: "رد آلي — إدارة المدرسة", _active: true });
  ok("15 rule saved", !ruleW.error && !first.error, ruleW.error?.message);
  const msgs = async (u: any) => ((await u.c.rpc("conv_messages", { _conv: conv, _before: null, _limit: 50 })).data ?? []) as any[];
  ok("16 no retroactive reply for messages before activation", !(await msgs(t1)).some((m) => m.kind === "auto"));
  // new private chat → welcome
  const dm2 = await sa.c.rpc("start_direct_conversation", { _school: S, _other: pr.id }); const conv2 = (typeof dm2.data === "string" ? dm2.data : dm2.data?.[0]?.id ?? dm2.data?.id) as string;
  const cid = crypto.randomUUID();
  await sa.c.rpc("send_message", { _conv: conv2, _body: "السلام عليكم", _client_id: cid, _reply_to: null, _files: [] });
  await sa.c.rpc("send_message", { _conv: conv2, _body: "السلام عليكم", _client_id: cid, _reply_to: null, _files: [] }); // retry same client id
  const m2 = ((await sa.c.rpc("conv_messages", { _conv: conv2, _before: null, _limit: 50 })).data ?? []) as any[];
  const autos = m2.filter((m) => m.kind === "auto");
  ok("17 welcome reply sent once on a new private chat (retry does not duplicate)", autos.length === 1, `autos=${autos.length}`);
  ok("18 auto reply shows rule label, no staff id, not 'mine' for the principal", autos[0]?.sender_name === "رد آلي — إدارة المدرسة" && autos[0]?.sender_id === null
    && ((await pr.c.rpc("conv_messages", { _conv: conv2, _before: null, _limit: 50 })).data ?? []).filter((m: any) => m.kind === "auto").every((m: any) => !m.mine));
  await sa.c.rpc("send_message", { _conv: conv2, _body: "رسالة ثانية", _client_id: crypto.randomUUID(), _reply_to: null, _files: [] });
  ok("19 no loop / no reply to the auto message, no second welcome", (((await sa.c.rpc("conv_messages", { _conv: conv2, _before: null, _limit: 50 })).data ?? []) as any[]).filter((m) => m.kind === "auto").length === 1);
  // off hours: rule with empty working days = always off hours, cooldown
  const ruleO = await owner.c.rpc("cs_rule_save", { _org: org, _id: null, _kind: "off_hours", _name: "خارج الدوام", _body: "نرد في وقت الدوام", _schools: [S], _roles: [], _priority: 20, _cooldown: 12, _hours: { days: [], start: "07:00", end: "14:00" }, _label: "", _active: true });
  ok("20 off-hours rule saved", !ruleO.error, ruleO.error?.message);
  await sa.c.rpc("send_message", { _conv: conv2, _body: "مساءً", _client_id: crypto.randomUUID(), _reply_to: null, _files: [] });
  await sa.c.rpc("send_message", { _conv: conv2, _body: "مساءً 2", _client_id: crypto.randomUUID(), _reply_to: null, _files: [] });
  const offs = (((await sa.c.rpc("conv_messages", { _conv: conv2, _before: null, _limit: 50 })).data ?? []) as any[]).filter((m) => m.body === "نرد في وقت الدوام");
  ok("21 off-hours reply sent once within the repeat window", offs.length === 1, `n=${offs.length}`);
  const pv1 = await owner.c.rpc("cs_rule_preview", { _org: org, _school: S, _role: "principal", _first: true, _at: null });
  const pv2 = await owner.c.rpc("cs_rule_preview", { _org: org, _school: S, _role: "teacher", _first: true, _at: null });
  ok("22 preview picks priority rule (welcome over off-hours) without sending", pv1.data?.match && pv1.data?.kind === "welcome" && pv2.data?.kind === "off_hours");
  ok("23 delegated replies-only person cannot manage rules", !!(await sa.c.rpc("cs_rule_save", { _org: org, _id: null, _kind: "welcome", _name: "x", _body: "x", _schools: [], _roles: [], _priority: 1, _cooldown: 1, _hours: {}, _label: "", _active: true })).error);
  await owner.c.rpc("cs_rule_save", { _org: org, _id: ruleO.data, _kind: "off_hours", _name: "خارج الدوام", _body: "نرد في وقت الدوام", _schools: [S], _roles: [], _priority: 20, _cooldown: 1, _hours: { days: [], start: "07:00", end: "14:00" }, _label: "", _active: false });
  await owner.c.rpc("cs_rule_save", { _org: org, _id: ruleW.data, _kind: "welcome", _name: "استقبال", _body: "شكرًا لتواصلك", _schools: [], _roles: ["principal"], _priority: 10, _cooldown: 12, _hours: {}, _label: "", _active: false });
  const dm3 = await t1.c.rpc("start_direct_conversation", { _school: S, _other: sa.id }); const conv3 = (typeof dm3.data === "string" ? dm3.data : dm3.data?.[0]?.id ?? dm3.data?.id) as string;
  await t1.c.rpc("send_message", { _conv: conv3, _body: "بعد التعطيل", _client_id: crypto.randomUUID(), _reply_to: null, _files: [] });
  ok("24 disabled rules send nothing", !(((await t1.c.rpc("conv_messages", { _conv: conv3, _before: null, _limit: 50 })).data ?? []) as any[]).some((m) => m.kind === "auto"));
  const adm = (await owner.c.rpc("cs_admin", { _org: org })).data;
  ok("25 runs log has no message content", (adm?.runs ?? []).length >= 2 && !JSON.stringify(adm.runs).includes("السلام") && (adm?.log ?? []).length >= 4);

  // 4) voice limits
  await owner.c.rpc("cs_settings_save", { _org: org, _voice: true, _max_sec: 30, _max_mb: 1, _attach: true });
  ok("26 voice over max duration refused", !!(await t1.c.rpc("create_voice_file", { _conv: conv, _mime: "audio/webm", _size: 1000, _duration: 31 })).error);
  ok("27 voice over max size refused", !!(await t1.c.rpc("create_voice_file", { _conv: conv, _mime: "audio/webm", _size: 2 * 1048576, _duration: 5 })).error);
  ok("28 non-audio type refused", !!(await t1.c.rpc("create_voice_file", { _conv: conv, _mime: "application/pdf", _size: 1000, _duration: 5 })).error);
  ok("29 non-member cannot create voice in foreign chat", !!(await sa.c.rpc("create_voice_file", { _conv: conv, _mime: "audio/webm", _size: 1000, _duration: 5 })).error);
  const vf = await t1.c.rpc("create_voice_file", { _conv: conv, _mime: "audio/webm;codecs=opus", _size: 2000, _duration: 3 }); const vrow = vf.data?.[0];
  const bytes = new Uint8Array(2000).fill(7);
  const up = await t1.c.storage.from("rikaz-files").upload(vrow.storage_path, new Blob([bytes], { type: "audio/webm" }), { contentType: "audio/webm" });
  const vid = crypto.randomUUID();
  const sv = await t1.c.rpc("send_message", { _conv: conv, _body: "", _client_id: vid, _reply_to: null, _files: [vrow.id] });
  const sv2 = await t1.c.rpc("send_message", { _conv: conv, _body: "", _client_id: vid, _reply_to: null, _files: [vrow.id] });
  ok("30 voice message sent once (retry returns same id)", !up.error && !sv.error && sv.data?.[0]?.id === sv2.data?.[0]?.id, sv.error?.message ?? up.error?.message);
  const prM = await msgs(pr);
  const vm = prM.find((m) => m.id === sv.data?.[0]?.id);
  ok("31 receiver sees voice kind + audio mime + duration", vm?.kind === "voice" && vm?.files?.[0]?.mime?.startsWith("audio/") && vm?.files?.[0]?.duration === 3);
  const sig = await pr.c.storage.from("rikaz-files").createSignedUrl(vrow.storage_path, 60);
  const sigX = await sa.c.storage.from("rikaz-files").createSignedUrl(vrow.storage_path, 60);
  ok("32 member opens voice via signed URL; non-member refused", !sig.error && !!sigX.error);
  // mismatched upload: declared audio, uploaded pdf
  const vf2 = await t1.c.rpc("create_voice_file", { _conv: conv, _mime: "audio/webm", _size: 500, _duration: 2 }); const v2 = vf2.data?.[0];
  await t1.c.storage.from("rikaz-files").upload(v2.storage_path, new Blob([new Uint8Array(500)], { type: "application/pdf" }), { contentType: "application/pdf" });
  ok("33 server refuses uploaded object whose type does not match", !!(await t1.c.rpc("send_message", { _conv: conv, _body: "", _client_id: crypto.randomUUID(), _reply_to: null, _files: [v2.id] })).error);

  // 5) gallery
  const gv = await pr.c.rpc("conv_files", { _conv: conv, _tab: "voice", _before: null, _limit: 30 });
  ok("34 gallery voice tab lists the voice file for a member", !gv.error && (gv.data ?? []).some((f: any) => f.id === vrow.id));
  ok("35 gallery empty for non-member", ((await sa.c.rpc("conv_files", { _conv: conv, _tab: "voice", _before: null, _limit: 30 })).data ?? []).length === 0);
  await t1.c.rpc("delete_message", { _id: sv.data?.[0]?.id });
  ok("36 deleted message's file leaves the gallery", !((await pr.c.rpc("conv_files", { _conv: conv, _tab: "voice", _before: null, _limit: 30 })).data ?? []).some((f: any) => f.id === vrow.id));
  ok("37 settings permission does not open private chat content", ((await owner.c.rpc("conv_messages", { _conv: conv, _before: null, _limit: 50 })).data ?? []).length === 0);

  await teardown();
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown(); process.exit(1); });
