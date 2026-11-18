import type { QueryClient } from "@tanstack/react-query";

/** Both screens read the same HR field. Invalidate rather than copying possibly restricted profile data into another cache. */
export async function refreshStaffAssignment(qc: QueryClient, employeeIds: readonly string[]) {
  await Promise.all([
    ...employeeIds.map((id) => qc.invalidateQueries({ queryKey: ["hr-prof", id], exact: true })),
    qc.invalidateQueries({ queryKey: ["staff-directory"] }),
    qc.invalidateQueries({ queryKey: ["staff-extra"] }),
  ]);
}

/** An unrelated profile edit must not write back the assignment it originally opened with. */
export function assignmentChange(value: string, initial: string): { assignment_note?: string } {
  const next = value.trim();
  return next === initial.trim() ? {} : { assignment_note: next };
}
