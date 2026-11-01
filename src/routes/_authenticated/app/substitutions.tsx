import { createFileRoute } from "@tanstack/react-router";
import { ask, askText } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, useOptions, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arabicError, type AppContext } from "@/lib/session";
import { DAY_NAMES, todayISO, useCurrentTimetable, useSlots } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/app/substitutions")({ component: Page });

const sel = selectCls("w-full");

function Page() {
  return <RequireSchool nav="substitutions">{(ctx) => <Subs ctx={ctx} />}</RequireSchool>;
}

function Subs({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const S = ctx.schoolId;
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [teacher, setTeacher] = useState("");
  const [note, setNote] = useState("");
  const teachers = useOptions("teachers", "full_name", S);
  const cur = useCurrentTimetable(S, date);
  const slots = useSlots(cur.data);
  const absences = useQuery({
    queryKey: ["absences", S, date],
    queryFn: async () => {
      const { data, error } = await db.from("teacher_absences").select("id, note, teacher_id, teachers(full_name)").eq("school_id", S).eq("date", date);
      if (error) throw error;
      return data as Row[];
    },
  });
  const subs = useQuery({
    queryKey: ["subs-day", S, date],
    queryFn: async () => {
      const { data, error } = await db.from("substitutions").select("id, slot_id, status, reason, cancel_reason, teachers:substitute_teacher_id(full_name)").eq("school_id", S).eq("date", date).order("created_at");
      if (error) throw error;
      return data as Row[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["absences", S, date] }); qc.invalidateQueries({ queryKey: ["subs-day", S, date] }); qc.invalidateQueries({ queryKey: ["affected"] }); qc.invalidateQueries({ queryKey: ["subs-week"] }); };
  const dow = new Date(date + "T00:00:00").getDay();
  const todays = (slots.data ?? []).filter((s) => s["day"] === dow);
  const coveredIds = new Set((subs.data ?? []).filter((x) => x["status"] === "active").map((x) => x["slot_id"]));
  const absentIds = new Set((absences.data ?? []).map((a) => a["teacher_id"]));
  const uncovered = todays.filter((s) => absentIds.has(s["teacher_id"]) && !coveredIds.has(s["id"]));

  return (
    <>
      <PageHeader title="التبديل والبدلاء" desc="التبديل يخص التاريخ والحصة فقط، ولا يغيّر الجدول الأساسي أو ملكية المقرر." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="d">التاريخ</Label><Input id="d" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <span className="pb-2 text-sm text-muted-foreground">{DAY_NAMES[dow]} — {todays.length} حصة في الجدول الساري — {uncovered.length} بلا تغطية</span>
      </div>
      {cur.isLoading ? <LoadingState /> : !cur.data ? <EmptyState title="لا يوجد جدول منشور ساري لهذا التاريخ" /> : (
        <>
          <form className="mb-6 grid gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-4" onSubmit={async (e) => {
            e.preventDefault();
            if (!teacher) return void toast.error("اختر المعلم");
            const { error } = await db.rpc("record_absence", { _teacher: teacher, _date: date, _note: note || null });
            if (error) return void toast.error(arabicError(error));
            toast.success("سُجّل الغياب التشغيلي"); setTeacher(""); setNote(""); refresh();
          }}>
            <h2 className="font-bold sm:col-span-4">تسجيل غياب معلم لهذا اليوم</h2>
            <select className={sel} aria-label="المعلم" value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">— المعلم —</option>{teachers.data?.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <Input className="sm:col-span-2" placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button>تسجيل</Button>
          </form>
          {absences.isLoading ? <LoadingState /> : absences.error ? <ErrorState message={arabicError(absences.error)} onRetry={() => absences.refetch()} /> : !absences.data?.length ? <EmptyState title="لا يوجد غياب مسجل لهذا التاريخ" /> : (
            <div className="space-y-4">
              {absences.data.map((a) => <Absence key={a["id"]} a={a} date={date} subs={subs.data ?? []} onDone={refresh} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Absence({ a, date, subs, onDone }: { a: Row; date: string; subs: Row[]; onDone: () => void }) {
  const aff = useQuery({
    queryKey: ["affected", a["id"]],
    queryFn: async () => {
      const { data, error } = await db.rpc("affected_slots", { _absence: a["id"] });
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="font-bold">{a["teachers"]?.full_name} {a["note"] && <span className="text-sm font-normal text-muted-foreground">— {a["note"]}</span>}</h3>
      {aff.isLoading ? <LoadingState /> : aff.error ? <ErrorState message={arabicError(aff.error)} onRetry={() => aff.refetch()} /> : !aff.data?.length ? <p className="mt-2 text-sm text-muted-foreground">لا حصص له في هذا اليوم.</p> : (
        <ul className="mt-3 space-y-2">
          {aff.data.map((s) => <AffectedSlot key={s["slot_id"]} s={s} a={a} date={date} history={subs.filter((x) => x["slot_id"] === s["slot_id"])} onDone={onDone} />)}
        </ul>
      )}
    </section>
  );
}

function AffectedSlot({ s, a, date, history, onDone }: { s: Row; a: Row; date: string; history: Row[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const avail = useQuery({
    queryKey: ["avail", s["slot_id"], date],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.rpc("available_substitutes", { _slot: s["slot_id"], _date: date });
      if (error) throw error;
      return data as Row[];
    },
  });
  const active = history.find((x) => x["status"] === "active");
  const cancelled = history.filter((x) => x["status"] === "cancelled");
  return (
    <li className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><b>{s["period_name"]}</b> ({String(s["start_time"]).slice(0, 5)}) — {s["subject"]} — شعبة {s["section"]}</span>
        {active ? (
          <span className="flex items-center gap-2">
            <span className="font-semibold text-primary">البديل: {s["substitute_name"]}</span>
            <Button size="sm" variant="ghost" onClick={async () => {
              const r = await askText("سبب إلغاء التبديل", { required: true });
              if (!r) return;
              const { error } = await db.rpc("cancel_substitution", { _id: active["id"], _reason: r });
              if (error) toast.error(arabicError(error)); else { toast.success("أُلغي التبديل"); onDone(); }
            }}>إلغاء التبديل</Button>
          </span>
        ) : <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "إغلاق" : "اختيار بديل"}</Button>}
      </div>
      {cancelled.length > 0 && <p className="mt-1 text-xs text-muted-foreground">تبديلات ملغاة: {cancelled.map((c) => `${c["teachers"]?.full_name} (${c["cancel_reason"]})`).join("، ")}</p>}
      {open && !active && (
        <form className="mt-3 grid gap-2 sm:grid-cols-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!pick) return void toast.error("اختر البديل");
          const { error } = await db.rpc("assign_substitute", { _absence: a["id"], _slot: s["slot_id"], _substitute: pick, _reason: reason || null });
          if (error) return void toast.error(arabicError(error));
          toast.success("نُشر التبديل وأُشعر المعنيون"); setOpen(false); onDone();
        }}>
          {avail.isLoading ? <LoadingState /> : (
            <select className={sel + " sm:col-span-2"} aria-label="البديل" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">— {avail.data?.length ?? 0} بديل متاح بلا تعارض —</option>
              {avail.data?.map((t) => <option key={t["teacher_id"]} value={t["teacher_id"]}>{t["full_name"]}{t["same_department"] ? " (نفس القسم)" : ""}</option>)}
            </select>
          )}
          <Input placeholder="سبب/ملاحظة" aria-label="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button>نشر التبديل</Button>
        </form>
      )}
    </li>
  );
}

