import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileList, Uploader } from "@/components/homework/files";
import { SubmissionsPanel } from "@/components/homework/submissions";
import { arabicError, useSchool } from "@/lib/session";
import { HW_STATUS, LATE_LABEL, SUB_STATUS, TYPE_LABEL, fromLocalInput, safeHref, schoolTime, statusTone, toLocalInput } from "@/lib/homework";

export const Route = createFileRoute("/_authenticated/app/homework/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الواجب — ركاز" }, { name: "description", content: "تعليمات الواجب والتسليم والتصحيح والنتائج." }] }),
  validateSearch: (s: Record<string, unknown>): { student?: string } => (s["student"] ? { student: String(s["student"]) } : {}),
  component: Page,
});

export const hwKey = (id: string) => ["hw-detail", id];

function Page() {
  const { id } = Route.useParams();
  const ctx = useSchool();
  const hw = useQuery({
    queryKey: hwKey(id),
    queryFn: async () => {
      const { data, error } = await db.from("homework").select("*, courses(subjects(name)), sections(name)").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [isT, files, teacher] = await Promise.all([
        db.rpc("is_course_teacher", { _course: data.course_id }),
        db.from("files").select("id, name, storage_path, size_bytes").eq("source_type", "homework").eq("source_id", id),
        db.from("teacher_assignments").select("teachers(full_name)").eq("course_id", data.course_id).eq("status", "approved").limit(1),
      ]);
      return { ...data, isTeacher: !!isT.data, files: files.data ?? [], teacherName: teacher.data?.[0]?.teachers?.full_name ?? "—" } as Row;
    },
  });
  if (hw.isLoading) return <LoadingState />;
  if (hw.error) return <ErrorState message={arabicError(hw.error)} />;
  if (!hw.data) return <EmptyState title="الواجب غير موجود أو ليس ضمن صلاحياتك" />;
  const h = hw.data;
  const role = ctx?.role;
  return (
    <>
      <Link to="/app/homework" className="text-sm text-primary">→ الواجبات</Link>
      <PageHeader title={h["title"]} desc={`${h["courses"]?.["subjects"]?.["name"] ?? ""} — ${h["sections"]?.["name"] ?? ""} · المعلم: ${h["teacherName"]}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Details h={h} />
          {h["isTeacher"] ? <SubmissionsPanel h={h} editable /> : role === "student" ? <StudentPanel h={h} /> : role === "guardian" ? <FamilyPanel h={h} /> : <SubmissionsPanel h={h} editable={false} />}
        </div>
        <aside className="space-y-4">
          {h["isTeacher"] && <TeacherActions h={h} />}
          <Activity id={id} />
        </aside>
      </div>
    </>
  );
}

function Details({ h }: { h: Row }) {
  const qc = useQueryClient();
  const crit = (h["criteria"] ?? []) as Row[];
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(h["status"])}`}>{HW_STATUS[h["status"]]}</span>
        <span className="text-xs text-muted-foreground">الإصدار {h["version"] || "—"}</span>
      </div>
      <p className="whitespace-pre-wrap">{h["instructions"] || <span className="text-muted-foreground">لا توجد تعليمات مكتوبة</span>}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">وقت الإتاحة</dt><dd>{schoolTime(h["available_from"])}</dd></div>
        <div><dt className="text-muted-foreground">موعد التسليم (توقيت المدرسة)</dt><dd>{schoolTime(h["due_at"])}</dd></div>
        <div><dt className="text-muted-foreground">سياسة التأخر</dt><dd>{LATE_LABEL[h["late_policy"]]}{h["late_until"] && ` — حتى ${schoolTime(h["late_until"])}`}</dd></div>
        <div><dt className="text-muted-foreground">التسليم</dt><dd>{(h["submission_types"] as string[]).map((t) => TYPE_LABEL[t]).join("، ")} · المحاولات {h["max_attempts"]}</dd></div>
        <div><dt className="text-muted-foreground">التقييم</dt><dd>{h["max_score"] == null ? "دون درجة" : `من ${h["max_score"]}`}</dd></div>
      </dl>
      {crit.length > 0 && (<div className="text-sm"><p className="text-muted-foreground">معايير التصحيح</p><ul>{crit.map((c, i) => <li key={i}>• {c["label"]}: {c["max"]}</li>)}</ul></div>)}
      {h["isTeacher"] && h["grading_notes"] && <p className="rounded-lg bg-muted p-3 text-sm">ملاحظات التصحيح: {h["grading_notes"]}</p>}
      {h["status"] === "cancelled" && <p className="text-sm text-destructive">أُلغي: {h["cancel_reason"]}</p>}
      <FileList files={h["files"]} onRemove={h["isTeacher"] && h["status"] === "draft" ? async (f) => {
        const { error } = await db.rpc("remove_homework_file", { _file: f["id"] });
        if (error) toast.error(arabicError(error)); else qc.invalidateQueries({ queryKey: hwKey(h["id"]) });
      } : undefined} />
      {h["isTeacher"] && ["draft", "scheduled", "published"].includes(h["status"]) && (
        <Uploader label="إرفاق ورقة عمل"
          create={async (f) => { const { data, error } = await db.rpc("create_homework_file", { _hw: h["id"], _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }}
          release={(fid) => db.rpc("remove_homework_file", { _file: fid })}
          onDone={() => qc.invalidateQueries({ queryKey: hwKey(h["id"]) })} />
      )}
    </section>
  );
}

function useAct(h: Row) {
  const qc = useQueryClient();
  return async (fn: string, args: Row, ok: string) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) { toast.error(arabicError(error)); return null; }
    toast.success(ok);
    qc.invalidateQueries({ queryKey: hwKey(h["id"]) });
    qc.invalidateQueries({ queryKey: ["hw-subs", h["id"]] });
    qc.invalidateQueries({ queryKey: ["hw-events", h["id"]] });
    return data ?? true;
  };
}

