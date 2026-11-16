import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Pencil, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { ask, askText } from "@/components/confirm";
import { GT_DOMAINS, PART_LABELS, PROG_STATUS, calendarItems, canRegister, type GtMe, type Participant, type Program } from "./model";
import { planQuery } from "./plans";
import { gtToday } from "./nomination-wizard";

export const progQuery = (school: string) => ({ queryKey: ["gt-progs", school], queryFn: async () => { const r = await db.rpc("gt_prog_list", { _school: school }); if (r.error) throw r.error; return r.data as Program[]; } });
type Draft = { kind: string; title: string; domain: string; organizer: string; audience: string; description: string; owner_name: string; starts_on: string; ends_on: string; apply_by: string; seats: string; needs_consent: boolean; source_url: string; verified_on: string };

export function Programs({ school, me, openId, onSel }: { school: string; me: GtMe; openId?: string | undefined; onSel: (id: string | null) => void }) {
  const qc = useQueryClient(); const list = useQuery(progQuery(school)); const plans = useQuery(planQuery(school));
  const [edit, setEdit] = useState<Program | "new" | null>(null); const [view, setView] = useState<"list" | "calendar">("list");
  const refresh = () => qc.invalidateQueries({ queryKey: ["gt-progs", school] });
  if (edit) return <ProgramForm school={school} row={edit === "new" ? undefined : edit} close={(id) => { setEdit(null); refresh(); if (id) onSel(id); }} />;
  if (list.isLoading) return <LoadingState />; if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const rows = list.data ?? []; const open = rows.find((p) => p.id === openId);
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2"><div className="inline-flex rounded-lg border p-0.5">{(["list", "calendar"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-primary text-primary-foreground" : ""}`}>{v === "list" ? "البرامج" : "التقويم"}</button>)}</div><span className="flex-1" />{me.coord && <Button onClick={() => setEdit("new")}><Plus className="size-4" />إنشاء برنامج أو فرصة</Button>}</div>
    {view === "calendar" ? <Calendar items={calendarItems(rows, plans.data ?? [])} onOpen={(id) => { setView("list"); onSel(id); }} /> :
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <section>{!rows.length ? <EmptyState title="لا توجد برامج بعد" hint={me.coord ? "أنشئ برنامجًا مدرسيًا أو وثّق فرصة خارجية مع مصدرها." : undefined} /> :
        <ul className="space-y-2">{rows.map((p) => <li key={p.id}><button type="button" onClick={() => onSel(p.id)} className={`w-full rounded-xl border bg-card p-3 text-start ${open?.id === p.id ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="flex justify-between gap-2"><b className="truncate">{p.title}</b><span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{PROG_STATUS[p.status]}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{p.kind === "external" ? `خارجي · ${p.organizer}` : "مدرسي"} · {p.starts_on} · مسجلون {p.counts.registered}{p.seats ? `/${p.seats}` : ""}</p>
        </button></li>)}</ul>}</section>
      <section>{!open ? <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{openId ? "هذا البرنامج غير متاح لحسابك." : "اختر برنامجًا لعرضه."}</div> : <ProgramDetail school={school} p={open} me={me} onEdit={() => setEdit(open)} onDone={refresh} />}</section>
    </div>}
  </div>;
}

