import { describe, expect, it } from "vitest";
import { assertCleanupTargets, assertProtectedInventory, assertRestoreEvidence, assertTestUrl, PROTECTED_ORGS, PROTECTED_SCHOOLS, TEST_PROJECT } from "../../scripts/lib/cleanup-policy";

describe("approved test cleanup boundaries", () => {
  it("accepts only the exact rikaz2027 origin, not a substring or production host", () => {
    expect(() => assertTestUrl(`https://${TEST_PROJECT}.supabase.co`)).not.toThrow();
    expect(() => assertTestUrl(`https://${TEST_PROJECT}.supabase.co.attacker.invalid`)).toThrow();
    expect(() => assertTestUrl("https://production.supabase.co")).toThrow();
  });
  it("requires exactly the 149 unique approved identifiers", () => {
    const ids = Array.from({ length: 149 }, (_, i) => `00000000-0000-4000-8000-${i.toString().padStart(12, "0")}`);
    expect(() => assertCleanupTargets(ids, 149)).not.toThrow();
    expect(() => assertCleanupTargets(ids.slice(0, 139), 149)).toThrow();
    expect(() => assertCleanupTargets([...ids.slice(0, 148), ids[0]], 149)).toThrow();
  });
  it.each(PROTECTED_ORGS)("never includes protected organization %s", (id) => {
    expect(() => assertCleanupTargets([id], 1)).toThrow();
  });
  it("protects all four Malki and both Rikaz schools by identifier", () => {
    expect(() => assertProtectedInventory([...PROTECTED_ORGS], [...PROTECTED_SCHOOLS])).not.toThrow();
    for (const id of PROTECTED_SCHOOLS) {
      expect(() => assertProtectedInventory([...PROTECTED_ORGS], PROTECTED_SCHOOLS.filter((s) => s !== id))).toThrow();
    }
  });
  it("rejects partial restoration or evidence for a different backup", () => {
    const evidence = { project: TEST_PROJECT, manifestSha256: "manifest", schemaSha256: "schema", tables: 474, rows: 90047, verified: true, publicForeignKeys: 700, scope: "public-data-only" as const };
    expect(() => assertRestoreEvidence(evidence, "manifest", "schema", 474, 90047)).not.toThrow();
    expect(() => assertRestoreEvidence({ ...evidence, tables: 7 }, "manifest", "schema", 474, 90047)).toThrow();
    expect(() => assertRestoreEvidence(evidence, "another-manifest", "schema", 474, 90047)).toThrow();
    expect(() => assertRestoreEvidence({ ...evidence, verified: false }, "manifest", "schema", 474, 90047)).toThrow();
  });
});