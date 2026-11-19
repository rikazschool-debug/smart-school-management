import { describe, expect, it } from "vitest";
import { pickNavKey } from "@/lib/page-meta";
const e = [{ key: "home", to: "/app" }, { key: "admin", to: "/app/admin" }, { key: "duties", to: "/app/admin/duties" }, { key: "communication", to: "/app/communication" }, { key: "comm_groups", to: "/app/communication", tab: "groups" }] as never;
describe("pickNavKey", () => {
  it("uses the most specific menu entry", () => { expect(pickNavKey("/app/admin/duties", e)).toBe("duties"); expect(pickNavKey("/app/admin/tasks/1", e)).toBe("admin"); });
  it("home only matches exactly", () => { expect(pickNavKey("/app/other", e)).toBeNull(); expect(pickNavKey("/app", e)).toBe("home"); });
  it("tab entries win only on their tab", () => { expect(pickNavKey("/app/communication", e, "groups")).toBe("comm_groups"); expect(pickNavKey("/app/communication", e)).toBe("communication"); });
});
