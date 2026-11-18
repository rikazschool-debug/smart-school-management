export function matchesStaffDepartment(department: string | null, selected: ReadonlySet<string | null>): boolean {
  return selected.size === 0 || selected.has(department);
}