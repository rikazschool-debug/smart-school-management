import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { HrPageTop } from "@/components/hr/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
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
import { AS_CAT, AS_OUT, AS_STATUS, type Custody } from "@/components/hr/assets";

type Caps = { hr: boolean; schools: { id: string; name: string; manage: boolean; export: boolean }[] };
type Asset = { id: string; school_id: string; school: string; name: string; category: string; serial: string | null; notes: string | null; status: string; can_manage: boolean; open: Custody | null; history: Custody[] };
type Person = { id: string; name: string; no: string };

export const Route = createFileRoute("/_authenticated/app/hr_/assets")({
  head: () => ({ meta: [{ title: "العهد العينية — الموارد البشرية — ركاز" }, { name: "description", content: "سجل الأجهزة والمفاتيح المسلّمة للموظفين: تسليم وإقرار ونقل وإرجاع وتوثيق الفقد والتلف." }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["hr-asset-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("hr_asset_caps", { _org: org }) });
  if (!active) return null;
  return (
    <>
      <HrPageTop title="العهد العينية" desc="أجهزة ومفاتيح وغيرها، منفصلة عن العهد النقدية في المشتريات. للأصل عهدة نشطة واحدة فقط، وأي أثر مالي للفقد أو التلف يمر بقرار مستقل." />
      {caps.isLoading ? <LoadingState /> : caps.error ? <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} /> : !caps.data!.hr ? <SectionLocked /> : caps.data!.schools.length === 0 ? <ForbiddenState /> : <Workspace org={org!} caps={caps.data!} />}
    </>
  );
}

function Workspace({ org, caps }: { org: string; caps: Caps }) {
  const qc = useQueryClient();
  const [school, setSchool] = useState("");
  const [status, setStatus] = useState("");
  const [qs, setQs] = useState("");
  const list = useQuery({ queryKey: ["hr-assets", org, school, status, qs], queryFn: () => rpc<Asset[]>("hr_asset_list", { _org: org, _school: school || null, _q: qs.trim() || null, _status: status || null }) });
  const inv = () => qc.invalidateQueries({ queryKey: ["hr-assets"] });
  const err = (e: unknown) => toast.error(arabicError(e));
  const mg = caps.schools.filter((s) => s.manage);
  const [nf, setNf] = useState<{ school: string; name: string; category: string; serial: string; notes: string } | null>(null);
  const save = useMutation({ mutationFn: () => rpc("hr_asset_save", { _org: org, _id: null, _school: nf!.school, _name: nf!.name, _category: nf!.category, _serial: nf!.serial, _notes: nf!.notes }), onSuccess: () => { toast.success("أُضيف الصنف"); setNf(null); inv(); }, onError: err });
  const canExport = caps.schools.some((s) => s.export);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <select aria-label="الفرع" className={selectCls("w-44")} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">كل الفروع</option>{caps.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select aria-label="الحالة" className={selectCls("w-36")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(AS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم التسلسلي" className="w-full sm:w-60" value={qs} onChange={(e) => setQs(e.target.value)} />
        <span className="flex-1" />
        {canExport && <Button size="sm" variant="outline" onClick={() => exportXlsx({ title: "العهد العينية", filters: [school ? caps.schools.find((s) => s.id === school)?.name ?? "" : "كل الفروع", status ? AS_STATUS[status]! : "كل الحالات"], note: `${(list.data ?? []).length} صنف` }, ["الصنف", "النوع", "الرقم التسلسلي", "الفرع", "الحالة", "الموظف", "تاريخ التسليم", "الإقرار"], (list.data ?? []).map((a) => [a.name, AS_CAT[a.category] ?? "", a.serial ?? "", a.school, AS_STATUS[a.status] ?? "", a.open?.employee ?? "", a.open?.handed_at.slice(0, 10) ?? "", a.open ? (a.open.ack_at ? "أقرّ" : "بانتظار") : ""]))}>تصدير Excel</Button>}
        {mg.length > 0 && <Button size="sm" onClick={() => setNf({ school: mg[0]!.id, name: "", category: "device", serial: "", notes: "" })}><Plus className="size-4" />صنف جديد</Button>}
      </div>
      {nf && (
        <Section title="صنف جديد">
          <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
            <div><Label htmlFor="a-s">الفرع</Label><select id="a-s" className={selectCls("mt-1 w-full")} value={nf.school} onChange={(e) => setNf({ ...nf, school: e.target.value })}>{mg.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><Label htmlFor="a-n">اسم الصنف</Label><Input id="a-n" className="mt-1" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></div>
            <div><Label htmlFor="a-c">النوع</Label><select id="a-c" className={selectCls("mt-1 w-full")} value={nf.category} onChange={(e) => setNf({ ...nf, category: e.target.value })}>{Object.entries(AS_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><Label htmlFor="a-sr">الرقم التسلسلي (إن وجد)</Label><Input id="a-sr" dir="ltr" className="mt-1" value={nf.serial} onChange={(e) => setNf({ ...nf, serial: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label htmlFor="a-no">ملاحظات</Label><Input id="a-no" className="mt-1" value={nf.notes} onChange={(e) => setNf({ ...nf, notes: e.target.value })} /></div>
            <div className="flex gap-2"><Button size="sm" type="submit" disabled={save.isPending}>حفظ الصنف</Button><Button size="sm" type="button" variant="ghost" onClick={() => setNf(null)}>إلغاء</Button></div>
          </form>
        </Section>)}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : (list.data ?? []).length === 0 ? <EmptyState title="لا توجد أصناف" /> : (
        <ul className="grid gap-3 lg:grid-cols-2">{list.data!.map((a) => <li key={a.id}><AssetCard a={a} onDone={inv} /></li>)}</ul>)}
    </div>
  );
}

function AssetCard({ a, onDone }: { a: Asset; onDone: () => void }) {
  const err = (e: unknown) => toast.error(arabicError(e));
  const [mode, setMode] = useState<null | "hand" | "returned" | "transferred" | "lost" | "damaged">(null);
  const [emp, setEmp] = useState("");
  const [cond, setCond] = useState("");
  const [note, setNote] = useState("");
  const people = useQuery({ queryKey: ["hr-asset-people", a.school_id], enabled: a.can_manage && (mode === "hand" || mode === "transferred"), queryFn: () => rpc<Person[]>("hr_asset_people", { _school: a.school_id }) });
  const reset = () => { setMode(null); setEmp(""); setCond(""); setNote(""); };
  const hand = useMutation({ mutationFn: () => rpc("hr_asset_hand", { _asset: a.id, _emp: emp, _condition: cond }), onSuccess: () => { toast.success("سُلّم الصنف؛ بانتظار إقرار الموظف"); reset(); onDone(); }, onError: err });
  const close = useMutation({ mutationFn: () => rpc("hr_asset_close", { _custody: a.open!.id, _outcome: mode, _condition: cond, _note: note, _to_emp: mode === "transferred" ? emp : null }), onSuccess: () => { toast.success("سُجّل الإجراء"); reset(); onDone(); }, onError: err });
  const st = useMutation({ mutationFn: (v: { s: string; r: string }) => rpc("hr_asset_set_status", { _asset: a.id, _status: v.s, _reason: v.r }), onSuccess: () => { toast.success("حُدّثت الحالة"); onDone(); }, onError: err });
  const o = a.open;
  return (
    <div className="rounded-xl border bg-card p-3 text-sm" role="region" aria-label={`الصنف ${a.name}`}>
      <div className="flex flex-wrap items-center gap-2"><span className="flex-1 font-semibold">{a.name}</span><span className="rounded bg-muted px-1.5 text-xs">{AS_CAT[a.category]}</span><span className="rounded bg-secondary px-1.5 text-xs">{AS_STATUS[a.status]}</span></div>
      <p className="text-xs text-muted-foreground">{a.school}{a.serial ? <> · رقم <bdi dir="ltr">{a.serial}</bdi></> : ""}{a.notes ? ` · ${a.notes}` : ""}</p>
      {o && <p className="mt-1 text-xs">في عهدة <b>{o.employee}</b> منذ {o.handed_at.slice(0, 10)} · {o.ack_at ? "أقرّ بالاستلام" : "بانتظار إقراره"} · الحالة عند التسليم: {o.condition_out}</p>}
      {a.can_manage && !mode && (
        <div className="mt-2 flex flex-wrap gap-2">
          {a.status === "available" && <Button size="sm" onClick={() => setMode("hand")}>تسليم لموظف</Button>}
          {o && <><Button size="sm" variant="outline" onClick={() => setMode("returned")}>استلام (إرجاع)</Button><Button size="sm" variant="outline" onClick={() => setMode("transferred")}>نقل لموظف آخر</Button><Button size="sm" variant="ghost" onClick={() => setMode("lost")}>توثيق فقد</Button><Button size="sm" variant="ghost" onClick={() => setMode("damaged")}>توثيق تلف</Button></>}
          {(a.status === "lost" || a.status === "damaged" || a.status === "retired") && <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب إعادة الصنف متاحًا"); if (r) st.mutate({ s: "available", r }); }}>إعادة متاح</Button>}
          {a.status !== "assigned" && a.status !== "retired" && <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب استبعاد الصنف"); if (r) st.mutate({ s: "retired", r }); }}>استبعاد</Button>}
        </div>)}
      {mode && (
        <form className="mt-2 grid gap-2 rounded-lg bg-secondary/40 p-2" onSubmit={(e) => { e.preventDefault(); if (mode === "hand") hand.mutate(); else close.mutate(); }}>
          <p className="text-xs font-semibold">{mode === "hand" ? "تسليم" : AS_OUT[mode]}</p>
          {(mode === "hand" || mode === "transferred") && <select aria-label="الموظف المستلم" className={selectCls("w-full")} value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">اختر الموظف…</option>{(people.data ?? []).filter((p) => p.id !== o?.employee_id).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.no})</option>)}</select>}
          {mode !== "lost" && <Input aria-label="حالة الصنف" placeholder={mode === "hand" ? "حالة الصنف عند التسليم" : "حالة الصنف عند الاستلام"} value={cond} onChange={(e) => setCond(e.target.value)} />}
          {mode !== "hand" && <Input aria-label="ملاحظة" placeholder={mode === "lost" || mode === "damaged" ? "وصف الفقد أو التلف (مطلوب)" : "ملاحظة"} value={note} onChange={(e) => setNote(e.target.value)} />}
          {(mode === "lost" || mode === "damaged") && <p className="text-xs text-muted-foreground">لا يُخصم أي مبلغ تلقائيًا؛ أي تحميل مالي يمر بقرار مستقل في الرواتب.</p>}
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={hand.isPending || close.isPending}>تأكيد</Button><Button size="sm" type="button" variant="ghost" onClick={reset}>إلغاء</Button></div>
        </form>)}
      {a.history.length > (o ? 1 : 0) && (
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">سجل العهدة ({a.history.length})</summary>
          <ul className="mt-1 space-y-1">{a.history.map((h) => <li key={h.id}>{h.employee} · {h.handed_at.slice(0, 10)} → {h.closed_at ? `${h.closed_at.slice(0, 10)} ${AS_OUT[h.outcome ?? ""]}${h.condition_in ? ` (${h.condition_in})` : ""}${h.close_note ? ` — ${h.close_note}` : ""}` : "مفتوحة"}</li>)}</ul></details>)}
    </div>
  );
}
