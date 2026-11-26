import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { LayoutDashboard, Zap, SlidersHorizontal, Play, Clock, Activity, Settings2, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { selectCls } from "@/components/ui/native-select";

export type AuTab = "overview" | "events" | "conditions" | "actions" | "schedule" | "monitor" | "settings";
export const AU_TABS: { k: AuTab; l: string; i: LucideIcon }[] = [
  { k: "overview", i: LayoutDashboard, l: "نظرة عامة" }, { k: "events", i: Zap, l: "دليل الأحداث" }, { k: "conditions", i: SlidersHorizontal, l: "دليل الشروط والمتغيرات" },
  { k: "actions", i: Play, l: "دليل الإجراءات" }, { k: "schedule", i: Clock, l: "جدولة التشغيل" },
  { k: "monitor", i: Activity, l: "مراقبة التنفيذ" }, { k: "settings", i: Settings2, l: "الإعدادات" },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const EV_ST: Record<string, [string, string]> = { tested: ["مرتبط ومختبَر", "bg-primary/15 text-primary"], wired: ["مرتبط", "bg-primary/10 text-primary"], registered: ["بانتظار الربط", "bg-muted text-muted-foreground"], blocked: ["مغطى بوظيفة قائمة / ممنوع", "bg-destructive/10 text-destructive"] };
const AC_ST: Record<string, [string, string]> = { ready: ["جاهز", "bg-primary/15 text-primary"], registered: ["مسجل — غير مفعّل", "bg-muted text-muted-foreground"], forbidden: ["ممنوع", "bg-destructive/10 text-destructive"] };
const SEC_ST: Record<string, string> = { wired: "مرتبط", pending: "بانتظار الربط", excluded: "مستثنى" };
const DELIV: Record<string, string> = { captured_instant: "يُلتقط فورًا عند الحفظ ويُنفَّذ في الدورة التالية (خلال دقيقة)", scheduled_scan: "فحص حسب توقيت القاعدة" };
const MANAGE: Record<string, [string, string]> = { keep: ["تبقى مستقلة", "bg-muted text-muted-foreground"], candidate: ["مرشحة للإدارة من المركز", "bg-primary/10 text-primary"], later: ["لاحقًا بعد اعتماد القسم", "bg-muted text-muted-foreground"], engine: ["المحرك نفسه", "bg-primary/15 text-primary"] };
const SKIP: Record<string, string> = { "not_allowed": "المستلم غير مخوّل لحظة التنفيذ", "conflict:other_rule_first": "تعارض: قاعدة أعلى أولوية أرسلت للشخص نفسه", "cap:deferred_next_day": "تجاوز الحد اليومي — أُجّل لليوم التالي", "cap:cancelled_after_0_days": "تجاوز الحد — أُلغي (لا تأجيل)", "loop_guard:automated_source": "منع الحلقات: المصدر أنشأه المحرك", "task:no_authorized_assignee": "لا يوجد مكلَّف مخوّل", "review:no_authorized_assignee": "لا يوجد مراجع مخوّل" };
const skipLabel = (k: string) => SKIP[k] ?? (k.startsWith("not_allowed") ? `${SKIP["not_allowed"]} (${k.split(":")[1]})` : k.startsWith("cap:cancelled") ? "تجاوز الحد بعد مهلة التأجيل — أُلغي وسُجّل" : k);
const SENS: Record<string, string> = { normal: "عادي", sensitive: "حساس", restricted: "مقيد" };
const TYPE: Record<string, string> = { number: "رقم", percent: "نسبة", text: "نص", status: "حالة", date: "تاريخ", bool: "نعم/لا", uuid: "معرّف" };
const Badge = ({ s }: { s: [string, string] | undefined }) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s?.[1] ?? ""}`}>{s?.[0]}</span>;

function useRegistry(orgId: string) {
  return useQuery({ queryKey: ["au-registry", orgId], queryFn: async () => { const r = await supabase.rpc("au_registry" as never, { _org: orgId } as never); if (r.error) throw r.error; return r.data as unknown as Any; } });
}

export function AutomationPage({ orgId, tab }: { orgId: string; tab: AuTab }) {
  const navigate = useNavigate();
  const q = useRegistry(orgId);
  return (
    <div className="space-y-4">
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {AU_TABS.map((t) => { const on = tab === t.k; return (
          <button key={t.k} aria-current={on ? "page" : undefined} onClick={() => navigate({ to: "/app/automation", search: { tab: t.k } })}
            className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-all ${on ? "border-primary bg-primary text-primary-foreground shadow-md" : "bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${on ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"}`}><t.i className="h-4 w-4" /></span>
            <span className="min-w-0 truncate text-sm font-semibold">{t.l}</span>
          </button>); })}
      </nav>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : q.data && (
        <>
          {tab === "overview" && <Overview r={q.data} />}
          {tab === "events" && <Events r={q.data} />}
          {tab === "conditions" && <Conditions r={q.data} />}
          {tab === "actions" && <Actions r={q.data} />}
          {tab === "schedule" && <Schedule r={q.data} />}
          {tab === "monitor" && <Monitor orgId={orgId} />}
          {tab === "settings" && <SettingsTab orgId={orgId} />}
        </>
      )}
    </div>
  );
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-2xl border bg-card p-4 shadow-sm"><h3 className="mb-3 text-sm font-bold">{title}</h3>{children}</section>;
const Stat = ({ l, v, hint }: { l: string; v: number | string; hint?: string | undefined }) => <div className="rounded-xl border bg-background p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 text-2xl font-bold">{v}</div>{hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}</div>;

