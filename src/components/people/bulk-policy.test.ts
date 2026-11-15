import { describe, expect, it, vi } from "vitest";
import { bulkActions, placeSelected } from "./bulk-policy";

describe("student bulk permissions", () => {
  it("bulk alone never authorizes manual logins", () => {
    expect(bulkActions("student", { bulk: true, accounts: false, tags_assign: false }, true, false)).not.toContain("login_create");
  });
  it("owner account capability and placement produce the four requested actions", () => {
    expect(bulkActions("student", { bulk: true, accounts: true, tags_assign: true }, true, true).slice(0, 4)).toEqual(["tag_add", "tag_remove", "login_create", "place"]);
  });
  it("independent placement does not grant tags or account creation", () => {
    expect(bulkActions("student", { bulk: false, accounts: false, tags_assign: false }, true, true)).toEqual(["place"]);
  });
  it("placement does not apply to guardian records", () => {
    expect(bulkActions("guardian", { bulk: true, accounts: false, tags_assign: false }, true, true)).toEqual([]);
  });
  it("reports each student and continues after refusal, without duplicate calls", async () => {
    const place = vi.fn(async (id: string) => { if (id === "foreign-school") throw Error("school denied"); });
    const result = await placeSelected(["first", "foreign-school", "last", "first"], place, (e) => String(e));
    expect(place.mock.calls.map(([id]) => id)).toEqual(["first", "foreign-school", "last"]);
    expect(result.map((r) => [r.id, r.status])).toEqual([["first", "ok"], ["foreign-school", "failed"], ["last", "ok"]]);
    expect(result[1]?.reason).toContain("school denied");
  });
});