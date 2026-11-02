import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/components/crud-page";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Pill, riyadhDate, riyadhTime } from "@/components/admin/shared";
import { RSVP } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";

/** Staff virtual meetings inside Communication. Same adm_meetings record as School administration/calendar; membership comes from the invitation, never a manual group. */
export function MeetingsTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["comm-meetings"],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_my_virtual_meetings" as never);
      if (error) throw error;
      return data as Row[];
    },
    refetchInterval: 30000,
  });
  useEffect(() => {
    const ch = supabase.channel(`comm-meet-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "adm_meetings" }, () => qc.invalidateQueries({ queryKey: ["comm-meetings"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="لا توجد اجتماعات افتراضية" hint="تظهر هنا الاجتماعات الافتراضية التي دُعيت إليها أو نظّمتها بعد إرسال الدعوات." />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {q.data.map((m) => {
        const live = m.live_status === "live";
        const ended = m.live_status === "ended" || m.status === "held";
        return (
          <li key={m.id} className="space-y-2 rounded-xl border bg-card p-4" data-testid="comm-meeting">
            <div className="flex flex-wrap items-center gap-2">
              <Mic className="size-4 text-primary" aria-hidden />
              <Link to="/app/admin/meetings/$id" params={{ id: m.id }} className="font-semibold hover:underline">{m.title}</Link>
              <Pill tone={live ? "ok" : ended ? "muted" : "warn"}>{live ? "مباشر الآن" : ended ? "انتهى" : "مجدول"}</Pill>
              {m.my_rsvp && <Pill>{RSVP[m.my_rsvp]}</Pill>}
            </div>
            <p className="text-sm text-muted-foreground">{riyadhDate(m.starts_at)} {riyadhTime(m.starts_at)} · {m.duration_min} دقيقة · المنظم: {m.organizer_name}{m.school_name ? ` · ${m.school_name}` : ""}</p>
            {!ended && (
              <Button asChild size="sm" variant={live ? "default" : "outline"} className="min-h-10">
                <Link to="/app/admin/room/$id" params={{ id: m.id }}>{live ? "انضمام" : m.am_organizer ? "فتح الغرفة للبدء" : "فتح الغرفة"}</Link>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
