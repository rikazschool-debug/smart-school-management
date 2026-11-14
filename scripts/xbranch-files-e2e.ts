// Attachments in cross-branch (org-level) groups: upload, list, download, denial.
// Run: NODE_PATH=node_modules bun scripts/xbranch-files-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "xbranch-files-e2e");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)); };
async function user(tag: string) {
  const email = `xbf-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: tag } });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  tr.addUser(s.data.user!.id);
  return { c, email, id: s.data.user!.id };
}
const orgs: string[] = [];
const paths: string[] = [];
try {
  const owner = await user("owner"), tA = await user("tA"), tB = await user("tB"), tA2 = await user("tA2");
  const { data: org } = await owner.c.rpc("create_organization", { _org_name: "مؤسسة مرفقات", _school_name: "فرع أ" }); orgs.push(org);
  const A = (await owner.c.from("schools").select("id").eq("org_id", org).single()).data!.id;
  const B = (await owner.c.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id;
  [A, B].forEach((s) => tr.addSchool(s));
  const join = async (u: { c: any; email: string }, s: string, role: string) => { await owner.c.rpc("invite_member", { _email: u.email, _school: s, _role: role }); await u.c.rpc("accept_my_invitations"); };
  await join(tA, A, "teacher"); await join(tB, B, "teacher"); await join(tA2, A, "teacher");
  const g = await owner.c.rpc("create_group", { _org: org, _school: null, _title: "لجنة الفروع", _description: null, _group_type: "committee", _membership_mode: "manual",
    _department: null, _post_policy: "all", _allow_attachments: true, _history_policy: "from_join", _expires_at: null, _year: null, _members: [tA.id, tB.id], _moderators: [] });
  const G = g.data as string;
  const conv = (await admin.from("conversations").select("school_id, allow_attachments").eq("id", G).single()).data;
  check("X1 cross-branch group keeps attachments on", !g.error && conv?.school_id === null && conv?.allow_attachments === true, [g, conv]);

  const f = await tB.c.rpc("create_message_file", { _conv: G, _name: "خطة.pdf", _mime: "application/pdf", _size: 9 });
  const fr = f.data?.[0];
  check("X2 file row owned by uploader's branch (B)", !f.error && fr?.storage_path?.startsWith(B + "/"), f);
  const bad1 = await tB.c.rpc("create_message_file", { _conv: G, _name: "x.exe", _mime: "application/x-msdownload", _size: 9 });
  check("X3 disallowed type rejected by branch policy", !!bad1.error, bad1);
  const out = await tA2.c.rpc("create_message_file", { _conv: G, _name: "x.pdf", _mime: "application/pdf", _size: 9 });
  check("X4 non-member cannot create attachment", !!out.error, out);

  paths.push(fr.storage_path);
  const up = await tB.c.storage.from("rikaz-files").upload(fr.storage_path, new Blob(["%PDF-1.4\n"], { type: "application/pdf" }), { contentType: "application/pdf" });
  check("X5 uploader uploads to its path", !up.error, up);
  const preA = await tA.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  check("X6 other member cannot read before message is sent", !!preA.error || !preA.data?.signedUrl, preA);
  const sm = await tB.c.rpc("send_message", { _conv: G, _body: "مرفق", _client_id: crypto.randomUUID(), _files: [fr.id] });
  check("X7 message with attachment sent", !sm.error, sm);

  const listA = await tA.c.from("files").select("id, school_id").eq("id", fr.id);
  check("X8 member in branch A sees the file row (branch B)", listA.data?.length === 1 && listA.data[0].school_id === B, listA);
  const sA = await tA.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  const dl = sA.data?.signedUrl ? await fetch(sA.data.signedUrl) : null;
  check("X9 member in branch A downloads", !!dl && dl.ok && (await dl.text()).startsWith("%PDF"), sA);
  const sOut = await tA2.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  const rOut = await tA2.c.from("files").select("id").eq("id", fr.id);
  check("X10 same-branch non-member denied (row + link)", (!!sOut.error || !sOut.data?.signedUrl) && rOut.data?.length === 0, [sOut, rOut]);
  await owner.c.rpc("remove_group_member", { _conv: G, _user: tA.id });
  const sGone = await tA.c.storage.from("rikaz-files").createSignedUrl(fr.storage_path, 60);
  check("X11 removed member gets no new link", !!sGone.error || !sGone.data?.signedUrl, sGone);
} catch (e) { bad++; console.error(e); }
finally {
  if (paths.length) await admin.storage.from("rikaz-files").remove(paths);
  for (const o of orgs) {
    const { data: ss } = await admin.from("schools").select("id").eq("org_id", o);
    for (const { id } of ss ?? []) { await admin.from("files").delete().eq("school_id", id); await admin.from("comm_settings").delete().eq("school_id", id); }
    await admin.from("comm_audit").delete().eq("org_id", o);
    await admin.from("conversations").delete().eq("org_id", o);
  }
  await tr.deleteNotifications();
  for (const o of orgs) { await admin.from("invitations").delete().eq("org_id", o); await admin.from("memberships").delete().eq("org_id", o); await admin.from("schools").delete().eq("org_id", o); await admin.from("organizations").delete().eq("id", o); await tr.purgeOrg(o); }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
