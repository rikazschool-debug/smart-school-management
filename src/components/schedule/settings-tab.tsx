import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { db, useOptions, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError, type AppContext } from "@/lib/session";
import { DAY_NAMES, useDaySetup } from "@/lib/schedule";
import { UNAV_KIND } from "@/lib/timetable-model";
import { useSchoolPerms } from "@/lib/school-perms";
import { anyPermission } from "@/lib/workspace-perms";

type Ctx = AppContext & { schoolId: string };
const sel = selectCls("w-full");
const selSm = selectCls("h-8 text-xs");

function Group({ title, hint, children, open }: { title: string; hint?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="group mb-3 rounded-2xl border bg-card" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
        <span><span className="font-bold">{title}</span>{hint && <span className="ms-2 text-xs text-muted-foreground">{hint}</span>}</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}

export function useYearTerm(S: string) {
  const years = useQuery({
    queryKey: ["tt-years", S],
    queryFn: async () => {
      const [y, t] = await Promise.all([
        db.from("academic_years").select("id, name, is_current, start_date").eq("school_id", S).order("start_date", { ascending: false }),
        db.from("terms").select("id, name, year_id, start_date").eq("school_id", S).order("start_date"),
      ]);
      if (y.error) throw y.error;
      return { years: (y.data ?? []) as Row[], terms: (t.data ?? []) as Row[] };
    },
  });
  return years;
}

/** «الإعدادات» tab: school day, rooms, course requirements, teacher loads, availability, substitute policy, supervisors.
 *  Everything here feeds the generator and the server checks (_tt_slot_problem); nothing is entered twice. */
export function SettingsTab({ ctx }: { ctx: Ctx }) {
  const S = ctx.schoolId;
  const permissions = useSchoolPerms(S);
  const access = (key: string) => anyPermission(permissions, [`${key}.view`, `${key}.edit`]);
  const edit = (key: string) => !!permissions?.[`${key}.edit`];
  const yt = useYearTerm(S);
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const y = year || yt.data?.years.find((x) => x["is_current"])?.["id"] || yt.data?.years[0]?.["id"] || "";
  if (yt.isLoading) return <LoadingState />;
  if (yt.error) return <ErrorState message={arabicError(yt.error)} />;
  const terms = (yt.data?.terms ?? []).filter((t) => t["year_id"] === y);
  return (
    <>
      <DayAndRooms S={S} dayView={access("schedule_day")} dayEdit={edit("schedule_day")} roomsView={access("schedule_rooms")} roomsEdit={edit("schedule_rooms")} />
      <div className="my-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-muted/30 p-3">
        <div className="space-y-1"><Label htmlFor="st-y">السنة الدراسية</Label>
          <select id="st-y" className={selectCls("w-48")} value={y} onChange={(e) => { setYear(e.target.value); setTerm(""); }}>{yt.data?.years.map((x) => <option key={x["id"]} value={x["id"]}>{x["name"]}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="st-t">الفصل</Label>
          <select id="st-t" className={selectCls("w-48")} value={term} onChange={(e) => setTerm(e.target.value)}><option value="">كل السنة</option>{terms.map((x) => <option key={x["id"]} value={x["id"]}>{x["name"]}</option>)}</select></div>
        <p className="text-xs text-muted-foreground">متطلبات المقررات وأنصبة المعلمين مرتبطة بالسنة والفصل المختارين.</p>
      </div>
      {y ? <>
        {access("schedule_requirements") && <fieldset disabled={!edit("schedule_requirements")}><CourseReqs S={S} year={y} term={term} /></fieldset>}
        {access("schedule_loads") && <fieldset disabled={!edit("schedule_loads")}><Loads S={S} year={y} term={term} /></fieldset>}
      </> : <p className="mb-3 text-sm text-muted-foreground">أضف سنة دراسية من الإعداد الأكاديمي أولًا.</p>}
      {access("schedule_availability") && <fieldset disabled={!edit("schedule_availability")}><Availability S={S} /></fieldset>}
      {access("schedule_sub_policy") && <fieldset disabled={!edit("schedule_sub_policy")}><SubPolicy S={S} /></fieldset>}
      <p className="text-sm text-muted-foreground">إسناد المعلمين للمشرفين ونطاق الوكلاء صار في «الإعداد الأكاديمي ← نطاق الوكلاء والمشرفين».</p>
    </>
  );
}

function DayAndRooms({ S, dayView, dayEdit, roomsView, roomsEdit }: { S: string; dayView: boolean; dayEdit: boolean; roomsView: boolean; roomsEdit: boolean }) {
  const qc = useQueryClient();
  const q = useDaySetup(S);
  const [p, setP] = useState({ name: "", start: "", end: "", kind: "lesson" });
  const [room, setRoom] = useState({ name: "", kind: "general", capacity: "" });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["day-setup", S] }); qc.invalidateQueries({ queryKey: ["tt-input"] }); };
  const run = async (pr: PromiseLike<{ error: unknown }>, ok: string) => { const { error } = await pr; if (error) toast.error(arabicError(error)); else { toast.success(ok); refresh(); } };
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const kinds = [...new Set(["general", "معمل", "حاسب", "صالة رياضية", "فنية", ...d.rooms.map((r) => r["kind"] as string)])];
  return (
    <>
      {dayView && <fieldset disabled={!dayEdit}><Group title="اليوم الدراسي" hint={`${d.studyDays.length} أيام — ${d.periods.filter((x) => x["kind"] === "lesson").length} حصص`} open>
        <h3 className="mb-2 text-sm font-semibold">أيام الدراسة</h3>
        <div className="mb-4 flex flex-wrap gap-2">
          {DAY_NAMES.map((n, i) => {
            const on = d.studyDays.includes(i);
            return <Button key={i} size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => {
              const days = on ? d.studyDays.filter((x) => x !== i) : [...d.studyDays, i].sort();
              run(db.from("school_day_settings").upsert({ school_id: S, study_days: days }), "تم حفظ أيام الدراسة");
            }}>{n}</Button>;
          })}
        </div>
        <h3 className="mb-2 text-sm font-semibold">الحصص والفسح</h3>
        <p className="mb-2 text-xs text-muted-foreground">الفسحة ليست حصة قابلة للتوزيع. حدد أيام الحصة إن كانت لا تُعقد كل يوم (يوم أقصر).</p>
        <ul className="mb-4 space-y-1 text-sm">
          {d.periods.map((x) => {
            const pd = (x["days"] as number[] | null) ?? null;
            return (
              <li key={x["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span>{x["sort_order"]}. {x["name"]} {x["kind"] === "break" && <span className="text-muted-foreground">(فسحة)</span>} <span dir="ltr" className="text-muted-foreground">{String(x["start_time"]).slice(0, 5)}–{String(x["end_time"]).slice(0, 5)}</span></span>
                <span className="flex flex-wrap items-center gap-1">
                  {x["kind"] === "lesson" && d.studyDays.map((dd) => {
                    const on = !pd || pd.includes(dd);
                    return <button key={dd} type="button" aria-pressed={on} aria-label={`${x["name"]} يوم ${DAY_NAMES[dd]}`} className={`rounded border px-1.5 py-0.5 text-[11px] ${on ? "bg-primary/10 font-semibold" : "text-muted-foreground line-through"}`}
                      onClick={() => {
                        const cur = pd ?? d.studyDays;
                        const next = on ? cur.filter((z) => z !== dd) : [...cur, dd].sort();
                        run(db.from("periods").update({ days: next.length === d.studyDays.length && d.studyDays.every((z) => next.includes(z)) ? null : next }).eq("id", x["id"]), "تم الحفظ");
                      }}>{DAY_NAMES[dd]}</button>;
                  })}
                  <Button size="sm" variant="ghost" onClick={async () => { if (await ask(`حذف «${x["name"]}»؟`)) run(db.from("periods").delete().eq("id", x["id"]), "حُذفت"); }}>حذف</Button>
                </span>
              </li>
            );
          })}
          {!d.periods.length && <li className="text-muted-foreground">لم تُضف حصص بعد.</li>}
        </ul>
        <form className="grid gap-3 sm:grid-cols-5" onSubmit={(e) => {
          e.preventDefault();
          if (!p.name || !p.start || !p.end) return void toast.error("أكمل بيانات الفترة");
          if (p.end <= p.start) return void toast.error("وقت النهاية يجب أن يكون بعد البداية");
          const next = Math.max(0, ...d.periods.map((x) => x["sort_order"] as number)) + 1;
          run(db.from("periods").insert({ school_id: S, sort_order: next, name: p.name, start_time: p.start, end_time: p.end, kind: p.kind }), "أضيفت الفترة");
          setP({ name: "", start: p.end, end: "", kind: "lesson" });
        }}>
          <div className="space-y-1"><Label htmlFor="pn">الاسم</Label><Input id="pn" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="الحصة الأولى" /></div>
          <div className="space-y-1"><Label htmlFor="ps">البداية</Label><Input id="ps" type="time" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="pe">النهاية</Label><Input id="pe" type="time" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="pk">النوع</Label><select id="pk" className={sel} value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })}><option value="lesson">حصة</option><option value="break">فسحة</option></select></div>
          <Button className="self-end">إضافة</Button>
        </form>
      </Group></fieldset>}
      {roomsView && <fieldset disabled={!roomsEdit}><Group title="القاعات" hint={`${d.rooms.length} قاعة`}>
        <ul className="mb-3 space-y-1 text-sm">
          {d.rooms.map((r) => (
            <li key={r["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5">
              <span>{r["name"]} — {r["kind"] === "general" ? "عادية" : r["kind"]}{r["capacity"] ? ` — ${r["capacity"]} مقعدًا` : ""}{!r["is_active"] && <b className="ms-2 text-destructive">غير متاحة</b>}</span>
              <Button size="sm" variant="ghost" onClick={() => run(db.from("rooms").update({ is_active: !r["is_active"] }).eq("id", r["id"]), "تم الحفظ")}>{r["is_active"] ? "إيقاف" : "تفعيل"}</Button>
            </li>
          ))}
          {!d.rooms.length && <li className="text-muted-foreground">لا توجد قاعات. القاعات مطلوبة فقط للمقررات التي تشترط قاعة متخصصة.</li>}
        </ul>
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => {
          e.preventDefault();
          if (!room.name.trim()) return void toast.error("اكتب اسم القاعة");
          run(db.from("rooms").insert({ school_id: S, name: room.name.trim(), kind: room.kind.trim() || "general", capacity: room.capacity ? Number(room.capacity) : null }), "أضيفت القاعة");
          setRoom({ name: "", kind: room.kind, capacity: "" });
        }}>
          <Input value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} placeholder="معمل العلوم" aria-label="اسم القاعة" />
          <Input list="room-kinds" value={room.kind} onChange={(e) => setRoom({ ...room, kind: e.target.value })} aria-label="نوع القاعة" />
          <datalist id="room-kinds">{kinds.map((k) => <option key={k} value={k}>{k === "general" ? "عادية" : k}</option>)}</datalist>
          <Input type="number" min={1} value={room.capacity} onChange={(e) => setRoom({ ...room, capacity: e.target.value })} placeholder="السعة" aria-label="السعة" />
          <Button>إضافة</Button>
        </form>
      </Group></fieldset>}
    </>
  );
}

