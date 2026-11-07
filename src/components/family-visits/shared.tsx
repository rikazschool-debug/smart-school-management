import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/components/hr/shared";
import { Pill, addDays, dayName, riyadhToday } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";

/** Guardian visits (gv_*): every rule lives in SQL; these are display mirrors only. */
export type Visit = {
  id: string; rev: number; school_id: string; school: string; student_id: string; student: string; section: string | null; guardian: string;
  host_id: string | null; host: string | null; slot_date: string; slot_time: string; status: string; source: "school" | "guardian";
  arrived_at: string | null; left_at: string | null; reason_cat?: string; details?: string | null; awaiting?: "guardian" | "school" | null;
  conf_date?: string | null; conf_time?: string | null; proposed_by?: string | null; decision_reason?: string | null; internal_note?: string | null;
  guardian_phone?: string | null; guardian_id_tail?: string; created_at?: string;
};
export type VisitDetail = Visit & { level: "full" | "family" | "reception"; side: "guardian" | "school" | null; reception: boolean; can_note: boolean;
  events: { action: string; at: string; by: string | null; details: Record<string, unknown>; internal: boolean }[] };
export type Caps = { view: boolean; manage: boolean; settings: boolean; reception: boolean; host: boolean; guardian: boolean; configured: boolean };

export const STATUS: Record<string, [string, "muted" | "warn" | "ok" | "bad"]> = {
  pending: ["بانتظار التأكيد", "warn"], proposed: ["مقترح تعديل", "warn"], confirmed: ["مؤكدة", "ok"], rejected: ["مرفوضة", "bad"],
  cancelled: ["ملغاة", "bad"], arrived: ["حضر", "ok"], no_show: ["لم يحضر", "bad"], completed: ["مكتملة", "muted"], expired: ["انقضى الموعد", "muted"],
};
export const REASONS: Record<string, string> = { academic: "أكاديمي", behavior: "سلوكي", attendance: "الحضور والغياب", health: "صحي", admin: "إداري", other: "أخرى" };
export const SOURCE: Record<string, string> = { school: "استدعاء من المدرسة", guardian: "طلب من ولي الأمر" };
export const EVENT: Record<string, string> = {
  create: "أُنشئت الزيارة", confirm: "تأكيد الموعد", propose: "اقتراح موعد بديل", keep: "رفض التعديل والإبقاء على الموعد المؤكد", decline: "رفض / اعتذار",
  cancel: "إلغاء", arrive: "تسجيل الوصول", no_show: "لم يحضر", depart: "تسجيل المغادرة", note: "ملاحظة داخلية", host: "تغيير المسؤول", expired: "انقضى الموعد دون تأكيد", proposal_expired: "انقضى الموعد المقترح وبقي الموعد المؤكد",
};
export const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function StatusPill({ s }: { s: string }) { const [l, t] = STATUS[s] ?? [s, "muted" as const]; return <Pill tone={t}>{l}</Pill>; }

/** Who must act next, in words both sides understand. */
export function awaitingText(v: Visit, mySide: "guardian" | "school" | null) {
  if (!["pending", "proposed"].includes(v.status) || !v.awaiting) return null;
  if (mySide && v.awaiting === mySide) return "بانتظار ردك";
  return v.awaiting === "guardian" ? "بانتظار رد ولي الأمر" : "بانتظار رد المدرسة";
}

/** Free slots from the server (school settings, closures, past times and taken slots already applied). */
export function SlotPicker({ school, exclude, value, onChange }: { school: string; exclude?: string | undefined; value: { d: string; t: string } | null; onChange: (v: { d: string; t: string }) => void }) {
  const from = riyadhToday();
  const to = addDays(from, 20);
  const q = useQuery({
    queryKey: ["gv-slots", school, from, exclude ?? null],
    refetchInterval: 20_000,
    queryFn: () => rpc<{ day: string; at: string; free: boolean }[]>("gv_slots", { _school: school, _from: from, _to: to, _exclude: exclude ?? null }),
  });
  if (q.isLoading) return <p className="text-xs text-muted-foreground">جارٍ تحميل المواعيد…</p>;
  if (q.error) return <p className="text-xs text-destructive">{arabicError(q.error)}</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">لا توجد مواعيد زيارة متاحة خلال الأسابيع الثلاثة القادمة. قد تكون المدرسة لم تضبط مواعيد الزيارة بعد.</p>;
  const days = [...new Set(rows.map((r) => r.day))];
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-2" role="group" aria-label="المواعيد المتاحة">
      {days.map((d) => (
        <div key={d}>
          <p className="mb-1 text-xs font-semibold">{dayName(d)} {d}</p>
          <div className="flex flex-wrap gap-1">
            {rows.filter((r) => r.day === d).map((r) => {
              const on = value?.d === d && value?.t === r.at;
              return (
                <button key={r.at} type="button" disabled={!r.free} aria-pressed={on} onClick={() => onChange({ d, t: r.at })}
                  className={`min-h-9 rounded-md border px-2 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : r.free ? "hover:bg-muted" : "cursor-not-allowed bg-muted text-muted-foreground line-through"}`}>
                  {r.at}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
