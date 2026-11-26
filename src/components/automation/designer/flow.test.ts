import { describe, expect, it } from "vitest";
import { canonPath, compile, decompile, type GEdge, type GNode } from "./flow";

const n = (id: string, kind: GNode["kind"], data: Record<string, unknown> = {}): GNode => ({ id, kind, data, x: 0, y: 0 });
const e = (source: string, handle: string, target: string): GEdge => ({ id: `${source}-${handle}`, source, handle, target });
const notify = { title: "تكليف متأخر", recipients: ["assigner"] };
const overdue = { var: "days_overdue", op: "gt", value: 0 };

describe("designer compile", () => {
  it("builds the overdue-task workflow in engine order", () => {
    const nodes = [n("t", "trigger"), n("f", "filter", { when: overdue }), n("a", "notify", notify), n("w", "wait", { minutes: 1440 }),
      n("i", "if", { when: overdue }), n("k", "task", { title: "متابعة", assignee: "principal", due_in_days: 2 }), n("s1", "stop"), n("s2", "stop")];
    const edges = [e("t", "out", "f"), e("f", "out", "a"), e("a", "out", "w"), e("w", "out", "i"), e("i", "then", "k"), e("k", "out", "s1"), e("i", "else", "s2")];
    const r = compile(nodes, edges);
    expect(r.issues.filter((x) => x.level === "error")).toEqual([]);
    expect(r.def.when).toEqual(overdue);
    expect(r.def.steps.map((s) => s.type)).toEqual(["notify", "wait", "if"]);
    expect((r.def.steps[2] as unknown as { then: { type: string }[] }).then.map((s) => s.type)).toEqual(["task", "stop"]);
    expect((r.def.steps[2] as unknown as { else: { type: string }[] }).else.map((s) => s.type)).toEqual(["stop"]);
  });
  it("rejects a loop back to an earlier element", () => {
    const r = compile([n("t", "trigger"), n("a", "notify", notify), n("b", "notify", notify)], [e("t", "out", "a"), e("a", "out", "b"), e("b", "out", "a")]);
    expect(r.issues.some((x) => x.level === "error")).toBe(true);
  });
  it("rejects an element that is not connected", () => {
    const r = compile([n("t", "trigger"), n("a", "notify", notify), n("x", "stop")], [e("t", "out", "a")]);
    expect(r.issues.some((x) => x.node === "x" && x.level === "error")).toBe(true);
  });
  it("rejects parallel with a single branch", () => {
    const r = compile([n("t", "trigger"), n("p", "parallel"), n("a", "notify", notify)], [e("t", "out", "p"), e("p", "b0", "a")]);
    expect(r.issues.some((x) => x.node === "p")).toBe(true);
  });
  it("rejects more than 15 steps", () => {
    const nodes = [n("t", "trigger"), ...Array.from({ length: 16 }, (_, i) => n(`a${i}`, "notify", notify))];
    const edges = [e("t", "out", "a0"), ...Array.from({ length: 15 }, (_, i) => e(`a${i}`, "out", `a${i + 1}`))];
    expect(compile(nodes, edges).issues.some((x) => x.msg.includes("15"))).toBe(true);
  });
  it("requires a title and recipients on notifications", () => {
    const r = compile([n("t", "trigger"), n("a", "notify", { title: "", recipients: [] })], [e("t", "out", "a")]);
    expect(r.issues.filter((x) => x.node === "a").length).toBe(2);
  });
  it("round-trips an engine definition through the graph", () => {
    const def = { when: overdue, steps: [{ type: "notify", ...notify }, { type: "parallel", branches: [[{ type: "reminder", title: "تذكير", recipients: ["assignee"] }], [{ type: "escalate", to: "principal", title: "تصعيد" }]] }, { type: "stop" }] };
    const g = decompile(def);
    expect(compile(g.nodes, g.edges).def).toEqual(def);
    expect(g.nodes.map((x) => x.id)).toContain("0.1b1.0");
  });
});

describe("trace path to node id", () => {
  it("folds wait continuations and cap deferrals", () => {
    expect(canonPath("0.3w.1")).toBe("0.5");
    expect(canonPath("0.3w.0t.0")).toBe("0.4t.0");
    expect(canonPath("0.3w.1w.0")).toBe("0.6");
    expect(canonPath("c0.2")).toBe("0.2");
    expect(canonPath("0.1b0.0")).toBe("0.1b0.0");
  });
  it("round-trips phase D operational steps without losing nested failure/timeout paths", () => {
    const steps = [
      { type: "mt_request", key: "req", title: "فحص", description: "وصف العطل", place: "المبنى", category: "c1", on_fail: [{ type: "notify", title: "تعذر", recipients: ["principal"] }] },
      { type: "wait_until", when: { var: "out_req_status", op: "in", value: ["completed"] }, every_minutes: 15, max_minutes: 60, timeout: [{ type: "escalate", title: "متأخر", to: "principal" }] },
      { type: "report", key: "rep", title: "تقرير", source: "rep.attendance_week", share: [{ by: "role", role: "principal" }] },
    ];
    const g = decompile({ when: null, steps });
    expect(g.nodes.map((x) => x.kind)).toEqual(["trigger", "mt_request", "wait_until", "report"]);
    const r = compile(g.nodes, g.edges);
    expect(r.issues.filter((x) => x.level === "error")).toEqual([]);
    expect(r.def.steps).toEqual(steps);
  });
  it("maps wait-until rounds back onto the same step", () => {
    expect(canonPath("0.1u.0")).toBe("0.1");
    expect(canonPath("0.1u.1")).toBe("0.2");
  });
});
