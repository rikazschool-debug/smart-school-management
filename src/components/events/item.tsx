// One event/course page: details & actions, registration link, applications, participants & attendance, trip consents,
// form settings, delegation and history. Every button is re-checked by the evt_* RPC on the server.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { rpc } from "@/components/hr/shared";
import { ask, askText } from "@/components/confirm";
import { supabase } from "@/integrations/supabase/client";
import { PeoplePicker } from "@/components/people-picker";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { FormEditor } from "./form-editor";
import { FormFields } from "./form-render";
import { TplUpdate, useTplEffective } from "./section-forms";
import { AppFiles, ItemFiles } from "./files";
import { flushEvtMessagesFn } from "@/lib/events-public.functions";
import {
  APP_STATUS, ATT, AUDIENCE, AppPill, CATEGORY, KIND, LOG, MODE, REG_STATE, SOURCE, STAFF_CAPS, StatusPill, answerText, fmtD, fmtDT, fromLocal, toLocal,
  TPL_SOURCE, type Answers, type CoreLabels, type EvtItem, type Field, type Kind, type Session,
} from "./shared";

const sm = selectCls("", true);
export const useEvtRefresh = () => {
  const qc = useQueryClient();
  return () => { for (const k of ["evt-item", "evt-list", "evt-apps", "evt-app", "evt-roster", "evt-consents", "evt-cal", "evt-form", "evt-report"]) void qc.invalidateQueries({ queryKey: [k] }); };
};

// ---------------- create / edit ----------------
type Draft = {
  title: string; description: string; category: string; location: string; mode: string; trainer: string; audience: string;
  target: { all?: boolean; sections?: string[] }; reg_opens: string; reg_closes: string; capacity: string; conditions: string;
  consent_required: boolean; consent_deadline: string; need_emergency: boolean; need_medical: boolean; sessions: Session[];
};
const emptyDraft = (kind: Kind): Draft => ({
  title: "", description: "", category: "", location: "", mode: "in_person", trainer: "", audience: kind === "course" ? "both" : "internal", target: { all: true },
  reg_opens: "", reg_closes: "", capacity: "", conditions: "", consent_required: kind === "trip", consent_deadline: "", need_emergency: kind === "trip", need_medical: false,
  sessions: [{ title: null, starts_at: "", ends_at: null, location: null }],
});
const fromItem = (i: EvtItem): Draft => ({
  title: i.title, description: i.description ?? "", category: i.category ?? "", location: i.location ?? "", mode: i.mode, trainer: i.trainer ?? "", audience: i.audience,
  target: i.target?.sections?.length ? { sections: i.target.sections } : { all: true }, reg_opens: toLocal(i.reg_opens), reg_closes: toLocal(i.reg_closes),
  capacity: i.capacity ? String(i.capacity) : "", conditions: i.conditions ?? "", consent_required: i.consent_required, consent_deadline: toLocal(i.consent_deadline),
  need_emergency: i.need_emergency, need_medical: i.need_medical,
  sessions: i.session_list.map((s) => ({ ...s, starts_at: toLocal(s.starts_at), ends_at: s.ends_at ? toLocal(s.ends_at) : null })),
});

