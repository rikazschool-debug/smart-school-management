import { Bus, Wrench } from "lucide-react";
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { arabicError, useSession } from "@/lib/session";
import { BusesTab, RequestDetail, RequestForm, RequestList } from "@/components/maintenance/requests";
import { canFleet, hasKind, useMtMe } from "@/components/maintenance/shared";

export type MtSearch = { tab?: "requests" | "buses"; r?: string; new?: "1"; status?: string; mine?: string; overdue?: string };

export function validateMtSearch(s: Record<string, unknown>): MtSearch {
  return {
    ...(s["tab"] === "requests" || s["tab"] === "buses" ? { tab: s["tab"] } : {}),
    ...(typeof s["r"] === "string" ? { r: s["r"] } : {}),
    ...(s["new"] === "1" || s["new"] === 1 ? { new: "1" as const } : {}),
    ...(typeof s["status"] === "string" ? { status: s["status"] } : {}),
    ...(typeof s["mine"] === "string" ? { mine: s["mine"] } : {}),
    ...(s["overdue"] === "1" ? { overdue: "1" } : {}),
  };
}

const TITLES = {
  school: { title: "إدارة صيانة المدارس", desc: "طلبات صيانة مباني المدارس ومتابعتها حتى اعتماد الإنجاز؛ ما تراه محدد بصلاحياتك وفروعك." },
  bus: { title: "إدارة تشغيل وصيانة الباصات", desc: "سجلات الباصات وحالة تشغيلها وطلبات صيانتها حتى الفحص والعودة للخدمة." },
};

/** One maintenance section: school buildings or buses — kept as two separate menu entries. */
export function MaintenancePage({ kind, sp, go }: { kind: "school" | "bus"; sp: MtSearch; go: (s: MtSearch) => void }) {
  const { active } = useSession();
  const me = useMtMe(active?.orgId ?? null);
  if (!active) return null;
  const t = TITLES[kind];
  if (me.isLoading) return <LoadingState />;
  if (me.error) return <ErrorState message={arabicError(me.error)} onRetry={() => void me.refetch()} />;
  if (!me.data?.enabled) return <><PageHeader title={t.title} /><SectionLocked /></>;
  const can = hasKind(me.data, kind);
  const fleet = kind === "bus" && (can || canFleet(me.data));
  if (!can && !fleet) return <ForbiddenState />;
  const tab = kind === "bus" ? (sp.tab ?? (can ? "requests" : "buses")) : "requests";
  let body: React.ReactNode;
  if (sp.r) body = <RequestDetail id={sp.r} back={() => go({ tab })} />;
  else if (sp.new && can) body = <RequestForm orgId={active.orgId!} kind={kind} me={me.data} onDone={(id) => go({ tab, r: id })} onCancel={() => go({ tab })} />;
  else if (tab === "buses") body = <BusesTab orgId={active.orgId!} orgName={active.orgName ?? ""} me={me.data} />;
  else body = <RequestList key={kind + (sp.status ?? "") + (sp.mine ?? "") + (sp.overdue ?? "")} orgId={active.orgId!} orgName={active.orgName ?? ""} kind={kind} me={me.data} open={(id) => go({ tab, r: id })}
    onNew={me.data.caps![kind].request.length ? () => go({ tab, new: "1" }) : undefined} preset={{ ...(sp.status ? { status: sp.status } : {}), ...(sp.mine ? { mine: sp.mine } : {}), ...(sp.overdue ? { overdue: sp.overdue } : {}) }} />;
  const tabs: ["requests" | "buses", string, typeof Wrench][] = [...(can ? [["requests", "طلبات صيانة الباصات", Wrench] as ["requests", string, typeof Wrench]] : []), ["buses", "الباصات وحالة التشغيل", Bus]];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={kind === "school" ? "إدارة صيانة المدارس" : "النقل المدرسي وصيانة الباصات"} title={t.title} desc={t.desc} />
      {kind === "bus" && !sp.r && !sp.new && (
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => go({ tab: k })}
              className={"flex min-h-9 items-center gap-2 rounded-lg px-4 text-sm " + (tab === k ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}><Icon className="size-4" />{label}</button>
          ))}
        </div>
      )}
      {body}
    </div>
  );
}