function Calendar({ items, onOpen }: { items: ReturnType<typeof calendarItems>; onOpen: (id: string) => void }) {
  const today = gtToday(); const up = items.filter((i) => i.date >= today); const past = items.filter((i) => i.date < today).slice(-5);
  const tone = { program: "bg-primary/10 text-primary", deadline: "bg-destructive/10 text-destructive", goal: "bg-accent/40", plan_end: "bg-secondary" };
  const groups = [...new Map(up.map((i) => [i.date.slice(0, 7), [] as typeof up])).entries()]; up.forEach((i) => groups.find(([k]) => k === i.date.slice(0, 7))![1].push(i));
  if (!items.length) return <EmptyState title="لا مواعيد بعد" hint="تظهر هنا مواعيد البرامج وآخر مواعيد التسجيل ومواعيد أهداف الخطط." />;
  return <div className="space-y-4">{groups.map(([m, xs]) => <section key={m} className="rounded-2xl border bg-card p-4"><h3 className="mb-2 flex items-center gap-2 font-semibold"><CalendarDays className="size-4" />{new Date(m + "-01").toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric" })}</h3>
    <ul className="space-y-1.5">{xs.map((i, k) => <li key={k}><button type="button" onClick={() => i.kind === "program" || i.kind === "deadline" ? onOpen(i.ref) : undefined} className="flex w-full items-center gap-3 rounded-lg p-2 text-start text-sm hover:bg-muted/40"><span className="w-24 shrink-0 font-mono text-xs">{i.date}</span><span className={`rounded px-2 py-0.5 text-xs ${tone[i.kind]}`}>{{ program: "برنامج", deadline: "تسجيل", goal: "هدف", plan_end: "خطة" }[i.kind]}</span>{i.label}</button></li>)}</ul></section>)}
    {past.length > 0 && <p className="text-xs text-muted-foreground">آخر مواعيد مضت: {past.map((p) => `${p.date} ${p.label}`).join(" · ")}</p>}
    <p className="text-xs text-muted-foreground">التذكيرات داخل المنصة فقط؛ لا مزامنة تلقائية مع جهات خارجية.</p></div>;
}

function ProgramDetail({ school, p, me, onEdit, onDone }: { school: string; p: Program; me: GtMe; onEdit: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [target, setTarget] = useState(false);
  async function run(fn: () => PromiseLike<{ error: unknown; data?: unknown }>, ok: string) { setBusy(true); try { const r = await fn(); if (r.error) throw r.error; toast.success(ok); onDone(); return r.data; } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  async function part(s: Participant, field: string, value: string) {
    let note: string | null = null; if (field === "nom" && value === "declined") { note = await askText("سبب عدم الإقرار"); if (!note?.trim()) return; }
    await run(() => db.rpc("gt_part_act", { _program: p.id, _student: s.student_id, _rev: s.rev, _field: field, _value: value, _note: note }), "حُفظ");
  }
  return <div className="space-y-4 rounded-2xl border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">{p.title}</h3><p className="text-xs text-muted-foreground">PRG-{String(p.no).padStart(4, "0")} · {GT_DOMAINS[p.domain]} · {p.owner_name}</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{PROG_STATUS[p.status]}</span></div>
    <dl className="grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">المواعيد</dt><dd>{p.starts_on}{p.ends_on ? ` ← ${p.ends_on}` : ""}</dd></div><div><dt className="text-muted-foreground">آخر موعد للتسجيل</dt><dd>{p.apply_by ?? "—"}</dd></div><div><dt className="text-muted-foreground">المقاعد</dt><dd>{p.counts.registered}{p.seats ? ` / ${p.seats}` : " (دون حد)"}</dd></div>
      {p.audience && <div><dt className="text-muted-foreground">الفئة المستهدفة</dt><dd>{p.audience}</dd></div>}<div><dt className="text-muted-foreground">موافقة ولي الأمر</dt><dd>{p.needs_consent ? "مطلوبة" : "غير مطلوبة"}</dd></div></dl>
    {p.kind === "external" && <p className="rounded-lg border bg-muted/30 p-3 text-sm">جهة خارجية: <b>{p.organizer}</b> · <a className="inline-flex items-center gap-1 text-primary underline" href={p.source_url ?? "#"} target="_blank" rel="noreferrer">المصدر<ExternalLink className="size-3" /></a> · آخر تحقق يدوي {p.verified_on}. <span className="text-muted-foreground">لا يتم التسجيل أو الدفع أو إرسال بيانات الطالب للجهة من المنصة.</span></p>}
    {p.description && <p className="text-sm">{p.description}</p>}
    <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5">{[["مُقرّون", p.counts.approved], ["مسجلون", p.counts.registered], ["حضروا", p.counts.attending], ["أتمّوا", p.counts.completed], ["موافقات معلّقة", p.counts.consent_pending]].map(([l, v]) => <div key={l} className="rounded-lg bg-muted/40 p-2"><b className="block text-lg">{v}</b>{l}</div>)}</div>
    {me.coord && <div className="flex flex-wrap gap-2">{p.status === "open" && <><Button variant="outline" onClick={onEdit}><Pencil className="size-4" />تعديل</Button><Button variant="outline" onClick={() => setTarget(!target)}><UsersRound className="size-4" />إضافة طلبة</Button><Button variant="outline" disabled={busy} onClick={() => run(() => db.rpc("gt_prog_act", { _id: p.id, _rev: p.rev, _action: "close" }), "أُغلق البرنامج")}>إغلاق</Button><Button variant="ghost" disabled={busy} onClick={async () => { if (await ask("إلغاء البرنامج نهائيًا؟", { destructive: true })) run(() => db.rpc("gt_prog_act", { _id: p.id, _rev: p.rev, _action: "cancel" }), "أُلغي"); }}>إلغاء البرنامج</Button></>}{p.status === "closed" && <Button variant="outline" disabled={busy} onClick={() => run(() => db.rpc("gt_prog_act", { _id: p.id, _rev: p.rev, _action: "reopen" }), "أُعيد فتحه")}>إعادة فتح</Button>}</div>}
    {target && <Targeting school={school} onAdd={async (t) => { const n = await run(() => db.rpc("gt_prog_target", { _id: p.id, _p: t }), "تمت الإضافة"); if (n !== undefined) { toast.message(`أُضيف ${n} طالب (المكرر لا يُضاف)`); setTarget(false); } }} />}
    {me.coord && (p.participants.length ? <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{["الطالب", "الترشيح", "موافقة ولي الأمر", "التسجيل", "الحضور", "الإتمام"].map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead>
      <tbody>{p.participants.map((s) => { const why = canRegister(s, p); return <tr key={s.student_id} className="border-t align-top"><td className="p-2"><b>{s.name}</b><span className="block text-xs text-muted-foreground">{[s.grade, s.section].filter(Boolean).join(" · ")}</span></td>
        <td className="p-2"><select aria-label={`ترشيح ${s.name}`} className={selectCls("w-full")} disabled={busy || s.reg === "registered"} value={s.nom} onChange={(e) => part(s, "nom", e.target.value)}>{Object.entries(PART_LABELS.nom).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
        <td className="p-2 text-xs">{PART_LABELS.consent[s.consent as keyof typeof PART_LABELS.consent]}{s.consent_at && <span className="block text-muted-foreground">{new Date(s.consent_at).toLocaleDateString("ar-SA")}</span>}{s.ack_at && <span className="block text-muted-foreground">اطّلع (ليس موافقة)</span>}</td>
        <td className="p-2"><select aria-label={`تسجيل ${s.name}`} className={selectCls("w-full")} disabled={busy} value={s.reg} onChange={(e) => part(s, "reg", e.target.value)}>{Object.entries(PART_LABELS.reg).map(([k, v]) => <option key={k} value={k} disabled={k === "registered" && !!why && s.reg !== "registered"}>{v}</option>)}</select>{why && s.reg !== "registered" && <span className="mt-1 block text-[11px] text-muted-foreground">{why}</span>}</td>
        <td className="p-2"><select aria-label={`حضور ${s.name}`} className={selectCls("w-full")} disabled={busy || s.reg !== "registered"} value={s.att} onChange={(e) => part(s, "att", e.target.value)}>{Object.entries(PART_LABELS.att).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
        <td className="p-2"><select aria-label={`إتمام ${s.name}`} className={selectCls("w-full")} disabled={busy || s.reg !== "registered"} value={s.done} onChange={(e) => part(s, "done", e.target.value)}>{Object.entries(PART_LABELS.done).map(([k, v]) => <option key={k} value={k} disabled={k === "completed" && s.att !== "attending"}>{v}</option>)}</select></td></tr>; })}</tbody></table></div>
      : <p className="text-sm text-muted-foreground">لا طلبة في البرنامج بعد — استخدم «إضافة طلبة».</p>)}
  </div>;
}

function Targeting({ school, onAdd }: { school: string; onAdd: (t: { students: string[]; sections: string[]; grades: string[] }) => void }) {
  const secs = useQuery({ queryKey: ["gt-targets", school], queryFn: async () => { const r = await db.rpc("gt_targets", { _school: school }); if (r.error) throw r.error; return r.data as { id: string; section: string; grade_id: string; grade: string; stage: string | null }[]; } });
  const studs = useQuery({ queryKey: ["gt-students", school], queryFn: async () => { const r = await db.rpc("gt_students", { _school: school }); if (r.error) throw r.error; return r.data as { id: string; name: string; care: string }[]; } });
  const [t, setT] = useState({ students: [] as string[], sections: [] as string[], grades: [] as string[] });
  const tog = (k: keyof typeof t, id: string) => setT({ ...t, [k]: t[k].includes(id) ? t[k].filter((x) => x !== id) : [...t[k], id] });
  const grades = [...new Map((secs.data ?? []).map((s) => [s.grade_id, `${s.stage ?? ""} ${s.grade}`.trim()])).entries()];
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`;
  return <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
    <div><Label>طلبة سجل الرعاية</Label><div className="mt-1 flex flex-wrap gap-1.5">{(studs.data ?? []).map((s) => <button key={s.id} type="button" aria-pressed={t.students.includes(s.id)} className={chip(t.students.includes(s.id))} onClick={() => tog("students", s.id)}>{s.name}</button>)}</div></div>
    <div><Label>صف كامل</Label><div className="mt-1 flex flex-wrap gap-1.5">{grades.map(([id, n]) => <button key={id} type="button" aria-pressed={t.grades.includes(id)} className={chip(t.grades.includes(id))} onClick={() => tog("grades", id)}>{n}</button>)}</div></div>
    <div><Label>شعبة</Label><div className="mt-1 flex flex-wrap gap-1.5">{(secs.data ?? []).map((s) => <button key={s.id} type="button" aria-pressed={t.sections.includes(s.id)} className={chip(t.sections.includes(s.id))} onClick={() => tog("sections", s.id)}>{s.grade} / {s.section}</button>)}</div></div>
    <Button size="sm" disabled={!t.students.length && !t.sections.length && !t.grades.length} onClick={() => onAdd(t)}>إضافة المحددين</Button>
    <p className="text-xs text-muted-foreground">الإضافة تجعل الطالب «مرشّحًا» للبرنامج فقط؛ الإقرار والتسجيل خطوات منفصلة.</p>
  </div>;
}

function ProgramForm({ school, row, close }: { school: string; row?: Program | undefined; close: (id?: string) => void }) {
  const [d, setD] = useState<Draft>({ kind: row?.kind ?? "school", title: row?.title ?? "", domain: row?.domain ?? "scientific", organizer: row?.organizer ?? "", audience: row?.audience ?? "", description: row?.description ?? "", owner_name: row?.owner_name ?? "", starts_on: row?.starts_on ?? "", ends_on: row?.ends_on ?? "", apply_by: row?.apply_by ?? "", seats: row?.seats ? String(row.seats) : "", needs_consent: row?.needs_consent ?? false, source_url: row?.source_url ?? "", verified_on: row?.verified_on ?? gtToday() });
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const set = (p: Partial<Draft>) => { setDirty(true); setD({ ...d, ...p }); };
  async function save() { setBusy(true); try { const r = await db.rpc("gt_prog_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: d }); if (r.error) throw r.error; toast.success("حُفظ البرنامج"); close(r.data as string); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  const inp = (k: keyof Draft, label: string, type = "text") => <div className="space-y-1"><Label htmlFor={`pg-${k}`}>{label}</Label><Input id={`pg-${k}`} type={type} value={d[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<Draft>)} /></div>;
  return <div className="mx-auto max-w-3xl space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{row ? "تعديل البرنامج" : "برنامج أو فرصة جديدة"}</h2><Button variant="ghost" onClick={async () => { if (!dirty || (await ask("ستفقد التغييرات غير المحفوظة. هل تريد الخروج؟"))) close(); }}>إلغاء</Button></div>
    <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="pg-kind">النوع</Label><select id="pg-kind" className={selectCls("w-full")} value={d.kind} onChange={(e) => set({ kind: e.target.value })}><option value="school">برنامج مدرسي</option><option value="external">فرصة خارجية (توثيق فقط)</option></select></div>
      <div className="space-y-1"><Label htmlFor="pg-dom">المجال</Label><select id="pg-dom" className={selectCls("w-full")} value={d.domain} onChange={(e) => set({ domain: e.target.value })}>{Object.entries(GT_DOMAINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="sm:col-span-2">{inp("title", "اسم البرنامج")}</div>
      {inp("organizer", d.kind === "external" ? "الجهة المنظمة (مطلوبة)" : "الجهة المنظمة")}{inp("owner_name", "المسؤول")}
      {inp("starts_on", "تاريخ البدء", "date")}{inp("ends_on", "تاريخ الانتهاء", "date")}{inp("apply_by", "آخر موعد للتسجيل", "date")}{inp("seats", "عدد المقاعد (اختياري)", "number")}
      <div className="sm:col-span-2">{inp("audience", "الفئة المستهدفة")}</div>
      {d.kind === "external" && <>{inp("source_url", "رابط المصدر الرسمي")}{inp("verified_on", "تاريخ آخر تحقق يدوي", "date")}<p className="text-xs text-muted-foreground sm:col-span-2">الشروط والمواعيد كما وردت في المصدر عند التحقق؛ لا تحديث تلقائي من الجهة.</p></>}
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="pg-desc">الوصف</Label><Textarea id="pg-desc" rows={3} value={d.description} onChange={(e) => set({ description: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={d.needs_consent} onChange={(e) => set({ needs_consent: e.target.checked })} />يحتاج موافقة ولي الأمر قبل التسجيل</label>
    </section>
    <div className="flex justify-end"><Button disabled={busy || d.title.trim().length < 3 || !d.starts_on} onClick={save}>حفظ</Button></div>
  </div>;
}
