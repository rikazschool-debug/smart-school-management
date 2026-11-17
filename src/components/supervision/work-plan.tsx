import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUnsaved } from "./use-unsaved";
import { ArrowRight, Copy, Download, FileText, Printer, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { ask, askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { LoadingState, ErrorState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { Filler } from "./filler";
import { EvidencePanel } from "./evidence";
import { ActionProgress } from "./work-progress";
import { missingFields, REC_STATUS, type SvForm, type SvMe, type SvRecordFull } from "./model";
import { planReport } from "./work-report";
import { copyPlanData, EXECUTION, PLAN_KIND, type Plan, type WorkPool } from "./work-model";

export function PlanEditor({ org, me, plan, plans, onDone, onDocument }: { org: string; me: SvMe; plan?: Plan | undefined; plans: Plan[]; onDone: (id?: string) => void; onDocument: (id: string) => void }) {
  const schools = me.schools.filter((s) => me.owner || s.principal || s.supervisor);
  const identity = useQuery({ queryKey: ["sv-identity"], queryFn: async () => (await db.auth.getUser()).data.user?.id ?? "" });
  const [school, setSchool] = useState(plan?.school_id ?? schools[0]?.id ?? ""); const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Plan["kind"]>(plan?.kind ?? "annual"); const [year, setYear] = useState(plan?.year_id ?? ""); const [term, setTerm] = useState(plan?.term_id ?? ""); const [parent, setParent] = useState(plan?.parent_id ?? "");
  const [data, setData] = useState<Record<string, unknown>>(plan?.data ?? {}); const [busy, setBusy] = useState(false); const [copying, setCopying] = useState(false);
  const forms = useQuery({ queryKey: ["sv-forms", org], retry: false, queryFn: async () => { const r = await db.rpc("sv_form_list", { _org: org }); if (r.error) throw r.error; return r.data as SvForm[]; } });
  const pool = useQuery({ queryKey: ["sv3-pool", school], enabled: !!school && (!plan || plan.can_work), retry: false, queryFn: async () => { const r = await db.rpc("sv3_pool", { _school: school }); if (r.error) throw r.error; return r.data as WorkPool; } });
  const record = useQuery({ queryKey: ["sv-rec", plan?.id], enabled: !!plan, retry: false, queryFn: async () => { const r = await db.rpc("sv_rec_get", { _id: plan?.id }); if (r.error) throw r.error; return r.data as SvRecordFull; } });
  const form = (forms.data ?? []).filter((f) => f.key === "improvement_plan" && f.org_id && f.status === "published" && (!f.school_id || f.school_id === school)).sort((a, b) => Number(!!b.school_id) - Number(!!a.school_id) || b.version - a.version)[0];
  const spec = record.data?.form_snapshot.spec ?? (form ? { ...form.spec, sv3_plan: true } : undefined);
  const dirty = JSON.stringify(data) !== JSON.stringify(plan?.data ?? {}) || copying || school !== (plan?.school_id ?? schools[0]?.id ?? "") || kind !== (plan?.kind ?? "annual") || year !== (plan?.year_id ?? "") || term !== (plan?.term_id ?? "") || parent !== (plan?.parent_id ?? "");
  const guard = useUnsaved(dirty);
  const editRev = useRef(plan?.rev);
  const editable = !plan || plan.can_work || copying;
  async function document() { if (plan) await guard.leave(() => onDocument(plan.id)); }
  function report(mode: "xlsx" | "pdf" | "print") { if (!plan || !record.data) return; const r = planReport(plan, record.data); if (mode === "xlsx") exportXlsx(r.meta, r.headers, r.rows); else if (mode === "pdf") void exportPdf(r.meta, r.headers, r.rows); else printReport(r.meta, r.headers, r.rows); }
  async function save(submit: boolean) {
    if (!spec) return;
    if (submit) { const missing = missingFields(spec, data); if (missing.length) return void toast.error(`أكمل قبل الإرسال: ${missing.join("، ")}`); }
    setBusy(true);
    try { const r = await db.rpc("sv3_plan_save", { _id: copying ? null : plan?.id ?? null, _rev: copying ? null : editRev.current ?? null, _p: { school_id: school, kind, year_id: year || null, term_id: term || null, parent_id: parent || null, data } }); if (r.error) throw r.error;
      const id = r.data as string;
      if (submit) { const g = await db.rpc("sv_rec_get", { _id: id }); if (g.error) throw g.error; const a = await db.rpc("sv_rec_act", { _id: id, _rev: (g.data as { rev: number }).rev, _action: "submit", _text: null }); if (a.error) throw a.error; }
      guard.saved(); const latest = await db.rpc("sv_rec_get", { _id: id }); if (!latest.error) editRev.current = (latest.data as { rev: number }).rev; toast.success(submit ? "أُرسلت الخطة للمراجعة" : "حُفظت مسودة الخطة"); onDone(id);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function back() { await guard.leave(() => onDone()); }
  if (forms.isLoading || record.isLoading) return <LoadingState />;
  if (record.error) return <ErrorState message={arabicError(record.error)} onRetry={() => record.refetch()} />;
  return <div className="space-y-4">
    <Button variant="ghost" onClick={back}><ArrowRight />العودة إلى الخطط</Button>
    <header className="border-b pb-3"><h2 className="text-xl font-bold">{plan && !copying ? plan.title : "خطة إشرافية جديدة"}</h2><p className="mt-1 text-sm text-muted-foreground">{plan && !copying ? `${REC_STATUS[plan.status]} · التنفيذ: ${EXECUTION[plan.execution]} · إصدار النموذج ${plan.form_version}` : "مسودة"}</p></header>
    {!editable && plan && <div className="flex flex-wrap gap-2"><Button onClick={document}>المراجعة والاعتماد وسجل التغيير</Button><Button variant="outline" onClick={() => { setData(copyPlanData(plan.data)); setYear(""); setTerm(""); setParent(""); setCopying(true); setStep(0); }}><Copy />نسخ كمسودة جديدة</Button></div>}
    {plan?.status === "approved" && !copying && <Button variant="outline" onClick={async () => { const reason = await askText("سبب مراجعة الخطة المعتمدة", { required: true, long: true }); if (!reason) return; const r = await db.rpc("sv3_plan_revision", { _id: plan.id, _rev: plan.rev, _reason: reason }); if (r.error) toast.error(arabicError(r.error)); else onDone(r.data as string); }}>مراجعة جديدة مع حفظ النسخة المعتمدة</Button>}
    {plan?.status === "approved" && !copying && <label className="block text-sm">تقدم التنفيذ<select aria-label="تقدم تنفيذ الخطة" className={selectCls("ms-2")} value={plan.execution} onChange={async (e) => { const r = await db.rpc("sv3_plan_execution", { _id: plan.id, _rev: plan.rev, _state: e.target.value }); if (r.error) toast.error(arabicError(r.error)); else { toast.success("حُدث التنفيذ دون تغيير الاعتماد"); onDone(plan.id); } }}>{Object.entries(EXECUTION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
    {editable && <nav aria-label="خطوات الخطة" className="flex flex-wrap gap-2">{["النطاق والفترة", "الاحتياجات والأهداف", "الأنشطة والزيارات", "المراجعة"].map((l, i) => <Button size="sm" key={l} variant={step === i ? "default" : "outline"} onClick={() => setStep(i)}>{i + 1}. {l}</Button>)}</nav>}
    {(step === 0 || !editable) && <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">الفرع<select aria-label="فرع الخطة" disabled={!!plan && !copying} className={selectCls("mt-1 w-full")} value={school} onChange={(e) => { setSchool(e.target.value); setYear(""); setTerm(""); setParent(""); }}>{(editable ? schools : me.schools).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-sm">نوع الخطة<select aria-label="نوع الخطة" disabled={!editable} className={selectCls("mt-1 w-full")} value={kind} onChange={(e) => { setKind(e.target.value as Plan["kind"]); setParent(""); }}>{Object.entries(PLAN_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="text-sm">العام الدراسي<select aria-label="عام الخطة" disabled={!editable} className={selectCls("mt-1 w-full")} value={year} onChange={(e) => { setYear(e.target.value); setTerm(""); }}><option value="">اختر العام</option>{(pool.data?.years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
      {kind !== "annual" && <><label className="text-sm">الفصل<select aria-label="فصل الخطة" disabled={!editable} className={selectCls("mt-1 w-full")} value={term} onChange={(e) => setTerm(e.target.value)}><option value="">اختر الفصل</option>{(pool.data?.terms ?? []).filter((t) => t.year_id === year).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="text-sm">الخطة الأصل<select aria-label="الخطة الأصل" disabled={!editable} className={selectCls("mt-1 w-full")} value={parent} onChange={(e) => { setParent(e.target.value); const p = plans.find((p) => p.id === e.target.value); if (p) { setYear(p.year_id ?? ""); setTerm(p.term_id ?? ""); setData((d) => ({ ...p.data, ...d })); } }}><option value="">اختر الخطة الأصل</option>{plans.filter((p) => p.school_id === school && p.kind === (kind === "term" ? "annual" : "term") && p.id !== plan?.id).map((p) => <option key={p.id} value={p.id}>{p.title} — {String(p.data["period_from"] ?? "")}</option>)}</select></label></>}
    </div>}
    {pool.error && editable && <p className="text-sm text-destructive">{arabicError(pool.error)}</p>}
    {!spec ? <p className="text-sm text-muted-foreground">اعتمد نموذج «خطة التحسين الإشرافية» للمؤسسة من مكتبة النماذج أولًا.</p> : <Filler spec={{ ...spec, sections: spec.sections.filter((_, i) => !editable || step === 3 || (step === 0 && i === 0) || (step === 1 && i === 1) || (step === 2 && i >= 2)) }} data={data} onChange={(d) => { guard.changed(); setData(d); }} people={[...(pool.data?.teachers.filter((t) => t.user_id).map((t) => ({ id: t.user_id ?? "", name: t.name })) ?? []), ...(identity.data ? [{ id: identity.data, name: "أنا" }] : [])]} readOnly={!editable} />}
    {plan?.status === "approved" && !copying && <ActionProgress plan={plan.id} actions={(Array.isArray(plan.data["actions"]) ? plan.data["actions"] : []) as Record<string, unknown>[]} />}
    {plan && !copying && <EvidencePanel plan={plan.id} canWork={plan.can_work} />}
    {plan && !copying && <div className="flex gap-2 border-t pt-3"><Button variant="outline" size="icon" aria-label="تصدير تقرير الخطة Excel" title="Excel" onClick={() => report("xlsx")}><Download /></Button><Button variant="outline" size="icon" aria-label="تصدير تقرير الخطة PDF" title="PDF" onClick={() => report("pdf")}><FileText /></Button><Button variant="outline" size="icon" aria-label="طباعة تقرير الخطة" title="طباعة" onClick={() => report("print")}><Printer /></Button></div>}
    {editable && <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background p-3"><Button variant="outline" disabled={busy || !spec} onClick={() => save(false)}><Save />حفظ مسودة</Button>{step < 3 ? <Button onClick={() => setStep(step + 1)}>التالي</Button> : <Button disabled={busy || !spec} onClick={() => save(true)}><Send />إرسال للمراجعة</Button>}{plan && <Button variant="ghost" onClick={document}>فتح سجل المراجعة</Button>}</div>}
  </div>;
}