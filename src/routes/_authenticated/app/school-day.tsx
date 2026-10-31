import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, useOptions, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arabicError, type AppContext } from "@/lib/session";
import { DAY_NAMES, useDaySetup } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/app/school-day")({ component: Page });

function Page() {
  return <RequireSchool nav="schoolday">{(ctx) => <Setup ctx={ctx} />}</RequireSchool>;
}

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function Setup({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const S = ctx.schoolId;
  const qc = useQueryClient();
  const q = useDaySetup(S);
  const teachers = useOptions("teachers", "full_name", S);
  const [p, setP] = useState({ name: "", start: "", end: "", kind: "lesson" });
  const [room, setRoom] = useState("");
  const [un, setUn] = useState({ teacher: "", day: "0", period: "" });
  const unav = useUnav(S);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["day-setup", S] }); qc.invalidateQueries({ queryKey: ["unav", S] }); };
  const run = async (pr: Promise<{ error: unknown }>, ok: string) => { const { error } = await pr; if (error) toast.error(arabicError(error)); else { toast.success(ok); refresh(); } };

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const d = q.data!;
  const lessons = d.periods.filter((x) => x["kind"] === "lesson");

  return (
    <>
      <PageHeader title="إعداد اليوم الدراسي" desc="خاص بهذه المدرسة: أيام الدراسة والحصص والراحات والقاعات وتوافر المعلمين." />
      <section className="mb-6 rounded-2xl border bg-card p-5">
        <h2 className="mb-3 font-bold">أيام الدراسة</h2>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((n, i) => {
            const on = d.studyDays.includes(i);
            return (
              <Button key={i} size="sm" variant={on ? "default" : "outline"} onClick={() => {
                const days = on ? d.studyDays.filter((x) => x !== i) : [...d.studyDays, i].sort();
                run(db.from("school_day_settings").upsert({ school_id: S, study_days: days }), "تم حفظ أيام الدراسة");
              }}>{n}</Button>
            );
          })}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-5">
        <h2 className="mb-3 font-bold">الحصص والراحات</h2>
        <ul className="mb-4 space-y-1 text-sm">
          {d.periods.map((x) => (
            <li key={x["id"]} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span>{x["sort_order"]}. {x["name"]} {x["kind"] === "break" && <span className="text-muted-foreground">(راحة)</span>}</span>
              <span className="flex items-center gap-2" dir="ltr">{String(x["start_time"]).slice(0, 5)}–{String(x["end_time"]).slice(0, 5)}
                <Button size="sm" variant="ghost" onClick={() => run(db.from("periods").delete().eq("id", x["id"]), "حُذفت")}>حذف</Button>
              </span>
            </li>
          ))}
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
          <div className="space-y-1"><Label htmlFor="pk">النوع</Label><select id="pk" className={sel} value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })}><option value="lesson">حصة</option><option value="break">راحة</option></select></div>
          <Button className="self-end">إضافة</Button>
        </form>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-5">
        <h2 className="mb-3 font-bold">القاعات (اختياري)</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {d.rooms.map((r) => <span key={r["id"]} className="rounded-full border px-3 py-1 text-sm">{r["name"]}</span>)}
          {!d.rooms.length && <span className="text-sm text-muted-foreground">لا توجد قاعات.</span>}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!room.trim()) return; run(db.from("rooms").insert({ school_id: S, name: room.trim() }), "أضيفت القاعة"); setRoom(""); }}>
          <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="معمل العلوم" aria-label="اسم القاعة" />
          <Button>إضافة</Button>
        </form>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-1 font-bold">أوقات عدم توافر المعلمين</h2>
        <p className="mb-3 text-sm text-muted-foreground">يمنع المحرر وضع حصة للمعلم في هذه الأوقات.</p>
        <ul className="mb-3 space-y-1 text-sm">
          {unav.data?.map((u) => (
            <li key={u["id"]} className="flex items-center justify-between rounded-lg border px-3 py-1.5">
              <span>{u["teachers"]?.full_name} — {DAY_NAMES[u["day"]]} — {u["periods"]?.name}</span>
              <Button size="sm" variant="ghost" onClick={() => run(db.from("teacher_unavailability").delete().eq("id", u["id"]), "حُذف")}>حذف</Button>
            </li>
          ))}
        </ul>
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => {
          e.preventDefault();
          if (!un.teacher || !un.period) return void toast.error("اختر المعلم والحصة");
          run(db.from("teacher_unavailability").insert({ school_id: S, teacher_id: un.teacher, day: Number(un.day), period_id: un.period }), "تم الحفظ");
        }}>
          <select className={sel} aria-label="المعلم" value={un.teacher} onChange={(e) => setUn({ ...un, teacher: e.target.value })}><option value="">— المعلم —</option>{teachers.data?.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <select className={sel} aria-label="اليوم" value={un.day} onChange={(e) => setUn({ ...un, day: e.target.value })}>{d.studyDays.map((x) => <option key={x} value={x}>{DAY_NAMES[x]}</option>)}</select>
          <select className={sel} aria-label="الحصة" value={un.period} onChange={(e) => setUn({ ...un, period: e.target.value })}><option value="">— الحصة —</option>{lessons.map((x) => <option key={x["id"]} value={x["id"]}>{x["name"]}</option>)}</select>
          <Button>إضافة</Button>
        </form>
      </section>
      <Supervisors S={S} teachers={teachers.data ?? []} />
    </>
  );
}