function TeacherActions({ h }: { h: Row }) {
  const act = useAct(h);
  const nav = useNavigate();
  const [mode, setMode] = useState<null | "revise" | "extend" | "cancel" | "copy">(null);
  const [due, setDue] = useState(toLocalInput(h["due_at"]));
  const [instr, setInstr] = useState(h["instructions"]);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const courses = useQuery({
    queryKey: ["copy-courses", h["school_id"]], enabled: mode === "copy",
    queryFn: async () => (await db.from("courses").select("id, subjects(name), sections(name), academic_years(name)").eq("school_id", h["school_id"])).data as Row[],
  });
  const s = h["status"];
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-5">
      <h3 className="font-semibold">إجراءات المعلم</h3>
      <div className="flex flex-wrap gap-2">
        {s === "draft" && <Button size="sm" variant="outline" asChild><Link to="/app/homework/new" search={{ edit: h["id"] }}>تعديل المسودة</Link></Button>}
        {s === "draft" && <Button size="sm" onClick={() => act("publish_homework", { _id: h["id"] }, "تم النشر/الجدولة")}>نشر</Button>}
        {["scheduled", "published", "closed"].includes(s) && <Button size="sm" variant="outline" onClick={() => setMode("revise")}>تعديل بعد النشر</Button>}
        {["published", "closed"].includes(s) && <Button size="sm" variant="outline" onClick={() => setMode("extend")}>تمديد للجميع</Button>}
        {s === "published" && <Button size="sm" variant="outline" onClick={() => act("set_homework_status", { _id: h["id"], _status: "closed", _reason: null }, "أُغلق التسليم")}>إغلاق التسليم</Button>}
        {["published", "closed"].includes(s) && <Button size="sm" variant="outline" onClick={() => act("set_homework_status", { _id: h["id"], _status: "archived", _reason: null }, "أُرشف الواجب")}>أرشفة</Button>}
        {["draft", "scheduled", "published"].includes(s) && <Button size="sm" variant="destructive" onClick={() => setMode("cancel")}>إلغاء</Button>}
        <Button size="sm" variant="ghost" onClick={() => setMode("copy")}>نسخ كقالب</Button>
      </div>
      {mode === "revise" && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label>التعليمات</Label><Textarea rows={4} value={instr} onChange={(e) => setInstr(e.target.value)} />
          <Label>موعد التسليم</Label><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <Label>سبب التعديل (يظهر للطلاب)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">لا يمكن تغيير الدرجة القصوى أو نوع التسليم بعد وجود تسليمات، ولا تقديم الموعد إلى وقت مضى.</p>
          <Button size="sm" onClick={async () => { if (await act("revise_homework", { _id: h["id"], _d: { instructions: instr, due_at: fromLocalInput(due) }, _note: reason }, "حُفظ التعديل كإصدار جديد")) setMode(null); }}>حفظ</Button>
        </div>
      )}
      {mode === "extend" && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label>الموعد الجديد للجميع</Label><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <Label>السبب</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" onClick={async () => { if (await act("extend_homework", { _id: h["id"], _student: null, _due: fromLocalInput(due), _reason: reason }, "مُدد الموعد وأُبلغ الطلاب")) setMode(null); }}>تمديد</Button>
        </div>
      )}
      {mode === "cancel" && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label>سبب الإلغاء (إجراء موثق)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="destructive" onClick={async () => { if (await act("set_homework_status", { _id: h["id"], _status: "cancelled", _reason: reason }, "أُلغي الواجب")) setMode(null); }}>تأكيد الإلغاء</Button>
        </div>
      )}
      {mode === "copy" && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label>المقرر الهدف (يُنسخ القالب دون طلاب أو تسليمات أو درجات أو مرفقات)</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">اختر</option>
            {courses.data?.map((c) => <option key={c["id"]} value={c["id"]}>{c["subjects"]?.["name"]} — {c["sections"]?.["name"]} ({c["academic_years"]?.["name"]})</option>)}
          </select>
          <Button size="sm" disabled={!target} onClick={async () => { const nid = await act("copy_homework", { _id: h["id"], _course: target }, "أُنشئت مسودة جديدة"); if (typeof nid === "string") nav({ to: "/app/homework/new", search: { edit: nid } }); }}>نسخ</Button>
        </div>
      )}
    </section>
  );
}

