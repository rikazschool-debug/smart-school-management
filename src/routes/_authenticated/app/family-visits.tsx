import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { addDays, dayName, riyadhToday, weekStartOf } from "@/components/admin/shared";
import { askText } from "@/components/confirm";
import { PeoplePicker } from "@/components/people-picker";
import { DAYS, EVENT, REASONS, SOURCE, STATUS, SlotPicker, StatusPill, awaitingText, type Caps, type Visit, type VisitDetail } from "@/components/family-visits/shared";

type Tab = "calendar" | "mine" | "school" | "reception" | "settings";
const TABS: Tab[] = ["calendar", "mine", "school", "reception", "settings"];
export const Route = createFileRoute("/_authenticated/app/family-visits")({
  head: () => ({ meta: [{ title: "زيارات أولياء الأمور — ركاز" }, { name: "description", content: "استدعاء أولياء الأمور وطلبات الزيارة والتقويم والاستقبال وسجل الزيارات." }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; v?: string } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
    v: typeof s["v"] === "string" && s["v"] ? (s["v"] as string) : undefined,
  }),
  component: Page,
});

const POLL = 15_000;
const sm = selectCls("", true);

function Page() {
  const { tab = "calendar", v } = Route.useSearch();
  const nav = useNavigate({ from: "/app/family-visits" });
  const { active } = useSession();
  const school = active?.schoolId ?? null;
  const isGuardian = active?.role === "guardian";
  const caps = useQuery({ queryKey: ["gv-caps", school], enabled: !!active, refetchInterval: 60_000, queryFn: () => rpc<Caps>("gv_caps", { _school: school }) });
  const [form, setForm] = useState<"" | "call" | "request">("");
  if (!active || active.role === "student") return <ForbiddenState />;
  if (caps.isLoading) return <LoadingState />;
  if (caps.error || !caps.data) return <ErrorState message={arabicError(caps.error)} />;
  const c = caps.data;
  const tabs: [Tab, string][] = [["calendar", "تقويمي"], ["mine", isGuardian ? "زياراتي" : "زياراتي ومقابلاتي"],
    ...(c.view ? [["school", "زيارات المدرسة"] as [Tab, string]] : []), ...(c.reception ? [["reception", "استقبال اليوم"] as [Tab, string]] : []),
    ...(c.settings ? [["settings", "المواعيد والإغلاق"] as [Tab, string]] : [])];
  const cur = tabs.some(([k]) => k === tab) ? tab : "calendar";
  return (
    <div>
      <PageHeader eyebrow={isGuardian ? "ولي الأمر" : `إدارة المدارس · ${active.schoolName}`} title="الزيارات"
        desc={isGuardian ? "اطلب زيارة للمدرسة لأحد أبنائك، وتابع الاستدعاءات والمواعيد المؤكدة." : "استدعاء أولياء الأمور، والرد على طلبات الزيارة، واستقبال الزوار. كل إجراء يتحقق منه الخادم."}
        action={<div className="flex flex-wrap gap-2">
          {c.guardian && <Button size="sm" onClick={() => setForm(form === "request" ? "" : "request")}><CalendarPlus className="size-4" /> طلب زيارة</Button>}
          {c.manage && school && <Button size="sm" variant={c.guardian ? "outline" : "default"} onClick={() => setForm(form === "call" ? "" : "call")}><UserPlus className="size-4" /> استدعاء ولي أمر</Button>}
        </div>} />
      {form === "request" && <RequestForm onDone={(id) => { setForm(""); nav({ search: { tab: "mine", v: id } }); }} onClose={() => setForm("")} />}
      {form === "call" && school && <CallForm school={school} onDone={(id) => { setForm(""); nav({ search: { tab: "school", v: id } }); }} onClose={() => setForm("")} />}
      {v && <Detail id={v} onClose={() => nav({ search: { tab: cur } })} />}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map(([k, l]) => <Button key={k} role="tab" aria-selected={cur === k} size="sm" variant={cur === k ? "default" : "outline"} onClick={() => nav({ search: { tab: k } })}>{l}</Button>)}
      </div>
      {cur === "calendar" && <CalendarTab open={(id) => nav({ search: { tab: cur, v: id } })} />}
      {cur === "mine" && <ListTab view="mine" school={school} open={(id) => nav({ search: { tab: cur, v: id } })} />}
      {cur === "school" && school && <ListTab view="school" school={school} open={(id) => nav({ search: { tab: cur, v: id } })} />}
      {cur === "reception" && school && <ReceptionTab school={school} open={(id) => nav({ search: { tab: cur, v: id } })} />}
      {cur === "settings" && school && <SettingsTab school={school} />}
    </div>
  );
}

