import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pin, PinOff, ShieldCheck, Wand2 } from "lucide-react";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
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
import { ExportButtons } from "@/components/list-tools";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { canEditSchedule, scheduleLabel, scheduleTabs, type ScheduleTab } from "@/lib/roles";
import { SubstitutionsTab } from "@/components/schedule/substitutions-tab";
import { SettingsTab } from "@/components/schedule/settings-tab";
import { GeneratePanel } from "@/components/schedule/generate-panel";
import { DAY_NAMES, slotLabel, todayISO, useCurrentTimetable, useDaySetup, useSlots, weekDates } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/app/schedule")({
  validateSearch: (s: Record<string, unknown>): { tab?: ScheduleTab | undefined } => ({ tab: s["tab"] === "subs" || s["tab"] === "settings" || s["tab"] === "timetable" ? s["tab"] : undefined }),
  head: () => ({ meta: [{ title: "الجدول المدرسي | ركاز" }, { name: "description", content: "بناء الجدول المدرسي وتوليده ونشره، والبدلاء، وإعدادات اليوم الدراسي والأنصبة" }] }),
  component: Page,
});
const TAB_LABEL: Record<ScheduleTab, string> = { timetable: "الجدول", subs: "البدلاء", settings: "الإعدادات" };

type Ctx = AppContext & { schoolId: string };
const sel = selectCls("w-full");

function Page() {
  return <RequireSchool nav="schedule">{(ctx) => (canEditSchedule(ctx.role) ? <ManagerTabs ctx={ctx} /> : <Viewer ctx={ctx} />)}</RequireSchool>;
}

function ManagerTabs({ ctx }: { ctx: Ctx }) {
  const { tab = "timetable" } = Route.useSearch();
  const nav = useNavigate({ from: "/app/schedule" });
  return (
    <>
      <PageHeader title="الجدول المدرسي" desc="الجدول والبدلاء والإعدادات في مكان واحد. المسودة لا تظهر للمعلمين والطلاب والأسر حتى تنشرها." />
      <div role="tablist" aria-label="أقسام الجدول" className="mb-5 flex gap-1 border-b">
        {scheduleTabs(ctx.role).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => nav({ search: { tab: t }, replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{TAB_LABEL[t]}</button>
        ))}
      </div>
      {tab === "subs" ? <SubstitutionsTab ctx={ctx} /> : tab === "settings" ? <SettingsTab ctx={ctx} /> : <Manager ctx={ctx} />}
    </>
  );
}

function SlotCard({ s, show, sub, problem }: { s: Row; show: ("teacher" | "section")[]; sub?: Row | undefined; problem?: string | undefined }) {
  const l = slotLabel(s);
  return (
    <div className={`rounded-md p-1.5 text-xs leading-5 ${problem ? "bg-destructive/10 ring-1 ring-destructive" : "bg-primary/10"} ${s["pinned"] ? "border-s-4 border-primary" : ""}`} data-testid="slot" data-pinned={s["pinned"] ? "1" : "0"}>
      <p className="font-semibold text-foreground">{s["pinned"] && <span aria-label="مثبتة" title="حصة مثبتة">📌 </span>}{l.subject}</p>
      {problem && <p className="font-semibold text-destructive">⚠ {problem}</p>}
      {show.includes("section") && <p>{l.section}</p>}
      {show.includes("teacher") && <p className={sub ? "line-through opacity-60" : ""}>{l.teacher}</p>}
      {sub && <p className="font-semibold text-primary">بديل: {sub["teachers"]?.full_name ?? s["_names"]?.get(sub["substitute_teacher_id"]) ?? "معلم بديل"}</p>}
      {l.room && <p className="text-muted-foreground">{l.room}</p>}
    </div>
  );
}

