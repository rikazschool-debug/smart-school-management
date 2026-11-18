import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { assignmentChange, refreshStaffAssignment } from "@/lib/staff-assignment";

it("refreshes both staff directories and the selected employee file from the saved assignment", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  let persisted = "الإشراف";
  const keys = [["hr-prof", "e1"], ["staff-directory", "branch-a"], ["staff-directory", "branch-b"], ["staff-extra", "branch-a", "t"]];
  for (const key of keys) client.setQueryData(key, persisted);
  client.setQueryData(["hr-prof", "e2"], "التنسيق");
  const observers = keys.map((queryKey) => new QueryObserver(client, { queryKey, queryFn: async () => persisted }));
  const stops = observers.map((observer) => observer.subscribe(() => {}));
  try {
    persisted = "وكيل المرحلة";
    await refreshStaffAssignment(client, ["e1"]);
    for (const key of keys) expect(client.getQueryData(key)).toBe("وكيل المرحلة");
    expect(client.getQueryState(["hr-prof", "e2"])?.isInvalidated).toBe(false);
  } finally { stops.forEach((stop) => stop()); client.clear(); }
});

it("does not overwrite an assignment when another profile field is edited", () => {
  expect(assignmentChange("الإشراف", "الإشراف")).toEqual({});
});

it("saves a changed assignment and distinguishes clearing from leaving it unchanged", () => {
  expect(assignmentChange("  التنسيق  ", "الإشراف")).toEqual({ assignment_note: "التنسيق" });
  expect(assignmentChange("", "الإشراف")).toEqual({ assignment_note: "" });
});
