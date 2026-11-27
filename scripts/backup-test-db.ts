// Full data backup of the TEST database (public schema) to gzipped NDJSON, one file per table, plus a manifest with
// exact row counts and sha256. Reads with the service role, paged in primary-key order. Refuses any other project.
// Usage: bun scripts/backup-test-db.ts <tables.json> <outDir>
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { gzipSync } from "zlib";
import { createHash } from "crypto";
const URL = process.env["SUPABASE_URL"]!;
if (!URL.includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database (rikaz2027) only");
const admin: any = createClient(URL, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const [tablesFile, out] = process.argv.slice(2) as [string, string];
const tables = JSON.parse(readFileSync(tablesFile, "utf8")) as Record<string, string[]>;
mkdirSync(out, { recursive: true });
const manifest: Record<string, { rows: number; expected: number | null; sha256: string; error?: string }> = {};
const only = process.env["ONLY"]?.split(",");
for (const [t, pk] of Object.entries(tables)) {
  if (only && !only.includes(t)) continue;
  const lines: string[] = []; let err: string | undefined;
  const cnt = await admin.from(t).select("*", { count: "exact", head: true });
  for (let from = 0; ; from += 1000) {
    let q = admin.from(t).select("*"); for (const c of pk) q = q.order(c, { ascending: true });
    const r = await q.range(from, from + 999);
    if (r.error) { err = r.error.message; break; }
    for (const row of r.data) lines.push(JSON.stringify(row));
    if (r.data.length < 1000) break;
  }
  const buf = gzipSync(Buffer.from(lines.join("\n"), "utf8"));
  writeFileSync(`${out}/${t}.ndjson.gz`, buf);
  manifest[t] = { rows: lines.length, expected: cnt.count ?? null, sha256: createHash("sha256").update(buf).digest("hex"), ...(err ? { error: err } : {}) };
}
writeFileSync(`${out}/manifest.json`, JSON.stringify({ project: "rikaz2027 (czoaudsfbinpkwqsmhrd)", taken_at: new Date().toISOString(), tables: manifest }, null, 1));
const bad = Object.entries(manifest).filter(([, m]) => m.error || (m.expected !== null && m.expected !== m.rows));
console.log("tables", Object.keys(manifest).length, "rows", Object.values(manifest).reduce((a, m) => a + m.rows, 0), "mismatch/error", bad.length);
for (const [t, m] of bad) console.log(" ", t, JSON.stringify(m));
