import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, Download, FileText, Plus, Printer, Search } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { REC_STATUS, riyadhText, type SvMe, type SvSearch } from "./model";
import { calendarDays, EXECUTION, PLAN_KIND, riyadhDay, VISIT_STATE, type Plan, type Visit } from "./work-model";
import { PlanEditor } from "./work-plan";
import { VisitEditor, VisitDetail } from "./work-visit";

export function PlansVisits({ org, me, sp, go }: { org: string; me: SvMe; sp: SvSearch; go: (s: SvSearch, replace?: boolean) => void }) {
  const plans = useQuery({ queryKey: ["sv3-plans", org], retry: false, queryFn: async () => { const r = await db.rpc("sv3_plan_list", { _org: org }); if (r.error) throw r.error; return r.data as Plan[]; } });
  const visits = useQuery({ queryKey: ["sv3-visits", org], retry: false, queryFn: async () => { const r = await db.rpc("sv3_visit_list", { _org: org }); if (r.error) throw r.error; return r.data as Visit[]; } });
  const [creating, setCreating] = useState(false); const [school, setSchool] = useState(""); const [search, setSearch] = useState(""); const [state, setState] = useState(""); const [calendar, setCalendar] = useState<"list" | "week" | "month">("list"); const [date, setDate] = useState(riyadhDay(me.now));
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [kind, setKind] = useState("");
  const view = sp.view ?? "plans"; const all = view === "plans" ? plans.data ?? [] : visits.data ?? [];
  const filtered = all.filter((r) => (!school || r.school_id === school) && (!state || ("status" in r ? r.status : r.state) === state) && (!kind || r.kind === kind) && (!search || JSON.stringify([r.school, "purpose" in r ? r.purpose : r.title, "teacher" in r ? r.teacher : "", "course" in r ? r.course : "", r.author]).includes(search)) && (!("starts_at" in r) || ((!from || riyadhDay(r.starts_at) >= from) && (!to || riyadhDay(r.starts_at) <= to))));
  const canCreate = me.owner || me.schools.some((s) => s.supervisor || s.principal);
  const refresh = () => { setCreating(false); void plans.refetch(); void visits.refetch(); };
  const select = (id?: string) => go({ tab: "work", view, ...(id ? { id } : {}) }, false);
  if (sp.id && view === "visits") return <VisitDetail id={sp.id} org={org} me={me} onBack={() => select()} onDocument={(id) => go({ tab: "records", id }, false)} />;
  const selected = plans.data?.find((p) => p.id === sp.id);
  if ((creating || sp.id) && view === "plans") return <PlanEditor org={org} me={me} plan={selected} plans={plans.data ?? []} onDone={(id) => { refresh(); select(id); }} onDocument={(id) => go({ tab: "records", id }, false)} />;
  if (creating && view === "visits") return <VisitEditor me={me} plans={plans.data ?? []} onDone={(id) => { refresh(); select(id); }} />;
  const q = view === "plans" ? plans : visits;
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const report = () => ({ meta: { title: view === "plans" ? "كشف الخطط الإشرافية" : "كشف الزيارات الإشرافية", school: me.schools.find((s) => s.id === school)?.name, filters: [search, state, kind, from, to].filter(Boolean) }, headers: ["الفرع", "العمل", "النوع", "الحالة", "الموعد", "المعد", "التنفيذ / التوثيق"], rows: filtered.map((r) => "status" in r ? [r.school, r.title, PLAN_KIND[r.kind], REC_STATUS[r.status], String(r.data["period_from"] ?? "—"), r.author, EXECUTION[r.execution] ?? r.execution] : [r.school, r.purpose, r.kind === "peer" ? "تبادلية" : "صفية", VISIT_STATE[r.state], riyadhText(r.starts_at), r.author, r.documentation_status ? REC_STATUS[r.documentation_status as keyof typeof REC_STATUS] : "لم يبدأ التوثيق"]) });
  return <div className="space-y-4">
    <nav aria-label="الخطط والزيارات" className="flex gap-2 border-b pb-3">{(["plans", "visits"] as const).map((v) => <Button key={v} variant={view === v ? "default" : "ghost"} onClick={() => { setState(""); setKind(""); go({ tab: "work", view: v }); }}>{v === "plans" ? <ClipboardList /> : <CalendarDays />}{v === "plans" ? "الخطط" : "الزيارات"}</Button>)}</nav>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => { go({ tab: "work", view: "visits" }); setFrom(riyadhDay(me.now)); setTo(riyadhDay(me.now)); }}>أعمال اليوم ({(visits.data ?? []).filter((v) => riyadhDay(v.starts_at) === riyadhDay(me.now) && v.state !== "cancelled").length})</Button>
      <Button variant="outline" onClick={() => setState("submitted")}>المراجعات المنتظرة ({(plans.data ?? []).filter((p) => p.status === "submitted").length + (visits.data ?? []).filter((v) => v.documentation_status === "submitted").length})</Button>
      {canCreate && <Button className="ms-auto" onClick={() => setCreating(true)}><Plus />{view === "plans" ? "خطة جديدة" : "جدولة زيارة"}</Button>}
    </div>
    <div className="flex flex-wrap items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input className="w-full sm:w-60" aria-label="بحث الخطط والزيارات" placeholder="بحث بالمعلم أو المقرر أو العنوان" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select className={selectCls()} aria-label="تصفية الفرع" value={school} onChange={(e) => setSchool(e.target.value)}><option value="">كل الفروع المتاحة</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className={selectCls()} aria-label="تصفية الحالة" value={state} onChange={(e) => setState(e.target.value)}><option value="">كل الحالات</option>{Object.entries(view === "plans" ? REC_STATUS : VISIT_STATE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select className={selectCls()} aria-label="تصفية النوع" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الأنواع</option>{Object.entries(view === "plans" ? PLAN_KIND : { classroom: "صفية", peer: "تبادلية" }).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {view === "visits" && <><Input type="date" className="w-40" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} /><Input type="date" className="w-40" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} /></>}
      <Button variant="ghost" size="icon" title="Excel" aria-label="تصدير Excel" onClick={() => { const r = report(); exportXlsx(r.meta, r.headers, r.rows); }}><Download /></Button><Button variant="ghost" size="icon" title="PDF" aria-label="تصدير PDF" onClick={() => { const r = report(); void exportPdf(r.meta, r.headers, r.rows); }}><FileText /></Button><Button variant="ghost" size="icon" title="طباعة" aria-label="طباعة التقرير" onClick={() => { const r = report(); printReport(r.meta, r.headers, r.rows); }}><Printer /></Button>
    </div>
    {view === "visits" && <div className="flex flex-wrap gap-2">{(["list", "week", "month"] as const).map((v) => <Button size="sm" key={v} variant={calendar === v ? "secondary" : "ghost"} onClick={() => setCalendar(v)}>{v === "list" ? "قائمة" : v === "week" ? "أسبوع" : "شهر"}</Button>)}{calendar !== "list" && <Input type="date" className="w-40" aria-label="تاريخ التقويم" value={date} onChange={(e) => setDate(e.target.value)} />}</div>}
    {!filtered.length ? <EmptyState title={view === "plans" ? "لا خطط في هذا النطاق" : "لا زيارات في هذا النطاق"} /> : calendar !== "list" && view === "visits" ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">{calendarDays(date, calendar).map((d) => <div key={d} className="min-h-28 border-t p-2"><p className="mb-2 text-xs font-bold">{d}</p>{(filtered as Visit[]).filter((v) => riyadhDay(v.starts_at) === d).map((v) => <Button key={v.id} variant="outline" className="mb-1 h-auto w-full justify-start whitespace-normal py-2 text-start" onClick={() => select(v.id)}>{v.teacher}<br />{v.purpose}</Button>)}</div>)}</div> : <ul className="grid gap-3 md:grid-cols-2">{filtered.map((r) => <li className="rounded-lg border bg-card p-4" key={r.id}>
      <div className="flex items-start justify-between gap-2"><h3 className="font-bold break-words">{"purpose" in r ? r.purpose : r.title}</h3><span className="shrink-0 text-xs text-muted-foreground">{"status" in r ? REC_STATUS[r.status] : VISIT_STATE[r.state]}</span></div>
      <p className="mt-1 text-sm text-muted-foreground">{r.school} · {"status" in r ? PLAN_KIND[r.kind] : r.teacher}</p>
      <p className="mt-1 text-xs">{"status" in r ? `التنفيذ: ${EXECUTION[r.execution] ?? r.execution}` : `${riyadhText(r.starts_at)} · ${r.timetable_verified ? "الحصة مطابقة للجدول" : "تعارض الجدول المدرسي غير متحقق"}`}</p>
      <Button className="mt-3" variant="outline" size="sm" onClick={() => select(r.id)}>فتح التفاصيل</Button>
    </li>)}</ul>}
  </div>;
}