import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { rpc } from "@/components/hr/shared";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { AppsList, ItemDetail, ItemForm, useEvtRefresh } from "@/components/events/item";
import { FormFields, missingRequired } from "@/components/events/form-render";
import { accountUploader } from "@/components/events/upload";
import { ItemFiles } from "@/components/events/files";
import { SectionForms } from "@/components/events/section-forms";
import {
  KIND, KIND_PLURAL, MODE, REG_STATE, StatusPill, AppPill, canAny, fmtDT, hasEvents, newClientKey, useEvtCaps,
  type Answers, type EvtRow, type Field, type Kind,
} from "@/components/events/shared";

type Tab = "summary" | "trip" | "general" | "course" | "apps" | "forms" | "reports" | "family";
const TABS: Tab[] = ["summary", "trip", "general", "course", "apps", "forms", "reports", "family"];
export const Route = createFileRoute("/_authenticated/app/events")({
  head: () => ({ meta: [{ title: "الفعاليات — ركاز" }, { name: "description", content: "الرحلات المدرسية والفعاليات العامة والدورات وطلبات التسجيل والحضور." }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined; item?: string | undefined; app?: string | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
    item: typeof s["item"] === "string" && s["item"] ? (s["item"] as string) : undefined,
    app: typeof s["app"] === "string" && s["app"] ? (s["app"] as string) : undefined,
  }),
  component: Page,
});

const sm = selectCls("", true);
const EVT_TAB_LABELS: Record<Tab, string> = { summary: "الملخص والتقويم", trip: "الرحلات المدرسية", general: "الفعاليات العامة", course: "الدورات", apps: "طلبات التسجيل", forms: "إعدادات النماذج", reports: "التقارير", family: "فعاليات أبنائي" };

function Page() {
  const { tab, item, app } = Route.useSearch();
  const nav = useNavigate({ from: "/app/events" });
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useEvtCaps(org);
  const [school, setSchool] = useState<string>("");
  const [creating, setCreating] = useState<Kind | null>(null);
  const [appStatus, setAppStatus] = useState("");
  const refreshEvt = useEvtRefresh();
  if (!active || !org) return <ForbiddenState />;
  if (caps.isLoading) return <LoadingState />;
  if (caps.error || !caps.data) return <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} />;
  const c = caps.data;
  const staff = hasEvents(c);
  const family = ["guardian", "student"].includes(active.role) || (!staff && c.family);
  if (!staff && !family) return <ForbiddenState />;
  const tabs = (family && !staff ? (["family"] as Tab[]) : ([
    "summary",
    ...(["trip", "general", "course"] as Kind[]).filter((k) => canAny(c, k, "view") || (k === "course" && c.delegated > 0)),
    ...(canAny(c, "course", "apps") || c.delegated > 0 ? (["apps"] as Tab[]) : []),
    ...(c.tpl_view ? (["forms"] as Tab[]) : []),
    ...(c.schools.some((s) => s.trip["export"] || s.general["export"] || s.course["export"]) ? (["reports"] as Tab[]) : []),
    ...(c.family ? (["family"] as Tab[]) : []),
  ] as Tab[]));
  const cur: Tab = tab && tabs.includes(tab) ? tab : tabs[0]!;
  // default branch: the active branch for principals; owners see all branches with a filter
  const branch = school || (c.owner ? "" : active.schoolId ?? "");
  const createSchool = branch || (c.schools.length === 1 ? c.schools[0]!.id : "");
  const canCreate = (k: Kind) => !!c.schools.find((s) => s.id === createSchool)?.[k]?.["create"];
  const kindTab = cur === "trip" || cur === "general" || cur === "course" ? (cur as Kind) : null;
  return (
    <div>
      <PageHeader eyebrow={family && !staff ? (active.role === "guardian" ? "ولي الأمر" : "الطالب") : `إدارة المدارس · ${c.owner ? active.orgName : active.schoolName}`} title="الفعاليات"
        desc={family && !staff ? "الرحلات والفعاليات الموجهة إليك وإلى أبنائك، والدورات المتاحة للتسجيل." : "الرحلات المدرسية والفعاليات العامة والدورات. الزيارات ما زالت في قسمها، ولقاءات أولياء الأمور في «الاجتماعات»."}
        action={staff && <div className="flex flex-wrap items-center gap-2">
          {c.schools.length > 1 && (
            <select aria-label="المدرسة" className={sm} value={branch} onChange={(e) => setSchool(e.target.value)}>
              {c.owner && <option value="">كل المدارس</option>}
              {c.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {kindTab && canCreate(kindTab) && <Button size="sm" onClick={() => setCreating(kindTab)}><CalendarPlus className="size-4" /> {kindTab === "course" ? "دورة جديدة" : kindTab === "trip" ? "رحلة جديدة" : "فعالية جديدة"}</Button>}
          {kindTab && !createSchool && <span className="text-xs text-muted-foreground">اختر مدرسة للإنشاء</span>}
        </div>} />
      {creating && createSchool && <ItemForm kind={creating} school={createSchool} onClose={() => setCreating(null)} onDone={(id) => { setCreating(null); refreshEvt(); nav({ search: { tab: creating, item: id } }); }} />}
      {item && <ItemDetail key={item} id={item} app={app} openApp={(a) => nav({ search: { tab: cur, item, app: a } })} onClose={() => nav({ search: { tab: cur } })} />}
      {tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {tabs.map((k) => <Button key={k} role="tab" aria-selected={cur === k} size="sm" variant={cur === k ? "default" : "outline"} onClick={() => nav({ search: { tab: k } })}>{EVT_TAB_LABELS[k]}</Button>)}
        </div>
      )}
      {cur === "summary" && <Summary org={org} school={branch || null} open={(r) => nav({ search: { tab: r.kind, item: r.id } })} />}
      {kindTab && <ItemList org={org} school={branch || null} kind={kindTab} open={(id) => nav({ search: { tab: kindTab, item: id } })} />}
      {cur === "apps" && !item && <AppsList org={org} school={branch || null} status={appStatus} setStatus={setAppStatus} showItem open={(id, it) => nav({ search: { tab: "apps", item: it, app: id } })} />}
      {cur === "forms" && <SectionForms org={org} />}
      {cur === "reports" && <Reports org={org} school={branch || null} schoolName={c.schools.find((s) => s.id === branch)?.name} />}
      {cur === "family" && <Family />}
      {staff && cur === "summary" && <p className="mt-6 text-sm text-muted-foreground">لقاءات أولياء الأمور تُنظَّم من <Link className="text-primary underline" to="/app/admin/meetings">الاجتماعات</Link>، وزيارات أولياء الأمور من <Link className="text-primary underline" to="/app/family-visits">الزيارات</Link>.</p>}
    </div>
  );
}

function useList(org: string, school: string | null, kind: Kind | null, status: string, q: string) {
  return useQuery({ queryKey: ["evt-list", org, school, kind, status, q], refetchInterval: 30_000, queryFn: () => rpc<EvtRow[]>("evt_list", { _org: org, _school: school, _kind: kind, _status: status || null, _q: q || null }) });
}

function Row({ r, open }: { r: EvtRow; open: (r: EvtRow) => void }) {
  return (
    <li><button type="button" onClick={() => open(r)} className="flex w-full flex-wrap items-center gap-2 p-3 text-start text-sm hover:bg-muted">
      <span className="font-medium">{r.title}</span>
      <span className="text-xs text-muted-foreground">{KIND[r.kind]} · {r.school}{r.first_at ? ` · ${fmtDT(r.first_at)}` : ""} · {MODE[r.mode]}</span>
      {r.kind === "course" && <span className="text-xs">طلبات {r.apps.total} · مقبول {r.apps.accepted}{r.capacity ? `/${r.capacity}` : ""}{r.apps.new ? ` · جديد ${r.apps.new}` : ""}</span>}
      {r.kind === "trip" && r.consents && <span className="text-xs">موافق {r.consents.approved} · رافض {r.consents.declined}</span>}
      <span className="ms-auto flex items-center gap-2">{r.kind === "course" && r.status === "published" && <span className="text-xs text-primary">{REG_STATE[r.reg_state]}</span>}<StatusPill s={r.status} /></span>
    </button>{r.kind === "course" && <LinkActions id={r.id} />}</li>
  );
}

function ItemList({ org, school, kind, open }: { org: string; school: string | null; kind: Kind; open: (id: string) => void }) {
  const [status, setStatus] = useState("active"); const [q, setQ] = useState("");
  const list = useList(org, school, kind, status, q.trim());
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="h-9 w-56" aria-label="بحث" placeholder="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="الحالة" className={sm} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">الحالية (مسودة ومنشورة)</option><option value="">الكل</option><option value="draft">مسودة</option><option value="published">منشورة</option>
          <option value="completed">مكتملة</option><option value="cancelled">ملغاة</option><option value="archived">مؤرشفة</option>
        </select>
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.length
        ? <EmptyState title={`لا توجد ${KIND_PLURAL[kind]}`} hint="أنشئ مسودة ثم انشرها عند الجاهزية." />
        : <ul className="divide-y rounded-xl border bg-card">{list.data.map((r) => <Row key={r.id} r={r} open={(x) => open(x.id)} />)}</ul>}
    </div>
  );
}

