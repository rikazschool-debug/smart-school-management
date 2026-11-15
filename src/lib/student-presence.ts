/** Presentation-only grouping of the existing academic status; never daily attendance. */
export const STUDENT_PRESENCE = [
  { value: "present", label: "موجود" },
  { value: "absent", label: "غير موجود" },
];
export const STUDENT_PRESENCE_VALUES: Record<string, string[]> = {
  present: ["active"],
  absent: ["transferred", "graduated", "withdrawn"],
};
export function studentPresence(status: unknown) {
  if (status === "active") return "موجود";
  return typeof status === "string" && STUDENT_PRESENCE_VALUES.absent?.includes(status) ? "غير موجود" : "—";
}