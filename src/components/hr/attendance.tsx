// HR attendance: shared labels + employee self-service («حضوري»). Data comes only from hr_att_* RPCs;
// the server computes each day from raw punches and decides who may see or correct what.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

export type AttDay = { date: string; status: string; shift: string | null; first_in: string | null; last_out: string | null; late_min: number; early_min: number; worked_min: number; punches: number; duplicates: number; closed: boolean };
export type AttCorr = { id: string; date: string; kind: "punch" | "excuse"; at: string | null; reason: string; status: string; decision_reason: string | null };
export type EmpDays = { employee: { employee: string; employee_no: string; school: string | null }; days: AttDay[]; punches: { at: string; source: string; reason: string | null }[]; shifts: { shift: string; start_time: string; end_time: string; start_date: string; end_date: string | null }[]; corrections: AttCorr[] };

export const AT_STATUS: Record<string, string> = {
  present: "حاضر", late: "متأخر", absent: "غائب", incomplete: "بصمة ناقصة", leave: "إجازة معتمدة", off: "يوم راحة", holiday: "عطلة", excused: "معذور", no_shift: "بلا وردية", pending: "اليوم جارٍ",
};
export const SOURCE: Record<string, string> = { manual: "يدوي", import: "استيراد", device: "جهاز", mobile: "جوال", correction: "تصحيح معتمد" };
export const CORR_STATUS: Record<string, string> = { pending: "قيد المراجعة", applied: "معتمد", rejected: "مرفوض", withdrawn: "مسحوب" };
export const tm = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }) : "—");
export const dtm = (s: string) => new Date(s).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" });
export const riyadhToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
export const mins = (n: number) => (n ? `${Math.floor(n / 60)}س ${n % 60}د` : "0");

export function AttStatus({ s }: { s: string }) {
  const cls = s === "present" ? "bg-success/10 text-success" : s === "late" || s === "incomplete" ? "bg-warning/10 text-warning" : s === "absent" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={"shrink-0 rounded px-1.5 text-xs " + cls}>{AT_STATUS[s] ?? s}</span>;
}

export function DayRow({ d, name }: { d: AttDay; name?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-semibold">{name ?? <bdi dir="ltr">{d.date}</bdi>}</span>{d.closed && <span className="rounded bg-muted px-1.5 text-xs">مغلق</span>}<AttStatus s={d.status} /></div>
      <p className="text-xs text-muted-foreground">{d.shift ?? "بلا وردية"} · دخول {tm(d.first_in)} · خروج {tm(d.last_out)}{d.late_min ? ` · تأخير ${d.late_min}د` : ""}{d.early_min ? ` · خروج مبكر ${d.early_min}د` : ""}{d.worked_min ? ` · عمل ${mins(d.worked_min)}` : ""}{d.duplicates ? ` · ${d.duplicates} بصمة مكررة تجاهلناها` : ""}</p>
    </div>
  );
}