type CalRow = { item_id: string; kind: Kind; title: string; status: string; school: string; starts_at: string; ends_at: string | null; session: string | null };
const riyadhDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

function Summary({ org, school, open }: { org: string; school: string | null; open: (r: { id: string; kind: Kind }) => void }) {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const all = useList(org, school, null, "", "");
  const cal = useQuery({ queryKey: ["evt-cal", org, school, month], queryFn: () => rpc<CalRow[]>("evt_calendar", { _org: org, _school: school, _from: first, _to: last }) });
  const byDay = useMemo(() => { const m = new Map<string, CalRow[]>(); for (const r of cal.data ?? []) { const d = riyadhDay(r.starts_at); m.set(d, [...(m.get(d) ?? []), r]); } return m; }, [cal.data]);
  const shift = (n: number) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const lead = (new Date(first + "T00:00:00Z").getUTCDay() + 1) % 7; // week starts Saturday
  const days = Number(last.slice(8, 10));
  const rows = all.data ?? [];
  const k = (kind: Kind) => rows.filter((r) => r.kind === kind && ["draft", "published"].includes(r.status));
  const pending = rows.filter((r) => r.kind === "course").reduce((s, r) => s + r.apps.new + r.apps.review + r.apps.info_needed, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {(["trip", "general", "course"] as Kind[]).map((kind) => <Stat key={kind} label={KIND_PLURAL[kind]} v={k(kind).length} sub={`${k(kind).filter((r) => r.status === "published").length} منشورة`} />)}
        <Stat label="طلبات بانتظار القرار" v={pending} sub="جديد + قيد المراجعة + استكمال" />
      </div>
      <div className="rounded-2xl border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <Button size="icon" variant="ghost" aria-label="الشهر السابق" onClick={() => shift(-1)}><ChevronRight className="size-4" /></Button>
          <b className="flex-1 text-center">{new Date(first + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" })}</b>
          <Button size="icon" variant="ghost" aria-label="الشهر التالي" onClick={() => shift(1)}><ChevronLeft className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"].map((d) => <div key={d} className="py-1 font-semibold text-muted-foreground">{d}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = `${month}-${String(i + 1).padStart(2, "0")}`; const ev = byDay.get(d) ?? [];
            return (
              <div key={d} className={`min-h-16 rounded-lg border p-1 text-start ${d === today ? "border-primary" : ""}`}>
                <span className="text-[11px] text-muted-foreground">{i + 1}</span>
                {ev.slice(0, 3).map((e, j) => <button key={j} type="button" onClick={() => open({ id: e.item_id, kind: e.kind })} className={`mt-0.5 block w-full truncate rounded px-1 text-start text-[11px] ${e.kind === "trip" ? "bg-primary/15" : e.kind === "course" ? "bg-success/15" : "bg-warning/20"}`} title={e.title}>{e.title}</button>)}
                {ev.length > 3 && <span className="text-[10px]">+{ev.length - 3}</span>}
              </div>
            );
          })}
        </div>
        {cal.error && <p className="mt-2 text-sm text-destructive">{arabicError(cal.error)}</p>}
      </div>
    </div>
  );
}
function Stat({ label, v, sub }: { label: string; v: number; sub: string }) { return <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{v}</p><p className="text-xs text-muted-foreground">{sub}</p></div>; }

