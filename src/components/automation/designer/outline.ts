// Step-by-step view of the SAME graph the canvas edits: no second model, no second compiler.
import { HANDLES, HANDLE_LABEL, type GEdge, type GNode } from "./flow";

export type OutlineRow = { id: string; depth: number; branch?: string; orphan?: boolean };

/** Walk from the trigger in engine order: a step's own handles first (branches indented), then "next". Unreached nodes are listed last as orphans. */
export function outline(nodes: GNode[], edges: GEdge[]): OutlineRow[] {
  const by = new Map(nodes.map((n) => [n.id, n]));
  const out: OutlineRow[] = [];
  const seen = new Set<string>();
  const visit = (id: string | undefined, depth: number, branch?: string) => {
    let cur = id, label = branch, d = depth;
    while (cur && !seen.has(cur)) {
      const n = by.get(cur); if (!n) return;
      seen.add(cur);
      out.push({ id: cur, depth: d, ...(label ? { branch: label } : {}) });
      label = undefined;
      let next: string | undefined;
      for (const h of HANDLES[n.kind]) {
        const t = edges.find((e) => e.source === cur && e.handle === h)?.target;
        if (h === "out" || h === "next") next = t; else visit(t, d + 1, HANDLE_LABEL[h]);
      }
      cur = next;
    }
  };
  const root = nodes.find((n) => n.kind === "trigger");
  visit(root?.id, 0);
  for (const n of nodes) if (!seen.has(n.id)) { seen.add(n.id); out.push({ id: n.id, depth: 0, orphan: true }); }
  return out;
}

/** Edges after deleting one step: the predecessor is reconnected to the step's single successor so the path is not cut. */
export function removeStep(nodes: GNode[], edges: GEdge[], id: string): { nodes: GNode[]; edges: GEdge[] } {
  const node = nodes.find((n) => n.id === id);
  if (!node || node.kind === "trigger") return { nodes, edges };
  const incoming = edges.filter((e) => e.target === id);
  const outgoing = edges.filter((e) => e.source === id);
  const bridge: GEdge[] = incoming.length === 1 && outgoing.length === 1 && HANDLES[node.kind].length === 1 && outgoing[0]!.target !== incoming[0]!.source
    ? [{ id: `e${incoming[0]!.source}-${incoming[0]!.handle}-${outgoing[0]!.target}`, source: incoming[0]!.source, handle: incoming[0]!.handle, target: outgoing[0]!.target }] : [];
  return { nodes: nodes.filter((n) => n.id !== id), edges: [...edges.filter((e) => e.source !== id && e.target !== id), ...bridge] };
}
