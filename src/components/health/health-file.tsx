import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, HeartPulse, Pill, Plus, ShieldPlus, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { rpc } from "@/components/hr/shared";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Health file of one student — the same screen for the health counselor (staff) and the guardian. health_file decides who sees what. */
export type HCond = { id: string; name: string; category: string; severity: string; instructions: string | null; source: string };
export type HMed = { id: string; name: string; dose: string | null; times: string[]; at_school: boolean; start_date: string | null; end_date: string | null; instructions: string | null; source: string };
export type HEvent = { id: string; kind: string; occurred_at: string; summary: string; action_taken: string | null; shared: boolean; by: string | null };
type Profile = Record<string, string | number | null>;
export type HFile = {
  viewer: "staff" | "guardian"; can_record: boolean; can_manage: boolean;
  student: { id: string; name: string; national_id: string | null; birth_date: string | null; gender: string | null; section: string | null; guardians: { name: string; phone: string | null; relationship: string | null }[] };
  profile: Profile | null; conditions: HCond[]; meds: HMed[]; events: HEvent[];
};

export const EVENT_KINDS: Record<string, string> = {
  visit: "زيارة للعيادة", med_given: "إعطاء دواء", injury: "إصابة", sent_home: "إرسال للمنزل", referral: "تحويل طبي",
  screening: "فحص دوري", vaccination: "تطعيم", guardian_call: "تواصل مع ولي الأمر", note: "ملاحظة صحية",
};
export const CATEGORIES: Record<string, string> = { chronic: "مرض مزمن", allergy: "حساسية", disability: "إعاقة / احتياج خاص", mental: "نفسي / سلوكي", other: "أخرى" };
export const SEVERITY: Record<string, string> = { low: "بسيطة", moderate: "متوسطة", high: "شديدة" };
const SEV_CLS: Record<string, string> = { low: "bg-secondary text-secondary-foreground", moderate: "bg-accent text-accent-foreground", high: "bg-destructive/15 text-destructive" };
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const fmt = (s: string) => new Date(s).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export const healthKey = (id: string) => ["health-file", id];
export function useHealthFile(id: string) {
  return useQuery({ queryKey: healthKey(id), queryFn: () => rpc<HFile>("health_file", { _student: id }) });
}