function Activity({ id }: { id: string }) {
  const ev = useQuery({
    queryKey: ["hw-events", id],
    queryFn: async () => (await db.from("homework_events").select("*").eq("homework_id", id).order("created_at", { ascending: false }).limit(30)).data as Row[],
  });
  const LBL: Record<string, string> = { created: "إنشاء", published: "نشر", scheduled: "جدولة", revised: "تعديل بعد النشر", extended_all: "تمديد للجميع", extended_student: "تمديد لطالب",
    submitted: "تسليم", returned: "إعادة للاستكمال", paper_recorded: "تسجيل تسليم ورقي", result_published: "نشر نتيجة", result_corrected: "تعديل نتيجة منشورة", copied: "نسخ",
    "status:closed": "إغلاق", "status:archived": "أرشفة", "status:cancelled": "إلغاء" };
  if (!ev.data?.length) return null;
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h3 className="mb-2 font-semibold">سجل الواجب</h3>
      <ul className="space-y-1 text-xs">
        {ev.data.map((e) => <li key={e["id"]}>{schoolTime(e["created_at"])} — {LBL[e["action"]] ?? e["action"]}{e["details"]?.["reason"] ? `: ${e["details"]["reason"]}` : e["details"]?.["note"] ? `: ${e["details"]["note"]}` : ""}</li>)}
      </ul>
    </section>
  );
}

