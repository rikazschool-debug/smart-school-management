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
import { ask, askText } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { exportXlsx } from "@/lib/export";
import { rpc } from "@/components/hr/shared";
import { Pill, sar } from "@/components/hr/money";
import { Extensions, type Ext } from "@/components/hr/extensions";

type Vac = { id: string; ref: string; school: string; job_title: string; subject: string | null; stage: string | null; seats: number; reason: string; status: string; rev: number; created_by: string; decided_by: string | null; decision_reason: string | null; candidates: number; hired: number; can: { decide: boolean; add: boolean; close: boolean } };
type Cand = { id: string; vacancy_id: string; vacancy: string; vacancy_ref: string; school: string; full_name: string; email: string | null; phone: string | null; national_id: string | null; sensitive: boolean; education: string | null; experience: string | null; languages: string | null; stage: string; stage_reason: string | null; rev: number; employee_id: string | null; converted_by: string | null };
type Offer = { id: string; version: number; terms: { job_title: string; start_date: string; basic: number; allowances: string | null; notes: string | null }; status: string; created_by: string; approved_by: string | null; response_ref: string | null; response_reason: string | null; can_approve: boolean };
type CandD = Cand & { interviews: { id: string; held_on: string; panel: string; criteria: { name: string; score: number }[]; result: string; notes: string | null; by: string }[]; offers: Offer[]; can: { manage: boolean; convert: boolean } };

