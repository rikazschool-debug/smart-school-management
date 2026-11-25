import { useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, KeyRound, Boxes, ScrollText, Webhook, Inbox, Compass, BookOpen, type LucideIcon } from "lucide-react";
import { KeysTab } from "./keys";
import { ResourcesTab } from "./resources";
import { DocsTab, ExplorerTab, InboxTab, LogsTab, OverviewTab, WebhooksTab } from "./panels";

export type IntTab = "overview" | "keys" | "resources" | "logs" | "webhooks" | "inbox" | "explorer" | "docs";
export const INT_TABS: { k: IntTab; l: string; i: LucideIcon }[] = [
  { k: "overview", i: LayoutDashboard, l: "نظرة عامة" }, { k: "keys", i: KeyRound, l: "المفاتيح والأنظمة" }, { k: "resources", i: Boxes, l: "إدارة موارد API" }, { k: "logs", i: ScrollText, l: "سجل الطلبات" }, { k: "webhooks", i: Webhook, l: "إشعارات Webhooks" },
  { k: "inbox", i: Inbox, l: "العمليات الواردة" }, { k: "explorer", i: Compass, l: "مستكشف API" }, { k: "docs", i: BookOpen, l: "التوثيق" },
];

export function IntegrationsPage({ orgId, tab }: { orgId: string; tab: IntTab }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <nav className="overflow-x-auto rounded-2xl border bg-card p-1.5 shadow-sm">
        <div className="flex min-w-max gap-1">
          {INT_TABS.map((t) => {
            const on = tab === t.k;
            return (
              <button key={t.k} aria-current={on ? "page" : undefined} onClick={() => navigate({ to: "/app/integrations", search: { tab: t.k } })}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <t.i className="h-4 w-4 shrink-0" />{t.l}
              </button>
            );
          })}
        </div>
      </nav>
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
