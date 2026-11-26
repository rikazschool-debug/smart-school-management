// Visual workflow <-> engine definition. The engine (au_validate / _au_check_def) stays the only authority;
// this module only converts the drawn graph into the same {when, steps} shape and flags drawing mistakes early.

export type Cond = { all: Cond[] } | { any: Cond[] } | { not: Cond } | { var: string; op: string; value?: unknown };
export type Step = { type: string } & Record<string, unknown>;
export type Def = { when?: Cond | null; steps: Step[] } & Record<string, unknown>;
export type NodeKind = "trigger" | "filter" | "notify" | "reminder" | "escalate" | "task" | "review" | "wait" | "if" | "parallel" | "stop";
export type GNode = { id: string; kind: NodeKind; data: Record<string, unknown>; x: number; y: number };
export type GEdge = { id: string; source: string; handle: string; target: string };
export type Issue = { node?: string | undefined; level: "error" | "warning"; msg: string };

export const STEP_KINDS: NodeKind[] = ["notify", "reminder", "escalate", "task", "review", "wait", "if", "parallel", "stop"];
/** Output handles per element; "next" on if/parallel continues after the branches (engine semantics). */
export const HANDLES: Record<NodeKind, string[]> = {
  trigger: ["out"], filter: ["out"], notify: ["out"], reminder: ["out"], escalate: ["out"], task: ["out"], review: ["out"], wait: ["out"],
  if: ["then", "else", "next"], parallel: ["b0", "b1", "b2", "next"], stop: [],
};
export const HANDLE_LABEL: Record<string, string> = { then: "إذا تحقق", else: "إذا لم يتحقق", next: "بعد ذلك", b0: "فرع 1", b1: "فرع 2", b2: "فرع 3", out: "" };
/** Registry action code behind each element (au_actions). */
export const ACTION_CODE: Partial<Record<NodeKind, string>> = {
  notify: "notify_internal", reminder: "reminder", escalate: "escalate", task: "create_followup_task", review: "request_review",
  wait: "wait", if: "recheck", parallel: "parallel", stop: "stop",
};
export const MAX_STEPS = 15;
export const MAX_DEPTH = 3;

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const clean = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).filter(([, v]) => !blank(v)));

export function condLeaves(c: Cond | null | undefined): number {
  if (!c) return 0;
  if ("all" in c) return c.all.reduce((n, x) => n + condLeaves(x), 0);
  if ("any" in c) return c.any.reduce((n, x) => n + condLeaves(x), 0);
  if ("not" in c) return condLeaves(c.not);
  return 1;
}
export function condComplete(c: Cond | null | undefined): boolean {
  if (!c) return false;
  if ("all" in c) return c.all.length > 0 && c.all.every(condComplete);
  if ("any" in c) return c.any.length > 0 && c.any.every(condComplete);
  if ("not" in c) return condComplete(c.not);
  return !!c.var && !!c.op;
}

/** Recipient groups (phase C) replace the single code; the engine checks each group's content. */
const hasGroups = (d: Record<string, unknown>) => Array.isArray(d["groups"]) && (d["groups"] as unknown[]).length > 0;

function nodeIssues(n: GNode): string[] {
  const d = n.data, out: string[] = [];
  const title = String(d["title"] ?? "").trim();
  const days = Number(d["due_in_days"] ?? 0);
  switch (n.kind) {
    case "filter": case "if": if (!condComplete(d["when"] as Cond)) out.push("أكمل الشرط (المتغير والمقارنة والقيمة)"); break;
    case "notify": case "reminder":
      if (title.length < 2) out.push("اكتب عنوان الإشعار");
      if (!hasGroups(d) && (!Array.isArray(d["recipients"]) || (d["recipients"] as unknown[]).length === 0)) out.push("اختر مستلمًا واحدًا على الأقل");
      break;
    case "escalate": if (!d["to"] && !hasGroups(d)) out.push("اختر جهة التصعيد"); if (title.length < 2) out.push("اكتب عنوان التصعيد"); break;
    case "task": if (!d["assignee"] && !hasGroups(d)) out.push("اختر المكلَّف"); if (title.length < 2) out.push("اكتب عنوان المهمة"); if (!(days >= 1 && days <= 30)) out.push("مدة الإنجاز من 1 إلى 30 يومًا"); break;
    case "review":
      if (!d["to"] && !hasGroups(d)) out.push("اختر المراجع"); if (title.length < 2) out.push("اكتب عنوان الطلب");
      if (String(d["reason"] ?? "").trim().length < 3) out.push("اكتب سبب المراجعة"); if (!(days >= 1 && days <= 30)) out.push("مدة المراجعة من 1 إلى 30 يومًا"); break;
    case "wait": { const m = Number(d["minutes"] ?? 0); if (!(m >= 5 && m <= 43200)) out.push("مدة الانتظار من 5 دقائق إلى 30 يومًا"); break; }
  }
  return out;
}

