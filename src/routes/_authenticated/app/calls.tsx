import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { NO_CAPS, useSupportCaps } from "@/components/support/caps";
import { useSession } from "@/lib/session";
import { CallsPanel, LivePanel, FollowupsPanel, MQ_LABEL, MqSettingsPanel, ReportsPanel, mqSections, useMqCaps, type MqSection } from "@/components/support/calls";

type Search = { mq?: MqSection };

export const Route = createFileRoute("/_authenticated/app/calls")({
  validateSearch: (s: Record<string, unknown>): Search => (["live", "calls", "followups", "reports", "settings"].includes(s["mq"] as string) ? { mq: s["mq"] as MqSection } : {}),
  head: () => ({ meta: [{ title: "المكالمات الهاتفية — ركاز" }, { name: "description", content: "لوحة الاتصال وسجل المكالمات والمتابعات وتقارير الاتصال." }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/calls" });
  const orgId = active && active.role !== "platform_admin" ? active.orgId : null;
  const mqc = useMqCaps(orgId);
  const caps = useSupportCaps(orgId);
  if (!active || !orgId) return <ForbiddenState />;
  if (mqc.isLoading) return <LoadingState />;
  const secs = mqc.data ? mqSections(mqc.data) : [];
  if (!secs.length || !mqc.data) return <ForbiddenState />;
  const mq = search.mq && secs.includes(search.mq) ? search.mq : secs[0]!;
  const c = caps.data ?? NO_CAPS;
  return (
    <div className="space-y-4">
      <PageHeader title="المكالمات الهاتفية" desc="لوحة الاتصال والمكالمات والمتابعات — التذاكر تبقى في «الدعم الفني والمساعدة»." />
      <div role="tablist" aria-label="أقسام المكالمات" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1 lg:hidden">
        {secs.map((k) => (
          <button key={k} role="tab" aria-selected={mq === k} onClick={() => navigate({ search: { mq: k } })}
            className={`rounded-lg px-3 py-1.5 text-sm ${mq === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{MQ_LABEL[k]}</button>
        ))}
      </div>
      {mq === "live" ? <LivePanel orgId={orgId} caps={mqc.data} assignable={c.assign_new} /> : mq === "calls" ? <CallsPanel orgId={orgId} caps={mqc.data} />
        : mq === "followups" ? <FollowupsPanel orgId={orgId} onOpenCalls={() => navigate({ search: { mq: "calls" } })} />
        : mq === "reports" ? <ReportsPanel orgId={orgId} caps={mqc.data} /> : <MqSettingsPanel orgId={orgId} />}
    </div>
  );
}