/** courses in scope + live teacher (approved assignment covering today) */
function useScopeCourses(S: string, year: string, term: string) {
  return useQuery({
    queryKey: ["tt-courses", S, year, term],
    queryFn: async () => {
      let q = db.from("courses").select("id, term_id, weekly_periods, daily_max, needs_double, room_kind, day_prefs, subjects(name), sections(name, grades(name)), teacher_assignments(teacher_id, status, start_date, end_date, teachers(full_name, status))").eq("school_id", S).eq("year_id", year);
      if (term) q = q.or(`term_id.is.null,term_id.eq.${term}`);
      const { data, error } = await q;
      if (error) throw error;
      const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
      return ((data ?? []) as Row[]).map((c) => {
        const live = ((c["teacher_assignments"] ?? []) as Row[]).filter((a) => a["status"] === "approved" && (!a["start_date"] || a["start_date"] <= today) && (!a["end_date"] || a["end_date"] >= today) && a["teachers"]?.status === "active");
        return { ...c, live, label: `${c["subjects"]?.name ?? ""} — ${c["sections"]?.grades?.name ?? ""} / ${c["sections"]?.name ?? ""}` } as Row;
      }).sort((a, b) => String(a["label"]).localeCompare(String(b["label"]), "ar"));
    },
  });
}

