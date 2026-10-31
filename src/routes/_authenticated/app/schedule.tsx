import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { db, useOptions, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { WeekGrid } from "@/components/week-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { canEditSchedule } from "@/lib/roles";
import { DAY_NAMES, slotLabel, todayISO, useCurrentTimetable, useDaySetup, useSlots, weekDates } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/app/schedule")({ component: Page });

type Ctx = AppContext & { schoolId: string };
const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function Page() {
  return <RequireSchool nav="schedule">{(ctx) => (canEditSchedule(ctx.role) ? <Manager ctx={ctx} /> : <Viewer ctx={ctx} />)}</RequireSchool>;
}

function SlotCard({ s, show, sub }: { s: Row; show: ("teacher" | "section")[]; sub?: Row | undefined }) {
  const l = slotLabel(s);
  return (
    <div className="rounded-md bg-primary/10 p-1.5 text-xs leading-5">
      <p className="font-semibold text-foreground">{l.subject}</p>
      {show.includes("section") && <p>{l.section}</p>}
      {show.includes("teacher") && <p className={sub ? "line-through opacity-60" : ""}>{l.teacher}</p>}
      {sub && <p className="font-semibold text-primary">بديل: {sub["teachers"]?.full_name ?? "معلم بديل"}</p>}
      {l.room && <p className="text-muted-foreground">{l.room}</p>}
    </div>
  );
}

function Filter({ slots, value, onChange }: { slots: Row[]; value: string; onChange: (v: string) => void }) {
  const secs = useMemo(() => [...new Map(slots.map((s) => [s["section_id"], slotLabel(s).section])).entries()], [slots]);
  const tchs = useMemo(() => [...new Map(slots.map((s) => [s["teacher_id"], slotLabel(s).teacher])).entries()], [slots]);
  return (
    <select className={sel + " sm:w-72"} aria-label="عرض حسب" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">كل الحصص</option>
      <optgroup label="الشعب">{secs.map(([id, n]) => <option key={id} value={"s:" + id}>شعبة {n}</option>)}</optgroup>
      <optgroup label="المعلمون">{tchs.map(([id, n]) => <option key={id} value={"t:" + id}>{n || "معلم"}</option>)}</optgroup>
    </select>
  );
}
const applyFilter = (slots: Row[], f: string) =>
  !f ? slots : f.startsWith("s:") ? slots.filter((s) => s["section_id"] === f.slice(2)) : slots.filter((s) => s["teacher_id"] === f.slice(2));

/* ============ Manager: drafts, editor, publish, versions ============ */
function Manager({ ctx }: { ctx: Ctx }) {
  const S = ctx.schoolId;
  const qc = useQueryClient();
  const setup = useDaySetup(S);
  const years = useOptions("academic_years", "name", S);
  const terms = useOptions("terms", "name", S);
  const tts = useQuery({
    queryKey: ["timetables", S],
    queryFn: async () => {
      const { data, error } = await db.from("timetables").select("*").eq("school_id", S).neq("status", "discarded").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  const [sel_, setSel] = useState<string>("");
  const [nf, setNf] = useState({ name: "الجدول الأساسي", year: "", term: "" });
  const [filter, setFilter] = useState("");
  const [eff, setEff] = useState(todayISO());
  const [adding, setAdding] = useState<{ day: number; period: Row } | null>(null);
  useEffect(() => { if (!sel_ && tts.data?.length) setSel(tts.data[0]["id"]); }, [tts.data, sel_]);
  const tt = tts.data?.find((t) => t["id"] === sel_);
  const slots = useSlots(tt?.["id"]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["timetables", S] }); qc.invalidateQueries({ queryKey: ["slots"] }); qc.invalidateQueries({ queryKey: ["current-tt"] }); };

  if (setup.isLoading || tts.isLoading) return <LoadingState />;
  if (setup.error || tts.error) return <ErrorState message={arabicError(setup.error ?? tts.error)} />;
  const d = setup.data!;
  if (!d.periods.some((p) => p["kind"] === "lesson")) return <EmptyState title="أضف الحصص أولًا" hint="من صفحة «إعداد اليوم الدراسي» حدّد أيام الدراسة والحصص." />;
  const isDraft = tt?.["status"] === "draft";
  const shown = applyFilter(slots.data ?? [], filter);
  const latestPublished = tts.data?.filter((t) => t["status"] === "published").sort((a, b) => (b["version"] ?? 0) - (a["version"] ?? 0))[0];

  return (
    <>
      <PageHeader title="الجدول المدرسي" desc="المسودة لا تظهر للمعلمين والطلاب والأسر حتى تنشرها. التعديل على جدول منشور يتم في نسخة جديدة ويُحفظ الإصدار السابق." />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card p-4 lg:col-span-2">
          <h2 className="mb-2 font-bold">الإصدارات والمسودات</h2>
          {!tts.data?.length ? <p className="text-sm text-muted-foreground">لا توجد جداول بعد.</p> : (
            <ul className="space-y-1 text-sm">
              {tts.data.map((t) => (
                <li key={t["id"]}>
                  <button onClick={() => setSel(t["id"])} className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start ${t["id"] === sel_ ? "border-primary bg-primary/5" : ""}`}>
                    <span className="font-medium">{t["name"]}</span>
                    <span className="text-muted-foreground">
                      {t["status"] === "draft" ? (t["based_on"] ? "مسودة تعديل" : "مسودة") : `منشور — إصدار ${t["version"]} — يسري من ${t["effective_from"]}`}
                      {latestPublished?.["id"] === t["id"] && " (الأحدث)"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form className="space-y-2 rounded-2xl border bg-card p-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!nf.year) return void toast.error("اختر السنة الدراسية");
          const { data, error } = await db.from("timetables").insert({ school_id: S, year_id: nf.year, term_id: nf.term || null, name: nf.name }).select().single();
          if (error) return void toast.error(arabicError(error));
          toast.success("أُنشئت المسودة"); refresh(); setSel(data.id);
        }}>
          <h2 className="font-bold">مسودة جديدة</h2>
          <Input aria-label="اسم الجدول" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
          <select className={sel} aria-label="السنة" value={nf.year} onChange={(e) => setNf({ ...nf, year: e.target.value })}><option value="">— السنة الدراسية —</option>{years.data?.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}</select>
          <select className={sel} aria-label="الفصل الدراسي" value={nf.term} onChange={(e) => setNf({ ...nf, term: e.target.value })}><option value="">— كل السنة —</option>{terms.data?.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}</select>
          <Button size="sm">إنشاء مسودة</Button>
        </form>
      </div>

      {tt && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
            <div className="space-y-1"><Label>عرض</Label><Filter slots={slots.data ?? []} value={filter} onChange={setFilter} /></div>
            {isDraft ? (
              <>
                <div className="space-y-1"><Label htmlFor="eff">تاريخ السريان</Label><Input id="eff" type="date" value={eff} onChange={(e) => setEff(e.target.value)} /></div>
                <Button onClick={async () => {
                  const { data, error } = await db.rpc("publish_timetable", { _id: tt["id"], _effective_from: eff });
                  if (error) return void toast.error(arabicError(error));
                  toast.success(`نُشر الإصدار ${data}`); refresh();
                }}>نشر</Button>
                <Button variant="ghost" onClick={async () => {
                  const { error } = await db.from("timetables").update({ status: "discarded" }).eq("id", tt["id"]);
                  if (error) return void toast.error(arabicError(error));
                  setSel(""); refresh();
                }}>تجاهل المسودة</Button>
              </>
            ) : (
              <Button variant="outline" onClick={async () => {
                const { data, error } = await db.rpc("start_timetable_revision", { _id: tt["id"] });
                if (error) return void toast.error(arabicError(error));
                toast.success("فُتحت نسخة تعديل"); refresh(); setSel(data);
              }}>نسخة تعديل</Button>
            )}
            <span className="text-sm text-muted-foreground">{slots.data?.length ?? 0} حصة{isDraft ? " — انقر خانة فارغة لإضافة حصة" : ""}</span>
          </div>
          {slots.isLoading ? <LoadingState /> : (
            <WeekGrid
              days={d.studyDays}
              periods={d.periods}
              cell={(day, p) => {
                const here = shown.filter((s) => s["day"] === day && s["period_id"] === p["id"]);
                return (
                  <div className="space-y-1">
                    {here.map((s) => (
                      <div key={s["id"]} className="group relative">
                        <SlotCard s={s} show={filter.startsWith("t:") ? ["section"] : filter.startsWith("s:") ? ["teacher"] : ["teacher", "section"]} />
                        {isDraft && <button className="absolute end-1 top-1 hidden rounded bg-background px-1 text-[10px] text-destructive group-hover:block" onClick={async () => {
                          const { error } = await db.from("timetable_slots").delete().eq("id", s["id"]);
                          if (error) toast.error(arabicError(error)); else refresh();
                        }}>حذف</button>}
                      </div>
                    ))}
                    {isDraft && <button className="w-full rounded-md border border-dashed py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => setAdding({ day, period: p })}>+</button>}
                  </div>
                );
              }}
            />
          )}
          <AddSlot ctx={ctx} tt={tt} rooms={d.rooms} target={adding} filter={filter} onClose={() => setAdding(null)} onDone={refresh} />
        </>
      )}
    </>
  );
}

function AddSlot({ ctx, tt, rooms, target, filter, onClose, onDone }: { ctx: Ctx; tt: Row; rooms: Row[]; target: { day: number; period: Row } | null; filter: string; onClose: () => void; onDone: () => void }) {
  const asg = useQuery({
    queryKey: ["approved-asg", ctx.schoolId, tt["year_id"]],
    queryFn: async () => {
      const { data, error } = await db.from("teacher_assignments").select("teacher_id, course_id, start_date, end_date, teachers(full_name), courses(year_id, section_id, subjects(name), sections(name, grades(name)))").eq("school_id", ctx.schoolId).eq("status", "approved");
      if (error) throw error;
      return (data as Row[]).filter((a) => a["courses"]?.year_id === tt["year_id"]);
    },
  });
  const [pick, setPick] = useState("");
  const [room, setRoom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setPick(""); setErr(null); }, [target]);
  const opts = (asg.data ?? []).filter((a) => !filter || (filter.startsWith("s:") ? a["courses"]?.section_id === filter.slice(2) : a["teacher_id"] === filter.slice(2)));
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>إضافة حصة — {target && DAY_NAMES[target.day]} — {target?.period["name"]}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const a = opts.find((x) => `${x["course_id"]}|${x["teacher_id"]}` === pick);
          if (!a || !target) return void setErr("اختر المقرر والمعلم");
          const { error } = await db.from("timetable_slots").insert({ timetable_id: tt["id"], school_id: ctx.schoolId, day: target.day, period_id: target.period["id"], course_id: a["course_id"], section_id: a["courses"].section_id, teacher_id: a["teacher_id"], room_id: room || null });
          if (error) return void setErr(arabicError(error));
          toast.success("أضيفت الحصة"); onDone(); onClose();
        }}>
          <div className="space-y-1"><Label htmlFor="as">المقرر — الشعبة — المعلم المكلّف</Label>
            <select id="as" className={sel} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">— اختر —</option>
              {opts.map((a) => <option key={a["course_id"] + a["teacher_id"]} value={`${a["course_id"]}|${a["teacher_id"]}`}>{a["courses"]?.subjects?.name} — {a["courses"]?.sections?.grades?.name}/{a["courses"]?.sections?.name} — {a["teachers"]?.full_name}</option>)}
            </select>
            {!asg.isLoading && !opts.length && <p className="text-xs text-muted-foreground">لا توجد تكليفات معتمدة مطابقة. اعتمد التكليفات من صفحة المقررات.</p>}
          </div>
          {rooms.length > 0 && <div className="space-y-1"><Label htmlFor="rm">القاعة (اختياري)</Label><select id="rm" className={sel} value={room} onChange={(e) => setRoom(e.target.value)}><option value="">—</option>{rooms.map((r) => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}</select></div>}
          {err && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
          <Button>إضافة</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Viewer: every other role, one published source ============ */
function Viewer({ ctx }: { ctx: Ctx }) {
  const S = ctx.schoolId;
  const { user } = useSession();
  const [date, setDate] = useState(todayISO());
  const setup = useDaySetup(S);
  const cur = useCurrentTimetable(S, date);
  const slots = useSlots(cur.data);
  const week = weekDates(date);
  const subs = useQuery({
    queryKey: ["subs-week", S, week[0]],
    queryFn: async () => {
      const { data, error } = await db.from("substitutions").select("id, slot_id, date, status, substitute_teacher_id, teachers:substitute_teacher_id(full_name)").eq("school_id", S).eq("status", "active").gte("date", week[0]).lte("date", week[6]);
      if (error) throw error;
      return data as Row[];
    },
  });
  const mine = useQuery({
    queryKey: ["my-teacher-ids", S, user.id],
    queryFn: async () => {
      const { data } = await db.from("teachers").select("id").eq("school_id", S).eq("user_id", user.id);
      return ((data ?? []) as Row[]).map((r) => r["id"] as string);
    },
  });
  const scope = useQuery({
    queryKey: ["schedule-scope", S, ctx.role, ctx.departmentId, user.id],
    enabled: ctx.role === "supervisor" || ctx.role === "dept_head",
    queryFn: async () => {
      if (ctx.role === "supervisor") {
        const { data } = await db.from("supervisor_teachers").select("teacher_id").eq("supervisor_user_id", user.id);
        return ((data ?? []) as Row[]).map((r) => r["teacher_id"] as string);
      }
      const { data } = await db.from("teachers").select("id").eq("school_id", S).eq("department_id", ctx.departmentId);
      return ((data ?? []) as Row[]).map((r) => r["id"] as string);
    },
  });
  const [filter, setFilter] = useState("");

  if (setup.isLoading || cur.isLoading) return <LoadingState />;
  if (setup.error || cur.error) return <ErrorState message={arabicError(setup.error ?? cur.error)} />;
  const d = setup.data!;
  let base = slots.data ?? [];
  if (ctx.role === "teacher") base = base.filter((s) => mine.data?.includes(s["teacher_id"]));
  if (ctx.role === "supervisor" || ctx.role === "dept_head") base = base.filter((s) => scope.data?.includes(s["teacher_id"]));
  const subBySlot = new Map((subs.data ?? []).map((x) => [`${x["slot_id"]}|${x["date"]}`, x]));
  const myCover = ctx.role === "teacher" ? (subs.data ?? []).filter((x) => mine.data?.includes(x["substitute_teacher_id"])) : [];
  const allSlots = new Map((slots.data ?? []).map((s) => [s["id"], s]));
  const shown = applyFilter(base, filter);
  const title = { teacher: "جدولي", student: "جدول شعبتي", guardian: "جدول الابن", dept_head: "جداول معلمي القسم", supervisor: "حصص المعلمين المسندين إليّ" }[ctx.role as string] ?? "الجدول المدرسي";
  const needsFilter = ["guardian", "dept_head", "supervisor", "student_affairs"].includes(ctx.role);

  return (
    <>
      <PageHeader title={title} desc="الجدول المنشور الساري في الأسبوع المحدد، مع التبديلات اليومية." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="dt">الأسبوع الذي يتضمن</Label><Input id="dt" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        {needsFilter && base.length > 0 && <div className="space-y-1"><Label>{ctx.role === "guardian" ? "الابن / الشعبة" : "عرض"}</Label><Filter slots={base} value={filter} onChange={setFilter} /></div>}
      </div>
      {(ctx.role === "supervisor" && scope.data?.length === 0) ? <EmptyState title="لم يُسند إليك معلمون بعد" hint="تُسند إدارة المدرسة المعلمين للمشرف من صفحة إعداد اليوم الدراسي." /> :
        !cur.data ? <EmptyState title="لا يوجد جدول منشور ساري لهذا التاريخ" /> :
        slots.isLoading ? <LoadingState /> : !base.length ? <EmptyState title="لا توجد حصص ضمن صلاحيتك في هذا الجدول" /> : (
          <WeekGrid
            days={d.studyDays}
            periods={d.periods}
            initialDay={new Date(date + "T00:00:00").getDay()}
            cell={(day, p) => (
              <div className="space-y-1">
                {shown.filter((s) => s["day"] === day && s["period_id"] === p["id"]).map((s) => (
                  <SlotCard key={s["id"]} s={s} show={ctx.role === "teacher" ? ["section"] : ctx.role === "student" || ctx.role === "guardian" ? ["teacher"] : ["teacher", "section"]} sub={subBySlot.get(`${s["id"]}|${week[day]}`)} />
                ))}
              </div>
            )}
          />
        )}
      {myCover.length > 0 && (
        <section className="mt-6 rounded-2xl border bg-card p-4">
          <h2 className="mb-2 font-bold">حصص التغطية المسندة إليك هذا الأسبوع</h2>
          <ul className="space-y-1 text-sm">
            {myCover.map((x) => { const s = allSlots.get(x["slot_id"]); const l = s ? slotLabel(s) : null; return <li key={x["id"]}>{x["date"]} — {s?.["periods"]?.name} — {l?.subject} — {l?.section}</li>; })}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">التغطية لا تمنحك صلاحية إدارة المقرر أو درجاته.</p>
        </section>
      )}
    </>
  );
}