function useStudentData(h: Row, studentId: string | undefined) {
  return useQuery({
    queryKey: ["hw-mine", h["id"], studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const [state, sub, atts, grade] = await Promise.all([
        db.rpc("hw_state", { _hw: h["id"], _student: studentId }),
        db.from("homework_submissions").select("*").eq("homework_id", h["id"]).eq("student_id", studentId).maybeSingle(),
        db.from("homework_attempts").select("*").eq("homework_id", h["id"]).eq("student_id", studentId).order("attempt_no", { ascending: false }),
        db.from("homework_grades").select("*").eq("homework_id", h["id"]).eq("student_id", studentId).maybeSingle(),
      ]);
      if (state.error) throw state.error;
      const sid = sub.data?.id;
      const [draft, links, hist] = await Promise.all([
        sid ? db.from("homework_drafts").select("*").eq("submission_id", sid).maybeSingle() : { data: null },
        sid ? db.from("homework_submission_files").select("attempt_no, files(id, name, storage_path, size_bytes)").eq("submission_id", sid) : { data: [] },
        grade.data ? db.from("homework_grade_history").select("*").eq("grade_id", grade.data.id).order("created_at") : { data: [] },
      ]);
      return { state: state.data as Row, sub: sub.data as Row | null, attempts: (atts.data ?? []) as Row[], grade: grade.data as Row | null, draft: draft.data as Row | null, files: (links.data ?? []) as Row[], history: (hist.data ?? []) as Row[] };
    },
  });
}