function CourseReqs({ S, year, term }: { S: string; year: string; term: string }) {
  const qc = useQueryClient();
  const q = useScopeCourses(S, year, term);
  const setup = useDaySetup(S);
  const [f, setF] = useState("");
  const kinds = [...new Set((setup.data?.rooms ?? []).map((r) => r["kind"] as string).filter((k) => k !== "general"))];
  const save = async (id: string, patch: Row) => {
    const { error } = await db.from("courses").update(patch).eq("id", id);
    if (error) return void toast.error(arabicError(error));
    qc.invalidateQueries({ queryKey: ["tt-courses", S] }); qc.invalidateQueries({ queryKey: ["tt-input"] });
  };
  const rows = (q.data ?? []).filter((c) => !f || String(c["label"]).includes(f));
  const missing = (q.data ?? []).filter((c) => !c["live"].length).length;
  return (
    <Group title="متطلبات المقررات" hint={q.data ? `${q.data.length} مقرر${missing ? ` — ${missing} بلا تكليف ساري` : ""}` : ""}>
      <p className="mb-2 text-xs text-muted-foreground">المعلم من التكليف المعتمد الساري فقط؛ لا يختار التوليد معلمًا غير مسند.</p>
      <Input className="mb-3 sm:w-72" placeholder="بحث بالمادة أو الشعبة" aria-label="بحث المقررات" value={f} onChange={(e) => setF(e.target.value)} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="text-start text-xs text-muted-foreground"><th className="p-1.5 text-start">المقرر</th><th className="p-1.5 text-start">المعلم</th><th className="p-1.5 text-start">حصص أسبوعية</th><th className="p-1.5 text-start">حد يومي</th><th className="p-1.5 text-start">حصتان متتاليتان</th><th className="p-1.5 text-start">قاعة متخصصة</th><th className="p-1.5 text-start">أيام مفضلة</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c["id"]} className="border-t align-top" data-testid="course-req">
                  <td className="p-1.5 font-medium">{c["label"]}</td>
                  <td className="p-1.5">{c["live"].length ? c["live"].map((a: Row) => a["teachers"]?.full_name).join("، ") : <span className="font-semibold text-destructive">⚠ لا يوجد تكليف ساري</span>}</td>
                  <td className="p-1.5"><Input aria-label={`حصص ${c["label"]}`} className="h-8 w-16" type="number" min={0} max={20} defaultValue={c["weekly_periods"]} onBlur={(e) => Number(e.target.value) !== c["weekly_periods"] && save(c["id"], { weekly_periods: Number(e.target.value) })} /></td>
                  <td className="p-1.5"><select aria-label={`حد يومي ${c["label"]}`} className={selSm} value={c["daily_max"] ?? ""} onChange={(e) => save(c["id"], { daily_max: e.target.value ? Number(e.target.value) : null })}><option value="">بلا حد</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
                  <td className="p-1.5"><input type="checkbox" aria-label={`حصتان متتاليتان ${c["label"]}`} checked={!!c["needs_double"]} onChange={(e) => save(c["id"], { needs_double: e.target.checked })} /></td>
                  <td className="p-1.5"><select aria-label={`قاعة ${c["label"]}`} className={selSm} value={c["room_kind"] ?? ""} onChange={(e) => save(c["id"], { room_kind: e.target.value || null })}><option value="">لا يشترط</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select></td>
                  <td className="p-1.5"><span className="flex flex-wrap gap-0.5">{(setup.data?.studyDays ?? []).map((d) => {
                    const pr = (c["day_prefs"] as number[] | null) ?? [];
                    const on = pr.includes(d);
                    return <button key={d} type="button" aria-pressed={on} className={`rounded border px-1 text-[10px] ${on ? "bg-primary/10 font-semibold" : "text-muted-foreground"}`} onClick={() => { const n = on ? pr.filter((x) => x !== d) : [...pr, d].sort(); save(c["id"], { day_prefs: n.length ? n : null }); }}>{DAY_NAMES[d]!.slice(0, 3)}</button>;
                  })}</span></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">لا توجد مقررات لهذه السنة/الفصل.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Group>
  );
}

