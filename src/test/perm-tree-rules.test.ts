import { describe, expect, it } from "vitest";
import { baseAction, type PermSec } from "@/components/perm-tree";

describe("explicit permission selection", () => {
  it("family section selection grants view, never placement or record edit", () => {
    const s: PermSec = { key: "people_family", label: "", parent: "school_admin", actions: ["view", "edit", "place"], scopes: ["branch", "org"] };
    expect(baseAction(s)).toBe("view");
  });
  it("locked academic authority cannot be granted by selecting its section", () => {
    expect(baseAction({ key: "academic_setup_info", label: "", parent: "school_admin", actions: ["view"], scopes: ["branch"], locked_reason: "principal only" })).toBeNull();
  });
});