function Attempts({ d, h }: { d: NonNullable<ReturnType<typeof useStudentData>["data"]>; h: Row }) {
  return (
    <>
      {d.grade && (
        <div className="rounded-lg bg-primary/5 p-3 text-sm">
          <p className="font-semibold">{d.grade["score"] != null ? `الدرجة: ${d.grade["score"]} من ${h["max_score"]}` : "ملاحظات المعلم"} <span className="text-xs text-muted-foreground">(المحاولة {d.grade["attempt_no"]})</span></p>
          {d.grade["feedback"] && <p className="whitespace-pre-wrap">{d.grade["feedback"]}</p>}
          {d.history.map((x) => <p key={x["id"]} className="text-xs text-muted-foreground">عُدّلت من {x["old_score"] ?? "—"} إلى {x["new_score"] ?? "—"}: {x["reason"]} ({schoolTime(x["created_at"])})</p>)}
        </div>
      )}
      {d.attempts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">سجل المحاولات</h4>
          {d.attempts.map((a) => (
            <div key={a["id"]} className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">المحاولة {a["attempt_no"]} · {a["kind"] === "paper" ? "تسليم ورقي سجله المعلم" : "إلكتروني"} · {schoolTime(a["submitted_at"])} {a["is_late"] && <span className="text-destructive">· متأخر</span>}</p>
              {a["body"] && <p className="mt-1 whitespace-pre-wrap">{a["body"]}</p>}
              {safeHref(a["link_url"]) && <a href={safeHref(a["link_url"])!} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">{a["link_url"]}</a>}
              {a["note"] && <p className="text-xs">ملاحظة: {a["note"]}</p>}
              <FileList files={d.files.filter((f) => f["attempt_no"] === a["attempt_no"]).map((f) => f["files"])} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function StudentPanel({ h }: { h: Row }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["hw-me", h["id"]],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      return (await db.from("students").select("id").eq("school_id", h["school_id"]).eq("user_id", auth.user.id).maybeSingle()).data as Row | null;
    },
  });
  const d = useStudentData(h, me.data?.["id"]);
  const [body, setBody] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useMemo(() => crypto.randomUUID(), [d.data?.sub?.["attempt_count"]]);
  if (me.isLoading || d.isLoading) return <LoadingState />;
  if (d.error) return <ErrorState message={arabicError(d.error)} />;
  if (!d.data) return <EmptyState title="لست ضمن المستهدفين بهذا الواجب" />;
  const x = d.data;
  const types = h["submission_types"] as string[];
  const b = body ?? x.draft?.["body"] ?? "";
  const l = link ?? x.draft?.["link_url"] ?? "";
  const refresh = () => qc.invalidateQueries({ queryKey: ["hw-mine", h["id"]] });
  async function saveDraft(quiet = false) {
    const { error } = await db.rpc("save_submission_draft", { _hw: h["id"], _body: b, _link: l || null });
    if (error) { toast.error(arabicError(error)); return false; }
    if (!quiet) toast.success("حُفظت المسودة — لم تُسلَّم بعد");
    return true;
  }
  async function submit() {
    setBusy(true);
    try {
      if (!(await saveDraft(true))) return;
      const { error } = await db.rpc("submit_homework", { _hw: h["id"], _client: clientId });
      if (error) { toast.error(arabicError(error)); return; }
      toast.success("تم استلام التسليم من الخادم");
      setBody(null); setLink(null); refresh();
    } finally { setBusy(false); }
  }
  const draftFiles = x.files.filter((f) => f["attempt_no"] == null).map((f) => f["files"]);
  const st = x.sub?.["status"] ?? "none";
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">تسليمي</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(st)}`}>{SUB_STATUS[st]}</span>
      </div>
      <p className="text-sm">موعدك: {schoolTime(x.state["effective_due"])}{x.state["effective_due"] !== h["due_at"] && " (ممدد لك)"} · المحاولات {x.state["attempts"]} من {x.state["max_attempts"]}</p>
      {st === "returned" && <p className="rounded-lg bg-destructive/10 p-3 text-sm">أعاده المعلم للاستكمال: {x.sub?.["returned_reason"]}</p>}
      {x.state["can_submit"] ? (
        <div className="space-y-3">
          {x.state["is_late_now"] && <p className="text-sm text-destructive">تجاوزت الموعد؛ سيُوسم تسليمك متأخرًا.</p>}
          {types.includes("text") && <Textarea rows={6} placeholder="اكتب إجابتك" value={b} onChange={(e) => setBody(e.target.value)} />}
          {types.includes("link") && <Input dir="ltr" placeholder="https://" value={l} onChange={(e) => setLink(e.target.value)} />}
          {types.includes("file") && (
            <>
              <FileList files={draftFiles} onRemove={async (f) => { const { error } = await db.rpc("remove_submission_file", { _file: f["id"] }); if (error) toast.error(arabicError(error)); refresh(); }} />
              <Uploader
                create={async (f) => { const { data, error } = await db.rpc("create_submission_file", { _hw: h["id"], _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }}
                release={(fid) => db.rpc("remove_submission_file", { _file: fid })}
                onDone={refresh} />
            </>
          )}
          <p className="text-xs text-muted-foreground">الوقت المعتمد هو وقت استلام الخادم لزر «تسليم»، وليس بدء الرفع.</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => saveDraft()}>حفظ مسودة</Button>
            <Button disabled={busy} onClick={submit}>{x.state["attempts"] > 0 ? "إعادة التسليم" : "تسليم الواجب"}</Button>
          </div>
        </div>
      ) : <p className="rounded-lg bg-muted p-3 text-sm">{x.state["reason"]}</p>}
      <Attempts d={x} h={h} />
      {!x.grade && h["max_score"] != null && x.attempts.length > 0 && <p className="text-xs text-muted-foreground">النتيجة لم تُنشر بعد.</p>}
    </section>
  );
}

function FamilyPanel({ h }: { h: Row }) {
  const { student } = Route.useSearch();
  const kids = useQuery({
    queryKey: ["hw-targets-family", h["id"]],
    queryFn: async () => (await db.from("homework_targets").select("student_id, students(full_name)").eq("homework_id", h["id"])).data as Row[],
  });
  const sid = student ?? kids.data?.[0]?.["student_id"];
  const d = useStudentData(h, sid);
  if (kids.isLoading || d.isLoading) return <LoadingState />;
  if (!sid || !d.data) return <EmptyState title="لا يخص هذا الواجب أحد أبنائك" />;
  const st = d.data.sub?.["status"] ?? "none";
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <h3 className="font-semibold">متابعة: {kids.data?.find((k) => k["student_id"] === sid)?.["students"]?.["full_name"]}</h3>
      <p className="text-sm">الحالة: {SUB_STATUS[st]} · الموعد: {schoolTime(d.data.state["effective_due"])}</p>
      <p className="text-xs text-muted-foreground">ولي الأمر يتابع فقط ولا يسلّم نيابة عن الطالب.</p>
      <Attempts d={d.data} h={h} />
    </section>
  );
}