function Loads({ S, year, term }: { S: string; year: string; term: string }) {
  const qc = useQueryClient();
  const courses = useScopeCourses(S, year, term);
  const depts = useOptions("departments", "name", S);
  const [f, setF] = useState({ q: "", dept: "", state: "" });
  const data = useQuery({
    queryKey: ["tt-loads", S, year, term],
    queryFn: async () => {
      const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
      const wk = new Date(Date.parse(today) - new Date(today).getUTCDay() * 864e5).toISOString().slice(0, 10);
      const wkEnd = new Date(Date.parse(wk) + 6 * 864e5).toISOString().slice(0, 10);
      const [t, l, tt, subs, accounts] = await Promise.all([
        db.rpc("workspace_teacher_options", { _school: S }),
        db.from("teacher_loads").select("*").eq("school_id", S).eq("year_id", year),
        db.from("timetables").select("id, status, term_id, version, created_at").eq("school_id", S).eq("year_id", year).neq("status", "discarded").order("created_at", { ascending: false }),
        db.from("substitutions").select("substitute_teacher_id").eq("school_id", S).eq("status", "active").gte("date", wk).lte("date", wkEnd),
        db.rpc("workspace_teacher_accounts", { _school: S }),
      ]);
      if (t.error) throw t.error;
      const hasAccount = new Map(((accounts.data ?? []) as Row[]).map((x) => [x["id"], x["has_account"]]));
      const tts = ((tt.data ?? []) as Row[]).filter((x) => (x["term_id"] ?? "") === term);
      const ref = tts.find((x) => x["status"] === "draft") ?? tts.find((x) => x["status"] === "published");
      const placed = new Map<string, number>();
      if (ref) {
        const { data: sl } = await db.from("timetable_slots").select("teacher_id").eq("timetable_id", ref["id"]);
        for (const s of (sl ?? []) as Row[]) placed.set(s["teacher_id"], (placed.get(s["teacher_id"]) ?? 0) + 1);
      }
      const subN = new Map<string, number>();
      for (const s of (subs.data ?? []) as Row[]) subN.set(s["substitute_teacher_id"], (subN.get(s["substitute_teacher_id"]) ?? 0) + 1);
      return { teachers: ((t.data ?? []) as Row[]).map((x) => ({ ...x, has_account: hasAccount.get(x["id"]) })), loads: ((l.data ?? []) as Row[]), placed, ref, subN };
    },
  });
  const required = useMemo(() => {
    const m = new Map<string, number>(), n = new Map<string, number>();
    for (const c of courses.data ?? []) { const a = c["live"][0]; if (a) { m.set(a["teacher_id"], (m.get(a["teacher_id"]) ?? 0) + (c["weekly_periods"] ?? 0)); n.set(a["teacher_id"], (n.get(a["teacher_id"]) ?? 0) + 1); } }
    return { m, n };
  }, [courses.data]);
  const loadOf = (tid: string) => {
    const ls = (data.data?.loads ?? []).filter((x) => x["teacher_id"] === tid);
    return ls.find((x) => (x["term_id"] ?? "") === term) ?? ls.find((x) => !x["term_id"]);
  };
  const save = async (tid: string, w: string, d: string) => {
    if (w === "" || d === "") return void toast.error("حدد النصاب الأسبوعي والحد اليومي معًا");
    const cur = (data.data?.loads ?? []).find((x) => x["teacher_id"] === tid && (x["term_id"] ?? "") === term);
    const row = { school_id: S, teacher_id: tid, year_id: year, term_id: term || null, weekly_max: Number(w), daily_max: Number(d) };
    const { error } = cur ? await db.from("teacher_loads").update(row).eq("id", cur["id"]) : await db.from("teacher_loads").insert(row);
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظ النصاب"); qc.invalidateQueries({ queryKey: ["tt-loads", S] }); qc.invalidateQueries({ queryKey: ["tt-input"] });
  };
  const all = data.data?.teachers ?? [];
  const rows = all.filter((t) => {
    if (f.q && !String(t["full_name"]).includes(f.q)) return false;
    if (f.dept && t["department_id"] !== f.dept) return false;
    const ld = loadOf(t["id"]), req = required.m.get(t["id"]) ?? 0;
    if (f.state === "missing" && (ld || !req)) return false;
    if (f.state === "none" && required.n.get(t["id"])) return false;
    if (f.state === "over" && !(ld && req > ld["weekly_max"])) return false;
    return true;
  });
  const missingN = all.filter((t) => required.m.get(t["id"]) && !loadOf(t["id"])).length;
  return (
    <Group title="أنصبة المعلمين" hint={data.data ? `${all.length} معلم${missingN ? ` — ${missingN} بنصاب غير محدد` : ""}` : ""}>
      <p className="mb-2 text-xs text-muted-foreground">النصاب حد أقصى لا يُملأ بحصص غير مطلوبة. النصاب غير المحدد ليس صفرًا ولا مفتوحًا: يجب استكماله قبل التوليد. «الموزع» من {data.data?.ref ? (data.data.ref["status"] === "draft" ? "المسودة الحالية" : `الإصدار المنشور ${data.data.ref["version"]}`) : "— (لا يوجد جدول لهذه الفترة)"}. حصص البدلاء معروضة منفصلة ولا تُحسب ضمن النصاب الأسبوعي.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="sm:w-56" placeholder="بحث بالاسم" aria-label="بحث المعلمين" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className={selectCls("w-44")} aria-label="القسم" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}><option value="">كل الأقسام</option>{depts.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        <select className={selectCls("w-52")} aria-label="الحالة" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">الكل</option><option value="missing">نصاب غير محدد</option><option value="over">المطلوب يتجاوز النصاب</option><option value="none">بلا مقررات</option></select>
      </div>
      {data.isLoading || courses.isLoading ? <LoadingState /> : data.error ? <ErrorState message={arabicError(data.error)} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="p-1.5 text-start">المعلم</th><th className="p-1.5 text-start">القسم</th><th className="p-1.5 text-start">الحالة</th><th className="p-1.5 text-start">النصاب الأسبوعي</th><th className="p-1.5 text-start">الحد اليومي</th><th className="p-1.5 text-start">المطلوب</th><th className="p-1.5 text-start">الموزع</th><th className="p-1.5 text-start">المتبقي</th><th className="p-1.5 text-start">بديل هذا الأسبوع</th><th /></tr></thead>
            <tbody>{rows.map((t) => <LoadRow key={t["id"] + term} t={t} ld={loadOf(t["id"])} req={required.m.get(t["id"]) ?? 0} nCourses={required.n.get(t["id"]) ?? 0} placed={data.data!.placed.get(t["id"]) ?? 0} subs={data.data!.subN.get(t["id"]) ?? 0} dept={depts.data?.find((d) => d.value === t["department_id"])?.label} onSave={save} />)}</tbody>
          </table>
        </div>
      )}
    </Group>
  );
}