/** Graph -> engine definition (+ drawing issues). Never decides execution: the server re-validates everything. */
export function compile(nodes: GNode[], edges: GEdge[]): { def: Def; issues: Issue[]; count: number } {
  const issues: Issue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outs = new Map<string, GEdge[]>();
  const ins = new Map<string, number>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const k = `${e.source}|${e.handle}`;
    outs.set(k, [...(outs.get(k) ?? []), e]);
    ins.set(e.target, (ins.get(e.target) ?? 0) + 1);
  }
  for (const [k, list] of outs) if (list.length > 1) issues.push({ node: k.split("|")[0], level: "error", msg: "مخرج واحد مرتبط بأكثر من عنصر — استخدم «فروع متوازية» للتفرع" });
  for (const [id, n] of ins) if (n > 1) issues.push({ node: id, level: "error", msg: "العنصر له أكثر من مدخل؛ دمج المسارات غير مدعوم" });
  const triggers = nodes.filter((n) => n.kind === "trigger");
  if (triggers.length !== 1) issues.push({ level: "error", msg: triggers.length === 0 ? "أضف عنصر البداية" : "مسموح بعنصر بداية واحد فقط" });
  const next = (id: string, h: string) => outs.get(`${id}|${h}`)?.[0]?.target;
  const seen = new Set<string>();
  let count = 0, tooDeep = false;

  const chain = (start: string | undefined, depth: number): Step[] => {
    const steps: Step[] = [];
    let cur = start;
    while (cur) {
      if (seen.has(cur)) { issues.push({ node: cur, level: "error", msg: "المسار يعود إلى عنصر سابق (حلقة لا نهائية)" }); break; }
      seen.add(cur);
      const n = byId.get(cur)!;
      if (n.kind === "trigger") { issues.push({ node: cur, level: "error", msg: "لا يمكن الرجوع إلى البداية" }); break; }
      if (n.kind === "filter") { issues.push({ node: cur, level: "error", msg: "شرط القاعدة يأتي مباشرة بعد البداية فقط؛ استخدم «إعادة التحقق» داخل المسار" }); cur = next(cur, "out"); continue; }
      for (const m of nodeIssues(n)) issues.push({ node: n.id, level: "error", msg: m });
      count++;
      if (n.kind === "if") {
        if (depth + 1 > MAX_DEPTH) tooDeep = true;
        const th = chain(next(n.id, "then"), depth + 1);
        if (th.length === 0) issues.push({ node: n.id, level: "error", msg: "مسار «إذا تحقق» فارغ" });
        const el = next(n.id, "else") ? chain(next(n.id, "else"), depth + 1) : [];
        steps.push({ type: "if", when: n.data["when"], then: th, ...(el.length ? { else: el } : {}) });
        cur = next(n.id, "next");
        continue;
      }
      if (n.kind === "parallel") {
        if (depth + 1 > MAX_DEPTH) tooDeep = true;
        const br = ["b0", "b1", "b2"].map((h) => next(n.id, h)).filter(Boolean).map((t) => chain(t, depth + 1)).filter((b) => b.length);
        if (br.length < 2) issues.push({ node: n.id, level: "error", msg: "الفروع المتوازية تحتاج فرعين على الأقل" });
        steps.push({ type: "parallel", branches: br });
        cur = next(n.id, "next");
        continue;
      }
      steps.push({ type: n.kind, ...clean(n.data) } as Step);
      if (n.kind === "stop") break;
      cur = next(n.id, "out");
      if (!cur && n.kind === "wait") issues.push({ node: n.id, level: "warning", msg: "انتظار في نهاية المسار لا أثر له" });
    }
    return steps;
  };

  let when: Cond | undefined;
  let steps: Step[] = [];
  const t = triggers[0];
  if (t) {
    seen.add(t.id);
    let first = next(t.id, "out");
    if (!first) issues.push({ node: t.id, level: "error", msg: "اربط البداية بالخطوة الأولى" });
    const f = first ? byId.get(first) : undefined;
    if (f?.kind === "filter") {
      seen.add(f.id);
      if (!condComplete(f.data["when"] as Cond)) issues.push({ node: f.id, level: "error", msg: "أكمل شرط القاعدة" });
      else when = f.data["when"] as Cond;
      first = next(f.id, "out");
    }
    steps = chain(first, 0);
    if (steps.length === 0 && first === undefined && f) issues.push({ node: f.id, level: "error", msg: "أضف إجراءً بعد الشرط" });
  }
  for (const n of nodes) if (!seen.has(n.id)) issues.push({ node: n.id, level: "error", msg: "عنصر غير مرتبط بالمسار" });
  if (count > MAX_STEPS) issues.push({ level: "error", msg: `عدد الخطوات ${count} يتجاوز الحد (${MAX_STEPS})` });
  if (tooDeep) issues.push({ level: "error", msg: `التداخل يتجاوز ${MAX_DEPTH} مستويات` });
  if (when && condLeaves(when) > 20) issues.push({ level: "error", msg: "الشروط تتجاوز 20 شرطًا" });
  return { def: { ...(when ? { when } : {}), steps }, issues, count };
}

