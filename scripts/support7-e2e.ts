// Support package 7 on the 4-school fixture (needs hub4-fixture setup): «الدعم الفني» permission section and per-ticket followers.
// Granted staff act only within the granted action/branch; followers read ticket + public replies + files and get alerts,
// but cannot reply, attach, change status, assign, transfer or read notes; removal cuts access at once (even mid-session);
// branch transfer drops followers outside the new branch. Run: NODE_PATH=node_modules bun scripts/support7-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/h4/fixture.json", "utf8"));
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${PK}`) h.delete("Authorization"); h.set("apikey", PK); return fetch(input, { ...init, headers: h }); };
async function as(k: string) { const c = createClient(env.VITE_SUPABASE_URL, PK, { auth: { persistSession: false }, global: { fetch: shim as any } }); const s = await c.auth.signInWithPassword({ email: f[k], password: f.pw }); if (s.error) throw s.error; return c; }
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const [S1, S2] = f.schools; const id = f.ids; const org = f.org;
const owner = await as("owner"), p1 = await as("p1"), t1 = await as("t1"), a1 = await as("a1"), a2 = await as("a2"), other = await as("other");
const rev = async (t: string) => (await admin.from("support_tickets").select("rev").eq("id", t).single()).data!.rev;
const notif = async (u: string, like: string) => ((await admin.from("notifications").select("id, title").eq("user_id", u).like("dedupe_key", like)).data ?? []);

// catalog
const cat = (await owner.rpc("perm_catalog")).data as any;
const sec = cat?.sections?.find((s: any) => s.key === "support");
check("1 permission tree has «الدعم الفني والمساعدة» with separate actions", cat?.areas?.some((a: any) => a.key === "support")
  && ["view", "create", "assign", "transfer", "status", "follow", "followers", "export", "settings"].every((a) => sec?.actions.includes(a)), sec);

// defaults
const cp = (await p1.rpc("support_caps", { _org: org })).data as any;
check("2 principal default: view/create/assign/status/followers on own branch; no transfer/settings", cp?.view?.length === 1 && cp.view[0].id === S1 && cp.create.length === 1 && cp.transfer.length === 0 && cp.settings === false, cp);
const ca = (await a1.rpc("support_caps", { _org: org })).data as any;
check("3 admin staff has no support management by default", ca?.view?.length === 0 && ca.create.length === 0, ca);
const co = (await owner.rpc("support_caps", { _org: org })).data as any;
check("4 owner holds every action on all branches", co?.view?.length >= 4 && co.transfer.length === co.view.length && co.settings === true, co);

// ticket by owner in S1 assigned to t1
const T = (await owner.rpc("support_open", { _school: S1, _title: "صيانة الشبكة", _body: "الشبكة في المبنى ب منقطعة", _assignee: id.t1, _client_key: crypto.randomUUID() })).data as string;
check("5 a1 cannot read the ticket before any grant", !!(await a1.rpc("support_get", { _ticket: T })).error);

// grant a1 view only
const g = (u: string, a: string, eff = "grant") => owner.rpc("perm_override_set", { _org: org, _user: u, _section: "support", _action: a, _effect: eff, _scope: eff === "grant" ? "branch" : null, _reason: "اختبار الدعم" });
const gv = await g(id.a1, "view");
check("6 owner grants a1 support.view (branch)", !gv.error, gv.error);
const av = await a1.rpc("support_get", { _ticket: T });
check("7 view-only reads the branch box ticket", !av.error && (av.data as any).can.view === true && (av.data as any).can.assign === false && (av.data as any).can.manage === false, av.error ?? (av.data as any)?.can);
check("8 view-only lists it in «manage»", (((await a1.rpc("support_list", { _box: "manage" })).data ?? []) as any[]).some((r) => r.id === T));
check("9 view-only cannot assign", !!(await a1.rpc("support_action", { _ticket: T, _action: "assign", _rev: await rev(T), _value: "" })).error);
check("10 view-only cannot change status/priority", !!(await a1.rpc("support_action", { _ticket: T, _action: "priority", _rev: await rev(T), _value: "high" })).error);
check("11 view-only cannot reply", !!(await a1.rpc("support_reply", { _ticket: T, _body: "رد من مطّلع" })).error);
check("12 view-only cannot add followers", !!(await a1.rpc("support_set_follower", { _ticket: T, _user: id.p1, _on: true })).error);
check("13 view in S1 does not open S2 tickets", !!(await a1.rpc("support_route_departments", { _school: S2 })).error);
// grant assign → a1 may reassign within S1
await g(id.a1, "assign");
const ra = await a1.rpc("support_action", { _ticket: T, _action: "assign", _rev: await rev(T), _value: id.p1 });
check("14 with support.assign a1 reassigns within the branch", !ra.error, ra.error);
check("15 assign still refuses a guardian or someone from another organization", !!(await a1.rpc("support_action", { _ticket: T, _action: "assign", _rev: await rev(T), _value: id.g1 })).error && !!(await a1.rpc("support_action", { _ticket: T, _action: "assign", _rev: await rev(T), _value: id.other })).error);
check("16 no transfer without support.transfer", !!(await a1.rpc("support_action", { _ticket: T, _action: "transfer", _rev: await rev(T), _value: S2, _reason: "تجربة" })).error);
check("17 settings refused without support.settings", !!(await a1.rpc("support_save_category", { _org: org, _id: null, _name: "تصنيف a1", _active: true })).error);
// explicit deny of view for the principal
await g(id.p1, "view", "deny");
check("18 explicit deny removes the principal's default view", (((await p1.rpc("support_caps", { _org: org })).data as any)?.view ?? []).length === 0);
await owner.rpc("perm_override_clear" as never, { _org: org, _user: id.p1, _section: "support", _action: "view", _reason: "إعادة" } as never);
await admin.from("perm_overrides").delete().eq("org_id", org).eq("user_id", id.p1).eq("section", "support");
check("19 principal default restored after removing the deny", (((await p1.rpc("support_caps", { _org: org })).data as any)?.view ?? []).length === 1);
// reassign back to t1
await owner.rpc("support_action", { _ticket: T, _action: "assign", _rev: await rev(T), _value: id.t1 });
await owner.rpc("support_reply", { _ticket: T, _body: "رد علني: نعمل على الإصلاح" });
await owner.rpc("support_add_note", { _ticket: T, _kind: "team", _recipient: null, _body: "ملاحظة داخلية سرية" });

// followers
await admin.from("perm_overrides").delete().eq("org_id", org).eq("user_id", id.a1).eq("section", "support");
const cand = ((await owner.rpc("support_follower_candidates", { _ticket: T, _q: "إداري" })).data ?? []) as any[];
check("20 follower candidates = branch staff only (role + branch shown)", cand.some((c) => c.user_id === id.a1) && !cand.some((c) => c.user_id === id.a2 || c.user_id === id.g1) && cand.every((c) => c.role && c.school_name), cand);
check("21 guardian cannot be added as follower", !!(await owner.rpc("support_set_follower", { _ticket: T, _user: id.g1, _on: true })).error);
check("22 staff of another branch cannot be added (direct request)", !!(await owner.rpc("support_set_follower", { _ticket: T, _user: id.a2, _on: true })).error);
check("23 assignee (t1) cannot manage followers", !!(await t1.rpc("support_set_follower", { _ticket: T, _user: id.a1, _on: true })).error);
const add = await owner.rpc("support_set_follower", { _ticket: T, _user: id.a1, _on: true });
check("24 owner adds a1 as follower", !add.error, add.error);
check("25 follower got an alert on being added", (await notif(id.a1, "follow:" + T + "%")).length === 1);
const fg = await a1.rpc("support_get", { _ticket: T });
const fd = fg.data as any;
check("26 follower reads ticket, status and public replies", !fg.error && fd.can.following === true && fd.messages.some((m: any) => m.body.includes("نعمل على الإصلاح")), fg.error);
check("27 follower sees no internal notes and no handling rights", fd.notes.length === 0 && !fd.can.handle && !fd.can.assign && !fd.can.transfer && !fd.can.reply && !fd.can.attach && !fd.can.export, fd?.can);
check("28 follower listed separately from the handler", fd.follower_list.some((x: any) => x.user_id === id.a1) && fd.ticket.assignee === id.t1);
check("29 follower sees the ticket in «أتابعها»", (((await a1.rpc("support_list", { _box: "following" })).data ?? []) as any[]).some((r) => r.id === T));
check("30 follower cannot reply", !!(await a1.rpc("support_reply", { _ticket: T, _body: "محاولة رد" })).error);
check("31 follower cannot resolve/change status", !!(await a1.rpc("support_action", { _ticket: T, _action: "resolve", _rev: await rev(T), _reason: "حلها المتابع" })).error);
check("32 follower cannot attach files", !!(await a1.rpc("create_support_file", { _ticket: T, _name: "a.png", _mime: "image/png", _size: 10 })).error);
check("33 follower cannot add notes", !!(await a1.rpc("support_add_note", { _ticket: T, _kind: "team", _recipient: null, _body: "x" })).error);
// files: handler attaches, follower downloads
const fl = await t1.rpc("create_support_file", { _ticket: T, _name: "صورة.png", _mime: "image/png", _size: 10 });
const frec = (fl.data as any[])?.[0];
await t1.storage.from("rikaz-files").upload(frec.storage_path, new Blob([new Uint8Array([137, 80, 78, 71, 1, 2])], { type: "image/png" }), { contentType: "image/png" });
const s1 = await a1.storage.from("rikaz-files").createSignedUrl(frec.storage_path, 60);
check("34 follower gets a temporary link for the attachment", !s1.error && !!s1.data?.signedUrl, s1.error);
check("35 other org cannot download the attachment", !!(await other.storage.from("rikaz-files").createSignedUrl(frec.storage_path, 60)).error);
// alerts on important updates
await t1.rpc("support_reply", { _ticket: T, _body: "تم استبدال الموجّه" });
check("36 follower alerted on a public reply", (await notif(id.a1, "sfollow:%")).length >= 1);
const ev = ((await owner.rpc("support_get", { _ticket: T })).data as any).events as any[];
check("37 timeline logs follower added", ev.some((e) => e.action === "follower_added" && e.details?.name));
// remove follower while a1 still holds a session
const rm = await owner.rpc("support_set_follower", { _ticket: T, _user: id.a1, _on: false });
check("38 owner removes the follower", !rm.error, rm.error);
check("39 removed follower is refused on the next open (same session)", !!(await a1.rpc("support_get", { _ticket: T })).error);
check("40 removed follower cannot get a new download link", !!(await a1.storage.from("rikaz-files").createSignedUrl(frec.storage_path, 60)).error || !(await a1.storage.from("rikaz-files").createSignedUrl(frec.storage_path, 60)).data?.signedUrl);
const before = (await notif(id.a1, "sfollow:%")).length;
await t1.rpc("support_reply", { _ticket: T, _body: "رد بعد الإزالة" });
check("41 removed follower stops receiving alerts", (await notif(id.a1, "sfollow:%")).length === before);
check("42 timeline logs follower removed", ((((await owner.rpc("support_get", { _ticket: T })).data as any).events) as any[]).some((e) => e.action === "follower_removed"));
// self-follow needs support.follow
check("43 staff without support.follow cannot follow by themselves", !!(await a1.rpc("support_set_follower", { _ticket: T, _user: id.a1, _on: true })).error);
// membership deactivated → access stops
await owner.rpc("support_set_follower", { _ticket: T, _user: id.a1, _on: true });
await admin.from("memberships").update({ is_active: false }).eq("user_id", id.a1).eq("school_id", S1);
check("44 follower whose membership is suspended loses access", !!(await a1.rpc("support_get", { _ticket: T })).error);
await admin.from("memberships").update({ is_active: true }).eq("user_id", id.a1).eq("school_id", S1);
// transfer drops followers outside the new branch
const tr = await owner.rpc("support_action", { _ticket: T, _action: "transfer", _rev: await rev(T), _value: S2, _reason: "يخص الفرع الثاني" });
check("45 transfer to another branch", !tr.error, tr.error);
const after = (await admin.from("support_followers").select("user_id").eq("ticket_id", T)).data ?? [];
check("46 followers outside the new branch removed and access withdrawn", after.length === 0 && !!(await a1.rpc("support_get", { _ticket: T })).error, after);
check("47 previous assignee lost access after transfer", !!(await t1.rpc("support_get", { _ticket: T })).error);
check("48 principal of old branch lost access after transfer", !!(await p1.rpc("support_get", { _ticket: T })).error);
check("49 other org refused on every follower call", !!(await other.rpc("support_follower_candidates", { _ticket: T })).error && !!(await other.rpc("support_set_follower", { _ticket: T, _user: id.other, _on: true })).error);
check("50 requester (owner) keeps access after transfer", !(await owner.rpc("support_get", { _ticket: T })).error);

// cleanup ticket data (fixture teardown removes the rest)
await admin.from("perm_overrides").delete().eq("org_id", org).eq("section", "support");
await admin.from("files").delete().eq("source_type", "support").eq("source_id", T);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