function LoadRow({ t, ld, req, nCourses, placed, subs, dept, onSave }: { t: Row; ld: Row | undefined; req: number; nCourses: number; placed: number; subs: number; dept: string | undefined; onSave: (tid: string, w: string, d: string) => void }) {
  const [w, setW] = useState(ld ? String(ld["weekly_max"]) : "");
  const [d, setD] = useState(ld ? String(ld["daily_max"]) : "");
  const over = ld && req > ld["weekly_max"];
  return (
    <tr className="border-t" data-testid="load-row">
      <td className="p-1.5 font-medium">{t["full_name"]}{t["has_account"] === false && <span className="ms-1 text-[11px] text-muted-foreground">(بلا حساب دخول)</span>}</td>
      <td className="p-1.5">{dept ?? "—"}</td>
      <td className="p-1.5">{t["status"] === "active" ? "نشط" : "غير نشط"}</td>
      <td className="p-1.5"><Input aria-label={`نصاب ${t["full_name"]}`} className="h-8 w-16" type="number" min={0} max={60} value={w} onChange={(e) => setW(e.target.value)} /></td>
      <td className="p-1.5"><Input aria-label={`حد يومي ${t["full_name"]}`} className="h-8 w-16" type="number" min={0} max={12} value={d} onChange={(e) => setD(e.target.value)} /></td>
      <td className="p-1.5">{nCourses ? req : <span className="text-muted-foreground">لم تُسند إليه مقررات</span>}</td>
      <td className="p-1.5">{placed}</td>
      <td className="p-1.5">{nCourses ? Math.max(0, req - placed) : "—"}</td>
      <td className="p-1.5">{subs}</td>
      <td className="p-1.5">
        {!ld && nCourses > 0 && <span className="me-2 text-xs font-semibold text-destructive">⚠ غير محدد</span>}
        {over && <span className="me-2 text-xs font-semibold text-destructive">⚠ تجاوز {req - ld!["weekly_max"]}</span>}
        <Button size="sm" variant="outline" onClick={() => onSave(t["id"], w, d)}>حفظ</Button>
      </td>
    </tr>
  );
}

