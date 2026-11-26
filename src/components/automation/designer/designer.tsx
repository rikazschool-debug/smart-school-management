import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, MarkerType, applyNodeChanges, applyEdgeChanges, useReactFlow,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Save, PlayCircle, BadgeCheck, Power, PowerOff, Undo2, Redo2, Copy, LayoutGrid, Maximize2, Minimize2, AlertTriangle, CheckCircle2, X, Loader2 } from "lucide-react";
import { ask } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { rpc, useOrgSchools, useRegistry, RULE_ST, SCHED, type Any } from "../lib";
import { autoLayout, compile, decompile, HANDLES, HANDLE_LABEL, ACTION_CODE, type GEdge, type GNode, type NodeKind, type Issue } from "./flow";
import { KIND, START_TYPES, serverMsg } from "./meta";
import { RuleSettings, StepProps, eligibleRecipients, type RuleMeta } from "./props";
import { SimResult } from "./sim";

type ND = { kind: NodeKind; d: Record<string, unknown>; issue?: number; status?: string };
type FNode = Node<ND, "au">;
type Snap = { nodes: FNode[]; edges: Edge[]; meta: RuleMeta };

const Ctx = createContext<{ r: Any; meta: RuleMeta | null; status?: Record<string, string> }>({ r: null, meta: null });
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const edgeOf = (e: GEdge): Edge => ({ id: e.id, source: e.source, sourceHandle: e.handle, target: e.target, label: HANDLE_LABEL[e.handle] || undefined, markerEnd: { type: MarkerType.ArrowClosed }, type: "smoothstep" });
const toFlow = (g: { nodes: GNode[]; edges: GEdge[] }): { nodes: FNode[]; edges: Edge[] } => ({
  nodes: g.nodes.map((n) => ({ id: n.id, type: "au", position: { x: n.x, y: n.y }, data: { kind: n.kind, d: n.data }, deletable: n.kind !== "trigger" })),
  edges: g.edges.map(edgeOf),
});
const toG = (nodes: FNode[], edges: Edge[]): { nodes: GNode[]; edges: GEdge[] } => ({
  nodes: nodes.map((n) => ({ id: n.id, kind: n.data.kind, data: n.data.d, x: n.position.x, y: n.position.y })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, handle: e.sourceHandle ?? "out", target: e.target })),
});
const STATUS_CLS: Record<string, string> = {
  done: "ring-2 ring-primary bg-primary/5", then: "ring-2 ring-primary bg-primary/5", else: "ring-2 ring-primary bg-primary/5", stopped: "ring-2 ring-muted-foreground",
  waiting: "ring-2 ring-warning bg-warning/10", skipped: "ring-2 ring-warning bg-warning/10", failed: "ring-2 ring-destructive bg-destructive/5", cancelled: "ring-2 ring-muted-foreground bg-muted",
};
const STATUS_L: Record<string, string> = { done: "نُفِّذ", then: "تحقق الشرط", else: "لم يتحقق", stopped: "انتهى", waiting: "بانتظار", skipped: "تخطي موثق", failed: "فشل", cancelled: "أُلغي" };

function summary(kind: NodeKind, d: Record<string, unknown>, r: Any, meta: RuleMeta | null): string {
  const rc = (c: string) => ((r?.recipients ?? []) as Any[]).find((x) => x.code === c)?.label ?? c;
  switch (kind) {
    case "trigger": { const ev = ((r?.events ?? []) as Any[]).find((e) => e.code === meta?.event); return ev ? `${ev.label} · ${SCHED[meta?.schedule?.type] ?? ""}` : "اختر الحدث من الخصائص"; }
    case "notify": case "reminder": return `${String(d["title"] ?? "بلا عنوان")} ← ${((d["recipients"] as string[]) ?? []).map(rc).join("، ") || "بلا مستلم"}`;
    case "escalate": return `إلى ${d["to"] ? rc(String(d["to"])) : "—"}`;
    case "task": return `${String(d["title"] ?? "")} ← ${d["assignee"] ? rc(String(d["assignee"])) : "—"}`;
    case "review": return `${String(d["title"] ?? "")} ← ${d["to"] ? rc(String(d["to"])) : "—"}`;
    case "wait": { const m = Number(d["minutes"] ?? 0); return m >= 1440 && m % 1440 === 0 ? `${m / 1440} يوم` : m >= 60 && m % 60 === 0 ? `${m / 60} ساعة` : `${m} دقيقة`; }
    case "filter": case "if": return d["when"] ? "شرط محدد" : "بلا شرط بعد";
    case "parallel": return "2–3 فروع";
    default: return "";
  }
}

