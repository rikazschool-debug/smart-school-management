// Speaker screen (runs on the device wired to the speakers) and attendance policy settings.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Volume2 } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, LoadingState, Section } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, type AppContext } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { hm, riyadhToday } from "@/lib/attendance";

type Ctx = AppContext & { schoolId: string };
const CALL_STATUS: Record<string, string> = { queued: "في الطابور", playing: "يُنادى الآن", played: "شُغّل", failed: "فشل التشغيل", skipped: "تخطّي", cancelled: "أُلغي" };

function beep(ac: AudioContext) {
  return new Promise<void>((res) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.35); o.onended = () => res();
  });
}
function speak(text: string) {
  return new Promise<void>((res, rej) => {
    if (!("speechSynthesis" in window)) return rej(new Error("المتصفح لا يدعم النطق"));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA"; u.rate = 0.9;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith("ar")); if (v) u.voice = v;
    const t = setTimeout(() => rej(new Error("انتهت مهلة النطق")), 20000);
    u.onend = () => { clearTimeout(t); res(); };
    u.onerror = (e) => { clearTimeout(t); rej(new Error(e.error || "خطأ في النطق")); };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}

export function CallsTab({ ctx }: { ctx: Ctx }) {
  const S = ctx.schoolId;
  const qc = useQueryClient();
  const [on, setOn] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [now, setNow] = useState<Row | null>(null);
  const [online, setOnline] = useState(true);
  const ac = useRef<AudioContext | null>(null);
  const busy = useRef(false);
  const list = useQuery({ queryKey: ["att-calls", S], refetchInterval: 4000, queryFn: async () => { const { data, error } = await db.from("call_queue").select("id, announce, status, attempts, last_error, created_at, played_at").eq("school_id", S).gte("created_at", riyadhToday() + "T00:00:00+03:00").order("created_at"); if (error) throw error; return data as Row[]; } });
  useEffect(() => {
    const up = () => setOnline(navigator.onLine); up();
    window.addEventListener("online", up); window.addEventListener("offline", up);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", up); };
  }, []);
  useEffect(() => {
    if (!on) return;
    const tick = async () => {
      if (busy.current) return; busy.current = true;
      try {
        const { data, error } = await db.rpc("call_next", { _school: S });
        if (error) { setFault("انقطع الاتصال بالخادم: " + arabicError(error) + " — نادِ يدويًا من القائمة حتى يعود الاتصال."); return; }
        const item = (data as Row[])?.[0]; if (!item) return;
        setNow(item); setFault(null);
        try { if (ac.current) await beep(ac.current); await speak(item["announce"]); await db.rpc("call_result", { _id: item["id"], _action: "played", _error: null }); }
        catch (e) { const m = e instanceof Error ? e.message : String(e); setFault(`تعذّر تشغيل الصوت (${m}). اقرأ النداء يدويًا: «${item["announce"]}»`); await db.rpc("call_result", { _id: item["id"], _action: "failed", _error: m }); }
        finally { setNow(null); qc.invalidateQueries({ queryKey: ["att-calls", S] }); }
      } finally { busy.current = false; }
    };
    const t = setInterval(tick, 3000); void tick();
    return () => clearInterval(t);
  }, [on, S, qc]);
  const start = async () => {
    try {
      ac.current = new AudioContext(); await ac.current.resume(); await beep(ac.current);
      await speak("اختبار الصوت. بدأ نظام النداء.");
      setOn(true); setFault(null); toast.success("بدأت جلسة النداء");
    } catch (e) { setFault(`فشل اختبار الصوت: ${e instanceof Error ? e.message : e}. تأكد من السماعات وأذونات الصوت في المتصفح.`); }
  };
  const act = async (id: string, action: string) => { const { error } = await db.rpc("call_result", { _id: id, _action: action, _error: null }); if (error) toast.error(arabicError(error)); else qc.invalidateQueries({ queryKey: ["att-calls", S] }); };
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Volume2 className="size-5 text-primary" />شاشة النداء</h2>
        <p className="mb-3 text-sm text-muted-foreground">شغّلها على الجهاز المتصل بالسماعات. يُنادى طالب واحد في كل مرة: اسمه وصفه ونقطة الاستلام فقط — دون سبب الاستئذان أو بيانات الأسرة. نجاح التشغيل لا يثبت أن الطالب سمع النداء.</p>
        <div className="flex flex-wrap items-center gap-2">
          {!on ? <Button onClick={start}>بدء الجلسة واختبار الصوت</Button> : <Button variant="outline" onClick={() => { setOn(false); speechSynthesis.cancel(); }}>إيقاف الجلسة</Button>}
          <Badge variant={on ? "default" : "outline"}>{on ? "الجلسة تعمل" : "متوقفة"}</Badge>
          {!online && <Badge variant="destructive">لا يوجد اتصال بالإنترنت</Badge>}
        </div>
        {now && <p className="mt-3 rounded-xl bg-primary/10 p-3 text-lg font-bold text-primary">يُنادى الآن: {now["announce"]}</p>}
        {fault && <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-destructive bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{fault}</p>}
      </section>
      <Section title="نداءات اليوم">
        {list.isLoading ? <LoadingState /> : !list.data?.length ? <EmptyState title="لا توجد نداءات اليوم" /> : (
          <ul className="divide-y rounded-xl border bg-card">
            {list.data.map((c) => (
              <li key={c["id"]} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="min-w-0">{c["announce"]} <span className="text-xs text-muted-foreground">• {hm(c["created_at"])} • محاولات {c["attempts"]}{c["last_error"] ? ` • ${c["last_error"]}` : ""}</span></span>
                <span className="flex items-center gap-1"><Badge variant={c["status"] === "failed" ? "destructive" : "secondary"}>{CALL_STATUS[c["status"]]}</Badge>
                  {["played", "failed", "skipped"].includes(c["status"]) && <Button size="sm" variant="ghost" onClick={() => act(c["id"], "repeat")}>إعادة النداء</Button>}
                  {["queued", "failed"].includes(c["status"]) && <Button size="sm" variant="ghost" onClick={() => act(c["id"], "skip")}>تخطٍّ</Button>}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ================= Settings ================= */
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const KEYS: [string, string][] = [["holidays", "العطلات"], ["extra_days", "أيام استثنائية"], ["arrival_open", "بداية الاستقبال"], ["day_start", "بداية الدوام"], ["day_end", "نهاية الدوام"], ["grace_minutes", "فترة السماح"], ["absence_review_at", "موعد المراجعة"], ["notify_arrival", "إشعار الوصول"], ["call_point", "نقطة الاستلام"], ["study_days", "أيام الدراسة"], ["late_from", "احتساب التأخر"], ["approver_roles", "أدوار الاعتماد"], ["guardian_cancel_until", "حد إلغاء ولي الأمر"]];
const APPROVERS: Role[] = ["vice_principal", "student_affairs", "principal"];

export function SettingsTab({ ctx }: { ctx: Ctx }) {
  const S = ctx.schoolId;
  const owner = ctx.role === "org_owner";
  const [scope, setScope] = useState<"school" | "org">("school");
  const q = useQuery({ queryKey: ["att-policies", ctx.orgId, S], queryFn: async () => { const { data, error } = await db.from("attendance_policies").select("*").eq("org_id", ctx.orgId).or(`school_id.eq.${S},school_id.is.null`).order("effective_from", { ascending: false }); if (error) throw error; return data as Row[]; } });
  const today = riyadhToday();
  const current = (q.data ?? []).filter((p) => p["effective_from"] <= today).sort((a, b) => Number(!!b["school_id"]) - Number(!!a["school_id"]))[0];
  const orgPol = (q.data ?? []).find((p) => !p["school_id"] && p["effective_from"] <= today);
  const editable: string[] = orgPol?.["principal_editable"] ?? KEYS.slice(0, 9).map(([k]) => k);
  const [f, setF] = useState<Row | null>(null);
  const [eff, setEff] = useState(today);
  useEffect(() => { if (q.data && !f) { const c = current ?? {}; setF({ study_days: c["study_days"] ?? [0, 1, 2, 3, 4], holidays: (c["holidays"] ?? []).join("، "), extra_days: (c["extra_days"] ?? []).join("، "), arrival_open: (c["arrival_open"] ?? "06:30").slice(0, 5), day_start: (c["day_start"] ?? "07:00").slice(0, 5), day_end: (c["day_end"] ?? "13:00").slice(0, 5), grace_minutes: c["grace_minutes"] ?? 10, late_from: c["late_from"] ?? "day_start", absence_review_at: (c["absence_review_at"] ?? "09:00").slice(0, 5), approver_roles: c["approver_roles"] ?? ["vice_principal", "student_affairs"], guardian_cancel_until: c["guardian_cancel_until"] ?? "arrived", notify_arrival: c["notify_arrival"] ?? true, call_point: c["call_point"] ?? "البوابة الرئيسية", principal_editable: editable }); } }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isLoading || !f) return <LoadingState />;
  const can = (k: string) => owner || editable.includes(k);
  const dates = (s: string) => s.split(/[،,\s]+/).map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    const all: Row = { ...f, holidays: dates(f["holidays"]), extra_days: dates(f["extra_days"]) };
    const v: Row = {}; for (const [k] of KEYS) if (can(k)) v[k] = all[k];
    if (owner && scope === "org") v["principal_editable"] = f["principal_editable"];
    const { error } = await db.rpc("save_attendance_policy", { _org: ctx.orgId, _school: scope === "org" ? null : S, _effective_from: eff, _v: v });
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظ إصدار جديد من الإعدادات"); q.refetch();
  };
  const field = (k: string, label: string, el: React.ReactNode) => <div className="space-y-1"><Label className={can(k) ? "" : "text-muted-foreground"}>{label}{!can(k) && " (تحدده المؤسسة)"}</Label>{el}</div>;
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          {owner && <div className="space-y-1"><Label htmlFor="sc">النطاق</Label><select id="sc" className={selectCls("w-auto")} value={scope} onChange={(e) => setScope(e.target.value as "school" | "org")}><option value="school">هذه المدرسة ({ctx.schoolName})</option><option value="org">السياسة المركزية لكل الفروع</option></select></div>}
          <div className="space-y-1"><Label htmlFor="ef">تاريخ السريان</Label><Input id="ef" type="date" min={today} value={eff} onChange={(e) => setEff(e.target.value)} /></div>
          <p className="pb-2 text-xs text-muted-foreground">كل حفظ ينشئ إصدارًا جديدًا يسري من التاريخ المحدد، ولا يغيّر تصنيف الأيام السابقة.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("arrival_open", "بداية استقبال الطلاب", <Input type="time" disabled={!can("arrival_open")} value={f["arrival_open"]} onChange={(e) => setF({ ...f, arrival_open: e.target.value })} />)}
          {field("day_start", "بداية الدوام", <Input type="time" disabled={!can("day_start")} value={f["day_start"]} onChange={(e) => setF({ ...f, day_start: e.target.value })} />)}
          {field("day_end", "نهاية الدوام", <Input type="time" disabled={!can("day_end")} value={f["day_end"]} onChange={(e) => setF({ ...f, day_end: e.target.value })} />)}
          {field("grace_minutes", "فترة السماح (دقيقة)", <Input type="number" min={0} max={120} disabled={!can("grace_minutes")} value={f["grace_minutes"]} onChange={(e) => setF({ ...f, grace_minutes: Number(e.target.value) })} />)}
          {field("late_from", "دقائق التأخر تُحسب من", <select className={selectCls("w-full")} disabled={!can("late_from")} value={f["late_from"]} onChange={(e) => setF({ ...f, late_from: e.target.value })}><option value="day_start">بداية الدوام</option><option value="grace_end">نهاية فترة السماح</option></select>)}
          {field("absence_review_at", "موعد إعداد قائمة الغياب", <Input type="time" disabled={!can("absence_review_at")} value={f["absence_review_at"]} onChange={(e) => setF({ ...f, absence_review_at: e.target.value })} />)}
          {field("call_point", "نقطة الاستلام في النداء", <Input disabled={!can("call_point")} value={f["call_point"]} onChange={(e) => setF({ ...f, call_point: e.target.value })} />)}
          {field("guardian_cancel_until", "يلغي ولي الأمر حتى", <select className={selectCls("w-full")} disabled={!can("guardian_cancel_until")} value={f["guardian_cancel_until"]} onChange={(e) => setF({ ...f, guardian_cancel_until: e.target.value })}><option value="approved">الاعتماد</option><option value="arrived">وصول المستلم</option><option value="preparing">بدء التجهيز</option></select>)}
          {field("notify_arrival", "إشعار الأسرة بالوصول", <select className={selectCls("w-full")} disabled={!can("notify_arrival")} value={String(f["notify_arrival"])} onChange={(e) => setF({ ...f, notify_arrival: e.target.value === "true" })}><option value="true">نعم</option><option value="false">لا</option></select>)}
        </div>
        <p className="text-sm">مثال بالإعداد الحالي: من يصل حتى {f["day_start"]} + {f["grace_minutes"]} دقيقة «حاضر»، وبعدها «متأخر» وتُحسب الدقائق من {f["late_from"] === "grace_end" ? "نهاية السماح" : "بداية الدوام"}.</p>
        {field("study_days", "أيام الدراسة", <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" disabled={!can("study_days")} checked={f["study_days"].includes(i)} onChange={(e) => setF({ ...f, study_days: e.target.checked ? [...f["study_days"], i].sort() : f["study_days"].filter((x: number) => x !== i) })} />{d}</label>)}</div>)}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("holidays", "العطلات (تواريخ مفصولة بفاصلة، مثل 2026-11-20)", <Input dir="ltr" disabled={!can("holidays")} value={f["holidays"]} onChange={(e) => setF({ ...f, holidays: e.target.value })} />)}
          {field("extra_days", "أيام دراسة استثنائية", <Input dir="ltr" disabled={!can("extra_days")} value={f["extra_days"]} onChange={(e) => setF({ ...f, extra_days: e.target.value })} />)}
        </div>
        {field("approver_roles", "المسؤولون عن اعتماد الاستئذان والتصحيحات (إضافة إلى المدير)", <div className="flex flex-wrap gap-3">{APPROVERS.map((r) => <label key={r} className="flex items-center gap-1 text-sm"><input type="checkbox" disabled={!can("approver_roles")} checked={f["approver_roles"].includes(r)} onChange={(e) => setF({ ...f, approver_roles: e.target.checked ? [...f["approver_roles"], r] : f["approver_roles"].filter((x: string) => x !== r) })} />{ROLE_LABELS[r]}</label>)}</div>)}
        {owner && scope === "org" && <div className="space-y-1"><Label>ما يستطيع مدير كل مدرسة تعديله</Label><div className="flex flex-wrap gap-3">{KEYS.map(([k, l]) => <label key={k} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f["principal_editable"].includes(k)} onChange={(e) => setF({ ...f, principal_editable: e.target.checked ? [...f["principal_editable"], k] : f["principal_editable"].filter((x: string) => x !== k) })} />{l}</label>)}</div></div>}
        <Button onClick={save}>حفظ إصدار جديد</Button>
      </section>
      <Section title="الإصدارات">
        {!q.data?.length ? <EmptyState title="لا توجد إصدارات بعد" hint="لن يعمل المسح قبل حفظ أول سياسة." /> : (
          <ul className="divide-y rounded-xl border bg-card text-sm">{q.data.map((p) => <li key={p["id"]} className="px-4 py-2">{p["school_id"] ? "المدرسة" : "المؤسسة"} • إصدار {p["version"]} • يسري من {p["effective_from"]} • الدوام {String(p["day_start"]).slice(0, 5)} • السماح {p["grace_minutes"]} د{p["id"] === current?.["id"] && <Badge className="ms-2">الساري</Badge>}</li>)}</ul>
        )}
      </Section>
    </div>
  );
}
