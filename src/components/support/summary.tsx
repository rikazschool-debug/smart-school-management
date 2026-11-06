import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError, type AppContext } from "@/lib/session";
import type { SupportTab } from "@/lib/roles";

// KPIs come from support_summary (scoped by support_manager on the server); each card opens the matching filtered list.
type S = { open: number; unassigned: number; waiting: number; overdue: number; resolved: number; mine_assigned: number };
const CARDS: [keyof S, string, SupportTab, string][] = [
  ["open", "المفتوحة", "manage", "open"], ["unassigned", "بلا مسؤول", "manage", "unassigned"], ["waiting", "بانتظار رد", "manage", "waiting"],
  ["overdue", "المتأخرة", "manage", "overdue"], ["resolved", "المحلولة", "manage", "done"], ["mine_assigned", "المسندة إليّ", "assigned", "open"],
];
export function SupportSummary({ ctx, onPick }: { ctx: AppContext; onPick: (tab: SupportTab, st?: string) => void }) {
  const owner = ctx.role === "org_owner";
  const [school, setSchool] = useState("");
  const scopeSchool = owner ? school || null : ctx.schoolId;
  const branches = useQuery({ enabled: owner && !!ctx.orgId, queryKey: ["support-branches", ctx.orgId], queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", ctx.orgId!).eq("is_active", true).order("name")).data ?? []) as { id: string; name: string }[] });
  const q = useQuery({ queryKey: ["support-summary", ctx.key, scopeSchool], queryFn: async () => { const { data, error } = await db.rpc("support_summary" as never, { _school: scopeSchool } as never); if (error) throw error; return data as unknown as S; } });
  return (
    <div className="space-y-3">
      {owner && <select aria-label="المدرسة" className={selectCls("max-w-xs")} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">كل مدارس المجموعة</option>{(branches.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      {q.isLoading ? <LoadingState rows={2} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CARDS.map(([k, l, tab, st]) => (
            <button key={k} type="button" aria-label={`${l}: ${q.data![k]}`} onClick={() => onPick(tab, st)} className="rounded-xl border bg-card p-4 text-start hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="block text-2xl font-bold">{q.data![k]}</span><span className="text-sm text-muted-foreground">{l}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