function useRefreshAll() {
  const qc = useQueryClient();
  return () => { for (const k of ["gv-list", "gv-get", "gv-slots", "gv-caps", "notifications"]) void qc.invalidateQueries({ queryKey: [k] }); };
}

function Row({ r, open, side }: { r: Visit; open: (id: string) => void; side: "guardian" | "school" | null }) {
  const aw = awaitingText(r, side);
  return (
    <li>
      <button type="button" onClick={() => open(r.id)} className="flex w-full flex-wrap items-center gap-2 p-3 text-start text-sm hover:bg-muted">
        <span className="font-medium">{r.student}</span>
        <span className="text-xs text-muted-foreground">{r.guardian} · {r.school}</span>
        <span className="text-xs">{dayName(r.slot_date)} {r.slot_date} — {r.slot_time}</span>
        {r.reason_cat && <span className="text-xs text-muted-foreground">{REASONS[r.reason_cat]}</span>}
        <span className="ms-auto flex items-center gap-2">{aw && <span className="text-xs text-primary">{aw}</span>}<StatusPill s={r.status} /></span>
      </button>
    </li>
  );
}

function ListTab({ view, school, open }: { view: "mine" | "school"; school: string | null; open: (id: string) => void }) {
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { active } = useSession();
  const list = useQuery({
    queryKey: ["gv-list", view, school, dq, status], refetchInterval: POLL,
    queryFn: () => rpc<Visit[]>("gv_list", { _school: school, _view: view, _q: dq || null, _status: status || null, _from: null, _to: null }),
  });
  const side = view === "school" ? "school" : active?.role === "guardian" ? "guardian" : null;
  return (
    <div>
      {view === "school" && (
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative"><Search className="absolute end-2 top-2.5 size-4 text-muted-foreground" /><Input className="h-9 w-56" placeholder="اسم الطالب أو ولي الأمر" aria-label="بحث" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select aria-label="الحالة" className={sm} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option><option value="awaiting_school">بانتظار رد المدرسة</option>
            {["pending", "proposed", "confirmed", "rejected", "cancelled", "arrived", "no_show", "completed"].map((s) => <option key={s} value={s}>{STATUS_TXT[s]}</option>)}
          </select>
        </div>
      )}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data?.length
        ? <EmptyState title="لا توجد زيارات" hint={view === "mine" ? "تظهر هنا الاستدعاءات وطلباتك والمقابلات المسندة إليك." : undefined} />
        : <ul className="divide-y rounded-xl border bg-card">{list.data.map((r) => <Row key={r.id} r={r} open={open} side={side} />)}</ul>}
    </div>
  );
}

const STATUS_TXT = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v[0]])) as Record<string, string>;

function CalendarTab({ open }: { open: (id: string) => void }) {
  const today = riyadhToday();
  const [anchor, setAnchor] = useState(weekStartOf(today));
  const to = addDays(anchor, 27);
  const q = useQuery({ queryKey: ["gv-list", "calendar", anchor], refetchInterval: POLL, queryFn: () => rpc<(Visit & { day: string; at: string; role: string })[]>("gv_list", { _school: null, _view: "calendar", _q: null, _status: null, _from: anchor, _to: to }) });
  const items = q.data ?? [];
  const days = [...new Set(items.map((r) => r.day))].sort();
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, -28))}>السابق</Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(weekStartOf(today))}>اليوم</Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(addDays(anchor, 28))}>التالي</Button>
        <span className="text-sm font-medium">{anchor} — {to}</span>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !items.length
        ? <EmptyState title="لا زيارات مؤكدة في هذه الفترة" hint="تظهر هنا تلقائيًا كل زيارة مؤكدة تخصك، ويتحدث التقويم عند تغيير موعدها أو إلغائها." />
        : <div className="space-y-3">{days.map((d) => (
          <section key={d} className={`rounded-xl border bg-card p-3 ${d === today ? "border-primary" : ""}`}>
            <h2 className="mb-2 font-semibold">{dayName(d)} {d}{d === today ? " — اليوم" : ""}</h2>
            <ul className="space-y-1">{items.filter((r) => r.day === d).map((r) => (
              <li key={r.id}><button type="button" onClick={() => open(r.id)} className="flex w-full flex-wrap items-center gap-2 rounded-md p-2 text-start text-sm hover:bg-muted">
                <span className="font-mono">{r.at}</span><span className="font-medium">{r.student}</span>
                <span className="text-xs text-muted-foreground">{r.role === "guardian" ? `${r.school}${r.host ? ` · يقابلك ${r.host}` : ""}` : `ولي الأمر: ${r.guardian}`}</span>
                <span className="ms-auto flex items-center gap-2">{r.status === "proposed" && <span className="text-xs text-primary">تعديل مقترح بانتظار الاعتماد</span>}<StatusPill s={r.status} /></span>
              </button></li>
            ))}</ul>
          </section>
        ))}</div>}
    </div>
  );
}

