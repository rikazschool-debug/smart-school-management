import { useSyncExternalStore } from "react";

/** Whether the group owner is currently inside one school (opened from «إدارة المدارس») or on the group account. */
let inSchool = false;
const subs = new Set<() => void>();
export function setOwnerInSchool(v: boolean) {
  if (inSchool === v) return;
  inSchool = v;
  subs.forEach((f) => f());
}
export function useOwnerInSchool() {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => inSchool, () => false);
}
