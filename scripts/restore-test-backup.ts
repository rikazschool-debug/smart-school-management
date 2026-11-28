// Exhaustive PUBLIC DATA restore into isolated PostgreSQL/WASM, never the connected database.
// Auth users, Storage binaries, functions/triggers/RLS and Vault are not restored; do not call this a full project backup.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { TEST_PROJECT } from "./lib/cleanup-policy";

const dir = process.argv[2];
if (!dir) throw new Error("Backup directory required");
const manifestRaw = readFileSync(join(dir, "manifest.json"));
const schemaRaw = readFileSync(join(dir, "data-schema.json"));
const manifest = JSON.parse(manifestRaw.toString()) as { project: string; tables: Record<string, { rows: number; expected: number; sha256: string; error?: string }> };
type Table = { columns: { name: string; type: string; not_null: boolean }[]; pk: string[] };
const schema = JSON.parse(schemaRaw.toString()) as { enums: Record<string, string[]>; tables: Record<string, Table>; foreign_keys: { table: string; name: string; sql: string; target_schema: string }[] };
if (!manifest.project.includes(TEST_PROJECT)) throw new Error("Not the approved test backup");
if (JSON.stringify(Object.keys(manifest.tables).sort()) !== JSON.stringify(Object.keys(schema.tables).sort())) throw new Error("Incomplete table inventory");
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const db = new PGlite();
let rows = 0;
try {
  for (const [name, labels] of Object.entries(schema.enums)) {
    await db.exec(`CREATE TYPE public.${quote(name)} AS ENUM (${labels.map((v) => "'" + v.replaceAll("'", "''") + "'").join(",")});`);
  }
  for (const [name, t] of Object.entries(schema.tables)) {
    await db.exec(`CREATE TABLE public.${quote(name)} (${t.columns.map((c) => `${quote(c.name)} ${c.type}${c.not_null ? " NOT NULL" : ""}`).join(",")}${t.pk.length ? `, PRIMARY KEY (${t.pk.map(quote).join(",")})` : ""});`);
  }
  for (const [name, entry] of Object.entries(manifest.tables)) {
    const bytes = readFileSync(join(dir, name + ".ndjson.gz"));
    if (entry.error || entry.rows !== entry.expected || hash(bytes) !== entry.sha256) throw new Error(`Invalid backup: ${name}`);
    const text = gunzipSync(bytes).toString("utf8");
    const records = text ? text.split("\n").filter(Boolean).map((s) => JSON.parse(s) as unknown) : [];
    if (records.length !== entry.rows) throw new Error(`Row count differs: ${name}`);
    const table = `public.${quote(name)}`;
    for (let offset = 0; offset < records.length; offset += 500) {
      await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`, [JSON.stringify(records.slice(offset, offset + 500))]);
    }
    // Compare typed row multisets (including duplicates) rather than a row-count sample.
    const result = await db.query<{ differences: number }>(`WITH expected AS (SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)), diff AS ((SELECT * FROM ${table} EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM ${table})) SELECT count(*)::int AS differences FROM diff`, [JSON.stringify(records)]);
    if (result.rows[0]?.differences !== 0) throw new Error(`Restored values differ: ${name}`);
    rows += records.length;
    console.log("RESTORED", name, records.length);
  }
  const fks = schema.foreign_keys.filter((fk) => fk.target_schema === "public");
  for (const fk of fks) await db.exec(`ALTER TABLE public.${quote(fk.table)} ADD CONSTRAINT ${quote(fk.name)} ${fk.sql};`);
  const evidence = { project: TEST_PROJECT, manifestSha256: hash(manifestRaw), schemaSha256: hash(schemaRaw), tables: Object.keys(schema.tables).length, rows, publicForeignKeys: fks.length, verified: true, scope: "public-data-only", verifiedAt: new Date().toISOString(), excluded: ["auth", "storage binaries", "Vault", "functions/triggers/RLS"] };
  writeFileSync(join(dir, "restore-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("VERIFIED", evidence.tables, rows, "public FKs", fks.length);
} finally { await db.close(); }