// Shows the scheduled absence-review run for today (att_tick_status). The manual refresh button stays an exception tool.
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { db, type Row } from "@/components/crud-page";

const fmt = (v?: string | null) => v ? new Date(v).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";

export function TickStatus({ schoolId }: { schoolId: string }) {
  const q = useQuery({ queryKey: ["att-tick", schoolId], refetchInterval: 60000, queryFn: async () => { const { data, error } = await db.rpc("att_tick_status", { _school: schoolId }); if (error) throw error; return data as Row; } });
  const d = q.data; if (!d) return null;
  const today = d["today"] as Row | null;
  const cutoff = d["cutoff"] ? String(d["cutoff"]).slice(0, 5) : null;
  const tone = d["overdue"] || today?.["status"] === "failed" ? "border-destructive bg-destructive/5" : "bg-card";
  return (
    <div data-testid="tick-status" className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${tone}`}>
      {d["overdue"] || today?.["status"] === "failed" ? <AlertTriangle className="size-4 text-destructive" /> : today?.["status"] === "ok" ? <CheckCircle2 className="size-4 text-primary" /> : <Clock className="size-4 text-muted-foreground" />}
      <span className="font-semibold">الحصر التلقائي للغياب:</span>
      {!d["school_day"] ? <span>اليوم ليس يوم دراسة</span>
        : today?.["status"] === "ok" ? <span>تم اليوم الساعة {fmt(today["ran_at"])} — أضيف {today["added"]} للمراجعة</span>
        : today?.["status"] === "failed" ? <span>فشل آخر تشغيل ({fmt(today["ran_at"])}) — ستُعاد المحاولة تلقائيًا خلال 10 دقائق</span>
        : <span>مجدول بعد الساعة {cutoff ?? "—"}</span>}
      {d["overdue"] && <span className="font-semibold text-destructive">متأخر عن موعده بأكثر من 30 دقيقة — استخدم «تحديث قائمة الغياب» وأبلغ الدعم</span>}
      <span className="ms-auto text-muted-foreground">آخر حصر ناجح: {fmt(d["last_ok_at"] as string)}</span>
    </div>
  );
}
