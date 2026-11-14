import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { HrPageTop } from "@/components/hr/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { exportXlsx } from "@/lib/export";
import { rpc } from "@/components/hr/shared";
import { Pill } from "@/components/hr/money";
import { Extensions, useExt, usePeople, type Ext } from "@/components/hr/extensions";

export const Route = createFileRoute("/_authenticated/app/hr_/performance")({
  head: () => ({ meta: [{ title: "الأداء الوظيفي — الموارد البشرية — ركاز" }, { name: "description", content: "نماذج تقييم بإصدارات، دورات وتحديد المقيّم، مراجعة ونشر، وإقرار الموظف أو اعتراضه ومتابعة نتيجته." }, { property: "og:title", content: "الأداء الوظيفي — ركاز" }, { property: "og:description", content: "دورة تقييم الأداء الوظيفي في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

export type Crit = { key: string; label: string; weight: number; max: number };
type Setup = { caps: Record<"view" | "assign" | "review" | "publish" | "evidence" | "export", boolean>; forms: { id: string; name: string; category: string; active: boolean; version: number; criteria: Crit[] }[]; cycles: { id: string; name: string; period_start: string; period_end: string; status: string }[]; schools: { id: string; name: string }[] };
type Src = { source: string; ref: string; date: string; label: string; summary: string };
type Rev = { id: string; cycle: string; cycle_id: string; employee_id: string; employee: string; employee_no: string; school: string; form: string; criteria: Crit[]; evaluator: string; status: string; scores: Record<string, number>; total: number | null; comments: string | null;
  evidence: Src[] | null; evidence_hidden: boolean; sources: Src[] | null; reviewer: string | null; review_note: string | null; publisher: string | null; published_at: string | null; published_total: number | null; objection: string | null; resolution: string | null; resolution_note: string | null; resolved_by: string | null; final_total: number | null;
  can: { evaluate: boolean; review: boolean; publish: boolean; resolve: boolean }; events?: { at: string; action: string; reason: string | null; by: string }[] };
export const PF_ST: Record<string, string> = { assigned: "بانتظار التقييم", submitted: "بانتظار المراجعة", returned: "أُعيد للمقيّم", reviewed: "روجع — بانتظار النشر", published: "منشور — بانتظار رد الموظف", acknowledged: "أقرّ الموظف", objected: "اعتراض قائم", resolved: "بُتّ في الاعتراض" };
const CAT: Record<string, string> = { teacher: "المعلمون", admin: "الإداريون", support: "الخدمات المساندة", staff: "عام" };
const ACT: Record<string, string> = { assign: "تكليف", save: "حفظ مسودة", submit: "إرسال للمراجعة", return: "إعادة", review_ok: "اعتماد المراجعة", publish: "نشر", ack: "إقرار الموظف", object: "اعتراض", amend: "تعديل النتيجة بعد الاعتراض", uphold: "تثبيت النتيجة" };

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const q = useExt(org);
  if (!active) return null;
  const d = q.data;
  const on = d?.items.find((i) => i.ext === "performance")?.enabled;
  const can = d && (d.performance.view || d.performance.assign || d.performance.review || d.performance.publish || d.performance.evaluator);
  return (
    <>
      <HrPageTop title="الأداء الوظيفي" desc="تكليف ← تقييم ← مراجعة من غير المقيّم ← نشر ← إقرار أو اعتراض ← بتّ. النتيجة المنشورة ثابتة، والأدلة لا تظهر إلا للمقيّم ومن يملك صلاحيتها. أي أثر على الراتب أو الخدمة يحتاج قرارًا مستقلًا." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !d!.hr ? <SectionLocked /> : (
        <div className="space-y-4">
          {d!.owner && <Extensions org={org!} d={d!} />}
          {!on ? <EmptyState title="امتداد الأداء غير مفعّل" hint={d!.owner ? "فعّله أعلاه بقرار موثق." : "يفعّله مالك المؤسسة."} /> : !can ? <ForbiddenState /> : <Workspace org={org!} d={d!} />}
        </div>)}
    </>
  );
}

function Workspace({ org, d }: { org: string; d: Ext }) {
  const sq = useQuery({ queryKey: ["hr-pf-setup", org], queryFn: () => rpc<Setup>("hr_pf_setup", { _org: org }) });
  const [tab, setTab] = useState<"reviews" | "setup">("reviews");
  if (sq.isLoading) return <LoadingState />;
  if (sq.error) return <ErrorState message={arabicError(sq.error)} onRetry={() => sq.refetch()} />;
  const s = sq.data!;
  return (
    <div className="space-y-4">
      {s.caps.assign && <nav className="flex gap-2 text-sm" aria-label="أقسام الأداء">
        {([["reviews", "التقييمات"], ["setup", "النماذج والدورات"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={"rounded-lg px-3 py-1.5 " + (tab === k ? "bg-primary text-primary-foreground" : "border bg-card hover:border-primary")}>{l}</button>)}
      </nav>}
      {tab === "setup" && s.caps.assign ? <SetupPanel org={org} s={s} /> : <Reviews org={org} s={s} d={d} />}
    </div>
  );
}

function SetupPanel({ org, s }: { org: string; s: Setup }) {
  const qc = useQueryClient();
  const blank = () => ({ id: "", name: "", category: "teacher", criteria: [{ key: "c1", label: "", weight: "50", max: "5" }, { key: "c2", label: "", weight: "50", max: "5" }] });
  const [f, setF] = useState<{ id: string; name: string; category: string; criteria: { key: string; label: string; weight: string; max: string }[] } | null>(null);
  const [c, setC] = useState<{ name: string; period_start: string; period_end: string } | null>(null);
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-pf-setup"] }); };
  const saveF = useMutation({ mutationFn: () => rpc("hr_pf_form_save", { _org: org, _id: f!.id || null, _p: { name: f!.name, category: f!.category, criteria: f!.criteria.map((x) => ({ key: x.key, label: x.label, weight: Number(x.weight), max: Number(x.max) })) } }), onSuccess: () => { setF(null); done("حُفظ النموذج"); }, onError: (e) => toast.error(arabicError(e)) });
  const saveC = useMutation({ mutationFn: () => rpc("hr_pf_cycle_save", { _org: org, _id: null, _p: c }), onSuccess: () => { setC(null); done("أُضيفت الدورة"); }, onError: (e) => toast.error(arabicError(e)) });
  return (
    <div className="space-y-4">
      <Section title="نماذج التقييم" desc="أي تعديل على المعايير ينشئ إصدارًا جديدًا. التقييمات المسندة تحتفظ بنسختها ولا تتأثر." action={!f ? <Button size="sm" onClick={() => setF(blank())}><Plus className="size-4" />نموذج</Button> : undefined}>
        {f && <form aria-label="نموذج تقييم" className="mb-3 space-y-2 rounded-xl border bg-card p-3" onSubmit={(e) => { e.preventDefault(); if (!saveF.isPending) saveF.mutate(); }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label htmlFor="f-n">اسم النموذج</Label><Input id="f-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><Label htmlFor="f-c">الفئة</Label><select id="f-c" className={selectCls("w-full")} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
          {f.criteria.map((x, i) => <div key={x.key} className="flex flex-wrap items-end gap-2">
            <Input aria-label={`المعيار ${i + 1}`} placeholder="المعيار" className="min-w-48 flex-1" value={x.label} onChange={(e) => setF({ ...f, criteria: f.criteria.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
            <Input aria-label={`وزن المعيار ${i + 1}`} className="w-24" dir="ltr" inputMode="decimal" value={x.weight} onChange={(e) => setF({ ...f, criteria: f.criteria.map((y, j) => (j === i ? { ...y, weight: e.target.value } : y)) })} />
            <Input aria-label={`الدرجة القصوى ${i + 1}`} className="w-20" dir="ltr" inputMode="numeric" value={x.max} onChange={(e) => setF({ ...f, criteria: f.criteria.map((y, j) => (j === i ? { ...y, max: e.target.value } : y)) })} />
            {f.criteria.length > 1 && <Button type="button" size="sm" variant="ghost" aria-label="حذف المعيار" onClick={() => setF({ ...f, criteria: f.criteria.filter((_, j) => j !== i) })}><X className="size-4" /></Button>}
          </div>)}
          <p className="text-xs text-muted-foreground">الوزن نسبي، والنتيجة من 100. الدرجة القصوى لكل معيار من 1 إلى 10.</p>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, criteria: [...f.criteria, { key: `c${Date.now()}`, label: "", weight: "10", max: "5" }] })}><Plus className="size-4" />معيار</Button>
            <Button type="submit" disabled={saveF.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setF(null)}>إلغاء</Button></div>
        </form>}
        {s.forms.length === 0 ? <EmptyState title="لا توجد نماذج" /> : <ul className="grid gap-2 md:grid-cols-2">{s.forms.map((x) => <li key={x.id} className="rounded-xl border bg-card p-3 text-sm">
          <div className="flex items-center gap-2"><span className="flex-1 font-bold">{x.name}</span><Pill tone="muted">إصدار {x.version}</Pill>{!f && <Button size="sm" variant="ghost" onClick={() => setF({ id: x.id, name: x.name, category: x.category, criteria: x.criteria.map((c) => ({ key: c.key, label: c.label, weight: String(c.weight), max: String(c.max) })) })}>تعديل</Button>}</div>
          <p className="text-xs text-muted-foreground">{CAT[x.category]} · {x.criteria.map((c) => `${c.label} (${c.weight})`).join("، ")}</p></li>)}</ul>}
      </Section>
      <Section title="دورات التقييم" action={!c ? <Button size="sm" variant="outline" onClick={() => setC({ name: "", period_start: "", period_end: "" })}><Plus className="size-4" />دورة</Button> : undefined}>
        {c && <form aria-label="دورة تقييم" className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!saveC.isPending) saveC.mutate(); }}>
          <div><Label htmlFor="c-n">الاسم</Label><Input id="c-n" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div><Label htmlFor="c-s">من</Label><Input id="c-s" type="date" value={c.period_start} onChange={(e) => setC({ ...c, period_start: e.target.value })} /></div>
          <div><Label htmlFor="c-e">إلى</Label><Input id="c-e" type="date" value={c.period_end} onChange={(e) => setC({ ...c, period_end: e.target.value })} /></div>
          <Button type="submit" disabled={saveC.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setC(null)}>إلغاء</Button>
        </form>}
        {s.cycles.length === 0 ? <EmptyState title="لا توجد دورات" /> : <ul className="space-y-1">{s.cycles.map((x) => <li key={x.id} className="rounded-lg border bg-card p-2 text-sm"><b>{x.name}</b> <span className="text-xs text-muted-foreground">· {x.period_start} ← {x.period_end} · {x.status === "open" ? "مفتوحة" : "مغلقة"}</span></li>)}</ul>}
      </Section>
    </div>
  );
}

function Reviews({ org, s, d }: { org: string; s: Setup; d: Ext }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ cycle: "", status: "", mine: false });
  const q = useQuery({ queryKey: ["hr-pf-list", org, f], queryFn: () => rpc<Rev[]>("hr_pf_list", { _org: org, _f: f }) });
  const [open, setOpen] = useState<string | null>(null);
  const [asg, setAsg] = useState<{ school: string; cycle: string; emp: string; form: string; evaluator: string } | null>(null);
  const people = usePeople(asg?.school ?? "", "performance");
  const evs = useQuery({ queryKey: ["hr-pf-evs", asg?.school], enabled: !!asg?.school, queryFn: () => rpc<{ user_id: string; name: string }[]>("hr_pf_evaluators", { _school: asg!.school }) });
  const assign = useMutation({ mutationFn: () => rpc("hr_pf_assign", { _cycle: asg!.cycle, _emp: asg!.emp, _form: asg!.form, _evaluator: asg!.evaluator }), onSuccess: () => { toast.success("أُسند التقييم"); setAsg(null); qc.invalidateQueries({ queryKey: ["hr-pf-list"] }); }, onError: (e) => toast.error(arabicError(e)) });
  const rows = q.data ?? [];
  const openCycles = s.cycles.filter((c) => c.status === "open"); const forms = s.forms.filter((x) => x.active);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <select aria-label="الدورة" className={selectCls("w-48")} value={f.cycle} onChange={(e) => setF({ ...f, cycle: e.target.value })}><option value="">كل الدورات</option>{s.cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="الحالة" className={selectCls("w-52")} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(PF_ST).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {d.performance.evaluator && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} />المسندة إليّ</label>}
        {s.caps.assign && s.schools.length > 0 && openCycles.length > 0 && forms.length > 0 && !asg && <Button onClick={() => setAsg({ school: s.schools[0]!.id, cycle: openCycles[0]!.id, emp: "", form: forms[0]!.id, evaluator: "" })}><Plus className="size-4" />إسناد تقييم</Button>}
        {s.caps.export && <Button variant="ghost" disabled={!rows.length} onClick={() => exportXlsx({ title: "تقرير الأداء", filters: [f.cycle ? s.cycles.find((c) => c.id === f.cycle)?.name ?? "" : "كل الدورات", f.status ? PF_ST[f.status]! : "كل الحالات"], note: `${rows.length} تقييم — بلا أدلة` },
          ["الموظف", "الرقم", "المدرسة", "الدورة", "النموذج", "المقيّم", "الحالة", "النتيجة", "المنشورة", "النهائية"], rows.map((r) => [r.employee, r.employee_no, r.school, r.cycle, r.form, r.evaluator, PF_ST[r.status] ?? r.status, r.total ?? "", r.published_total ?? "", r.final_total ?? ""]))}><Download className="size-4" />Excel</Button>}
      </div>
      {asg && <form aria-label="إسناد تقييم" className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); if (!assign.isPending) assign.mutate(); }}>
        <div><Label htmlFor="a-s">المدرسة</Label><select id="a-s" className={selectCls("w-full")} value={asg.school} onChange={(e) => setAsg({ ...asg, school: e.target.value, emp: "", evaluator: "" })}>{s.schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><Label htmlFor="a-c">الدورة</Label><select id="a-c" className={selectCls("w-full")} value={asg.cycle} onChange={(e) => setAsg({ ...asg, cycle: e.target.value })}>{openCycles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><Label htmlFor="a-e">الموظف</Label><select id="a-e" className={selectCls("w-full")} value={asg.emp} onChange={(e) => setAsg({ ...asg, emp: e.target.value })}><option value="">اختر…</option>{(people.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><Label htmlFor="a-f">النموذج</Label><select id="a-f" className={selectCls("w-full")} value={asg.form} onChange={(e) => setAsg({ ...asg, form: e.target.value })}>{forms.map((x) => <option key={x.id} value={x.id}>{x.name} (إصدار {x.version})</option>)}</select></div>
        <div><Label htmlFor="a-v">المقيّم</Label><select id="a-v" className={selectCls("w-full")} value={asg.evaluator} onChange={(e) => setAsg({ ...asg, evaluator: e.target.value })}><option value="">اختر…</option>{(evs.data ?? []).map((x) => <option key={x.user_id} value={x.user_id}>{x.name}</option>)}</select></div>
        <p className="text-xs text-muted-foreground sm:col-span-5">تظهر في قائمة المقيّمين فقط الحسابات التي تملك صلاحية التقييم في هذه المدرسة.</p>
        <div className="flex gap-2 sm:col-span-5"><Button type="submit" disabled={!asg.emp || !asg.evaluator || assign.isPending}>إسناد</Button><Button type="button" variant="ghost" onClick={() => setAsg(null)}>إلغاء</Button></div>
      </form>}
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد تقييمات" /> : (
        <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => <li key={r.id} className={"rounded-xl border bg-card p-3 text-sm " + (open === r.id ? "border-primary" : "")}>
          <div className="flex flex-wrap items-center gap-2"><button type="button" aria-expanded={open === r.id} className="flex-1 text-start font-bold" onClick={() => setOpen(open === r.id ? null : r.id)}>{r.employee}</button><Pill tone={["published", "acknowledged", "resolved"].includes(r.status) ? "ok" : r.status === "objected" ? "bad" : "wait"}>{PF_ST[r.status]}</Pill></div>
          <p className="text-xs text-muted-foreground">{r.cycle} · {r.school} · المقيّم: {r.evaluator}{r.total != null ? ` · ${r.total}/100` : ""}</p>
        </li>)}</ul>)}
      {open && <ReviewDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ReviewDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-pf", id], queryFn: () => rpc<Rev>("hr_pf_get", { _id: id }) });
  const [form, setForm] = useState<{ scores: Record<string, string>; comments: string; evidence: string[] } | null>(null);
  const [res, setRes] = useState<{ amend: boolean; note: string; total: string } | null>(null);
  const refresh = (m: string) => { toast.success(m); setForm(null); setRes(null); qc.invalidateQueries({ queryKey: ["hr-pf"] }); qc.invalidateQueries({ queryKey: ["hr-pf-list"] }); };
  const err = (e: unknown) => { if ((e as Error).message !== "أُلغي") toast.error(arabicError(e)); };
  const save = useMutation({ mutationFn: (submit: boolean) => rpc("hr_pf_save", { _id: id, _p: { scores: Object.fromEntries(Object.entries(form!.scores).filter(([, v]) => v !== "")), comments: form!.comments, evidence: form!.evidence }, _submit: submit }), onSuccess: (_d, submit) => refresh(submit ? "أُرسل للمراجعة" : "حُفظت المسودة"), onError: err });
  const review = useMutation({ mutationFn: async (ok: boolean) => { const note = ok ? null : await askText("سبب الإعادة للمقيّم", { required: true }); if (!ok && !note) throw new Error("أُلغي"); return rpc("hr_pf_review", { _id: id, _approve: ok, _note: note }); }, onSuccess: (_d, ok) => refresh(ok ? "اعتُمدت المراجعة" : "أُعيد للمقيّم"), onError: err });
  const publish = useMutation({ mutationFn: () => rpc("hr_pf_publish", { _id: id }), onSuccess: () => refresh("نُشرت النتيجة للموظف"), onError: err });
  const resolve = useMutation({ mutationFn: () => rpc("hr_pf_resolve", { _id: id, _amend: res!.amend, _note: res!.note, _total: res!.amend ? Number(res!.total) : null }), onSuccess: () => refresh("صدر البت في الاعتراض"), onError: err });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const r = q.data!;
  const start = () => setForm({ scores: Object.fromEntries(r.criteria.map((c) => [c.key, r.scores[c.key] != null ? String(r.scores[c.key]) : ""])), comments: r.comments ?? "", evidence: (r.evidence ?? []).map((x) => x.ref) });
  return (
    <section aria-label={`تقييم ${r.employee}`} className="space-y-3 rounded-xl border-2 border-primary/30 bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2"><span className="flex-1"><b className="text-base">{r.employee}</b> <span className="text-xs text-muted-foreground">· {r.form} · {r.cycle} · المقيّم: {r.evaluator}</span></span><Pill tone="muted">{PF_ST[r.status]}</Pill><Button size="sm" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      {form ? (
        <form aria-label="تعبئة التقييم" className="space-y-2" onSubmit={(e) => { e.preventDefault(); }}>
          {r.criteria.map((c) => <div key={c.key} className="flex flex-wrap items-center gap-2"><Label htmlFor={`s-${c.key}`} className="min-w-40 flex-1">{c.label} <span className="text-xs text-muted-foreground">(وزن {c.weight}، من {c.max})</span></Label>
            <Input id={`s-${c.key}`} className="w-24" dir="ltr" inputMode="decimal" value={form.scores[c.key] ?? ""} onChange={(e) => setForm({ ...form, scores: { ...form.scores, [c.key]: e.target.value } })} /></div>)}
          <div><Label htmlFor="s-c">ملاحظات تُنشر للموظف</Label><textarea id="s-c" className="mt-1 w-full rounded-md border bg-background p-2" rows={3} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></div>
          {(r.sources ?? []).length > 0 && <fieldset className="rounded-lg border p-2"><legend className="px-1 text-xs font-semibold">أدلة من التقييم الحالي (زيارات صفية وتقييمات شهرية معتمدة)</legend>
            {r.sources!.map((s) => <label key={s.ref} className="flex items-start gap-2 py-0.5 text-xs"><input type="checkbox" checked={form.evidence.includes(s.ref)} onChange={(e) => setForm({ ...form, evidence: e.target.checked ? [...form.evidence, s.ref] : form.evidence.filter((x) => x !== s.ref) })} /><span>{s.date} — {s.label}{s.summary ? ` · ${s.summary}` : ""}</span></label>)}</fieldset>}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate(false)}>حفظ مسودة</Button><Button type="button" disabled={save.isPending} onClick={() => save.mutate(true)}>إرسال للمراجعة</Button><Button type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button></div>
        </form>
      ) : <>
        <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-start">المعيار</th><th>الوزن</th><th>الدرجة</th></tr></thead>
          <tbody>{r.criteria.map((c) => <tr key={c.key} className="border-t"><td className="py-1">{c.label}</td><td className="text-center">{c.weight}</td><td className="text-center">{r.scores[c.key] != null ? `${r.scores[c.key]} / ${c.max}` : "—"}</td></tr>)}</tbody></table>
        <p><b>النتيجة:</b> {r.total ?? "—"} / 100{r.published_total != null ? ` · المنشورة ${r.published_total}` : ""}{r.final_total != null && r.final_total !== r.published_total ? ` · النهائية ${r.final_total}` : ""}</p>
        {r.comments && <p className="rounded bg-secondary/40 p-2">{r.comments}</p>}
        {r.evidence ? (r.evidence.length > 0 && <div><p className="text-xs font-semibold">الأدلة المرجعية</p><ul className="text-xs text-muted-foreground">{r.evidence.map((x) => <li key={x.ref}>{x.date} — {x.label}</li>)}</ul></div>) : r.evidence_hidden && <p className="text-xs text-muted-foreground">توجد أدلة مرجعية تحتاج صلاحية الاطلاع على الأدلة.</p>}
        {r.review_note && <p className="text-xs">ملاحظة المراجع ({r.reviewer}): {r.review_note}</p>}
        {r.objection && <p className="rounded border border-warning/40 bg-warning/10 p-2 text-xs"><b>اعتراض الموظف:</b> {r.objection}</p>}
        {r.resolution && <p className="text-xs"><b>البت:</b> {r.resolution === "amended" ? "عُدّلت النتيجة" : "ثُبّتت النتيجة"} — {r.resolution_note} ({r.resolved_by})</p>}
        <div className="flex flex-wrap gap-2">
          {r.can.evaluate && <Button size="sm" onClick={start}>{r.status === "returned" ? "تعديل التقييم" : "تعبئة التقييم"}</Button>}
          {r.can.review && <><Button size="sm" disabled={review.isPending} onClick={() => review.mutate(true)}>اعتماد المراجعة</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate(false)}>إعادة للمقيّم</Button></>}
          {r.can.publish && <Button size="sm" disabled={publish.isPending} onClick={() => publish.mutate()}>نشر للموظف</Button>}
          {r.can.resolve && !res && <Button size="sm" variant="outline" onClick={() => setRes({ amend: false, note: "", total: String(r.published_total ?? "") })}>البت في الاعتراض</Button>}
        </div>
        {res && <form aria-label="البت في الاعتراض" className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!resolve.isPending) resolve.mutate(); }}>
          <select aria-label="القرار" className={selectCls("w-40")} value={res.amend ? "1" : "0"} onChange={(e) => setRes({ ...res, amend: e.target.value === "1" })}><option value="0">تثبيت النتيجة</option><option value="1">تعديل النتيجة</option></select>
          {res.amend && <Input aria-label="النتيجة المعدلة" className="w-24" dir="ltr" inputMode="decimal" value={res.total} onChange={(e) => setRes({ ...res, total: e.target.value })} />}
          <Input aria-label="نتيجة البت" placeholder="مسوغات القرار" className="min-w-48 flex-1" value={res.note} onChange={(e) => setRes({ ...res, note: e.target.value })} />
          <Button size="sm" type="submit" disabled={resolve.isPending}>حفظ</Button><Button size="sm" type="button" variant="ghost" onClick={() => setRes(null)}>إلغاء</Button>
        </form>}
      </>}
      {(r.events ?? []).length > 0 && <details><summary className="cursor-pointer text-xs">سجل الإجراءات ({r.events!.length})</summary><ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{r.events!.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString("ar-SA-u-nu-latn")} — {ACT[e.action] ?? e.action} — {e.by}{e.reason ? ` — ${e.reason}` : ""}</li>)}</ul></details>}
    </section>
  );
}
