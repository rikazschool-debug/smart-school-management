// Server-side file cleanup test: NODE_PATH=node_modules bun scripts/cleanup-e2e.ts
import { createClient } from "@supabase/supabase-js";
const a = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log(c ? "✓" : "✗", m); };
const conv = (await a.from("conversations").select("id,school_id").not("school_id", "is", null).limit(1).single()).data!;
const user = (await a.from("conversation_members").select("user_id").eq("conversation_id", conv.id).limit(1).single()).data!.user_id;
const old = new Date(Date.now() - 3 * 3600e3).toISOString();
async function mk(label: string, upload: boolean, type = "message_pending", createdAt = old) {
  const id = crypto.randomUUID(); const path = `${conv.school_id}/m/${conv.id}/cleanup-test-${id}`;
  if (upload) { const u = await a.storage.from("rikaz-files").upload(path, new Blob(["x"]), { contentType: "text/plain" }); if (u.error) throw u.error; }
  const r = await a.from("files").insert({ id, school_id: conv.school_id, storage_path: path, name: `cleanup-test ${label}`, mime_type: "text/plain", size_bytes: 1, source_type: type, source_id: conv.id, uploaded_by: user, created_at: createdAt });
  if (r.error) throw r.error; return { id, path };
}
const exists = async (p: string) => !!(await a.storage.from("rikaz-files").list(p.split("/").slice(0, -1).join("/"), { search: p.split("/").pop() })).data?.length;
const row = async (id: string) => (await a.from("files").select("source_type,cleanup_attempts").eq("id", id).maybeSingle()).data;

const stale = await mk("stale with object", true);
const noObj = await mk("stale without object", false);
const fresh = await mk("fresh pending", true, "message_pending", new Date().toISOString());
const linked = await mk("old linked", true, "message");
const r1 = await a.rpc("run_file_cleanup"); ok(!r1.error, "cleanup run 1 " + JSON.stringify(r1.data ?? r1.error));
ok((await row(stale.id))?.source_type === "cleanup_due", "stale file marked due and delete requested");
ok(!(await row(noObj.id)), "stale row without object removed");
ok((await row(fresh.id))?.source_type === "message_pending", "fresh pending untouched");
ok((await row(linked.id))?.source_type === "message" && await exists(linked.path), "linked file untouched");
await new Promise((r) => setTimeout(r, 6000));
ok(!(await exists(stale.path)), "storage object deleted via Storage API");
const r2 = await a.rpc("run_file_cleanup"); ok(!r2.error, "cleanup run 2 (rerun safe)");
ok(!(await row(stale.id)), "row removed after object gone");
const r3 = await a.rpc("run_file_cleanup"); ok(!r3.error && (r3.data as any).requests === 0, "idempotent third run");
// authenticated users cannot run it
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await anon.auth.signInWithPassword({ email: "demo-teacher@rikaz.demo", password: "Demo-Rikaz-2026" });
ok(!!(await anon.rpc("run_file_cleanup")).error, "signed-in user cannot run cleanup");
const jobs = await a.from("file_cleanup_runs").select("id", { count: "exact", head: true }); ok((jobs.count ?? 0) >= 3, "run log recorded");
// cleanup test data
for (const f of [fresh, linked]) { await a.storage.from("rikaz-files").remove([f.path]); await a.from("files").delete().eq("id", f.id); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