type Rep = EvtRow & { att: { present: number; marked: number } };
function Reports({ org, school, schoolName }: { org: string; school: string | null; schoolName?: string | undefined }) {
  const [kind, setKind] = useState<"" | Kind>("");
  const q = useQuery({ queryKey: ["evt-report", org, school, kind], queryFn: () => rpc<Rep[]>("evt_report", { _org: org, _school: school, _kind: kind || null }) });
  const rows = q.data ?? [];
  const head = ["الاسم", "النوع", "المدرسة", "الحالة", "أول موعد", "الطلبات", "مقبول", "مرفوض", "قيد الانتظار", "السعة", "المقاعد المتبقية", "موافقات الرحلة", "نسبة الحضور"];
  const body = rows.map((r) => [r.title, KIND[r.kind], r.school, r.status, r.first_at ? fmtDT(r.first_at) : "", r.apps.total, r.apps.accepted, r.apps.rejected, r.apps.new + r.apps.review + r.apps.info_needed,
    r.capacity ?? "", r.capacity ? Math.max(0, r.capacity - r.apps.accepted) : "", r.consents ? `${r.consents.approved} موافق / ${r.consents.declined} رافض` : "", r.att.marked ? `${Math.round((100 * r.att.present) / r.att.marked)}%` : "—"]);
  const meta = { title: "تقرير الفعاليات والدورات", school: schoolName ?? "كل المدارس", filters: kind ? [KIND[kind]] : [], note: "تقرير إجمالي بلا بيانات شخصية." };
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select aria-label="النوع" className={sm} value={kind} onChange={(e) => setKind(e.target.value as "" | Kind)}><option value="">كل الأنواع</option>{(Object.keys(KIND) as Kind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
        <span className="ms-auto flex gap-1"><Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exportXlsx(meta, head, body)}>Excel</Button><Button size="sm" variant="outline" disabled={!rows.length} onClick={() => void exportPdf(meta, head, body)}>PDF</Button><Button size="sm" variant="outline" disabled={!rows.length} onClick={() => printReport(meta, head, body)}>طباعة</Button></span>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !rows.length ? <EmptyState title="لا توجد بيانات" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted text-xs"><tr>{head.map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{body.map((r, i) => <tr key={i} className="border-t">{r.map((v, j) => <td key={j} className="p-2">{j === 3 ? <StatusPill s={String(v)} /> : String(v)}</td>)}</tr>)}</tbody></table></div>
      )}
    </div>
  );
}

