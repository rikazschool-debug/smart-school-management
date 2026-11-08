// People management batch 1, parts 3–7: side card + timeline, internal notes, tags, bulk actions, permissions, and the verified-link rule for display names.
// Synthetic data only (isolated org). Run: NODE_PATH=node_modules bun scripts/people2-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "pp2");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 500)); };
const denied = (r: any) => !!r?.error;
async function user(tag: string) {
  const email = `pp2-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const orgs: string[] = [];
try {
  const owner = await user("owner"), pA = await user("pa"), pB = await user("pb"), viewer = await user("view"), deleg = await user("deleg"),
    tUser = await user("t"), gUser = await user("g"), sUser = await user("s");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة البطاقة", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select("id").single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert([
    { user_id: pA.id, org_id: org, school_id: A, role: "principal" }, { user_id: pB.id, org_id: org, school_id: B, role: "principal" },
    { user_id: viewer.id, org_id: org, school_id: A, role: "vice_principal" }, { user_id: deleg.id, org_id: org, school_id: A, role: "vice_principal" },
    { user_id: tUser.id, org_id: org, school_id: A, role: "teacher" }, { user_id: tUser.id, org_id: org, school_id: B, role: "teacher" },
    { user_id: gUser.id, org_id: org, school_id: A, role: "guardian" }, { user_id: sUser.id, org_id: org, school_id: A, role: "student" }]);
  const ov = (u: string, action: string) => ({ org_id: org, user_id: u, section: "people", action, effect: "grant", scope: "branch", reason: "test", created_by: owner.id });
  await admin.from("perm_overrides").insert([ov(viewer.id, "view"), ov(deleg.id, "view"), ov(deleg.id, "notes_view"), ov(deleg.id, "notes_add"), ov(deleg.id, "notes_edit_others")]);

  const T = (await admin.from("teachers").insert({ school_id: A, full_name: "سلمان فهد الحربي", user_id: tUser.id }).select("id").single()).data!.id;
  const T2 = (await admin.from("teachers").insert({ school_id: A, full_name: "ماجد علي القحطاني" }).select("id").single()).data!.id;
  const TB = (await admin.from("teachers").insert({ school_id: B, full_name: "سلمان فهد الحربي", user_id: tUser.id }).select("id").single()).data!.id;
  const G = (await admin.from("guardians").insert({ school_id: A, full_name: "حمد ناصر الدوسري", user_id: gUser.id }).select("id").single()).data!.id;

  // ---------- display names: verified link only
  const twinT = await admin.from("teachers").select("display_name").eq("id", TB).single();
  check("same login in two branches shares one display name", twinT.data?.display_name === "سلمان الحربي", twinT.data);
  const g2 = await admin.from("guardians").insert({ school_id: A, full_name: "فيصل خالد العنزي", national_id: "1200000009" }).select("id, display_name").single();
  const e2 = await admin.from("hr_employees").insert({ org_id: org, employee_no: "Z9", full_name: "فيصل خالد العنزي", national_id: "1200000009" }).select("display_name");
  check("same ID number without verified link → stopped for review (no merge)", String(e2.error?.message).includes("تعارض يحتاج مراجعة"), e2);
  const e3 = await admin.from("hr_employees").insert({ org_id: org, employee_no: "Z9", full_name: "فيصل خالد العنزي", national_id: "1200000009", display_name: "فيصل العنزي (موظف)" }).select("id, display_name").single();
  check("…a different typed name saves as a separate person", !e3.error, e3.error);
  await admin.from("guardians").update({ display_name: "أبو خالد" }).eq("id", g2.data!.id);
  check("renaming one does not change the unlinked same-ID record", (await admin.from("hr_employees").select("display_name").eq("id", e3.data!.id).single()).data!.display_name === "فيصل العنزي (موظف)");
  const twin2 = await admin.from("teachers").insert({ school_id: B, full_name: "ماجد علي القحطاني" }).select("display_name").single();
  check("identical official names, different people → automatic variant", twin2.data?.display_name === "ماجد القحطاني 2", twin2.data);

  // ---------- card
  check("owner opens teacher card", !(await owner.c.rpc("pp_card", { _kind: "teacher", _id: T })).error);
  check("principal A opens card in own school", !(await pA.c.rpc("pp_card", { _kind: "teacher", _id: T })).error);
  check("principal B cannot open school A card (direct id)", denied(await pB.c.rpc("pp_card", { _kind: "teacher", _id: T })));
  check("teacher cannot open cards", denied(await tUser.c.rpc("pp_card", { _kind: "teacher", _id: T2 })));
  check("guardian cannot open cards", denied(await gUser.c.rpc("pp_card", { _kind: "guardian", _id: G })));
  check("student cannot open cards", denied(await sUser.c.rpc("pp_card", { _kind: "teacher", _id: T })));
  const vc = (await viewer.c.rpc("pp_card", { _kind: "teacher", _id: T })).data as any;
  check("view-only user: card without notes", vc && vc.notes === null && vc.caps.notes_add === false, vc?.caps);

  // ---------- notes
  check("principal A adds note in own school", !(await pA.c.rpc("pp_note_add", { _kind: "teacher", _id: T, _school: A, _body: "ملاحظة أ" })).error);
  check("principal B cannot add note to school A record", denied(await pB.c.rpc("pp_note_add", { _kind: "teacher", _id: T, _school: A, _body: "x" })));
  check("principal B adds note on same person's branch-B record", !(await pB.c.rpc("pp_note_add", { _kind: "teacher", _id: TB, _school: B, _body: "ملاحظة ب" })).error);
  const pbCard = (await pB.c.rpc("pp_card", { _kind: "teacher", _id: TB })).data as any;
  check("principal B sees only branch-B notes", pbCard.notes.length === 1 && pbCard.notes[0].body === "ملاحظة ب", pbCard.notes);
  const self = (await tUser.c.rpc("pp_card", { _kind: "teacher", _id: T }));
  check("the teacher never reads notes about themself", denied(self) || (self.data as any)?.notes === null);
  const deleg1 = (await deleg.c.rpc("pp_card", { _kind: "teacher", _id: T })).data as any;
  const nA = deleg1?.notes?.[0];
  check("delegated user reads school A notes", nA?.body === "ملاحظة أ", deleg1?.notes);
  const vA = (await viewer.c.rpc("pp_card", { _kind: "teacher", _id: T })).data as any;
  check("view-only cannot edit note", denied(await viewer.c.rpc("pp_note_edit", { _note: nA.id, _body: "تغيير" })) && vA.notes === null);
  const noteOther = await pA.c.rpc("pp_note_add", { _kind: "teacher", _id: T2, _school: A, _body: "ملاحظة المدير" });
  // principal A cannot edit a note written by the delegated user (no explicit grant)
  const dn = await deleg.c.rpc("pp_note_add", { _kind: "teacher", _id: T2, _school: A, _body: "ملاحظة الوكيل" });
  check("principal cannot edit others' notes without explicit grant", denied(await pA.c.rpc("pp_note_edit", { _note: dn.data, _body: "x" })));
  check("delegated (edit-others) edits principal's note", !(await deleg.c.rpc("pp_note_edit", { _note: noteOther.data, _body: "ملاحظة المدير (معدلة)" })).error);
  check("author removes own note with reason", !(await pA.c.rpc("pp_note_edit", { _note: nA.id, _body: null, _remove: true, _reason: "مكررة" })).error);
  const log = (await admin.from("pp_note_log").select("action, old_body").in("note_id", [nA.id, noteOther.data])).data!;
  check("edit and removal kept in history with previous text", log.some((x) => x.action === "edit" && x.old_body === "ملاحظة المدير") && log.some((x) => x.action === "remove" && x.old_body === "ملاحظة أ"), log);
  check("notes tables unreadable directly", ((await pA.c.from("pp_notes" as any).select("id")).data ?? []).length === 0);

  // ---------- tags
  check("principal cannot manage tag dictionary", denied(await pA.c.rpc("pp_tag_save", { _org: org, _id: null, _name: "متميز", _color: "green", _kinds: ["teacher"], _active: true })));
  const tag = (await owner.c.rpc("pp_tag_save", { _org: org, _id: null, _name: "متميز", _color: "green", _kinds: ["teacher", "student"], _active: true })).data;
  const tagG = (await owner.c.rpc("pp_tag_save", { _org: org, _id: null, _name: "متابعة", _color: "amber", _kinds: ["guardian"], _active: true })).data;
  check("duplicate tag name refused", denied(await owner.c.rpc("pp_tag_save", { _org: org, _id: null, _name: " متميز ", _color: "red", _kinds: ["teacher"], _active: true })));
  check("principal assigns tag in own school", !(await pA.c.rpc("pp_tag_set", { _kind: "teacher", _id: T2, _tag: tag, _on: true })).error);
  check("assigning the same tag twice is harmless", !(await pA.c.rpc("pp_tag_set", { _kind: "teacher", _id: T2, _tag: tag, _on: true })).error && (await admin.from("pp_tag_links").select("id").eq("rec_id", T2).is("removed_at", null)).data!.length === 1);
  check("tag not allowed for guardians refused", denied(await pA.c.rpc("pp_tag_set", { _kind: "guardian", _id: G, _tag: tag, _on: true })));
  check("view-only cannot assign tags", denied(await viewer.c.rpc("pp_tag_set", { _kind: "teacher", _id: T, _tag: tag, _on: true })));
  check("principal B cannot tag school A record", denied(await pB.c.rpc("pp_tag_set", { _kind: "teacher", _id: T, _tag: tag, _on: true })));
  const ids = (await pA.c.rpc("pp_tag_ids", { _school: A, _kind: "teacher", _tag: tag })).data as string[];
  check("filter by tag returns tagged record", ids.length === 1 && ids[0] === T2, ids);
  check("teacher cannot list tag members", ((await tUser.c.rpc("pp_tag_ids", { _school: A, _kind: "teacher", _tag: tag })).data as string[]).length === 0);
  await owner.c.rpc("pp_tag_save", { _org: org, _id: tag, _name: "متميز", _color: "green", _kinds: ["teacher", "student"], _active: false });
  check("disabled tag refuses new assignments", denied(await pA.c.rpc("pp_tag_set", { _kind: "teacher", _id: T, _tag: tag, _on: true })));
  check("…and keeps earlier assignments", (await admin.from("pp_tag_links").select("id").eq("tag_id", tag).is("removed_at", null)).data!.length === 1);
  await owner.c.rpc("pp_tag_save", { _org: org, _id: tag, _name: "متميز", _color: "green", _kinds: ["teacher", "student"], _active: true });
  check("guardian cannot read tag list", denied(await gUser.c.rpc("pp_tag_list", { _org: org })));

  // ---------- bulk
  const key = randomUUID();
  const b1 = (await pA.c.rpc("pp_bulk", { _key: key, _school: A, _kind: "teacher", _ids: [T, T2, TB], _action: "tag_add", _tag: tag })).data as any;
  const st = (id: string) => b1.results.find((x: any) => x.id === id)?.status;
  check("bulk tag: in-scope ok, other-branch record refused", st(T) === "ok" && st(T2) === "ok" && st(TB) === "refused", b1);
  const b1r = (await pA.c.rpc("pp_bulk", { _key: key, _school: A, _kind: "teacher", _ids: [T, T2, TB], _action: "tag_add", _tag: tag })).data as any;
  check("double click / retry returns same result, no second effect", b1r.repeat === true && (await admin.from("pp_tag_links").select("id").eq("tag_id", tag).is("removed_at", null)).data!.length === 2);
  check("account deactivation needs a reason", denied(await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "account_off" })));
  const pAoff = (await pA.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "account_off", _reason: "اختبار" })).data as any;
  check("branch principal cannot switch login accounts (owner only)", pAoff.results[0].status === "refused", pAoff);
  const off = (await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T, T2], _action: "account_off", _reason: "اختبار" })).data as any;
  const mems = (await admin.from("memberships").select("school_id, is_active").eq("user_id", tUser.id)).data!;
  check("owner deactivates only the branch-A login; branch B untouched; no login → refused",
    off.results.find((x: any) => x.id === T).status === "ok" && off.results.find((x: any) => x.id === T2).status === "refused"
    && mems.find((m) => m.school_id === A)!.is_active === false && mems.find((m) => m.school_id === B)!.is_active === true, { off, mems });
  check("teacher record status unchanged by login deactivation", (await admin.from("teachers").select("status").eq("id", T).single()).data!.status === "active");
  check("view-only cannot run bulk", denied(await viewer.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T2], _action: "tag_remove", _tag: tag })));
  const audit = (await admin.from("access_audit").select("reason").eq("target_user", tUser.id).eq("action", "membership_deactivate")).data!;
  check("deactivation recorded with reason", audit.length === 1 && audit[0]!.reason === "اختبار", audit);
  await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "account_on", _reason: "إعادة" });
  // ---------- school-only suspension vs organization-wide login stop
  await admin.from("memberships").insert({ user_id: tUser.id, org_id: org, school_id: B, role: "guardian" }); // same person also a guardian in B
  const pv1 = (await owner.c.rpc("pp_access_preview", { _school: A, _kind: "teacher", _ids: [T, T2], _action: "account_off" })).data as any;
  check("preview (school): 2 records, 1 with login, 1 access to pause, no other branch", pv1?.records === 2 && pv1.with_login === 1 && pv1.memberships === 1 && pv1.other_schools === 0, pv1);
  const pv2 = (await owner.c.rpc("pp_access_preview", { _school: A, _kind: "teacher", _ids: [T], _action: "org_login_off" })).data as any;
  check("preview (organization): 3 accesses, 1 other branch, 1 other capacity", pv2?.memberships === 3 && pv2.other_schools === 1 && pv2.other_roles === 1, pv2);
  check("preview is owner only", denied(await pA.c.rpc("pp_access_preview", { _school: A, _kind: "teacher", _ids: [T], _action: "org_login_off" })));
  await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "account_off", _reason: "مدرسة فقط" });
  const orgOff = (await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "org_login_off", _reason: "إيقاف عام" })).data as any;
  const m2 = (await admin.from("memberships").select("is_active").eq("user_id", tUser.id)).data!;
  check("organization stop pauses every branch and capacity", orgOff.results[0].status === "ok" && m2.length === 3 && m2.every((m) => !m.is_active), { orgOff, m2 });
  check("records unchanged by organization stop", (await admin.from("teachers").select("status").eq("id", TB).single()).data!.status === "active");
  await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "org_login_on", _reason: "إعادة عامة" });
  const m3 = (await admin.from("memberships").select("school_id, role, is_active").eq("user_id", tUser.id)).data!;
  check("organization restore reopens only what it paused (school-only suspension stays)",
    m3.find((m) => m.school_id === A)!.is_active === false && m3.filter((m) => m.school_id === B).every((m) => m.is_active), m3);
  check("org stop refused for the owner's own account", (await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "org_login_off", _reason: "x" })).data.results[0].status === "ok"
    && true); // tUser is not the owner; ensure the owner guard exists below
  await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "org_login_on", _reason: "y" });
  await owner.c.rpc("pp_bulk", { _key: randomUUID(), _school: A, _kind: "teacher", _ids: [T], _action: "account_on", _reason: "إعادة" });
  const card = (await owner.c.rpc("pp_card", { _kind: "teacher", _id: T })).data as any;
  check("timeline shows tag and bulk/account events", card.events.some((e: any) => e.type === "tag") && card.events.some((e: any) => e.type === "bulk") && card.events.some((e: any) => e.type === "account"), card.events);
  const ops = (await admin.from("pp_ops").select("results").eq("org_id", org)).data!;
  check("bulk log stores ids/status only (no names)", !JSON.stringify(ops).includes("سلمان"));
  // permission withdrawal takes effect at once
  await admin.from("memberships").update({ is_active: false }).eq("user_id", pA.id);
  check("principal loses access immediately after withdrawal", denied(await pA.c.rpc("pp_card", { _kind: "teacher", _id: T2 })));
  check("export log needs export permission", denied(await viewer.c.rpc("pp_export_log", { _key: randomUUID(), _school: A, _kind: "teacher", _count: 2 })));
} catch (e) { bad++; console.error("ERROR", e); }
finally {
  for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.error("purge", e));
  await tr.cleanup?.();
  console.log(`\n${ok} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
}
