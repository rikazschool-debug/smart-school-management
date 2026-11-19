import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { Row } from "@/components/crud-page";
import { LoadingState } from "@/components/states";
import { NoData, Panel } from "@/components/dashboard/kit";

const STATUS: Record<string, string> = { draft: "مسودة", scheduled: "مجدول", published: "منشور", closed: "مغلق", cancelled: "ملغى" };
const ORDER = ["published", "scheduled", "draft", "closed", "cancelled"];

/** Counts per status for one kind (homework|test) plus how many open items are due in the next 7 days. */
export function workSummary(rows: Row[], kind: "homework" | "test", now = Date.now()) {
  const mine = rows.filter((r) => (kind === "test" ? r["kind"] === "test" : r["kind"] !== "test"));
  const by = ORDER.map((s) => ({ key: s, name: STATUS[s]!, value: mine.filter((r) => r["status"] === s).length })).filter((x) => x.value);
  const dueSoon = mine.filter((r) => r["status"] === "published" && r["due_at"] && Date.parse(r["due_at"]) > now && Date.parse(r["due_at"]) < now + 7 * 864e5).length;
  return { total: mine.length, by, dueSoon };
}

/** «الواجبات والاختبارات»: quick switch between the two sections; each opens its own page. */
export function WorkPanel({ rows, homework, tests }: { rows: Row[] | undefined; homework: boolean; tests: boolean }) {
  const [kind, setKind] = useState<"homework" | "test">(homework ? "homework" : "test");
  if (!homework && !tests) return null;
  const to = kind === "test" ? "/app/tests" : "/app/homework";
  const s = rows ? workSummary(rows, kind) : null;
  const btn = (on: boolean) => `rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`;
  return (
    <Panel title="الواجبات والاختبارات" to={to} cta={kind === "test" ? "صفحة الاختبارات" : "صفحة الواجبات"}>
      <div className="mb-3 flex gap-2" role="tablist" aria-label="الواجبات أو الاختبارات">
        {homework && <button type="button" role="tab" aria-selected={kind === "homework"} className={btn(kind === "homework")} onClick={() => setKind("homework")}>الواجبات</button>}
        {tests && <button type="button" role="tab" aria-selected={kind === "test"} className={btn(kind === "test")} onClick={() => setKind("test")}>الاختبارات</button>}
      </div>
      {!s ? <LoadingState rows={2} /> : !s.total ? <NoData text={kind === "test" ? "لا توجد اختبارات بعد" : "لا توجد واجبات بعد"} /> : (
        <Link to={to} className="block rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-secondary/40">
          <div className="flex items-baseline justify-between gap-2">
            <p><b className="font-display text-3xl tabular-nums">{s.total}</b> <span className="text-sm text-muted-foreground">{kind === "test" ? "اختبار" : "واجب"}</span></p>
            <span className="text-xs text-muted-foreground">{s.dueSoon} يستحق خلال 7 أيام</span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {s.by.map((x) => <li key={x.key} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">{x.name} <b className="tabular-nums">{x.value}</b></li>)}
          </ul>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">فتح القسم<ArrowLeft className="size-3.5" /></span>
        </Link>
      )}
    </Panel>
  );
}