function Overview({ r }: { r: Any }) {
  const ev: Any[] = r.events, ac: Any[] = r.actions, sec: Any[] = r.sections, g = r.gaps;
  const n = (a: Any[], f: (x: Any) => boolean) => a.filter(f).length;
  const gapCount = g.unregistered_sections.length + g.sections_without_events.length + g.events_bad_section.length + g.excluded_without_reason.length;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">لا توجد قاعدة تعمل دون اعتمادك وتفعيلك. لكل قاعدة توقيتها الخاص، والتنفيذ الفوري يتم بعد حفظ العملية دون أن يؤخر الشاشة. الإرسال الخارجي (واتساب والبريد وWebhooks) غير مفعّل للأتمتة.</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat l="الأقسام المحصورة" v={sec.length} hint={`${n(sec, (s) => s.status === "wired")} مرتبط · ${n(sec, (s) => s.status === "pending")} بانتظار الربط · ${n(sec, (s) => s.status === "excluded")} مستثنى`} />
        <Stat l="الأحداث المسجلة" v={ev.length} hint={`${n(ev, (e) => ["wired", "tested"].includes(e.status))} جاهز للتشغيل · ${n(ev, (e) => e.status === "blocked")} مغطى بوظيفة قائمة`} />
        <Stat l="المتغيرات والعمليات" v={`${r.variables.length} / ${r.operators.length}`} hint="متغيرات الأحداث المرتبطة / عمليات المقارنة" />
        <Stat l="الإجراءات" v={ac.length} hint={`${n(ac, (a) => a.readiness === "ready")} جاهز · ${n(ac, (a) => a.readiness === "forbidden")} ممنوع`} />
      </div>
      <Card title="اكتمال الدليل">
        {gapCount === 0 ? <p className="text-sm text-muted-foreground">كل أقسام المنصة مسجلة في الدليل، ولكل قسم مستثنى سبب موثق.</p> : (
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {g.unregistered_sections.map((s: Any) => <li key={s.key}>قسم غير مسجل: {s.label}</li>)}
            {g.sections_without_events.map((s: string) => <li key={s}>قسم بلا أحداث: {s}</li>)}
          </ul>)}
      </Card>
    </div>
  );
}