/** One fresh high-accuracy reading, taken only at the moment of punching. */
function readPosition(): Promise<GeolocationPosition> {
  return new Promise((res, rej) => {
    if (!("geolocation" in navigator)) { rej(new Error("جهازك لا يدعم تحديد الموقع")); return; }
    navigator.geolocation.getCurrentPosition(res, (e) => rej(new Error(e.code === 1 ? "رُفض إذن الموقع؛ اسمح للمتصفح بالوصول لموقعك ثم أعد المحاولة" : e.code === 3 ? "انتهت مهلة تحديد الموقع؛ أعد المحاولة" : "تعذّر الحصول على موقعك؛ أعد المحاولة")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

/** Employee self-service: own days, shifts, raw punches, correction requests. */
export function MyAttendance({ org }: { org: string }) {
  const qc = useQueryClient();
  const today = riyadhToday();
  const [from, setFrom] = useState(addDays(today, -13));
  const q = useQuery({ queryKey: ["hr-att-mine", org, from, today], queryFn: () => rpc<EmpDays & { employee: false | EmpDays["employee"]; allow_self_punch: boolean; punch_schools: { id: string; name: string; configured: boolean }[] }>("hr_att_my", { _org: org, _from: from, _to: today }) });
  const [f, setF] = useState({ date: "", kind: "punch", time: "", reason: "" });
  const inv = () => qc.invalidateQueries({ queryKey: ["hr-att-mine"] });
  const req = useMutation({
    mutationFn: () => rpc("hr_att_corr_request", { _org: org, _date: f.date, _kind: f.kind, _at: f.kind === "punch" ? `${f.date}T${f.time}:00+03:00` : null, _reason: f.reason }),
    onSuccess: () => { toast.success("أُرسل طلب التصحيح للموارد البشرية"); setF({ date: "", kind: "punch", time: "", reason: "" }); inv(); }, onError: (e) => toast.error(arabicError(e)),
  });
  const withdraw = useMutation({ mutationFn: (id: string) => rpc("hr_att_corr_withdraw", { _id: id }), onSuccess: () => { toast.success("سُحب الطلب"); inv(); }, onError: (e) => toast.error(arabicError(e)) });
  const [pkey] = useState(() => crypto.randomUUID());
  const [school, setSchool] = useState("");
  const [locErr, setLocErr] = useState<string | null>(null);
  const punch = useMutation({
    mutationFn: async (sid: string) => {
      setLocErr(null);
      const pos = await readPosition();
      return rpc<{ duplicate: boolean; distance_m: number }>("hr_att_self_punch", { _org: org, _key: pkey + ":" + Math.floor(Date.now() / 60000), _school: sid, _lat: pos.coords.latitude, _lng: pos.coords.longitude, _accuracy: pos.coords.accuracy, _read_at: new Date(pos.timestamp).toISOString() });
    },
    onSuccess: (r) => { toast.success(r.duplicate ? "بصمتك مسجلة مسبقًا لهذه الدقيقة" : `سُجلت بصمتك (على بعد ${r.distance_m} م)`); inv(); },
    onError: (e) => { const m = arabicError(e); setLocErr(m); toast.error(m); },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.employee) return <EmptyState title="لا يوجد ملف وظيفي مرتبط بحسابك" hint="تواصل مع الموارد البشرية." />;
  const live = d.shifts.find((s) => s.start_date <= today && (!s.end_date || s.end_date >= today));
  return (
    <div className="space-y-4">
      <Section title="ورديتي" desc={live ? `${live.shift} من ${live.start_time} إلى ${live.end_time}` : "لا توجد وردية سارية لك اليوم؛ لن يُحتسب حضورك حتى تُعيّن."}
        action={d.allow_self_punch && d.punch_schools.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {d.punch_schools.length > 1 && <select aria-label="مدرسة التسجيل" className={selectCls("w-44")} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">اختر المدرسة</option>{d.punch_schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            <Button size="sm" disabled={punch.isPending} onClick={() => { const sid = d.punch_schools.length === 1 ? d.punch_schools[0]!.id : school; if (!sid) { toast.error("اختر المدرسة"); return; } punch.mutate(sid); }}>{punch.isPending ? "جارٍ تحديد موقعك…" : "تسجيل بصمة الآن"}</Button>
          </div>) : undefined}>
        {d.allow_self_punch && <p className="mb-2 text-xs text-muted-foreground">يُطلب موقعك لحظة التسجيل فقط للتحقق من وجودك داخل نطاق المدرسة، ولا يُتتبّع بعدها.</p>}
        {locErr && <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive"><span className="flex-1">{locErr}</span><Button size="sm" variant="outline" disabled={punch.isPending} onClick={() => { const sid = d.punch_schools.length === 1 ? d.punch_schools[0]!.id : school; if (sid) punch.mutate(sid); }}>إعادة المحاولة</Button></div>}
        <label className="text-xs text-muted-foreground">عرض من<Input type="date" dir="ltr" className="w-full sm:w-44" max={today} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
      </Section>
      <Section title="أيامي">
        {d.days.length === 0 ? <EmptyState title="لا توجد أيام محسوبة في هذه المدة" /> : <ul className="grid gap-2 md:grid-cols-2">{d.days.map((x) => <li key={x.date}><DayRow d={x} /></li>)}</ul>}
      </Section>
      <Section title="طلب تصحيح" desc="لبصمة نسيتها أو عذر ليوم. تراجعه الموارد البشرية، ولا يُقبل ليوم مغلق أو أقدم من 60 يومًا.">
        <form className="grid gap-2 sm:flex sm:flex-wrap sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!f.date || !f.reason.trim() || (f.kind === "punch" && !f.time)) { toast.error("أكمل الحقول"); return; } if (!req.isPending) req.mutate(); }}>
          <div><Label htmlFor="c-d">اليوم</Label><Input id="c-d" type="date" dir="ltr" max={today} className="mt-1 w-full sm:w-44" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div><Label htmlFor="c-k">النوع</Label><select id="c-k" className={selectCls("mt-1 w-full sm:w-36")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="punch">إضافة بصمة</option><option value="excuse">عذر لليوم</option></select></div>
          {f.kind === "punch" && <div><Label htmlFor="c-t">الوقت</Label><Input id="c-t" type="time" dir="ltr" className="mt-1 w-full sm:w-32" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>}
          <div className="sm:flex-1"><Label htmlFor="c-r">السبب</Label><Input id="c-r" className="mt-1 w-full" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          <Button size="sm" type="submit" disabled={req.isPending}>إرسال</Button>
        </form>
        {d.corrections.length > 0 && <ul className="mt-3 space-y-1 text-sm">{d.corrections.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-2">
            <bdi dir="ltr">{c.date}</bdi><span>{c.kind === "punch" ? `بصمة ${tm(c.at)}` : "عذر"}</span><span className="flex-1 text-muted-foreground">{c.reason}{c.decision_reason ? ` — ${c.decision_reason}` : ""}</span>
            <span className="rounded bg-muted px-1.5 text-xs">{CORR_STATUS[c.status] ?? c.status}</span>
            {c.status === "pending" && <Button size="sm" variant="ghost" disabled={withdraw.isPending} onClick={() => withdraw.mutate(c.id)}>سحب</Button>}
          </li>))}</ul>}
      </Section>
      {d.punches.length > 0 && <Section title="بصماتي الخام"><ul className="flex flex-wrap gap-2 text-xs">{d.punches.map((p, i) => <li key={i} className="rounded border bg-card px-2 py-1">{dtm(p.at)} · {SOURCE[p.source] ?? p.source}</li>)}</ul></Section>}
    </div>
  );
}

type TeamRow = { employee: string; status: string; first_in: string | null; last_out: string | null; late_min: number; early_min: number };
/** Direct manager: minimal day summary for the team. */
export function TeamAttendance({ org }: { org: string }) {
  const today = riyadhToday();
  const [date, setDate] = useState(today);
  const q = useQuery({ queryKey: ["hr-att-team", org, date], queryFn: () => rpc<TeamRow[]>("hr_att_team", { _org: org, _date: date }) });
  return (
    <Section title="حضور فريقي" desc="ملخص يومي فقط لمن أنت مديرهم المباشر." action={<Input aria-label="اليوم" type="date" dir="ltr" className="w-40" max={today} min={addDays(today, -31)} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (q.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا يوجد أعضاء في فريقك.</p> : (
        <ul className="grid gap-2 md:grid-cols-2">{q.data!.map((r, i) => (
          <li key={i} className="rounded-xl border bg-card p-3 text-sm"><div className="flex items-center gap-2"><span className="flex-1 truncate font-semibold">{r.employee}</span><AttStatus s={r.status} /></div>
            <p className="text-xs text-muted-foreground">دخول {tm(r.first_in)} · خروج {tm(r.last_out)}{r.late_min ? ` · تأخير ${r.late_min}د` : ""}{r.early_min ? ` · خروج مبكر ${r.early_min}د` : ""}</p></li>))}</ul>
      )}
    </Section>
  );
}
