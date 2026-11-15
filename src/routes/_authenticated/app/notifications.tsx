import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";
import { GENERAL_NOTIFICATIONS_FILTER } from "@/lib/notification-filter";

export const Route = createFileRoute("/_authenticated/app/notifications")({ component: Page, head: () => ({ meta: [{ title: "الإشعارات — ركاز" }, { name: "description", content: "إشعارات المدرسة داخل ركاز." }, { property: "og:title", content: "الإشعارات — ركاز" }, { property: "og:description", content: "إشعارات المدرسة داخل ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }) });

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await db.from("notifications").select("*").or(GENERAL_NOTIFICATIONS_FILTER).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as Row[];
    },
  });
  async function markRead(ids: string[] | null) {
    await db.rpc("mark_notifications_read", { _ids: ids });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notif-unread"] });
    qc.invalidateQueries({ queryKey: ["notif-unread-list"] });
  }
  const unread = q.data?.filter((n) => !n["read_at"]).length ?? 0;
  return (
    <>
      <PageHeader title="الإشعارات" />
      {unread > 0 && <Button variant="outline" size="sm" className="mb-4" onClick={() => markRead((q.data ?? []).filter((n) => !n["read_at"]).map((n) => n["id"]))}>تعليم الكل كمقروء ({unread})</Button>}
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد إشعارات" /> : (
        <ul className="space-y-2">
          {q.data.map((n) => (
            <li key={n["id"]}>
              <button
                className={`w-full rounded-xl border p-4 text-start transition hover:bg-muted ${n["read_at"] ? "bg-card" : "border-primary/40 bg-primary/5"}`}
                onClick={async () => {
                  if (!n["read_at"]) await markRead([n["id"]]);
                  if (n["link"]) navigate({ href: n["link"] });
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{n["title"]}</p>
                  {!n["read_at"] && <span className="size-2 rounded-full bg-primary" aria-label="غير مقروء" />}
                </div>
                {n["body"] && <p className="mt-1 text-sm text-muted-foreground">{n["body"]}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{new Date(n["created_at"]).toLocaleString("ar")}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
