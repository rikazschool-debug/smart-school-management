// Read-only exact comparison of protected scoped rows, their dependent rows, and shared ancestors.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { assertTestUrl, PROTECTED_ORGS, PROTECTED_SCHOOLS } from "./lib/cleanup-policy";
type Row = Record<string, unknown>;
type FK = { table: string; sql: string; target_schema: string };
const dir = process.argv[2], url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
assertTestUrl(url);
if (!dir || !url || !key) throw new Error("Verified baseline and test credentials required");
const schema = JSON.parse(readFileSync(join(dir, "data-schema.json"), "utf8")) as { tables: Record<string, { pk: string[] }>; foreign_keys: FK[] };
const baseline: Record<string, Row[]> = {}, selected: Record<string, Set<number>> = {};
const keepOrgs = new Set<string>(PROTECTED_ORGS), keepSchools = new Set<string>(PROTECTED_SCHOOLS);
for (const name of Object.keys(schema.tables)) {
  const text = gunzipSync(readFileSync(join(dir, name + ".ndjson.gz"))).toString();
  const rows: Row[] = text ? text.split("\n").filter(Boolean).map((s) => JSON.parse(s) as Row) : [];
  baseline[name] = rows; selected[name] = new Set();
  rows.forEach((r, i) => {
    if (keepOrgs.has(String(r["org_id"])) || keepSchools.has(String(r["school_id"])) ||
        (name === "organizations" && keepOrgs.has(String(r["id"]))) ||
        (name === "schools" && keepSchools.has(String(r["id"])))) selected[name]?.add(i);
  });
}
const unquote = (s: string) => s.trim().replace(/^"|"$/g, "").replaceAll('""', '"');
const relations = schema.foreign_keys.filter((f) => f.target_schema === "public").map((f) => {
  const m = /FOREIGN KEY \(([^)]+)\) REFERENCES (?:public\.)?("[^"]+"|\w+)\(([^)]+)\)/.exec(f.sql);
  if (!m?.[1] || !m[2] || !m[3]) throw new Error("Unparsed foreign key");
  return { child: f.table, parent: unquote(m[2]), cols: m[1].split(",").map(unquote), refs: m[3].split(",").map(unquote) };
});
const tuple = (r: Row, cols: string[]) => cols.some((c) => r[c] == null) ? null : JSON.stringify(cols.map((c) => r[c]));
// Descendants of scoped rows first. Shared ancestors are protected afterwards but do not spread
// protection into other organizations merely because they share an actor/profile/reference row.
for (const direction of ["descendants", "ancestors"]) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of relations) {
      const source = direction === "descendants" ? f.parent : f.child;
      const target = direction === "descendants" ? f.child : f.parent;
      const sourceCols = direction === "descendants" ? f.refs : f.cols;
      const targetCols = direction === "descendants" ? f.cols : f.refs;
      const keys = new Set([...selected[source] ?? []].map((i) => {
        const row = baseline[source]?.[i]; return row ? tuple(row, sourceCols) : null;
      }).filter((k) => k !== null));
      (baseline[target] ?? []).forEach((r, i) => {
        const k = tuple(r, targetCols);
        if (k !== null && keys.has(k) && !selected[target]?.has(i)) { selected[target]?.add(i); changed = true; }
      });
    }
  }
}
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
};
const admin = createClient(url, key, { auth: { persistSession: false } });
let checked = 0;
const differences: { table: string; changedOrMissing: number }[] = [];
for (const [table, chosen] of Object.entries(selected)) {
  if (!chosen.size) continue;
  const expected = [...chosen].map((i) => baseline[table]?.[i]).filter((r): r is Row => !!r);
  const current: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = admin.from(table).select("*");
    for (const column of schema.tables[table]?.pk ?? []) q = q.order(column);
    const r = await q.range(offset, offset + 999);
    if (r.error) throw new Error(`Protected read failed: ${table}`);
    current.push(...(r.data ?? []) as Row[]);
    if ((r.data ?? []).length < 1000) break;
  }
  const bag = new Map<string, number>();
  for (const row of current) { const k = canonical(row); bag.set(k, (bag.get(k) ?? 0) + 1); }
  let changed = 0;
  for (const row of expected) { const k = canonical(row), n = bag.get(k) ?? 0; if (!n) changed++; else bag.set(k, n - 1); }
  if (changed) differences.push({ table, changedOrMissing: changed });
  checked += expected.length;
}
writeFileSync(join(dir, "protected-verification.json"), JSON.stringify({ checked, differences, verified: differences.length === 0, at: new Date().toISOString() }, null, 2));
console.log("PROTECTED ROWS", checked, "changed/missing", differences.reduce((n, d) => n + d.changedOrMissing, 0), "tables with differences", differences.length);
if (differences.length) process.exitCode = 1;