function Supervisors({ S, teachers }: { S: string; teachers: { value: string; label: string }[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ sup: "", teacher: "" });
  const q = useQuery({
    queryKey: ["supervisors", S],
    queryFn: async () => {
      const [m, l] = await Promise.all([
        db.from("memberships").select("user_id").eq("school_id", S).eq("role", "supervisor").eq("is_active", true),
        db.from("supervisor_teachers").select("id, supervisor_user_id, teachers(full_name)").eq("school_id", S),
      ]);
      const ids = ((m.data ?? []) as Row[]).map((x) => x["user_id"]);
      const { data: profs } = await db.from("profiles").select("id, full_name, email").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      return { sups: (profs ?? []) as Row[], links: (l.data ?? []) as Row[] };
    },
  });
  const name = (id: string) => { const p = q.data?.sups.find((x) => x["id"] === id); return p?.full_name || p?.email || "مشرف"; };
  return (
    <section className="mt-6 rounded-2xl border bg-card p-5">
      <h2 className="mb-1 font-bold">إسناد المعلمين للمشرفين</h2>
      <p className="mb-3 text-sm text-muted-foreground">يرى المشرف في الجدول حصص المعلمين المسندين إليه فقط.</p>
      <ul className="mb-3 space-y-1 text-sm">
        {q.data?.links.map((l) => (
          <li key={l["id"]} className="flex items-center justify-between rounded-lg border px-3 py-1.5">
            <span>{name(l["supervisor_user_id"])} ← {l["teachers"]?.full_name}</span>
            <Button size="sm" variant="ghost" onClick={async () => { await db.from("supervisor_teachers").delete().eq("id", l["id"]); qc.invalidateQueries({ queryKey: ["supervisors", S] }); }}>حذف</Button>
          </li>
        ))}
      </ul>
      {q.data && !q.data.sups.length ? <p className="text-sm text-muted-foreground">لا يوجد مشرفون في المدرسة. ادعُهم من صفحة المستخدمين.</p> : (
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!f.sup || !f.teacher) return void toast.error("اختر المشرف والمعلم");
          const { error } = await db.from("supervisor_teachers").insert({ school_id: S, supervisor_user_id: f.sup, teacher_id: f.teacher });
          if (error) return void toast.error(arabicError(error));
          toast.success("تم الإسناد"); qc.invalidateQueries({ queryKey: ["supervisors", S] });
        }}>
          <select className={sel} aria-label="المشرف" value={f.sup} onChange={(e) => setF({ ...f, sup: e.target.value })}><option value="">— المشرف —</option>{q.data?.sups.map((p) => <option key={p["id"]} value={p["id"]}>{p["full_name"] || p["email"]}</option>)}</select>
          <select className={sel} aria-label="المعلم" value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}><option value="">— المعلم —</option>{teachers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <Button>إسناد</Button>
        </form>
      )}
    </section>
  );
}

function useUnav(S: string) {
  return useQuery({
    queryKey: ["unav", S],
    queryFn: async () => {
      const { data, error } = await db.from("teacher_unavailability").select("id, day, teachers(full_name), periods(name)").eq("school_id", S);
      if (error) throw error;
      return data as Row[];
    },
  });
}
