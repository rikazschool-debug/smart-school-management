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
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {INT_TABS.map((t) => {
          const on = tab === t.k;
          return (
            <button key={t.k} aria-current={on ? "page" : undefined} onClick={() => navigate({ to: "/app/integrations", search: { tab: t.k } })}
              className={`group flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-all ${on ? "border-primary bg-primary text-primary-foreground shadow-md" : "bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${on ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"}`}><t.i className="h-4 w-4" /></span>
              <span className="min-w-0 truncate text-sm font-semibold">{t.l}</span>
            </button>
          );
        })}
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