function Events({ r }: { r: Any }) {
  const [st, setSt] = useState(""); const [area, setArea] = useState("");
  const secs = Object.fromEntries((r.sections as Any[]).map((s) => [s.key, s]));
  const rc: Record<string, string> = Object.fromEntries((r.recipients as Any[]).map((x) => [x.code, x.label]));
  const rows = (r.events as Any[]).filter((e) => (!st || e.status === st) && (!area || e.area === area));
  return (
    <Card title={`الأحداث (${rows.length})`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className={selectCls()} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(EV_ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
        <select className={selectCls()} value={area} onChange={(e) => setArea(e.target.value)}><option value="">كل النطاقات</option><option value="school">المدارس</option><option value="central">الإدارة المركزية</option><option value="shared">مشترك</option></select>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground"><tr className="border-b text-start">{["الحدث", "القسم", "المصدر", "التوقيت", "طريقة التنفيذ", "الحساسية", "المستلمون", "منع التكرار", "الأتمتة القائمة", "الحالة"].map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((e) => <tr key={e.code} className="border-b align-top last:border-0">
          <td className="p-2 font-semibold">{e.label}<div className="font-mono text-xs font-normal text-muted-foreground" dir="ltr">{e.code}</div></td>
          <td className="p-2">{secs[e.section]?.label ?? e.section}</td><td className="p-2 font-mono text-xs" dir="ltr">{e.source}</td><td className="p-2">{e.timing}</td>
          <td className="p-2 text-xs">{DELIV[e.delivery] ?? "—"}</td>
          <td className="p-2">{SENS[e.sensitivity]}</td><td className="p-2 text-xs">{(e.recipients ?? []).map((c: string) => rc[c] ?? c).join("، ")}{(e.covered ?? []).length > 0 && <div className="text-muted-foreground">مُشعَر أصلًا: {(e.covered as string[]).map((c) => rc[c] ?? c).join("، ")}</div>}</td><td className="p-2 text-xs">{e.dedupe}</td><td className="p-2 text-xs">{e.existing ?? "—"}{e.note && <div className="text-muted-foreground">{e.note}</div>}</td>
          <td className="p-2"><Badge s={EV_ST[e.status]} /></td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}

function Conditions({ r }: { r: Any }) {
  const ev = Object.fromEntries((r.events as Any[]).map((e) => [e.code, e.label]));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="المتغيرات المتاحة للأحداث المرتبطة">
        <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b">{["الحدث", "المتغير", "النوع", "القيم"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(r.variables as Any[]).map((v) => <tr key={v.event_code + v.key} className="border-b last:border-0"><td className="p-2">{ev[v.event_code]}</td><td className="p-2 font-semibold">{v.label}</td><td className="p-2">{TYPE[v.type]}</td><td className="p-2 text-xs" dir="ltr">{(v.options ?? []).join(" · ")}</td></tr>)}</tbody></table>
      </Card>
      <Card title="عمليات المقارنة والربط المنطقي">
        <table className="w-full text-sm"><tbody>{(r.operators as Any[]).map((o) => <tr key={o.code} className="border-b last:border-0"><td className="p-2 font-semibold">{o.label}</td><td className="p-2 text-xs text-muted-foreground">{(o.types as string[]).map((t) => TYPE[t]).join("، ")}</td></tr>)}</tbody></table>
        <p className="mt-3 text-xs text-muted-foreground">تدعم القواعد «و» و«أو» و«ليس» بتداخل حتى 5 مستويات و20 شرطًا كحد أقصى. يُتحقق من نوع كل قيمة قبل الحفظ، ولا يُسمح بأي استعلام أو كود حر.</p>
      </Card>
    </div>
  );
}

function Actions({ r }: { r: Any }) {
  return (
    <div className="space-y-4">
      <Card title="الإجراءات">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b">{["الإجراء", "الخدمة المنفذة", "الحقول المطلوبة", "الخطورة", "موافقة بشرية", "إعادة المحاولة", "الحالة"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(r.actions as Any[]).map((a) => <tr key={a.code} className="border-b align-top last:border-0"><td className="p-2 font-semibold">{a.label}{a.note && <div className="text-xs font-normal text-muted-foreground">{a.note}</div>}</td>
            <td className="p-2 text-xs">{a.service}</td><td className="p-2 text-xs">{(a.required ?? []).join("، ") || "—"}</td><td className="p-2">{a.risk}</td><td className="p-2">{a.needs_human ? "نعم" : "لا"}</td><td className="p-2 text-xs">{a.retry ?? "—"}</td><td className="p-2"><Badge s={AC_ST[a.readiness]} /></td></tr>)}</tbody></table></div>
      </Card>
      <Card title="المستلمون">
        <div className="flex flex-wrap gap-2">{(r.recipients as Any[]).map((x) => <span key={x.code} className={`rounded-full border px-3 py-1 text-xs ${x.available ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}`}>{x.label}{x.available ? " · متاح" : ""}</span>)}</div>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{(r.recipients as Any[]).filter((x) => ["teacher", "supervisor", "manager", "guardian"].includes(x.code) || !x.available).map((x) => <li key={x.code}><span className="font-semibold text-foreground">{x.label}:</span> {x.resolver}</li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">يُعاد التحقق من نشاط المستلم وفرعه ومجموعته وصلاحيته على القسم لحظة كل تنفيذ. إشعارات أولياء الأمور داخلية فقط، ولا تُرسل في الأحداث التي تُبلغ فيها الأسرة أصلًا أو الأحداث المقيدة.</p>
      </Card>
    </div>
  );
}

function Schedule({ r }: { r: Any }) {
  return (
    <Card title="أنواع التشغيل">
      <ul className="divide-y text-sm">{(r.triggers as Any[]).map((t) => <li key={t.code} className="flex items-start justify-between gap-3 py-2.5"><div><div className="font-semibold">{t.label}</div>{t.note && <div className="text-xs text-muted-foreground">{t.note}</div>}</div>
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${t.available ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{t.available ? "متاح" : "غير متاح بعد"}</span></li>)}</ul>
      <p className="mt-3 text-xs text-muted-foreground">التوقيت المعتمد: الرياض. الأقسام في هذا الدليل بحالتها: {Object.values(SEC_ST).join(" / ")}.</p>
    </Card>
  );
}

function rpc<T>(fn: string, args: Record<string, unknown>) { return supabase.rpc(fn as never, args as never) as unknown as Promise<{ data: T; error: { message: string } | null }>; }
const fmt = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }) : "—");
const JOB_ST: Record<string, string> = { queued: "بالانتظار", done: "منفّذة", cancelled: "ملغاة (تغيّر الشرط/النطاق)", dead: "معزولة بعد فشل متكرر" };

