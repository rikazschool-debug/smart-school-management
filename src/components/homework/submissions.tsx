import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileList, Uploader } from "@/components/homework/files";
import { arabicError } from "@/lib/session";
import { GRADE_STATUS, SUB_STATUS, fromLocalInput, safeHref, schoolTime, statusTone } from "@/lib/homework";

type Filter = "all" | "missing" | "late" | "returned" | "to_grade" | "to_publish";

/** Teacher grading screen (editable) or read-only staff view; RLS decides what rows come back. */
export function SubmissionsPanel({ h, editable }: { h: Row; editable: boolean }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ["hw-subs", h["id"]],
    enabled: h["status"] !== "draft",
    queryFn: async () => {
      const [t, s, a, g, f] = await Promise.all([
        db.from("homework_targets").select("*, students(full_name, user_id)").eq("homework_id", h["id"]),
        db.from("homework_submissions").select("*").eq("homework_id", h["id"]),
        db.from("homework_attempts").select("*").eq("homework_id", h["id"]).order("attempt_no"),
        db.from("homework_grades").select("*").eq("homework_id", h["id"]),
        db.from("homework_submission_files").select("submission_id, attempt_no, files(id, name, storage_path, size_bytes)").not("attempt_no", "is", null),
      ]);
      for (const r of [t, s, a, g]) if (r.error) throw r.error;
      return (t.data as Row[]).map((tg) => {
        const sub = (s.data as Row[]).find((x) => x["student_id"] === tg["student_id"]) ?? null;
        const atts = (a.data as Row[]).filter((x) => x["student_id"] === tg["student_id"]);
        return {
          ...tg, sub, atts,
          grade: (g.data as Row[]).find((x) => x["student_id"] === tg["student_id"]) ?? null,
          files: ((f.data ?? []) as Row[]).filter((x) => sub && x["submission_id"] === sub["id"]),
        } as Row;
      }).sort((x, y) => (x["students"]?.["full_name"] ?? "").localeCompare(y["students"]?.["full_name"] ?? "", "ar"));
    },
  });
  if (h["status"] === "draft") return <EmptyState title="المسودة غير منشورة" hint="تظهر قائمة التسليمات بعد النشر." />;
  if (data.isLoading) return <LoadingState />;
  if (data.error) return <ErrorState message={arabicError(data.error)} />;
  const rows = data.data ?? [];
  const submitted = (r: Row) => (r["sub"]?.["attempt_count"] ?? 0) > 0;
  const needsGrade = (r: Row) => submitted(r) && r["sub"]["status"] !== "returned" && (!r["grade"] || r["grade"]["status"] === "in_progress" || r["grade"]["needs_review"]);
  const fns: Record<Filter, (r: Row) => boolean> = {
    all: () => true,
    missing: (r) => !submitted(r) && !r["removed_at"],
    late: (r) => r["atts"].some((a: Row) => a["is_late"]),
    returned: (r) => r["sub"]?.["status"] === "returned",
    to_grade: needsGrade,
    to_publish: (r) => r["grade"]?.["status"] === "graded" && !r["grade"]["needs_review"],
  };
  const labels: Record<Filter, string> = { all: "الكل", missing: "لم يسلّم", late: "متأخر", returned: "معاد", to_grade: "يحتاج تصحيحًا", to_publish: "جاهز للنشر" };
  const shown = rows.filter(fns[filter]);
  const current = rows.find((r) => r["student_id"] === sel) ?? null;
  const idx = shown.findIndex((r) => r["student_id"] === sel);
  const readyCount = rows.filter(fns.to_publish).length;
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">التسليمات {editable ? "والتصحيح" : "(اطلاع فقط)"}</h3>
        {editable && h["max_score"] !== undefined && (
          <Button size="sm" disabled={!readyCount} onClick={async () => {
            if (!confirm(`نشر ${readyCount} نتيجة مصححة للطلاب وأولياء أمورهم؟`)) return;
            const { data: n, error } = await db.rpc("publish_results", { _hw: h["id"], _subs: null });
            if (error) toast.error(arabicError(error)); else { toast.success(`نُشرت ${n} نتيجة`); qc.invalidateQueries({ queryKey: ["hw-subs", h["id"]] }); }
          }}>نشر كل المصحح ({readyCount})</Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(labels) as Filter[]).map((k) => <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{labels[k]} ({rows.filter(fns[k]).length})</Button>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground"><tr>{["الطالب", "التسليم", "المحاولة / الوقت", "التصحيح"].map((x) => <th key={x} className="p-2 text-start font-medium">{x}</th>)}</tr></thead>
          <tbody>
            {shown.map((r) => {
              const last = r["atts"][r["atts"].length - 1];
              const gs = r["grade"]?.["status"] ?? "none";
              return (
                <tr key={r["student_id"]} className={`cursor-pointer border-t hover:bg-muted/40 ${sel === r["student_id"] ? "bg-muted/60" : ""}`} onClick={() => setSel(r["student_id"])}>
                  <td className="p-2">{r["students"]?.["full_name"]}{!r["students"]?.["user_id"] && <span className="ms-1 text-xs text-muted-foreground">(بلا حساب — لا يصله إشعار)</span>}{r["removed_at"] && <span className="ms-1 text-xs text-muted-foreground">(انتقل)</span>}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(r["sub"]?.["status"] ?? "none")}`}>{SUB_STATUS[r["sub"]?.["status"] ?? "none"]}</span></td>
                  <td className="p-2 text-xs">{last ? <>#{last["attempt_no"]} · {schoolTime(last["submitted_at"])}{last["is_late"] && <span className="text-destructive"> · متأخر</span>}</> : "—"}{r["extended_due"] && <span className="block text-muted-foreground">ممدد حتى {schoolTime(r["extended_due"])}</span>}</td>
                  <td className="p-2 text-xs">{GRADE_STATUS[gs]}{r["grade"]?.["score"] != null && ` · ${r["grade"]["score"]}`}{r["grade"]?.["needs_review"] && <span className="block text-destructive">محاولة جديدة تحتاج مراجعة</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <p className="p-3 text-sm text-muted-foreground">لا يوجد طلاب في هذا التصنيف.</p>}
      </div>
      {current && (
        <StudentReview key={`${current["student_id"]}-${current["grade"]?.["rev"] ?? 0}-${current["sub"]?.["attempt_count"] ?? 0}`} h={h} r={current} editable={editable}
          prev={idx > 0 ? () => setSel(shown[idx - 1]!["student_id"]) : undefined}
          next={idx >= 0 && idx < shown.length - 1 ? () => setSel(shown[idx + 1]!["student_id"]) : undefined}
          refresh={() => qc.invalidateQueries({ queryKey: ["hw-subs", h["id"]] })} />
      )}
    </section>
  );
}

function StudentReview({ h, r, editable, prev, next, refresh }: { h: Row; r: Row; editable: boolean; prev?: (() => void) | undefined; next?: (() => void) | undefined; refresh: () => void }) {
  const crit = (h["criteria"] ?? []) as Row[];
  const g = r["grade"];
  const [score, setScore] = useState<string>(g?.["score"]?.toString() ?? "");
  const [cs, setCs] = useState<string[]>(crit.map((_, i) => g?.["criteria_scores"]?.[i]?.toString() ?? ""));
  const [fb, setFb] = useState<string>(g?.["feedback"] ?? "");
  const [reason, setReason] = useState("");
  const [ext, setExt] = useState("");
  const [paperNote, setPaperNote] = useState("");
  const [paperAt, setPaperAt] = useState("");
  useEffect(() => { setReason(""); }, [r["student_id"]]);
  const sub = r["sub"];
  const graded = h["max_score"] != null;
  const published = !!g?.["published_at"];
  async function call(fn: string, args: Row, ok: string) {
    const { error } = await db.rpc(fn, args);
    if (error) { toast.error(arabicError(error)); return false; }
    toast.success(ok); refresh(); return true;
  }
  const gradeArgs = () => ({ _sub: sub["id"], _score: graded && !crit.length ? Number(score) : null, _criteria: crit.length ? cs.map(Number) : [], _feedback: fb, _rev: g?.["rev"] ?? null });
  const total = cs.reduce((s, x) => s + (Number(x) || 0), 0);
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{r["students"]?.["full_name"]}</h4>
        <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={!prev} onClick={prev}>السابق</Button><Button size="sm" variant="ghost" disabled={!next} onClick={next}>التالي</Button></div>
      </div>
      {r["atts"].length === 0 && <p className="text-sm text-muted-foreground">لم يسلّم بعد. عدم التسليم لا يتحول إلى صفر تلقائيًا.</p>}
      {[...r["atts"]].reverse().map((a: Row) => (
        <div key={a["id"]} className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">المحاولة {a["attempt_no"]}{a["attempt_no"] === sub?.["attempt_count"] && " (المعتمدة للتصحيح)"} · {a["kind"] === "paper" ? "ورقي سجّله المعلم" : "إلكتروني"} · {schoolTime(a["submitted_at"])} · الموعد المطبق {schoolTime(a["due_applied"])}{a["is_late"] && <span className="text-destructive"> · متأخر</span>}</p>
          {a["body"] && <p className="mt-1 whitespace-pre-wrap">{a["body"]}</p>}
          {safeHref(a["link_url"]) && <a href={safeHref(a["link_url"])!} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline" dir="ltr">{a["link_url"]}</a>}
          {a["note"] && <p className="text-xs">ملاحظة: {a["note"]}</p>}
          <FileList files={r["files"].filter((f: Row) => f["attempt_no"] === a["attempt_no"]).map((f: Row) => f["files"])} />
        </div>
      ))}
      {g && <FeedbackFiles grade={g} editable={editable} />}
      {g && <p className="text-xs text-muted-foreground">آخر تصحيح على المحاولة {g["attempt_no"]} · إصدار المعايير {g["rubric_version"]} · {GRADE_STATUS[g["status"]]}</p>}
      {editable && sub && sub["attempt_count"] > 0 && sub["status"] !== "returned" && (
        <div className="space-y-2">
          {graded && (crit.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {crit.map((c, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">{c["label"]} (0–{c["max"]})
                  <Input className="w-24" type="number" min={0} max={c["max"]} value={cs[i]} onChange={(e) => setCs(cs.map((x, j) => (j === i ? e.target.value : x)))} /></label>
              ))}
              <p className="text-sm">المجموع: {total} / {h["max_score"]}</p>
            </div>
          ) : <label className="flex items-center gap-2 text-sm">الدرجة (0–{h["max_score"]})<Input className="w-28" type="number" min={0} max={h["max_score"]} value={score} onChange={(e) => setScore(e.target.value)} /></label>)}
          <Textarea rows={3} placeholder="ملاحظات للطالب" value={fb} onChange={(e) => setFb(e.target.value)} />
          {published ? (
            <div className="flex flex-wrap gap-2">
              <Input className="flex-1" placeholder="سبب تعديل النتيجة المنشورة (يُسجل ويُبلغ الطالب)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" onClick={() => call("correct_result", { ...gradeArgs(), _reason: reason }, "عُدّلت النتيجة وسُجل التغيير")}>تعديل النتيجة</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => call("grade_submission", { ...gradeArgs(), _final: false }, "حُفظ التصحيح كمسودة")}>حفظ كمسودة</Button>
              <Button size="sm" variant="secondary" onClick={() => call("grade_submission", { ...gradeArgs(), _final: true }, "اكتمل التصحيح (غير منشور)")}>اعتماد التصحيح</Button>
              {g?.["status"] === "graded" && !g["needs_review"] && <Button size="sm" onClick={() => call("publish_results", { _hw: h["id"], _subs: [sub["id"]] }, "نُشرت النتيجة للطالب")}>نشر نتيجة هذا الطالب</Button>}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-2">
            <Input className="flex-1" placeholder="سبب الإعادة للاستكمال" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => call("return_submission", { _sub: sub["id"], _reason: reason }, "أُعيد للطالب للاستكمال")}>إعادة للاستكمال</Button>
          </div>
        </div>
      )}
      {editable && !r["removed_at"] && (
        <div className="space-y-2 border-t pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="datetime-local" className="w-56" value={ext} onChange={(e) => setExt(e.target.value)} aria-label="موعد خاص" />
            <Input className="flex-1" placeholder="سبب التمديد / إعادة الفتح" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => call("extend_homework", { _id: h["id"], _student: r["student_id"], _due: fromLocalInput(ext), _reason: reason }, "مُدد موعد الطالب")}>تمديد لهذا الطالب</Button>
          </div>
          {(h["submission_types"] as string[]).includes("paper") && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="datetime-local" className="w-56" value={paperAt} onChange={(e) => setPaperAt(e.target.value)} aria-label="وقت الاستلام" />
              <Input className="flex-1" placeholder="ملاحظة الاستلام الورقي (اختياري)" value={paperNote} onChange={(e) => setPaperNote(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => call("record_paper_submission", { _hw: h["id"], _student: r["student_id"], _received: fromLocalInput(paperAt), _note: paperNote }, "سُجل الاستلام الورقي")}>تسجيل تسليم ورقي</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Teacher feedback attachments: stored on the grade; hidden from student/family until the result is published (can_read_file). */
export function FeedbackFiles({ grade, editable }: { grade: Row; editable: boolean }) {
  const qc = useQueryClient();
  const key = ["fb-files", grade["id"]];
  const q = useQuery({ queryKey: key, queryFn: async () => (await db.from("files").select("*").eq("source_type", "feedback").eq("source_id", grade["id"]).order("created_at")).data as Row[] });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  if (!editable && !q.data?.length) return null;
  return (
    <div className="space-y-1 rounded-lg border border-dashed p-3">
      <p className="text-xs font-semibold">مرفقات الملاحظات {editable && <span className="font-normal text-muted-foreground">({grade["published_at"] ? "منشورة؛ أي تعديل يُسجل في سجل الواجب" : "لا تظهر للطالب أو الأسرة قبل نشر النتيجة"})</span>}</p>
      <FileList files={q.data ?? []} onRemove={editable ? async (f) => { const { error } = await db.rpc("remove_feedback_file", { _file: f["id"] }); if (error) toast.error(arabicError(error)); else { toast.success("حُذف مرفق الملاحظات"); refresh(); } } : undefined} />
      {editable && (
        <Uploader label="إرفاق ملف ملاحظات"
          create={async (f) => { const { data, error } = await db.rpc("create_feedback_file", { _grade: grade["id"], _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }}
          release={(fid) => db.rpc("remove_feedback_file", { _file: fid })}
          onDone={refresh} />
      )}
    </div>
  );
}
