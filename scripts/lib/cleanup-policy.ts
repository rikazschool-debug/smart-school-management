export const TEST_PROJECT = "czoaudsfbinpkwqsmhrd";
export const PROTECTED_ORGS = [
  "a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074",
  "916b6457-526a-48d0-b854-85547fb72305",
] as const;
export const PROTECTED_SCHOOLS = [
  "aa99cfdf-4a4f-40a9-9eee-7f3d57e7e427",
  "94274676-8c78-497b-8ea5-b762403c0e48",
  "cea2f42d-1d29-4218-9200-4d0ff11fc6ef",
  "de63e722-3005-4897-8f89-f13c47d94378",
  "55e0d4ad-032a-482c-898a-1dbc471ff574",
  "b288e170-113f-4e81-bc90-9d8143dfa6e0",
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertTestUrl(value: string | undefined) {
  if (!value || new URL(value).origin !== `https://${TEST_PROJECT}.supabase.co`) {
    throw new Error("Only the approved rikaz2027 project is allowed");
  }
}

export function assertCleanupTargets(ids: unknown, expected: number): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length !== expected || new Set(ids).size !== expected) {
    throw new Error("The exact approved target inventory is required");
  }
  for (const id of ids) {
    if (typeof id !== "string" || !UUID.test(id) || PROTECTED_ORGS.some((p) => p === id)) {
      throw new Error("Invalid or protected organization in cleanup inventory");
    }
  }
}

export function assertProtectedInventory(orgIds: string[], schoolIds: string[]) {
  if (!PROTECTED_ORGS.every((id) => orgIds.includes(id)) ||
      schoolIds.length !== PROTECTED_SCHOOLS.length ||
      !PROTECTED_SCHOOLS.every((id) => schoolIds.includes(id))) {
    throw new Error("Protected organizations or their six schools differ from the approved baseline");
  }
}

export type RestoreEvidence = {
  project: string; manifestSha256: string; schemaSha256: string;
  tables: number; rows: number; verified: boolean; publicForeignKeys: number;
  scope: "public-data-only";
};

export function assertRestoreEvidence(e: RestoreEvidence, manifestHash: string, schemaHash: string, tables: number, rows: number) {
  if (e.project !== TEST_PROJECT || e.manifestSha256 !== manifestHash || e.schemaSha256 !== schemaHash ||
      !e.verified || e.tables !== tables || e.rows !== rows || e.scope !== "public-data-only") {
    throw new Error("Exhaustive restore evidence does not match this backup");
  }
}