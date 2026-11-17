import { describe, expect, it } from "vitest";
import { actMissing, evidenceText, overdue } from "@/components/supervision/act-model";

const full = { evidence: "متوسط المهارة منخفض في التشخيصي", target_kind: "students", section_ids: [], student_ids: ["s1"], goals: "رفع الإتقان", indicators: [{ label: "متوسط المهارة", baseline: "50٪", target: "70٪" }], due_on: "2026-12-15", owner_id: "u1" };

describe("improvement action completeness (mirrors _sv5_act_missing)", () => {
  it("a complete action has nothing missing", () => expect(actMissing(full)).toEqual([]));
  it("an indicator without a baseline blocks submit", () => expect(actMissing({ ...full, indicators: [{ label: "x", baseline: "", target: "70" }] })).toEqual(["المؤشرات مع خط الأساس والمستهدف"]));
  it("targeting students needs at least one student", () => expect(actMissing({ ...full, student_ids: [] })).toEqual(["الطلاب المستهدفون"]));
  it("targeting classes needs at least one class", () => expect(actMissing({ ...full, target_kind: "sections" })).toEqual(["الفصول المستهدفة"]));
  it("no responsible person or date blocks submit", () => expect(actMissing({ ...full, owner_id: null, due_on: null })).toEqual(["الموعد", "المسؤول"]));
});

describe("overdue and evidence", () => {
  it("overdue only while execution is open", () => {
    expect(overdue({ status: "running", due_on: "2026-11-01" }, "2026-11-17")).toBe(true);
    expect(overdue({ status: "done", due_on: "2026-11-01" }, "2026-11-17")).toBe(false);
    expect(overdue({ status: "running", due_on: "2026-11-17" }, "2026-11-17")).toBe(false);
  });
  it("evidence keeps «لم يُقس» separate and has no mean without results", () => {
    const t = evidenceText({ targeted: 12, present: 0, absent: 1, exempt: 0, missing: 11, mean: null, mean_pct: null, small_sample: true, mastery: null }, 20);
    expect(t).toContain("لم يُقس 11"); expect(t).not.toContain("المتوسط");
  });
});
