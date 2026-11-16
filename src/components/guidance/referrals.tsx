import { CaseFiles } from "./case-run";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, FolderOpen, Lightbulb, Lock, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { EDU_CATEGORIES, EDU_PRIORITY, type EduRecord } from "@/components/education/model";
import { REF_CONTEXT, REF_EVENT, REF_FREQUENCY, REF_STATUS, REF_TONE, refActions, type RefPlan } from "./model";
import { ReferralWizard } from "./referral-wizard";

type Row = EduRecord & { ref_no?: string; limited?: boolean };
type List = { rows: Row[]; total: number; can_create: boolean };
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }
const CATS = EDU_CATEGORIES.referral;
export const RefBadge = ({ s }: { s: string }) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${REF_TONE[s] ?? "bg-muted"}`}>{REF_STATUS[s] ?? s}</span>;

export function Referrals({ school, counselor, canRefer, openCase, initialStatus, initialId, onSel }: { school: string; counselor: boolean; canRefer: boolean; openCase?: (id: string) => void; initialStatus?: string | undefined; initialId?: string | undefined; onSel?: (id: string | null) => void }) {
  const qc = useQueryClient(); const [status, setStatus] = useState(initialStatus ?? (counselor ? "sent" : "")); const [q, setQ] = useState(""); const [page, setPage] = useState(0);
  const [selected, setSelState] = useState<string | null>(initialId ?? null);
  useEffect(() => { setSelState(initialId ?? null); }, [initialId]);
  const setSelected = (id: string | null) => { setSelState(id); onSel?.(id); }; const [wizard, setWizard] = useState<"new" | Row | null>(null);
  const list = useQuery({ queryKey: ["edu-list", school, "referral", status, q, page], queryFn: () => rpc<List>("edu_find", { _school: school, _kind: "referral", _f: { q, status }, _offset: page * 25, _limit: 25 }) });
  const refresh = () => { for (const k of ["edu-list", "edu-detail", "guidance-board"]) void qc.invalidateQueries({ queryKey: [k] }); };
  if (wizard) return <ReferralWizard school={school} row={wizard === "new" ? undefined : wizard} close={(id) => { setWizard(null); refresh(); if (id) setSelected(id); }} />;
  if (selected) return <ReferralView id={selected} counselor={counselor} back={() => setSelected(null)} edit={(r) => setWizard(r)} changed={refresh} openCase={openCase} />;
  const tabs: [string, string][] = counselor ? [["sent", "الجديدة"], ["triage", "قيد الفرز"], ["needs_info", "تحتاج استكمالًا"], ["accepted", "قيد المتابعة"], ["closed", "المغلقة"], ["", "الكل"]] : [["", "كل إحالاتي"], ["draft", "المسودات"], ["needs_info", "تحتاج استكمالًا"], ["closed", "المغلقة"]];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="tablist">{tabs.map(([k, l]) => <button key={k || "all"} role="tab" aria-selected={status === k} onClick={() => { setStatus(k); setPage(0); }} className={`rounded-full border px-4 py-1.5 text-sm ${status === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{l}</button>)}</div>
      {canRefer && <Button onClick={() => setWizard("new")}><Plus className="size-4" />إحالة جديدة</Button>}
    </div>
    <div className="relative max-w-md"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث في الإحالات" className="ps-9" placeholder="رقم الإحالة أو اسم الطالب أو C‑Smart" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>
    {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !list.data?.rows.length
      ? <EmptyState title={q || status ? "لا توجد إحالات في هذا التبويب" : counselor ? "لا توجد إحالات بعد" : "لم ترسل أي إحالة بعد"} hint={canRefer && !counselor ? "اختر «إحالة جديدة»: الطالب ← السبب والملاحظات ← الدعم السابق ← الإرسال." : undefined} />
      : <ul className="grid gap-3 md:grid-cols-2">{list.data.rows.map((r) => <li key={r.id}><button type="button" onClick={() => setSelected(r.id)} className="w-full rounded-xl border bg-card p-4 text-start hover:border-primary/50">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="min-w-0"><p className="truncate font-semibold">{r.person}</p><p className="text-xs text-muted-foreground">{r.ref_no} · {r.record_date}</p></div><RefBadge s={r.status} /></div>
          <p className="mt-2 text-sm text-muted-foreground">{CATS[r.category] ?? r.category}{counselor && r.priority !== "normal" ? ` · الأولوية ${EDU_PRIORITY[r.priority]}` : ""}{counselor && r.owner_name ? ` · من ${r.owner_name}` : ""}</p>
        </button></li>)}</ul>}
    {(list.data?.total ?? 0) > 25 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>السابق</Button><span className="text-sm">{page + 1} / {Math.ceil((list.data?.total ?? 0) / 25)}</span><Button variant="outline" disabled={(page + 1) * 25 >= (list.data?.total ?? 0)} onClick={() => setPage(page + 1)}>التالي</Button></div>}
  </div>;
}