export function HealthFile({ studentId }: { studentId: string }) {
  const q = useHealthFile(studentId);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const f = q.data!;
  const staff = f.viewer === "staff";
  const alerts = [...f.conditions.filter((c) => c.severity === "high" || c.category === "allergy").map((c) => c.name), ...(f.profile?.allergies ? [String(f.profile.allergies)] : [])];
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-l from-primary/10 to-transparent p-5">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><HeartPulse className="size-7" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">الملف الصحي</p>
            <p className="text-xl font-bold">{f.student.name}</p>
            <p className="text-sm text-muted-foreground">{f.student.section ?? "غير مسكّن"}{f.student.birth_date ? ` · مواليد ${f.student.birth_date}` : ""}{staff && f.student.national_id ? ` · ${f.student.national_id}` : ""}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="فصيلة الدم" value={String(f.profile?.blood_type ?? "—")} />
            <Stat label="الحالات" value={String(f.conditions.length)} />
            <Stat label="الأدوية" value={String(f.meds.length)} />
          </div>
        </div>
        {alerts.length > 0 && (
          <div className="flex items-start gap-2 border-t bg-destructive/10 px-5 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span><b>تنبيه صحي:</b> {alerts.join(" · ")}</span>
          </div>
        )}
      </section>
      {!staff && <p className="rounded-xl border bg-secondary/40 p-3 text-sm">ما تدخله هنا يصل مباشرة إلى المرشدة الصحية في المدرسة. تستطيع تعديل أو حذف ما أضفته أنت فقط.</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard f={f} />
        <Conditions f={f} />
        <Meds f={f} />
        <Events f={f} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-background px-3 py-2"><p className="text-lg font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>;
}

function Card({ title, icon: Icon, action, children }: { title: string; icon: typeof Pill; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function useSave(id: string) {
  const qc = useQueryClient();
  return (fn: string, args: Record<string, unknown>, ok: string) => rpc(fn, args).then(() => { toast.success(ok); qc.invalidateQueries({ queryKey: healthKey(id) }); qc.invalidateQueries({ queryKey: ["health-list"] }); qc.invalidateQueries({ queryKey: ["health-today"] }); return true; }).catch((e) => { toast.error(arabicError(e)); return false; });
}

const P_FIELDS: [string, string][] = [["height_cm", "الطول (سم)"], ["weight_kg", "الوزن (كجم)"], ["emergency_name", "اسم جهة الطوارئ"], ["emergency_phone", "جوال الطوارئ"], ["doctor_name", "الطبيب المعالج"], ["doctor_phone", "جوال الطبيب"], ["insurance", "التأمين الطبي"]];
function ProfileCard({ f }: { f: HFile }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const save = useSave(f.student.id);
  const p = f.profile ?? {};
  const start = () => { setV(Object.fromEntries(["blood_type", "allergies", "diet", "notes", ...P_FIELDS.map((x) => x[0])].map((k) => [k, p[k] == null ? "" : String(p[k])]))); setEdit(true); };
  return (
    <Card title="البطاقة الصحية" icon={ShieldPlus} action={f.can_manage && !edit ? <Button size="sm" variant="outline" onClick={start}>{f.profile ? "تعديل" : "إضافة البيانات"}</Button> : undefined}>
      {edit ? (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await save("health_profile_save", { _student: f.student.id, _p: v }, "تم حفظ البطاقة الصحية")) setEdit(false); }}>
          <div><Label>فصيلة الدم</Label><select className={selectCls} value={v.blood_type} onChange={(e) => setV({ ...v, blood_type: e.target.value })}><option value="">غير معروفة</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}</select></div>
          {P_FIELDS.map(([k, l]) => <div key={k}><Label>{l}</Label><Input value={v[k] ?? ""} inputMode={k.endsWith("_cm") || k.endsWith("_kg") ? "decimal" : undefined} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>)}
          <div className="sm:col-span-2"><Label>الحساسية (أطعمة، أدوية…)</Label><Input value={v.allergies} onChange={(e) => setV({ ...v, allergies: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>النظام الغذائي</Label><Input value={v.diet} onChange={(e) => setV({ ...v, diet: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>ملاحظات</Label><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit">حفظ</Button><Button type="button" variant="ghost" onClick={() => setEdit(false)}>إلغاء</Button></div>
        </form>
      ) : !f.profile ? <EmptyState title="لم تُعبّأ البطاقة الصحية بعد" hint={f.viewer === "guardian" ? "أضف فصيلة الدم وجهة الطوارئ والحساسية." : "بانتظار إدخال ولي الأمر أو المرشدة الصحية."} /> : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {[["فصيلة الدم", p.blood_type], ...P_FIELDS.map(([k, l]) => [l, p[k]]), ["الحساسية", p.allergies], ["النظام الغذائي", p.diet], ["ملاحظات", p.notes]].map(([l, val]) => (
            <div key={String(l)}><dt className="text-xs text-muted-foreground">{l}</dt><dd className="font-medium">{val == null || val === "" ? "—" : String(val)}</dd></div>
          ))}
          <p className="col-span-2 text-xs text-muted-foreground">آخر تحديث {p.updated_at ? fmt(String(p.updated_at)) : ""} · بواسطة {p.updated_source === "guardian" ? "ولي الأمر" : "المدرسة"}</p>
        </dl>
      )}
    </Card>
  );
}

const canEditRow = (f: HFile, src: string) => f.can_manage && (f.viewer === "staff" || src === "guardian");
const srcLabel = (s: string) => (s === "guardian" ? "أدخله ولي الأمر" : "أدخلته المدرسة");

function Conditions({ f }: { f: HFile }) {
  const [form, setForm] = useState<Partial<HCond> | null>(null);
  const save = useSave(f.student.id);
  return (
    <Card title="الأمراض والحالات الصحية" icon={Stethoscope} action={f.can_manage && !form ? <Button size="sm" variant="outline" onClick={() => setForm({ category: "chronic", severity: "moderate" })}><Plus className="size-4" />إضافة</Button> : undefined}>
      {form && (
        <form className="mb-4 grid gap-3 rounded-xl border bg-secondary/30 p-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await save("health_condition_save", { _student: f.student.id, _id: form.id ?? null, _p: form }, "تم الحفظ")) setForm(null); }}>
          <div className="sm:col-span-2"><Label>اسم الحالة</Label><Input required value={form.name ?? ""} placeholder="مثال: ربو، سكري النوع الأول، حساسية الفول السوداني" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>النوع</Label><select className={selectCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><Label>الشدة</Label><select className={selectCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{Object.entries(SEVERITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="sm:col-span-2"><Label>تعليمات للتعامل في المدرسة</Label><Textarea value={form.instructions ?? ""} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit">حفظ</Button><Button type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button></div>
        </form>
      )}
      {f.conditions.length === 0 ? <EmptyState title="لا توجد حالات مسجّلة" /> : (
        <ul className="space-y-2">{f.conditions.map((c) => (
          <li key={c.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b>{c.name}</b>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{CATEGORIES[c.category] ?? c.category}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", SEV_CLS[c.severity])}>{SEVERITY[c.severity] ?? c.severity}</span>
              <span className="ms-auto text-xs text-muted-foreground">{srcLabel(c.source)}</span>
            </div>
            {c.instructions && <p className="mt-1 text-sm text-muted-foreground">{c.instructions}</p>}
            {canEditRow(f, c.source) && <RowActions onEdit={() => setForm(c)} onRemove={async () => { if (await ask(`حذف الحالة «${c.name}»؟`, { destructive: true })) save("health_item_remove", { _kind: "condition", _id: c.id }, "تم الحذف"); }} />}
          </li>
        ))}</ul>
      )}
    </Card>
  );
}

function RowActions({ onEdit, onRemove }: { onEdit: () => void; onRemove: () => void }) {
  return <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={onEdit}>تعديل</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}><Trash2 className="size-4" />حذف</Button></div>;
}

function Meds({ f }: { f: HFile }) {
  const [form, setForm] = useState<(Partial<HMed> & { timesText?: string }) | null>(null);
  const save = useSave(f.student.id);
  return (
    <Card title="الأدوية ومواعيدها" icon={Pill} action={f.can_manage && !form ? <Button size="sm" variant="outline" onClick={() => setForm({ at_school: false, times: [] })}><Plus className="size-4" />إضافة دواء</Button> : undefined}>
      {form && (
        <form className="mb-4 grid gap-3 rounded-xl border bg-secondary/30 p-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const times = (form.timesText ?? form.times?.join("، ") ?? "").split(/[,،\s]+/).filter(Boolean);
          if (await save("health_med_save", { _student: f.student.id, _id: form.id ?? null, _p: { ...form, times } }, "تم حفظ الدواء")) setForm(null);
        }}>
          <div><Label>اسم الدواء</Label><Input required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>الجرعة</Label><Input value={form.dose ?? ""} placeholder="مثال: بخّتان / 5 مل" onChange={(e) => setForm({ ...form, dose: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>المواعيد (ساعة:دقيقة، افصل بفاصلة)</Label><Input dir="ltr" placeholder="08:00, 11:30" value={form.timesText ?? form.times?.join(", ") ?? ""} onChange={(e) => setForm({ ...form, timesText: e.target.value })} /></div>
          <div><Label>من تاريخ</Label><Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div><Label>إلى تاريخ</Label><Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!form.at_school} onChange={(e) => setForm({ ...form, at_school: e.target.checked })} />يُعطى في المدرسة خلال الدوام (يظهر في جدول المرشدة الصحية اليومي)</label>
          <div className="sm:col-span-2"><Label>تعليمات</Label><Textarea value={form.instructions ?? ""} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit">حفظ</Button><Button type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button></div>
        </form>
      )}
      {f.meds.length === 0 ? <EmptyState title="لا توجد أدوية مسجّلة" /> : (
        <ul className="space-y-2">{f.meds.map((m) => (
          <li key={m.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b>{m.name}</b>{m.dose && <span className="text-sm text-muted-foreground">{m.dose}</span>}
              {m.at_school && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">في المدرسة</span>}
              <span className="ms-auto text-xs text-muted-foreground">{srcLabel(m.source)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">{m.times.map((t) => <span key={t} dir="ltr" className="rounded-md border px-2 py-0.5 text-xs">{t}</span>)}</div>
            {(m.start_date || m.end_date) && <p className="mt-1 text-xs text-muted-foreground">{m.start_date ?? "…"} ← {m.end_date ?? "مستمر"}</p>}
            {m.instructions && <p className="mt-1 text-sm text-muted-foreground">{m.instructions}</p>}
            {canEditRow(f, m.source) && <RowActions onEdit={() => setForm(m)} onRemove={async () => { if (await ask(`حذف الدواء «${m.name}»؟`, { destructive: true })) save("health_item_remove", { _kind: "med", _id: m.id }, "تم الحذف"); }} />}
          </li>
        ))}</ul>
      )}
    </Card>
  );
}

function Events({ f }: { f: HFile }) {
  const [form, setForm] = useState<{ kind: string; summary: string; action_taken: string; med_id: string; shared: boolean } | null>(null);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () => rpc("health_event_add", { _student: f.student.id, _p: form }),
    onSuccess: () => { toast.success("تم تسجيل الحدث"); setForm(null); qc.invalidateQueries({ queryKey: healthKey(f.student.id) }); qc.invalidateQueries({ queryKey: ["health-today"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  return (
    <Card title="سجل العيادة المدرسية" icon={Activity} action={f.can_record && !form ? <Button size="sm" onClick={() => setForm({ kind: "visit", summary: "", action_taken: "", med_id: "", shared: true })}><Plus className="size-4" />تسجيل حدث</Button> : undefined}>
      {form && (
        <form className="mb-4 grid gap-3 rounded-xl border bg-secondary/30 p-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>نوع الحدث</Label><select className={selectCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(EVENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {form.kind === "med_given" && <div><Label>الدواء</Label><select className={selectCls} value={form.med_id} onChange={(e) => setForm({ ...form, med_id: e.target.value })}><option value="">—</option>{f.meds.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
          </div>
          <div><Label>الوصف</Label><Input required value={form.summary} placeholder="مثال: صداع خفيف، قياس الحرارة 37.2" onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
          <div><Label>الإجراء المتخذ</Label><Textarea value={form.action_taken} onChange={(e) => setForm({ ...form, action_taken: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />إظهاره لولي الأمر وإرسال إشعار له</label>
          <div className="flex gap-2"><Button type="submit" disabled={add.isPending}>تسجيل</Button><Button type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button></div>
        </form>
      )}
      {f.events.length === 0 ? <EmptyState title="لا توجد أحداث مسجّلة" /> : (
        <ol className="relative space-y-3 border-s ps-4">{f.events.map((ev) => (
          <li key={ev.id} className="relative">
            <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
            <div className="flex flex-wrap items-center gap-2 text-sm"><b>{EVENT_KINDS[ev.kind] ?? ev.kind}</b><span className="text-xs text-muted-foreground">{fmt(ev.occurred_at)}</span>
              {f.viewer === "staff" && !ev.shared && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">داخلي</span>}</div>
            <p className="text-sm">{ev.summary}</p>
            {ev.action_taken && <p className="text-sm text-muted-foreground">الإجراء: {ev.action_taken}</p>}
            {ev.by && <p className="text-[11px] text-muted-foreground">سجّله: {ev.by}</p>}
          </li>
        ))}</ol>
      )}
    </Card>
  );
}
