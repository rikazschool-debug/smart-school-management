import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { useSchoolPerms } from "@/lib/school-perms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, useSchool } from "@/lib/session";
import { LATE_LABEL, TYPE_LABEL, fromLocalInput, schoolTime, toLocalInput } from "@/lib/homework";
import { ExamCreate } from "@/components/homework/exam-create";

export const Route = createFileRoute("/_authenticated/app/homework/new")({
  head: () => ({ meta: [{ title: "إعداد واجب أو اختبار — ركاز" }, { name: "description", content: "إعداد المقرر والمستهدفين والتسليم والدرجة." }, { property: "og:title", content: "إعداد واجب أو اختبار — ركاز" }, { property: "og:description", content: "إنشاء الواجب والاختبار وحفظ المسودة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { edit?: string; kind?: "homework" | "test" } => ({ ...(s["edit"] ? { edit: String(s["edit"]) } : {}), ...(s["kind"] === "test" ? { kind: "test" } : {}) }),
  component: Entry,
});

function Entry() {
  const { edit, kind } = Route.useSearch();
  const existing = useQuery({ queryKey: ["creation-kind", edit], enabled: !!edit, queryFn: async () => { const r = await db.from("homework").select("kind").eq("id", edit).single(); if (r.error) throw r.error; return r.data as Row; } });
  if (edit && existing.isLoading) return <LoadingState />;
  if (existing.error) return <ErrorState message={arabicError(existing.error)} onRetry={() => existing.refetch()} />;
  return kind === "test" || existing.data?.["kind"] === "test" ? <ExamCreate edit={edit} /> : <Page />;
}

type Crit = { label: string; max: string };

function Page() {
  const ctx = useSchool();
  const { edit, kind } = Route.useSearch();
  const nav = useNavigate();
  const schoolId = ctx?.schoolId ?? "";
  const permissions = useSchoolPerms(schoolId);
  const courses = useQuery({
    queryKey: ["my-teaching-courses", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await db.from("courses").select("id, section_id, year_id, subjects(name), sections(name)").eq("school_id", schoolId);
      if (error) throw error;
      const rows = data as Row[];
      const mine = await Promise.all(rows.map(async (c) => { const r = await db.rpc("is_course_teacher", { _course: c["id"] }); if (r.error) throw r.error; return r.data ? c : null; }));
      return mine.filter(Boolean) as Row[];
    },
  });
  const existing = useQuery({
    queryKey: ["hw", edit],
    enabled: !!edit,
    queryFn: async () => { const r = await db.from("homework").select("*").eq("id", edit).single(); if (r.error) throw r.error; return r.data as Row; },
  });
  const [f, setF] = useState({
    course_id: "", title: "", instructions: "", grading_notes: "", types: ["text"] as string[], available_from: "", due_at: "",
    late_policy: "none", late_until: "", graded: true, max_score: "10", allow_resubmit: false, max_attempts: "2", audience: "all",
    students: [] as string[], remind_hours: "", file_max_mb: "", kind: kind ?? "homework",
  });
  const [crit, setCrit] = useState<Crit[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = existing.data;
    if (!h) return;
    setF({
      course_id: h["course_id"], title: h["title"], instructions: h["instructions"], grading_notes: h["grading_notes"] ?? "", types: h["submission_types"],
      available_from: toLocalInput(h["available_from"]), due_at: toLocalInput(h["due_at"]), late_policy: h["late_policy"], late_until: toLocalInput(h["late_until"]),
      graded: h["max_score"] != null, max_score: h["max_score"]?.toString() ?? "10", allow_resubmit: h["allow_resubmit"], max_attempts: String(h["max_attempts"]),
      audience: h["audience"], students: h["selected_students"] ?? [], remind_hours: h["remind_hours"]?.toString() ?? "", file_max_mb: h["file_max_bytes"] ? String(h["file_max_bytes"] / 1048576) : "", kind: h["kind"] ?? "homework",
    });
    setCrit((h["criteria"] ?? []).map((c: Row) => ({ label: c["label"], max: String(c["max"]) })));
  }, [existing.data]);
  const course = courses.data?.find((c) => c["id"] === f.course_id);
  const roster = useQuery({
    queryKey: ["hw-roster", schoolId, f.course_id, course?.["section_id"], course?.["year_id"]],
    enabled: !!course,
    queryFn: async () => {
      if (!course) return [];
      const { data, error } = await db.from("enrollments").select("student_id, students(full_name)").eq("section_id", course["section_id"]).eq("year_id", course["year_id"]).eq("status", "active");
      if (error) throw error;
      return data as Row[];
    },
  });
  if (!ctx?.schoolId) return <EmptyState title="اختر مدرسة أولًا" />;
  if (permissions?.["bt_homework.create"] === false || permissions?.["bt_homework.view"] === false) return <ForbiddenState />;
  if (courses.isLoading || (edit && existing.isLoading)) return <LoadingState />;
  if (courses.error || existing.error) return <ErrorState message={arabicError(courses.error ?? existing.error)} />;
  if (!courses.data?.length) return <EmptyState title="لا توجد مقررات بتكليف ساري لك" hint="يُنشأ الواجب فقط على مقرر اعتُمد تكليفك به." />;
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const payload = () => ({
    course_id: f.course_id, title: f.title, instructions: f.instructions, grading_notes: f.grading_notes, submission_types: f.types,
    available_from: fromLocalInput(f.available_from), due_at: fromLocalInput(f.due_at), late_policy: f.late_policy, late_until: fromLocalInput(f.late_until),
    max_score: f.graded ? f.max_score : null, criteria: f.graded ? crit.filter((c) => c.label).map((c) => ({ label: c.label, max: Number(c.max) })) : [],
    allow_resubmit: f.allow_resubmit, max_attempts: Number(f.max_attempts), audience: f.audience, students: f.students,
    remind_hours: f.remind_hours || null, file_max_bytes: f.file_max_mb ? Math.round(Number(f.file_max_mb) * 1048576) : null,
  });
  async function save(publish: boolean) {
    setBusy(true);
    try {
      const { data: id, error } = await db.rpc("save_homework", { _id: edit ?? null, _d: payload() });
      if (error) throw error;
      const k = await db.rpc("set_homework_kind", { _id: id, _kind: f.kind });
      if (k.error) throw k.error;
      if (publish) {
        const p = await db.rpc("publish_homework", { _id: id });
        if (p.error) { toast.error(`حُفظت المسودة لكن تعذر النشر: ${arabicError(p.error)}`); nav({ to: "/app/homework/$id", params: { id } }); return; }
        toast.success(p.data === "scheduled" ? "جُدول الواجب وسيظهر للطلاب في وقت الإتاحة" : "نُشر الواجب وأُبلغ الطلاب وأولياء أمورهم");
      } else toast.success("حُفظت المسودة (لم يُرسل أي إشعار)");
      nav({ to: "/app/homework/$id", params: { id } });
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const critSum = crit.reduce((s, c) => s + (Number(c.max) || 0), 0);
  const field = "h-10 rounded-lg border bg-background px-3 text-sm";
  const box = "rounded-2xl border bg-card p-5 shadow-xs";
  const sec = (n: number, t: string, hint: string) => <div className="mb-4 flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span><div className="min-w-0"><h2 className="font-semibold">{t}</h2><p className="text-xs text-muted-foreground">{hint}</p></div></div>;
  const toggle = (on: boolean, label: string, onChange: (v: boolean) => void, hint?: string) => <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${on ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><input type="checkbox" className="mt-1 size-4 accent-primary" checked={on} onChange={(e) => onChange(e.target.checked)} /><span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span></label>;
  return (
    <>
      <Link to={f.kind === "test" ? "/app/tests" : "/app/homework"} className="text-sm text-primary">→ {f.kind === "test" ? "الاختبارات" : "مذكرة الواجبات"}</Link>
      <PageHeader title={edit ? (f.kind === "test" ? "تعديل مسودة الاختبار" : "تعديل مسودة الواجب") : f.kind === "test" ? "اختبار جديد" : "واجب أو اختبار جديد"} desc="الأوقات بتوقيت المدرسة (الرياض)." />
      {preview ? (
        <div className="space-y-3 rounded-2xl border bg-card p-6">
          <p className="text-xs text-muted-foreground">معاينة كما يراها الطالب</p>
          <h2 className="text-xl font-bold">{f.title || "بلا عنوان"}</h2>
          <p className="text-sm text-muted-foreground">{course?.["subjects"]?.["name"]} — {course?.["sections"]?.["name"]}</p>
          <p className="whitespace-pre-wrap">{f.instructions}</p>
          <p className="text-sm">الإتاحة: {schoolTime(fromLocalInput(f.available_from) ?? new Date().toISOString())} · الموعد: {schoolTime(fromLocalInput(f.due_at))}</p>
          <p className="text-sm">التسليم: {f.types.map((t) => TYPE_LABEL[t]).join("، ")} · {LATE_LABEL[f.late_policy]}</p>
          <p className="text-sm">{f.graded ? `الدرجة القصوى ${f.max_score}` : "واجب دون درجة"} · المحاولات: {f.allow_resubmit ? f.max_attempts : 1}</p>
          {crit.length > 0 && <ul className="text-sm">{crit.map((c, i) => <li key={i}>• {c.label}: {c.max}</li>)}</ul>}
          <Button variant="outline" onClick={() => setPreview(false)}>عودة للتعديل</Button>
        </div>
      ) : (
        <div className="space-y-4 pb-24">
          <section className={box}>{sec(1, "البيانات الأساسية", "المقرر ونوع المهمة وعنوانها وما يجب على الطالب فعله")}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hw-course">المقرر والشعبة</Label>
                <select id="hw-course" className={`${field} w-full`} value={f.course_id} disabled={!!edit} onChange={(e) => { set("course_id", e.target.value); set("students", []); }}>
                  <option value="">اختر المقرر والشعبة لعرض الطلاب</option>
                  {courses.data.map((c) => <option key={c["id"]} value={c["id"]}>{c["subjects"]?.["name"]} — {c["sections"]?.["name"]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="hw-kind">النوع</Label><select id="hw-kind" className={`${field} w-full`} value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="homework">واجب</option><option value="test">اختبار</option></select></div>
              <div className="space-y-1.5 md:col-span-2"><Label htmlFor="hw-title">العنوان</Label><Input id="hw-title" className="h-10" placeholder="مثال: حل تمارين الكسور ص 45" value={f.title} maxLength={200} onChange={(e) => set("title", e.target.value)} /><p className="text-end text-xs text-muted-foreground">{f.title.length}/200</p></div>
              <div className="space-y-1.5 md:col-span-2"><Label htmlFor="hw-instr">التعليمات</Label><Textarea id="hw-instr" rows={5} placeholder="اكتب خطوات واضحة: المطلوب، وطريقة الحل، وشكل التسليم." value={f.instructions} onChange={(e) => set("instructions", e.target.value)} /></div>
            </div>
          </section>
          <section className={box}>{sec(2, "التسليم والمستهدفون", "كيف يسلّم الطلاب ومن يستلم الواجب")}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>نوع التسليم</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TYPE_LABEL).map(([k, v]) => { const on = f.types.includes(k); return (
                    <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}><input type="checkbox" className="sr-only" checked={on} onChange={(e) => set("types", e.target.checked ? [...f.types, k] : f.types.filter((x) => x !== k))} />{v}</label>
                  ); })}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="hw-aud">المستهدفون</Label>
                  <select id="hw-aud" aria-label="المستهدفون" className={`${field} w-full`} value={f.audience} onChange={(e) => set("audience", e.target.value)}>
                    <option value="all">جميع طلاب الشعبة</option><option value="selected">طلاب محددون</option>
                  </select>
                </div>
                {f.types.includes("file") && <div className="space-y-1.5"><Label htmlFor="hw-mb">حد حجم الملف (ميغابايت، ضمن سياسة المدرسة)</Label><Input id="hw-mb" className="h-10" type="number" min={1} value={f.file_max_mb} onChange={(e) => set("file_max_mb", e.target.value)} /></div>}
              </div>
              {f.audience === "selected" && (
                <div className="rounded-xl border bg-muted/20 p-3">
                  {course && roster.data?.length ? <p className="mb-2 text-xs text-muted-foreground">اختير {f.students.length} من {roster.data.length}</p> : null}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {course && !roster.isLoading && !roster.error && roster.data?.map((r) => (
                      <label key={r["student_id"]} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm">
                        <input type="checkbox" className="accent-primary" checked={f.students.includes(r["student_id"])} onChange={(e) => set("students", e.target.checked ? [...f.students, r["student_id"]] : f.students.filter((x) => x !== r["student_id"]))} />
                        <span className="truncate">{r["students"]?.["full_name"]}</span>
                      </label>
                    ))}
                  </div>
                  {!course ? <EmptyState title="اختر المقرر والشعبة لعرض الطلاب" /> : roster.isLoading ? <LoadingState /> : roster.error ? <ErrorState message={arabicError(roster.error)} onRetry={() => roster.refetch()} /> : !roster.data?.length ? <EmptyState title="لا يوجد طلاب مسكّنون نشطون في هذه الشعبة والسنة الدراسية" /> : null}
                </div>
              )}
            </div>
          </section>
          <section className={box}>{sec(3, "المواعيد", "الأوقات بتوقيت المدرسة (الرياض)")}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="hw-avail">وقت الإتاحة</Label><Input id="hw-avail" className="h-10" type="datetime-local" value={f.available_from} onChange={(e) => set("available_from", e.target.value)} /><p className="text-xs text-muted-foreground">اتركه فارغًا ليظهر عند النشر.</p></div>
              <div className="space-y-1.5"><Label htmlFor="hw-due">موعد التسليم</Label><Input id="hw-due" className="h-10" type="datetime-local" value={f.due_at} onChange={(e) => set("due_at", e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="hw-late">سياسة التأخر</Label>
                <select id="hw-late" className={`${field} w-full`} value={f.late_policy} onChange={(e) => set("late_policy", e.target.value)}>
                  {Object.entries(LATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {f.late_policy === "until" && <div className="space-y-1.5"><Label htmlFor="hw-until">الموعد النهائي الإضافي</Label><Input id="hw-until" className="h-10" type="datetime-local" value={f.late_until} onChange={(e) => set("late_until", e.target.value)} /></div>}
              <div className="space-y-1.5"><Label htmlFor="hw-rem">تذكير قبل الموعد بساعات (اختياري)</Label><Input id="hw-rem" className="h-10" type="number" min={1} max={168} placeholder="مثال: 24" value={f.remind_hours} onChange={(e) => set("remind_hours", e.target.value)} /></div>
            </div>
          </section>
          <section className={box}>{sec(4, "التقييم", "الدرجة ومعايير التصحيح وإعادة التسليم")}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                {toggle(f.graded, "واجب مقيّم بدرجة", (v) => set("graded", v), "تظهر الدرجة للطالب فور حفظ التصحيح.")}
                {f.graded && <Input className="h-10" type="number" min={1} max={1000} value={f.max_score} onChange={(e) => set("max_score", e.target.value)} aria-label="الدرجة القصوى" />}
              </div>
              <div className="space-y-2">
                {toggle(f.allow_resubmit, "السماح بإعادة التسليم", (v) => set("allow_resubmit", v), "حدد عدد المحاولات المسموحة.")}
                {f.allow_resubmit && <Input className="h-10" type="number" min={2} max={10} value={f.max_attempts} onChange={(e) => set("max_attempts", e.target.value)} aria-label="حد المحاولات" />}
              </div>
              {f.graded && (
                <div className="space-y-2 md:col-span-2">
                  <Label>معايير التصحيح (اختياري — مجموعها = الدرجة القصوى)</Label>
                  {crit.map((c, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
                      <Input aria-label={`البند ${i + 1}`} placeholder="البند، مثال: صحة الحل" value={c.label} onChange={(e) => setCrit(crit.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <Input aria-label={`درجة البند ${i + 1}`} type="number" min={0} value={c.max} onChange={(e) => setCrit(crit.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} />
                      <Button variant="ghost" onClick={() => setCrit(crit.filter((_, j) => j !== i))}>حذف</Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 text-sm">
                    <Button variant="outline" size="sm" onClick={() => setCrit([...crit, { label: "", max: "" }])}>إضافة بند</Button>
                    {crit.length > 0 && <span className={critSum === Number(f.max_score) ? "text-primary" : "text-destructive"}>المجموع {critSum} / {f.max_score}</span>}
                  </div>
                </div>
              )}
              <div className="space-y-1.5 md:col-span-2"><Label htmlFor="hw-gn">ملاحظات التصحيح (للمعلم فقط)</Label><Textarea id="hw-gn" rows={2} placeholder="لا تظهر للطلاب." value={f.grading_notes} onChange={(e) => set("grading_notes", e.target.value)} /></div>
            </div>
          </section>
        </div>
      )}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t bg-background/95 py-3 ps-4 pe-32 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setPreview(!preview)}>{preview ? "تعديل" : "معاينة كالطالب"}</Button>
          <Button variant="secondary" disabled={busy || !f.course_id} onClick={() => save(false)}>حفظ مسودة</Button>
          {f.kind !== "test" && <Button disabled={busy || !f.course_id} onClick={() => save(true)}>{(fromLocalInput(f.available_from) ?? "") > new Date().toISOString() ? "جدولة النشر" : "نشر الآن"}</Button>}
          <p className="text-xs text-muted-foreground sm:ms-auto">{!f.course_id ? "اختر المقرر أولًا لتفعيل الحفظ." : "المرفقات تُضاف من صفحة الواجب بعد حفظ المسودة."}</p>
        </div>
      </div>
    </>
  );
}
