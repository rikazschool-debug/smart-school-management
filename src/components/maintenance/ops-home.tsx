import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Bus, CheckCircle2, ClipboardCheck, Hammer, Inbox, Plus, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { db } from "@/components/crud-page";
import { LoadingState } from "@/components/states";
import { KIND_LABEL, type Kind, type MtMe } from "@/components/maintenance/shared";

/** Status groups shown on the maintenance staff home; the same groups drive the request-log buttons. */
const FOLLOW_GROUPS: { key: string; label: string; status: string; icon: LucideIcon; overdue?: boolean }[] = [
  { key: "current", label: "الطلبات الحالية", status: "new,awaiting_assign,assigned,in_progress,scheduled,clarify,waiting_parts,returned,awaiting_approval", icon: Hammer },
  { key: "review", label: "بانتظار تأكيدي", status: "awaiting_approval", icon: ClipboardCheck },
  { key: "past", label: "الطلبات السابقة", status: "closed,cancelled", icon: CheckCircle2 },
];
const MGR_GROUPS: { key: string; label: string; status: string; icon: LucideIcon; overdue?: boolean }[] = [
  { key: "new", label: "طلبات جديدة", status: "new,awaiting_assign,assigned", icon: Inbox },
  { key: "work", label: "قيد المعالجة", status: "in_progress,scheduled,clarify,waiting_parts,returned", icon: Hammer },
  { key: "review", label: "بانتظار تأكيد المتابعة", status: "awaiting_approval", icon: ClipboardCheck },
  { key: "late", label: "متأخرة", status: "", icon: AlertTriangle, overdue: true },
  { key: "done", label: "مكتملة", status: "closed", icon: CheckCircle2 },
];

function KindBlock({ orgId, kind, me }: { orgId: string; kind: Kind; me: MtMe }) {
  const to = kind === "school" ? "/app/maintenance" : "/app/bus-maintenance";
  const c = me.caps![kind];
  const GROUPS = c.execute.length ? MGR_GROUPS : FOLLOW_GROUPS;
  const q = useQuery({
    queryKey: ["ops-home", orgId, kind, GROUPS.length], refetchInterval: 120_000,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(GROUPS.map(async (g) => {
        const { data, error } = await db.rpc("mt_list", { _org: orgId, _f: { kind, status: g.status, overdue: !!g.overdue, limit: 1 } });
        if (error) throw error;
        out[g.key] = (data as { total: number }).total;
      }));
      return out;
    },
  });
  const role = c.execute.length ? "تستلم الطلبات وتنفّذها ثم ترسلها للمتابعة." : c.follow.length ? "تنشئ الطلبات وتتابع الحالية والسابقة، وتؤكد الإنجاز أو تعيده بملاحظات." : "تطّلع على الطلبات ضمن صلاحياتك.";
  const Icon = kind === "school" ? Wrench : Bus;
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm" aria-labelledby={`ops-${kind}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`ops-${kind}`} className="font-display text-lg">{KIND_LABEL[kind]}</h2>
          <p className="text-sm text-muted-foreground">{role} الفروع: {[...new Set(Object.values(c).flat().map((s) => s.name))].join("، ")}</p>
        </div>
        {c.request.length > 0 && (
          <Link to={to} search={{ new: "1" }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-4" />طلب جديد</Link>
        )}
      </div>
      {q.isLoading ? <LoadingState rows={1} /> : (
        <ul className={"grid grid-cols-2 gap-3 sm:grid-cols-3 " + (GROUPS.length > 3 ? "lg:grid-cols-5" : "")}>
          {GROUPS.map((g) => {
            const n = q.data?.[g.key] ?? 0;
            const urgent = g.overdue && n > 0;
            return (
              <li key={g.key}>
                <Link to={to} search={{ tab: "requests", ...(g.status ? { status: g.status } : {}), ...(g.overdue ? { overdue: "1" } : {}) }}
                  className={"flex h-full flex-col gap-1 rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-secondary/40 " + (urgent ? "border-destructive/40 bg-destructive/5" : "")}>
                  <g.icon className={"size-4 " + (urgent ? "text-destructive" : "text-primary")} />
                  <span className="font-display text-2xl leading-none tabular-nums">{n}</span>
                  <span className="text-xs text-muted-foreground">{g.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link to={to} search={{ tab: "requests" }} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">سجل الطلبات كاملًا<ArrowLeft className="size-4" /></Link>
    </section>
  );
}

export function OpsHome({ orgId, me, jobs = [], pc = false }: { orgId: string | null; me: MtMe | undefined; jobs?: string[]; pc?: boolean }) {
  if (!orgId) return null;
  const kinds = me?.caps ? (["school", "bus"] as Kind[]).filter((k) => Object.values(me.caps![k]).some((s) => s.length)) : [];
  return (
    <div className="space-y-5">
      {jobs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4 text-sm">
          <span className="font-semibold">أدوارك:</span>{jobs.map((j) => <span key={j} className="rounded-full bg-primary/10 px-3 py-1 text-primary">{j}</span>)}
        </div>
      )}
      {kinds.map((k) => <KindBlock key={k} orgId={orgId} kind={k} me={me!} />)}
      {pc && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-5 shadow-sm">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Wallet className="size-5" /></span>
          <div className="min-w-0 flex-1"><h2 className="font-display text-lg">المشتريات والعهد</h2><p className="text-sm text-muted-foreground">عهدك وفواتيرها وطلبات الشراء المسندة إليك.</p></div>
          <Link to="/app/procurement" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">فتح المشتريات<ArrowLeft className="size-4" /></Link>
        </section>
      )}
    </div>
  );
}