function Filter({ slots, value, onChange, sectionsOnly, withRooms, names }: { slots: Row[]; value: string; onChange: (v: string) => void; sectionsOnly?: boolean; withRooms?: boolean; names?: Map<string, string[]> }) {
  const rms = useMemo(() => [...new Map(slots.filter((s) => s["room_id"]).map((s) => [s["room_id"], slotLabel(s).room])).entries()], [slots]);
  const secs = useMemo(() => [...new Map(slots.map((s) => [s["section_id"], slotLabel(s).section])).entries()], [slots]);
  const tchs = useMemo(() => [...new Map(slots.map((s) => [s["teacher_id"], slotLabel(s).teacher])).entries()], [slots]);
  return (
    <select className={sel + " sm:w-72"} aria-label="عرض حسب" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">كل الحصص</option>
      <optgroup label="الشعب">{secs.map(([id, n]) => <option key={id} value={"s:" + id}>{names?.get(id as string)?.length ? `${names.get(id as string)!.join("، ")} — ${n}` : `شعبة ${n}`}</option>)}</optgroup>
      {!sectionsOnly && <optgroup label="المعلمون">{tchs.map(([id, n]) => <option key={id} value={"t:" + id}>{n || "معلم"}</option>)}</optgroup>}
      {withRooms && rms.length > 0 && <optgroup label="القاعات">{rms.map(([id, n]) => <option key={id} value={"r:" + id}>{n}</option>)}</optgroup>}
    </select>
  );
}
function ScheduleExport({ rows, school, title, week, subBySlot, filters = [] }: { rows: Row[]; school: string; title: string; week?: string[]; subBySlot?: Map<string, Row>; filters?: string[] }) {
  const sorted = [...rows].sort((a, b) => a["day"] - b["day"] || String(a["periods"]?.start_time ?? "").localeCompare(String(b["periods"]?.start_time ?? "")));
  return <ExportButtons title={title} school={school} filters={filters} headers={["اليوم", "الحصة", "الوقت", "المادة", "الشعبة", "المعلم", "البديل", "القاعة", "مثبتة"]}
    rows={() => sorted.map((s) => { const l = slotLabel(s); const sub = week && subBySlot?.get(`${s["id"]}|${week[s["day"]]}`); return [DAY_NAMES[s["day"]], s["periods"]?.name ?? "", `${String(s["periods"]?.start_time ?? "").slice(0, 5)}–${String(s["periods"]?.end_time ?? "").slice(0, 5)}`, l.subject, l.section, l.teacher, sub ? (sub["teachers"]?.full_name ?? "بديل") : "", l.room ?? "", s["pinned"] ? "نعم" : ""]; })} />;
}
const applyFilter = (slots: Row[], f: string) =>
  !f ? slots : f.startsWith("s:") ? slots.filter((s) => s["section_id"] === f.slice(2)) : f.startsWith("r:") ? slots.filter((s) => s["room_id"] === f.slice(2)) : slots.filter((s) => s["teacher_id"] === f.slice(2));

