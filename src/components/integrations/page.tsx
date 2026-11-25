import { useNavigate } from "@tanstack/react-router";
import { KeysTab } from "./keys";
import { ResourcesTab } from "./resources";
import { DocsTab, ExplorerTab, InboxTab, LogsTab, OverviewTab, WebhooksTab } from "./panels";

export type IntTab = "overview" | "keys" | "resources" | "logs" | "webhooks" | "inbox" | "explorer" | "docs";
export const INT_TABS: { k: IntTab; l: string }[] = [
  { k: "overview", l: "نظرة عامة" }, { k: "keys", l: "المفاتيح والأنظمة" }, { k: "resources", l: "إدارة موارد API" }, { k: "logs", l: "سجل الطلبات" }, { k: "webhooks", l: "إشعارات Webhooks" },
  { k: "inbox", l: "العمليات الواردة" }, { k: "explorer", l: "مستكشف API" }, { k: "docs", l: "التوثيق" },
];

export function IntegrationsPage({ orgId, tab }: { orgId: string; tab: IntTab }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {INT_TABS.map((t) => (
          <button key={t.k} onClick={() => navigate({ to: "/app/integrations", search: { tab: t.k } })} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab orgId={orgId} />}
      {tab === "keys" && <KeysTab orgId={orgId} />}
      {tab === "resources" && <ResourcesTab orgId={orgId} />}
      {tab === "logs" && <LogsTab orgId={orgId} />}
      {tab === "webhooks" && <WebhooksTab orgId={orgId} />}
      {tab === "inbox" && <InboxTab orgId={orgId} />}
      {tab === "explorer" && <ExplorerTab orgId={orgId} />}
      {tab === "docs" && <DocsTab />}
    </div>
  );
}
