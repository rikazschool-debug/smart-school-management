import { createFileRoute, Link } from "@tanstack/react-router";
import { selectCls } from "@/components/ui/native-select";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError, useSchool } from "@/lib/session";
import { canAuthorHomework } from "@/lib/roles";
import { ExportBar } from "@/components/homework/export";
import { HW_STATUS, SUB_STATUS, schoolTime, statusTone } from "@/lib/homework";

export const Route = createFileRoute("/_authenticated/app/homework/")({
  head: () => ({ meta: [{ title: "الواجبات — ركاز" }, { name: "description", content: "قائمة الواجبات والتسليمات والنتائج." }] }),
  validateSearch: (s: Record<string, unknown>): { course?: string } => (s["course"] ? { course: String(s["course"]) } : {}),
  component: Page,
});

function Page() {
  const ctx = useSchool();
  if (!ctx?.schoolId) return <EmptyState title="اختر مدرسة أولًا" />;
  if (ctx.role === "student") return <StudentList schoolId={ctx.schoolId} />;
  if (ctx.role === "guardian") return <GuardianList schoolId={ctx.schoolId} />;
  return <StaffList schoolId={ctx.schoolId} author={canAuthorHomework(ctx.role)} />;
}

const Badge = ({ s, map }: { s: string; map: Record<string, string> }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone(s)}`}>{map[s] ?? s}</span>
);

function StaffList({ schoolId, author }: { schoolId: string; author: boolean }) {
  const search = Route.useSearch();
  const [course, setCourse] = useState(search.course ?? "");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [course, status, q, kind]);
  const courses = useQuery({
    queryKey: ["hw-courses", schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("courses").select("id, subjects(name), sections(name)").eq("school_id", schoolId);
      if (error) throw error;
      return data as Row[];
    },
  });
  const list = useQuery({
    queryKey: ["hw-list", schoolId, course, status, q, page, kind],
    queryFn: async () => {
      const { data, error } = await db.rpc("homework_list", { _school: schoolId, _course: course || null, _status: status || null, _q: q || null, _limit: 20, _offset: page * 20, _kind: kind || null });
      if (error) throw error;
      return data as Row[];
    },
  });
  const total = Number(list.data?.[0]?.["total"] ?? 0);
  return (
    <>
      <PageHeader title="الواجبات" desc={author ? "واجبات مقرراتك: الإعداد والنشر والتصحيح." : "متابعة الواجبات ضمن نطاق صلاحيتك (اطلاع فقط)."}
        action={author ? <Button asChild><Link to="/app/homework/new"><Plus className="h-4 w-4" /> واجب أو اختبار</Link></Button> : undefined} />
      <div className="mb-4 rounded-xl border bg-card p-3">
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Input className="h-9 sm:w-64" placeholder="بحث بالعنوان" aria-label="بحث بالعنوان" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={selectCls("w-full sm:w-auto", true)} value={course} onChange={(e) => setCourse(e.target.value)} aria-label="المقرر">
            <option value="">كل المقررات</option>
            {courses.data?.map((c) => <option key={c["id"]} value={c["id"]}>{c["subjects"]?.["name"]} — {c["sections"]?.["name"]}</option>)}
          </select>
          <select className={selectCls("w-full sm:w-auto", true)} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="النوع">
            <option value="">واجبات واختبارات</option><option value="homework">واجبات</option><option value="test">اختبارات</option>
          </select>
          <select className={selectCls("w-full sm:w-auto", true)} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(HW_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(q || course || status || kind) && <Button variant="ghost" size="sm" onClick={() => { setQ(""); setCourse(""); setStatus(""); setKind(""); }}>مسح الفلاتر</Button>}
        </div>
        <div className="mt-3 border-t pt-3">
          {course ? <ExportBar course={course} kinds={["homework", "submissions", "pending", "results"]} /> : <p className="text-xs text-muted-foreground">اختر مقررًا لتصدير تقاريره.</p>}
        </div>
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.length ? (
        <EmptyState title="لا توجد واجبات" hint={author ? "أنشئ أول واجب لمقرراتك." : undefined}
          action={author ? <Button asChild variant="outline"><Link to="/app/homework/new"><Plus className="h-4 w-4" /> واجب أو اختبار</Link></Button> : undefined} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>{["الواجب/الاختبار", "الحالة", "موعد التسليم", "التسليم", "يحتاج تصحيحًا", "النتائج"].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {list.data.map((r) => (
                  <tr key={r["id"]} className="hover:bg-muted/30">
                    <td className="px-4 py-3"><Link to="/app/homework/$id" params={{ id: r["id"] }} className="font-semibold text-foreground hover:text-primary">{r["title"]}</Link><p className="text-xs text-muted-foreground">{r["kind"] === "test" ? "اختبار" : "واجب"} · {r["subject"]} — {r["section"]}</p></td>
                    <td className="px-4 py-3"><Badge s={r["status"]} map={HW_STATUS} /></td>
                    <td className="whitespace-nowrap px-4 py-3">{schoolTime(r["due_at"])}</td>
                    <td className="px-4 py-3"><Progress done={r["submitted"]} total={r["targets"]} late={r["late"]} /></td>
                    <td className="px-4 py-3">{Number(r["to_grade"]) > 0 ? <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">{r["to_grade"]}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-xs">{r["max_score"] == null ? "غير مقيّم" : `${r["published_results"]} ظاهرة${r["unpublished"] ? ` · ${r["unpublished"]} تصحيح سابق غير ظاهر` : ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {list.data.map((r) => (
              <li key={r["id"]}>
                <Link to="/app/homework/$id" params={{ id: r["id"] }} className="block rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2"><p className="min-w-0 font-semibold">{r["title"]}</p><Badge s={r["status"]} map={HW_STATUS} /></div>
                  <p className="text-xs text-muted-foreground">{r["subject"]} — {r["section"]} · {schoolTime(r["due_at"])}</p>
                  <div className="mt-3 flex items-center justify-between gap-3"><Progress done={r["submitted"]} total={r["targets"]} late={r["late"]} />{Number(r["to_grade"]) > 0 && <span className="text-xs font-semibold text-warning-foreground">يحتاج تصحيحًا: {r["to_grade"]}</span>}</div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {total > 20 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
          <span>{page + 1} / {Math.ceil(total / 20)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>التالي</Button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">«متأخر» = عدد الطلاب الذين سلّموا محاولة بعد موعدهم. «لم يسلّم» يشمل المستهدفين الحاليين فقط.</p>
    </>
  );
}

function StudentList({ schoolId }: { schoolId: string }) {
  const me = useQuery({
    queryKey: ["me-student", schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data, error } = await db.from("students").select("id").eq("school_id", schoolId).eq("user_id", auth.user.id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  if (me.isLoading) return <LoadingState />;
  if (!me.data) return <EmptyState title="حسابك غير مرتبط بسجل طالب في هذه المدرسة" />;
  return (<><PageHeader title="واجباتي" /><StudentHomework studentId={me.data["id"]} /></>);
}

function GuardianList({ schoolId }: { schoolId: string }) {
  const kids = useQuery({
    queryKey: ["hw-kids", schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data, error } = await db.from("student_guardians").select("students(id, full_name), guardians!inner(user_id)")
        .eq("school_id", schoolId).eq("verified", true).eq("can_follow", true).eq("guardians.user_id", auth.user.id);
      if (error) throw error;
      return (data as Row[]).map((r) => r["students"]).filter(Boolean) as Row[];
    },
  });
  const [kid, setKid] = useState("");
  useEffect(() => { if (!kid && kids.data?.[0]) setKid(kids.data[0]["id"]); }, [kids.data, kid]);
  if (kids.isLoading) return <LoadingState />;
  if (!kids.data?.length) return <EmptyState title="لا يوجد أبناء موثقون للمتابعة" hint="تظهر الواجبات بعد توثيق علاقة ولي الأمر من المدرسة." />;
  return (
    <>
      <PageHeader title="واجبات الأبناء" />
      <ExportBar course={null} kinds={["family"]} note="يشمل أبناءك الموثّقين فقط، والدرجات التي حفظها المعلم فقط." />
      <div className="mb-4 flex flex-wrap gap-2">
        {kids.data.map((k) => (
          <Button key={k["id"]} variant={kid === k["id"] ? "default" : "outline"} size="sm" onClick={() => setKid(k["id"])}>{k["full_name"]}</Button>
        ))}
      </div>
      {kid && <StudentHomework studentId={kid} guardian />}
    </>
  );
}

function StudentHomework({ studentId, guardian }: { studentId: string; guardian?: boolean }) {
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

function Progress({ done, total, late }: { done: unknown; total: unknown; late: unknown }) {
  const d = Number(done ?? 0), t = Number(total ?? 0), l = Number(late ?? 0);
  const pct = t ? Math.round((d / t) * 100) : 0;
  return (
    <div className="min-w-32" title={`سلّم ${d} من ${t}${l ? ` · متأخر ${l}` : ""}`}>
      <div className="flex justify-between text-xs"><span className="font-semibold">{d}/{t}</span>{l > 0 && <span className="text-warning-foreground">متأخر {l}</span>}</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="نسبة التسليم"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