export function ItemForm({ kind, school, item, onDone, onClose }: { kind: Kind; school: string; item?: EvtItem; onDone: (id: string) => void; onClose: () => void }) {
  const [d, setD] = useState<Draft>(item ? fromItem(item) : emptyDraft(kind));
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  // section form: newest published version for a new item, the item's own snapshot when editing
  const eff = useTplEffective(school, kind, !item);
  const [extra, setExtra] = useState<Answers>(item?.extra ?? {});
  const [changed, setChanged] = useState(false);
  const xFields: Field[] = item ? item.extra_fields ?? [] : eff.data?.body.fields ?? [];
  const core: CoreLabels = item ? item.core_labels ?? {} : eff.data?.body.core ?? {};
  const L = (id: string, def: string) => core[id]?.label || def;
  const H = (id: string) => core[id]?.help ? <p className="text-xs text-muted-foreground">{core[id]!.help}</p> : null;
  const sections = useQuery({ queryKey: ["evt-sections", school], enabled: kind !== "course", queryFn: async () => {
    const r = await supabase.from("sections").select("id,name").eq("school_id", school).order("name"); if (r.error) throw r.error; return r.data as { id: string; name: string }[]; } });
  const save = useMutation({
    mutationFn: () => rpc<{ id: string; rev: number }>("evt_save", { _p: {
      id: item?.id ?? null, rev: item?.rev ?? null, kind, school_id: school, title: d.title, description: d.description, category: d.category, location: d.location,
      mode: d.mode, trainer: d.trainer, audience: d.audience, target: d.target, reg_opens: fromLocal(d.reg_opens), reg_closes: fromLocal(d.reg_closes),
      capacity: d.capacity, conditions: d.conditions, consent_required: d.consent_required, consent_deadline: fromLocal(d.consent_deadline),
      need_emergency: d.need_emergency, need_medical: d.need_medical, extra, tpl_version: item ? null : eff.data?.version_id ?? null,
      sessions: d.sessions.filter((s) => s.starts_at).map((s) => ({ id: s.id ?? null, title: s.title, starts_at: fromLocal(s.starts_at), ends_at: s.ends_at ? fromLocal(s.ends_at) : null, location: s.location })),
    } }),
    onSuccess: (r) => { toast.success(item ? "حُفظت التعديلات" : "حُفظت مسودة"); onDone(r.id); },
    onError: (e) => {
      if (/نُشر تعديل جديد على نموذج/.test(String((e as { message?: string })?.message ?? ""))) { setChanged(true); void eff.refetch(); }
      toast.error(arabicError(e));
    },
  });
  const updS = (i: number, p: Partial<Session>) => set({ sessions: d.sessions.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <form className="mb-6 space-y-4 rounded-2xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="flex items-center"><h2 className="flex-1 text-lg font-bold">{item ? `تعديل ${KIND[kind]}` : `${KIND[kind]} جديدة`}</h2><Button type="button" size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold text-primary">١. البيانات الأساسية</legend>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="e-title">{L("title", "الاسم")}</Label>{H("title")}<Input id="e-title" required maxLength={150} value={d.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="e-desc">{L("description", "الوصف")}</Label>{H("description")}<Textarea id="e-desc" maxLength={4000} value={d.description} onChange={(e) => set({ description: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="e-cat">التصنيف</Label><Input id="e-cat" maxLength={80} placeholder={kind === "course" ? "مثال: مهارات رقمية" : "مثال: ثقافية"} value={d.category} onChange={(e) => set({ category: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="e-mode">طريقة الحضور</Label><select id="e-mode" className={selectCls("w-full")} value={d.mode} onChange={(e) => set({ mode: e.target.value })}>{Object.entries(MODE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="e-loc">{L("location", "المكان أو الرابط")}</Label>{H("location")}<Input id="e-loc" maxLength={200} value={d.location} onChange={(e) => set({ location: e.target.value })} /></div>
        {kind === "course" && <div className="space-y-1"><Label htmlFor="e-tr">{L("trainer", "المدرب (اختياري)")}</Label><Input id="e-tr" maxLength={120} value={d.trainer} onChange={(e) => set({ trainer: e.target.value })} /></div>}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold text-primary">٢. {L("sessions", "المواعيد")}</legend>{H("sessions")}
        {d.sessions.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input aria-label={`عنوان الجلسة ${i + 1}`} placeholder={`الجلسة ${i + 1}`} value={s.title ?? ""} onChange={(e) => updS(i, { title: e.target.value })} />
            <Input aria-label={`بداية الجلسة ${i + 1}`} type="datetime-local" value={s.starts_at} onChange={(e) => updS(i, { starts_at: e.target.value })} />
            <Input aria-label={`نهاية الجلسة ${i + 1}`} type="datetime-local" value={s.ends_at ?? ""} onChange={(e) => updS(i, { ends_at: e.target.value || null })} />
            <Button type="button" size="icon" variant="ghost" aria-label="حذف الجلسة" disabled={d.sessions.length === 1} onClick={() => set({ sessions: d.sessions.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => set({ sessions: [...d.sessions, { title: null, starts_at: "", ends_at: null, location: null }] })}><Plus className="size-4" /> إضافة جلسة</Button>
      </fieldset>
      {kind === "course" ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-bold text-primary">٣. التسجيل</legend>
          <div className="space-y-1"><Label htmlFor="e-aud">الفئة المستهدفة</Label><select id="e-aud" className={selectCls("w-full")} value={d.audience} onChange={(e) => set({ audience: e.target.value })}>{Object.entries(AUDIENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="e-cap">{L("capacity", "السعة (المقاعد)")}</Label><Input id="e-cap" type="number" min={1} value={d.capacity} onChange={(e) => set({ capacity: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="e-ro">بداية التسجيل</Label><Input id="e-ro" type="datetime-local" value={d.reg_opens} onChange={(e) => set({ reg_opens: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="e-rc">نهاية التسجيل</Label><Input id="e-rc" type="datetime-local" value={d.reg_closes} onChange={(e) => set({ reg_closes: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="e-cond">{L("conditions", "الشروط")}</Label><Textarea id="e-cond" maxLength={4000} value={d.conditions} onChange={(e) => set({ conditions: e.target.value })} /></div>
        </fieldset>
      ) : (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-bold text-primary">٣. الجمهور{kind === "trip" ? " والموافقات" : ""}</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="aud" checked={!!d.target.all} onChange={() => set({ target: { all: true } })} /> كل طلاب المدرسة</label>
            <label className="flex items-center gap-2"><input type="radio" name="aud" checked={!d.target.all} onChange={() => set({ target: { sections: [] } })} /> شعب محددة</label>
          </div>
          {!d.target.all && (
            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-lg border p-2">
              {sections.isLoading ? <span className="text-sm text-muted-foreground">جارٍ التحميل…</span> : (sections.data ?? []).map((s) => {
                const on = d.target.sections?.includes(s.id) ?? false;
                return <label key={s.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={on} onChange={() => set({ target: { sections: on ? (d.target.sections ?? []).filter((x) => x !== s.id) : [...(d.target.sections ?? []), s.id] } })} /> {s.name}</label>;
              })}
            </div>
          )}
          <div className="space-y-1"><Label htmlFor="e-cap2">السعة (اختياري)</Label><Input id="e-cap2" className="max-w-40" type="number" min={1} value={d.capacity} onChange={(e) => set({ capacity: e.target.value })} /></div>
          {kind === "trip" && (
            <div className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.consent_required} onChange={(e) => set({ consent_required: e.target.checked })} /> تتطلب موافقة ولي الأمر</label>
              <div className="space-y-1"><Label htmlFor="e-cd">آخر موعد للرد</Label><Input id="e-cd" type="datetime-local" value={d.consent_deadline} disabled={!d.consent_required} onChange={(e) => set({ consent_deadline: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.need_emergency} onChange={(e) => set({ need_emergency: e.target.checked })} /> بيانات تواصل للطوارئ</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.need_medical} onChange={(e) => set({ need_medical: e.target.checked })} /> إقرار طبي</label>
            </div>
          )}
          <div className="space-y-1"><Label htmlFor="e-cond2">{L("conditions", "التعليمات والشروط")}</Label><Textarea id="e-cond2" maxLength={4000} value={d.conditions} onChange={(e) => set({ conditions: e.target.value })} /></div>
        </fieldset>
      )}
      {!item && eff.isLoading && <LoadingState />}
      {changed && <p role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-2 text-sm">نُشر تعديل جديد على نموذج هذا القسم أثناء التعبئة. عُرضت الحقول المحدّثة ومدخلاتك محفوظة؛ راجعها ثم احفظ مرة أخرى.</p>}
      {xFields.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-bold text-primary">بيانات إضافية</legend>
          <FormFields fields={xFields} value={extra} onChange={(v) => { setExtra(v); }} />
        </fieldset>
      )}
      {!item && eff.data && <p className="text-xs text-muted-foreground">النموذج المطبَّق: {TPL_SOURCE[eff.data.source]}{eff.data.version ? ` · الإصدار ${eff.data.version}` : ""}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={save.isPending || (!item && !eff.data)}>{save.isPending ? "جارٍ الحفظ…" : item ? "حفظ التعديلات" : "حفظ مسودة"}</Button><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button></div>
    </form>
  );
}

// ---------------- detail ----------------
type ITab = "details" | "apps" | "people" | "consents" | "form" | "settings" | "log";

export function ItemDetail({ id, app, openApp, onClose }: { id: string; app?: string | undefined; openApp: (a: string | undefined) => void; onClose: () => void }) {
  const q = useQuery({ queryKey: ["evt-item", id], queryFn: () => rpc<EvtItem>("evt_get", { _id: id }) });
  const [tab, setTab] = useState<ITab>("details");
  const [statusF, setStatusF] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const refresh = useEvtRefresh();
  useEffect(() => { if (app) setTab("apps"); }, [app]);
  const act = useMutation({
    mutationFn: (p: { action: string; reason?: string | null }) => rpc("evt_set_status", { _id: id, _rev: q.data!.rev, _action: p.action, _reason: p.reason ?? null }),
    onSuccess: () => { toast.success("تم"); refresh(); }, onError: (e) => toast.error(arabicError(e)),
  });
  const link = useMutation({
    mutationFn: (a: string) => rpc("evt_link", { _id: id, _rev: q.data!.rev, _action: a }),
    onSuccess: () => { toast.success("تم"); refresh(); }, onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const it = q.data; const c = it.caps;
  const url = it.token && typeof window !== "undefined" ? `${window.location.origin}/join/${it.token}` : null;
  const tabs: [ITab, string][] = [["details", "التفاصيل"],
    ...(it.kind === "course" && c["apps"] ? [["apps", `الطلبات (${it.apps.total})`] as [ITab, string]] : []),
    ...(c["attend"] || c["apps"] || c["export"] ? [["people", it.kind === "course" ? `المقبولون والحضور (${it.apps.accepted})` : "المشاركون والحضور"] as [ITab, string]] : []),
    ...(it.kind === "trip" && c["consents"] ? [["consents", "موافقات أولياء الأمور"] as [ITab, string]] : []),
    ...(it.kind === "course" ? [["form", "إعدادات النموذج"] as [ITab, string]] : []),
    ...(it.kind === "course" && it.staff ? [["settings", "الإعدادات والتفويض"] as [ITab, string]] : []),
    ["log", "سجل التغييرات"]];
  const counts = it.kind === "course" ? (["new", "review", "info_needed", "accepted", "rejected", "cancelled"] as const) : [];
  return (
    <section className="mb-6 rounded-2xl border bg-card" aria-label={it.title}>
      <div className="flex flex-wrap items-start gap-2 border-b p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{KIND[it.kind]} · {it.school}{it.category ? ` · ${it.category}` : ""}</p>
          <h2 className="text-xl font-bold">{it.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><StatusPill s={it.status} />{it.kind === "course" && it.status === "published" && <span className="text-xs text-primary">{REG_STATE[it.reg_state]}</span>}</div>
        </div>
        <Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button>
      </div>
      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b p-3">
          {counts.map((s) => (
            <button key={s} type="button" onClick={() => { setStatusF(s); setTab(s === "accepted" ? "people" : "apps"); }} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
              {APP_STATUS[s]![0]}: <b>{it.apps[s]}</b>
            </button>
          ))}
          {it.capacity && <span className="rounded-lg bg-muted px-3 py-1.5 text-sm">المقاعد: <b>{it.apps.accepted}</b> / {it.capacity}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-1 border-b p-2" role="tablist">
        {tabs.map(([k, l]) => <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? "default" : "ghost"} onClick={() => { setTab(k); if (k !== "apps") openApp(undefined); }}>{l}</Button>)}
      </div>
      <div className="p-4">
        {tab === "details" && (editing ? <ItemForm kind={it.kind} school={it.school_id} item={it} onClose={() => setEditing(false)} onDone={() => { setEditing(false); refresh(); }} /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {c["edit"] && ["draft", "published"].includes(it.status) && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>تعديل</Button>}
              {c["publish"] && it.status === "draft" && <Button size="sm" disabled={act.isPending} onClick={async () => { if (await ask(it.kind === "course" ? "نشر الدورة؟ (التسجيل يُفتح بخطوة منفصلة)" : "نشر الفعالية وإشعار أولياء الأمور والطلاب المستهدفين؟")) act.mutate({ action: "publish" }); }}>نشر</Button>}
              {c["publish"] && it.kind === "course" && it.status === "published" && (it.reg_open
                ? <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "close_reg" })}>إغلاق التسجيل</Button>
                : <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ action: "open_reg" })}>فتح التسجيل</Button>)}
              {c["publish"] && it.status === "published" && <Button size="sm" variant="outline" disabled={act.isPending} onClick={async () => { if (await ask("تأكيد إكمال الفعالية؟ لن يمكن تعديلها بعد ذلك.")) act.mutate({ action: "complete" }); }}>إكمال</Button>}
              {c["publish"] && ["draft", "published"].includes(it.status) && <Button size="sm" variant="destructive" disabled={act.isPending} onClick={async () => { const r = await askText("سبب الإلغاء (يظهر للمتقدمين وأولياء الأمور):", { required: true, ok: "إلغاء الفعالية" }); if (r) act.mutate({ action: "cancel", reason: r }); }}>إلغاء</Button>}
              {c["publish"] && ["completed", "cancelled"].includes(it.status) && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "archive" })}>أرشفة</Button>}
            </div>
            <ItemFiles item={it.id} canEdit={!!c["edit"] && !["cancelled", "archived"].includes(it.status)} />
            {it.status === "cancelled" && <p className="rounded-lg bg-destructive/10 p-2 text-sm">سبب الإلغاء: {it.cancel_reason}</p>}
            {it.kind === "course" && it.status === "published" && it.form_version === 0 && <p className="rounded-lg bg-warning/15 p-2 text-sm">انشر نموذج التسجيل من تبويب «إعدادات النموذج» قبل فتح التسجيل.</p>}
            {it.kind === "course" && <RegChecklist it={it} />}
            {it.kind === "course" && url && (c["link"] || c["publish"]) && (
              <div className="rounded-xl border p-3">
                <p className="text-sm font-bold">رابط التسجيل {it.link_active ? <span className="text-success">(مفعّل)</span> : <span className="text-destructive">(موقوف)</span>}</p>
                <p dir="ltr" className="mt-1 break-all rounded bg-muted p-2 text-xs" data-testid="evt-link">{url}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(url); toast.success("نُسخ الرابط"); }}><Copy className="size-4" /> نسخ</Button>
                  <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> معاينة</a></Button>
                  {c["link"] && (it.link_active
                    ? <Button size="sm" variant="outline" onClick={() => link.mutate("disable")}>إيقاف الرابط</Button>
                    : <Button size="sm" variant="outline" onClick={() => link.mutate("enable")}>تفعيل الرابط</Button>)}
                  {c["link"] && <Button size="sm" variant="outline" onClick={async () => { if (await ask("تجديد الرابط يوقف الرابط القديم نهائيًا. متابعة؟")) link.mutate("renew"); }}><RefreshCw className="size-4" /> تجديد</Button>}
                </div>
                {it.audience === "internal" && <p className="mt-2 text-xs text-muted-foreground">الدورة لطلاب المدارس فقط: الرابط يعرض التفاصيل ويطلب الدخول بحساب ركاز للتسجيل.</p>}
              </div>
            )}
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Dt k="طريقة الحضور" v={MODE[it.mode] ?? it.mode} /><Dt k="المكان" v={it.location} />
              {it.kind === "course" ? <><Dt k="الفئة" v={AUDIENCE[it.audience]} /><Dt k="المدرب" v={it.trainer} /><Dt k="بداية التسجيل" v={fmtDT(it.reg_opens)} /><Dt k="نهاية التسجيل" v={fmtDT(it.reg_closes)} /></>
                : <><Dt k="الجمهور" v={it.target?.all ? "كل طلاب المدرسة" : `${it.target?.sections?.length ?? 0} شعبة`} /><Dt k="عدد الطلاب المستهدفين" v={String(it.targets ?? 0)} /></>}
              <Dt k="السعة" v={it.capacity ? String(it.capacity) : "غير محددة"} />
              {it.kind === "trip" && <><Dt k="موافقة ولي الأمر" v={it.consent_required ? `مطلوبة حتى ${fmtDT(it.consent_deadline)}` : "غير مطلوبة"} /><Dt k="الطوارئ / الإقرار الطبي" v={`${it.need_emergency ? "بيانات طوارئ" : "—"} · ${it.need_medical ? "إقرار طبي" : "—"}`} /></>}
              <Dt k="أنشأها" v={`${it.created_by} · ${fmtD(it.created_at)}`} />
            </dl>
            {it.extra_fields?.some((f) => f.kind !== "section") && (
              <div className="rounded-xl border p-3"><p className="mb-1 text-sm font-bold">بيانات إضافية</p>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{it.extra_fields.filter((f) => f.kind !== "section").map((f) => <Dt key={f.id} k={f.label} v={answerText(f, it.extra?.[f.id])} />)}</dl></div>
            )}
            <TplUpdate item={it} which="item" onDone={refresh} />
            {it.description && <p className="whitespace-pre-wrap text-sm">{it.description}</p>}
            {it.conditions && <div className="rounded-lg bg-muted p-3 text-sm"><b>الشروط والتعليمات</b><p className="whitespace-pre-wrap">{it.conditions}</p></div>}
            <div><p className="mb-1 text-sm font-bold">المواعيد</p>
              {it.session_list.length ? <ul className="space-y-1 text-sm">{it.session_list.map((s) => <li key={s.id}>{s.title ? `${s.title}: ` : ""}{fmtDT(s.starts_at)}{s.ends_at ? ` ← ${fmtDT(s.ends_at)}` : ""}</li>)}</ul> : <p className="text-sm text-muted-foreground">لا توجد مواعيد.</p>}</div>
          </div>
        ))}
        {tab === "apps" && <AppsTab item={it} status={statusF} setStatus={setStatusF} app={app} openApp={openApp} />}
        {tab === "people" && <PeopleTab item={it} />}
        {tab === "consents" && <ConsentsTab item={it} />}
        {tab === "form" && <FormEditor item={it.id} />}
        {tab === "settings" && <StaffTab item={it} />}
        {tab === "log" && <LogList log={it.log} />}
      </div>
    </section>
  );
}

function Dt({ k, v }: { k: string; v?: string | null | undefined }) { return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>; }

export function LogList({ log }: { log: { action: string; at: string; by: string | null; details: Record<string, unknown>; internal?: boolean }[] }) {
  if (!log.length) return <EmptyState title="لا يوجد سجل" />;
  return (
    <ol className="space-y-1.5 text-sm">
      {log.map((l, i) => (
        <li key={i} className="flex flex-wrap gap-2 border-b pb-1.5">
          <b>{LOG[l.action] ?? l.action}</b><span className="text-muted-foreground">{l.by ?? "المتقدم / النظام"}</span><span className="text-xs text-muted-foreground">{fmtDT(l.at)}</span>
          {l.internal && <span className="text-xs text-warning-foreground">(داخلي)</span>}
          {typeof l.details["reason"] === "string" && <span>السبب: {String(l.details["reason"])}</span>}
          {typeof l.details["text"] === "string" && <span>{String(l.details["text"])}</span>}
          {typeof l.details["message"] === "string" && <span>رسالة للمتقدم: {String(l.details["message"])}</span>}
          {l.action === "notify" && <span className="text-xs">{l.details["status"] === "sent" ? "أُرسل داخل ركاز" : "لا توجد قناة إرسال مهيأة للمتقدم الخارجي (يتابع برابط المتابعة)"}</span>}
          {l.action === "attend" && <span className="text-xs">{ATT[String(l.details["from"] ?? "")] ?? "—"} ← {ATT[String(l.details["to"] ?? "")] ?? "مسح"}</span>}
          {typeof l.details["user"] === "string" && <span>{String(l.details["user"])}</span>}
          {typeof l.details["student"] === "string" && <span>{String(l.details["student"])} · {l.details["decision"] === "approved" ? "موافقة" : "رفض"}</span>}
        </li>
      ))}
    </ol>
  );
}

// ---------------- applications ----------------
type AppRow = { id: string; rev: number; ref: string; item_id: string; item: string; school: string; category: string; source: string; name: string; phone: string | null; status: string; created_at: string; form_version: number };

export function AppsList({ org, school, item, status, setStatus, open, showItem }: { org: string; school?: string | null; item?: string | null; status: string; setStatus: (s: string) => void; open: (id: string, item: string) => void; showItem?: boolean }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [cat, setCat] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(0);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(0), [dq, cat, from, to, status, school, item]);
  const list = useQuery({
    queryKey: ["evt-apps", org, school ?? null, item ?? null, status, cat, dq, from, to, page], refetchInterval: 20_000,
    queryFn: () => rpc<{ total: number; rows: AppRow[] }>("evt_apps", { _org: org, _school: school ?? null, _item: item ?? null, _status: status || null, _cat: cat || null, _q: dq || null, _from: from || null, _to: to || null, _limit: 50, _offset: page * 50 }),
  });
  const rows = list.data?.rows ?? [];
  const exp = (kind: "x" | "p" | "pr") => {
    const h = ["الرقم المرجعي", "الدورة", "المدرسة", "المشارك", "الفئة", "المصدر", "الحالة", "تاريخ الإرسال"];
    const r = rows.map((a) => [a.ref, a.item, a.school, a.name, CATEGORY[a.category] ?? a.category, SOURCE[a.source] ?? a.source, APP_STATUS[a.status]?.[0] ?? a.status, fmtDT(a.created_at)]);
    const m = { title: "طلبات التسجيل", filters: [status && APP_STATUS[status]?.[0], cat && CATEGORY[cat], dq && `بحث: ${dq}`, from && `من ${from}`, to && `إلى ${to}`].filter(Boolean) as string[], note: "لا تتضمن أرقام الجوال حمايةً للبيانات الشخصية." };
    if (kind === "x") exportXlsx(m, h, r); else if (kind === "p") void exportPdf(m, h, r); else printReport(m, h, r);
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="h-9 w-56" aria-label="بحث" placeholder="الاسم أو الرقم المرجعي أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="الحالة" className={sm} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(APP_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="الفئة" className={sm} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">كل الفئات</option><option value="internal">داخلي</option><option value="external">خارجي</option></select>
        <Input className="h-9 w-40" type="date" aria-label="من تاريخ" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input className="h-9 w-40" type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="ms-auto flex gap-1"><Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exp("x")}>Excel</Button><Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exp("p")}>PDF</Button><Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exp("pr")}>طباعة</Button></span>
      </div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !rows.length ? <EmptyState title="لا توجد طلبات" hint="تظهر هنا الطلبات فور إرسالها من الرابط أو من حسابات ركاز." /> : (
        <>
          <ul className="divide-y rounded-xl border bg-card">
            {rows.map((a) => (
              <li key={a.id}><button type="button" onClick={() => open(a.id, a.item_id)} className="flex w-full flex-wrap items-center gap-2 p-3 text-start text-sm hover:bg-muted">
                <span className="font-medium">{a.name}</span><span dir="ltr" className="text-xs text-muted-foreground">{a.ref}</span>
                {showItem && <span className="text-xs">{a.item} · {a.school}</span>}
                <span className="text-xs text-muted-foreground">{CATEGORY[a.category]} · {SOURCE[a.source]} · {fmtDT(a.created_at)}</span>
                <span className="ms-auto"><AppPill s={a.status} /></span>
              </button></li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2 text-sm"><span>{list.data!.total} طلب</span>
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * 50 >= list.data!.total} onClick={() => setPage(page + 1)}>التالي</Button></div>
        </>
      )}
    </div>
  );
}

function AppsTab({ item, status, setStatus, app, openApp }: { item: EvtItem; status: string; setStatus: (s: string) => void; app?: string | undefined; openApp: (a: string | undefined) => void }) {
  return app ? <AppDetail id={app} onClose={() => openApp(undefined)} /> : <AppsList org={item.org_id} item={item.id} status={status} setStatus={setStatus} open={(id) => openApp(id)} />;
}

type AppFull = { id: string; rev: number; ref: string; status: string; category: string; source: string; form_version: number; current_version: number; fields: Field[]; answers: Record<string, unknown>;
  name: string; phone: string | null; email: string | null; birth_date: string | null; guardian_name: string | null; student: string | null; reason_internal: string | null; applicant_message: string | null;
  created_at: string; decided_by: string | null; decided_at: string | null; item: { id: string; title: string; school: string; capacity: number | null; status: string; accepted: number };
  caps: { review: boolean; decide: boolean }; notes: { body: string; by: string; at: string }[]; log: { action: string; at: string; by: string | null; details: Record<string, unknown>; internal: boolean }[] };

export function AppDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["evt-app", id], queryFn: () => rpc<AppFull>("evt_app_get", { _id: id }) });
  const refresh = useEvtRefresh();
  const [note, setNote] = useState("");
  const act = useMutation({
    mutationFn: (p: { action: string; internal?: string | null; message?: string | null }) => rpc<{ already?: boolean }>("evt_app_act", { _id: id, _rev: q.data!.rev, _action: p.action, _internal: p.internal ?? null, _message: p.message ?? null }),
    onSuccess: (r) => { toast.success(r?.already ? "نُفذ القرار مسبقًا" : "تم"); refresh(); void flushEvtMessagesFn({data:{app:id}}).catch(() => undefined); }, onError: (e) => { toast.error(arabicError(e)); refresh(); },
  });
  const addNote = useMutation({ mutationFn: () => rpc("evt_app_note", { _id: id, _body: note }), onSuccess: () => { setNote(""); refresh(); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data; const busy = act.isPending;
  const open = ["new", "review", "info_needed"].includes(a.status);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>→ كل الطلبات</Button>
        <h3 className="text-lg font-bold">{a.name}</h3><span dir="ltr" className="text-sm text-muted-foreground">{a.ref}</span><AppPill s={a.status} />
      </div>
      <p className="text-xs text-muted-foreground">{a.item.title} · {a.item.school} · {CATEGORY[a.category]} · {SOURCE[a.source]} · أُرسل {fmtDT(a.created_at)} · نموذج الإصدار {a.form_version}{a.form_version !== a.current_version ? ` (الحالي ${a.current_version})` : ""}</p>
      <div className="flex flex-wrap gap-2">
        {a.caps.review && a.status === "new" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act.mutate({ action: "review" })}>بدء المراجعة</Button>}
        {a.caps.review && ["new", "review"].includes(a.status) && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const m = await askText("ما المطلوب من المتقدم استكماله؟ (تظهر له)", { required: true, ok: "طلب الاستكمال" }); if (m) act.mutate({ action: "info", message: m }); }}>طلب استكمال</Button>}
        {a.caps.decide && open && <Button size="sm" disabled={busy} onClick={async () => { if (await ask(`قبول ${a.name}؟ يحجز مقعدًا${a.item.capacity ? ` (${a.item.accepted}/${a.item.capacity})` : ""}.`)) act.mutate({ action: "accept" }); }}>قبول</Button>}
        {a.caps.decide && open && <Button size="sm" variant="destructive" disabled={busy} onClick={async () => {
          const r = await askText("سبب الرفض (داخلي، لا يظهر للمتقدم):", { required: true, ok: "التالي" }); if (!r) return;
          const m = await askText("رسالة للمتقدم (اختياري — اتركها فارغة للرسالة العامة):", { ok: "رفض الطلب" }); if (m === null) return;
          act.mutate({ action: "reject", internal: r, message: m || null });
        }}>رفض</Button>}
        {a.caps.decide && a.status === "accepted" && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const r = await askText("سبب إلغاء التسجيل (داخلي):", { required: true, ok: "إلغاء التسجيل" }); if (r) act.mutate({ action: "cancel", internal: r }); }}>إلغاء التسجيل</Button>}
        {a.caps.decide && ["accepted", "rejected", "cancelled"].includes(a.status) && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const r = await askText("سبب إعادة النظر:", { required: true, ok: "إعادة إلى المراجعة" }); if (r) act.mutate({ action: "reconsider", internal: r }); }}>إعادة النظر</Button>}
      </div>
      {a.applicant_message && <p className="rounded-lg bg-muted p-2 text-sm">آخر رسالة للمتقدم: {a.applicant_message}</p>}
      {a.reason_internal && <p className="rounded-lg border border-warning/50 p-2 text-sm">سبب داخلي: {a.reason_internal}</p>}
      <div className="rounded-xl border p-3">
        <p className="mb-2 text-sm font-bold">إجابات النموذج (كما أُرسلت)</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {a.student && <Dt k="الطالب (من سجل المدرسة)" v={a.student} />}
          {a.fields.filter((f) => f.kind !== "section").map((f) => <Dt key={f.id} k={f.label} v={answerText(f, a.answers[f.id])} />)}
        </dl>
      </div>
      <AppFiles app={a.id} labels={Object.fromEntries(a.fields.map((f) => [f.id, f.label]))} />
      <div className="rounded-xl border p-3">
        <p className="mb-2 text-sm font-bold">ملاحظات داخلية</p>
        {a.notes.length ? <ul className="mb-2 space-y-1 text-sm">{a.notes.map((n, i) => <li key={i}>{n.body} <span className="text-xs text-muted-foreground">— {n.by} · {fmtDT(n.at)}</span></li>)}</ul> : <p className="mb-2 text-sm text-muted-foreground">لا توجد.</p>}
        {a.caps.review && <div className="flex gap-2"><Input aria-label="ملاحظة داخلية" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /><Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>إضافة</Button></div>}
      </div>
      <div><p className="mb-2 text-sm font-bold">سجل الطلب</p><LogList log={a.log} /></div>
    </div>
  );
}

// ---------------- participants & attendance ----------------
type Roster = { can_mark: boolean; sessions: { id: string; seq: number; title: string | null; starts_at: string }[];
  people: { app_id: string | null; student_id: string | null; name: string; category: string; source: string; extra: string | null }[];
  marks: { session_id: string; app_id: string | null; student_id: string | null; status: string }[] };

function PeopleTab({ item }: { item: EvtItem }) {
  const q = useQuery({ queryKey: ["evt-roster", item.id], queryFn: () => rpc<Roster>("evt_roster", { _item: item.id }) });
  const [sid, setSid] = useState<string>("");
  const refresh = useEvtRefresh();
  const mark = useMutation({
    mutationFn: (p: { app: string | null; student: string | null; status: string | null }) => rpc("evt_mark", { _session: sid, _app: p.app, _student: p.app ? null : p.student, _status: p.status }),
    onSuccess: () => refresh(), onError: (e) => toast.error(arabicError(e)),
  });
  const r = q.data;
  useEffect(() => { if (r?.sessions.length && !sid) setSid(r.sessions[0]!.id); }, [r, sid]);
  const markOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of r?.marks ?? []) m.set(`${x.session_id}|${x.app_id ?? x.student_id}`, x.status);
    return m;
  }, [r]);
  if (q.isLoading) return <LoadingState />;
  if (q.error || !r) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const exp = (kind: "x" | "p" | "pr") => {
    const h = ["المشارك", "الفئة", "المصدر", item.kind === "course" ? "الرقم المرجعي" : "الشعبة", ...r.sessions.map((s, i) => s.title || `الجلسة ${i + 1}`)];
    const rows = r.people.map((p) => [p.name, CATEGORY[p.category] ?? p.category, SOURCE[p.source] ?? p.source, p.extra ?? "", ...r.sessions.map((s) => ATT[markOf.get(`${s.id}|${p.app_id ?? p.student_id}`) ?? ""] ?? "—")]);
    const m = { title: `كشف المشاركين — ${item.title}`, school: item.school, filters: [] as string[] };
    if (kind === "x") exportXlsx(m, h, rows); else if (kind === "p") void exportPdf(m, h, rows); else printReport(m, h, rows);
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {r.sessions.length > 0 && <select aria-label="الجلسة" className={sm} value={sid} onChange={(e) => setSid(e.target.value)}>{r.sessions.map((s, i) => <option key={s.id} value={s.id}>{s.title || `الجلسة ${i + 1}`} — {fmtDT(s.starts_at)}</option>)}</select>}
        <span className="text-sm text-muted-foreground">{r.people.length} مشارك{item.kind === "trip" && item.consent_required ? " (الموافَق عليهم فقط)" : ""}</span>
        <span className="ms-auto flex gap-1"><Button size="sm" variant="outline" disabled={!r.people.length} onClick={() => exp("x")}>Excel</Button><Button size="sm" variant="outline" disabled={!r.people.length} onClick={() => exp("p")}>PDF</Button><Button size="sm" variant="outline" disabled={!r.people.length} onClick={() => exp("pr")}>طباعة</Button></span>
      </div>
      {!r.people.length ? <EmptyState title="لا يوجد مشاركون بعد" hint={item.kind === "course" ? "يظهر هنا المقبولون فقط." : "يظهر هنا الطلاب المستهدفون (والموافَق عليهم عند اشتراط الموافقة)."} /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {r.people.map((p) => {
            const k = p.app_id ?? p.student_id!; const cur = markOf.get(`${sid}|${k}`) ?? "";
            return (
              <li key={k} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-medium">{p.name}</span><span className="text-xs text-muted-foreground">{CATEGORY[p.category]} · {SOURCE[p.source]}{p.extra ? ` · ${p.extra}` : ""}</span>
                <span className="ms-auto flex flex-wrap gap-1">
                  {r.can_mark && sid ? (["present", "late", "absent", "excused"] as const).map((s) => (
                    <Button key={s} size="sm" variant={cur === s ? "default" : "outline"} disabled={mark.isPending} aria-pressed={cur === s} onClick={() => mark.mutate({ app: p.app_id, student: p.student_id, status: cur === s ? null : s })}>{ATT[s]}</Button>
                  )) : <span className="text-xs">{ATT[cur] ?? "—"}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------- trip consents ----------------
type Consent = { student_id: string; student: string; section: string | null; decision: string | null; at: string | null; by: string | null; emergency_name: string | null; emergency_phone: string | null; medical_ack: boolean | null; medical_note: string | null };

function ConsentsTab({ item }: { item: EvtItem }) {
  const q = useQuery({ queryKey: ["evt-consents", item.id], refetchInterval: 20_000, queryFn: () => rpc<Consent[]>("evt_consents", { _item: item.id }) });
  const [f, setF] = useState<"" | "approved" | "declined" | "none">("");
  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const all = q.data; const n = (d: string | null) => all.filter((x) => x.decision === d).length;
  const rows = all.filter((x) => !f || (f === "none" ? !x.decision : x.decision === f));
  const exp = () => exportXlsx({ title: `موافقات الرحلة — ${item.title}`, school: item.school, filters: [] }, ["الطالب", "الشعبة", "الرد", "ولي الأمر", "وقت الرد", "طوارئ", "جوال الطوارئ", "إقرار طبي", "ملاحظات صحية"],
    rows.map((x) => [x.student, x.section ?? "", x.decision === "approved" ? "موافق" : x.decision === "declined" ? "رافض" : "لم يرد", x.by ?? "", x.at ? fmtDT(x.at) : "", x.emergency_name ?? "", x.emergency_phone ?? "", x.medical_ack ? "نعم" : "", x.medical_note ?? ""]));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {([["", `الكل (${all.length})`], ["approved", `موافق (${n("approved")})`], ["declined", `رافض (${n("declined")})`], ["none", `لم يرد (${n(null)})`]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={f === k ? "default" : "outline"} onClick={() => setF(k)}>{l}</Button>
        ))}
        <Button size="sm" variant="outline" className="ms-auto" disabled={!rows.length} onClick={exp}>Excel</Button>
      </div>
      {item.consent_deadline && <p className="mb-2 text-xs text-muted-foreground">آخر موعد للرد: {fmtDT(item.consent_deadline)}</p>}
      {!rows.length ? <EmptyState title="لا توجد سجلات" /> : (
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {rows.map((x) => (
            <li key={x.student_id} className="flex flex-wrap items-center gap-2 p-3">
              <span className="font-medium">{x.student}</span><span className="text-xs text-muted-foreground">{x.section}</span>
              {x.decision && <span className="text-xs text-muted-foreground">{x.by} · {fmtDT(x.at)}</span>}
              {x.emergency_name && <span className="text-xs">طوارئ: {x.emergency_name} <span dir="ltr">{x.emergency_phone}</span></span>}
              {x.medical_note && <span className="text-xs">صحي: {x.medical_note}</span>}
              <span className={`ms-auto text-xs font-semibold ${x.decision === "approved" ? "text-success" : x.decision === "declined" ? "text-destructive" : "text-muted-foreground"}`}>{x.decision === "approved" ? "موافق" : x.decision === "declined" ? "رافض" : "لم يرد"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- delegation ----------------
function StaffTab({ item }: { item: EvtItem }) {
  const refresh = useEvtRefresh();
  const [pick, setPick] = useState<string[]>([]);
  const [caps, setCaps] = useState<string[]>(["apps"]);
  const setS = useMutation({ mutationFn: (p: { user: string; caps: string[] }) => rpc("evt_staff_set", { _item: item.id, _user: p.user, _caps: p.caps }),
    onSuccess: () => { toast.success("تم"); setPick([]); refresh(); }, onError: (e) => toast.error(arabicError(e)) });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">فوّض موظفًا من كادر المدرسة لإدارة هذه الدورة فقط. يتحقق الخادم من التفويض في كل إجراء؛ سحبه يسري فورًا حتى لو كانت صفحته مفتوحة.</p>
      {item.staff?.length ? (
        <ul className="divide-y rounded-xl border bg-card text-sm">{item.staff.map((s) => (
          <li key={s.user_id} className="flex flex-wrap items-center gap-2 p-3"><span className="font-medium">{s.name}</span><span className="text-xs text-muted-foreground">{s.caps.map((c) => STAFF_CAPS[c]).join("، ")}</span>
            <Button size="sm" variant="ghost" className="ms-auto" onClick={async () => { if (await ask(`سحب تفويض ${s.name}؟`, { destructive: true })) setS.mutate({ user: s.user_id, caps: [] }); }}>سحب التفويض</Button></li>
        ))}</ul>
      ) : <EmptyState title="لا يوجد موظفون مفوضون" />}
      <div className="space-y-3 rounded-xl border p-3">
        <PeoplePicker purpose="evt_staff" school={item.school_id} value={pick} onChange={setPick} single label="الموظف" compact />
        <div className="flex flex-wrap gap-3 text-sm">{Object.entries(STAFF_CAPS).map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={caps.includes(k)} onChange={() => setCaps(caps.includes(k) ? caps.filter((x) => x !== k) : [...caps, k])} /> {l}</label>)}</div>
        <Button size="sm" disabled={!pick.length || !caps.length || setS.isPending} onClick={() => setS.mutate({ user: pick[0]!, caps })}>حفظ التفويض</Button>
      </div>
    </div>
  );
}

/** Registration status with what is still needed to accept applications through the link. */
export function RegChecklist({ it }: { it: EvtItem }) {
  const now = Date.now();
  const steps: [boolean, string][] = [
    [it.status === "published", "نشر الدورة"],
    [it.form_version > 0, "نموذج طلبات التسجيل مرتبط"],
    [it.reg_open, "فتح التسجيل"],
    [!it.reg_opens || new Date(it.reg_opens).getTime() <= now, "بدأت فترة التسجيل"],
    [!it.reg_closes || new Date(it.reg_closes).getTime() > now, "لم تنتهِ فترة التسجيل"],
    [it.link_active, "رابط التسجيل مفعّل"],
  ];
  return (
    <div className="rounded-xl border p-3 text-sm">
      <p className="font-bold">حالة التسجيل: <span className="text-primary">{REG_STATE[it.reg_state] ?? it.reg_state}</span></p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">{steps.map(([ok, l]) => <li key={l} className={ok ? "text-success" : "text-muted-foreground"}>{ok ? "✓" : "○"} {l}</li>)}</ul>
    </div>
  );
}
