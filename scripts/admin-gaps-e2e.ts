// Closing earlier admin gaps: scheduled reminders (scoped run on isolated schools) and old notifications after a request transfer.
// Run: NODE_PATH=node_modules bun scripts/admin-gaps-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "admin-gaps-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `agp-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const notes = async (u: string, like: string) => (await admin.from("notifications").select("id, body, link", { count: "exact" }).eq("user_id", u).ilike("title", `%${like}%`)).data ?? [];
const riyadhToday = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(riyadhToday + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
const orgs: string[] = [];
try {
  const owner = await user("owner"), pr = await user("pr"), vp = await user("vp"), t1 = await user("t1"), t2 = await user("t2"), t3 = await user("t3");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة الفجوات", _school_name: "فرع" })).data; orgs.push(org);
  const S = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(S);
  for (const [u, r] of [[pr, "principal"], [vp, "vice_principal"], [t1, "teacher"], [t2, "teacher"], [t3, "teacher"]] as any[])
    await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: S, role: r });

  // ---- reminders ----
  const mk = async (title: string, who: string) => (await pr.c.rpc("adm_create_task", { _school: S, _d: { title, assignee: who, due_date: tomorrow }, _client: null })).data as string;
  const tOpen = await mk("تكليف مفتوح", t1.id); const tDone = await mk("تكليف منجز", t2.id);
  await admin.from("adm_tasks").update({ status: "done", done_at: new Date().toISOString() }).eq("id", tDone);
  const at = new Date(Date.parse(tomorrow + "T10:00:00+03:00")).toISOString();
  const mOk = (await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "لقاء الصباح", starts_at: at, mode: "in_person", location: "قاعة", members: [t1.id] }, _rev: null, _client: null })).data as any;
  const mCan = (await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "اجتماع ملغى", starts_at: at, mode: "in_person", location: "قاعة", members: [t2.id] }, _rev: null, _client: null })).data as any;
  const mRes = (await pr.c.rpc("adm_meeting_save", { _id: null, _school: S, _d: { title: "سري للغاية", privacy: "restricted", starts_at: at, mode: "virtual", members: [t3.id] }, _rev: null, _client: null })).data as any;
  for (const m of [mOk, mCan, mRes]) await pr.c.rpc("adm_meeting_send", { _id: m.id, _rev: 1 });
  await pr.c.rpc("adm_meeting_cancel", { _id: mCan.id, _reason: "تأجيل", _rev: 2 });
  const dow = new Date(Date.parse(riyadhToday + "T00:00:00Z")).getUTCDay();
  const wk = new Date(Date.parse(riyadhToday + "T00:00:00Z") - dow * 864e5).toISOString().slice(0, 10);
  const roI = await admin.from("adm_duty_rosters").insert({ school_id: S, week_start: wk, status: "published" }).select().single();
  if (roI.error) throw roI.error;
  const ro = roI.data!;
  const po = (await admin.from("adm_duty_posts").insert({ school_id: S, name: "البوابة", start_time: "06:45", end_time: "07:15" }).select().single()).data!;
  await admin.from("adm_duty_assignments").insert([{ school_id: S, roster_id: ro.id, post_id: po.id, date: tomorrow, start_time: "06:45", end_time: "07:15", user_id: t1.id, status: "assigned" },
    { school_id: S, roster_id: ro.id, post_id: po.id, date: tomorrow, start_time: "06:45", end_time: "07:15", user_id: t2.id, status: "cancelled" }]);
  const r1 = await admin.rpc("adm_daily_reminders", { _only: [S] });
  const r2 = await admin.rpc("adm_daily_reminders", { _only: [S] });
  const t1Task = await notes(t1.id, "تكليف مستحق غدًا"), t2Task = await notes(t2.id, "تكليف مستحق غدًا");
  const t1Meet = await notes(t1.id, "اجتماع غدًا"), t2Meet = await notes(t2.id, "اجتماع غدًا"), t3Meet = await notes(t3.id, "اجتماع غدًا");
  const t1Duty = await notes(t1.id, "مناوبة غدًا"), t2Duty = await notes(t2.id, "مناوبة غدًا");
  check("RM1 reminder run twice: due task, meeting and duty reminded once each", !r1.error && t1Task.length === 1 && t1Meet.length === 1 && t1Duty.length === 1, [r1.error, t1Task.length, t1Meet.length, t1Duty.length]);
  check("RM2 no reminder for a done task, cancelled meeting or cancelled duty", t2Task.length === 0 && t2Meet.length === 0 && t2Duty.length === 0);
  check("RM3 restricted meeting reminder shows only the time, never the title", t3Meet.length === 1 && !/سري/.test(t3Meet[0]!.body ?? "") && /^\d\d:\d\d$/.test(t3Meet[0]!.body ?? ""), t3Meet);
  const job = await admin.rpc("adm_daily_reminders" as never, { _only: ["00000000-0000-0000-0000-000000000000"] } as never);
  check("RM4 scoped run touches only the listed schools (live data untouched)", !job.error && (job.data as any).sent === 0, job.data);

  // ---- old notification after request transfer ----
  const f1 = (await pr.c.rpc("adm_save_form", { _id: null, _school: S, _d: { name: "طلب", purpose: "x", audience: ["teacher"], handler_user: vp.id, allow_files: true, fields: [{ label: "الموضوع", type: "text", required: true }] } })).data as string;
  await pr.c.rpc("adm_set_form_status", { _id: f1, _status: "active" });
  const rq = (await t1.c.rpc("adm_save_request", { _id: null, _form: f1, _answers: { f1: "موضوع" }, _rev: null })).data as any;
  const fr = (await t1.c.rpc("create_admin_file", { _entity: "request", _id: rq.id, _name: "a.pdf", _mime: "application/pdf", _size: 9 })).data as any;
  const fid = Array.isArray(fr) ? fr[0]?.id : typeof fr === "string" ? fr : fr?.id;
  const frow = (await admin.from("files").select("id, storage_path").eq("id", fid).single()).data!;
  await t1.c.storage.from("rikaz-files").upload(frow.storage_path, new Blob(["%PDF-1.4\n"], { type: "application/pdf" }), { contentType: "application/pdf" });
  const sub = (await t1.c.rpc("adm_submit_request", { _id: rq.id, _rev: rq.rev })).data as number;
  const oldNote = (await notes(vp.id, "")).find((n) => (n.link ?? "").includes(rq.id));
  const xf = await pr.c.rpc("adm_reassign_request", { _id: rq.id, _user: t2.id, _reason: "إعادة توزيع" });
  const vpRow = await vp.c.from("adm_requests").select("id").eq("id", rq.id);
  const vpFiles = await vp.c.from("files").select("id").eq("id", fid);
  const vpUrl = await vp.c.storage.from("rikaz-files").createSignedUrl(frow.storage_path, 60);
  check("OT1 previous handler's old notification link now opens nothing: request and its attachment refused", !!oldNote && !xf.error && !vpRow.data?.length && !vpFiles.data?.length && !!vpUrl.error, [xf.error, vpRow.data, vpFiles.data, !!vpUrl.data]);
  const t2Row = await t2.c.from("adm_requests").select("id, rev").eq("id", rq.id).single();
  const ret = await t2.c.rpc("adm_handle_request", { _id: rq.id, _action: "return", _note: "أكمل", _rev: t2Row.data?.rev });
  const r3 = (await t1.c.rpc("adm_save_request", { _id: rq.id, _form: null, _answers: { f1: "موضوع مكتمل" }, _rev: ret.data })).data as any;
  const before = (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", vp.id).ilike("link", `%${rq.id}%`)).count ?? 0;
  const before2 = (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", t2.id).ilike("link", `%${rq.id}%`)).count ?? 0;
  await t1.c.rpc("adm_submit_request", { _id: rq.id, _rev: r3?.rev });
  const after = (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", vp.id).ilike("link", `%${rq.id}%`)).count ?? 0;
  const after2 = (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", t2.id).ilike("link", `%${rq.id}%`)).count ?? 0;
  check("OT2 after transfer the new handler is notified of resubmission, the previous one is not", !ret.error && after === before && after2 === before2 + 1, [ret.error, before, after, before2, after2, sub]);
} catch (e) { bad++; console.log("FAIL exception", e); }
finally {
  try {
    const { data: fs } = await admin.from("files").select("storage_path").in("school_id", [...tr.schools]);
    if (fs?.length) await admin.storage.from("rikaz-files").remove(fs.map((f) => f.storage_path));
    await tr.deleteNotifications(); for (const o of orgs) if (o) await tr.purgeOrg(o); for (const u of tr.users) await admin.auth.admin.deleteUser(u); console.log("cleanup ok");
  } catch (e) { console.log("cleanup error", e); }
  console.log(`\n${ok} passed, ${bad} failed`);
}