export const Route = createFileRoute("/_authenticated/app/hr_/recruit")({
  head: () => ({ meta: [{ title: "التوظيف — الموارد البشرية — ركاز" }, { name: "description", content: "احتياج المدرسة ← شاغر معتمد ← مرشحون ومقابلات ← عرض بإصدار ← قبول ← تحويل إلى موظف مرة واحدة." }, { property: "og:title", content: "التوظيف — ركاز" }, { property: "og:description", content: "دورة التوظيف في ركاز من الاحتياج حتى التحويل إلى موظف." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

const VS: Record<string, string> = { requested: "احتياج بانتظار الاعتماد", open: "شاغر مفتوح", rejected: "مرفوض", filled: "مكتمل", closed: "مغلق" };
const CS: Record<string, string> = { applied: "متقدم", screening: "قيد الفرز", shortlisted: "قائمة مختصرة", interview: "مقابلة", offer: "عرض", accepted: "قبل العرض", rejected: "مستبعد", withdrawn: "منسحب", converted: "حُوّل إلى موظف" };
const OS: Record<string, string> = { draft: "مسودة بانتظار الاعتماد", approved: "معتمد — بانتظار رد المرشح", accepted: "مقبول", declined: "اعتذر", superseded: "مستبدل بإصدار أحدث", withdrawn: "مسحوب" };
const RES: Record<string, string> = { pass: "ناجح", hold: "معلّق", fail: "غير ناجح" };

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const q = useQuery({ queryKey: ["hr-ext", org], enabled: !!org, queryFn: () => rpc<Ext>("hr_ext_list", { _org: org }) });
  if (!active) return null;
  const d = q.data;
  const on = d?.items.find((i) => i.ext === "recruit")?.enabled;
  return (
    <>
      <HrPageTop title="التوظيف" desc="احتياج المدرسة ← اعتماد الشاغر ← فرز ومقابلات ← عرض بإصدار يعتمده غير معدّه ← قبول بمرجع ← تحويل إلى موظف مرة واحدة. لا يُنشأ حساب دخول ولا تكليف أكاديمي من هنا." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !d!.hr ? <SectionLocked /> : (
        <div className="space-y-4">
          {d!.owner && <Extensions org={org!} d={d!} />}
          {!on ? <EmptyState title="امتداد التوظيف غير مفعّل" hint={d!.owner ? "فعّله أعلاه بقرار موثق." : "يفعّله مالك المؤسسة."} /> : !d!.recruit.view ? <ForbiddenState /> : <Workspace org={org!} d={d!} />}
        </div>)}
    </>
  );
}

function Workspace({ org, d }: { org: string; d: Ext }) {
  const qc = useQueryClient();
  const [st, setSt] = useState("");
  const vq = useQuery({ queryKey: ["hr-rc-vac", org, st], queryFn: () => rpc<Vac[]>("hr_rc_vacancies", { _org: org, _f: st ? { status: st } : {} }) });
  const [vac, setVac] = useState<string | null>(null);
  const [cand, setCand] = useState<string | null>(null);
  const [nv, setNv] = useState<{ school_id: string; job_title: string; subject: string; stage: string; seats: string; reason: string } | null>(null);
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-rc-vac"] }); qc.invalidateQueries({ queryKey: ["hr-rc-cands"] }); qc.invalidateQueries({ queryKey: ["hr-rc-cand"] }); };
  const saveV = useMutation({ mutationFn: () => rpc("hr_rc_vacancy_save", { _org: org, _p: nv }), onSuccess: () => { setNv(null); done("أُرسل الاحتياج للاعتماد"); }, onError: (e) => toast.error(arabicError(e)) });
  const actV = useMutation({ mutationFn: (a: { v: Vac; action: string; reason: string | null }) => rpc("hr_rc_vacancy_act", { _id: a.v.id, _rev: a.v.rev, _action: a.action, _reason: a.reason }), onSuccess: () => done("حُدّث الشاغر"), onError: (e) => toast.error(arabicError(e)) });
  const vact = async (v: Vac, action: string) => { const r = action === "approve" ? null : await askText(action === "reject" ? "سبب الرفض" : "سبب الإغلاق", { required: true }); if (action !== "approve" && !r) return; actV.mutate({ v, action, reason: r }); };
  const exp = () => {
    const rows = vq.data ?? [];
    exportXlsx({ title: "الاحتياجات والشواغر", filters: [st ? VS[st]! : "كل الحالات"], note: `${rows.length} سجل` }, ["المرجع", "المدرسة", "المسمى", "المادة", "المرحلة", "الشواغر", "المرشحون", "المعينون", "الحالة"],
      rows.map((v) => [v.ref, v.school, v.job_title, v.subject ?? "", v.stage ?? "", v.seats, v.candidates, v.hired, VS[v.status] ?? v.status]));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <select aria-label="حالة الشاغر" className={selectCls("w-full sm:w-52")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(VS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {d.recruit.manage && d.recruit_schools.length > 0 && !nv && <Button onClick={() => setNv({ school_id: d.recruit_schools[0]!.id, job_title: "", subject: "", stage: "", seats: "1", reason: "" })}><Plus className="size-4" />احتياج جديد</Button>}
        {d.recruit.export && <Button variant="ghost" onClick={exp}><Download className="size-4" />Excel</Button>}
      </div>
      {nv && <form aria-label="احتياج جديد" className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!saveV.isPending) saveV.mutate(); }}>
        <div><Label htmlFor="v-sc">المدرسة</Label><select id="v-sc" className={selectCls("w-full")} value={nv.school_id} onChange={(e) => setNv({ ...nv, school_id: e.target.value })}>{d.recruit_schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><Label htmlFor="v-jt">المسمى الوظيفي</Label><Input id="v-jt" value={nv.job_title} onChange={(e) => setNv({ ...nv, job_title: e.target.value })} /></div>
        <div><Label htmlFor="v-se">عدد الشواغر</Label><Input id="v-se" inputMode="numeric" dir="ltr" value={nv.seats} onChange={(e) => setNv({ ...nv, seats: e.target.value })} /></div>
        <div><Label htmlFor="v-su">التخصص/المادة (اختياري)</Label><Input id="v-su" value={nv.subject} onChange={(e) => setNv({ ...nv, subject: e.target.value })} /></div>
        <div><Label htmlFor="v-st">المرحلة (اختياري)</Label><Input id="v-st" value={nv.stage} onChange={(e) => setNv({ ...nv, stage: e.target.value })} /></div>
        <div><Label htmlFor="v-re">مبرر الاحتياج</Label><Input id="v-re" value={nv.reason} onChange={(e) => setNv({ ...nv, reason: e.target.value })} /></div>
        <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={saveV.isPending}>إرسال للاعتماد</Button><Button type="button" variant="ghost" onClick={() => setNv(null)}>إلغاء</Button></div>
      </form>}
      {vq.isLoading ? <LoadingState /> : vq.error ? <ErrorState message={arabicError(vq.error)} onRetry={() => vq.refetch()} /> : (vq.data ?? []).length === 0 ? <EmptyState title="لا توجد احتياجات" hint="يبدأ التوظيف باحتياج مدرسة يعتمده شخص آخر." /> : (
        <ul className="grid gap-2 md:grid-cols-2">{vq.data!.map((v) => <li key={v.id} className={"space-y-1 rounded-xl border bg-card p-3 text-sm " + (vac === v.id ? "border-primary" : "")}>
          <div className="flex flex-wrap items-center gap-2"><button type="button" className="flex-1 text-start font-bold" onClick={() => { setVac(vac === v.id ? null : v.id); setCand(null); }} aria-expanded={vac === v.id}>{v.job_title} — {v.school}</button><Pill tone={v.status === "open" ? "ok" : v.status === "requested" ? "wait" : "muted"}>{VS[v.status]}</Pill></div>
          <p className="text-xs text-muted-foreground"><bdi dir="ltr">{v.ref}</bdi> · {v.seats} شاغر · {v.candidates} مرشح · {v.hired} معيّن{v.subject ? ` · ${v.subject}` : ""} · {v.reason}{v.decided_by ? ` · قرار: ${v.decided_by}` : ""}{v.decision_reason ? ` — ${v.decision_reason}` : ""}</p>
          <div className="flex flex-wrap gap-2">{v.can.decide && <><Button size="sm" disabled={actV.isPending} onClick={() => void vact(v, "approve")}>اعتماد الشاغر</Button><Button size="sm" variant="outline" onClick={() => void vact(v, "reject")}>رفض</Button></>}
            {v.can.close && <Button size="sm" variant="ghost" onClick={() => void vact(v, "close")}>إغلاق</Button>}</div>
        </li>)}</ul>)}
      {vac && <Candidates vac={(vq.data ?? []).find((v) => v.id === vac)!} open={cand} onOpen={setCand} done={done} />}
    </div>
  );
}

function Candidates({ vac, open, onOpen, done }: { vac: Vac | undefined; open: string | null; onOpen: (id: string | null) => void; done: (m: string) => void }) {
  const { active } = useSession();
  const org = active!.orgId;
  const lq = useQuery({ queryKey: ["hr-rc-cands", vac?.id, org], enabled: !!vac, queryFn: () => rpc<Cand[]>("hr_rc_candidates", { _org: org, _f: { vacancy: vac!.id } }) });
  const [nc, setNc] = useState<{ full_name: string; national_id: string; email: string; phone: string; education: string; experience: string; languages: string } | null>(null);
  const save = useMutation({ mutationFn: () => rpc("hr_rc_candidate_save", { _vac: vac!.id, _p: nc }), onSuccess: () => { setNc(null); done("أُضيف المرشح"); }, onError: (e) => toast.error(arabicError(e)) });
  if (!vac) return null;
  return (
    <Section title={`مرشحو ${vac.job_title}`} desc="الهوية وبيانات التواصل تظهر وتُدخل لمن يملك صلاحية البيانات الحساسة فقط.">
      {vac.can.add && !nc && <Button className="mb-2" onClick={() => setNc({ full_name: "", national_id: "", email: "", phone: "", education: "", experience: "", languages: "" })}><Plus className="size-4" />مرشح جديد</Button>}
      {nc && <form aria-label="مرشح جديد" className="mb-2 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
        {([["full_name", "الاسم"], ["education", "التعليم"], ["experience", "الخبرة"], ["languages", "اللغات"], ["national_id", "رقم الهوية (حساس)"], ["email", "البريد (حساس)"], ["phone", "الجوال (حساس)"]] as const).map(([k, l]) =>
          <div key={k}><Label htmlFor={`c-${k}`}>{l}</Label><Input id={`c-${k}`} dir={["national_id", "email", "phone"].includes(k) ? "ltr" : undefined} value={nc[k]} onChange={(e) => setNc({ ...nc, [k]: e.target.value })} /></div>)}
        <div className="flex gap-2 sm:col-span-3"><Button type="submit" disabled={save.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setNc(null)}>إلغاء</Button></div>
      </form>}
      {lq.isLoading ? <LoadingState /> : lq.error ? <ErrorState message={arabicError(lq.error)} onRetry={() => lq.refetch()} /> : (lq.data ?? []).length === 0 ? <EmptyState title="لا يوجد مرشحون" hint={vac.status === "open" ? "أضف مرشحًا للشاغر المفتوح." : "يُضاف المرشحون بعد اعتماد الشاغر."} /> : (
        <ul className="space-y-1">{lq.data!.map((c) => <li key={c.id}>
          <button type="button" onClick={() => onOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-start text-sm">
            <span className="flex-1 font-medium">{c.full_name}</span><Pill tone={c.stage === "converted" || c.stage === "accepted" ? "ok" : c.stage === "rejected" || c.stage === "withdrawn" ? "bad" : "wait"}>{CS[c.stage]}</Pill></button>
          {open === c.id && <CandPanel id={c.id} onClose={() => onOpen(null)} done={done} />}
        </li>)}</ul>)}
    </Section>
  );
}

function CandPanel({ id, onClose, done }: { id: string; onClose: () => void; done: (m: string) => void }) {
  const q = useQuery({ queryKey: ["hr-rc-cand", id], queryFn: () => rpc<CandD>("hr_rc_candidate_get", { _id: id }) });
  const [iv, setIv] = useState<{ panel: string; result: string; notes: string; criteria: { name: string; score: string }[] } | null>(null);
  const [of, setOf] = useState<{ job_title: string; start_date: string; basic: string; allowances: string; notes: string } | null>(null);
  const call = useMutation({ mutationFn: async (a: { fn: string; args: Record<string, unknown>; msg: string }) => { await rpc(a.fn, a.args); return a.msg; }, onSuccess: (m) => { setIv(null); setOf(null); done(m); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const c = q.data!;
  const stage = async (s: string) => { const r = ["rejected", "withdrawn"].includes(s) ? await askText("السبب", { required: true }) : null; if (["rejected", "withdrawn"].includes(s) && !r) return; call.mutate({ fn: "hr_rc_candidate_stage", args: { _id: c.id, _rev: c.rev, _stage: s, _reason: r }, msg: "حُدّثت المرحلة" }); };
  const respond = async (o: Offer, action: "accept" | "decline") => { const ref = await askText("مرجع رد المرشح (توقيع أو رسالة)", { required: true }); if (!ref) return; const r = action === "decline" ? await askText("سبب الاعتذار", { required: true }) : null; if (action === "decline" && !r) return; call.mutate({ fn: "hr_rc_offer_act", args: { _offer: o.id, _action: action, _ref: ref, _reason: r }, msg: action === "accept" ? "سُجّل قبول المرشح" : "سُجّل الاعتذار" }); };
  const convert = async () => {
    if (!(await ask("تحويل المرشح إلى ملف موظف؟ يتم مرة واحدة فقط، دون إنشاء حساب دخول أو تكليف أكاديمي."))) return;
    try { await rpc("hr_rc_convert", { _cand: c.id, _rev: c.rev, _p: {} }); done("أُنشئ ملف الموظف"); }
    catch (e) {
      const m = arabicError(e);
      if (m.includes("EXISTS:") && (await ask(m.replace("EXISTS:", "") + " — ربط المرشح بالملف الموجود؟"))) call.mutate({ fn: "hr_rc_convert", args: { _cand: c.id, _rev: c.rev, _p: { link_existing: true } }, msg: "رُبط بالملف الموجود" });
      else toast.error(m.replace("EXISTS:", ""));
    }
  };
  return (
    <section aria-label={`ملف المرشح ${c.full_name}`} className="mt-1 space-y-2 rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-start gap-2"><div className="flex-1"><p className="font-bold">{c.full_name}</p><p className="text-xs text-muted-foreground">{c.vacancy} · <bdi dir="ltr">{c.vacancy_ref}</bdi> · {CS[c.stage]}{c.stage_reason ? ` — ${c.stage_reason}` : ""}</p></div><Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <dl className="grid gap-1 text-xs sm:grid-cols-2">
        <div>الهوية: <bdi dir="ltr">{c.national_id ?? "—"}</bdi></div><div>التواصل: {c.sensitive ? <bdi dir="ltr">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</bdi> : "محجوب"}</div>
        <div>التعليم: {c.education ?? "—"}</div><div>الخبرة: {c.experience ?? "—"}</div><div>اللغات: {c.languages ?? "—"}</div>
        {c.employee_id && <div className="text-success">حُوّل إلى موظف بواسطة {c.converted_by}</div>}
      </dl>
      {c.can.manage && <div className="flex flex-wrap gap-2">
        {c.stage === "applied" && <Button size="sm" variant="outline" onClick={() => void stage("screening")}>بدء الفرز</Button>}
        {c.stage === "screening" && <Button size="sm" variant="outline" onClick={() => void stage("shortlisted")}>إلى القائمة المختصرة</Button>}
        {["screening", "shortlisted", "interview"].includes(c.stage) && !iv && <Button size="sm" variant="outline" onClick={() => setIv({ panel: "", result: "pass", notes: "", criteria: [{ name: "", score: "3" }] })}>تسجيل مقابلة</Button>}
        {["interview", "offer"].includes(c.stage) && c.interviews.some((i) => i.result === "pass") && !of && <Button size="sm" onClick={() => setOf({ job_title: c.vacancy, start_date: "", basic: "", allowances: "", notes: "" })}>{c.offers.length ? "إصدار جديد للعرض" : "إعداد عرض"}</Button>}
        <Button size="sm" variant="ghost" onClick={() => void stage("rejected")}>استبعاد</Button><Button size="sm" variant="ghost" onClick={() => void stage("withdrawn")}>انسحاب</Button>
      </div>}
      {iv && <form aria-label="مقابلة" className="grid gap-2 rounded-lg border p-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); call.mutate({ fn: "hr_rc_interview_add", args: { _cand: c.id, _p: { ...iv, criteria: iv.criteria.map((x) => ({ name: x.name, score: Number(x.score) })) } }, msg: "سُجّلت المقابلة" }); }}>
        <div><Label htmlFor="i-p">اللجنة</Label><Input id="i-p" value={iv.panel} onChange={(e) => setIv({ ...iv, panel: e.target.value })} /></div>
        <div><Label htmlFor="i-r">النتيجة</Label><select id="i-r" className={selectCls("w-full")} value={iv.result} onChange={(e) => setIv({ ...iv, result: e.target.value })}>{Object.entries(RES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><Label htmlFor="i-n">ملاحظات</Label><Input id="i-n" value={iv.notes} onChange={(e) => setIv({ ...iv, notes: e.target.value })} /></div>
        {iv.criteria.map((x, i) => <div key={i} className="flex gap-2 sm:col-span-3"><Input aria-label={`المعيار ${i + 1}`} placeholder="المعيار" value={x.name} onChange={(e) => setIv({ ...iv, criteria: iv.criteria.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} />
          <select aria-label={`درجة المعيار ${i + 1}`} className={selectCls("w-20")} value={x.score} onChange={(e) => setIv({ ...iv, criteria: iv.criteria.map((y, j) => (j === i ? { ...y, score: e.target.value } : y)) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>)}
        <div className="flex gap-2 sm:col-span-3"><Button type="button" size="sm" variant="ghost" onClick={() => setIv({ ...iv, criteria: [...iv.criteria, { name: "", score: "3" }] })}>+ معيار</Button><Button type="submit" size="sm" disabled={call.isPending}>حفظ المقابلة</Button><Button type="button" size="sm" variant="ghost" onClick={() => setIv(null)}>إلغاء</Button></div>
      </form>}
      {of && <form aria-label="عرض وظيفي" className="grid gap-2 rounded-lg border p-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); call.mutate({ fn: "hr_rc_offer_save", args: { _cand: c.id, _rev: c.rev, _p: of }, msg: "حُفظ العرض بإصدار جديد بانتظار الاعتماد" }); }}>
        <div><Label htmlFor="o-j">المسمى</Label><Input id="o-j" value={of.job_title} onChange={(e) => setOf({ ...of, job_title: e.target.value })} /></div>
        <div><Label htmlFor="o-s">تاريخ المباشرة</Label><Input id="o-s" type="date" dir="ltr" value={of.start_date} onChange={(e) => setOf({ ...of, start_date: e.target.value })} /></div>
        <div><Label htmlFor="o-b">الأجر الأساسي (ر.س)</Label><Input id="o-b" inputMode="decimal" dir="ltr" value={of.basic} onChange={(e) => setOf({ ...of, basic: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="o-a">البدلات (وصف)</Label><Input id="o-a" value={of.allowances} onChange={(e) => setOf({ ...of, allowances: e.target.value })} /></div>
        <div><Label htmlFor="o-n">ملاحظات</Label><Input id="o-n" value={of.notes} onChange={(e) => setOf({ ...of, notes: e.target.value })} /></div>
        <div className="flex gap-2 sm:col-span-3"><Button type="submit" size="sm" disabled={call.isPending}>حفظ العرض</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOf(null)}>إلغاء</Button></div>
      </form>}
      {c.interviews.length > 0 && <div><p className="font-medium">المقابلات</p><ul className="text-xs">{c.interviews.map((i) => <li key={i.id}>• <bdi dir="ltr">{i.held_on}</bdi> — {i.panel} — {RES[i.result]}{i.criteria.length ? ` — ${i.criteria.map((x) => `${x.name}: ${x.score}/5`).join("، ")}` : ""}{i.notes ? ` — ${i.notes}` : ""}</li>)}</ul></div>}
      {c.offers.length > 0 && <div className="space-y-1"><p className="font-medium">العروض</p>{c.offers.map((o) => <div key={o.id} className="rounded-lg border p-2 text-xs">
        <div className="flex flex-wrap items-center gap-2"><span className="flex-1 font-bold">الإصدار {o.version} — {o.terms.job_title} — {sar(o.terms.basic)}</span><Pill tone={o.status === "accepted" ? "ok" : o.status === "approved" || o.status === "draft" ? "wait" : "muted"}>{OS[o.status]}</Pill></div>
        <p className="text-muted-foreground">المباشرة <bdi dir="ltr">{o.terms.start_date}</bdi>{o.terms.allowances ? ` · ${o.terms.allowances}` : ""} · أعدّه {o.created_by}{o.approved_by ? ` · اعتمده ${o.approved_by}` : ""}{o.response_ref ? ` · مرجع الرد ${o.response_ref}` : ""}</p>
        <div className="mt-1 flex gap-2">{o.can_approve && <Button size="sm" disabled={call.isPending} onClick={() => call.mutate({ fn: "hr_rc_offer_act", args: { _offer: o.id, _action: "approve", _ref: null, _reason: null }, msg: "اعتُمد العرض" })}>اعتماد العرض</Button>}
          {o.status === "approved" && c.can.manage && <><Button size="sm" variant="outline" onClick={() => void respond(o, "accept")}>تسجيل القبول</Button><Button size="sm" variant="ghost" onClick={() => void respond(o, "decline")}>تسجيل الاعتذار</Button></>}</div>
      </div>)}</div>}
      {c.can.convert && <Button onClick={() => void convert()}>تحويل إلى موظف</Button>}
    </section>
  );
}
