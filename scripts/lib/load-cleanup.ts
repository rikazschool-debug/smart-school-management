// Cleanup for load/perf runs that create thousands of synthetic rows. A single delete of a 50k-row school times out
// and the old `.catch(() => {})` hid it, leaving ~136k students that slowed RLS reads for every later test.
// Deletes students in small chunks (removing the referencing synthetic rows each FK names; protected financial history
// is never bypassed), then purges the org through TestRun. Failures are printed loudly and returned, never swallowed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export async function chunkDeleteStudents(admin: Any, schools: string[], label = ""): Promise<{ removed: number; error?: string }> {
  let removed = 0;
  for (;;) {
    const ids = ((await admin.from("students").select("id").in("school_id", schools).limit(200)).data ?? []).map((s: Any) => s.id as string);
    if (!ids.length) return { removed };
    for (const t of ["attendance_days", "enrollments", "student_guardians", "sf_obligations"]) await admin.from(t).delete().in("student_id", ids);
    let d = await admin.from("students").delete().in("id", ids);
    for (let i = 0; d.error && i < 12; i++) {
      const t = /on table "(\w+)"$/.exec(d.error.message)?.[1]; if (!t || t === "students") break;
      const x = await admin.from(t).delete().in("student_id", ids); if (x.error) return { removed, error: `${t}: ${x.error.message}` };
      d = await admin.from("students").delete().in("id", ids);
    }
    if (d.error) { console.error(`[load-cleanup ${label}] students:`, d.error.message); return { removed, error: d.error.message }; }
    removed += ids.length;
  }
}
/** Chunked student delete + TestRun.purgeOrg; returns an error text (also printed) instead of hiding it. */
export async function purgeLoadOrg(admin: Any, tr: Any, org: string): Promise<string | null> {
  const schools = ((await admin.from("schools").select("id").eq("org_id", org)).data ?? []).map((s: Any) => s.id as string);
  const st = schools.length ? await chunkDeleteStudents(admin, schools, org) : { removed: 0 };
  try { await tr.purgeOrg(org); } catch (e) { const m = (e as Error).message; console.error(`[load-cleanup] purge ${org} failed: ${m}`); return m; }
  return st.error ?? null;
}
