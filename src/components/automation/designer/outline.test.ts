import { describe, expect, it } from "vitest";
import { compile, type GEdge, type GNode } from "./flow";
import { outline, removeStep } from "./outline";

const n = (id: string, kind: GNode["kind"], data: Record<string, unknown> = {}): GNode => ({ id, kind, data, x: 0, y: 0 });
const e = (source: string, handle: string, target: string): GEdge => ({ id: `${source}-${handle}-${target}`, source, handle, target });
const notify = { title: "تنبيه", recipients: ["guardian"] };

describe("step-by-step outline", () => {
  it("lists a linear flow in order and indents branches under their handle", () => {
    const nodes = [n("t", "trigger"), n("a", "notify", notify), n("i", "if", { when: { var: "overdue", op: "gt", value: 1 } }), n("y", "notify", notify), n("z", "stop"), n("b", "wait", { minutes: 60 })];
    const edges = [e("t", "out", "a"), e("a", "out", "i"), e("i", "then", "y"), e("i", "else", "z"), e("i", "next", "b")];
    expect(outline(nodes, edges)).toEqual([
      { id: "t", depth: 0 }, { id: "a", depth: 0 }, { id: "i", depth: 0 },
      { id: "y", depth: 1, branch: "إذا تحقق" }, { id: "z", depth: 1, branch: "إذا لم يتحقق" }, { id: "b", depth: 0 },
    ]);
  });
  it("marks unconnected steps as orphans and survives cycles", () => {
    const nodes = [n("t", "trigger"), n("a", "notify", notify), n("o", "stop")];
    const rows = outline(nodes, [e("t", "out", "a"), e("a", "out", "t")]);
    expect(rows.map((r) => r.id)).toEqual(["t", "a", "o"]);
    expect(rows[2]).toEqual({ id: "o", depth: 0, orphan: true });
  });
  it("deleting a middle step reconnects its neighbours and still compiles to the same engine shape", () => {
    const nodes = [n("t", "trigger"), n("a", "notify", notify), n("m", "wait", { minutes: 60 }), n("b", "notify", notify)];
    const edges = [e("t", "out", "a"), e("a", "out", "m"), e("m", "out", "b")];
    const r = removeStep(nodes, edges, "m");
    expect(r.nodes.map((x) => x.id)).toEqual(["t", "a", "b"]);
    expect(r.edges.map((x) => `${x.source}>${x.target}`)).toEqual(["t>a", "a>b"]);
    expect(compile(r.nodes, r.edges).def.steps.map((s) => s.type)).toEqual(["notify", "notify"]);
  });
  it("never deletes the trigger", () => {
    const nodes = [n("t", "trigger")];
    expect(removeStep(nodes, [], "t").nodes).toHaveLength(1);
  });
});
