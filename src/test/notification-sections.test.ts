import { describe, expect, it } from "vitest";
import { countsBySection, newArrivals, sectionForLink } from "@/lib/notification-sections";

const entries = [
  { key: "home", to: "/app" },
  { key: "communication", to: "/app/communication" },
  { key: "comm_groups", to: "/app/communication", tab: "groups" },
  { key: "circulars", to: "/app/circulars" },
  { key: "support", to: "/app/support" },
  { key: "admin", to: "/app/admin" },
  { key: "meetings", to: "/app/admin/meetings" },
];

describe("notification section counters", () => {
  it("routes a message link to communication", () => expect(sectionForLink("/app/communication?c=1", entries)).toBe("communication"));
  it("routes a groups tab link to the groups entry", () => expect(sectionForLink("/app/communication?tab=groups", entries)).toBe("comm_groups"));
  it("prefers the deeper menu entry", () => expect(sectionForLink("/app/admin/meetings/abc", entries)).toBe("meetings"));
  it("support ticket counts under support", () => expect(sectionForLink("/app/support/xyz", entries)).toBe("support"));
  it("links to hidden sections are not counted", () => expect(sectionForLink("/app/hr/payroll", entries)).toBeNull());
  it("home never collects counters", () => expect(sectionForLink("/app", entries)).toBeNull());
  it("groups ids per section", () => {
    const c = countsBySection([{ id: "a", link: "/app/circulars/1" }, { id: "b", link: "/app/circulars" }, { id: "c", link: null }], entries);
    expect(c).toEqual({ circulars: ["a", "b"] });
  });
  it("first load shows no pop-ups, later ones only for new ids", () => {
    expect(newArrivals(null, [{ id: "a" }])).toEqual([]);
    expect(newArrivals(new Set(["a"]), [{ id: "b" }, { id: "a" }])).toEqual([{ id: "b" }]);
  });
});
