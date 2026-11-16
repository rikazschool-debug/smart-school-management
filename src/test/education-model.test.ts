import { describe, expect, it } from "vitest";
import { goalDone, planProgress, type Follow } from "@/components/education/model";
const follow = (completed: boolean): Follow => ({ id: "follow", goal_index: 0, completed, note: "متابعة", actor_name: "مشرف", created_at: "2026-11-16T08:00:00Z" });
describe("remedial plan completion", () => {
  it("starts with no completed goals", () => { expect(planProgress(["قراءة", "كتابة"], [])).toEqual({ done: 0, total: 2 }); });
  it("records later achievement against its numbered goal", () => { expect(goalDone([follow(true)], 0)).toBe(true); expect(goalDone([follow(true)], 1)).toBe(false); });
  it("uses the latest follow-up when achievement is reopened", () => { expect(goalDone([follow(true), follow(false)], 0)).toBe(false); });
});