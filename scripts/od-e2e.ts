// Documents & contracts (needs hub4-fixture setup): owner adds docs/contractors; a principal sees nothing until granted per branch;
// view ≠ download ≠ edit; another branch stays hidden; files open only for download holders.
// Run: NODE_PATH=node_modules bun scripts/od-e2e.ts
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
const owner = await as("owner"), p1 = await as("p1");
const pdf = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
async function draft(c: any, school: string | null) {
  const d = await c.rpc("od_draft_file", { _org: org, _school: school, _name: "licence.pdf", _mime: "application/pdf", _size: 13 });
  if (d.error) return { error: d.error };
  const r = d.data[0]; const u = await c.storage.from("rikaz-files").upload(r.storage_path, pdf, { contentType: "application/pdf" });
  return { id: r.id, path: r.storage_path, error: u.error };
}
const created: string[] = [], cons: string[] = [], files: string[] = [];
try {
  const fd = await draft(owner, S1); files.push(fd.id);
  check("1 owner uploads a private PDF draft", !fd.error, fd.error);
  const D1 = await owner.rpc("od_save_doc", { _org: org, _p: { kind: "ترخيص تعليمي", name: "ترخيص الأولى", doc_no: "123", school_id: S1, issued_on: "2026-01-01", expires_on: "2026-11-20", file_id: fd.id } });
  check("2 owner saves a school document with file", !D1.error, D1.error); created.push(D1.data);
  const D2 = await owner.rpc("od_save_doc", { _org: org, _p: { kind: "سجل تجاري", name: "سجل المجموعة", school_id: null, expires_on: "2020-01-01" } });
  check("3 owner saves a group-wide document", !D2.error, D2.error); created.push(D2.data);
  const D3 = await owner.rpc("od_save_doc", { _org: org, _p: { kind: "رخصة بلدية", name: "رخصة الثانية", school_id: S2 } });
  created.push(D3.data);
  const bad = await owner.rpc("od_save_doc", { _org: org, _p: { kind: "تأمين", name: "خطأ", issued_on: "2026-05-01", expires_on: "2026-01-01" } });
  check("4 expiry before issue is refused", !!bad.error);
  const ol = (await owner.rpc("od_list", { _org: org, _what: "docs" })).data as any[];
  check("5 status derived: expiring/expired", ol.find((d) => d.id === D1.data)?.status === "expiring" && ol.find((d) => d.id === D2.data)?.status === "expired", ol);
  const ls = (await owner.rpc("od_list", { _org: org, _what: "docs", _q: "سجل" })).data as any[];
  check("6 search filters by name", ls.length === 1 && ls[0].id === D2.data, ls);
  const pl0 = (await p1.rpc("od_list", { _org: org, _what: "docs" })).data as any[];
  check("7 principal sees nothing by default", pl0.length === 0, pl0);
  check("8 principal cannot add without right", !!(await p1.rpc("od_save_doc", { _org: org, _p: { kind: "تأمين", name: "تأمين", school_id: S1 } })).error);
  const g = await owner.rpc("perm_override_set", { _org: org, _user: id.p1, _section: "org_docs", _action: "view", _effect: "grant", _scope: "branch", _reason: "اختبار الوثائق" });
  check("9 owner grants view on principal's branch", !g.error, g.error);
  const pl = (await p1.rpc("od_list", { _org: org, _what: "docs" })).data as any[];
  check("10 principal sees only own-branch doc (no group, no other branch)", pl.length === 1 && pl[0].id === D1.data, pl);
  const sig = await p1.storage.from("rikaz-files").createSignedUrl(fd.path, 60);
  check("11 view without download cannot open the file", !!sig.error || !sig.data?.signedUrl, sig.data);
  await owner.rpc("perm_override_set", { _org: org, _user: id.p1, _section: "org_docs", _action: "download", _effect: "grant", _scope: "branch", _reason: "اختبار الوثائق" });
  const sig2 = await p1.storage.from("rikaz-files").createSignedUrl(fd.path, 60);
  check("12 download right opens the file", !sig2.error && !!sig2.data?.signedUrl, sig2.error);
  check("13 view+download still cannot edit", !!(await p1.rpc("od_save_doc", { _org: org, _p: { id: D1.data, kind: "ترخيص تعليمي", name: "تغيير", school_id: S1 } })).error);
  check("14 principal cannot draft a file without create/edit", !!(await draft(p1, S1)).error);
  const C1 = await owner.rpc("od_save_contractor", { _org: org, _p: { name: "مقصف النور", service: "المقصف", phone: "0500000000", school_ids: [S1, S2], starts_on: "2026-01-01", ends_on: "2027-01-01" } });
  check("15 owner saves contractor linked to two schools", !C1.error, C1.error); cons.push(C1.data);
  const C2 = await owner.rpc("od_save_contractor", { _org: org, _p: { name: "زي الثانية", service: "الزي المدرسي", school_ids: [S2] } }); cons.push(C2.data);
  const pc = (await p1.rpc("od_list", { _org: org, _what: "contractors" })).data as any[];
  check("16 principal sees contractor of own branch only", pc.length === 1 && pc[0].id === C1.data, pc);
  await owner.rpc("perm_override_set", { _org: org, _user: id.p1, _section: "org_docs", _action: "edit", _effect: "grant", _scope: "branch", _reason: "اختبار الوثائق" });
  check("17 edit on one branch cannot edit a two-branch contractor", !!(await p1.rpc("od_save_contractor", { _org: org, _p: { id: C1.data, name: "x", service: "المقصف", school_ids: [S1, S2] } })).error);
  check("18 principal with edit updates own-branch doc", !(await p1.rpc("od_save_doc", { _org: org, _p: { id: D1.data, kind: "ترخيص تعليمي", name: "ترخيص الأولى المحدث", school_id: S1 } })).error);
  check("19 cannot move a doc to another branch", !!(await p1.rpc("od_save_doc", { _org: org, _p: { id: D1.data, kind: "ترخيص تعليمي", name: "x", school_id: S2 } })).error);
  check("20 no direct table read", ((await p1.from("org_docs" as any).select("id")).data ?? []).length === 0);
} finally {
  for (const a of ["view", "download", "edit"]) await admin.from("perm_overrides").delete().eq("user_id", id.p1).eq("section", "org_docs").eq("action", a);
  await admin.from("org_docs").delete().in("id", created.filter(Boolean));
  await admin.from("org_contractors").delete().in("id", cons.filter(Boolean));
  const paths = (await admin.from("files").select("storage_path").in("id", files.filter(Boolean))).data?.map((x) => x.storage_path) ?? [];
  if (paths.length) await admin.storage.from("rikaz-files").remove(paths);
  await admin.from("files").delete().in("id", files.filter(Boolean));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
