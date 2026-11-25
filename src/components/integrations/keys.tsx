import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pause, Pencil, Play, Plus, RotateCw, Ban, History, Info, Settings2, Building2, Database, ShieldCheck, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ask, askText } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { act, Badge, Card, fmt, KEY_STATUS, rpc, SCOPE_TYPES, SecretDialog, useCatalog, useDirectory, type Row, type ScopeType } from "./shared";
import { ResourceTree, scopeOn, type Scope } from "./resource-tree";

type Opt = { id: string; name: string; school_id?: string; year_id?: string; stage_id?: string; grade_id?: string };
type Opts = { schools: Opt[]; years: Opt[]; terms: Opt[]; stages: Opt[]; grades: Opt[]; sections: Opt[] };
type Draft = {
  id: string | null; rev?: number; scope_type: ScopeType; all_schools: boolean; name: string; system_name: string; description: string; env: "test" | "live"; direction: string; master: string; on_conflict: string;
  school_ids: string[]; year_ids: string[]; term_ids: string[]; stage_ids: string[]; grade_ids: string[]; section_ids: string[];
  scopes: Record<string, Scope>; starts_at: string; expires_at: string; rate_min: number; rate_day: number; ip_allow: string;
};
const DIR: Record<string, string> = { out: "إرسال من ركاز فقط (قراءة)", in: "استقبال في ركاز فقط (كتابة)", both: "الاتجاهين" };
const day = (t?: string | null) => (t ? t.slice(0, 10) : "");

export function useKeys(orgId: string) {
  return useQuery({ queryKey: ["api", "keys", orgId], queryFn: () => rpc<Row[]>("api_keys_list", { _org: orgId }) });
}

function fromRow(k: Row | null): Draft {
  return {
    id: k?.["id"] ?? null, rev: k?.["rev"], scope_type: k?.["scope_type"] ?? "schools", all_schools: k ? !!k["all_schools"] : false, name: k?.["name"] ?? "", system_name: k?.["system_name"] ?? "", description: k?.["description"] ?? "", env: k?.["env"] ?? "test",
    direction: k?.["direction"] ?? "out", master: k?.["master"] ?? "rikaz", on_conflict: k?.["on_conflict"] ?? "reject",
    school_ids: k?.["school_ids"] ?? [], year_ids: k?.["year_ids"] ?? [], term_ids: k?.["term_ids"] ?? [], stage_ids: k?.["stage_ids"] ?? [], grade_ids: k?.["grade_ids"] ?? [], section_ids: k?.["section_ids"] ?? [],
    scopes: (k?.["scopes"] ?? {}) as Record<string, Scope>, starts_at: day(k?.["starts_at"]), expires_at: day(k?.["expires_at"]),
    rate_min: k?.["rate_min"] ?? 60, rate_day: k?.["rate_day"] ?? 10000, ip_allow: ((k?.["ip_allow"] ?? []) as string[]).join("\n"),
  };
}