function ReceptionTab({ school, open }: { school: string; open: (id: string) => void }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const refresh = useRefreshAll();
  const list = useQuery({ queryKey: ["gv-list", "reception", school, dq], refetchInterval: POLL, queryFn: () => rpc<Visit[]>("gv_list", { _school: school, _view: "reception", _q: dq || null, _status: null, _from: null, _to: null }) });
  const act = useMutation({
    mutationFn: (p: { id: string; rev: number; a: string }) => rpc("gv_act", { _id: p.id, _action: p.a, _rev: p.rev, _p: {} }),
    onSuccess: () => { toast.success("تم التسجيل"); refresh(); }, onError: (e) => { toast.error(arabicError(e)); refresh(); },
  });
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">زيارات اليوم المؤكدة فقط ({riyadhToday()}). سبب الزيارة وتفاصيلها لا تظهر هنا.</p>
      <div className="relative mb-3 w-64"><Search className="absolute end-2 top-2.5 size-4 text-muted-foreground" /><Input className="h-9" placeholder="الاسم أو الجوال أو آخر أرقام الهوية" aria-label="بحث في زيارات اليوم" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data?.length ? <EmptyState title="لا زيارات مؤكدة اليوم" /> : (
        <ul className="divide-y rounded-xl border bg-card">{list.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="font-mono">{r.slot_time}</span>
            <button type="button" className="font-medium hover:underline" onClick={() => open(r.id)}>{r.guardian}</button>
            <span className="text-xs text-muted-foreground">ولي أمر {r.student}{r.section ? ` (${r.section})` : ""}{r.guardian_id_tail ? ` · الهوية تنتهي بـ ${r.guardian_id_tail}` : ""}{r.guardian_phone ? ` · ${r.guardian_phone}` : ""}{r.host ? ` · يقابله ${r.host}` : ""}</span>
            <span className="ms-auto flex flex-wrap items-center gap-2">
              <StatusPill s={r.status} />
              {r.status === "confirmed" && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, rev: r.rev, a: "arrive" })}>تسجيل الوصول</Button>}
              {r.status === "confirmed" && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, rev: r.rev, a: "no_show" })}>لم يحضر</Button>}
              {r.status === "arrived" && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, rev: r.rev, a: "depart" })}>تسجيل المغادرة</Button>}
              {r.arrived_at && <span className="text-xs text-muted-foreground">وصل {new Date(r.arrived_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })}</span>}
              {r.left_at && <span className="text-xs text-muted-foreground">غادر {new Date(r.left_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })}</span>}
            </span>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const refresh = useRefreshAll();
  const q = useQuery({ queryKey: ["gv-get", id], refetchInterval: POLL, retry: false, queryFn: () => rpc<VisitDetail>("gv_get", { _id: id }) });
  const [mode, setMode] = useState<"" | "propose" | "confirm" | "host">("");
  const [slot, setSlot] = useState<{ d: string; t: string } | null>(null);
  const [host, setHost] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (p: { a: string; body?: Record<string, unknown> }) => rpc<Visit>("gv_act", { _id: id, _action: p.a, _rev: q.data!.rev, _p: p.body ?? {} }),
    onSuccess: () => { toast.success("تم الحفظ"); setMode(""); setSlot(null); setNote(null); refresh(); },
    onError: (e) => { toast.error(arabicError(e)); refresh(); },
  });
  if (q.isLoading) return <div className="mb-4 rounded-xl border bg-card p-4"><LoadingState rows={2} /></div>;
  if (q.error || !q.data) return <div className="mb-4 rounded-xl border bg-card p-4"><ErrorState message={arabicError(q.error)} /><Button size="sm" variant="outline" className="mt-2" onClick={onClose}>إغلاق</Button></div>;
  const v = q.data;
  const side = v.side;
  const active = ["pending", "proposed", "confirmed"].includes(v.status);
  const awaitingMe = !!side && ["pending", "proposed"].includes(v.status) && v.awaiting === side;
  const today = v.slot_date === riyadhToday();
  const withReason = async (a: string, msg: string) => { const r = await askText(msg, { required: true }); if (r) act.mutate({ a, body: { reason: r } }); };
  return (
    <section className="mb-4 rounded-xl border-2 border-primary/40 bg-card p-4" aria-label="تفاصيل الزيارة">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">زيارة {v.student}</h2><StatusPill s={v.status} />
        {awaitingText(v, side) && <span className="text-sm text-primary">{awaitingText(v, side)}</span>}
        <Button size="icon" variant="ghost" className="ms-auto" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">المدرسة</dt><dd>{v.school}</dd></div>
        <div><dt className="text-xs text-muted-foreground">ولي الأمر</dt><dd>{v.guardian}{v.guardian_phone ? ` · ${v.guardian_phone}` : ""}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{v.status === "proposed" ? "الموعد المقترح" : "الموعد"}</dt><dd className="font-medium">{dayName(v.slot_date)} {v.slot_date} — {v.slot_time}</dd></div>
        {v.status === "proposed" && <div><dt className="text-xs text-muted-foreground">آخر موعد مؤكد</dt><dd>{v.conf_date ? `${dayName(v.conf_date)} ${v.conf_date} — ${v.conf_time}` : "لا يوجد موعد مؤكد بعد"}</dd></div>}
        <div><dt className="text-xs text-muted-foreground">المسؤول الذي سيقابله</dt><dd>{v.host ?? "يحدده المدرسة عند التأكيد"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">المصدر</dt><dd>{SOURCE[v.source]}</dd></div>
        {v.level !== "reception" && <div><dt className="text-xs text-muted-foreground">السبب</dt><dd>{REASONS[v.reason_cat ?? ""] ?? "—"}</dd></div>}
        {v.level !== "reception" && v.details && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">التفاصيل</dt><dd className="whitespace-pre-wrap">{v.details}</dd></div>}
        {v.decision_reason && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">آخر سبب/ملاحظة على القرار</dt><dd>{v.decision_reason}</dd></div>}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {awaitingMe && <Button size="sm" disabled={act.isPending} onClick={() => (side === "school" && !v.host_id ? setMode("confirm") : act.mutate({ a: "confirm" }))}>{v.status === "proposed" ? "قبول الموعد المقترح" : "تأكيد الموعد"}</Button>}
        {side && (awaitingMe || v.status === "confirmed") && <Button size="sm" variant="outline" onClick={() => setMode(mode === "propose" ? "" : "propose")}>{side === "guardian" ? "طلب تغيير الموعد" : "اقتراح موعد بديل"}</Button>}
        {awaitingMe && v.status === "proposed" && v.conf_date && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ a: "keep" })}>رفض التعديل والإبقاء على الموعد المؤكد</Button>}
        {awaitingMe && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => withReason("decline", side === "guardian" ? "سبب الاعتذار عن الزيارة" : "سبب رفض طلب الزيارة")}>{side === "guardian" ? "اعتذار" : "رفض الطلب"}</Button>}
        {side && active && !awaitingMe && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => withReason("cancel", "سبب إلغاء الزيارة")}>إلغاء الزيارة</Button>}
        {side === "school" && active && <Button size="sm" variant="ghost" onClick={() => setMode(mode === "host" ? "" : "host")}>تغيير المسؤول</Button>}
        {v.reception && today && v.status === "confirmed" && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ a: "arrive" })}>تسجيل الوصول</Button>}
        {v.reception && today && v.status === "confirmed" && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ a: "no_show" })}>لم يحضر</Button>}
        {v.reception && v.status === "arrived" && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ a: "depart" })}>تسجيل المغادرة</Button>}
      </div>

      {mode === "propose" && (
        <div className="mt-3 space-y-2">
          <Label>اختر الموعد البديل</Label>
          <SlotPicker school={v.school_id} exclude={v.id} value={slot} onChange={setSlot} />
          <Button size="sm" disabled={!slot || act.isPending} onClick={() => slot && act.mutate({ a: "propose", body: { slot_date: slot.d, slot_time: slot.t } })}>إرسال الموعد المقترح</Button>
        </div>
      )}
      {(mode === "confirm" || mode === "host") && (
        <div className="mt-3 space-y-2">
          <Label>المسؤول الذي سيقابل ولي الأمر</Label>
          <PeoplePicker purpose="visit_host" school={v.school_id} single compact value={host} onChange={setHost} label="المسؤول" />
          <Button size="sm" disabled={!host[0] || act.isPending} onClick={() => act.mutate({ a: mode === "confirm" ? "confirm" : "host", body: { host_id: host[0] } })}>{mode === "confirm" ? "تأكيد الموعد" : "حفظ المسؤول"}</Button>
        </div>
      )}
      {v.can_note && (
        <div className="mt-3 space-y-1">
          <Label htmlFor="gv-note">ملاحظة داخلية (لا يراها ولي الأمر ولا الاستقبال)</Label>
          <Textarea id="gv-note" rows={2} value={note ?? v.internal_note ?? ""} onChange={(e) => setNote(e.target.value)} />
          {note !== null && note !== (v.internal_note ?? "") && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ a: "note", body: { note } })}>حفظ الملاحظة</Button>}
        </div>
      )}
      {v.events.length > 0 && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-sm font-semibold">سجل الزيارة</summary>
          <ol className="mt-2 space-y-1 text-xs">{v.events.map((e, i) => (
            <li key={i} className="flex flex-wrap gap-2 rounded-md bg-muted/50 p-2">
              <span className="text-muted-foreground">{new Date(e.at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" })}</span>
              <span className="font-medium">{EVENT[e.action] ?? e.action}</span><span>{e.by ?? ""}</span>
              {typeof e.details["slot_date"] === "string" && <span>الموعد: {String(e.details["slot_date"])} {String(e.details["slot_time"] ?? "")}</span>}
              {typeof e.details["reason"] === "string" && <span>السبب: {String(e.details["reason"])}</span>}
            </li>
          ))}</ol>
        </details>
      )}
    </section>
  );
}

