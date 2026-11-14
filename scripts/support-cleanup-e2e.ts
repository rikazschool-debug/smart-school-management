// Abandoned support create-form attachments (needs hub4-fixture setup): run_file_cleanup removes support_pending files older
// than 24h, keeps fresh ones (may still be uploading) and never touches attachments of saved tickets (source_type 'support').
// Runs the real cleanup job once (it is the same job cron runs hourly). Run: NODE_PATH=node_modules bun scripts/support-cleanup-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const f = JSON.parse(readFileSync("/tmp/browser/h4/fixture.json", "utf8"));
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d)); };
const S1 = f.schools[0], U = f.ids.t1, run = Date.now();
const old = new Date(Date.now() - 25 * 3600_000).toISOString();
async function mk(kind: string, created: string, tag: string) {
  const path = `${S1}/support-cleanup-test/${run}-${tag}.txt`;
  const up = await admin.storage.from("rikaz-files").upload(path, new Blob(["test"], { type: "text/plain" }));
  if (up.error) throw up.error;
  const r = await admin.from("files").insert({ school_id: S1, storage_path: path, name: `${tag}.txt`, mime_type: "text/plain", size_bytes: 4, source_type: kind, source_id: crypto.randomUUID(), uploaded_by: U, created_at: created }).select("id").single();
  if (r.error) throw r.error;
  return { id: r.data.id as string, path };
}
const abandoned = await mk("support_pending", old, "abandoned");
const uploading = await mk("support_pending", new Date().toISOString(), "uploading");
const saved = await mk("support", old, "saved");
const job = await admin.rpc("run_file_cleanup");
check("0 cleanup job ran", !job.error, job.error);
const row = async (id: string) => (await admin.from("files").select("source_type, cleanup_attempts").eq("id", id).maybeSingle()).data;
const a = await row(abandoned.id), b = await row(uploading.id), c = await row(saved.id);
check("1 abandoned form attachment (>24h, never linked) is queued for deletion", a?.source_type === "cleanup_due" && (a.cleanup_attempts ?? 0) >= 1, a);
check("2 a file still uploading (fresh) is kept", b?.source_type === "support_pending", b);
check("3 an attachment of a saved ticket is kept", c?.source_type === "support", c);
// wait for the storage delete request, then a second run removes the row
let gone = false;
for (let i = 0; i < 10 && !gone; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const l = await admin.storage.from("rikaz-files").list(`${S1}/support-cleanup-test`, { search: `${run}-abandoned` });
  gone = (l.data ?? []).length === 0;
}
check("4 abandoned file removed from storage", gone);
await admin.rpc("run_file_cleanup");
check("5 its record is removed after the object is gone", (await row(abandoned.id)) === null);
const keep = await admin.storage.from("rikaz-files").list(`${S1}/support-cleanup-test`, { search: `${run}-` });
check("6 the fresh and saved files still exist in storage", (keep.data ?? []).length === 2, keep.data?.map((x) => x.name));
// test data only
await admin.from("files").delete().in("id", [uploading.id, saved.id]);
await admin.storage.from("rikaz-files").remove([uploading.path, saved.path]);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
