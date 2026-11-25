import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pause, Pencil, Play, Plus, RotateCw, Ban, History } from "lucide-react";
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
import { act, Badge, Card, fmt, KEY_STATUS, rpc, SecretDialog, useCatalog, type CatRes, type Row } from "./shared";

type Opt = { id: string; name: string; school_id?: string };
type Opts = { schools: Opt[]; years: Opt[]; terms: Opt[]; stages: Opt[]; grades: Opt[]; sections: Opt[] };
type Scope = { read: boolean; create: boolean; update: boolean; fields: string[]; write_fields: string[] };
type Draft = {
  id: string | null; rev?: number; name: string; system_name: string; description: string; env: "test" | "live"; direction: string; master: string; on_conflict: string;
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
    id: k?.["id"] ?? null, rev: k?.["rev"], name: k?.["name"] ?? "", system_name: k?.["system_name"] ?? "", description: k?.["description"] ?? "", env: k?.["env"] ?? "test",
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
          const res = Object.entries((k["scopes"] ?? {}) as Record<string, Scope>).filter(([, s]) => s.read || s.create || s.update);
          return (
            <Card key={k["id"]} title={k["name"]} action={<div className="flex gap-1"><Badge cls={k["env"] === "live" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>{k["env"] === "live" ? "إنتاج" : "اختبار"}</Badge><Badge cls={k["status"] === "active" && !expired ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>{expired && k["status"] === "active" ? "منتهي" : KEY_STATUS[k["status"]]}</Badge></div>}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">النظام</dt><dd>{k["system_name"]}</dd>
                <dt className="text-muted-foreground">المفتاح</dt><dd dir="ltr" className="text-end font-mono">rk_{k["env"]}_{k["key_hint"]}</dd>
                <dt className="text-muted-foreground">الاتجاه</dt><dd>{DIR[k["direction"]]}</dd>
                <dt className="text-muted-foreground">المدارس</dt><dd>{k["school_ids"]?.length ? `${k["school_ids"].length} مدرسة` : "جميع المدارس"}</dd>
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

function Multi({ label, opts, value, onChange, hint }: { label: string; opts: Opt[]; value: string[]; onChange: (v: string[]) => void; hint: string }) {
  if (!opts.length) return null;
  return (
    <div>
      <Label className="text-xs">{label} <span className="text-muted-foreground">({value.length ? `${value.length} محدد` : hint})</span></Label>
      <div className="mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-auto rounded-md border p-2">
        {opts.map((o) => {
          const on = value.includes(o.id);
          return <button type="button" key={o.id} onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{o.name}</button>;
        })}
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
  const inSch = (o: Opt) => !d.school_ids.length || (o.school_id ? d.school_ids.includes(o.school_id) : true);
  const groups = useMemo(() => {
    const m = new Map<string, CatRes[]>();
    for (const r of cat.data ?? []) m.set(r.group, [...(m.get(r.group) ?? []), r]);
    return [...m.entries()];
  }, [cat.data]);
  const sc = (k: string): Scope => d.scopes[k] ?? { read: false, create: false, update: false, fields: ["id"], write_fields: [] };
  const setSc = (k: string, s: Scope) => set("scopes", { ...d.scopes, [k]: s });
  const save = async () => {
    if (d.name.trim().length < 2 || d.system_name.trim().length < 2) { toast.error("أدخل اسم المفتاح واسم النظام"); return; }
    let reason: string | null = null;
    if (d.id) { reason = await askText("سبب التعديل (يُحفظ في سجل المفتاح):", { required: true }); if (!reason) return; }
    const live = d.env === "live" && !d.id;
    if (live && !(await ask("مفتاح الإنتاج يتعامل مع بيانات حقيقية ويحفظ عمليات الكتابة. متابعة؟"))) return;
    setBusy(true);
    const p = {
      ...d, ip_allow: d.ip_allow.split(/\s+/).filter(Boolean), starts_at: d.starts_at || null, expires_at: d.expires_at || null,
      school_ids: d.school_ids.length ? d.school_ids : null, year_ids: d.year_ids.length ? d.year_ids : null, term_ids: d.term_ids.length ? d.term_ids : null,
      stage_ids: d.stage_ids.length ? d.stage_ids : null, grade_ids: d.grade_ids.length ? d.grade_ids : null, section_ids: d.section_ids.length ? d.section_ids : null,
    };
    const r = await act<{ secret?: string }>("api_key_save", { _org: orgId, _id: d.id, _p: p, _reason: reason }, d.id ? "حُفظ التعديل" : "أُنشئ المفتاح");
    setBusy(false);
    if (r) onSaved(r.secret ?? null);
  };
  const o = opts.data;
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle><KeyRound className="ms-1 inline h-4 w-4" />{d.id ? "تعديل مفتاح" : "مفتاح API جديد"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>اسم المفتاح</Label><Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="مثال: تطبيق الجوال — قراءة" /></div>
          <div><Label>اسم النظام الخارجي</Label><Input value={d.system_name} onChange={(e) => set("system_name", e.target.value)} placeholder="مثال: نظام نور، الموقع الإلكتروني" /></div>
          <div className="sm:col-span-2"><Label>الوصف</Label><Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
          <div><Label>البيئة</Label><select className={selectCls()} value={d.env} disabled={!!d.id} onChange={(e) => set("env", e.target.value as "test" | "live")}><option value="test">اختبار — تحقق كامل دون حفظ</option><option value="live">إنتاج — بيانات حقيقية</option></select></div>
          <div><Label>اتجاه البيانات</Label><select className={selectCls()} value={d.direction} onChange={(e) => set("direction", e.target.value)}>{Object.entries(DIR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><Label>المصدر المعتمد للبيانات</Label><select className={selectCls()} value={d.master} onChange={(e) => set("master", e.target.value)}><option value="rikaz">ركاز هو المرجع</option><option value="external">النظام الخارجي هو المرجع</option></select></div>
          <div><Label>عند تعارض التعديل</Label><select className={selectCls()} value={d.on_conflict} onChange={(e) => set("on_conflict", e.target.value)}><option value="reject">رفض التعديل القديم (rev)</option><option value="overwrite">اعتماد آخر تعديل</option></select></div>
        </div>

        <h4 className="mt-4 font-display text-sm font-bold">النطاق — اترك الحقل فارغًا ليشمل الكل</h4>
        {o ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Multi label="المدارس" opts={o.schools} value={d.school_ids} onChange={(v) => set("school_ids", v)} hint="جميع المدارس" />
            <Multi label="الأعوام الدراسية" opts={o.years.filter(inSch)} value={d.year_ids} onChange={(v) => set("year_ids", v)} hint="كل الأعوام" />
            <Multi label="الفصول الدراسية" opts={o.terms.filter(inSch)} value={d.term_ids} onChange={(v) => set("term_ids", v)} hint="كل الفصول" />
            <Multi label="المراحل" opts={o.stages.filter(inSch)} value={d.stage_ids} onChange={(v) => set("stage_ids", v)} hint="كل المراحل" />
            <Multi label="الصفوف" opts={o.grades.filter(inSch)} value={d.grade_ids} onChange={(v) => set("grade_ids", v)} hint="كل الصفوف" />
            <Multi label="الشعب" opts={o.sections.filter(inSch)} value={d.section_ids} onChange={(v) => set("section_ids", v)} hint="كل الشعب" />
          </div>
        ) : <LoadingState rows={1} />}

        <h4 className="mt-4 font-display text-sm font-bold">الموارد والحقول المسموحة</h4>
        <p className="text-xs text-muted-foreground">الحقول المعلّمة بـ ● بيانات شخصية حساسة؛ لا تُتاح إلا باختيارك الصريح.</p>
        <div className="space-y-3">
          {groups.map(([g, rs]) => (
            <div key={g} className="rounded-lg border p-3">
              <div className="mb-2 text-xs font-bold text-muted-foreground">{g}</div>
              {rs.map((r) => {
                const s = sc(r.key);
                const on = s.read || s.create || s.update;
                const disabledAll = !!r.all_schools_only && d.school_ids.length > 0;
                return (
                  <div key={r.key} className="border-t py-2 first:border-t-0">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="min-w-40 font-medium">{r.label}</span>
                      {(["read", "create", "update"] as const).filter((op) => r.ops[op]).map((op) => (
                        <label key={op} className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={disabledAll} checked={s[op]} onChange={(e) => setSc(r.key, { ...s, [op]: e.target.checked })} />{op === "read" ? "قراءة" : op === "create" ? (r.create_mode === "approval" ? "إضافة (باعتماد)" : "إضافة") : "تعديل"}</label>
                      ))}
                      {disabledAll && <span className="text-xs text-muted-foreground">متاح لمفاتيح جميع المدارس فقط</span>}
                    </div>
                    {on && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.fields.map((f) => {
                          const sel = s.fields.includes(f.k) || f.k === "id";
                          return <button type="button" key={f.k} disabled={f.k === "id"} onClick={() => setSc(r.key, { ...s, fields: sel ? s.fields.filter((x) => x !== f.k) : [...s.fields, f.k] })} className={`rounded-full border px-2 py-0.5 text-[11px] ${sel ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}>{f.s ? "● " : ""}{f.l}</button>;
                        })}
                      </div>
                    )}
                    {(s.create || s.update) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1"><span className="text-[11px] text-muted-foreground">حقول الكتابة الاختيارية:</span>
                        {r.fields.filter((f) => (s.create && f.c && !f.r) || (s.update && f.u)).map((f) => {
                          const sel = s.write_fields.includes(f.k);
                          return <button type="button" key={f.k} onClick={() => setSc(r.key, { ...s, write_fields: sel ? s.write_fields.filter((x) => x !== f.k) : [...s.write_fields, f.k] })} className={`rounded-full border px-2 py-0.5 text-[11px] ${sel ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}>{f.l}</button>;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <h4 className="mt-4 font-display text-sm font-bold">الأمان والحدود</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>يبدأ من</Label><Input type="date" value={d.starts_at} onChange={(e) => set("starts_at", e.target.value)} /></div>
          <div><Label>ينتهي في (اختياري)</Label><Input type="date" value={d.expires_at} onChange={(e) => set("expires_at", e.target.value)} /></div>
          <div><Label>حد الطلبات في الدقيقة</Label><Input type="number" min={1} max={6000} value={d.rate_min} onChange={(e) => set("rate_min", Number(e.target.value))} /></div>
          <div><Label>حد الطلبات في اليوم</Label><Input type="number" min={1} max={1000000} value={d.rate_day} onChange={(e) => set("rate_day", Number(e.target.value))} /></div>
          <div className="sm:col-span-2"><Label>عناوين IP المسموحة (اختياري، سطر لكل عنوان أو نطاق CIDR)</Label><Textarea dir="ltr" rows={2} value={d.ip_allow} onChange={(e) => set("ip_allow", e.target.value)} placeholder="203.0.113.10&#10;198.51.100.0/24" /></div>
        </div>
        <DialogFooter className="mt-3 gap-2"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button disabled={busy} onClick={save}>{d.id ? "حفظ التعديل" : "إنشاء المفتاح"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