/* ============ Manager: drafts, editor, generation, validation, publish, versions ============ */
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
  const [gen, setGen] = useState(false);
  const [versions, setVersions] = useState(false);
  const [problems, setProblems] = useState<Row[] | null>(null);
  useEffect(() => { if (!sel_ && tts.data?.length) setSel(tts.data[0]!["id"]); }, [tts.data, sel_]);
  const tt = tts.data?.find((t) => t["id"] === sel_);
  const slots = useSlots(tt?.["id"]);
  useEffect(() => setProblems(null), [sel_]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["timetables", S] }); qc.invalidateQueries({ queryKey: ["slots"] }); qc.invalidateQueries({ queryKey: ["current-tt"] }); qc.invalidateQueries({ queryKey: ["tt-input"] }); qc.invalidateQueries({ queryKey: ["tt-loads", S] }); };
  const validate = async () => {
    if (!tt) return;
    const { data, error } = await db.rpc("tt_validate" as never, { _tt: tt["id"] } as never);
    if (error) return void toast.error(arabicError(error));
    setProblems((data ?? []) as unknown as Row[]);
  };

  if (setup.isLoading || tts.isLoading) return <LoadingState />;
  if (setup.error || tts.error) return <ErrorState message={arabicError(setup.error ?? tts.error)} />;
  const d = setup.data!;
  if (!d.periods.some((p) => p["kind"] === "lesson")) return <EmptyState title="أضف الحصص أولًا" hint="من تبويب «الإعدادات» حدّد أيام الدراسة والحصص." />;
  const isDraft = tt?.["status"] === "draft";
  const shown = applyFilter(slots.data ?? [], filter);
  const latestPublished = tts.data?.filter((t) => t["status"] === "published").sort((a, b) => (b["version"] ?? 0) - (a["version"] ?? 0))[0];
  const ttLabel = (t: Row) => t["status"] === "draft" ? (t["based_on"] ? "مسودة تعديل" : "مسودة") : `منشور — إصدار ${t["version"]} — يسري من ${t["effective_from"]}`;
  const filterLabel = !filter ? "كل الحصص" : filter.startsWith("s:") ? `شعبة ${slotLabel(shown[0] ?? {}).section}` : filter.startsWith("t:") ? `المعلم ${slotLabel(shown[0] ?? {}).teacher}` : `القاعة ${slotLabel(shown[0] ?? {}).room}`;
  const problemBySlot = new Map((problems ?? []).filter((p) => p["slot_id"]).map((p) => [p["slot_id"], p["message"]]));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="space-y-1"><Label htmlFor="tt-pick">الجدول / الإصدار</Label>
          <select id="tt-pick" className={selectCls("w-80")} value={sel_} onChange={(e) => setSel(e.target.value)}>
            {!tts.data?.length && <option value="">لا توجد جداول بعد</option>}
            {tts.data?.map((t) => <option key={t["id"]} value={t["id"]}>{t["name"]} — {ttLabel(t)}{latestPublished?.["id"] === t["id"] ? " (الأحدث)" : ""}</option>)}
          </select></div>
        <Button variant="outline" size="sm" onClick={() => setVersions((v) => !v)}>الإصدارات</Button>
        {tt && <span className={`rounded-full px-3 py-1 text-xs font-bold ${isDraft ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"}`}>{isDraft ? "✎ مسودة — غير منشورة" : `✓ منشور — إصدار ${tt["version"]}`}</span>}
      </div>
      {versions && (
        <section className="mb-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
            <h2 className="mb-2 font-bold">الإصدارات والمسودات</h2>
            <ul className="space-y-1 text-sm">
              {tts.data?.map((t) => (
                <li key={t["id"]}><button onClick={() => setSel(t["id"])} className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start ${t["id"] === sel_ ? "border-primary bg-primary/5" : ""}`}>
                  <span className="font-medium">{t["name"]}</span><span className="text-muted-foreground">{ttLabel(t)}{latestPublished?.["id"] === t["id"] && " (الأحدث)"}</span></button></li>
              ))}
              {!tts.data?.length && <li className="text-muted-foreground">لا توجد جداول بعد.</li>}
            </ul>
          </div>
          <form className="space-y-2 rounded-2xl border bg-card p-4" onSubmit={async (e) => {
            e.preventDefault();
            if (!nf.year) return void toast.error("اختر السنة الدراسية");
            const { data, error } = await db.from("timetables").insert({ school_id: S, year_id: nf.year, term_id: nf.term || null, name: nf.name }).select().single();
            if (error) return void toast.error(arabicError(error));
            toast.success("أُنشئت المسودة"); refresh(); setSel(data.id); setVersions(false);
          }}>
            <h2 className="font-bold">إنشاء مسودة</h2>
            <Input aria-label="اسم الجدول" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
            <select className={sel} aria-label="السنة" value={nf.year} onChange={(e) => setNf({ ...nf, year: e.target.value })}><option value="">— السنة الدراسية —</option>{years.data?.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}</select>
            <select className={sel} aria-label="الفصل الدراسي" value={nf.term} onChange={(e) => setNf({ ...nf, term: e.target.value })}><option value="">— كل السنة —</option>{terms.data?.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}</select>
            <Button size="sm">إنشاء مسودة</Button>
          </form>
        </section>
      )}
      {!tts.data?.length && !versions && <EmptyState title="لا يوجد جدول بعد" hint="افتح «الإصدارات» وأنشئ مسودة للسنة الدراسية." />}

      {tt && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
            <div className="space-y-1"><Label>عرض حسب</Label><Filter slots={slots.data ?? []} value={filter} onChange={setFilter} withRooms /></div>
            {isDraft ? (
              <>
                <Button onClick={() => setGen(true)}><Wand2 className="me-1 size-4" /> توليد الجدول</Button>
                <Button variant="outline" onClick={validate}><ShieldCheck className="me-1 size-4" /> فحص الجدول</Button>
                <div className="space-y-1"><Label htmlFor="eff">تاريخ السريان</Label><Input id="eff" type="date" value={eff} onChange={(e) => setEff(e.target.value)} /></div>
                <Button onClick={async () => {
                  if (!(await ask(`نشر الجدول ليسري من ${eff}؟ سيُشعَر المعلمون والطلاب والأسر مرة واحدة.`))) return;
                  const { data, error } = await db.rpc("publish_timetable", { _id: tt["id"], _effective_from: eff });
                  if (error) { toast.error(arabicError(error)); return void validate(); }
                  toast.success(`نُشر الإصدار ${data}`); refresh();
                }}>نشر</Button>
                <Button variant="ghost" onClick={async () => {
                  if (!(await ask("تجاهل هذه المسودة؟ لا يتأثر الجدول المنشور.", { destructive: true }))) return;
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
            <span className="text-sm text-muted-foreground">{slots.data?.length ?? 0} حصة{isDraft ? ` — ${(slots.data ?? []).filter((x) => x["pinned"]).length} مثبتة — انقر + لإضافة حصة` : ""}</span>
            <ScheduleExport rows={shown} school={ctx.schoolName} title={`الجدول المدرسي — ${isDraft ? "مسودة غير منشورة" : "إصدار " + (tt["version"] ?? "") + " يسري من " + tt["effective_from"]}`} filters={[tt["name"], filterLabel]} />
          </div>
          {problems && (
            <section className={`mb-4 rounded-2xl border p-4 ${problems.length ? "border-destructive/40 bg-destructive/5" : "bg-primary/5"}`} aria-live="polite" data-testid="tt-problems">
              <h2 className="mb-1 font-bold">{problems.length ? `⚠ ${problems.length} مشكلة تمنع النشر` : "✓ لا توجد تعارضات أو متطلبات ناقصة"}</h2>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm">{problems.map((p, i) => <li key={i}>• {p["message"]}</li>)}</ul>
            </section>
          )}
          {slots.isLoading ? <LoadingState /> : (
            <WeekGrid
              days={d.studyDays}
              periods={d.periods}
              cell={(day, p) => {
                const pd = p["days"] as number[] | null;
                if (pd && !pd.includes(day)) return <span className="text-xs text-muted-foreground">— لا تُعقد</span>;
                const here = shown.filter((s) => s["day"] === day && s["period_id"] === p["id"]);
                return (
                  <div className="space-y-1">
                    {here.map((s) => (
                      <div key={s["id"]} className="group relative">
                        <SlotCard s={s} show={filter.startsWith("t:") ? ["section"] : filter.startsWith("s:") ? ["teacher"] : ["teacher", "section"]} problem={problemBySlot.get(s["id"])} />
                        {isDraft && (
                          <span className="absolute end-1 top-1 flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                            <button aria-label={s["pinned"] ? "إلغاء تثبيت الحصة" : "تثبيت الحصة"} title={s["pinned"] ? "إلغاء التثبيت" : "تثبيت الحصة"} className="rounded bg-background px-1 text-[10px]" onClick={async () => {
                              const { error } = await db.from("timetable_slots").update({ pinned: !s["pinned"] }).eq("id", s["id"]);
                              if (error) toast.error(arabicError(error)); else refresh();
                            }}>{s["pinned"] ? <PinOff className="size-3" /> : <Pin className="size-3" />}</button>
                            <button className="rounded bg-background px-1 text-[10px] text-destructive" onClick={async () => {
                              const { error } = await db.from("timetable_slots").delete().eq("id", s["id"]);
                              if (error) toast.error(arabicError(error)); else refresh();
                            }}>حذف</button>
                          </span>
                        )}
                      </div>
                    ))}
                    {isDraft && <button aria-label={`إضافة حصة ${DAY_NAMES[day]} ${p["name"]}`} className="w-full rounded-md border border-dashed py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => setAdding({ day, period: p })}>+</button>}
                  </div>
                );
              }}
            />
          )}
          <AddSlot ctx={ctx} tt={tt} rooms={d.rooms} target={adding} filter={filter} onClose={() => setAdding(null)} onDone={refresh} />
          {isDraft && <GeneratePanel tt={tt} open={gen} onClose={() => setGen(false)} onApplied={() => { refresh(); setProblems(null); }} />}
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
    enabled: ctx.role === "supervisor",
    queryFn: async () => {
      const { data } = await db.from("supervisor_teachers").select("teacher_id").eq("supervisor_user_id", user.id);
      return ((data ?? []) as Row[]).map((r) => r["teacher_id"] as string);
    },
  });
  const [filter, setFilter] = useState("");
  // guardians: label each section with the child's name and open on the first child (one child at a time)
  const kids = useQuery({
    queryKey: ["schedule-kids", S, user.id],
    enabled: ctx.role === "guardian",
    queryFn: async () => {
      const { data } = await db.from("student_guardians").select("students(full_name, enrollments(section_id, status)), guardians!inner(user_id)").eq("school_id", S).eq("guardians.user_id", user.id);
      const m = new Map<string, string[]>();
      for (const r of (data ?? []) as Row[]) {
        const st = r["students"] as Row | null;
        for (const e of ((st?.["enrollments"] ?? []) as Row[])) if (e["status"] === "active") m.set(e["section_id"] as string, [...(m.get(e["section_id"] as string) ?? []), st!["full_name"] as string]);
      }
      return m;
    },
  });
  useEffect(() => {
    if (ctx.role === "guardian" && !filter && kids.data?.size) setFilter("s:" + [...kids.data.keys()][0]);
  }, [ctx.role, kids.data, filter]);

  if (setup.isLoading || cur.isLoading) return <LoadingState />;
  if (setup.error || cur.error) return <ErrorState message={arabicError(setup.error ?? cur.error)} />;
  const d = setup.data!;
  let base = slots.data ?? [];
  if (ctx.role === "teacher") base = base.filter((s) => mine.data?.includes(s["teacher_id"]));
  // dept heads: the database already returns only their department's courses (is_dept_course), even when a teacher also teaches elsewhere
  if (ctx.role === "supervisor") base = base.filter((s) => scope.data?.includes(s["teacher_id"]));
  const subBySlot = new Map((subs.data ?? []).map((x) => [`${x["slot_id"]}|${x["date"]}`, x]));
  const myCover = ctx.role === "teacher" ? (subs.data ?? []).filter((x) => mine.data?.includes(x["substitute_teacher_id"])) : [];
  const allSlots = new Map((slots.data ?? []).map((s) => [s["id"], s]));
  const shown = applyFilter(base, filter);
  const title = scheduleLabel(ctx.role);
  const sub_ = { teacher: "حصصي وحصص التغطية", student: "جدول شعبتي", guardian: "جدول كل ابن على حدة", dept_head: "جداول معلمي القسم", supervisor: "حصص المعلمين المسندين إليّ" }[ctx.role as string] ?? "الجدول المنشور";
  const needsFilter = ["guardian", "dept_head", "supervisor", "student_affairs"].includes(ctx.role);

  return (
    <>
      <PageHeader title={title} desc={`${sub_} — الجدول المنشور الساري في الأسبوع المحدد، مع التبديلات اليومية.`} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="dt">الأسبوع الذي يتضمن</Label><Input id="dt" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        {needsFilter && base.length > 0 && <div className="space-y-1"><Label>{ctx.role === "guardian" ? "الابن / الشعبة" : "عرض"}</Label><Filter slots={base} value={filter} onChange={setFilter} sectionsOnly={ctx.role === "guardian"} names={kids.data} /></div>}
        {cur.data && shown.length > 0 && <ScheduleExport rows={shown} school={ctx.schoolName} title={`${title} — أسبوع ${week[0]}`} week={week} subBySlot={subBySlot} filters={[sub_]} />}
      </div>
      {(ctx.role === "supervisor" && scope.data?.length === 0) ? <EmptyState title="لم يُسند إليك معلمون بعد" hint="تُسند إدارة المدرسة المعلمين للمشرف من صفحة إعداد اليوم الدراسي." /> :
        (ctx.role === "dept_head" && !ctx.departmentId) ? <EmptyState title="لم يُسند إليك قسم بعد" hint="يحدد مالك المؤسسة قسمك من المستخدمين والأدوار." /> :
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
