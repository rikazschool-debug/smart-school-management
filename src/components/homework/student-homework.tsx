import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Clock3, TrendingUp } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";
import { SUB_STATUS, schoolTime, statusTone } from "@/lib/homework";
import { usePageMeta } from "@/lib/page-meta";

const Badge = ({ s, map }: { s: string; map: Record<string, string> }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(s)}`}>{map[s] ?? s}</span>
);

/** A student's own homework list (student page, guardian page, child overview). Lives outside the route file so routes stay split. */
export function StudentHomework({ studentId, guardian, kind }: { studentId: string; guardian?: boolean; kind?: "homework" | "test" }) {
  const [tab, setTab] = useState<"due" | "late" | "done" | "returned" | "all">("due");
  const schoolAppearance = usePageMeta()?.appearance === "school";
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
  const rows = (list.data ?? []).filter((r) => !kind || (r["kind"] ?? "homework") === kind);
  const pending = (r: Row) => ["none", "draft"].includes(r["sub_status"]) && !r["removed"] && r["status"] !== "archived";
  const groups = {
    due: rows.filter((r) => pending(r) && new Date(r["effective_due"]).getTime() >= now),
    late: rows.filter((r) => pending(r) && new Date(r["effective_due"]).getTime() < now),
    returned: rows.filter((r) => r["sub_status"] === "returned"),
    done: rows.filter((r) => ["submitted", "resubmitted", "paper"].includes(r["sub_status"])),
    all: rows,
  };
  const labels = { due: "المطلوب والقادم", late: "فات موعده", returned: "معاد للاستكمال", done: "المسلّم", all: "الكل" };
  const published = kind === "test" && schoolAppearance ? rows.filter((r) => r["result_published"] === true) : [];
  return (
    <>
      {published.length > 0 && <section aria-label="نتائج الاختبارات المنشورة" className="workspace-feature mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg px-5 py-4 sm:px-7">
        <div className="min-w-0"><p className="text-sm font-semibold">نتائج الاختبارات المنشورة</p><p className="mt-1 font-display text-3xl tabular-nums">{published.length}</p></div>
        <TrendingUp aria-hidden className="size-7 shrink-0 text-workspace-feature-accent" />
      </section>}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{labels[k]} ({groups[k].length})</Button>
        ))}
      </div>
      {!groups[tab].length ? <EmptyState title={kind === "test" ? "لا توجد اختبارات هنا" : "لا توجد واجبات هنا"} /> : (
        <ul className={schoolAppearance ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
          {groups[tab].map((r) => schoolAppearance ? (
            <li key={r["id"]} className="rounded-lg border bg-card p-4">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><BookOpen className="size-4" /></span>
                <div className="min-w-0">
                  <p className="wrap-break-word text-xs text-muted-foreground">{r["subject"]}</p>
                  <Link to="/app/homework/$id" params={{ id: r["id"] }} search={guardian ? { student: studentId } : {}} className="wrap-break-word font-bold hover:text-primary hover:underline">{r["title"]}</Link>
                </div>
                <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label={`فتح ${r["title"]}`} title={`فتح ${r["title"]}`}><Link to="/app/homework/$id" params={{ id: r["id"] }} search={guardian ? { student: studentId } : {}}><ArrowLeft aria-hidden /></Link></Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                <Badge s={r["sub_status"]} map={SUB_STATUS} />
                <span className="inline-flex items-center gap-1"><Clock3 aria-hidden className="size-3 shrink-0" />{schoolTime(r["effective_due"])}{r["effective_due"] !== r["due_at"] && " (ممدد)"}</span>
              </div>
              {r["last_late"] && <p className="mt-2 text-xs text-destructive">سُلّم متأخرًا</p>}
              {r["removed"] && <p className="mt-2 text-xs text-muted-foreground">انتقل الطالب من الشعبة — السجل للاطلاع</p>}
              <p className="mt-2 text-sm">{r["result_published"] ? (r["score"] != null ? `الدرجة: ${r["score"]} من ${r["max_score"]}` : "ظهرت الملاحظات") : r["max_score"] == null ? "واجب دون درجة" : "لم تُصحَّح بعد"}</p>
              {r["result_published"] && r["score"] != null && Number(r["max_score"]) > 0 && (
                <progress className="workspace-score mt-2 block h-1.5 w-full overflow-hidden rounded-full" aria-label={`درجة ${r["title"]}`} value={Number(r["score"])} max={Number(r["max_score"])} />
              )}
            </li>
          ) : (
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
