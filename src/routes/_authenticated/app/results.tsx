import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { RequireSchool } from "@/components/require-school";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/states";
import { ExportButtons } from "@/components/list-tools";
import { ENTRY_STATUS } from "@/components/grades/common";
import { arabicError, type AppContext } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/results")({
  head: () => ({ meta: [{ title: "النتائج — ركاز" }, { name: "description", content: "النتائج المنشورة للطالب ولأبناء ولي الأمر." },
    { property: "og:title", content: "النتائج — ركاز" }, { property: "og:description", content: "النتائج المنشورة في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  return <RequireSchool nav="results">{(ctx) => <Results ctx={ctx} />}</RequireSchool>;
}

// Only the current published version is readable by the family (RLS: superseded_at is null + own child / self).
function Results({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const q = useQuery({ queryKey: ["my-results", ctx.schoolId], queryFn: async () => {
    const { data, error } = await db.from("grade_results").select("id, student_id, student_name, section_name, subject_name, period_name, items, total, max_total, complete, version, published_at, change_note").is("superseded_at", null).eq("school_id", ctx.schoolId).order("published_at", { ascending: false });
    if (error) throw error; return data as Row[];
  } });
  const byStudent = new Map<string, Row[]>();
  for (const r of q.data ?? []) byStudent.set(r["student_id"], [...(byStudent.get(r["student_id"]) ?? []), r]);
  return (
    <>
      <PageHeader title="النتائج" desc="تظهر هنا النتائج بعد اعتمادها ونشرها من إدارة المدرسة فقط." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !byStudent.size ? <EmptyState title="لا توجد نتائج منشورة بعد" /> :
        [...byStudent.values()].map((rows) => (
          <Section key={rows[0]!["student_id"]} title={rows[0]!["student_name"]} desc={rows[0]!["section_name"] ?? ""}
            action={<ExportButtons title={`نتائج ${rows[0]!["student_name"]}`} school={ctx.schoolName} headers={["المادة", "الفترة", "البنود", "المجموع"]} rows={() => rows.map((r) => [r["subject_name"], r["period_name"], (r["items"] as Row[]).map((i) => `${i["name"]}: ${i["status"] === "score" ? `${i["score"]}/${i["max"]}` : ENTRY_STATUS[i["status"]]}`).join(" • "), r["total"] != null ? `${r["total"]} / ${r["max_total"]}` : "غير مكتمل"])} />}>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <div key={r["id"]} className="rounded-xl border bg-card p-4" data-testid="result-card">
                  <div className="flex items-start justify-between"><div><div className="font-semibold">{r["subject_name"]}</div><div className="text-xs text-muted-foreground">{r["period_name"]}{r["version"] > 1 ? ` • محدّثة (إصدار ${r["version"]})` : ""}</div></div>
                    <div className="text-end text-lg font-bold">{r["total"] != null ? <>{r["total"]}<span className="text-sm font-normal text-muted-foreground"> / {r["max_total"]}</span></> : <span className="text-sm text-muted-foreground">غير مكتمل</span>}</div></div>
                  <ul className="mt-2 space-y-1 text-sm">{(r["items"] as Row[]).map((i, n) => <li key={n} className="flex justify-between border-t pt-1"><span>{i["name"]}</span><span>{i["status"] === "score" ? `${i["score"]} / ${i["max"]}` : ENTRY_STATUS[i["status"]]}</span></li>)}</ul>
                </div>
              ))}
            </div>
          </Section>
        ))}
    </>
  );
}