const AuNode = memo(function AuNode({ id, data, selected }: NodeProps<FNode>) {
  const { r, meta, status } = useContext(Ctx);
  const k = KIND[data.kind]; const Icon = k.i; const hs = HANDLES[data.kind];
  const st = status?.[id];
  return (
    <div dir="rtl" className={`w-60 rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow ${selected ? "border-primary shadow-md" : ""} ${data.issue ? "border-destructive" : ""} ${st ? STATUS_CLS[st] ?? "" : ""}`}>
      {data.kind !== "trigger" && <Handle type="target" position={Position.Top} className="!size-2.5 !bg-primary" />}
      <div className="flex items-start gap-2 p-2.5">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${data.kind === "trigger" ? "bg-primary text-primary-foreground" : k.group === "cond" ? "bg-accent/30 text-accent-foreground" : k.group === "flow" ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary"}`}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm font-semibold">{k.l}{data.issue ? <AlertTriangle className="size-3.5 text-destructive" aria-label="يحتاج إكمالًا" /> : null}</div>
          <div className="truncate text-xs text-muted-foreground" title={summary(data.kind, data.d, r, meta)}>{summary(data.kind, data.d, r, meta)}</div>
          {st && <div className="mt-0.5 text-[11px] font-semibold">{STATUS_L[st] ?? st}</div>}
        </div>
      </div>
      {hs.length > 1 && <div className="flex justify-around border-t px-1 pb-1 pt-0.5 text-[10px] text-muted-foreground">{hs.map((h) => <span key={h}>{HANDLE_LABEL[h]}</span>)}</div>}
      {hs.map((h, i) => <Handle key={h} id={h} type="source" position={Position.Bottom} className="!size-2.5 !bg-primary" style={{ left: `${((i + 1) / (hs.length + 1)) * 100}%` }} />)}
    </div>
  );
});
const nodeTypes = { au: AuNode };

/** Read-only canvas used by run monitoring to show which steps ran. */
export function FlowView({ r, def, status }: { r: Any; def: Any; status: Record<string, string> }) {
  const g = useMemo(() => toFlow(decompile(def ?? { steps: [] })), [def]);
  return (
    <Ctx.Provider value={{ r, meta: null, status }}>
      <div dir="ltr" className="h-[420px] rounded-xl border bg-muted/30">
        <ReactFlow nodes={g.nodes} edges={g.edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ maxZoom: 1 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}>
          <Background gap={20} /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </Ctx.Provider>
  );
}

export function Designer(props: { orgId: string; ruleId?: string | undefined; onRule: (id: string | undefined) => void }) {
  return <ReactFlowProvider><DesignerInner {...props} /></ReactFlowProvider>;
}

const NEW_META: RuleMeta = { name: "", description: "", event: "", schools: null, scope: "all", schedule: { type: "condition", quiet: true, workdays_only: false }, priority: 5 };

function DesignerInner({ orgId, ruleId, onRule }: { orgId: string; ruleId?: string | undefined; onRule: (id: string | undefined) => void }) {
  const qc = useQueryClient();
  const reg = useRegistry(orgId);
  const schools = useOrgSchools(orgId);
  const rule = useQuery({ queryKey: ["au-rule", ruleId], enabled: !!ruleId, queryFn: () => rpc<Any>("au_rule_get", { _id: ruleId }) });
  const r = reg.data;
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const [meta, setMetaRaw] = useState<RuleMeta>(NEW_META);
  const [nodes, setNodes] = useState<FNode[]>(() => toFlow({ nodes: [{ id: "trigger", kind: "trigger", data: {}, x: 0, y: 0 }], edges: [] }).nodes);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [sel, setSel] = useState<string | null>("trigger");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [server, setServer] = useState<{ ok: boolean; error?: string } | null>(null);
  const [sim, setSim] = useState<Any>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [full, setFull] = useState(false);
  const hist = useRef<{ past: Snap[]; future: Snap[] }>({ past: [], future: [] });
  const loaded = useRef<string | null>(null);

  // load an existing rule once per id
  useEffect(() => {
    if (!ruleId) { if (loaded.current !== "new") { loaded.current = "new"; } return; }
    const x = rule.data; if (!x || loaded.current === ruleId || !r) return;
    loaded.current = ruleId;
    const d = x.draft ?? {};
    const ev = (r.events as Any[]).find((e) => e.code === x.event);
    setMetaRaw({ name: x.name ?? "", description: x.description ?? "", event: x.event, schools: x.schools ?? null,
      scope: x.schools == null ? (ev?.area === "central" ? "central" : "all") : x.schools.length === 1 ? "one" : "many", schedule: d.schedule ?? { type: "condition" }, priority: d.priority ?? 5 });
    const want = stable({ ...(d.when ? { when: d.when } : {}), steps: d.steps ?? [] });
    const lay = x.layout?.v === 1 ? { nodes: x.layout.nodes as GNode[], edges: x.layout.edges as GEdge[] } : null;
    const g = lay && stable(compile(lay.nodes, lay.edges).def) === want ? lay : decompile({ when: d.when ?? null, steps: d.steps ?? [] });
    const f = toFlow(g); setNodes(f.nodes); setEdges(f.edges); setDirty(false); hist.current = { past: [], future: [] };
    setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1 }), 50);
  }, [ruleId, rule.data, r, rf]);

  const snap = useCallback(() => { hist.current.past.push({ nodes, edges, meta }); if (hist.current.past.length > 60) hist.current.past.shift(); hist.current.future = []; }, [nodes, edges, meta]);
  const setMeta = (m: Partial<RuleMeta>) => { snap(); setMetaRaw((p) => ({ ...p, ...m })); setDirty(true); };
  const undo = useCallback(() => { const p = hist.current.past.pop(); if (!p) return; hist.current.future.push({ nodes, edges, meta }); setNodes(p.nodes); setEdges(p.edges); setMetaRaw(p.meta); setDirty(true); }, [nodes, edges, meta]);
  const redo = useCallback(() => { const f = hist.current.future.pop(); if (!f) return; hist.current.past.push({ nodes, edges, meta }); setNodes(f.nodes); setEdges(f.edges); setMetaRaw(f.meta); setDirty(true); }, [nodes, edges, meta]);

  const ev = useMemo(() => ((r?.events ?? []) as Any[]).find((e) => e.code === meta.event), [r, meta.event]);
  const g = useMemo(() => toG(nodes, edges), [nodes, edges]);
  const comp = useMemo(() => compile(g.nodes, g.edges), [g]);
  const def = useMemo(() => ({ schedule: meta.schedule, priority: meta.priority, ...comp.def }), [meta.schedule, meta.priority, comp.def]);
  const localIssues: Issue[] = useMemo(() => {
    const out = [...comp.issues];
    if (meta.name.trim().length < 3) out.unshift({ node: "trigger", level: "error", msg: "اكتب اسم القاعدة (3 أحرف على الأقل)" });
    if (!meta.event) out.unshift({ node: "trigger", level: "error", msg: "اختر الحدث المحفز" });
    if ((meta.scope === "one" || meta.scope === "many") && !(meta.schools ?? []).length) out.unshift({ node: "trigger", level: "error", msg: "اختر المدرسة" });
    // recipients outside the eligible list for this event (e.g. after changing the event)
    const ok = new Set(eligibleRecipients(r, ev, false).map((x) => x.code));
    for (const n of g.nodes) for (const c of ((n.data["recipients"] as string[]) ?? [])) if (ev && !ok.has(c)) out.push({ node: n.id, level: "error", msg: `المستلم «${c}» غير مؤهل لهذا الحدث` });
    const ready = new Set(((r?.actions ?? []) as Any[]).filter((a) => a.readiness === "ready" && a.enabled).map((a) => a.code));
    for (const n of g.nodes) { const code = ACTION_CODE[n.kind]; if (code && !ready.has(code)) out.push({ node: n.id, level: "error", msg: `«${KIND[n.kind].l}» غير متاح في المحرك` }); }
    return out;
  }, [comp.issues, meta, g.nodes, r, ev]);
  const errors = localIssues.filter((i) => i.level === "error");

  // the engine validates the exact definition (debounced, read-only)
  useEffect(() => {
    if (!meta.event || errors.length) { setServer(null); return; }
    const t = setTimeout(() => { rpc<Any>("au_validate", { _org: orgId, _event: meta.event, _def: def }).then((v) => setServer(v.ok ? { ok: true } : { ok: false, error: String(v.error) })).catch((e) => setServer({ ok: false, error: arabicError(e) })); }, 700);
    return () => clearTimeout(t);
  }, [orgId, meta.event, def, errors.length]);

  const canSave = errors.length === 0 && server?.ok === true;
  const save = useCallback(async (silent = false) => {
    if (!canSave) { if (!silent) toast.error("أكمل الأخطاء قبل الحفظ"); return; }
    setSaving(true);
    try {
      const id = await rpc<string>("au_rule_save_full", { _org: orgId, _id: ruleId ?? null, _name: meta.name, _description: meta.description, _event: meta.event,
        _schools: meta.scope === "one" || meta.scope === "many" ? meta.schools : null, _def: def, _layout: { v: 1, nodes: g.nodes, edges: g.edges } });
      dirtyRef.current = false; setDirty(false); setSavedAt(new Date());
      qc.invalidateQueries({ queryKey: ["au-rules"] }); qc.invalidateQueries({ queryKey: ["au-rule", id] });
      if (!ruleId) { loaded.current = id; onRule(id); }
      if (!silent) toast.success("حُفظت المسودة — القاعدة غير مفعّلة");
    } catch (e) { toast.error(serverMsg(arabicError(e))); } finally { setSaving(false); }
  }, [canSave, orgId, ruleId, meta, def, g, qc, onRule]);

  // autosave existing drafts once they are valid
  useEffect(() => { if (!ruleId || !dirty || !canSave || saving) return; const t = setTimeout(() => void save(true), 5000); return () => clearTimeout(t); }, [ruleId, dirty, canSave, saving, save]);

  // a ref, not state: right after saving a new rule the URL gains ?rule= in the same tick, before the dirty state re-renders
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useBlocker({ shouldBlockFn: async () => (dirtyRef.current ? !(await ask("لديك تعديلات غير محفوظة في المصمم. المغادرة تفقدها. هل تريد المغادرة؟", { destructive: true, ok: "مغادرة" })) : false), enableBeforeUnload: () => dirty });

  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);

  const addNode = useCallback((kind: NodeKind, pos?: { x: number; y: number }) => {
    snap();
    const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const from = !pos && sel ? nodes.find((n) => n.id === sel) : undefined;
    const freeH = from ? HANDLES[from.data.kind].find((h) => !edges.some((e) => e.source === from.id && (e.sourceHandle ?? "out") === h)) : undefined;
    const p = pos ?? (from ? { x: from.position.x, y: from.position.y + 150 } : { x: 0, y: (nodes.length) * 150 });
    const init: Record<string, unknown> = kind === "wait" ? { minutes: 1440 } : kind === "task" ? { due_in_days: 2 } : kind === "review" ? { due_in_days: 3 } : {};
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "au", position: p, data: { kind, d: init }, selected: true }]);
    if (from && freeH) setEdges((es) => [...es, edgeOf({ id: `e${id}`, source: from.id, handle: freeH, target: id })]);
    setSel(id); setDirty(true);
  }, [snap, sel, nodes, edges]);

  const onNodesChange = useCallback((ch: NodeChange<FNode>[]) => {
    if (ch.some((c) => c.type === "remove")) snap();
    setNodes((ns) => applyNodeChanges(ch, ns));
    if (ch.some((c) => c.type === "remove" || (c.type === "position" && c.dragging === false))) setDirty(true);
    const s = ch.find((c) => c.type === "select" && c.selected); if (s && "id" in s) setSel(s.id);
  }, [snap]);
  const onEdgesChange = useCallback((ch: EdgeChange[]) => { if (ch.some((c) => c.type === "remove")) { snap(); setDirty(true); } setEdges((es) => applyEdgeChanges(ch, es)); }, [snap]);
  const onConnect = useCallback((c: Connection) => {
    snap();
    const h = c.sourceHandle ?? "out";
    setEdges((es) => [...es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "out") === h) && e.target !== c.target), edgeOf({ id: `e${c.source}-${h}-${c.target}`, source: c.source, handle: h, target: c.target })]);
    setDirty(true);
  }, [snap]);
  const valid = useCallback((c: Connection | Edge) => c.source !== c.target && nodes.find((n) => n.id === c.target)?.data.kind !== "trigger", [nodes]);

  const setData = (id: string, d: Record<string, unknown>) => { snap(); setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, d } } : n))); setDirty(true); };
  const duplicate = () => {
    const picked = nodes.filter((n) => n.selected && n.data.kind !== "trigger"); if (!picked.length) { toast.info("حدّد عنصرًا لنسخه"); return; }
    snap();
    const copies = picked.map((n, i) => ({ ...n, id: `n${Date.now().toString(36)}${i}`, position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true, data: { ...n.data, d: structuredClone(n.data.d) } }));
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...copies]); setDirty(true);
  };
  const tidy = () => { snap(); const laid = autoLayout(g.nodes, g.edges); setNodes((ns) => ns.map((n) => { const p = laid.find((x) => x.id === n.id); return p ? { ...n, position: { x: p.x, y: p.y } } : n; })); setDirty(true); setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1 }), 30); };
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void wrap.current?.requestFullscreen(); };

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName; if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
    else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
  };

  const simulate = async () => {
    if (!meta.event) { toast.error("اختر الحدث أولًا"); return; }
    setSimBusy(true);
    try { setSim(await rpc<Any>("au_simulate_def", { _org: orgId, _event: meta.event, _schools: meta.scope === "one" || meta.scope === "many" ? meta.schools : null, _def: def })); setTimeout(() => document.getElementById("au-sim-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
    catch (e) { toast.error(arabicError(e)); } finally { setSimBusy(false); }
  };
  const info = rule.data;
  const status: string = ruleId ? (dirty ? (info?.approved_version ? "changed" : "draft") : info?.status ?? "draft") : "draft";
  const approve = async () => {
    if (!ruleId || dirty) { toast.error("احفظ المسودة أولًا"); return; }
    if (!(await ask("اعتماد هذه المسودة كإصدار جديد؟ الاعتماد لا يفعّل القاعدة؛ التفعيل خطوة مستقلة.", { ok: "اعتماد" }))) return;
    try { const v = await rpc<number>("au_rule_approve", { _id: ruleId }); toast.success(`اعتُمد الإصدار ${v} — القاعدة ما زالت غير مفعّلة`); qc.invalidateQueries({ queryKey: ["au-rule", ruleId] }); qc.invalidateQueries({ queryKey: ["au-rules"] }); }
    catch (e) { toast.error(serverMsg(arabicError(e))); }
  };
  const activate = async (on: boolean) => {
    if (!ruleId) return;
    if (on && !(await ask("تفعيل الإصدار المعتمد يجعله يعمل على بيانات المجموعة الفعلية ويرسل إشعارات داخلية للمستلمين المؤهلين. لا تفعّل قاعدة تجريبية على مستخدمين حقيقيين. هل تريد التفعيل؟", { ok: "تفعيل", destructive: true }))) return;
    try { await rpc("au_rule_set_active", { _id: ruleId, _on: on }); toast.success(on ? "فُعّلت القاعدة" : "أوقفت القاعدة"); qc.invalidateQueries({ queryKey: ["au-rule", ruleId] }); qc.invalidateQueries({ queryKey: ["au-rules"] }); }
    catch (e) { toast.error(serverMsg(arabicError(e))); }
  };

  if (reg.isLoading || (ruleId && rule.isLoading)) return <LoadingState />;
  if (reg.error || rule.error) return <ErrorState message={arabicError(reg.error ?? rule.error)} />;
  const issueCount: Record<string, number> = {};
  for (const i of localIssues) if (i.node && i.level === "error") issueCount[i.node] = (issueCount[i.node] ?? 0) + 1;
  const shown: FNode[] = nodes.map((n): FNode => { const c = issueCount[n.id] ?? 0; return c || n.data.issue ? { ...n, data: { ...n.data, issue: c } } : n; });
  const selNode = nodes.find((n) => n.id === sel);
  const ready = new Set(((r?.actions ?? []) as Any[]).filter((a) => a.readiness === "ready" && a.enabled).map((a) => a.code));
  const palette = (Object.keys(KIND) as NodeKind[]).filter((k) => k !== "trigger" && (!ACTION_CODE[k] || ready.has(ACTION_CODE[k]!)));
  const groups: [string, string][] = [["cond", "الشروط"], ["action", "الإجراءات"], ["flow", "التحكم في المسار"]];
  const st = RULE_ST[status];
  const live = info?.active && !dirty;

  return (
    <div ref={wrap} onKeyDown={onKey} className={`flex flex-col gap-3 ${full ? "h-screen overflow-auto bg-background p-3" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="truncate text-sm font-bold">{meta.name || "قاعدة جديدة"}</span>
            {st && <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${st[1]}`} title={st[2]}>{st[0]}</span>}
            {info?.approved_version && <span className="text-[11px] text-muted-foreground">الإصدار المعتمد {info.approved_version}{info.active ? " (يعمل)" : ""}</span>}</div>
          <div className="text-[11px] text-muted-foreground">{saving ? "جارٍ الحفظ…" : dirty ? (ruleId && canSave ? "تعديلات غير محفوظة — حفظ تلقائي خلال ثوانٍ" : "تعديلات غير محفوظة") : savedAt ? `حُفظت ${savedAt.toLocaleTimeString("ar-SA")}` : ruleId ? "محفوظة" : "لم تُحفظ بعد"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <TB l="تراجع (Ctrl+Z)" onClick={undo} disabled={!hist.current.past.length}><Undo2 className="size-4" /></TB>
          <TB l="إعادة (Ctrl+Y)" onClick={redo} disabled={!hist.current.future.length}><Redo2 className="size-4" /></TB>
          <TB l="نسخ المحدد (Ctrl+D)" onClick={duplicate}><Copy className="size-4" /></TB>
          <TB l="ترتيب تلقائي" onClick={tidy}><LayoutGrid className="size-4" /></TB>
          <TB l={full ? "إنهاء ملء الشاشة" : "ملء الشاشة"} onClick={fullscreen}>{full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</TB>
          <span className="mx-1 h-6 w-px bg-border" />
          <button onClick={() => void simulate()} disabled={simBusy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-primary/50 disabled:opacity-50">{simBusy ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}محاكاة</button>
          <button onClick={() => void save()} disabled={!canSave || saving || (!dirty && !!ruleId)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-primary/50 disabled:opacity-50"><Save className="size-4" />حفظ المسودة</button>
          <button onClick={() => void approve()} disabled={!ruleId || dirty || !(status === "draft" || status === "changed")} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-primary/50 disabled:opacity-50"><BadgeCheck className="size-4" />اعتماد</button>
          {live ? <button onClick={() => void activate(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-semibold text-destructive"><PowerOff className="size-4" />إيقاف</button>
            : <button onClick={() => void activate(true)} disabled={!ruleId || dirty || status !== "paused"} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Power className="size-4" />تفعيل</button>}
        </div>
      </div>

      <div className={`grid gap-3 ${full ? "flex-1" : ""} lg:grid-cols-[13rem_minmax(0,1fr)_22rem]`}>
        <aside className="space-y-3 rounded-2xl border bg-card p-3 text-sm shadow-sm lg:max-h-[72vh] lg:overflow-auto">
          <div><div className="mb-1 text-xs font-bold text-muted-foreground">البداية</div>
            <ul className="space-y-1">{START_TYPES.map((s) => { const on = s.types.includes(meta.schedule?.type); const okFor = !ev || (ev.source_kind === "trigger" ? s.k === "event" : s.k !== "event"); return (
              <li key={s.k}><button type="button" disabled={!okFor} onClick={() => { setSel("trigger"); if (!on) setMeta({ schedule: { ...meta.schedule, type: s.types[0] } }); }} className={`w-full rounded-lg border px-2 py-1.5 text-start text-xs ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:border-primary/40"} disabled:opacity-40`}>{s.l}</button></li>); })}</ul></div>
          {groups.map(([gk, gl]) => (
            <div key={gk}><div className="mb-1 text-xs font-bold text-muted-foreground">{gl}</div>
              <ul className="space-y-1">{palette.filter((k) => KIND[k].group === gk).map((k) => { const K = KIND[k]; return (
                <li key={k}><button type="button" draggable onDragStart={(e) => { e.dataTransfer.setData("application/au-kind", k); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => addNode(k)} title={`${K.d} — اسحبه إلى المساحة أو اضغط لإضافته بعد العنصر المحدد`}
                  className="flex w-full cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-start text-xs hover:border-primary/50 active:cursor-grabbing"><K.i className="size-4 shrink-0 text-primary" />{K.l}</button></li>); })}</ul></div>
          ))}
          <p className="text-[11px] leading-5 text-muted-foreground">اسحب العنصر إلى المساحة، أو حدّد عنصرًا ثم اضغط عنصرًا من المكتبة (أو Enter) ليُضاف ويُربط بعده. Delete للحذف.</p>
        </aside>

        <div dir="ltr" className={`relative rounded-2xl border bg-muted/30 ${full ? "min-h-[60vh]" : "h-[72vh]"}`}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("application/au-kind") as NodeKind; if (!k || !KIND[k]) return; addNode(k, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
          <Ctx.Provider value={{ r, meta }}>
            <ReactFlow nodes={shown} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={valid}
              onNodeDragStart={() => snap()} onPaneClick={() => setSel(null)} fitView fitViewOptions={{ padding: 0.25, maxZoom: 1 }} deleteKeyCode={["Delete", "Backspace"]}
              multiSelectionKeyCode={["Shift", "Control", "Meta"]} selectionKeyCode="Shift" proOptions={{ hideAttribution: true }} minZoom={0.2} maxZoom={1.75}>
              <Background gap={20} />
              <Controls position="bottom-left" />
              <MiniMap position="bottom-right" pannable zoomable className="!bg-card" />
            </ReactFlow>
          </Ctx.Provider>
        </div>

        <aside className="space-y-3 lg:max-h-[72vh] lg:overflow-auto">
          <section className="rounded-2xl border bg-card p-3 shadow-sm">
            {selNode ? (
              <>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">{KIND[selNode.data.kind].l}</h3>
                  <button aria-label="إغلاق الخصائص" onClick={() => setSel(null)} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button></div>
                {selNode.data.kind === "trigger"
                  ? <RuleSettings r={r} meta={meta} set={setMeta} schools={(schools.data ?? []).filter((s) => s.is_active)} />
                  : <StepProps kind={selNode.data.kind} data={selNode.data.d} set={(d) => setData(selNode.id, d)} r={r} ev={ev} />}
              </>
            ) : <p className="text-sm text-muted-foreground">حدّد عنصرًا لعرض خصائصه. ابدأ بعنصر «البداية» لاختيار النطاق والقسم والحدث والتوقيت.</p>}
          </section>
          <section className="rounded-2xl border bg-card p-3 shadow-sm" aria-live="polite">
            <h3 className="mb-2 text-sm font-bold">التحقق ({comp.count} خطوة من 15)</h3>
            {localIssues.length === 0 && server?.ok && <p className="flex items-center gap-1 text-sm text-primary"><CheckCircle2 className="size-4" />المسار صالح ويقبله المحرك.</p>}
            {localIssues.length === 0 && server && !server.ok && <p className="text-sm text-destructive">المحرك رفض المسار: {serverMsg(server.error ?? "")}</p>}
            {localIssues.length === 0 && !server && meta.event && <p className="text-xs text-muted-foreground">جارٍ التحقق من المحرك…</p>}
            <ul className="space-y-1">{localIssues.map((i, k) => (
              <li key={k}><button type="button" onClick={() => i.node && setSel(i.node)} className={`flex w-full items-start gap-1 text-start text-xs ${i.level === "error" ? "text-destructive" : "text-warning-foreground"}`}><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{i.msg}</button></li>))}</ul>
          </section>
          {sim && <section id="au-sim-result" className="scroll-mt-4 rounded-2xl border bg-card p-3 shadow-sm"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">نتيجة المحاكاة</h3><button aria-label="إغلاق المحاكاة" onClick={() => setSim(null)} className="rounded p-1 text-muted-foreground"><X className="size-4" /></button></div><SimResult s={sim} r={r} /></section>}
        </aside>
      </div>
    </div>
  );
}

const TB = ({ l, onClick, disabled, children }: { l: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <button type="button" aria-label={l} title={l} onClick={onClick} disabled={disabled} className="grid size-8 place-items-center rounded-lg border hover:border-primary/50 disabled:opacity-40">{children}</button>
);
