import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutDashboard, Zap, SlidersHorizontal, Play, Clock, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { selectCls } from "@/components/ui/native-select";

export type AuTab = "overview" | "events" | "conditions" | "actions" | "schedule";
export const AU_TABS: { k: AuTab; l: string; i: LucideIcon }[] = [
  { k: "overview", i: LayoutDashboard, l: "نظرة عامة" }, { k: "events", i: Zap, l: "دليل الأحداث" }, { k: "conditions", i: SlidersHorizontal, l: "دليل الشروط والمتغيرات" },
  { k: "actions", i: Play, l: "دليل الإجراءات" }, { k: "schedule", i: Clock, l: "جدولة التشغيل" },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const EV_ST: Record<string, [string, string]> = { tested: ["مرتبط ومختبَر", "bg-primary/15 text-primary"], wired: ["مرتبط", "bg-primary/10 text-primary"], registered: ["بانتظار الربط", "bg-muted text-muted-foreground"], blocked: ["مغطى بوظيفة قائمة / ممنوع", "bg-destructive/10 text-destructive"] };
const AC_ST: Record<string, [string, string]> = { ready: ["جاهز", "bg-primary/15 text-primary"], registered: ["مسجل — غير مفعّل", "bg-muted text-muted-foreground"], forbidden: ["ممنوع", "bg-destructive/10 text-destructive"] };
const SEC_ST: Record<string, string> = { wired: "مرتبط", pending: "بانتظار الربط", excluded: "مستثنى" };
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
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
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
        </>
      )}
    </div>
  );
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-2xl border bg-card p-4 shadow-sm"><h3 className="mb-3 text-sm font-bold">{title}</h3>{children}</section>;
const Stat = ({ l, v, hint }: { l: string; v: number | string; hint?: string }) => <div className="rounded-xl border bg-background p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 text-2xl font-bold">{v}</div>{hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}</div>;

function Overview({ r }: { r: Any }) {
  const ev: Any[] = r.events, ac: Any[] = r.actions, sec: Any[] = r.sections, g = r.gaps;
  const n = (a: Any[], f: (x: Any) => boolean) => a.filter(f).length;
  const gapCount = g.unregistered_sections.length + g.sections_without_events.length + g.events_bad_section.length + g.excluded_without_reason.length;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">لا توجد قاعدة تعمل دون اعتمادك وتفعيلك. المحرك يعمل ضمن الجدولة الحالية كل 15 دقيقة، والإرسال الخارجي غير مفعّل.</div>
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
  const rows = (r.events as Any[]).filter((e) => (!st || e.status === st) && (!area || e.area === area));
  return (
    <Card title={`الأحداث (${rows.length})`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className={selectCls()} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(EV_ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
        <select className={selectCls()} value={area} onChange={(e) => setArea(e.target.value)}><option value="">كل النطاقات</option><option value="school">المدارس</option><option value="central">الإدارة المركزية</option><option value="shared">مشترك</option></select>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground"><tr className="border-b text-start">{["الحدث", "القسم", "المصدر", "التوقيت", "الحساسية", "منع التكرار", "الأتمتة القائمة", "الحالة"].map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((e) => <tr key={e.code} className="border-b align-top last:border-0">
          <td className="p-2 font-semibold">{e.label}<div className="font-mono text-xs font-normal text-muted-foreground" dir="ltr">{e.code}</div></td>
          <td className="p-2">{secs[e.section]?.label ?? e.section}</td><td className="p-2 font-mono text-xs" dir="ltr">{e.source}</td><td className="p-2">{e.timing}</td>
          <td className="p-2">{SENS[e.sensitivity]}</td><td className="p-2 text-xs">{e.dedupe}</td><td className="p-2 text-xs">{e.existing ?? "—"}{e.note && <div className="text-muted-foreground">{e.note}</div>}</td>
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
        <p className="mt-3 text-xs text-muted-foreground">يُعاد التحقق من نشاط المستلم وفرعه ومجموعته لحظة التنفيذ؛ بقية المستلمين يُفعَّلون مع ربط أحداثهم.</p>
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
