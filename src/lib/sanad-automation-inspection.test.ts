import { describe, expect, it } from "vitest";
import { failureAdvice, inspectRule, inspectRuns, inspectSimulation } from "./sanad-automation-inspection";

describe("read-only Sanad inspection", () => {
  it("keeps the 2000-SAR threshold and three-day wait unchanged", () => {
    const report = inspectRule({ event: "ds.finance", active: false, draft: { when: { var: "overdue", op: "gt", value: 2000 }, steps: [{ type: "wait", minutes: 4320 }, { type: "if", when: { var: "overdue", op: "gt", value: 2000 }, then: [{ type: "escalate" }], else: [{ type: "stop" }] }] } }, { variables: [{ event_code: "ds.finance", key: "overdue", label: "المتأخرات" }] });
    expect(report.condition).toBe("المتأخرات أكبر من 2000");
    expect(report.steps[0]?.minutes).toBe(4320);
    expect(report.steps.map((s) => s.type)).toEqual(["wait", "if", "escalate", "stop"]);
    expect(report.active).toBe(false);
  });
  it("does not turn a partial run page into full statistics", () => {
    const r = inspectRuns({ total: 50000, rows: [{ status: "done" }, { status: "dead", error: "no_recipient:group1" }] });
    expect(r.total).toBe(50000); expect(r.inspected).toBe(2); expect(r.sampled).toBe(true);
    expect(r.counts).toEqual({ done: 1, dead: 1 });
  });
  it("never exposes the simulation's record payloads in the summary", () => {
    const r = inspectSimulation({ ok: true, matched: 20, items: [{ ctx: { national_id: "sensitive-value" }, recipients: [{ none: true, eligible: 0, conflicts: 2, would_defer: 3 }] }], preview: [{ wa_missing: ["student_name"] }] });
    expect(r.noRecipient).toBe(1); expect(r.conflicts).toBe(2); expect(r.deferred).toBe(3); expect(r.missingVariables).toBe(1);
    expect(JSON.stringify(r)).not.toContain("sensitive-value");
  });
  it("does not recommend automatic retries after unknown delivery", () => {
    expect(failureAdvice("network:unknown")).toContain("لا تُعد المحاولة تلقائيًا");
  });
  it("does not invent a recipient fallback or force a false condition", () => {
    expect(failureAdvice("no_recipient:group1")).toContain("لا يُختار شخص عشوائي");
    expect(failureAdvice("rule condition false")).toContain("لا تعِد تشغيله");
  });
});