// ---------------- guardian / student ----------------
type Fam = { guardian: boolean; children: { id: string; name: string; school: string }[];
  events: { id: string; kind: Kind; title: string; description: string | null; status: string; location: string | null; school: string; student_id: string; student: string; cancel_reason: string | null; conditions: string | null;
    consent_required: boolean; consent_deadline: string | null; need_emergency: boolean; need_medical: boolean; sessions: { starts_at: string; ends_at: string | null; title: string | null }[];
    consent: { decision: string; at: string; emergency_name: string | null; emergency_phone: string | null; medical_ack: boolean; medical_note: string | null } | null }[];
  courses: { id: string; title: string; description: string | null; school: string; category: string | null; location: string | null; mode: string; trainer: string | null; conditions: string | null; reg_closes: string | null; capacity: number | null; sessions: { starts_at: string }[] }[];
  apps: { id: string; ref: string; item: string; student: string; status: string; message: string | null; created_at: string }[] };

function Family() {
  const q = useQuery({ queryKey: ["evt-family"], refetchInterval: 30_000, queryFn: () => rpc<Fam>("evt_family", {}) });
  const [apply, setApply] = useState<string | null>(null);
  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const f = q.data;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-lg font-bold">الرحلات والفعاليات</h2>
        {!f.events.length ? <EmptyState title="لا توجد رحلات أو فعاليات موجهة حاليًا" /> : <ul className="space-y-3">{f.events.map((e) => <FamilyEvent key={`${e.id}-${e.student_id}`} e={e} guardian={f.guardian} onDone={() => q.refetch()} />)}</ul>}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-bold">دورات متاحة للتسجيل</h2>
        {!f.courses.length ? <EmptyState title="لا توجد دورات مفتوحة للتسجيل" /> : (
          <ul className="space-y-3">{f.courses.map((c) => (
            <li key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2"><b>{c.title}</b><span className="text-xs text-muted-foreground">{c.school}{c.category ? ` · ${c.category}` : ""} · {MODE[c.mode]}{c.trainer ? ` · ${c.trainer}` : ""}</span>
                <Button size="sm" className="ms-auto" onClick={() => setApply(apply === c.id ? null : c.id)}>{apply === c.id ? "إغلاق" : "تسجيل"}</Button></div>
              {c.description && <p className="mt-1 text-sm">{c.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{c.sessions[0] ? `يبدأ ${fmtDT(c.sessions[0].starts_at)}` : ""}{c.reg_closes ? ` · آخر موعد للتسجيل ${fmtDT(c.reg_closes)}` : ""}</p>
              {apply === c.id && <ApplyForm item={c.id} kids={f.children} conditions={c.conditions} onDone={() => { setApply(null); void q.refetch(); }} />}
            </li>
          ))}</ul>
        )}
      </section>
      {f.apps.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">طلبات التسجيل</h2>
          <ul className="divide-y rounded-xl border bg-card text-sm">{f.apps.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 p-3"><b>{a.item}</b><span>{a.student}</span><span dir="ltr" className="text-xs text-muted-foreground">{a.ref}</span>
              {a.message && <span className="text-xs">{a.message}</span>}<span className="ms-auto"><AppPill s={a.status} /></span></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}

function FamilyEvent({ e, guardian, onDone }: { e: Fam["events"][number]; guardian: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({ emergency_name: e.consent?.emergency_name ?? "", emergency_phone: e.consent?.emergency_phone ?? "", medical_ack: e.consent?.medical_ack ?? false, medical_note: e.consent?.medical_note ?? "" });
  const late = !!e.consent_deadline && Date.now() > Date.parse(e.consent_deadline);
  const save = useMutation({ mutationFn: (decision: string) => rpc("evt_consent", { _item: e.id, _student: e.student_id, _decision: decision, _p: p }),
    onSuccess: () => { toast.success("سُجّل ردك"); setOpen(false); onDone(); }, onError: (x) => toast.error(arabicError(x)) });
  const canAnswer = guardian && e.kind === "trip" && e.consent_required && e.status === "published" && !late;
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><b>{e.title}</b><span className="text-xs text-muted-foreground">{KIND[e.kind]} · {e.school} · للطالب: {e.student}</span><span className="ms-auto"><StatusPill s={e.status} /></span></div>
      {e.sessions.length > 0 && <p className="mt-1 text-sm">{e.sessions.map((s) => fmtDT(s.starts_at)).join(" · ")}{e.location ? ` — ${e.location}` : ""}</p>}
      {e.description && <p className="mt-1 whitespace-pre-wrap text-sm">{e.description}</p>}
      <div className="mt-2"><ItemFiles item={e.id} canEdit={false} /></div>
      {e.conditions && <p className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{e.conditions}</p>}
      {e.status === "cancelled" && <p className="mt-1 text-sm text-destructive">أُلغيت{e.cancel_reason ? `: ${e.cancel_reason}` : ""}</p>}
      {e.kind === "trip" && e.consent_required && (
        <div className="mt-2 text-sm">
          <p>ردك: <b className={e.consent?.decision === "approved" ? "text-success" : e.consent?.decision === "declined" ? "text-destructive" : ""}>{e.consent ? (e.consent.decision === "approved" ? "موافق" : "غير موافق") : "لم ترد بعد"}</b>
            {e.consent_deadline && <span className="text-xs text-muted-foreground"> · آخر موعد {fmtDT(e.consent_deadline)}{late ? " (انتهى)" : ""}</span>}</p>
          {canAnswer && !open && <Button size="sm" className="mt-2" onClick={() => setOpen(true)}>{e.consent ? "تعديل الرد" : "الرد على الرحلة"}</Button>}
          {canAnswer && open && (
            <div className="mt-2 grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
              {e.need_emergency && <>
                <div className="space-y-1"><Label htmlFor={`en-${e.id}`}>اسم للتواصل في الطوارئ</Label><Input id={`en-${e.id}`} value={p.emergency_name} onChange={(x) => setP({ ...p, emergency_name: x.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor={`ep-${e.id}`}>جوال الطوارئ</Label><Input id={`ep-${e.id}`} dir="ltr" inputMode="tel" value={p.emergency_phone} onChange={(x) => setP({ ...p, emergency_phone: x.target.value })} /></div>
              </>}
              {e.need_medical && <>
                <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={p.medical_ack} onChange={(x) => setP({ ...p, medical_ack: x.target.checked })} /> أقر بأن ابني لائق صحيًا للمشاركة، وأبلغت المدرسة بأي حالة صحية</label>
                <div className="space-y-1 sm:col-span-2"><Label htmlFor={`mn-${e.id}`}>ملاحظات صحية (اختياري)</Label><Textarea id={`mn-${e.id}`} value={p.medical_note} onChange={(x) => setP({ ...p, medical_note: x.target.value })} /></div>
              </>}
              <div className="flex gap-2 sm:col-span-2"><Button size="sm" disabled={save.isPending} onClick={() => save.mutate("approved")}>موافق</Button><Button size="sm" variant="destructive" disabled={save.isPending} onClick={() => save.mutate("declined")}>غير موافق</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button></div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ApplyForm({ item, kids, conditions, onDone }: { item: string; kids: Fam["children"]; conditions: string | null; onDone: () => void }) {
  const refresh = useEvtRefresh();
  const form = useQuery({ queryKey: ["evt-apply-form", item], queryFn: () => rpc<{ version: number; fields: Field[] }>("evt_apply_form", { _item: item }) });
  const [student, setStudent] = useState(kids.length === 1 ? kids[0]!.id : "");
  const [ans, setAns] = useState<Answers>({});
  const [key] = useState(newClientKey);
  const [ov, setOv] = useState<{ version: number; fields: Field[] } | null>(null);
  const cur = ov ?? form.data;
  const send = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error("اختر الطالب");
      const m = missingRequired(cur!.fields, ans); if (m) throw new Error(`الحقل «${m}» مطلوب`);
      return rpc<Record<string, unknown>>("evt_apply", { _item: item, _student: student, _version: cur!.version, _answers: ans, _client_key: key });
    },
    onSuccess: (r) => {
      if (r["ok"]) { toast.success(`تم استلام طلبك ${String(r["ref"])}`); refresh(); onDone(); return; }
      if (r["error"] === "version") { setOv({ version: Number(r["version"]), fields: r["fields"] as Field[] }); toast.error("تحدّث النموذج أثناء التعبئة؛ أبقينا إجاباتك. راجعها ثم أرسل."); return; }
      toast.error(r["error"] === "duplicate" ? "يوجد طلب سابق لهذا الطالب في الدورة" : "التسجيل غير متاح الآن");
    },
    onError: (e) => toast.error(arabicError(e)),
  });
  if (form.isLoading) return <LoadingState />;
  if (form.error || !cur) return <ErrorState message={arabicError(form.error)} />;
  return (
    <form className="mt-3 space-y-3 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
      <div className="space-y-1"><Label htmlFor={`st-${item}`}>الطالب</Label>
        <select id={`st-${item}`} className={selectCls("w-full")} value={student} onChange={(e) => setStudent(e.target.value)}><option value="">اختر…</option>{kids.map((k) => <option key={k.id} value={k.id}>{k.name} — {k.school}</option>)}</select></div>
      {conditions && <p className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{conditions}</p>}
      <FormFields fields={cur.fields} value={ans} onChange={setAns} disabled={send.isPending} upload={accountUploader(item, key)} />
      <Button type="submit" disabled={send.isPending}>{send.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button>
    </form>
  );
}


/** «نسخ رابط التسجيل» / «معاينة صفحة التسجيل» in the course list (the token is returned only to link/publish holders). */
function LinkActions({ id }: { id: string }) {
  const get = async () => {
    let it = await rpc<{ token: string | null }>("evt_get", { _id: id });
    if (!it.token) { await supabase.auth.refreshSession().catch(() => null); it = await rpc<{ token: string | null }>("evt_get", { _id: id }); }
    if (!it.token) { toast.error("ليست لديك صلاحية رابط التسجيل لهذه الدورة"); return null; }
    return `${window.location.origin}/join/${it.token}`;
  };
  return (
    <span className="flex flex-wrap gap-1 px-3 pb-2">
      <Button size="sm" variant="ghost" onClick={async () => { const u = await get().catch((e) => { toast.error(arabicError(e)); return null; }); if (u) { void navigator.clipboard.writeText(u); toast.success("نُسخ رابط التسجيل"); } }}>نسخ رابط التسجيل</Button>
      <Button size="sm" variant="ghost" onClick={async () => { const w = window.open("", "_blank"); const u = await get().catch(() => null); if (u && w) w.location.href = u; else w?.close(); }}>معاينة صفحة التسجيل</Button>
    </span>
  );
}
