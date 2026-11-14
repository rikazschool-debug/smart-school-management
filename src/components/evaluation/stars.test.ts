import { describe, expect, it } from "vitest";
import { scoreOf } from "./stars";

const items = [{ code: "a", text: "a", weight: 2 }, { code: "b", text: "b" }, { code: "c", text: "c" }];
describe("evaluation score", () => {
  it("excludes «can't rate» and unanswered items instead of counting zero", () => {
    expect(scoreOf(items, { a: "na", b: 4 })).toEqual({ answered: 1, total: 3, avg: 4 });
  });
  it("applies declared weights", () => {
    expect(scoreOf(items, { a: 5, b: 2, c: 2 }).avg).toBe(3.5);
  });
  it("has no score without answers", () => {
    expect(scoreOf(items, { a: "na" }).avg).toBeNull();
  });
});