function Monitor({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const m = useQuery({ queryKey: ["au-monitor", orgId], refetchInterval: 30000, queryFn: async () => { const r = await rpc<Any>("au_monitor", { _org: orgId }); if (r.error) throw r.error; return r.data; } });
  const ex = useQuery({ queryKey: ["au-existing", orgId], queryFn: async () => { const r = await rpc<Any>("au_existing_jobs", { _org: orgId }); if (r.error) throw r.error; return r.data; } });
  if (m.isLoading || ex.isLoading) return <LoadingState />;
  if (m.error || ex.error) return <ErrorState message={arabicError(m.error ?? ex.error)} />;
  const d = m.data ?? {}; const jobs = d.jobs ?? {};
  const retry = async (id: number) => { const r = await rpc("au_job_retry", { _id: id }); if (r.error) toast.error(arabicError(r.error)); else { toast.success("أُعيدت العملية إلى الطابور"); qc.invalidateQueries({ queryKey: ["au-monitor", orgId] }); } };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(JOB_ST).map(([k, l]) => <Stat key={k} l={l} v={jobs[k] ?? 0} />)}
        <Stat l="أحداث بانتظار المعالجة" v={d.outbox_pending ?? 0} hint={d.oldest_queued_s != null ? `أقدم عملية منذ ${d.oldest_queued_s} ث` : undefined} />
      </div>
      <Card title="عمليات لم تُرسل خلال 24 ساعة وسببها (لا إسقاط صامت)">
        {Object.keys(d.skips_24h ?? {}).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد عمليات متخطاة.</p> : (
          <ul className="divide-y text-sm">{Object.entries(d.skips_24h as Record<string, number>).map(([k, n]) => <li key={k} className="flex justify-between gap-3 py-2"><span>{skipLabel(k)}</span><span className="font-bold">{n}</span></li>)}</ul>)}
        <p className="mt-2 text-xs text-muted-foreground">مؤجلة بسبب الحد اليومي الآن: {d.deferred_cap ?? 0}. المؤجل يُعاد التحقق من شرطه قبل الإرسال، فلا تصل إشعارات لم تعد صحيحة.</p>
      </Card>
      <Card title="قواعد المجموعة">
        {(d.rules ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد قواعد بعد.</p> : (
          <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b">{["القاعدة", "الحدث", "الإصدار", "الأولوية", "الحالة", "آخر تشغيل", "التشغيل التالي"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{(d.rules as Any[]).map((x) => <tr key={x.id} className="border-b last:border-0"><td className="p-2 font-semibold">{x.name}</td><td className="p-2 font-mono text-xs" dir="ltr">{x.event}</td><td className="p-2">{x.version ?? "مسودة"}</td><td className="p-2">{x.priority ?? 5}</td><td className="p-2">{x.active ? "مفعّلة" : "متوقفة"}</td><td className="p-2 text-xs">{fmt(x.last_run_at)}</td><td className="p-2 text-xs">{fmt(x.next_run_at)}</td></tr>)}</tbody></table>)}
      </Card>
      <Card title="العمليات المعزولة">
        {(d.dead ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد عمليات معزولة.</p> : (
          <ul className="divide-y text-sm">{(d.dead as Any[]).map((x) => <li key={x.id} className="flex items-center justify-between gap-3 py-2"><div><div className="font-semibold">عملية #{x.id} — {x.attempts} محاولات</div><div className="text-xs text-muted-foreground" dir="ltr">{x.error}</div></div>
            <button onClick={() => retry(x.id)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-primary/50">إعادة المحاولة</button></li>)}</ul>)}
      </Card>
      <Card title="الوظائف التلقائية القائمة (مراقبة فقط — مواعيدها كما هي)">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b">{["الوظيفة", "القسم والغرض", "المستلمون والإعدادات", "الجدولة (UTC)", "آخر تشغيل", "تشغيلات/فشل 24 ساعة", "متوسط المدة", "الإدارة من المركز"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{((ex.data?.jobs ?? []) as Any[]).map((x) => <tr key={x.job} className="border-b align-top last:border-0"><td className="p-2 font-mono text-xs" dir="ltr">{x.job}</td>
            <td className="p-2 text-xs"><div className="font-semibold">{x.section ?? "—"}</div><div className="text-muted-foreground">{x.purpose}</div></td>
            <td className="p-2 text-xs"><div>{x.recipients}</div><div className="text-muted-foreground" dir="ltr">{x.settings}</div></td><td className="p-2 font-mono text-xs" dir="ltr">{x.schedule}</td>
            <td className="p-2 text-xs">{fmt(x.last?.start)} {x.last?.status === "succeeded" ? "✓" : x.last ? "✗" : ""}</td>
            <td className="p-2 text-xs">{x.runs_24h} / <span className={x.failed_24h ? "font-bold text-destructive" : ""}>{x.failed_24h}</span></td><td className="p-2 text-xs">{x.avg_ms_24h != null ? `${x.avg_ms_24h} ms` : "—"}</td>
            <td className="p-2 text-xs"><Badge s={MANAGE[x.manage]} /><div className="mt-1 text-muted-foreground">{x.reason}</div></td></tr>)}</tbody></table></div>
      </Card>
      <Card title="الأحداث المغلقة لأن وظيفة قائمة تغطيها (حسب القسم)">
        <div className="grid gap-3 md:grid-cols-2">{((ex.data?.blocked ?? []) as Any[]).map((g) => <div key={g.section} className="rounded-xl border bg-background p-3"><div className="mb-1 text-sm font-semibold">{g.section}</div>
          <ul className="space-y-1 text-xs">{(g.events as Any[]).map((e) => <li key={e.code}>{e.label} <span className="text-muted-foreground">— {e.existing ?? e.note ?? ""}</span></li>)}</ul></div>)}</div>
        <p className="mt-2 text-xs text-muted-foreground">لا يمكن إنشاء قاعدة على هذه الأحداث حتى لا يُنفَّذ الإجراء نفسه من مسارين. مواعيد الوظائف القائمة لا تتغير دون موافقتك.</p>
      </Card>
      <Card title="آخر دورات المحرك">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b">{["الوقت", "المدة", "قواعد مفحوصة", "أحداث", "منفّذة", "ملغاة", "مؤجلة", "فشل", "متوسط الانتظار"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(d.runs ?? []).map((x: Any) => <tr key={x.id} className="border-b last:border-0"><td className="p-2 text-xs">{fmt(x.started_at)}</td><td className="p-2">{x.ms} ms</td><td className="p-2">{x.scanned ?? 0}</td><td className="p-2">{x.events ?? 0}</td><td className="p-2">{x.jobs_done ?? 0}</td><td className="p-2">{x.cancelled ?? 0}</td><td className="p-2">{x.deferred ?? 0}</td><td className="p-2">{x.jobs_failed ?? 0}</td><td className="p-2">{x.lat_avg_ms != null ? `${x.lat_avg_ms} ms` : "—"}</td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}

const DOW = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function SettingsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const m = useQuery({ queryKey: ["au-monitor", orgId], queryFn: async () => { const r = await rpc<Any>("au_monitor", { _org: orgId }); if (r.error) throw r.error; return r.data; } });
  if (m.isLoading) return <LoadingState />;
  if (m.error) return <ErrorState message={arabicError(m.error)} />;
  return <SettingsForm orgId={orgId} s={m.data?.settings ?? {}} onSaved={() => qc.invalidateQueries({ queryKey: ["au-monitor", orgId] })} />;
}
function SettingsForm({ orgId, s, onSaved }: { orgId: string; s: Any; onSaved: () => void }) {
  const [qs, setQs] = useState<string>(s.quiet_start?.slice(0, 5) ?? ""); const [qe, setQe] = useState<string>(s.quiet_end?.slice(0, 5) ?? "");
  const [wd, setWd] = useState<number[]>(s.workdays ?? [0, 1, 2, 3, 4]); const [mx, setMx] = useState<number>(s.max_per_user_day ?? 20); const [busy, setBusy] = useState(false);
  const [fm, setFm] = useState<number>(s.family_max_day ?? 3); const [dd, setDd] = useState<number>(s.cap_defer_days ?? 3); const [mr, setMr] = useState<boolean>(s.merge_rules ?? true);
  const save = async () => {
    setBusy(true);
    const r = await rpc("au_settings_save", { _org: orgId, _quiet_start: qs || null, _quiet_end: qe || null, _workdays: wd, _max: mx, _family_max: fm, _cap_defer_days: dd, _merge_rules: mr });
    setBusy(false); if (r.error) toast.error(arabicError(r.error)); else { toast.success("حُفظت الإعدادات"); onSaved(); }
  };
  const inp = "rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <Card title="إعدادات التشغيل (توقيت الرياض)">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1 text-sm"><span className="font-semibold">بداية فترة منع الإشعارات</span><input type="time" className={`${inp} w-full`} value={qs} onChange={(e) => setQs(e.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="font-semibold">نهاية الفترة</span><input type="time" className={`${inp} w-full`} value={qe} onChange={(e) => setQe(e.target.value)} /></label>
        <label className="space-y-1 text-sm"><span className="font-semibold">الحد الأقصى لإشعارات الأتمتة لكل مستخدم يوميًا</span><input type="number" min={1} max={200} className={`${inp} w-full`} value={mx} onChange={(e) => setMx(Number(e.target.value))} /></label>
        <label className="space-y-1 text-sm"><span className="font-semibold">الحد اليومي لإشعارات الأتمتة لولي الأمر</span><input type="number" min={1} max={10} className={`${inp} w-full`} value={fm} onChange={(e) => setFm(Number(e.target.value))} /></label>
        <label className="space-y-1 text-sm"><span className="font-semibold">أيام تأجيل ما يتجاوز الحد قبل إلغائه</span><input type="number" min={0} max={7} className={`${inp} w-full`} value={dd} onChange={(e) => setDd(Number(e.target.value))} /></label>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={mr} onChange={(e) => setMr(e.target.checked)} /><span className="font-semibold">عند تعارض قاعدتين على السجل والشخص نفسيهما تُرسل الأعلى أولوية فقط</span></label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">ما يتجاوز الحد لا يُسقط: يؤجل إلى 7:00 صباح اليوم التالي ويُعاد التحقق من شرطه، ثم يُلغى بسبب موثق بعد مهلة التأجيل. التصعيد لا يخضع للحد.</p>
      <div className="mt-4"><div className="mb-2 text-sm font-semibold">أيام العمل (للقواعد التي تعمل في أيام العمل فقط)</div>
        <div className="flex flex-wrap gap-2">{DOW.map((l, i) => { const on = wd.includes(i); return <button key={l} type="button" onClick={() => setWd(on ? wd.filter((x) => x !== i) : [...wd, i].sort())} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}>{l}</button>; })}</div>
        <p className="mt-2 text-xs text-muted-foreground">الإجازات تُقرأ من إجازات الحضور الرسمية المسجلة في الموارد البشرية.</p></div>
      <div className="mt-4"><button disabled={busy} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">حفظ</button></div>
    </Card>
  );
}
