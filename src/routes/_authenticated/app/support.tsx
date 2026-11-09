import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { NO_CAPS, useSupportCaps } from "@/components/support/caps";
import { useSession } from "@/lib/session";
import { supportTabs, type SupportTab } from "@/lib/roles";
import { SupportSummary } from "@/components/support/summary";
import { CallsPanel, LivePanel, FollowupsPanel, MQ_LABEL, MqSettingsPanel, ReportsPanel, mqSections, useMqCaps, type MqSection } from "@/components/support/calls";
import { HoursNote, InfoInbox, NewTicket, SupportReports, SupportSettings, TAB_LABEL, TicketDetail, TicketList } from "@/components/support/support";

type Search = { t?: string; tab?: SupportTab | "settings"; st?: string; mq?: MqSection };

export const Route = createFileRoute("/_authenticated/app/support")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["t"] === "string" ? { t: s["t"] } : {}),
    ...(typeof s["st"] === "string" ? { st: s["st"] } : {}),
    ...(["live", "calls", "followups", "reports", "settings"].includes(s["mq"] as string) ? { mq: s["mq"] as MqSection } : {}),
    ...(["summary", "mine", "assigned", "following", "info", "manage", "reports", "settings"].includes(s["tab"] as string) ? { tab: s["tab"] as SupportTab | "settings" } : {}),
  }),
  head: () => ({ meta: [{ title: "الدعم والمساعدة — ركاز" }, { name: "description", content: "تذاكر الدعم والمساعدة في ركاز." }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { active, user } = useSession();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/support" });
  const [creating, setCreating] = useState(false);
  const caps = useSupportCaps(active && active.role !== "platform_admin" ? active.orgId : null);
  const mqc = useMqCaps(active && active.role !== "platform_admin" ? active.orgId : null);
  if (!active) return <ForbiddenState />;
  if (active.role !== "platform_admin" && caps.isLoading) return <LoadingState />;
  const c = caps.data ?? NO_CAPS;
  const tabs = supportTabs(active.role, c.view.length > 0);
  const settings = active.role === "platform_admin" || c.settings;
  const tab = search.tab && (search.tab === "settings" ? settings : tabs.includes(search.tab)) ? search.tab : tabs[0]!;
  const canCreate = tabs.includes("mine");
  const internal = c.create.length > 0;
  const ctx = { ...active };
  const go = (s: Search) => navigate({ search: s });
  const mqs = mqc.data ? mqSections(mqc.data) : [];
  const mq = search.mq && mqs.includes(search.mq) ? search.mq : null;
  const orgId = active.orgId;

  return (
    <div className="space-y-4">
      <PageHeader
        title="الدعم والمساعدة"
        desc={active.role === "platform_admin" ? "تذاكر دعم المنصة من ملاك المؤسسات ومديري المدارس." : "أرسل طلب مساعدة وتابع الرد عليه."}
        action={canCreate && !search.t && !creating ? <Button onClick={() => setCreating(true)}><Plus className="size-4" /> تذكرة جديدة</Button> : undefined}
      />
      {mqs.length > 0 && !search.t && !creating && (
        <div role="tablist" aria-label="أقسام الدعم" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
          {[null, ...mqs].map((k) => (
            <button key={k ?? "tickets"} role="tab" aria-selected={mq === k} onClick={() => go(k ? { mq: k } : {})}
              className={`rounded-lg px-3 py-1.5 text-sm ${mq === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{k ? MQ_LABEL[k] : "التذاكر"}</button>
          ))}
        </div>
      )}
      {mq && orgId && mqc.data ? (
        mq === "live" ? <LivePanel orgId={orgId} caps={mqc.data} assignable={c.assign_new} /> : mq === "calls" ? <CallsPanel orgId={orgId} caps={mqc.data} /> : mq === "followups" ? <FollowupsPanel orgId={orgId} onOpenCalls={() => go({ mq: "calls" })} />
          : mq === "reports" ? <ReportsPanel orgId={orgId} caps={mqc.data} /> : <MqSettingsPanel orgId={orgId} />
      ) : <>
      <HoursNote orgId={active.role === "platform_admin" ? null : active.orgId} />
      {search.t ? (
        <TicketDetail id={search.t} ctx={ctx} userId={user.id} onBack={() => go({ tab })} />
      ) : creating ? (
        <NewTicket internal={internal} branches={c.create} assignable={c.assign_new} ctx={ctx} onCancel={() => setCreating(false)} onDone={(id) => { setCreating(false); go({ t: id }); }} />
      ) : (
        <>
          {(tabs.length > 1 || settings) && (
            <div role="tablist" className="flex flex-wrap gap-1 border-b lg:hidden">
              {[...tabs, ...(settings ? (["settings"] as const) : [])].map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => go({ tab: k })}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {k === "settings" ? "الإعدادات والتصنيفات" : TAB_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          {tab === "settings" ? <SupportSettings ctx={ctx} /> : tab === "summary" ? <SupportSummary ctx={ctx} onPick={(k, st) => go({ tab: k, ...(st ? { st } : {}) })} /> : tab === "info" ? <InfoInbox /> : tab === "reports" ? <SupportReports ctx={ctx} /> : <TicketList key={tab + (search.st ?? "")} initialStatus={search.st} ctx={ctx} caps={c} box={tab} onOpen={(id) => go({ t: id, tab, ...(search.st ? { st: search.st } : {}) })} />}
        </>
      )}
      </>}
    </div>
  );
}
