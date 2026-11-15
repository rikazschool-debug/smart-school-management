import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { db } from "@/components/crud-page";
import { Toaster } from "@/components/ui/sonner";
import { GENERAL_NOTIFICATIONS_FILTER } from "@/lib/notification-filter";
import { newArrivals, type UnreadNotice } from "@/lib/notification-sections";

export type UnreadRow = UnreadNotice & { title: string; body: string | null; created_at: string };
const TOASTER = "notif";

/** Unread general notifications (RLS: own rows); refreshed live by the «notif» signal. */
export function useUnreadNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ["notif-unread-list"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("notifications").select("id,title,body,link,created_at").or(GENERAL_NOTIFICATIONS_FILTER).is("read_at", null).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as UnreadRow[];
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return async (ids: string[]) => {
    if (!ids.length) return;
    await db.rpc("mark_notifications_read", { _ids: ids });
    for (const k of ["notifications", "notif-unread", "notif-unread-list"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

/** Bottom-left pop-up for each newly arrived notification; clicking opens its section. */
export function NotificationToasts({ list }: { list: UnreadRow[] | undefined }) {
  const seen = useRef<Set<string> | null>(null);
  const navigate = useNavigate();
  const markRead = useMarkRead();
  useEffect(() => {
    if (!list) return;
    const fresh = newArrivals(seen.current, list).slice(0, 3);
    seen.current = new Set([...(seen.current ?? []), ...list.map((n) => n.id)]);
    for (const n of fresh) {
      toast.custom((t) => (
        <button type="button" dir="rtl"
          onClick={() => { toast.dismiss(t); void markRead([n.id]); navigate({ href: n.link ?? "/app/notifications" }); }}
          className="flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-border bg-background p-4 text-start text-foreground shadow-lg transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Bell className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-6">{n.title}</span>
            {n.body && <span className="mt-0.5 line-clamp-3 block text-sm text-muted-foreground">{n.body}</span>}
            <span className="mt-1 block text-xs text-primary">اضغط لفتح القسم</span>
          </span>
        </button>
      ), { toasterId: TOASTER, id: `notif-${n.id}`, duration: 6000 });
    }
  }, [list, navigate, markRead]);
  return <Toaster id={TOASTER} dir="rtl" position="bottom-left" />;
}

export function SectionBadge({ n, label }: { n: number; label?: string }) {
  if (!n) return null;
  return <span aria-label={`${n} إشعار جديد${label ? ` في ${label}` : ""}`} className="ms-auto min-w-5 shrink-0 rounded-full bg-destructive px-1.5 text-center text-[11px] font-bold leading-5 text-destructive-foreground">{n > 99 ? "99+" : n}</span>;
}

/** Opening a section clears its counter: marks that section's unread notifications read once. */
export function SectionReadSync({ ids }: { ids: string[] }) {
  const markRead = useMarkRead();
  const key = ids.join(",");
  const done = useRef("");
  useEffect(() => {
    if (!key || done.current === key) return;
    done.current = key;
    void markRead(key.split(","));
  }, [key, markRead]);
  return null;
}
