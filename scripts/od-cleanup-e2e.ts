// Abandoned «الوثائق والعقود» draft files: run_file_cleanup removes org_doc_pending files older than 24h, keeps fresh ones
// (may still be uploading) and never touches files of saved documents (source_type 'org_doc'). Uses an existing school/user,
// creates only its own marked files and removes them. Run: NODE_PATH=node_modules bun scripts/od-cleanup-e2e.ts
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const any = (await admin.from("files").select("school_id, uploaded_by").not("uploaded_by", "is", null).limit(1).single()).data!;
const S = any.school_id as string, U = any.uploaded_by as string, run = Date.now();
const org = (await admin.from("schools").select("org_id").eq("id", S).single()).data!.org_id as string;
const old = new Date(Date.now() - 25 * 3600_000).toISOString();
async function mk(kind: string, created: string, tag: string) {
  const path = `${S}/od-cleanup-test/${run}-${tag}.pdf`;
  const up = await admin.storage.from("rikaz-files").upload(path, new Blob(["%PDF-test"], { type: "application/pdf" }));
  if (up.error) throw up.error;
  const r = await admin.from("files").insert({ school_id: S, storage_path: path, name: `${tag}.pdf`, mime_type: "application/pdf", size_bytes: 9, source_type: kind, source_id: org, uploaded_by: U, created_at: created }).select("id").single();
  if (r.error) throw r.error;
  return { id: r.data.id as string, path };
}
const abandoned = await mk("org_doc_pending", old, "abandoned");
const uploading = await mk("org_doc_pending", new Date().toISOString(), "uploading");
const saved = await mk("org_doc", old, "saved");
const job = await admin.rpc("run_file_cleanup");
check("0 cleanup job ran", !job.error, job.error);
const row = async (id: string) => (await admin.from("files").select("source_type").eq("id", id).maybeSingle()).data;
check("1 abandoned document draft file (>24h, never saved) is queued for deletion", (await row(abandoned.id))?.source_type === "cleanup_due", await row(abandoned.id));
check("2 a draft file still uploading (fresh) is kept", (await row(uploading.id))?.source_type === "org_doc_pending");
check("3 the file of a saved document is kept", (await row(saved.id))?.source_type === "org_doc");
let gone = false;
for (let i = 0; i < 10 && !gone; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const l = await admin.storage.from("rikaz-files").list(`${S}/od-cleanup-test`, { search: `${run}-abandoned` });
  gone = (l.data ?? []).length === 0;
}
check("4 abandoned file removed from storage", gone);
await admin.rpc("run_file_cleanup");
check("5 its record is removed after the object is gone", (await row(abandoned.id)) === null);
await admin.from("files").delete().in("id", [abandoned.id, uploading.id, saved.id]);
await admin.storage.from("rikaz-files").remove([abandoned.path, uploading.path, saved.path]);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