/** Engine definition -> graph. Step ids follow the engine's execution paths (0.2, 0.1t.0, 0.3b1.0) so traces map onto nodes. */
export function decompile(def: { when?: Cond | null; steps?: Step[] | null }): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [{ id: "trigger", kind: "trigger", data: {}, x: 0, y: 0 }];
  const edges: GEdge[] = [];
  let tail = { id: "trigger", h: "out" };
  if (def.when) { nodes.push({ id: "filter", kind: "filter", data: { when: def.when }, x: 0, y: 0 }); edges.push({ id: "e-trigger-out", source: "trigger", handle: "out", target: "filter" }); tail = { id: "filter", h: "out" }; }
  const chain = (steps: Step[], prefix: string, from: { id: string; h: string }) => {
    let prev: { id: string; h: string } | null = from;
    steps.forEach((st, i) => {
      const id = `${prefix}.${i}`;
      const { type, then: th, else: el, branches, ...rest } = st as Step & { then?: Step[]; else?: Step[]; branches?: Step[][] };
      const kind = (STEP_KINDS.includes(type as NodeKind) ? type : "stop") as NodeKind;
      nodes.push({ id, kind, data: kind === "if" ? { when: (st as Record<string, unknown>)["when"] } : kind === "parallel" ? {} : rest, x: 0, y: 0 });
      if (prev) edges.push({ id: `e-${prev.id}-${prev.h}`, source: prev.id, handle: prev.h, target: id });
      if (kind === "if") { chain(th ?? [], `${id}t`, { id, h: "then" }); if (el?.length) chain(el, `${id}f`, { id, h: "else" }); prev = { id, h: "next" }; }
      else if (kind === "parallel") { (branches ?? []).slice(0, 3).forEach((b, bi) => chain(b, `${id}b${bi}`, { id, h: `b${bi}` })); prev = { id, h: "next" }; }
      else prev = kind === "stop" ? null : { id, h: "out" };
    });
  };
  chain(def.steps ?? [], "0", tail);
  return { nodes: autoLayout(nodes, edges), edges };
}

/** Tidy top-down tree layout (first branch on the right for RTL readers). */
export function autoLayout(nodes: GNode[], edges: GEdge[], gx = 290, gy = 150): GNode[] {
  const kids = new Map<string, string[]>();
  for (const e of edges) kids.set(e.source, [...(kids.get(e.source) ?? []), e.target]);
  const order = (id: string) => { const n = nodes.find((x) => x.id === id); const hs = n ? HANDLES[n.kind] : []; return (kids.get(id) ?? []).slice().sort((a, b) => hs.indexOf(edgeHandle(edges, id, a)) - hs.indexOf(edgeHandle(edges, id, b))); };
  const pos = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  let cursor = 0;
  const place = (id: string, depth: number): number => {
    if (visited.has(id)) return pos.get(id)?.x ?? 0;
    visited.add(id);
    const ch = order(id);
    let x: number;
    if (ch.length === 0) { x = cursor; cursor += 1; }
    else { const xs = ch.map((c) => place(c, depth + 1)); x = (Math.min(...xs) + Math.max(...xs)) / 2; }
    pos.set(id, { x, y: depth });
    return x;
  };
  const roots = nodes.filter((n) => !edges.some((e) => e.target === n.id));
  for (const r of roots) place(r.id, 0);
  return nodes.map((n) => { const p = pos.get(n.id) ?? { x: cursor++, y: 0 }; return { ...n, x: -p.x * gx, y: p.y * gy }; });
}
const edgeHandle = (edges: GEdge[], s: string, t: string) => edges.find((e) => e.source === s && e.target === t)?.handle ?? "out";

/** Engine job/trace path -> designer node id: drops the cap-deferral prefix and folds wait continuations (0.3w.1 -> 0.5). */
export function canonPath(path: string): string {
  const toks = path.replace(/^c/, "").split(".");
  const out: string[] = [];
  let carry: number | null = null;
  for (let tok of toks) {
    if (carry !== null) { const m = /^(\d+)(.*)$/.exec(tok); if (m) tok = `${carry + 1 + Number(m[1])}${m[2]}`; carry = null; }
    if (/^\d+w$/.test(tok)) { carry = Number(tok.slice(0, -1)); continue; }
    out.push(tok);
  }
  return out.join(".");
}
