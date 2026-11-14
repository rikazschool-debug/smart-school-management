import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { Pill, RSVP, fmt, riyadhDate, riyadhTime } from "@/components/admin/shared";
import { RsvpActions } from "@/components/admin/rsvp";
import { arabicError } from "@/lib/session";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const addMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60000).toISOString();

/** Meetings inside Communication (in-person + virtual). Same adm_meetings record as School administration/calendar; membership comes from the invitation, never a manual group. */
export function MeetingsTab() {
  const qc = useQueryClient();
  const [mode, setMode] = useState("");
  const [show, setShow] = useState("upcoming");
  const q = useQuery({
    queryKey: ["comm-meetings"],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_my_meetings" as never);
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
  const isOver = (m: Row) => m.status !== "scheduled" || m.live_status === "ended";
  const rows = (q.data ?? []).filter((m) => (!mode || m.mode === mode) && (show === "all" || (show === "upcoming" ? !isOver(m) : isOver(m))));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="النوع" className={selectCls("", true)} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">كل الأنواع</option><option value="in_person">حضوري</option><option value="virtual">افتراضي</option>
        </select>
        <select aria-label="العرض" className={selectCls("", true)} value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="upcoming">القادمة والجارية</option><option value="past">المنتهية والملغاة</option><option value="all">الكل</option>
        </select>
      </div>
      {!rows.length ? <EmptyState title="لا توجد اجتماعات" hint="تظهر هنا الاجتماعات التي دُعيت إليها أو نظّمتها بعد إرسال الدعوات." /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((m) => {
            const live = m.live_status === "live";
            const over = isOver(m);
            const virtual = m.mode === "virtual";
            const statusLabel = m.status === "cancelled" ? "ملغى" : live ? "مباشر الآن" : over ? "انتهى" : "مجدول";
            return (
              <li key={m.id} className="space-y-2 rounded-xl border bg-card p-4" data-testid="comm-meeting">
                <div className="flex flex-wrap items-center gap-2">
                  {virtual ? <Mic className="size-4 text-primary" aria-hidden /> : <MapPin className="size-4 text-primary" aria-hidden />}
                  <Link to="/app/admin/meetings/$id" params={{ id: m.id }} className="font-semibold hover:underline">{m.title}</Link>
                  <Pill tone={live ? "ok" : m.status === "cancelled" ? "bad" : over ? "muted" : "warn"}>{statusLabel}</Pill>
                  <Pill>{virtual ? "افتراضي" : "حضوري"}</Pill>
                  {!m.am_organizer && m.my_rsvp && m.needs_rsvp && <Pill tone={m.my_rsvp === "accepted" ? "ok" : m.my_rsvp === "pending" ? "muted" : "bad"}>ردي: {RSVP[m.my_rsvp]}</Pill>}
                  {m.am_organizer && <Pill tone="ok">أنا المنظم</Pill>}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                  <dt className="text-muted-foreground">الموعد</dt><dd>{riyadhDate(m.starts_at)} من {riyadhTime(m.starts_at)} إلى {riyadhTime(addMin(m.starts_at, m.duration_min))}</dd>
                  <dt className="text-muted-foreground">المنظم</dt><dd>{m.organizer_name}{m.school_name ? ` · ${m.school_name}` : ""}</dd>
                  <dt className="text-muted-foreground">{virtual ? "المكان" : "القاعة"}</dt><dd>{virtual ? "غرفة صوت ومشاركة شاشة داخل ركاز" : m.location || "—"}</dd>
                  <dt className="text-muted-foreground">تاريخ الدعوة</dt><dd>{fmt(m.invited_at)}</dd>
                  {m.my_note && <><dt className="text-muted-foreground">سببي</dt><dd>{m.my_note}</dd></>}
                </dl>
                {!m.am_organizer && m.needs_rsvp && m.status === "scheduled" && !over && <RsvpActions meetingId={m.id} current={m.my_rsvp} compact />}
                {virtual && !over && (live || m.am_organizer) && (
                  <Button asChild size="sm" variant={live ? "default" : "outline"} className="min-h-10">
                    <Link to="/app/admin/room/$id" params={{ id: m.id }}>{live ? "انضمام" : "فتح الغرفة للبدء"}</Link>
                  </Button>
                )}
                {virtual && !over && !live && !m.am_organizer && <p className="text-xs text-muted-foreground">يظهر زر الانضمام عندما يبدأ المنظم الجلسة.</p>}
                {!virtual && !over && <p className="text-xs text-muted-foreground">اجتماع حضوري — لا يُفتح اتصال. قبول الدعوة لا يعني تسجيل الحضور.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
