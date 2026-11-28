// Read-only preflight. Destructive cleanup is submitted through an approved administrative migration,
// never this script: the old per-table path could leave partial deletions when an immutable record blocked purge.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { assertCleanupTargets, assertProtectedInventory, assertRestoreEvidence, assertTestUrl, PROTECTED_ORGS, type RestoreEvidence } from "./lib/cleanup-policy";
const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
assertTestUrl(url);
if (!url || !key) throw new Error("Test credentials unavailable");
const dir = process.argv[2];
if (!dir) throw new Error("Verified backup directory required; this script never deletes data");
const targets: unknown = JSON.parse(readFileSync(join(dir, "targets.json"), "utf8"));
assertCleanupTargets(targets, 149);
const hash = (name: string) => createHash("sha256").update(readFileSync(join(dir, name))).digest("hex");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { tables: Record<string, { rows: number }> };
const evidence = JSON.parse(readFileSync(join(dir, "restore-evidence.json"), "utf8")) as RestoreEvidence;
assertRestoreEvidence(evidence, hash("manifest.json"), hash("data-schema.json"), Object.keys(manifest.tables).length, Object.values(manifest.tables).reduce((n, t) => n + t.rows, 0));
const admin = createClient(url, key, { auth: { persistSession: false } });
const orgs = await admin.from("organizations").select("id,name").order("id").range(0, 999);
const schools = await admin.from("schools").select("id").in("org_id", [...PROTECTED_ORGS]);
if (orgs.error || schools.error) throw new Error("Inventory read failed");
assertProtectedInventory((orgs.data ?? []).map((o) => o.id), (schools.data ?? []).map((s) => s.id));
const remaining = (orgs.data ?? []).filter((o) => !PROTECTED_ORGS.some((id) => id === o.id));
if (remaining.some((o) => !targets.includes(o.id))) throw new Error("Unapproved new organization detected");
const results = [];
for (const o of remaining) {
  const finance = await admin.from("sf_events").select("*", { count: "exact", head: true }).eq("org_id", o.id);
  const adms = await admin.from("adms_events").select("*", { count: "exact", head: true }).eq("org_id", o.id);
  if (finance.error || adms.error) throw new Error("Protected-history check failed");
  results.push({ id: o.id, financialHistory: finance.count ?? 0, admsHistory: adms.count ?? 0 });
}
writeFileSync(join(dir, "preflight.json"), JSON.stringify({ readOnly: true, approved: targets.length, remaining: results }, null, 2));
console.log("READ ONLY", "approved", targets.length, "remaining", results.length, "financial blockers", results.filter((r) => r.financialHistory > 0).length, "security blockers", results.filter((r) => r.admsHistory > 0).length);
