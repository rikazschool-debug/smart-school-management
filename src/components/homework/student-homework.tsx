import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";
import { SUB_STATUS, schoolTime, statusTone } from "@/lib/homework";

const Badge = ({ s, map }: { s: string; map: Record<string, string> }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(s)}`}>{map[s] ?? s}</span>
);

/** A student's own homework list (student page, guardian page, child overview). Lives outside the route file so routes stay split. */
export function StudentHomework({ studentId, guardian }: { studentId: string; guardian?: boolean }) {
  const [tab, setTab] = useState<"due" | "late" | "done" | "returned" | "all">("due");
  const list = useQuery({
    queryKey: ["hw-student", studentId],
    queryFn: async () => {
      const { data, error } = await db.rpc("student_homework", { _student: studentId });
      if (error) throw error;
      return data as Row[];
    },
  });
  if (list.isLoading) return <LoadingState />;
  if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const now = Date.now();
  const rows = list.data ?? [];
  const pending = (r: Row) => ["none", "draft"].includes(r["sub_status"]) && !r["removed"] && r["status"] !== "archived";
  const groups = {
    due: rows.filter((r) => pending(r) && new Date(r["effective_due"]).getTime() >= now),
    late: rows.filter((r) => pending(r) && new Date(r["effective_due"]).getTime() < now),
    returned: rows.filter((r) => r["sub_status"] === "returned"),
    done: rows.filter((r) => ["submitted", "resubmitted", "paper"].includes(r["sub_status"])),
    all: rows,
  };
  const labels = { due: "المطلوب والقادم", late: "فات موعده", returned: "معاد للاستكمال", done: "المسلّم", all: "الكل" };
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{labels[k]} ({groups[k].length})</Button>
        ))}
      </div>
      {!groups[tab].length ? <EmptyState title="لا توجد واجبات هنا" /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {groups[tab].map((r) => (
            <li key={r["id"]} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link to="/app/homework/$id" params={{ id: r["id"] }} search={guardian ? { student: studentId } : {}} className="font-semibold text-primary">{r["title"]}</Link>
                <Badge s={r["sub_status"]} map={SUB_STATUS} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r["kind"] === "test" ? "اختبار" : "واجب"} · {r["subject"]}</p>
              <p className="mt-2 text-sm">الموعد: {schoolTime(r["effective_due"])}{r["effective_due"] !== r["due_at"] && " (ممدد)"}</p>
              {r["last_late"] && <p className="text-xs text-destructive">سُلّم متأخرًا</p>}
              {r["removed"] && <p className="text-xs text-muted-foreground">انتقل الطالب من الشعبة — السجل للاطلاع</p>}
              <p className="mt-1 text-sm">{r["result_published"] ? (r["score"] != null ? `الدرجة: ${r["score"]} من ${r["max_score"]}` : "ظهرت الملاحظات") : r["max_score"] == null ? "واجب دون درجة" : "لم تُصحَّح بعد"}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
