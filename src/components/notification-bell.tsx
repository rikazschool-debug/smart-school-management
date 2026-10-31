import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { db } from "@/components/crud-page";

export function NotificationBell() {
  const q = useQuery({
    queryKey: ["notif-unread"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const n = q.data ?? 0;
  return (
    <Link to="/app/notifications" className="relative ms-auto rounded-full p-2 hover:bg-muted" aria-label={`الإشعارات${n ? ` (${n} غير مقروء)` : ""}`}>
      <Bell className="size-5" />
      {n > 0 && <span className="absolute -top-0.5 -end-0.5 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-5 text-destructive-foreground">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
