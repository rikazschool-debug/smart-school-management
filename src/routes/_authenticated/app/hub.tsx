import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Send, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { MeetingList } from "@/components/admin/meeting-list";
import { NoticeFiles } from "@/components/comm/notice-files";
import { CircularsTab } from "@/components/comm/circulars";
import { DeptPicker } from "@/components/comm/dept-picker";
import { SectionLocked, useOrgSections } from "@/components/owner-portal";

// Notifications & meetings hub. Targeting, eligibility, scope and the recipient list are decided by bc_* RPCs on the server.
type HubTab = "notices" | "meetings" | "circulars";
type Search = { tab?: HubTab; n?: string; circular?: string };
export const Route = createFileRoute("/_authenticated/app/hub")({
  validateSearch: (s: Record<string, unknown>): Search => ({ ...(s["tab"] === "meetings" || s["tab"] === "circulars" || s["tab"] === "notices" ? { tab: s["tab"] as HubTab } : {}), ...(typeof s["n"] === "string" ? { n: s["n"] as string } : {}), ...(typeof s["circular"] === "string" ? { circular: s["circular"] as string } : {}) }),
  head: () => ({ meta: [{ title: "الإشعارات والاجتماعات والتعاميم — ركاز" }, { name: "description", content: "تعاميم لكل الفروع أو فروع وفئات وأشخاص محددين، وإرسال إشعارات موجّهة للفروع والفئات والأشخاص مع معاينة وسجل، وتنظيم الاجتماعات بين الفروع." }, { property: "og:title", content: "الإشعارات والاجتماعات — ركاز" }, { property: "og:description", content: "إشعارات موجّهة واجتماعات بين الفروع." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

type Scope = { view: string[]; draft: string[]; send: string[]; any: boolean; schools: { id: string; name: string }[]; departments: { id: string; name: string; school_id: string }[] };
type Target = { schools: string[]; all_schools?: boolean; categories: string[]; departments: string[]; mode: "all" | "pick"; users: string[] };
type Person = { user_id: string; name: string; category_label?: string; school?: string };
type Preview = { count: number; fingerprint: string; by_school: Record<string, number>; by_category: Record<string, number>; people: Person[] | null; dropped: Person[] };
type Item = { id: string; ref: string | null; title: string; status: string; rev: number; sent_at: string | null; created_at: string; sender: string; mine: boolean; recipients: number | null; read: number; failed: number; schools: string[] | null; categories: string[] | null; mode: string };
type Detail = { id: string; ref: string | null; title: string; body: string; status: string; rev: number; target: Target; sent_at: string | null; sender: string; copied_from: string | null; can: { edit: boolean; send: boolean; copy: boolean }; recipients: { name: string; school: string; category_label: string; notified: boolean; read_at: string | null }[] | null; log: { action: string; at: string; by: string }[] };
const CATS: [string, string][] = [["guardian", "أولياء الأمور"], ["student", "الطلاب"], ["teacher", "المعلمون"], ["staff", "الإداريون"], ["maint_school", "مسؤولو صيانة المدارس"], ["maint_bus", "مسؤولو صيانة الباصات"]];
const LOG: Record<string, string> = { draft: "إنشاء مسودة", edit: "تعديل", send: "إرسال", copy: "نسخ من إشعار سابق", discard: "إلغاء المسودة" };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—");

function Page() {
  const { active } = useSession();
  const s = Route.useSearch();
  const nav = useNavigate({ from: "/app/hub" });
  const secs = useOrgSections(active?.orgId ?? null);
  if (!active?.orgId) return null;
  if (secs.data?.comm_hub?.["enabled"] === false) return <><PageHeader title="الإشعارات والاجتماعات والتعاميم" /><SectionLocked /></>;
  const tab = s.tab ?? "notices";
  return (
    <>
      <PageHeader eyebrow={active.orgName} title={tab === "circulars" ? "التعاميم" : tab === "meetings" ? "الاجتماعات" : "الإشعارات"} desc="إشعارات داخل ركاز لفروع وفئات وأشخاص محددين، واجتماعات حضورية وأونلاين بين الفروع. المعاينة تطابق المستلمين الفعليين وقت الإرسال." />
      <div role="tablist" className="mb-4 flex gap-2 border-b pb-2 lg:hidden">
        {([["notices", "الإشعارات"], ["meetings", "الاجتماعات"], ["circulars", "التعاميم"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => nav({ search: { tab: k } })} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      {tab === "notices" ? <Notices org={active.orgId} open={s.n} setOpen={(n) => nav({ search: n ? { tab: "notices", n } : { tab: "notices" } })} />
        : tab === "meetings" ? <MeetingList ctx={{ ...active, schoolId: null }} />
        : active.schoolId ? <CircularsTab orgWide={active.role === "org_owner"} ctx={{ ...active, schoolId: active.schoolId }} focus={s.circular} onFocus={(id) => nav({ search: id ? { tab: "circulars", circular: id } : { tab: "circulars" } })} />
        : <EmptyState title="لا توجد مدرسة مفعّلة" hint="أضف مدرسة أولًا لإصدار التعاميم." />}
    </>
  );
}

function Notices({ org, open, setOpen }: { org: string; open?: string | undefined; setOpen: (n?: string) => void }) {
  const scope = useQuery({ queryKey: ["bc-scope", org], queryFn: () => rpc<Scope>("bc_scope", { _org: org }) });
  const [f, setF] = useState({ q: "", status: "", school: "", category: "", from: "", to: "" });
  const filt = useMemo(() => Object.fromEntries(Object.entries(f).filter(([, v]) => v)), [f]);
  const list = useQuery({ queryKey: ["bc-list", org, filt], enabled: !!scope.data?.any, queryFn: () => rpc<Item[]>("bc_list", { _org: org, _f: filt }) });
  const [edit, setEdit] = useState<{ id: string | null } | null>(null);
  if (scope.isLoading) return <LoadingState />;
  if (scope.error) return <ErrorState message={arabicError(scope.error)} onRetry={() => scope.refetch()} />;
  const k = scope.data!;
  if (!k.any) return <ForbiddenState />;
  const sel = selectCls("", true);
  return (
    <div className="space-y-4">
      {edit ? <Composer org={org} k={k} id={edit.id} onClose={(id) => { setEdit(null); if (id) setOpen(id); }} />
        : open ? <NoticeDetail id={open} onClose={() => setOpen()} onEdit={(id) => { setOpen(); setEdit({ id }); }} onCopied={(id) => { setOpen(); setEdit({ id }); }} />
        : k.draft.length > 0 && <Button onClick={() => setEdit({ id: null })}>إشعار جديد</Button>}
      <Section title="سجل الإشعارات" desc="المسودات والإشعارات المرسلة ضمن الفروع التي تملك عرضها.">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Input aria-label="بحث" placeholder="العنوان أو النص أو الرقم المرجعي" className="h-9 w-56" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select aria-label="الحالة" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option><option value="draft">مسودة</option><option value="sent">مرسل</option></select>
          <select aria-label="الفرع" className={sel} value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })}><option value="">كل الفروع</option>{k.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select aria-label="الفئة" className={sel} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">كل الفئات</option>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <div><Label htmlFor="bf">من</Label><Input id="bf" type="date" className="h-9" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
          <div><Label htmlFor="bt">إلى</Label><Input id="bt" type="date" className="h-9" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        </div>
        {list.isLoading ? <LoadingState rows={2} /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data!.length ? <EmptyState title="لا توجد إشعارات" /> : (
          <ul className="space-y-2">{list.data!.map((n) => (
            <li key={n.id}><button type="button" onClick={() => setOpen(n.id)} className="block w-full rounded-xl border bg-card p-3 text-start text-sm hover:border-primary">
              <span className="flex flex-wrap items-center gap-2"><b className="flex-1">{n.title}</b>{n.ref && <bdi dir="ltr" className="text-xs text-muted-foreground">{n.ref}</bdi>}
                <span className={"rounded-full px-2 py-0.5 text-xs " + (n.status === "sent" ? "bg-success/15 text-success" : "bg-warning/15")}>{n.status === "sent" ? "مرسل" : "مسودة"}</span></span>
              <span className="block text-xs text-muted-foreground">{(n.schools ?? []).join("، ")} · {(n.categories ?? []).join("، ")} · {n.mode === "pick" ? "أشخاص محددون" : "جميع المطابقين"} · {n.sender} · {dt(n.sent_at ?? n.created_at)}</span>
              {n.status === "sent" && <span className="block text-xs">المستلمون {n.recipients} · قرأ {n.read}{n.failed ? ` · تعذّر ${n.failed}` : ""}</span>}
            </button></li>))}</ul>
        )}
      </Section>
    </div>
  );
}

function Composer({ org, k, id, onClose }: { org: string; k: Scope; id: string | null; onClose: (id?: string) => void }) {
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["bc-get", id], enabled: !!id, queryFn: () => rpc<Detail>("bc_get", { _id: id }) });
  const [form, setForm] = useState<{ title: string; body: string; t: Target; rev: number | null; id: string | null } | null>(id ? null : { title: "", body: "", t: { schools: [], categories: [], departments: [], mode: "all", users: [] }, rev: null, id: null });
  if (id && !form && existing.data) setForm({ title: existing.data.title, body: existing.data.body, t: { ...existing.data.target, departments: existing.data.target.departments ?? [], users: existing.data.target.users ?? [] }, rev: existing.data.rev, id });
  const [client] = useState(() => crypto.randomUUID());
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, Person>>({});
  const [pv, setPv] = useState<Preview | null>(null);
  const t = form?.t;
  const people = useQuery({ queryKey: ["bc-people", org, t?.schools, t?.categories, t?.departments, q], enabled: !!t && t.mode === "pick" && q.trim().length >= 2 && t.schools.length > 0 && t.categories.length > 0,
    queryFn: () => rpc<Person[]>("bc_people", { _org: org, _t: t, _q: q }) });
  const known = useQuery({ queryKey: ["bc-people-ids", org, form?.id], enabled: !!t && t.mode === "pick" && t.users.length > 0 && Object.keys(picked).length === 0,
    queryFn: () => rpc<Person[]>("bc_people", { _org: org, _t: t, _q: null, _ids: t!.users }) });
  if (known.data && Object.keys(picked).length === 0 && known.data.length) setPicked(Object.fromEntries(known.data.map((p) => [p.user_id, p])));
  const save = useMutation({
    mutationFn: async () => rpc<{ id: string; rev: number }>("bc_save", { _org: org, _id: form!.id, _p: { title: form!.title, body: form!.body, target: form!.t }, _rev: form!.rev, _client: form!.id ? null : client }),
    onSuccess: (r) => { setForm((x) => x && { ...x, id: r.id, rev: r.rev }); qc.invalidateQueries({ queryKey: ["bc-list"] }); toast.success("حُفظت المسودة"); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const preview = useMutation({ mutationFn: () => rpc<Preview>("bc_preview", { _org: org, _t: form!.t }), onSuccess: setPv, onError: (e) => toast.error(arabicError(e)) });
  const send = useMutation({
    mutationFn: async () => {
      const saved = await rpc<{ id: string; rev: number }>("bc_save", { _org: org, _id: form!.id, _p: { title: form!.title, body: form!.body, target: form!.t }, _rev: form!.rev, _client: form!.id ? null : client });
      setForm((x) => x && { ...x, id: saved.id, rev: saved.rev });
      if (!(await ask(`إرسال «${form!.title}» إلى ${pv!.count} مستلمًا؟ يصل مرة واحدة لكل حساب ولا يمكن التراجع.`, { ok: "إرسال" }))) throw new Error("أُلغي");
      return { saved, r: await rpc<{ ref: string; count: number }>("bc_send", { _id: saved.id, _rev: saved.rev, _fingerprint: pv!.fingerprint }) };
    },
    onSuccess: ({ saved, r }) => { toast.success(`أُرسل ${r.ref} إلى ${r.count}`); qc.invalidateQueries({ queryKey: ["bc-list"] }); onClose(saved.id); },
    onError: (e) => { if ((e as Error).message !== "أُلغي") { toast.error(arabicError(e)); preview.mutate(); } },
  });
  if (!form) return <LoadingState rows={2} />;
  const setT = (p: Partial<Target>) => { setForm({ ...form, t: { ...form.t, ...p } }); setPv(null); };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const draftSchools = k.schools.filter((s) => k.draft.includes(s.id));
  const deps = k.departments.filter((d) => form.t.schools.includes(d.school_id));
  const canSend = form.t.schools.length > 0 && form.t.schools.every((s) => k.send.includes(s));
  return (
    <Section title={form.id ? "تعديل المسودة" : "إشعار جديد"} action={<Button size="sm" variant="ghost" onClick={() => onClose(form.id ?? undefined)} aria-label="إغلاق"><X className="size-4" /></Button>}>
      <div className="space-y-4">
        <div><Label htmlFor="bc-title">العنوان</Label><Input id="bc-title" className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><Label htmlFor="bc-body">النص</Label><Textarea id="bc-body" rows={4} className="mt-1" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        {form.id ? <NoticeFiles id={form.id} editable /> : <p className="text-xs text-muted-foreground">احفظ المسودة أولًا لإرفاق الملفات.</p>}
        <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">الفروع</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={draftSchools.length > 0 && form.t.schools.length === draftSchools.length} onChange={(e) => setT({ schools: e.target.checked ? draftSchools.map((s) => s.id) : [], departments: [] })} />جميع الفروع المتاحة</label>
            {draftSchools.map((s) => <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={form.t.schools.includes(s.id)} onChange={() => setT({ schools: toggle(form.t.schools, s.id), departments: form.t.departments.filter((d) => deps.find((x) => x.id === d)?.school_id !== s.id || !form.t.schools.includes(s.id)) })} />{s.name}</label>)}
          </div></fieldset>
        <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">الفئات</legend>
          <div className="flex flex-wrap gap-3 text-sm">{CATS.map(([v, l]) => <label key={v} className="flex items-center gap-1"><input type="checkbox" checked={form.t.categories.includes(v)} onChange={() => setT({ categories: toggle(form.t.categories, v) })} />{l}</label>)}</div></fieldset>
        {form.t.schools.length > 0 && <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">الأقسام والأشخاص المرتبطون بها (اختياري)</legend>
          <DeptPicker org={org} schools={form.t.schools} value={form.t.departments} onChange={(v) => setT({ departments: v })} />
          <p className="mt-1 text-xs text-muted-foreground">للطلاب وأولياء الأمور: حسب التسجيل الحالي في شعب تدرس مواد هذه الأقسام.</p></fieldset>}
        <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">طريقة الاختيار</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1"><input type="radio" name="bc-mode" checked={form.t.mode === "all"} onChange={() => setT({ mode: "all" })} />جميع المطابقين</label>
            <label className="flex items-center gap-1"><input type="radio" name="bc-mode" checked={form.t.mode === "pick"} onChange={() => setT({ mode: "pick" })} />أشخاص محددون</label>
          </div>
          {form.t.mode === "pick" && (
            <div className="mt-3 space-y-2">
              <Input aria-label="بحث بالاسم" placeholder="ابحث بالاسم أو جزء منه (حرفان على الأقل)" value={q} onChange={(e) => setQ(e.target.value)} />
              {(people.data ?? []).length > 0 && <ul className="max-h-56 overflow-auto rounded-lg border text-sm">{people.data!.map((p) => (
                <li key={p.user_id}><button type="button" className="flex w-full items-center gap-2 border-b p-2 text-start hover:bg-muted" onClick={() => { setPicked({ ...picked, [p.user_id]: p }); setT({ users: form.t.users.includes(p.user_id) ? form.t.users : [...form.t.users, p.user_id] }); }}>
                  <span className="flex-1">{p.name}</span><span className="text-xs text-muted-foreground">{p.category_label} · {p.school}</span>{form.t.users.includes(p.user_id) && <span className="text-xs text-success">مختار</span>}</button></li>))}</ul>}
              {q.trim().length >= 2 && people.data?.length === 0 && <p className="text-xs text-muted-foreground">لا نتائج ضمن الفروع والفئات المختارة.</p>}
              <div className="flex flex-wrap gap-2">{form.t.users.map((u) => <span key={u} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs">{picked[u]?.name ?? "…"}{picked[u]?.school && ` · ${picked[u]!.school}`}<button type="button" aria-label="إزالة" onClick={() => setT({ users: form.t.users.filter((x) => x !== u) })}><X className="size-3" /></button></span>)}</div>
            </div>
          )}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>حفظ مسودة</Button>
          <Button variant="outline" disabled={preview.isPending || !form.t.schools.length || !form.t.categories.length} onClick={() => preview.mutate()}><Eye className="size-4" />معاينة المستلمين</Button>
          {canSend && <Button disabled={!pv || pv.count === 0 || send.isPending || form.title.trim().length < 3 || form.body.trim().length < 3} onClick={() => send.mutate()}><Send className="size-4" />إرسال</Button>}
          {!canSend && form.t.schools.length > 0 && <span className="self-center text-xs text-muted-foreground">لا تملك الإرسال لكل الفروع المختارة؛ احفظ المسودة ليرسلها المخول.</span>}
        </div>
        {pv && (
          <div className="space-y-2 rounded-lg border-2 border-primary/30 p-3 text-sm" aria-label="المعاينة">
            <p className="font-bold">{pv.count} مستلم فريد</p>
            <p className="text-xs text-muted-foreground">حسب الفرع: {Object.entries(pv.by_school).map(([s, c]) => `${s} ${c}`).join(" · ") || "—"} — حسب الفئة: {Object.entries(pv.by_category).map(([s, c]) => `${s} ${c}`).join(" · ") || "—"}</p>
            {pv.dropped.length > 0 && <p className="rounded bg-warning/15 p-2 text-xs">خارج النطاق الحالي ولن يصلهم: {pv.dropped.map((d) => d.name).join("، ")}</p>}
            {pv.people && <ul className="max-h-48 overflow-auto text-xs">{pv.people.map((p) => <li key={p.user_id}>{p.name} — {p.category_label} · {p.school}</li>)}</ul>}
            {pv.count === 0 && <p className="text-destructive">لا يوجد مستلمون؛ الإرسال معطّل.</p>}
          </div>
        )}
      </div>
    </Section>
  );
}

function NoticeDetail({ id, onClose, onEdit, onCopied }: { id: string; onClose: () => void; onEdit: (id: string) => void; onCopied: (id: string) => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["bc-get", id], queryFn: () => rpc<Detail>("bc_get", { _id: id }) });
  const copy = useMutation({ mutationFn: () => rpc<string>("bc_copy", { _id: id }), onSuccess: (nid) => { toast.success("نُسخ إلى مسودة جديدة"); qc.invalidateQueries({ queryKey: ["bc-list"] }); onCopied(nid); }, onError: (e) => toast.error(arabicError(e)) });
  const discard = useMutation({ mutationFn: () => rpc("bc_discard", { _id: id, _rev: d.data!.rev }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["bc-list"] }); onClose(); }, onError: (e) => toast.error(arabicError(e)) });
  if (d.isLoading) return <LoadingState rows={2} />;
  if (d.error) return <ErrorState message={arabicError(d.error)} />;
  const n = d.data!;
  return (
    <Section title={n.title} desc={`${n.ref ?? "مسودة"} · ${n.sender} · ${dt(n.sent_at)}${n.copied_from ? ` · منسوخ من ${n.copied_from}` : ""}`} action={<Button size="sm" variant="ghost" onClick={onClose} aria-label="إغلاق"><X className="size-4" /></Button>}>
      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
      <div className="mt-3"><NoticeFiles id={n.id} editable={false} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        {n.can.edit && <Button size="sm" onClick={() => onEdit(n.id)}>متابعة المسودة</Button>}
        {n.can.edit && <Button size="sm" variant="outline" onClick={async () => { if (await ask("إلغاء المسودة؟", { ok: "إلغاء المسودة", destructive: true })) discard.mutate(); }}>إلغاء المسودة</Button>}
        {n.can.copy && n.status === "sent" && <Button size="sm" variant="outline" disabled={copy.isPending} onClick={() => copy.mutate()}><Copy className="size-4" />نسخ إلى مسودة</Button>}
      </div>
      {n.recipients && (
        <div className="mt-4"><p className="mb-1 text-sm font-bold">المستلمون الفعليون ({n.recipients.length}) · قرأ {n.recipients.filter((r) => r.read_at).length}</p>
          <ul className="max-h-64 overflow-auto rounded-lg border text-xs">{n.recipients.map((r, i) => <li key={i} className="flex gap-2 border-b p-2"><span className="flex-1">{r.name}</span><span className="text-muted-foreground">{r.category_label} · {r.school}</span><span>{!r.notified ? "تعذّر" : r.read_at ? "مقروء" : "لم يُقرأ"}</span></li>)}</ul></div>
      )}
      <ul className="mt-3 text-xs text-muted-foreground">{n.log.map((l, i) => <li key={i}>{LOG[l.action] ?? l.action} — {l.by} — {dt(l.at)}</li>)}</ul>
    </Section>
  );
}
