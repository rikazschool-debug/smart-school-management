import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { Pill } from "@/components/hr/money";
import { Extensions, today, useExt, usePeople, type Ext } from "@/components/hr/extensions";

export const Route = createFileRoute("/_authenticated/app/hr_/housing")({
  head: () => ({ meta: [{ title: "السكن — الموارد البشرية — ركاز" }, { name: "description", content: "العقارات والوحدات والسعة والإشغال، وتسكين الموظفين ونقلهم وإخلاؤهم بتواريخ سريان وسجل محفوظ." }, { property: "og:title", content: "السكن — ركاز" }, { property: "og:description", content: "سجل السكن والإشغال في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

type Occ = { stay_id: string; employee_id: string; employee: string; employee_no: string; start_date: string };
type Unit = { id: string; label: string; capacity: number; active: boolean; occupants: Occ[] };
type Prop = { id: string; name: string; kind: string; address: string | null; notes: string | null; active: boolean; school_id: string; school: string; can_manage: boolean; units: Unit[] };
type Hist = { id: string; employee: string; employee_no: string; property: string; unit: string; school: string; start_date: string; end_date: string | null; end_kind: string | null; end_reason: string | null; by: string; closed_by: string | null };
export const KIND: Record<string, string> = { building: "مبنى", apartment: "شقة", compound: "مجمع سكني", house: "فيلا/منزل" };
const END: Record<string, string> = { vacated: "إخلاء", moved: "نقل" };

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const q = useExt(org);
  if (!active) return null;
  const d = q.data;
  const on = d?.items.find((i) => i.ext === "housing")?.enabled;
  return (
    <>
      <Link to="/app/hr" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />الموارد البشرية</Link>
      <PageHeader title="السكن" desc="عقارات ووحدات بسعة محددة. التسكين والنقل والإخلاء بتاريخ سريان، والسجل المغلق لا يُعدّل. لا تتجاوز وحدة سعتها، ولا يُسكَّن موظف في وحدتين." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !d!.hr ? <SectionLocked /> : (
        <div className="space-y-4">
          {d!.owner && <Extensions org={org!} d={d!} />}
          {!on ? <EmptyState title="امتداد السكن غير مفعّل" hint={d!.owner ? "فعّله أعلاه بقرار موثق." : "يفعّله مالك المؤسسة."} /> : !d!.housing.view ? <ForbiddenState /> : <Workspace org={org!} d={d!} />}
        </div>)}
    </>
  );
}

function Workspace({ org, d }: { org: string; d: Ext }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"units" | "history">("units");
  const lq = useQuery({ queryKey: ["hr-hs", org], queryFn: () => rpc<Prop[]>("hr_hs_list", { _org: org }) });
  const [np, setNp] = useState<{ name: string; school_id: string; kind: string; address: string } | null>(null);
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ["hr-hs"] }); qc.invalidateQueries({ queryKey: ["hr-hs-hist"] }); };
  const saveP = useMutation({ mutationFn: () => rpc("hr_hs_property_save", { _org: org, _id: null, _p: np }), onSuccess: () => { setNp(null); done("أُضيف العقار"); }, onError: (e) => toast.error(arabicError(e)) });
  const props = lq.data ?? [];
  const cap = props.reduce((a, p) => a + p.units.filter((u) => u.active).reduce((b, u) => b + u.capacity, 0), 0);
  const occ = props.reduce((a, p) => a + p.units.reduce((b, u) => b + u.occupants.length, 0), 0);
  return (
    <div className="space-y-4">
      <nav className="flex gap-2 text-sm" aria-label="أقسام السكن">
        {([["units", "العقارات والإشغال"], ["history", "حركة التسكين"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={"rounded-lg px-3 py-1.5 " + (tab === k ? "bg-primary text-primary-foreground" : "border bg-card hover:border-primary")}>{l}</button>)}
      </nav>
      {tab === "history" ? <History org={org} canExport={d.housing.export} /> : <>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
          <span className="flex-1">{props.length} عقار · السعة {cap} · المشغول {occ} · المتاح {Math.max(cap - occ, 0)}</span>
          {d.housing.manage && d.housing_schools.length > 0 && !np && <Button onClick={() => setNp({ name: "", school_id: d.housing_schools[0]!.id, kind: "building", address: "" })}><Plus className="size-4" />عقار جديد</Button>}
          {d.housing.export && props.length > 0 && <Button variant="ghost" onClick={() => exportXlsx({ title: "الوحدات والإشغال", filters: [], note: `${props.length} عقار` }, ["العقار", "النوع", "الفرع", "الوحدة", "السعة", "المشغول", "الساكنون"],
            props.flatMap((p) => p.units.map((u) => [p.name, KIND[p.kind] ?? p.kind, p.school, u.label, u.capacity, u.occupants.length, u.occupants.map((o) => o.employee).join("، ")])))}><Download className="size-4" />Excel</Button>}
        </div>
        {np && <form aria-label="عقار جديد" className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (!saveP.isPending) saveP.mutate(); }}>
          <div><Label htmlFor="p-n">اسم العقار</Label><Input id="p-n" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} /></div>
          <div><Label htmlFor="p-s">الفرع المسؤول</Label><select id="p-s" className={selectCls("w-full")} value={np.school_id} onChange={(e) => setNp({ ...np, school_id: e.target.value })}>{d.housing_schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><Label htmlFor="p-k">النوع</Label><select id="p-k" className={selectCls("w-full")} value={np.kind} onChange={(e) => setNp({ ...np, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><Label htmlFor="p-a">العنوان</Label><Input id="p-a" value={np.address} onChange={(e) => setNp({ ...np, address: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-4"><Button type="submit" disabled={saveP.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setNp(null)}>إلغاء</Button></div>
        </form>}
        {lq.isLoading ? <LoadingState /> : lq.error ? <ErrorState message={arabicError(lq.error)} onRetry={() => lq.refetch()} /> : props.length === 0 ? <EmptyState title="لا توجد عقارات" hint="أضف عقارًا ثم وحداته وسعتها." /> :
          props.map((p) => <PropertyCard key={p.id} p={p} props={props} done={done} />)}
      </>}
    </div>
  );
}

function PropertyCard({ p, props, done }: { p: Prop; props: Prop[]; done: (m: string) => void }) {
  const [nu, setNu] = useState<{ label: string; capacity: string } | null>(null);
  const [assign, setAssign] = useState<{ unit: string; emp: string; start: string } | null>(null);
  const people = usePeople(assign ? p.school_id : "", "housing");
  const saveU = useMutation({ mutationFn: () => rpc("hr_hs_unit_save", { _property: p.id, _id: null, _p: nu }), onSuccess: () => { setNu(null); done("أُضيفت الوحدة"); }, onError: (e) => toast.error(arabicError(e)) });
  const doAssign = useMutation({ mutationFn: () => rpc("hr_hs_assign", { _unit: assign!.unit, _emp: assign!.emp, _start: assign!.start }), onSuccess: () => { setAssign(null); done("سُجّل التسكين"); }, onError: (e) => toast.error(arabicError(e)) });
  const [pend, setPend] = useState<{ kind: "move" | "vacate"; o: Occ; unit: string; date: string; reason: string } | null>(null);
  const act = useMutation({
    mutationFn: () => pend!.kind === "move" ? rpc("hr_hs_move", { _stay: pend!.o.stay_id, _unit: pend!.unit, _date: pend!.date, _reason: pend!.reason }) : rpc("hr_hs_vacate", { _stay: pend!.o.stay_id, _date: pend!.date, _reason: pend!.reason }),
    onSuccess: () => { done(pend!.kind === "move" ? "نُقل الموظف" : "سُجّل الإخلاء"); setPend(null); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const targets = props.filter((x) => x.can_manage && x.active).flatMap((x) => x.units.filter((u) => u.active && u.occupants.length < u.capacity).map((u) => ({ id: u.id, label: `${x.name} — ${u.label} (${u.occupants.length}/${u.capacity})` })));
  return (
    <Section title={p.name} desc={`${KIND[p.kind] ?? p.kind} · ${p.school}${p.address ? ` · ${p.address}` : ""}${p.active ? "" : " · غير نشط"}`}
      action={p.can_manage && !nu ? <Button size="sm" variant="outline" onClick={() => setNu({ label: "", capacity: "1" })}><Plus className="size-4" />وحدة</Button> : undefined}>
      {nu && <form aria-label="وحدة جديدة" className="mb-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!saveU.isPending) saveU.mutate(); }}>
        <div><Label htmlFor={`u-l-${p.id}`}>اسم الوحدة</Label><Input id={`u-l-${p.id}`} value={nu.label} onChange={(e) => setNu({ ...nu, label: e.target.value })} /></div>
        <div className="w-28"><Label htmlFor={`u-c-${p.id}`}>السعة</Label><Input id={`u-c-${p.id}`} dir="ltr" inputMode="numeric" value={nu.capacity} onChange={(e) => setNu({ ...nu, capacity: e.target.value })} /></div>
        <Button type="submit" disabled={saveU.isPending}>حفظ</Button><Button type="button" variant="ghost" onClick={() => setNu(null)}>إلغاء</Button>
      </form>}
      {p.units.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد وحدات بعد.</p> : (
        <ul className="grid gap-2 md:grid-cols-2">{p.units.map((u) => {
          const full = u.occupants.length >= u.capacity;
          return <li key={u.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm" aria-label={`وحدة ${u.label}`}>
            <div className="flex flex-wrap items-center gap-2"><span className="flex-1 font-bold">وحدة {u.label}</span><Pill tone={full ? "wait" : "ok"}>{u.occupants.length} / {u.capacity}</Pill></div>
            {u.occupants.map((o) => <div key={o.stay_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-2">
              <span className="flex-1">{o.employee} <span className="text-xs text-muted-foreground">· منذ {o.start_date}</span></span>
              {p.can_manage && <>
                <select aria-label={`نقل ${o.employee}`} className={selectCls("w-44")} value="" onChange={(e) => e.target.value && setPend({ kind: "move", o, unit: e.target.value, date: today(), reason: "" })}>
                  <option value="">نقل إلى…</option>{targets.filter((t) => t.id !== u.id).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <Button size="sm" variant="ghost" onClick={() => setPend({ kind: "vacate", o, unit: "", date: today(), reason: "" })}>إخلاء</Button>
              </>}
              {pend?.o.stay_id === o.stay_id && <form aria-label={pend.kind === "move" ? "تأكيد النقل" : "تأكيد الإخلاء"} className="flex w-full flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!act.isPending) act.mutate(); }}>
                <span className="w-full text-xs font-semibold">{pend.kind === "move" ? `نقل إلى ${targets.find((t) => t.id === pend.unit)?.label ?? ""}` : "إخلاء الوحدة"}</span>
                <Input aria-label="تاريخ السريان" type="date" className="w-40" value={pend.date} onChange={(e) => setPend({ ...pend, date: e.target.value })} />
                <Input aria-label="السبب" placeholder="السبب" className="min-w-40 flex-1" value={pend.reason} onChange={(e) => setPend({ ...pend, reason: e.target.value })} />
                <Button size="sm" type="submit" disabled={act.isPending}>تأكيد</Button><Button size="sm" type="button" variant="ghost" onClick={() => setPend(null)}>إلغاء</Button>
              </form>}
            </div>)}
            {p.can_manage && u.active && !full && (assign?.unit === u.id ? (
              <form aria-label="تسكين موظف" className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (assign.emp && !doAssign.isPending) doAssign.mutate(); }}>
                <select aria-label="الموظف" className={selectCls("min-w-44 flex-1")} value={assign.emp} onChange={(e) => setAssign({ ...assign, emp: e.target.value })}>
                  <option value="">اختر الموظف…</option>{(people.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} — {x.employee_no}</option>)}
                </select>
                <Input aria-label="تاريخ السريان" type="date" className="w-40" value={assign.start} onChange={(e) => setAssign({ ...assign, start: e.target.value })} />
                <Button size="sm" type="submit" disabled={!assign.emp || doAssign.isPending}>تسكين</Button><Button size="sm" type="button" variant="ghost" onClick={() => setAssign(null)}>إلغاء</Button>
              </form>) : <Button size="sm" variant="outline" onClick={() => setAssign({ unit: u.id, emp: "", start: today() })}>تسكين موظف</Button>)}
          </li>;
        })}</ul>)}
    </Section>
  );
}

function History({ org, canExport }: { org: string; canExport: boolean }) {
  const [f, setF] = useState({ state: "", from: "", to: "" });
  const q = useQuery({ queryKey: ["hr-hs-hist", org, f], queryFn: () => rpc<Hist[]>("hr_hs_history", { _org: org, _f: f }) });
  const rows = q.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <select aria-label="الحالة" className={selectCls("w-40")} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">الكل</option><option value="open">ساري</option><option value="closed">منتهٍ</option></select>
        <div><Label htmlFor="h-f">من</Label><Input id="h-f" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><Label htmlFor="h-t">إلى</Label><Input id="h-t" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        {canExport && <Button variant="ghost" disabled={!rows.length} onClick={() => exportXlsx({ title: "حركة التسكين", filters: [f.state ? (f.state === "open" ? "ساري" : "منتهٍ") : "الكل", f.from && `من ${f.from}`, f.to && `إلى ${f.to}`].filter(Boolean) as string[], note: `${rows.length} سجل` },
          ["الموظف", "الرقم", "العقار", "الوحدة", "الفرع", "من", "إلى", "الإنهاء", "السبب"], rows.map((r) => [r.employee, r.employee_no, r.property, r.unit, r.school, r.start_date, r.end_date ?? "ساري", r.end_kind ? END[r.end_kind]! : "", r.end_reason ?? ""]))}><Download className="size-4" />Excel</Button>}
      </div>
      {q.isLoading ? <LoadingState rows={2} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد حركة" /> : (
        <ul className="space-y-1.5">{rows.map((r) => <li key={r.id} className="rounded-lg border bg-card p-2 text-sm">
          <span className="font-semibold">{r.employee}</span> <span className="text-xs text-muted-foreground">· {r.property} / {r.unit} · {r.start_date} ← {r.end_date ?? "ساري"}{r.end_kind ? ` · ${END[r.end_kind]}: ${r.end_reason}` : ""}</span>
        </li>)}</ul>)}
    </div>
  );
}