export function KeysTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const keys = useKeys(orgId);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [hist, setHist] = useState<Row | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["api"] });
  const status = async (k: Row, s: string, msg: string) => {
    const reason = await askText(msg, { required: true, ok: "تأكيد" });
    if (!reason) return;
    if (await act("api_key_status", { _id: k["id"], _status: s, _reason: reason }, "تم تحديث الحالة")) refresh();
  };
  const rotate = async (k: Row) => {
    const g = await askText("فترة السماح بالمفتاح القديم بالدقائق (0 = إيقافه فورًا، حتى 1440):", { required: true, initial: "60", ok: "متابعة" });
    if (g === null) return;
    const reason = await askText("سبب تدوير المفتاح:", { required: true });
    if (!reason) return;
    const r = await act<{ secret: string }>("api_key_rotate", { _id: k["id"], _grace_min: Number(g), _reason: reason }, "أُنشئ مفتاح جديد");
    if (r) { setSecret(r.secret); refresh(); }
  };
  if (keys.isLoading) return <LoadingState rows={3} />;
  if (keys.error) return <ErrorState message={arabicError(keys.error)} onRetry={() => keys.refetch()} />;
  const list = keys.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEdit(fromRow(null))}><Plus className="ms-1 h-4 w-4" />مفتاح جديد</Button></div>
      {!list.length && <EmptyState title="لا توجد مفاتيح بعد" hint="أنشئ مفتاح اختبار أولًا وجرّبه في المستكشف قبل إصدار مفتاح إنتاج." />}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((k) => {
          const expired = k["expires_at"] && new Date(k["expires_at"]) <= new Date();
          const res = Object.entries((k["scopes"] ?? {}) as Record<string, Scope>).filter(([, s]) => scopeOn(s));
          const st = SCOPE_TYPES.find((x) => x.k === k["scope_type"]);
          return (
            <Card key={k["id"]} title={k["name"]} action={<div className="flex gap-1"><Badge cls={k["env"] === "live" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>{k["env"] === "live" ? "إنتاج" : "اختبار"}</Badge><Badge cls={k["status"] === "active" && !expired ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>{expired && k["status"] === "active" ? "منتهي" : KEY_STATUS[k["status"]]}</Badge></div>}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">النظام</dt><dd>{k["system_name"]}</dd>
                <dt className="text-muted-foreground">المفتاح</dt><dd dir="ltr" className="text-end font-mono">rk_{k["env"]}_{k["key_hint"]}</dd>
                <dt className="text-muted-foreground">الاتجاه</dt><dd>{DIR[k["direction"]]}</dd>
                <dt className="text-muted-foreground">نوع المفتاح</dt><dd>{st?.l ?? "مفتاح مدارس"}</dd>
                <dt className="text-muted-foreground">المدارس</dt><dd>{k["scope_type"] === "central" ? "الإدارة المركزية" : k["all_schools"] ? "جميع المدارس" : `${k["school_ids"]?.length ?? 0} مدرسة`}</dd>
                <dt className="text-muted-foreground">الموارد</dt><dd>{res.length}</dd>
                <dt className="text-muted-foreground">الحد</dt><dd>{k["rate_min"]}/دقيقة · {k["rate_day"]}/يوم</dd>
                <dt className="text-muted-foreground">الانتهاء</dt><dd>{k["expires_at"] ? fmt(k["expires_at"]) : "بلا انتهاء"}</dd>
                <dt className="text-muted-foreground">آخر استخدام</dt><dd>{fmt(k["last_used_at"])} ({k["request_count"]} طلب)</dd>
              </dl>
              {k["grace_active"] && <p className="mt-2 text-xs text-warning-foreground">المفتاح السابق ما زال يعمل حتى {fmt(k["prev_until"])}</p>}
              {k["status"] !== "revoked" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setEdit(fromRow(k))}><Pencil className="ms-1 h-3.5 w-3.5" />تعديل</Button>
                  <Button size="sm" variant="outline" onClick={() => rotate(k)}><RotateCw className="ms-1 h-3.5 w-3.5" />تدوير</Button>
                  {k["status"] === "active" ? <Button size="sm" variant="outline" onClick={() => status(k, "paused", "سبب الإيقاف المؤقت:")}><Pause className="ms-1 h-3.5 w-3.5" />إيقاف</Button>
                    : <Button size="sm" variant="outline" onClick={() => status(k, "active", "سبب إعادة التفعيل:")}><Play className="ms-1 h-3.5 w-3.5" />تفعيل</Button>}
                  <Button size="sm" variant="outline" className="text-destructive" onClick={async () => { if (await ask("إلغاء المفتاح نهائي ويعطّل إشعاراته. متابعة؟", { destructive: true })) status(k, "revoked", "سبب الإلغاء:"); }}><Ban className="ms-1 h-3.5 w-3.5" />إلغاء</Button>
                  <Button size="sm" variant="ghost" onClick={() => setHist(k)}><History className="ms-1 h-3.5 w-3.5" />السجل</Button>
                </div>
              )}
              {k["status"] === "revoked" && <div className="mt-3"><Button size="sm" variant="ghost" onClick={() => setHist(k)}><History className="ms-1 h-3.5 w-3.5" />السجل</Button></div>}
            </Card>
          );
        })}
      </div>
      {edit && <KeyForm orgId={orgId} draft={edit} onClose={() => setEdit(null)} onSaved={(s) => { setEdit(null); refresh(); if (s) setSecret(s); }} />}
      <SecretDialog secret={secret} onClose={() => setSecret(null)} title="انسخ المفتاح الآن" note="يظهر المفتاح مرة واحدة فقط؛ ركاز يحفظ بصمته فقط ولا يمكنه عرضه مجددًا. أرسله لمسؤول النظام الآخر بقناة آمنة." />
      {hist && <HistoryDialog k={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function HistoryDialog({ k, onClose }: { k: Row; onClose: () => void }) {
  const q = useQuery({ queryKey: ["api", "changes", k["id"]], queryFn: () => rpc<Row[]>("api_key_changes", { _id: k["id"] }) });
  const A: Record<string, string> = { create: "إنشاء", update: "تعديل", rotate: "تدوير", "status:paused": "إيقاف", "status:active": "تفعيل", "status:revoked": "إلغاء", webhook_create: "إضافة Webhook", webhook_update: "تعديل Webhook", webhook_rotate: "تدوير سر Webhook" };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader><DialogTitle>سجل تغييرات «{k["name"]}»</DialogTitle></DialogHeader>
        {q.isLoading ? <LoadingState rows={2} /> : (
          <ul className="max-h-[60vh] space-y-2 overflow-auto text-sm">
            {(q.data ?? []).map((c) => <li key={c["id"]} className="rounded-md border p-2"><div className="flex justify-between"><b>{A[c["action"]] ?? c["action"]}</b><span className="text-xs text-muted-foreground">{fmt(c["at"])} — {c["actor"]}</span></div>{c["reason"] && <p className="text-xs text-muted-foreground">السبب: {c["reason"]}</p>}</li>)}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ n, icon: Icon, title, hint, children }: { n: number; icon: LucideIcon; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h4 className="font-display text-sm font-bold"><span className="text-muted-foreground">{n}. </span>{title}</h4>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50 hover:bg-primary/5"}`;

/** Multi-select chips; options are grouped per school so repeated names (e.g. the same year in each branch) stay distinguishable. */
function Multi({ label, opts, value, onChange, hint, schools }: { label: string; opts: Opt[]; value: string[]; onChange: (v: string[]) => void; hint: string; schools: Opt[] }) {
  if (!opts.length) return null;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const byS = new Map<string, Opt[]>();
  for (const o of opts) byS.set(o.school_id ?? "", [...(byS.get(o.school_id ?? "") ?? []), o]);
  const grouped = byS.size > 1;
  const sName = (id: string) => schools.find((x) => x.id === id)?.name ?? "";
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="text-xs font-bold">{label}</Label>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={value.length ? "rounded-full bg-primary/10 px-2 py-0.5 text-primary" : "text-muted-foreground"}>{value.length ? `${value.length} محدد` : hint}</span>
          {value.length > 0 && <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => onChange([])}>مسح</button>}
        </div>
      </div>
      <div className="max-h-36 space-y-2 overflow-auto">
        {[...byS.entries()].map(([sid, list]) => (
          <div key={sid}>
            {grouped && <div className="mb-1 text-[11px] font-medium text-muted-foreground">{sName(sid) || "عام"}</div>}
            <div className="flex flex-wrap gap-1.5">{list.map((o) => <button type="button" key={o.id} onClick={() => toggle(o.id)} className={chip(value.includes(o.id))}>{o.name}</button>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyForm({ orgId, draft, onClose, onSaved }: { orgId: string; draft: Draft; onClose: () => void; onSaved: (secret: string | null) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const cat = useCatalog();
  const opts = useQuery({ queryKey: ["api", "opts", orgId], queryFn: () => rpc<Opts>("api_key_scope_options", { _org: orgId }) });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const dir = useDirectory(orgId);
  const disabled = useMemo(() => new Set(((dir.data?.["resources"] ?? []) as Row[]).filter((r) => r["enabled"] === false).map((r) => r["key"] as string)), [dir.data]);
  const central = d.scope_type === "central";
  const inSch = (o: Opt) => d.all_schools || (o.school_id ? d.school_ids.includes(o.school_id) : true);
  const pick = (sel: string[], id?: string) => !sel.length || (!!id && sel.includes(id));
  /** Changing a parent list drops children that no longer belong to it (school → year → term, school → stage → grade → section). */
  const setScope = (patch: Partial<Draft>) => setD((x) => {
    const n = { ...x, ...patch };
    const o = opts.data; if (!o) return n;
    const okS = (v: Opt) => n.all_schools || (!!v.school_id && n.school_ids.includes(v.school_id));
    n.year_ids = n.year_ids.filter((id) => { const v = o.years.find((y) => y.id === id); return !!v && okS(v); });
    n.term_ids = n.term_ids.filter((id) => { const v = o.terms.find((y) => y.id === id); return !!v && okS(v) && pick(n.year_ids, v.year_id); });
    n.stage_ids = n.stage_ids.filter((id) => { const v = o.stages.find((y) => y.id === id); return !!v && okS(v); });
    n.grade_ids = n.grade_ids.filter((id) => { const v = o.grades.find((y) => y.id === id); return !!v && okS(v) && pick(n.stage_ids, v.stage_id); });
    n.section_ids = n.section_ids.filter((id) => { const v = o.sections.find((y) => y.id === id); return !!v && okS(v) && pick(n.grade_ids, v.grade_id); });
    return n;
  });
  const setSc = (k: string, s: Scope) => set("scopes", { ...d.scopes, [k]: s });
  const setType = (t: ScopeType) => setD((x) => {
    const keep = Object.fromEntries(Object.entries(x.scopes).filter(([k]) => { const r = cat.data?.find((c) => c.key === k); return t === "mixed" || (r?.area ?? "school") === (t === "central" ? "central" : "school"); }));
    return { ...x, scope_type: t, scopes: keep };
  });
  const active = Object.entries(d.scopes).filter(([, x]) => scopeOn(x));
  const nFields = active.reduce((a, [, x]) => a + x.fields.filter((f) => f !== "id").length + 1, 0);
  const resSchools = (o: Opts | undefined) => (o?.schools ?? []).filter((x) => d.all_schools || central || d.school_ids.includes(x.id));
  const save = async () => {
    if (d.name.trim().length < 2 || d.system_name.trim().length < 2) { toast.error("أدخل اسم المفتاح واسم النظام"); return; }
    let reason: string | null = null;
    if (d.id) { reason = await askText("سبب التعديل (يُحفظ في سجل المفتاح):", { required: true }); if (!reason) return; }
    const live = d.env === "live" && !d.id;
    if (live && !(await ask("مفتاح الإنتاج يتعامل مع بيانات حقيقية ويحفظ عمليات الكتابة. متابعة؟"))) return;
    setBusy(true);
    if (!central && !d.all_schools && !d.school_ids.length) { setBusy(false); toast.error("اختر مدرسة واحدة على الأقل أو «جميع المدارس» صراحة"); return; }
    const scopes = Object.fromEntries(active);
    const p = {
      ...d, scopes, ip_allow: d.ip_allow.split(/\s+/).filter(Boolean), starts_at: d.starts_at || null, expires_at: d.expires_at || null,
      school_ids: central || d.all_schools ? null : d.school_ids, year_ids: d.year_ids.length ? d.year_ids : null, term_ids: d.term_ids.length ? d.term_ids : null,
      stage_ids: d.stage_ids.length ? d.stage_ids : null, grade_ids: d.grade_ids.length ? d.grade_ids : null, section_ids: d.section_ids.length ? d.section_ids : null,
    };
    const r = await act<{ secret?: string }>("api_key_save", { _org: orgId, _id: d.id, _p: p, _reason: reason }, d.id ? "حُفظ التعديل" : "أُنشئ المفتاح");
    setBusy(false);
    if (r) onSaved(r.secret ?? null);
  };
  const o = opts.data;
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent dir="rtl" className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4 text-start">
          <DialogTitle className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><KeyRound className="h-4 w-4" /></span>{d.id ? "تعديل مفتاح" : "مفتاح API جديد"}</DialogTitle>
          <p className="text-xs text-muted-foreground">حدّد هوية النظام، ثم نطاق البيانات، ثم الموارد والحقول، وأخيرًا حدود الأمان.</p>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/30 px-6 py-5">
          <Section n={1} icon={Info} title="بيانات المفتاح" hint="اسم واضح يدل على النظام والغرض.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>اسم المفتاح</Label><Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="مثال: تطبيق الجوال — قراءة" /></div>
              <div><Label>اسم النظام الخارجي</Label><Input value={d.system_name} onChange={(e) => set("system_name", e.target.value)} placeholder="مثال: نظام نور، الموقع الإلكتروني" /></div>
              <div className="sm:col-span-2"><Label>الوصف</Label><Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="ما الذي يفعله هذا التكامل؟" /></div>
            </div>
          </Section>

          <Section n={2} icon={Settings2} title="طريقة الربط">
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {(["test", "live"] as const).map((e) => (
                <button type="button" key={e} disabled={!!d.id} onClick={() => set("env", e)} className={`rounded-lg border p-3 text-start transition-colors disabled:opacity-70 ${d.env === e ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/40"}`}>
                  <div className="text-sm font-bold">{e === "test" ? "اختبار" : "إنتاج"}</div>
                  <div className="text-xs text-muted-foreground">{e === "test" ? "تحقق كامل دون حفظ أي تغيير" : "بيانات حقيقية وتُحفظ عمليات الكتابة"}</div>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1"><Label className="text-xs">اتجاه البيانات</Label><select className={`${selectCls()} w-full`} value={d.direction} onChange={(e) => set("direction", e.target.value)}>{Object.entries(DIR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="flex flex-col gap-1"><Label className="text-xs">المصدر المعتمد للبيانات</Label><select className={`${selectCls()} w-full`} value={d.master} onChange={(e) => set("master", e.target.value)}><option value="rikaz">ركاز هو المرجع</option><option value="external">النظام الخارجي هو المرجع</option></select></div>
              <div className="flex flex-col gap-1"><Label className="text-xs">عند تعارض التعديل</Label><select className={`${selectCls()} w-full`} value={d.on_conflict} onChange={(e) => set("on_conflict", e.target.value)}><option value="reject">رفض التعديل القديم</option><option value="overwrite">اعتماد آخر تعديل</option></select></div>
            </div>
          </Section>

          <Section n={3} icon={Building2} title="نوع المفتاح ونطاق البيانات" hint="اختيار «جميع المدارس» صريح؛ القائمة الفارغة لا تعني الكل. كل قائمة تضيّق التي تليها.">
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              {SCOPE_TYPES.map((t) => (
                <button type="button" key={t.k} onClick={() => setType(t.k)} className={`rounded-lg border p-3 text-start transition-colors ${d.scope_type === t.k ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background hover:border-primary/40"}`}>
                  <div className="text-sm font-bold">{t.l}</div><div className="text-xs text-muted-foreground">{t.d}</div>
                </button>
              ))}
            </div>
            {central ? <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">موارد الإدارة المركزية تشمل مدارس المجموعة كلها، ويمكن تضييق كل مورد على مدارس محددة من قائمة الموارد.</p> : o ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label className="text-xs font-bold">المدارس</Label>
                    <button type="button" className={chip(d.all_schools)} onClick={() => setScope({ all_schools: !d.all_schools, school_ids: [] })}>جميع المدارس{d.all_schools ? " ✓" : ""}</button>
                  </div>
                  {d.all_schools ? <p className="text-[11px] text-muted-foreground">يشمل مدارس المجموعة الحالية وأي مدرسة تُضاف لاحقًا.</p>
                    : <div className="flex flex-wrap gap-1.5">{o.schools.map((x) => <button type="button" key={x.id} onClick={() => setScope({ school_ids: d.school_ids.includes(x.id) ? d.school_ids.filter((y) => y !== x.id) : [...d.school_ids, x.id] })} className={chip(d.school_ids.includes(x.id))}>{x.name}</button>)}</div>}
                  {!d.all_schools && !d.school_ids.length && <p className="mt-2 text-[11px] text-destructive">اختر مدرسة على الأقل أو «جميع المدارس».</p>}
                </div>
                {(d.all_schools || d.school_ids.length > 0) && (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Multi label="الأعوام الدراسية" opts={o.years.filter(inSch)} schools={o.schools} value={d.year_ids} onChange={(v) => setScope({ year_ids: v })} hint="كل الأعوام" />
                      <Multi label="الفصول الدراسية" opts={o.terms.filter(inSch).filter((t) => pick(d.year_ids, t.year_id))} schools={o.schools} value={d.term_ids} onChange={(v) => setScope({ term_ids: v })} hint="كل الفصول" />
                      <Multi label="المراحل" opts={o.stages.filter(inSch)} schools={o.schools} value={d.stage_ids} onChange={(v) => setScope({ stage_ids: v })} hint="كل المراحل" />
                      <Multi label="الصفوف" opts={o.grades.filter(inSch).filter((g) => pick(d.stage_ids, g.stage_id))} schools={o.schools} value={d.grade_ids} onChange={(v) => setScope({ grade_ids: v })} hint="كل الصفوف" />
                    </div>
                    <Multi label="الشعب" opts={o.sections.filter(inSch).filter((x) => pick(d.grade_ids, x.grade_id))} schools={o.schools} value={d.section_ids} onChange={(v) => setScope({ section_ids: v })} hint="كل الشعب" />
                  </>
                )}
              </div>
            ) : <LoadingState rows={1} />}
          </Section>

          <Section n={4} icon={Database} title="الموارد والحقول المسموحة" hint="الموارد مرتبة حسب أقسام المنصة. فعّل العملية ثم اختر الحقول؛ الحقول المعلّمة بـ ● حساسة ولا تُتاح إلا باختيارك الصريح.">
            {cat.data ? <ResourceTree cat={cat.data} scopeType={d.scope_type} scopes={d.scopes} onChange={setSc} disabled={disabled} schools={resSchools(o)} /> : <LoadingState rows={2} />}
          </Section>

          <Section n={5} icon={ShieldCheck} title="الأمان والحدود">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label className="text-xs">يبدأ من</Label><Input type="date" value={d.starts_at} onChange={(e) => set("starts_at", e.target.value)} /></div>
              <div><Label className="text-xs">ينتهي في (اختياري)</Label><Input type="date" value={d.expires_at} onChange={(e) => set("expires_at", e.target.value)} /></div>
              <div><Label className="text-xs">طلبات في الدقيقة</Label><Input type="number" min={1} max={6000} value={d.rate_min} onChange={(e) => set("rate_min", Number(e.target.value))} /></div>
              <div><Label className="text-xs">طلبات في اليوم</Label><Input type="number" min={1} max={1000000} value={d.rate_day} onChange={(e) => set("rate_day", Number(e.target.value))} /></div>
              <div className="sm:col-span-2 lg:col-span-4"><Label className="text-xs">عناوين IP المسموحة (اختياري، سطر لكل عنوان أو نطاق CIDR)</Label><Textarea dir="ltr" rows={2} value={d.ip_allow} onChange={(e) => set("ip_allow", e.target.value)} placeholder="203.0.113.10&#10;198.51.100.0/24" /></div>
            </div>
          </Section>
        </div>
        <DialogFooter className="gap-2 border-t bg-background px-6 py-3">
          <span className="me-auto self-center text-xs text-muted-foreground">{SCOPE_TYPES.find((t) => t.k === d.scope_type)?.l} · {active.length} مورد · {nFields} حقل · {central ? "الإدارة المركزية" : d.all_schools ? "جميع المدارس" : `${d.school_ids.length} مدرسة`}</span>
          <Button variant="outline" onClick={onClose}>إلغاء</Button><Button disabled={busy} onClick={save}>{d.id ? "حفظ التعديل" : "إنشاء المفتاح"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