function CallForm({ school, onDone, onClose }: { school: string; onDone: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [guardian, setGuardian] = useState("");
  const [cat, setCat] = useState("academic"); const [details, setDetails] = useState("");
  const [host, setHost] = useState<string[]>([]); const [slot, setSlot] = useState<{ d: string; t: string } | null>(null);
  const refresh = useRefreshAll();
  const students = useQuery({ queryKey: ["gv-students", school, dq], enabled: !student, queryFn: () => rpc<{ id: string; name: string; section: string | null }[]>("gv_students", { _school: school, _q: dq || null }) });
  const guardians = useQuery({ queryKey: ["gv-guardians", student?.id], enabled: !!student, queryFn: () => rpc<{ id: string; name: string; relationship: string | null; phone: string | null; has_account: boolean }[]>("gv_guardians", { _student: student!.id }) });
  const save = useMutation({
    mutationFn: () => rpc<string>("gv_create", { _p: { source: "school", student_id: student?.id, guardian_id: guardian, reason_cat: cat, details, host_id: host[0], slot_date: slot?.d, slot_time: slot?.t } }),
    onSuccess: (id) => { toast.success("أُرسل الاستدعاء لولي الأمر"); refresh(); onDone(id); }, onError: (e) => { toast.error(arabicError(e)); refresh(); },
  });
  return (
    <section className="mb-4 space-y-3 rounded-xl border bg-card p-4" aria-label="استدعاء ولي أمر">
      <div className="flex items-center"><h2 className="font-semibold">استدعاء ولي أمر</h2><Button size="icon" variant="ghost" className="ms-auto" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <div className="space-y-1">
        <Label>1. الطالب</Label>
        {student ? <div className="flex items-center gap-2 text-sm"><span className="font-medium">{student.name}</span><Button size="sm" variant="ghost" onClick={() => { setStudent(null); setGuardian(""); }}>تغيير</Button></div> : (<>
          <Input className="h-9 w-full sm:w-72" placeholder="ابحث باسم الطالب أو رقم الهوية" aria-label="بحث عن طالب" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">{students.isLoading ? <li className="p-2 text-xs text-muted-foreground">جارٍ التحميل…</li> : students.error ? <li className="p-2 text-xs text-destructive">{arabicError(students.error)}</li> : !students.data?.length ? <li className="p-2 text-xs text-muted-foreground">لا يوجد طلاب مطابقون</li>
            : students.data.map((s) => <li key={s.id}><button type="button" className="flex min-h-10 w-full items-center gap-2 px-2 text-start text-sm hover:bg-muted" onClick={() => setStudent(s)}>{s.name}<span className="text-xs text-muted-foreground">{s.section ?? ""}</span></button></li>)}</ul>
        </>)}
      </div>
      {student && (
        <div className="space-y-1">
          <Label>2. ولي الأمر المرتبط</Label>
          {guardians.isLoading ? <p className="text-xs text-muted-foreground">جارٍ التحميل…</p> : !guardians.data?.length ? <p className="text-xs text-muted-foreground">لا يوجد ولي أمر موثّق مرتبط بهذا الطالب.</p> : (
            <div className="space-y-1">{guardians.data.map((g) => (
              <label key={g.id} className={`flex min-h-9 items-center gap-2 text-sm ${g.has_account ? "" : "text-muted-foreground"}`}>
                <input type="radio" name="gv-guardian" disabled={!g.has_account} checked={guardian === g.id} onChange={() => setGuardian(g.id)} />
                {g.name}{g.relationship ? ` (${g.relationship})` : ""}{!g.has_account ? " — ليس له حساب في المنصة" : ""}
              </label>
            ))}</div>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="gv-cat">3. تصنيف السبب</Label><select id="gv-cat" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}>{Object.entries(REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="gv-det">التفاصيل</Label><Textarea id="gv-det" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label>4. المسؤول الذي سيقابله</Label><PeoplePicker purpose="visit_host" school={school} single compact value={host} onChange={setHost} label="المسؤول" /></div>
      <div className="space-y-1"><Label>5. الموعد المقترح</Label><SlotPicker school={school} value={slot} onChange={setSlot} /></div>
      <Button disabled={!student || !guardian || !host[0] || !slot || save.isPending} onClick={() => save.mutate()}>إرسال الاستدعاء</Button>
    </section>
  );
}

function RequestForm({ onDone, onClose }: { onDone: (id: string) => void; onClose: () => void }) {
  const kids = useQuery({ queryKey: ["gv-kids"], queryFn: () => rpc<{ student_id: string; student: string; school_id: string; school: string }[]>("gv_my_children", {}) });
  const [kid, setKid] = useState(""); const [cat, setCat] = useState("academic"); const [details, setDetails] = useState("");
  const [slot, setSlot] = useState<{ d: string; t: string } | null>(null);
  const refresh = useRefreshAll();
  const k = kids.data?.find((x) => x.student_id === kid);
  useEffect(() => { if (!kid && kids.data?.length === 1) setKid(kids.data[0]!.student_id); }, [kids.data, kid]);
  const save = useMutation({
    mutationFn: () => rpc<string>("gv_create", { _p: { source: "guardian", student_id: kid, reason_cat: cat, details, slot_date: slot?.d, slot_time: slot?.t } }),
    onSuccess: (id) => { toast.success("أُرسل طلب الزيارة للمدرسة"); refresh(); onDone(id); }, onError: (e) => { toast.error(arabicError(e)); refresh(); },
  });
  return (
    <section className="mb-4 space-y-3 rounded-xl border bg-card p-4" aria-label="طلب زيارة">
      <div className="flex items-center"><h2 className="font-semibold">طلب زيارة للمدرسة</h2><Button size="icon" variant="ghost" className="ms-auto" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      {kids.isLoading ? <LoadingState rows={1} /> : !kids.data?.length ? <p className="text-sm text-muted-foreground">لا يوجد أبناء مرتبطون بحسابك ومفعّلون.</p> : (<>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="gv-kid">الابن / الابنة</Label>
            <select id="gv-kid" className={selectCls()} value={kid} onChange={(e) => { setKid(e.target.value); setSlot(null); }}>
              <option value="">اختر</option>{kids.data.map((x) => <option key={x.student_id} value={x.student_id}>{x.student} — {x.school}</option>)}
            </select>
            {k && <p className="text-xs text-muted-foreground">المدرسة: {k.school}</p>}
          </div>
          <div className="space-y-1"><Label htmlFor="gv-rcat">تصنيف السبب</Label><select id="gv-rcat" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}>{Object.entries(REASONS).map(([kk, l]) => <option key={kk} value={kk}>{l}</option>)}</select></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="gv-rdet">تفاصيل السبب</Label><Textarea id="gv-rdet" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
        </div>
        {k && <div className="space-y-1"><Label>اختر موعدًا متاحًا</Label><SlotPicker school={k.school_id} value={slot} onChange={setSlot} /></div>}
        <Button disabled={!kid || details.trim().length < 3 || !slot || save.isPending} onClick={() => save.mutate()}>إرسال الطلب</Button>
      </>)}
    </section>
  );
}

function SettingsTab({ school }: { school: string }) {
  type S = { configured: boolean; enabled: boolean; days: number[]; start_time: string; end_time: string; slot_minutes: number; closures: { id: string; on_date: string; reason: string | null }[] };
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gv-settings", school], queryFn: () => rpc<S>("gv_settings_get", { _school: school }) });
  const [f, setF] = useState<S | null>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const [cd, setCd] = useState(""); const [cr, setCr] = useState("");
  const done = () => { void qc.invalidateQueries({ queryKey: ["gv-settings"] }); void qc.invalidateQueries({ queryKey: ["gv-slots"] }); void qc.invalidateQueries({ queryKey: ["gv-caps"] }); };
  const save = useMutation({ mutationFn: () => rpc("gv_settings_save", { _school: school, _p: f }), onSuccess: () => { toast.success("حُفظت مواعيد الزيارة"); done(); }, onError: (e) => toast.error(arabicError(e)) });
  const add = useMutation({ mutationFn: () => rpc("gv_closure_add", { _school: school, _date: cd, _reason: cr }), onSuccess: () => { setCd(""); setCr(""); done(); }, onError: (e) => toast.error(arabicError(e)) });
  const del = useMutation({ mutationFn: (id: string) => rpc("gv_closure_del", { _id: id }), onSuccess: done, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading || !f) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">المواعيد الصباحية</h2>
        {!f.configured && <p className="text-xs text-muted-foreground">لم تُحفظ مواعيد لهذه المدرسة بعد، فلن تظهر خانات للحجز حتى تحفظها. التوقيت المعتمد: الرياض.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> استقبال الزيارات مفعّل</label>
        <div><Label>أيام الزيارة</Label><div className="mt-1 flex flex-wrap gap-2">{DAYS.map((d, i) => (
          <label key={i} className="flex min-h-9 items-center gap-1 rounded-md border px-2 text-sm"><input type="checkbox" checked={f.days.includes(i)} onChange={(e) => setF({ ...f, days: e.target.checked ? [...f.days, i] : f.days.filter((x) => x !== i) })} />{d}</label>
        ))}</div></div>
        <div className="grid grid-cols-3 gap-2">
          <div><Label htmlFor="gv-st">من</Label><Input id="gv-st" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></div>
          <div><Label htmlFor="gv-en">إلى</Label><Input id="gv-en" type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></div>
          <div><Label htmlFor="gv-sm">مدة الخانة (دقيقة)</Label><Input id="gv-sm" type="number" min={10} max={120} step={5} value={f.slot_minutes} onChange={(e) => setF({ ...f, slot_minutes: Number(e.target.value) })} /></div>
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>حفظ المواعيد</Button>
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">أيام الإغلاق والإجازات</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label htmlFor="gv-cd">التاريخ</Label><Input id="gv-cd" type="date" min={riyadhToday()} value={cd} onChange={(e) => setCd(e.target.value)} /></div>
          <div className="flex-1"><Label htmlFor="gv-cr">السبب</Label><Input id="gv-cr" value={cr} onChange={(e) => setCr(e.target.value)} placeholder="إجازة، اختبارات…" /></div>
          <Button disabled={!cd || add.isPending} onClick={() => add.mutate()}>إضافة</Button>
        </div>
        {!f.closures.length ? <p className="text-xs text-muted-foreground">لا أيام إغلاق قادمة.</p> : (
          <ul className="divide-y rounded-lg border">{f.closures.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-2 text-sm"><span>{dayName(c.on_date)} {c.on_date}</span><span className="text-muted-foreground">{c.reason ?? ""}</span>
              <Button size="sm" variant="ghost" className="ms-auto" aria-label={`حذف ${c.on_date}`} onClick={() => del.mutate(c.id)}><X className="size-4" /></Button></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
