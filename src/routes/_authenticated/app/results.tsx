import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
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
// A guardian picks one verified child at a time; results, notes and downloads never mix children.
function Results({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const q = useQuery({ queryKey: ["my-results", ctx.schoolId], queryFn: async () => {
    const { data, error } = await db.from("grade_results").select("id, student_id, student_name, section_name, subject_name, period_name, items, total, max_total, complete, version, published_at, change_note, note").is("superseded_at", null).eq("school_id", ctx.schoolId).order("published_at", { ascending: false });
    if (error) throw error; return data as Row[];
  } });
  const kids = useQuery({ queryKey: ["res-kids", ctx.schoolId], enabled: ctx.role === "guardian", queryFn: async () => {
    const { data: auth } = await db.auth.getUser();
    const { data, error } = await db.from("student_guardians").select("students(id, full_name), guardians!inner(user_id)")
      .eq("school_id", ctx.schoolId).eq("verified", true).eq("can_follow", true).eq("guardians.user_id", auth.user.id);
    if (error) throw error; return (data as Row[]).map((r) => r["students"]).filter(Boolean) as Row[];
  } });
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of kids.data ?? []) m.set(k["id"], k["full_name"]);
    for (const r of q.data ?? []) if (!m.has(r["student_id"])) m.set(r["student_id"], r["student_name"]);
    return [...m.entries()];
  }, [kids.data, q.data]);
  const [kid, setKid] = useState("");
  useEffect(() => { if ((!kid || !people.some(([id]) => id === kid)) && people[0]) setKid(people[0][0]); }, [people, kid]);
  const [period, setPeriod] = useState("");
  const mine = (q.data ?? []).filter((r) => r["student_id"] === kid);
  const periods = [...new Set(mine.map((r) => r["period_name"] as string))];
  const rows = mine.filter((r) => !period || r["period_name"] === period);
  const name = people.find(([id]) => id === kid)?.[1] ?? "";
  const val = (i: Row) => (i["status"] === "score" ? `${i["score"]} / ${i["max"]}` : ENTRY_STATUS[i["status"]]);
  const date = (d: string) => new Date(d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" });
  return (
    <>
      <PageHeader title="النتائج" desc="تظهر هنا النتائج بعد اعتمادها ونشرها من إدارة المدرسة فقط. لا تُعرض تقديرات نجاح أو رسوب أو ترتيب بين الطلاب." />
      {q.isLoading || kids.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !people.length ? <EmptyState title={ctx.role === "guardian" ? "لا يوجد أبناء موثقون للمتابعة" : "لا توجد نتائج منشورة بعد"} /> : <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {people.length > 1 && people.map(([id, n]) => <Button key={id} size="sm" variant={kid === id ? "default" : "outline"} onClick={() => { setKid(id); setPeriod(""); }}>{n}</Button>)}
          {periods.length > 1 && <select aria-label="الفترة" className={selectCls("w-48")} value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">كل الفترات</option>{periods.map((p) => <option key={p} value={p}>{p}</option>)}</select>}
        </div>
        {!rows.length ? <EmptyState title={`لا توجد نتائج منشورة لـ ${name} بعد`} hint="تظهر النتيجة بعد اعتمادها ونشرها من إدارة المدرسة." /> : (
          <Section title={name} desc={rows[0]!["section_name"] ?? ""}
            action={<ExportButtons title={`كشف نتائج ${name}`} school={ctx.schoolName} filters={[period || "كل الفترات", "النتائج المنشورة فقط"]} headers={["المادة", "الفترة", "البنود", "المجموع", "تاريخ النشر", "الإصدار", "ملاحظة المعلم"]}
              rows={() => rows.map((r) => [r["subject_name"], r["period_name"], (r["items"] as Row[]).map((i) => `${i["name"]}: ${val(i)}`).join(" • "), r["total"] != null ? `${r["total"]} / ${r["max_total"]}` : "غير مكتمل", date(r["published_at"]), r["version"], r["note"] ?? ""])} />}>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <div key={r["id"]} className="rounded-xl border bg-card p-4" data-testid="result-card">
                  <div className="flex items-start justify-between"><div><div className="font-semibold">{r["subject_name"]}</div><div className="text-xs text-muted-foreground">{r["period_name"]} • نُشرت {date(r["published_at"])}{r["version"] > 1 ? ` • محدّثة (إصدار ${r["version"]})` : ""}</div></div>
                    <div className="text-end text-lg font-bold">{r["total"] != null ? <>{r["total"]}<span className="text-sm font-normal text-muted-foreground"> / {r["max_total"]}</span></> : <span className="text-sm text-muted-foreground">غير مكتمل</span>}</div></div>
                  <ul className="mt-2 space-y-1 text-sm">{(r["items"] as Row[]).map((i, n) => <li key={n} className="flex justify-between border-t pt-1"><span>{i["name"]}</span><span>{val(i)}</span></li>)}</ul>
                  {r["note"] && <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm" data-testid="result-note">ملاحظة المعلم: {r["note"]}</p>}
                  {r["change_note"] && <p className="mt-1 text-xs text-muted-foreground">{r["change_note"]}</p>}
                </div>
              ))}
            </div>
          </Section>)}
      </>}
    </>
  );
}
