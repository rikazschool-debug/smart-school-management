export type SchoolChoice = { id: string; create: boolean };

export function employeeSchoolDefault(schools: SchoolChoice[], activeSchool: string | null): string {
  const allowed = schools.filter((school) => school.create);
  if (allowed.some((school) => school.id === activeSchool)) return activeSchool ?? "";
  return allowed.length === 1 ? allowed[0]?.id ?? "" : "";
}