function Availability({ S }: { S: string }) {
  const qc = useQueryClient();
  const setup = useDaySetup(S);
  const teachers = useQuery({ queryKey: ["workspace-teachers", S], queryFn: async () => {
    const r = await db.rpc("workspace_teacher_options", { _school: S });
    if (r.error) throw r.error;
    return ((r.data ?? []) as Row[]).map((t) => ({ value: String(t["id"]), label: String(t["full_name"]) }));
  } });
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ teacher: "", kind: "last2", day: "", period: "", hard: "1", from: "", to: "", reason: "" });
  const [filter, setFilter] = useState("");
  const list = useQuery({
    queryKey: ["unav", S],
    queryFn: async () => {
      const { data, error } = await db.from("teacher_unavailability").select("id, day, kind, hard, valid_from, valid_to, reason, teacher_id, teachers(full_name), periods(name)").eq("school_id", S).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["unav", S] }); qc.invalidateQueries({ queryKey: ["tt-input"] }); };
  const lessons = (setup.data?.periods ?? []).filter((p) => p["kind"] === "lesson");
  const rows = (list.data ?? []).filter((u) => !filter || u["teacher_id"] === filter);
  return (
    <Group title="توافر المعلمين" hint={`${list.data?.length ?? 0} قيد`}>
      <p className="mb-3 text-xs text-muted-foreground">«آخر حصتين» تعني آخر حصتين تعليميتين في يوم المعلم دون الفسح، وتتكيف مع قِصر اليوم. القيد الإلزامي يمنع التوليد والتعديل اليدوي والتبديل المخالف؛ التفضيل يمكن مخالفته وتظهر المخالفة في المعاينة. هذه ليست إجازات موظفين.</p>
      <form className="mb-4 grid gap-2 sm:grid-cols-4" onSubmit={async (e) => {
        e.preventDefault();
        if (!f.teacher) return void toast.error("اختر المعلم");
        if (f.kind === "period" && (!f.period || f.day === "")) return void toast.error("اختر اليوم والحصة");
        if (f.kind === "day" && f.day === "") return void toast.error("اختر اليوم");
        if (f.from && f.to && f.to < f.from) return void toast.error("نهاية السريان قبل بدايته");
        const { error } = await db.from("teacher_unavailability").insert({ school_id: S, teacher_id: f.teacher, kind: f.kind, day: f.day === "" ? null : Number(f.day), period_id: f.kind === "period" ? f.period : null, hard: f.hard === "1", valid_from: f.from || null, valid_to: f.to || null, reason: f.reason.trim() || null });
        if (error) return void toast.error(arabicError(error));
        toast.success("حُفظ القيد"); refresh();
      }}>
        <select className={sel} aria-label="معلم القيد" value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}><option value="">— المعلم —</option>{teachers.data?.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        <select className={sel} aria-label="نوع القيد" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{(Object.keys(UNAV_KIND) as (keyof typeof UNAV_KIND)[]).map((k) => <option key={k} value={k}>{UNAV_KIND[k]}</option>)}</select>
        <select className={sel} aria-label="يوم القيد" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}><option value="">{f.kind === "day" || f.kind === "period" ? "— اليوم —" : "طوال الأسبوع"}</option>{setup.data?.studyDays.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}</select>
        {f.kind === "period" ? <select className={sel} aria-label="حصة القيد" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}><option value="">— الحصة —</option>{lessons.map((p) => <option key={p["id"]} value={p["id"]}>{p["name"]}</option>)}</select> : <span />}
        <select className={sel} aria-label="إلزامي أو تفضيل" value={f.hard} onChange={(e) => setF({ ...f, hard: e.target.value })}><option value="1">إلزامي</option><option value="0">تفضيل</option></select>
        <div className="flex items-center gap-1 text-xs"><span>من</span><Input type="date" aria-label="يسري من" min={today} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div className="flex items-center gap-1 text-xs"><span>إلى</span><Input type="date" aria-label="يسري إلى" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <Input placeholder="السبب (اختياري)" aria-label="سبب القيد" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <Button className="sm:col-span-4 sm:w-40">إضافة القيد</Button>
      </form>
      <select className={selectCls("mb-2 w-56")} aria-label="تصفية القيود" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">كل المعلمين</option>{teachers.data?.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      <ul className="space-y-1 text-sm">
        {rows.map((u) => (
          <li key={u["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5" data-testid="unav-row">
            <span>
              <b>{u["teachers"]?.full_name}</b> — {UNAV_KIND[u["kind"] as keyof typeof UNAV_KIND] ?? u["kind"]}{u["kind"] === "period" && ` (${u["periods"]?.name})`} — {u["day"] == null ? "طوال الأسبوع" : DAY_NAMES[u["day"]]}
              <span className={`ms-2 rounded px-1.5 text-[11px] ${u["hard"] ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{u["hard"] ? "🔒 إلزامي" : "☆ تفضيل"}</span>
              {(u["valid_from"] || u["valid_to"]) && <span className="ms-2 text-xs text-muted-foreground">{u["valid_from"] ?? "…"} ← {u["valid_to"] ?? "…"}</span>}
              {u["reason"] && <span className="ms-2 text-xs text-muted-foreground">— {u["reason"]}</span>}
              {u["valid_to"] && u["valid_to"] < today && <span className="ms-2 text-xs">(منتهٍ)</span>}
            </span>
            <Button size="sm" variant="ghost" onClick={async () => { const { error } = await db.from("teacher_unavailability").delete().eq("id", u["id"]); if (error) toast.error(arabicError(error)); else refresh(); }}>حذف</Button>
          </li>
        ))}
        {!rows.length && <li className="text-muted-foreground">لا توجد قيود.</li>}
      </ul>
    </Group>
  );
}

function SubPolicy({ S }: { S: string }) {
  const qc = useQueryClient();
  const q = useDaySetup(S);
  const on = (q.data?.settings?.["subs_in_daily"] as boolean | undefined) ?? true;
  return (
    <Group title="سياسة حصص البدلاء">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={async (e) => {
          const { error } = await db.from("school_day_settings").upsert({ school_id: S, study_days: q.data?.studyDays ?? [0, 1, 2, 3, 4], subs_in_daily: e.target.checked });
          if (error) toast.error(arabicError(error)); else { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["day-setup", S] }); }
        }} />
        تُحسب حصص التبديل ضمن الحد اليومي للمعلم (لا يُقترح بديل بلغ حده اليومي)
      </label>
      <p className="mt-1 text-xs text-muted-foreground">حصص التبديل لا تُحسب ضمن النصاب الأسبوعي للجدول الأساسي، وتظهر منفصلة في الأنصبة.</p>
    </Group>
  );
}
