// HR documents center: requirements/missing, private upload → review (not uploader, not employee) → reject/reupload/accept,
// version history, branch + confidential + download scopes, file access through storage RLS, alerts once, contract settings permission.
// Run: NODE_PATH=node_modules bun scripts/hr-docs-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "hrd");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 300)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `hrd-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const day = (n: number) => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pdf = new Blob(["%PDF-1.4 synthetic test document"], { type: "application/pdf" });
const orgs: string[] = [];
try {
  const owner = await user("owner"), hr = await user("hr"), rev = await user("rev"), view = await user("view"), emp = await user("emp"), mate = await user("mate"), brB = await user("brb"), stranger = await user("x");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة مستندات", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  const org2 = (await stranger.c.rpc("create_organization", { _org_name: "أخرى", _school_name: "س" })).data; orgs.push(org2);
  tr.addSchool((await admin.from("schools").select("id").eq("org_id", org2).single()).data!.id);
  for (const [u, s] of [[hr, A], [rev, A], [view, A], [emp, A], [mate, A], [brB, B]] as any) await admin.from("memberships").insert({ user_id: u.id, org_id: org, school_id: s, role: "teacher" });
  const grant = (u: any, sec: string, a: string, scope: string) => owner.c.rpc("perm_override_set", { _org: org, _user: u.id, _section: sec, _action: a, _effect: "grant", _scope: scope, _reason: "اختبار" });
  for (const a of ["view", "upload", "download", "sensitive"]) await grant(hr, "hr_documents", a, "branch");
  for (const a of ["view", "review", "download", "sensitive"]) await grant(rev, "hr_documents", a, "org");
  await grant(view, "hr_documents", "view", "branch");
  await grant(brB, "hr_documents", "view", "branch"); await grant(brB, "hr_documents", "download", "branch");
  const mk = async (u: any, s: string, n: string) => { const id = (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, user_id: u.id } })).data; if (id) await owner.c.rpc("hr_self_access_set", { _emp: id, _active: true }); return id; };
  const E = await mk(emp, A, "موظفة المستندات"), M = await mk(mate, A, "زميلة");

  const tNo = await hr.c.rpc("hr_doc_type_save", { _org: org, _id: null, _p: { name: "x" } }); check("types need settings permission", !!tNo.error, tNo);
  const T1 = (await owner.c.rpc("hr_doc_type_save", { _org: org, _id: null, _p: { name: "الهوية الوطنية", needs_number: true, needs_expiry: true, employee_upload: true, required_all: true, alert_days: [30] } })).data;
  const T2 = (await owner.c.rpc("hr_doc_type_save", { _org: org, _id: null, _p: { name: "تقرير طبي", confidential: true, employee_upload: true } })).data;
  check("owner defines types", !!T1 && !!T2, null);
  const miss = (await hr.c.rpc("hr_doc_list", { _org: org, _f: { status: "missing" } })).data;
  check("missing required documents listed per employee", miss?.filter((r: any) => r.type_id === T1).length === 2, miss);
  const my0 = (await emp.c.rpc("hr_my_documents", { _org: org })).data;
  check("employee sees what is missing", my0?.missing?.some((m: any) => m.type_id === T1), my0);

  const bad1 = await emp.c.rpc("hr_doc_upload_start", { _org: org, _p: { type_id: T1, employee_id: E }, _name: "id.pdf", _mime: "application/pdf", _size: 100 });
  check("required number/expiry enforced", has(bad1, "رقم المستند"), bad1.error);
  const badMime = await emp.c.rpc("hr_doc_upload_start", { _org: org, _p: { type_id: T1, employee_id: E, doc_no: "1", expires_on: day(400) }, _name: "x.exe", _mime: "application/x-msdownload", _size: 100 });
  check("file type checked", has(badMime, "نوع الملف"), badMime.error);
  const forOther = await emp.c.rpc("hr_doc_upload_start", { _org: org, _p: { type_id: T1, employee_id: M, doc_no: "1", expires_on: day(400) }, _name: "id.pdf", _mime: "application/pdf", _size: 100 });
  check("employee cannot upload for a colleague", has(forOther, "غير مصرح"), forOther.error);
  const up = async (u: any, p: any) => { const s = await u.c.rpc("hr_doc_upload_start", { _org: org, _p: p, _name: "doc.pdf", _mime: "application/pdf", _size: pdf.size }); if (s.error) return s; const st = await u.c.storage.from("rikaz-files").upload(s.data.storage_path, pdf, { contentType: "application/pdf" }); if (st.error) return { error: st.error }; return { data: s.data, done: await u.c.rpc("hr_doc_upload_done", { _version: s.data.version_id }) }; };
  const s0 = await emp.c.rpc("hr_doc_upload_start", { _org: org, _p: { type_id: T1, employee_id: E, doc_no: "0012345", expires_on: day(400) }, _name: "id.pdf", _mime: "application/pdf", _size: pdf.size });
  const early = await emp.c.rpc("hr_doc_upload_done", { _version: s0.data.version_id }); check("confirm refused before file exists", has(early, "لم يكتمل"), early.error);
  await emp.c.storage.from("rikaz-files").upload(s0.data.storage_path, pdf, { contentType: "application/pdf" });
  const d0 = await emp.c.rpc("hr_doc_upload_done", { _version: s0.data.version_id }); check("employee upload → under review", !d0.error, d0.error);
  const D = s0.data.document_id, V1 = s0.data.version_id;
  const selfRev = await emp.c.rpc("hr_doc_review", { _version: V1, _decision: "accept" }); check("employee cannot accept own document", !!selfRev.error, selfRev.error);
  const vRev = await view.c.rpc("hr_doc_review", { _version: V1, _decision: "accept" }); check("view-only cannot review", has(vRev, "غير مصرح"), vRev.error);
  const rj0 = await rev.c.rpc("hr_doc_review", { _version: V1, _decision: "reject" }); check("reject needs reason", has(rj0, "سبب"), rj0.error);
  await rev.c.rpc("hr_doc_review", { _version: V1, _decision: "reject", _reason: "الصورة غير واضحة" });
  const my1 = (await emp.c.rpc("hr_my_documents", { _org: org })).data;
  const mine = my1.documents.find((x: any) => x.id === D);
  check("employee sees rejection reason", mine?.status === "rejected" && mine?.latest?.review_reason === "الصورة غير واضحة", mine);
  const dbl = await rev.c.rpc("hr_doc_review", { _version: V1, _decision: "accept" }); check("second decision on same version refused", has(dbl, "سابقًا"), dbl.error);
  const r2 = await up(emp, { document_id: D, doc_no: "0012345", expires_on: day(400) }); check("reupload as version 2", !r2.error && r2.data.version === 2, r2.error);
  await rev.c.rpc("hr_doc_review", { _version: r2.data.version_id, _decision: "accept" });
  const r3 = await up(emp, { document_id: D, doc_no: "0099999", expires_on: day(20) });
  const g = (await rev.c.rpc("hr_doc_get", { _id: D })).data;
  check("new version does not silently replace accepted", g.accepted_version === 2 && g.status === "under_review" && g.versions.length === 3, g);
  check("pending version's number/expiry do not replace accepted data", g.current?.version === 2 && g.current?.doc_no === "0012345" && g.latest?.doc_no === "0099999", { c: g.current, l: g.latest });
  // per-type requirements: a type without number/expiry accepts uploads without them; changing requirements keeps history
  const T3 = (await owner.c.rpc("hr_doc_type_save", { _org: org, _id: null, _p: { name: "شهادة خبرة", employee_upload: true } })).data;
  const plain = await up(emp, { type_id: T3, employee_id: E });
  check("type without number/expiry: upload allowed without them", !plain.error, plain.error);
  await owner.c.rpc("hr_doc_type_save", { _org: org, _id: T3, _p: { name: "شهادة خبرة", employee_upload: true, needs_number: true } });
  const keep = (await admin.from("hr_document_versions").select("id,status").eq("id", plain.data?.version_id ?? "").maybeSingle()).data;
  const tlog = (await admin.from("hr_events").select("action").eq("entity", "doc_type").eq("entity_id", T3)).data!.map((x: any) => x.action);
  check("changing type requirements keeps prior versions and logs the change", !!keep && tlog.includes("update"), { keep, tlog });
  const hrUp = await up(hr, { type_id: T1, employee_id: M, doc_no: "777", expires_on: day(500) });
  const hrSelf = await hr.c.rpc("hr_doc_review", { _version: hrUp.data.version_id, _decision: "accept" }); check("uploader cannot review own upload", !!hrSelf.error, hrSelf.error);
  await rev.c.rpc("hr_doc_review", { _version: r3.data.version_id, _decision: "accept" });
  const vs = (await admin.from("hr_document_versions").select("version,status").eq("document_id", D).order("version")).data!.map((x: any) => x.status).join(",");
  check("history kept: rejected, superseded, accepted", vs === "rejected,superseded,accepted", vs);
  const lock = await admin.from("hr_document_versions").update({ expires_on: day(999) }).eq("id", r3.data.version_id); check("decided version locked", !!lock.error, lock);
  const del = await admin.from("hr_document_versions").delete().eq("id", V1); check("versions never deleted", !!del.error, del);

  const mg = await mate.c.rpc("hr_doc_get", { _id: D }); check("colleague cannot open document by id", has(mg, "غير مصرح"), mg.error);
  const mf = await mate.c.rpc("hr_doc_file", { _version: r3.data.version_id }); check("colleague cannot get file", has(mf, "غير مصرح"), mf.error);
  const path = (await admin.from("files").select("storage_path").eq("source_id", r3.data.version_id).single()).data!.storage_path;
  const ms = await mate.c.storage.from("rikaz-files").createSignedUrl(path, 60); check("storage refuses colleague signed URL", !!ms.error, ms.data);
  const es = await emp.c.storage.from("rikaz-files").createSignedUrl(path, 60); check("employee opens own file", !es.error, es.error);
  const vf = await view.c.rpc("hr_doc_file", { _version: r3.data.version_id }); check("view without download cannot open file", has(vf, "غير مصرح"), vf.error);
  const bL = (await brB.c.rpc("hr_doc_list", { _org: org, _f: {} })).data; check("other branch sees nothing of branch A", Array.isArray(bL) && bL.length === 0, bL);
  const xo = await stranger.c.rpc("hr_doc_get", { _id: D }); check("other organisation cannot read", has(xo, "غير مصرح"), xo.error);
  const med = await up(emp, { type_id: T2, employee_id: E });
  const vl = (await view.c.rpc("hr_doc_list", { _org: org, _f: {} })).data;
  check("confidential hidden without sensitive", !vl.some((r: any) => r.type_id === T2) && vl.some((r: any) => r.type_id === T1), vl.map((r: any) => r.type));
  const rl = (await rev.c.rpc("hr_doc_list", { _org: org, _f: {} })).data; check("sensitive holder sees confidential", rl.some((r: any) => r.type_id === T2), null);
  check("employee uploads confidential own document", !med.error, med.error);

  await admin.rpc("hr_doc_alerts_tick"); await admin.rpc("hr_doc_alerts_tick");
  const nr = (await admin.from("notifications").select("dedupe_key,body").eq("user_id", rev.id).like("dedupe_key", `hr-d-exp:${D}:%`)).data!;
  const ne = (await admin.from("notifications").select("dedupe_key").eq("user_id", emp.id).like("dedupe_key", `hr-d-exp-me:${D}:%`)).data!;
  check("expiry alert once (reviewer + employee), stage from type setting", nr.length === 1 && nr[0].dedupe_key.endsWith(":d30") && ne.length === 1, { nr, ne });
  const nv = (await admin.from("notifications").select("id").eq("user_id", view.id).like("dedupe_key", "hr-d-exp:%")).data!; check("view-only not alerted", nv.length === 0, nv);

  // contract alert settings need their own permission
  await grant(hr, "hr_contracts", "approve", "org");
  const ap = await hr.c.rpc("hr_settings_save", { _org: org, _days: [45], _notify_employee: false }); check("contract approve does not grant settings", has(ap, "غير مصرح"), ap.error);
  await grant(hr, "hr_contracts", "settings", "org");
  const ap2 = await hr.c.rpc("hr_settings_save", { _org: org, _days: [45], _notify_employee: false }); check("settings permission allows saving", !ap2.error, ap2.error);

  await admin.from("org_sections").upsert({ org_id: org, section: "hr", enabled: false }, { onConflict: "org_id,section" });
  const off = await emp.c.rpc("hr_doc_file", { _version: r3.data.version_id }); check("HR switched off blocks files", !!off.error, off);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally {
  for (const o of orgs) {
    const fl = (await admin.from("files").select("storage_path,id,school_id").eq("source_type", "hr")).data ?? [];
    const sch = (await admin.from("schools").select("id").eq("org_id", o)).data!.map((x: any) => x.id);
    const mineF = fl.filter((f: any) => sch.includes(f.school_id));
    if (mineF.length) { await admin.storage.from("rikaz-files").remove(mineF.map((f: any) => f.storage_path)); }
    await admin.rpc("_hr_purge_org", { _org: o });
    if (mineF.length) await admin.from("files").delete().in("id", mineF.map((f: any) => f.id));
    await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e));
  }
  for (const u of tr.users) await admin.auth.admin.deleteUser(u);
}
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
