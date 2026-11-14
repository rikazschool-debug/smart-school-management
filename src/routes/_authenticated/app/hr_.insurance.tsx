import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { HrPageTop } from "@/components/hr/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { exportXlsx } from "@/lib/export";
import { rpc } from "@/components/hr/shared";
import { Pill, sar } from "@/components/hr/money";
import { Extensions, today, useExt, usePeople, type Ext } from "@/components/hr/extensions";

export const Route = createFileRoute("/_authenticated/app/hr_/insurance")({
  head: () => ({ meta: [{ title: "التأمين الطبي — الموارد البشرية — ركاز" }, { name: "description", content: "شركات التأمين والوثائق والفئات والتغطيات للموظفين والتابعين، بتواريخ السريان والانتهاء والتجديد." }, { property: "og:title", content: "التأمين الطبي — ركاز" }, { property: "og:description", content: "متابعة تغطيات التأمين الطبي في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

type Cls = { id: string; name: string; coverage: string | null; annual_limit: number | null };
type Pol = { id: string; policy_no: string; company_id: string; company: string; start_date: string; end_date: string; alert_days: number; renewal_of: string | null; renewed: boolean; state: string; classes: Cls[]; members: number };
type Ov = { can_org: boolean; integration: string; companies: { id: string; name: string; contact: string | null; active: boolean }[]; policies: Pol[] };
export type Member = { id: string; kind: string; employee_id: string; employee: string; employee_no?: string; school?: string; policy_id: string; policy_no: string; company: string; class: string; coverage: string | null; annual_limit: number | null; dep_name: string | null; dep_relation: string | null; dep_national_id: string | null; dep_birth: string | null; member_no: string | null; start_date: string; end_date: string; end_reason: string | null; status: string; sensitive: boolean };
export const IN_ST: Record<string, string> = { active: "سارية", expiring: "تقترب من الانتهاء", pending: "لم تبدأ", expired: "انتهت الوثيقة", ended: "منتهية" };
export const REL: Record<string, string> = { spouse: "زوج/زوجة", son: "ابن", daughter: "ابنة", father: "أب", mother: "أم", other: "أخرى" };
const tone = (s: string) => (s === "active" ? "ok" : s === "expiring" || s === "pending" ? "wait" : "muted") as "ok" | "wait" | "muted";

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const q = useExt(org);
  if (!active) return null;
  const d = q.data;
  const on = d?.items.find((i) => i.ext === "insurance")?.enabled;
  return (
    <>
      <HrPageTop title="التأمين الطبي" desc="متابعة التغطية فقط: منفصلة عن احتساب التأمينات الاجتماعية في الرواتب، ولا يُنشأ منها أي مبلغ. هوية التابعين وأرقام العضوية لا تظهر إلا بصلاحية مستقلة." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !d!.hr ? <SectionLocked /> : (
        <div className="space-y-4">
          {d!.owner && <Extensions org={org!} d={d!} />}
          {!on ? <EmptyState title="امتداد التأمين غير مفعّل" hint={d!.owner ? "فعّله أعلاه بقرار موثق." : "يفعّله مالك المؤسسة."} /> : !d!.insurance.view ? <ForbiddenState /> : <Workspace org={org!} d={d!} />}
        </div>)}
    </>
  );
}

function Workspace({ org, d }: { org: string; d: Ext }) {
  const qc = useQueryClient();
  const ov = useQuery({ queryKey: ["hr-in-ov", org], queryFn: () => rpc<Ov>("hr_in_overview", { _org: org }) });
  const [pol, setPol] = useState<string>("");
  const [nc, setNc] = useState<{ name: string; contact: string } | null>(null);
  const [np, setNp] = useState<{ company_id: string; policy_no: string; start_date: string; end_date: string; alert_days: string; classes: { name: string; coverage: string; annual_limit: string }[] } | null>(null);
  const [rn, setRn] = useState<{ policy: string; policy_no: string; start_date: string; end_date: string; carry: boolean } | null>(null);
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-in-ov"] }); qc.invalidateQueries({ queryKey: ["hr-in-mem"] }); };
  const saveC = useMutation({ mutationFn: () => rpc("hr_in_company_save", { _org: org, _id: null, _p: nc }), onSuccess: () => { setNc(null); done("أُضيفت الشركة"); }, onError: (e) => toast.error(arabicError(e)) });
  const saveP = useMutation({ mutationFn: () => rpc<string>("hr_in_policy_save", { _org: org, _id: null, _p: np }), onSuccess: (id) => { setNp(null); setPol(id); done("أُضيفت الوثيقة"); }, onError: (e) => toast.error(arabicError(e)) });
  const renew = useMutation({ mutationFn: () => rpc<string>("hr_in_policy_renew", { _policy: rn!.policy, _p: { policy_no: rn!.policy_no, start_date: rn!.start_date, end_date: rn!.end_date }, _carry: rn!.carry }), onSuccess: (id) => { setRn(null); setPol(id); done("جُدّدت الوثيقة"); }, onError: (e) => toast.error(arabicError(e)) });
  if (ov.isLoading) return <LoadingState />;
  if (ov.error) return <ErrorState message={arabicError(ov.error)} onRetry={() => ov.refetch()} />;
  const o = ov.data!;
  const cur = o.policies.find((p) => p.id === pol);
  return (
    <div className="space-y-4">
      <p className="rounded-lg border bg-secondary/40 p-2 text-xs">الربط مع شركات التأمين: <b>غير متصل</b>. تُدخل البيانات يدويًا، ولا يُرسل شيء لجهة خارجية.</p>
      <Section title="الوثائق" desc="التنبيه قبل الانتهاء حسب أيام كل وثيقة، ويصل للمالك مرة واحدة لكل وثيقة."
        action={o.can_org ? <div className="flex gap-2">{!nc && <Button size="sm" variant="outline" onClick={() => setNc({ name: "", contact: "" })}><Plus className="size-4" />شركة</Button>}{!np && o.companies.length > 0 && <Button size="sm" onClick={() => setNp({ company_id: o.companies[0]!.id, policy_no: "", start_date: today(), end_date: "", alert_days: "30", classes: [{ name: "", coverage: "", annual_limit: "" }] })}><Plus className="size-4" />وثيقة</Button>}</div> : undefined}>
        {nc && <form aria-label="شركة جديدة" className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!saveC.isPending) saveC.mutate(); }}>
          <div><Label htmlFor="c-n">اسم الشركة</Label><Input id="c-n" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></div>
          <div><Label htmlFor="c-c">التواصل</Label><Input id="c-c" dir="ltr" value={nc.contact} onChange={(e) => setNc({ ...nc, contact: e.target.value })} /></div>
          <Button type="submit" disabled={saveC.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setNc(null)}>إلغاء</Button>
        </form>}
        {np && <form aria-label="وثيقة جديدة" className="mb-3 space-y-2 rounded-xl border bg-card p-3" onSubmit={(e) => { e.preventDefault(); if (!saveP.isPending) saveP.mutate(); }}>
          <div className="grid gap-2 sm:grid-cols-5">
            <div><Label htmlFor="p-c">الشركة</Label><select id="p-c" className={selectCls("w-full")} value={np.company_id} onChange={(e) => setNp({ ...np, company_id: e.target.value })}>{o.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><Label htmlFor="p-n">رقم الوثيقة</Label><Input id="p-n" dir="ltr" value={np.policy_no} onChange={(e) => setNp({ ...np, policy_no: e.target.value })} /></div>
            <div><Label htmlFor="p-s">السريان</Label><Input id="p-s" type="date" value={np.start_date} onChange={(e) => setNp({ ...np, start_date: e.target.value })} /></div>
            <div><Label htmlFor="p-e">الانتهاء</Label><Input id="p-e" type="date" value={np.end_date} onChange={(e) => setNp({ ...np, end_date: e.target.value })} /></div>
            <div><Label htmlFor="p-a">التنبيه قبل (يوم)</Label><Input id="p-a" dir="ltr" inputMode="numeric" value={np.alert_days} onChange={(e) => setNp({ ...np, alert_days: e.target.value })} /></div>
          </div>
          <p className="text-xs font-semibold">الفئات</p>
          {np.classes.map((c, i) => <div key={i} className="grid gap-2 sm:grid-cols-3">
            <Input aria-label={`اسم الفئة ${i + 1}`} placeholder="اسم الفئة" value={c.name} onChange={(e) => setNp({ ...np, classes: np.classes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <Input aria-label={`التغطية ${i + 1}`} placeholder="وصف التغطية" value={c.coverage} onChange={(e) => setNp({ ...np, classes: np.classes.map((x, j) => (j === i ? { ...x, coverage: e.target.value } : x)) })} />
            <Input aria-label={`الحد السنوي ${i + 1}`} placeholder="الحد السنوي" dir="ltr" inputMode="decimal" value={c.annual_limit} onChange={(e) => setNp({ ...np, classes: np.classes.map((x, j) => (j === i ? { ...x, annual_limit: e.target.value } : x)) })} />
          </div>)}
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setNp({ ...np, classes: [...np.classes, { name: "", coverage: "", annual_limit: "" }] })}><Plus className="size-4" />فئة</Button>
            <Button type="submit" disabled={saveP.isPending}>حفظ الوثيقة</Button><Button type="button" variant="ghost" onClick={() => setNp(null)}>إلغاء</Button></div>
        </form>}
        {o.policies.length === 0 ? <EmptyState title="لا توجد وثائق" hint={o.can_org ? "أضف شركة ثم وثيقة بفئاتها." : "تضيفها إدارة التأمين على مستوى المؤسسة."} /> : (
          <ul className="grid gap-2 md:grid-cols-2">{o.policies.map((p) => <li key={p.id} className={"space-y-1 rounded-xl border bg-card p-3 text-sm " + (pol === p.id ? "border-primary" : "")}>
            <div className="flex flex-wrap items-center gap-2"><button type="button" className="flex-1 text-start font-bold" aria-expanded={pol === p.id} onClick={() => setPol(pol === p.id ? "" : p.id)}>{p.company} — <bdi dir="ltr">{p.policy_no}</bdi></button><Pill tone={tone(p.state)}>{IN_ST[p.state] ?? p.state}</Pill></div>
            <p className="text-xs text-muted-foreground">{p.start_date} ← {p.end_date} · {p.members} مشمول · {p.classes.map((c) => c.name).join("، ")}{p.renewal_of ? ` · تجديد لـ ${p.renewal_of}` : ""}{p.renewed ? " · جُدّدت" : ""}</p>
            {o.can_org && !p.renewed && p.state !== "pending" && rn?.policy !== p.id && <Button size="sm" variant="outline" onClick={() => setRn({ policy: p.id, policy_no: "", start_date: p.end_date, end_date: "", carry: true })}>تجديد</Button>}
            {rn?.policy === p.id && <form aria-label="تجديد الوثيقة" className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!renew.isPending) renew.mutate(); }}>
              <Input aria-label="رقم الوثيقة الجديدة" placeholder="رقم الوثيقة الجديدة" dir="ltr" value={rn.policy_no} onChange={(e) => setRn({ ...rn, policy_no: e.target.value })} />
              <Input aria-label="سريان التجديد" type="date" value={rn.start_date} onChange={(e) => setRn({ ...rn, start_date: e.target.value })} />
              <Input aria-label="انتهاء التجديد" type="date" value={rn.end_date} onChange={(e) => setRn({ ...rn, end_date: e.target.value })} />
              <label className="flex items-center gap-2 text-xs sm:col-span-3"><input type="checkbox" checked={rn.carry} onChange={(e) => setRn({ ...rn, carry: e.target.checked })} />نقل المشمولين الحاليين وتابعيهم إلى الوثيقة الجديدة</label>
              <div className="flex gap-2 sm:col-span-3"><Button size="sm" type="submit" disabled={renew.isPending}>تجديد</Button><Button size="sm" type="button" variant="ghost" onClick={() => setRn(null)}>إلغاء</Button></div>
            </form>}
          </li>)}</ul>)}
      </Section>
      <Members org={org} d={d} policy={cur ?? null} policies={o.policies} />
    </div>
  );
}

function Members({ org, d, policy, policies }: { org: string; d: Ext; policy: Pol | null; policies: Pol[] }) {
  const qc = useQueryClient();
  const [st, setSt] = useState("");
  const q = useQuery({ queryKey: ["hr-in-mem", org, policy?.id ?? "", st], queryFn: () => rpc<Member[]>("hr_in_members", { _org: org, _f: { policy: policy?.id ?? "", status: st } }) });
  const [school, setSchool] = useState(d.insurance_schools[0]?.id ?? "");
  const people = usePeople(policy ? school : "", "insurance");
  const [add, setAdd] = useState<{ kind: "employee" | "dependent"; emp: string; class: string; start_date: string; member_no: string; dep_name: string; dep_relation: string; dep_national_id: string } | null>(null);
  const [end, setEnd] = useState<{ id: string; date: string; reason: string } | null>(null);
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-in-mem"] }); qc.invalidateQueries({ queryKey: ["hr-in-ov"] }); };
  const save = useMutation({ mutationFn: () => rpc("hr_in_member_add", { _class: add!.class, _emp: add!.emp, _p: { kind: add!.kind, start_date: add!.start_date, member_no: add!.member_no, dep_name: add!.dep_name, dep_relation: add!.dep_relation, dep_national_id: add!.dep_national_id } }), onSuccess: () => { setAdd(null); done("أُضيفت التغطية"); }, onError: (e) => toast.error(arabicError(e)) });
  const close = useMutation({ mutationFn: () => rpc<number>("hr_in_member_end", { _id: end!.id, _date: end!.date, _reason: end!.reason }), onSuccess: (n) => { setEnd(null); done(n > 1 ? `أُنهيت التغطية و${n - 1} تابع` : "أُنهيت التغطية"); }, onError: (e) => toast.error(arabicError(e)) });
  const rows = q.data ?? [];
  const covered = rows.filter((r) => r.kind === "employee" && !["ended"].includes(r.status));
  const exp = () => exportXlsx({ title: "التأمين الطبي — التغطيات", filters: [policy ? `الوثيقة ${policy.policy_no}` : "كل الوثائق", st ? IN_ST[st]! : "كل الحالات"], note: `${rows.length} سجل — الحقول الحساسة كما يسمح بها الخادم` },
    ["الموظف", "النوع", "التابع", "الصلة", "هوية التابع", "رقم العضوية", "الوثيقة", "الفئة", "من", "إلى", "الحالة"],
    rows.map((r) => [r.employee, r.kind === "employee" ? "موظف" : "تابع", r.dep_name ?? "", r.dep_relation ? REL[r.dep_relation]! : "", r.dep_national_id ?? "", r.member_no ?? "", r.policy_no, r.class, r.start_date, r.end_date, IN_ST[r.status] ?? r.status]));
  return (
    <Section title={policy ? `المشمولون في ${policy.policy_no}` : "كل التغطيات"} desc="ترى التغطيات ضمن فروعك المصرح بها فقط."
      action={<div className="flex flex-wrap gap-2">
        <select aria-label="حالة التغطية" className={selectCls("w-40")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(IN_ST).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {d.insurance.export && <Button size="sm" variant="ghost" disabled={!rows.length} onClick={exp}><Download className="size-4" />Excel</Button>}
        {policy && d.insurance.manage && !add && policy.classes.length > 0 && <Button size="sm" onClick={() => setAdd({ kind: "employee", emp: "", class: policy.classes[0]!.id, start_date: policy.start_date > today() ? policy.start_date : today(), member_no: "", dep_name: "", dep_relation: "spouse", dep_national_id: "" })}><Plus className="size-4" />إسناد تغطية</Button>}
      </div>}>
      {!policy && policies.length > 0 && <p className="mb-2 text-xs text-muted-foreground">اختر وثيقة من الأعلى لإسناد تغطيات جديدة.</p>}
      {add && policy && <form aria-label="إسناد تغطية" className="mb-3 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
        <div><Label htmlFor="m-k">النوع</Label><select id="m-k" className={selectCls("w-full")} value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as "employee" | "dependent", emp: "" })}><option value="employee">موظف</option><option value="dependent">تابع لموظف مشمول</option></select></div>
        {add.kind === "employee" ? <>
          <div><Label htmlFor="m-s">الفرع</Label><select id="m-s" className={selectCls("w-full")} value={school} onChange={(e) => setSchool(e.target.value)}>{d.insurance_schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><Label htmlFor="m-e">الموظف</Label><select id="m-e" className={selectCls("w-full")} value={add.emp} onChange={(e) => setAdd({ ...add, emp: e.target.value })}><option value="">اختر…</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} — {p.employee_no}</option>)}</select></div>
        </> : <>
          <div><Label htmlFor="m-e2">الموظف المشمول</Label><select id="m-e2" className={selectCls("w-full")} value={add.emp} onChange={(e) => setAdd({ ...add, emp: e.target.value })}><option value="">اختر…</option>{covered.map((m) => <option key={m.id} value={m.employee_id}>{m.employee}</option>)}</select></div>
          <div><Label htmlFor="m-dn">اسم التابع</Label><Input id="m-dn" value={add.dep_name} onChange={(e) => setAdd({ ...add, dep_name: e.target.value })} /></div>
          <div><Label htmlFor="m-dr">الصلة</Label><select id="m-dr" className={selectCls("w-full")} value={add.dep_relation} onChange={(e) => setAdd({ ...add, dep_relation: e.target.value })}>{Object.entries(REL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {d.insurance.sensitive && <div><Label htmlFor="m-di">هوية التابع (حساس)</Label><Input id="m-di" dir="ltr" inputMode="numeric" value={add.dep_national_id} onChange={(e) => setAdd({ ...add, dep_national_id: e.target.value })} /></div>}
        </>}
        <div><Label htmlFor="m-c">الفئة</Label><select id="m-c" className={selectCls("w-full")} value={add.class} onChange={(e) => setAdd({ ...add, class: e.target.value })}>{policy.classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.annual_limit ? ` — ${sar(c.annual_limit)}` : ""}</option>)}</select></div>
        <div><Label htmlFor="m-d">السريان</Label><Input id="m-d" type="date" value={add.start_date} onChange={(e) => setAdd({ ...add, start_date: e.target.value })} /></div>
        {d.insurance.sensitive && <div><Label htmlFor="m-n">رقم العضوية (حساس)</Label><Input id="m-n" dir="ltr" value={add.member_no} onChange={(e) => setAdd({ ...add, member_no: e.target.value })} /></div>}
        <div className="flex gap-2 sm:col-span-4"><Button type="submit" disabled={!add.emp || save.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setAdd(null)}>إلغاء</Button></div>
      </form>}
      {q.isLoading ? <LoadingState rows={2} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد تغطيات" /> : (
        <ul className="space-y-1.5">{rows.map((r) => <li key={r.id} className="rounded-lg border bg-card p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1"><b>{r.kind === "employee" ? r.employee : `${r.dep_name} (${REL[r.dep_relation ?? ""] ?? ""} — ${r.employee})`}</b> <span className="text-xs text-muted-foreground">· {r.class} · {r.start_date} ← {r.end_date}{r.member_no ? <> · عضوية <bdi dir="ltr">{r.member_no}</bdi></> : null}{r.dep_national_id ? <> · هوية <bdi dir="ltr">{r.dep_national_id}</bdi></> : null}{r.end_reason ? ` · ${r.end_reason}` : ""}</span></span>
            <Pill tone={tone(r.status)}>{IN_ST[r.status] ?? r.status}</Pill>
            {d.insurance.manage && r.status !== "ended" && !r.end_reason && end?.id !== r.id && <Button size="sm" variant="ghost" onClick={() => setEnd({ id: r.id, date: today(), reason: "" })}>إنهاء</Button>}
          </div>
          {end?.id === r.id && <form aria-label="إنهاء التغطية" className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!close.isPending) close.mutate(); }}>
            <Input aria-label="تاريخ الإنهاء" type="date" className="w-40" value={end.date} onChange={(e) => setEnd({ ...end, date: e.target.value })} />
            <Input aria-label="سبب الإنهاء" placeholder="السبب" className="min-w-40 flex-1" value={end.reason} onChange={(e) => setEnd({ ...end, reason: e.target.value })} />
            <Button size="sm" type="submit" disabled={close.isPending}>تأكيد</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEnd(null)}>إلغاء</Button>
            {r.kind === "employee" && <span className="w-full text-xs text-muted-foreground">ينهي تغطية التابعين في الوثيقة نفسها أيضًا.</span>}
          </form>}
        </li>)}</ul>)}
    </Section>
  );
}