const ACTION_LABEL: Record<string, string> = { triage: "بدء الفرز", accept: "قبول للمتابعة", needs_info: "طلب استكمال", open_case: "فتح حالة", tips: "توصيات صفية للمعلم", close: "إغلاق الإحالة", reopen: "إعادة فتح" };

function ReferralView({ id, counselor, back, edit, changed, openCase }: { id: string; counselor: boolean; back: () => void; edit: (r: Row) => void; changed: () => void; openCase?: ((id: string) => void) | undefined }) {
  const d = useQuery({ queryKey: ["edu-detail", id], queryFn: () => rpc<Row & { events?: { action: string; created_at: string; actor_name: string; details: Record<string, unknown> }[] }>("edu_detail", { _id: id }) });
  const [busy, setBusy] = useState(false); const [caseCat, setCaseCat] = useState("");
  if (d.isLoading) return <LoadingState />;
  if (isDenied(d.error) || (d.data && d.data.kind !== "referral")) return <div className="space-y-3"><Button variant="ghost" onClick={back}><ArrowRight className="size-4" />الإحالات</Button><EmptyState title="لا يمكن فتح هذه الإحالة" hint="الرابط غير صحيح أو لا تملك صلاحية الاطلاع عليها." /></div>;
  if (d.error || !d.data) return <ErrorState message={arabicError(d.error)} onRetry={() => d.refetch()} />;
  const r = d.data; const p = (r.plan ?? {}) as RefPlan;
  async function act(action: string) {
    let payload: Record<string, unknown> = {};
    if (action === "needs_info") { const t = await askText("ما الذي يحتاج المعلم استكماله؟", { required: true, long: true }); if (!t) return; payload = { note: t }; }
    if (action === "close") { const t = await askText("سبب إغلاق الإحالة (يظهر للمعلم المحيل)", { required: true, long: true }); if (!t) return; payload = { note: t }; }
    if (action === "reopen") { const t = await askText("سبب إعادة الفتح", { required: true }); if (!t) return; payload = { note: t }; }
    if (action === "tips" || action === "accept") { const t = await askText(action === "accept" ? "توصيات صفية للمعلم (اختياري) — لا تكتب تفاصيل سرية" : "توصيات صفية للمعلم — لا تكتب تفاصيل سرية", { required: action === "tips", long: true, initial: p.class_tips ?? "" }); if (t === null) return; payload = { class_tips: t }; }
    if (action === "open_case") { if (!caseCat) { toast.error("اختر تصنيف الحالة أولًا"); return; } if (!(await ask("فتح حالة سرية مرتبطة بهذه الإحالة؟ لن يرى المعلم محتواها."))) return; payload = { category: caseCat }; }
    setBusy(true);
    try { const res = await rpc<{ case_id?: string }>("edu_ref_act", { _id: r.id, _rev: r.rev, _action: action, _p: payload }); toast.success("تم الحفظ"); changed(); await d.refetch(); if (action === "open_case" && res.case_id && openCase) openCase(res.case_id); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const actions = counselor ? refActions(r.status, !!p.case_id) : [];
  return <div className="space-y-4">
    <Button variant="ghost" onClick={back}><ArrowRight className="size-4" />الإحالات</Button>
    <header className="rounded-2xl border bg-card p-5"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{r.ref_no} · أُنشئت {r.record_date}</p><h2 className="truncate text-xl font-bold">{r.person}</h2><p className="text-sm text-muted-foreground">{CATS[r.category] ?? r.category}</p></div><RefBadge s={r.status} /></div>
      {!counselor && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" />تظهر لك مرحلة الإحالة والتوصيات الصفية فقط؛ ملف التوجيه سري.</p>}</header>
    {p.request_note && r.status === "needs_info" && <p className="rounded-lg border-s-4 border-accent bg-accent/20 p-3 text-sm"><b>طلب الموجّه: </b>{p.request_note}</p>}
    {p.class_tips && <p className="flex gap-2 rounded-lg border-s-4 border-primary bg-primary/5 p-3 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" /><span><b>توصيات صفية: </b>{p.class_tips}</span></p>}
    {p.close_reason && r.status === "closed" && <p className="rounded-lg bg-muted p-3 text-sm"><b>سبب الإغلاق: </b>{p.close_reason}</p>}
    <section className="grid gap-4 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-3">
      <div><p className="text-muted-foreground">تاريخ الملاحظة</p><p>{p.observed_on ?? "—"}</p></div><div><p className="text-muted-foreground">السياق</p><p>{REF_CONTEXT[p.context ?? ""] ?? "—"}</p></div><div><p className="text-muted-foreground">التكرار</p><p>{REF_FREQUENCY[p.frequency ?? ""] ?? "—"}</p></div>
      <div className="sm:col-span-3"><p className="text-muted-foreground">الملاحظات الواقعية</p><p className="whitespace-pre-wrap">{r.description || "—"}</p></div>
      <div className="sm:col-span-3"><p className="text-muted-foreground">الدعم السابق</p><p className="whitespace-pre-wrap">{p.prior_support || "—"}</p></div>
    </section>
    <section className="space-y-3 rounded-2xl border bg-card p-5"><h3 className="font-semibold">مرفقات الإحالة</h3>{!counselor && ["draft", "sent", "needs_info"].includes(r.status) && <p className="text-xs text-muted-foreground">أرفق عينة عمل أو ملاحظة موثقة تدعم الإحالة (صور أو PDF). تُغلق الإضافة بعد قرار الفرز.</p>}<CaseFiles r={r as Parameters<typeof CaseFiles>[0]["r"]} canAdd={!counselor && ["draft", "sent", "needs_info"].includes(r.status)} sessions={false} refresh={async () => { await d.refetch(); }} /></section>
    {r.can_edit && <Button onClick={() => edit(r)}><Pencil className="size-4" />{r.status === "needs_info" ? "استكمال وإعادة الإرسال" : "متابعة المسودة"}</Button>}
    {counselor && <section className="space-y-3 rounded-2xl border bg-card p-5"><h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="size-4" />قرار الموجّه</h3>
      <p className="text-xs text-muted-foreground">لا تتحول الإحالة إلى دراسة حالة تلقائيًا؛ اختر الإجراء المناسب.</p>
      {p.case_id && <Button variant="outline" onClick={() => openCase?.(p.case_id!)}><FolderOpen className="size-4" />فتح الحالة المرتبطة</Button>}
      {actions.includes("open_case") && <div className="flex flex-wrap items-center gap-2"><select aria-label="تصنيف الحالة" className={selectCls("w-56")} value={caseCat} onChange={(e) => setCaseCat(e.target.value)}><option value="">تصنيف الحالة…</option>{Object.entries(EDU_CATEGORIES.case).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Button variant="outline" disabled={busy} onClick={() => void act("open_case")}><FolderOpen className="size-4" />فتح حالة</Button></div>}
      <div className="flex flex-wrap gap-2">{actions.filter((a) => a !== "open_case").map((a) => <Button key={a} variant={a === "close" ? "outline" : a === "accept" ? "default" : "secondary"} disabled={busy} onClick={() => void act(a)}>{ACTION_LABEL[a]}</Button>)}</div>
    </section>}
    <section className="rounded-2xl border bg-card p-5"><h3 className="mb-3 font-semibold">سجل الإجراءات</h3><ol className="space-y-2 border-s ps-4 text-sm">{(r.events ?? []).map((e, i) => <li key={i}><p>{REF_EVENT[e.action] ?? e.action}{typeof e.details?.["status"] === "string" ? ` ← ${REF_STATUS[e.details["status"] as string] ?? ""}` : ""}</p><p className="text-xs text-muted-foreground">{e.actor_name} · {new Date(e.created_at).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</p></li>)}</ol></section>
  </div>;
}
