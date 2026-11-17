import { describe, expect, it } from "vitest";
import { canCreate, fromRiyadhInput, missingFields, shown, svSearch, toRiyadhInput, type SvSpec } from "@/components/supervision/model";

const spec: SvSpec = { create: ["supervisor"], sections: [{ title: "a", fields: [
  { key: "kind", label: "النوع", type: "select", required: true, options: ["أ", "ب"] },
  { key: "why", label: "السبب", type: "textarea", required: true, when: { field: "kind", eq: "ب" } },
  { key: "ev", label: "الدليل", type: "textarea", required: true, when: { field: "kind", in: ["أ"] } },
  { key: "goals", label: "الأهداف", type: "goals", required: true },
  { key: "acts", label: "الإجراءات", type: "actions", required: true },
  { key: "obs", label: "المؤشرات", type: "indicators", required: true, items: [{ code: "o1", label: "م1" }, { code: "o2", label: "م2" }] },
  { key: "note", label: "ملاحظة", type: "textarea" },
] }] };

describe("supervision missingFields (mirrors private._sv_missing)", () => {
  it("stage-3 goals require description, indicator, owner and deadline but no arbitrary numeric target", () => {
    const plan: SvSpec = { sv3_plan: true, sections: [{ title: "أهداف", fields: [{ key: "goals", label: "الأهداف", type: "goals", required: true }] }] };
    expect(missingFields(plan, { goals: [{ goal: "تنويع التقويم", indicator: "شاهد صفّي", owner: "المشرف", due: "2026-12-01" }] })).toEqual([]);
    expect(missingFields(plan, { goals: [{ goal: "تنويع التقويم", indicator: "شاهد صفّي", owner: "", due: "2026-12-01" }] })).toHaveLength(1);
  });
  it("lists every required item of an empty draft, skipping hidden conditional fields", () => {
    expect(missingFields(spec, {})).toEqual(["النوع", "الأهداف", "الإجراءات", "المؤشرات: م1", "المؤشرات: م2"]);
  });
  it("conditional field becomes required only when its condition holds", () => {
    expect(missingFields(spec, { kind: "ب" })).toContain("السبب");
    expect(missingFields(spec, { kind: "ب" })).not.toContain("الدليل");
    expect(missingFields(spec, { kind: "أ" })).toContain("الدليل");
  });
  it("a goal needs indicator, baseline and target; an action needs owner, due and evidence", () => {
    const m = missingFields(spec, { goals: [{ goal: "رفع", indicator: "نسبة", baseline: "", target: "80" }], acts: [{ action: "ورشة", owner: "س", due: "2026-12-01", evidence: "" }] });
    expect(m).toContain("الأهداف 1: الهدف والمؤشر وخط الأساس والمستهدف");
    expect(m).toContain("الإجراءات 1: الإجراء والمسؤول والموعد والشاهد");
  });
  it("«لم يُلاحظ» counts as answered; «لا ينطبق» needs a reason", () => {
    const m = missingFields(spec, { obs: { o1: { state: "nl" }, o2: { state: "na" } } });
    expect(m).not.toContain("المؤشرات: م1");
    expect(m).toContain("المؤشرات: سبب «لا ينطبق» في م2");
  });
  it("a complete record has nothing missing", () => {
    expect(missingFields(spec, { kind: "ب", why: "س", goals: [{ goal: "g", indicator: "i", baseline: "40", target: "60" }], acts: [{ action: "a", owner: "o", due: "2026-12-01", evidence: "e" }], obs: { o1: { level: "متمكن" }, o2: { state: "na", reason: "لا يوجد" } } })).toEqual([]);
  });
  it("shown() hides fields whose condition is not met", () => { expect(shown(spec.sections[0]!.fields[1]!, { kind: "أ" })).toBe(false); });
});

describe("create rights mirror sv_rec_save", () => {
  const sc = { id: "s", name: "x", principal: false, can_assign: false, supervisor: true, teacher: false, dept_head: false, approver: false };
  it("supervisor with live assignment may create supervisor forms", () => { expect(canCreate(spec, sc)).toBe(true); });
  it("principal alone may not create a supervisor-only form", () => { expect(canCreate(spec, { ...sc, supervisor: false, principal: true })).toBe(false); });
  it("embedded forms are never created standalone", () => { expect(canCreate({ ...spec, embedded: true }, sc)).toBe(false); });
});

describe("Riyadh time inputs", () => {
  it("round-trips 08:00 Riyadh as 05:00 UTC", () => {
    expect(fromRiyadhInput("2026-11-17T08:00")).toBe("2026-11-17T05:00:00.000Z");
    expect(toRiyadhInput("2026-11-17T05:00:00.000Z")).toBe("2026-11-17T08:00");
  });
  it("search accepts only known tabs and uuid ids", () => { expect(svSearch({ tab: "x", id: "1" })).toEqual({}); });
});
