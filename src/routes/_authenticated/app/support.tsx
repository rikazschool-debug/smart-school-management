import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForbiddenState, PageHeader } from "@/components/states";
import { useSession } from "@/lib/session";
import { supportTabs, type SupportTab } from "@/lib/roles";
import { HoursNote, NewTicket, SupportSettings, TAB_LABEL, TicketDetail, TicketList } from "@/components/support/support";

type Search = { t?: string; tab?: SupportTab | "settings" };

export const Route = createFileRoute("/_authenticated/app/support")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["t"] === "string" ? { t: s["t"] } : {}),
    ...(["mine", "assigned", "manage", "settings"].includes(s["tab"] as string) ? { tab: s["tab"] as Search["tab"] } : {}),
  }),
  head: () => ({ meta: [{ title: "الدعم والمساعدة — ركاز" }, { name: "description", content: "تذاكر الدعم والمساعدة في ركاز." }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  const { active, user } = useSession();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/support" });
  const [creating, setCreating] = useState(false);
  if (!active) return <ForbiddenState />;
  const tabs = supportTabs(active.role);
  const settings = active.role === "org_owner" || active.role === "platform_admin";
  const tab = search.tab && (search.tab === "settings" ? settings : tabs.includes(search.tab)) ? search.tab : tabs[0]!;
  const canCreate = tabs.includes("mine");
  const ctx = { ...active };
  const go = (s: Search) => navigate({ search: s });

  return (
    <div className="space-y-4">
      <PageHeader
        title="الدعم والمساعدة"
        desc={active.role === "platform_admin" ? "تذاكر دعم المنصة من ملاك المؤسسات ومديري المدارس." : "أرسل طلب مساعدة وتابع الرد عليه."}
        action={canCreate && !search.t && !creating ? <Button onClick={() => setCreating(true)}><Plus className="size-4" /> تذكرة جديدة</Button> : undefined}
      />
      <HoursNote orgId={active.role === "platform_admin" ? null : active.orgId} />
      {search.t ? (
        <TicketDetail id={search.t} ctx={ctx} userId={user.id} onBack={() => go({ tab })} />
      ) : creating ? (
        <NewTicket ctx={ctx} onCancel={() => setCreating(false)} onDone={(id) => { setCreating(false); go({ t: id }); }} />
      ) : (
        <>
          {(tabs.length > 1 || settings) && (
            <div role="tablist" className="flex flex-wrap gap-1 border-b">
              {[...tabs, ...(settings ? (["settings"] as const) : [])].map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => go({ tab: k })}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {k === "settings" ? "الإعدادات والتصنيفات" : TAB_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          {tab === "settings" ? <SupportSettings ctx={ctx} /> : <TicketList key={tab} ctx={ctx} box={tab} onOpen={(id) => go({ t: id, tab })} />}
        </>
      )}
    </div>
  );
}
