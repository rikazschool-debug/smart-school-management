export type BulkPermissions = { tags_assign: boolean; accounts: boolean; bulk: boolean };

export function bulkActions(kind: string, caps: BulkPermissions, hasTags: boolean, canPlace: boolean) {
  return [
    ...(caps.tags_assign && hasTags ? ["tag_add", "tag_remove"] : []),
    ...(caps.accounts && kind !== "employee" ? ["login_create"] : []),
    ...(kind === "student" && canPlace ? ["place"] : []),
    ...(caps.accounts ? ["account_off", "account_on", "org_login_off", "org_login_on"] : []),
  ];
}

export async function placeSelected(ids: string[], place: (id: string) => Promise<void>, describe: (error: unknown) => string) {
  const results: { id: string; status: "ok" | "failed"; reason: string | null }[] = [];
  for (const id of new Set(ids)) {
    try { await place(id); results.push({ id, status: "ok", reason: "تم التسكين" }); }
    catch (error) { results.push({ id, status: "failed", reason: describe(error) }); }
  }
  return results;
}