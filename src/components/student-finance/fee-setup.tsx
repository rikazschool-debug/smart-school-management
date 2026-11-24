import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Pencil, Plus, ShieldCheck, Ban } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { DISCOUNT_STATUS, KIND_LABEL, PRICE_STATUS, SF_KEY, TRANSPORT_TYPES, money, num } from "@/lib/student-finance/labels";

type Setup = { prices: Row[]; discounts: Row[]; years: Row[]; grades: Row[]; schools: Row[] };

/** Central price and discount setup (owner only; the server rejects anyone else). */
export function FeeSetup({ schoolId }: { schoolId: string }) {
  const q = useQuery({ queryKey: [...SF_KEY, "setup", schoolId], queryFn: async () => { const { data, error } = await db.rpc("sf_setup", { _school: schoolId }); if (error) throw error; return data as Setup; } });
  const years = q.data?.years ?? [];
  const current = years.find((y) => y["is_current"]) ?? years[0];
  const [yearId, setYearId] = useState<string>("");
  const year = yearId || (current?.["id"] as string) || "";
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="space-y-1"><Label htmlFor="sf-year">العام الدراسي</Label>
          <select id="sf-year" className={selectCls("min-w-48")} value={year} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}
          </select></div>
        {year && <CopyYear schoolId={schoolId} years={years} to={year} />}
        <p className="text-xs text-muted-foreground">تعديل الأسعار لا يغيّر مستحقات الطلاب المنشأة سابقًا؛ تحتفظ كل مستحقة بسعرها وقت إنشائها.</p>
      </div>
      {!years.length ? <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">أضف عامًا دراسيًا للفرع أولًا من «السنوات والفصول».</p> : (
        <Tabs defaultValue="tuition" dir="rtl">
          <TabsList><TabsTrigger value="tuition">تهيئة الرسوم الدراسية</TabsTrigger><TabsTrigger value="transport">تهيئة رسوم النقل المدرسي</TabsTrigger><TabsTrigger value="discounts">تهيئة الخصومات</TabsTrigger></TabsList>
          <TabsContent value="tuition"><TuitionPrices schoolId={schoolId} year={year} d={d} /></TabsContent>
          <TabsContent value="transport"><TransportPrices schoolId={schoolId} year={year} d={d} /></TabsContent>
          <TabsContent value="discounts"><Discounts schoolId={schoolId} d={d} yearName={String(years.find((y) => y["id"] === year)?.["name"] ?? "")} /></TabsContent>
        </Tabs>)}
    </div>
  );
}

function useSave(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, p }: { kind: "price" | "discount"; p: Row }) => { const { data, error } = await db.rpc("sf_setup_save", { _school: schoolId, _kind: kind, _p: p }); if (error) throw error; return data; },
    onSuccess: () => { toast.success("تم الحفظ"); void qc.invalidateQueries({ queryKey: SF_KEY }); },
    onError: (e) => toast.error(arabicError(e)),
  });
}

function CopyYear({ schoolId, years, to }: { schoolId: string; years: Row[]; to: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const others = years.filter((y) => y["id"] !== to);
  if (!others.length) return null;
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1"><Label htmlFor="sf-from">نسخ الأسعار من عام</Label>
        <select id="sf-from" className={selectCls("min-w-40")} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">اختر</option>{others.map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select></div>
      <Button variant="outline" disabled={!from} onClick={async () => {
        if (!(await ask("تُنسخ الأسعار كمسودات للعام المختار، دون استبدال الأسعار الموجودة. متابعة؟"))) return;
        const { data, error } = await db.rpc("sf_copy_prices", { _school: schoolId, _from: from, _to: to });
        if (error) toast.error(arabicError(error)); else { toast.success(`نُسخ ${data} سعرًا كمسودة`); void qc.invalidateQueries({ queryKey: SF_KEY }); }
      }}><Copy className="size-4" /> نسخ</Button>
    </div>
  );
}

function PriceDialog({ title, initial, onSave, onClose, pending }: { title: string; initial: { term1: string; term2: string; notes: string }; onSave: (v: { term1: number; term2: number; notes: string }) => void; onClose: () => void; pending: boolean }) {
  const [v, setV] = useState(initial);
  const t1 = Number(v.term1), t2 = Number(v.term2);
  const ok = v.term1 !== "" && v.term2 !== "" && t1 >= 0 && t2 >= 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="p1">رسوم الفصل الأول</Label><Input id="p1" type="number" min={0} step="0.01" value={v.term1} onChange={(e) => setV({ ...v, term1: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="p2">رسوم الفصل الثاني</Label><Input id="p2" type="number" min={0} step="0.01" value={v.term2} onChange={(e) => setV({ ...v, term2: e.target.value })} /></div>
        </div>
        <p className="text-sm">الإجمالي السنوي: <b>{ok ? money(t1 + t2) : "—"}</b>{ok && t1 + t2 === 0 && <span className="ms-2 text-xs text-muted-foreground">(رسوم صفرية معتمدة، تختلف عن غير المهيأة)</span>}</p>
        <div className="space-y-1"><Label htmlFor="pn">ملاحظات</Label><Input id="pn" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
        <Button disabled={!ok || pending} onClick={() => onSave({ term1: t1, term2: t2, notes: v.notes })}>حفظ كمسودة</Button>
      </DialogContent>
    </Dialog>
  );
}

function PriceActions({ p, save }: { p: Row; save: ReturnType<typeof useSave> }) {
  const set = (status: string) => save.mutate({ kind: "price", p: { id: p["id"], term1: p["term1"], term2: p["term2"], notes: p["notes"], status } });
  return <div className="flex gap-1">
    {p["status"] !== "approved" && <Button size="sm" variant="outline" onClick={() => set("approved")}><ShieldCheck className="size-4" /> اعتماد</Button>}
    <DueButton p={p} />
    {p["status"] === "approved" && <RepriceButton p={p} />}
    {p["status"] !== "inactive" && <Button size="sm" variant="ghost" onClick={async () => { if (await ask("تعطيل السعر يمنع إنشاء مستحقات جديدة به، ولا يغيّر المستحقات السابقة.", { destructive: true })) set("inactive"); }}><Ban className="size-4" /> تعطيل</Button>}
  </div>;
}

/** Due dates per term. New obligations copy them; existing unpaid ones change only via sf_due_apply with a reason. */
function DueButton({ p }: { p: Row }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [d1, setD1] = useState(String(p["due1"] ?? "")); const [d2, setD2] = useState(String(p["due2"] ?? "")); const [reason, setReason] = useState("");
  const save = async () => { const { error } = await db.rpc("sf_price_due_save", { _price: p["id"], _due1: d1 || null, _due2: d2 || null }); if (error) toast.error(arabicError(error)); else { toast.success("حُفظت تواريخ الاستحقاق للمستحقات الجديدة"); void qc.invalidateQueries({ queryKey: SF_KEY }); } };
  const apply = async () => { if (!(await ask("تطبيق التواريخ على المستحقات غير المسددة الحالية لهذا السعر؟"))) return; const { data, error } = await db.rpc("sf_due_apply", { _price: p["id"], _reason: reason }); if (error) toast.error(arabicError(error)); else { toast.success(`حُدّث ${String(data)} مستحق`); setOpen(false); void qc.invalidateQueries({ queryKey: SF_KEY }); } };
  return <>
    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>الاستحقاق{p["due1"] || p["due2"] ? "" : " (غير محدد)"}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تواريخ الاستحقاق</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label htmlFor="d1">الفصل الأول</Label><Input id="d1" type="date" value={d1} onChange={(e) => setD1(e.target.value)} /></div><div className="space-y-1"><Label htmlFor="d2">الفصل الثاني</Label><Input id="d2" type="date" value={d2} onChange={(e) => setD2(e.target.value)} /></div></div>
      <Button onClick={() => void save()}>حفظ (للمستحقات الجديدة)</Button>
      <p className="text-xs text-muted-foreground">المستحقات الموجودة تحتفظ بتاريخها. لتغييرها اكتب السبب ثم طبّق (بعد الحفظ).</p>
      <Label>السبب</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button variant="outline" disabled={reason.trim().length < 3} onClick={() => void apply()}>تطبيق على المستحقات غير المسددة</Button>
    </DialogContent></Dialog>
  </>;
}

/** Applying an approved price to existing obligations. Default policy = new students only (do nothing here). */
function RepriceButton({ p }: { p: Row }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<"unpaid" | "selected">("unpaid");
  const [picked, setPicked] = useState<string[]>([]); const [reason, setReason] = useState("");
  const pool = useQuery({ enabled: open && mode === "selected", queryKey: [...SF_KEY, "reprice-pool", p["id"]], queryFn: async () => { const { data, error } = await db.from("students").select("id,full_name").eq("school_id", p["school_id"]).eq("status", "active").order("full_name").limit(1000); if (error) throw error; return data as Row[]; } });
  const pv = useQuery({ enabled: open, queryKey: [...SF_KEY, "reprice", p["id"], mode, picked.join(",")], queryFn: async () => { const { data, error } = await db.rpc("sf_reprice_preview", { _price: p["id"], _mode: mode, _students: mode === "selected" ? picked : null }); if (error) throw error; return data as Row; } });
  const rows = (pv.data?.["rows"] ?? []) as Row[];
  const apply = async () => {
    if (!(await ask(`تطبيق السعر الجديد على ${pv.data?.["affected"]} طالب؟ الفرق الإجمالي ${money(pv.data?.["difference"])}. المدفوعات والسندات السابقة لا تتغير.`))) return;
    const { data, error } = await db.rpc("sf_reprice_apply", { _price: p["id"], _mode: mode, _students: mode === "selected" ? picked : null, _reason: reason });
    if (error) toast.error(arabicError(error)); else { toast.success(`عُدّل ${(data as Row)["updated"]} مستحق`); setOpen(false); void qc.invalidateQueries({ queryKey: SF_KEY }); }
  };
  return <>
    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>تطبيق على الحاليين</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>تطبيق السعر الجديد على المستحقات الحالية</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">الافتراضي: السعر الجديد للطلاب الجدد فقط، ويحتفظ الطلاب الحاليون بأسعارهم. اختر أحد الخيارين أدناه فقط إذا أردت تعديل مستحقات قائمة.</p>
      <div className="flex gap-2"><Button size="sm" variant={mode === "unpaid" ? "default" : "outline"} onClick={() => setMode("unpaid")}>الطلاب الذين لم يسددوا</Button><Button size="sm" variant={mode === "selected" ? "default" : "outline"} onClick={() => setMode("selected")}>طلاب محددون</Button></div>
      {mode === "selected" && <div className="max-h-40 overflow-y-auto rounded-xl border p-2 text-sm">{(pool.data ?? []).map((st) => <label key={st["id"]} className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(st["id"])} onChange={(e) => setPicked(e.target.checked ? [...picked, st["id"]] : picked.filter((x) => x !== st["id"]))} />{st["full_name"]}</label>)}</div>}
      {pv.error ? <p className="text-sm text-muted-foreground">{arabicError(pv.error)}</p> : <>
        <div className="grid grid-cols-3 gap-2 text-sm">{[["الطلاب المتأثرون", String(pv.data?.["affected"] ?? 0)], ["إجمالي الفروقات", money(pv.data?.["difference"])], ["أرصدة دائنة ناتجة", money(pv.data?.["credit"])]].map(([l, v]) => <div key={l} className="rounded-xl border p-2"><div className="text-xs text-muted-foreground">{l}</div><b>{v}</b></div>)}</div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{["الطالب", "الفصل", "القديم", "الجديد", "الخصومات", "المسدد", "المتبقي قبل", "المتبقي بعد", "الحالة"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r["obligation_id"]} className="border-t"><td className="p-2">{r["name"]}</td><td className="p-2">{r["term"] === 1 ? "الأول" : "الثاني"}</td><td className="p-2">{money(r["old_amount"])}</td><td className="p-2">{money(r["new_amount"])}</td><td className="p-2">{money(r["discount"])}</td><td className="p-2">{money(r["recorded"])}</td><td className="p-2">{money(r["remaining_before"])}</td><td className="p-2">{money(r["remaining_after"])}</td><td className="p-2">{r["eligible"] ? "سيُعدّل" : r["reason"]}</td></tr>)}</tbody></table>
          {!rows.length && <p className="p-4 text-center text-xs text-muted-foreground">لا توجد مستحقات مرتبطة بهذا السعر{mode === "selected" ? " للطلاب المحددين" : ""}.</p>}</div>
      </>}
      <Label>سبب التعديل (إلزامي)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button disabled={!Number(pv.data?.["affected"] ?? 0) || reason.trim().length < 3} onClick={() => void apply()}>اعتماد التعديل</Button>
    </DialogContent></Dialog>
  </>;
}

function TuitionPrices({ schoolId, year, d }: { schoolId: string; year: string; d: Setup }) {
  const save = useSave(schoolId);
  const [edit, setEdit] = useState<{ grades: Row[]; price?: Row } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [stage, setStage] = useState("");
  const prices = d.prices.filter((p) => p["kind"] === "tuition" && p["year_id"] === year);
  const stages = [...new Map(d.grades.map((g) => [g["stage_id"], g["stage"]])).entries()];
  const grades = d.grades.filter((g) => !stage || g["stage_id"] === stage);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="المرحلة" className={selectCls("min-w-40")} value={stage} onChange={(e) => setStage(e.target.value)}><option value="">كل المراحل</option>{stages.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <Button size="sm" disabled={!picked.length} onClick={() => setEdit({ grades: d.grades.filter((g) => picked.includes(g["id"])) })}><Plus className="size-4" /> تهيئة الصفوف المحددة ({picked.length})</Button>
        <Button size="sm" variant="outline" onClick={() => setPicked(grades.filter((g) => !prices.some((p) => p["grade_id"] === g["id"])).map((g) => g["id"]))}>تحديد غير المهيأة</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["", "المرحلة", "الصف", "الفصل الأول", "الفصل الثاني", "الإجمالي السنوي", "الحالة", "الإجراءات"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{grades.map((g) => { const p = prices.find((x) => x["grade_id"] === g["id"]); return (
            <tr key={g["id"]} className="border-t">
              <td className="p-2"><input type="checkbox" aria-label={`تحديد ${g["name"]}`} checked={picked.includes(g["id"])} onChange={(e) => setPicked(e.target.checked ? [...picked, g["id"]] : picked.filter((x) => x !== g["id"]))} /></td>
              <td className="p-2">{g["stage"]}</td><td className="p-2 font-medium">{g["name"]}</td>
              <td className="p-2">{p ? money(p["term1"]) : "—"}</td><td className="p-2">{p ? money(p["term2"]) : "—"}</td><td className="p-2 font-semibold">{p ? money(num(p["term1"]) + num(p["term2"])) : "—"}</td>
              <td className="p-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{p ? PRICE_STATUS[p["status"]] : "غير مهيأة"}</span></td>
              <td className="p-2"><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label="تعديل" onClick={() => setEdit({ grades: [g], ...(p ? { price: p } : {}) })}><Pencil className="size-4" /></Button>{p && <PriceActions p={p} save={save} />}</div></td>
            </tr>); })}</tbody></table>
        {!grades.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد صفوف في الهيكل الأكاديمي لهذا الفرع.</p>}
      </div>
      {edit && <PriceDialog title={edit.grades.length > 1 ? `رسوم ${edit.grades.length} صفوف` : `رسوم ${edit.grades[0]?.["name"]}`} pending={save.isPending} onClose={() => setEdit(null)}
        initial={{ term1: String(edit.price?.["term1"] ?? ""), term2: String(edit.price?.["term2"] ?? ""), notes: String(edit.price?.["notes"] ?? "") }}
        onSave={async (v) => {
          for (const g of edit.grades) {
            const p = prices.find((x) => x["grade_id"] === g["id"]);
            await save.mutateAsync({ kind: "price", p: p ? { id: p["id"], ...v, status: "draft" } : { year_id: year, kind: "tuition", grade_id: g["id"], ...v, status: "draft" } }).catch(() => undefined);
          }
          setEdit(null); setPicked([]);
        }} />}
    </div>
  );
}

function TransportPrices({ schoolId, year, d }: { schoolId: string; year: string; d: Setup }) {
  const save = useSave(schoolId);
  const [edit, setEdit] = useState<{ type: string; label: string; price?: Row } | null>(null);
  const prices = d.prices.filter((p) => p["kind"] === "transport" && p["year_id"] === year);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["نوع الاشتراك", "الفصل الأول", "الفصل الثاني", "الإجمالي السنوي", "الحالة", "الإجراءات"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{TRANSPORT_TYPES.map((t) => { const p = prices.find((x) => x["transport_type"] === t.value); return (
            <tr key={t.value} className="border-t"><td className="p-2 font-medium">{t.label}</td>
              <td className="p-2">{p ? money(p["term1"]) : "—"}</td><td className="p-2">{p ? money(p["term2"]) : "—"}</td><td className="p-2 font-semibold">{p ? money(num(p["term1"]) + num(p["term2"])) : "—"}</td>
              <td className="p-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{p ? PRICE_STATUS[p["status"]] : "غير مهيأة"}</span></td>
              <td className="p-2"><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label="تعديل" onClick={() => setEdit({ type: t.value, label: t.label, ...(p ? { price: p } : {}) })}><Pencil className="size-4" /></Button>{p && <PriceActions p={p} save={save} />}</div></td></tr>); })}</tbody></table>
      </div>
      <p className="text-xs text-muted-foreground">هذه الصفحة المصدر الوحيد لأسعار النقل؛ عند غياب سعر معتمد يرفض النظام الاشتراك بدل احتسابه صفرًا.</p>
      {edit && <PriceDialog title={`رسوم النقل — ${edit.label}`} pending={save.isPending} onClose={() => setEdit(null)}
        initial={{ term1: String(edit.price?.["term1"] ?? ""), term2: String(edit.price?.["term2"] ?? ""), notes: String(edit.price?.["notes"] ?? "") }}
        onSave={(v) => save.mutate({ kind: "price", p: edit.price ? { id: edit.price["id"], ...v, status: "draft" } : { year_id: year, kind: "transport", transport_type: edit.type, ...v, status: "draft" } }, { onSuccess: () => setEdit(null) })} />}
    </div>
  );
}

const EMPTY_DISCOUNT: Row = { name: "", description: "", value_type: "percent", value: "", starts: "", ends: "", kind: "tuition", terms: [1, 2], school_ids: [], stage_ids: [], grade_ids: [], automatic: false, stackable: false, priority: 0, cap: "", fixed_scope: "per_item", sibling: false, sibling_min: 2, sibling_mode: "second", sibling_tiers: [], active: true, notes: "" };

function Discounts({ schoolId, d, yearName }: { schoolId: string; d: Setup; yearName: string }) {
  const save = useSave(schoolId);
  const [edit, setEdit] = useState<Row | null>(null);
  const list = d.discounts.filter((x) => !yearName || x["year_key"] === yearName);
  const submit = (v: Row) => {
    const p: Row = { ...v, year_key: v["year_key"] || yearName, value: Number(v["value"]), cap: v["cap"] === "" ? "" : Number(v["cap"]), sibling_min: v["sibling"] ? Number(v["sibling_min"]) : "", sibling_mode: v["sibling"] ? v["sibling_mode"] : "all", sibling_tiers: v["sibling"] && v["sibling_mode"] === "tiers" ? v["sibling_tiers"] : [] };
    delete p["sibling"]; delete p["date_status"]; delete p["org_id"]; delete p["created_at"]; delete p["updated_at"]; delete p["created_by"];
    save.mutate({ kind: "discount", p }, { onSuccess: () => setEdit(null) });
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><Button size="sm" onClick={() => setEdit({ ...EMPTY_DISCOUNT })}><Plus className="size-4" /> خصم جديد</Button>
        <Button size="sm" variant="outline" onClick={() => setEdit({ ...EMPTY_DISCOUNT, name: "خصم الإخوة", automatic: true, sibling: true })}>خصم الإخوة التلقائي</Button></div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["اسم الخصم", "النوع", "القيمة", "المجال", "النطاق", "الفصل", "البداية", "النهاية", "الحالة", "الإجراءات"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x["id"]} className="border-t">
              <td className="p-2 font-medium">{x["name"]}{x["sibling_min"] && <span className="ms-1 rounded bg-primary/10 px-1 text-xs text-primary">إخوة</span>}{x["automatic"] && <span className="ms-1 rounded bg-muted px-1 text-xs">تلقائي</span>}</td>
              <td className="p-2">{x["value_type"] === "percent" ? "نسبة" : "مبلغ ثابت"}</td>
              <td className="p-2">{x["value_type"] === "percent" ? `${x["value"]}%` : money(x["value"])}</td>
              <td className="p-2">{KIND_LABEL[x["kind"]]}</td>
              <td className="p-2 text-xs">{scopeLabel(x, d)}</td>
              <td className="p-2 text-xs">{(x["terms"] as number[]).length === 2 ? "الفصلان" : (x["terms"] as number[])[0] === 1 ? "الأول" : "الثاني"}</td>
              <td className="p-2 text-xs">{x["starts"]}</td><td className="p-2 text-xs">{x["ends"]}</td>
              <td className="p-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{DISCOUNT_STATUS[x["date_status"]]}</span></td>
              <td className="p-2"><div className="flex gap-1">
                <Button size="sm" variant="ghost" aria-label="تعديل" onClick={() => setEdit({ ...x, sibling: !!x["sibling_min"], sibling_min: x["sibling_min"] ?? 2, cap: x["cap"] ?? "" })}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" aria-label="نسخ" onClick={() => setEdit({ ...x, id: undefined, name: `${x["name"]} (نسخة)`, sibling: !!x["sibling_min"], sibling_min: x["sibling_min"] ?? 2, cap: x["cap"] ?? "" })}><Copy className="size-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => submit({ ...x, active: !x["active"], sibling: !!x["sibling_min"], cap: x["cap"] ?? "" })}>{x["active"] ? "تعطيل" : "تفعيل"}</Button>
              </div></td>
            </tr>))}</tbody></table>
        {!list.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد خصومات لهذا العام.</p>}
      </div>
      <p className="text-xs text-muted-foreground">الخصومات المستخدمة لا تُحذف بل تُعطّل، وتعديل قيمة الخصم لا يغيّر الخصومات المطبقة سابقًا على الطلاب.</p>
      {edit && <DiscountDialog d={d} initial={edit} pending={save.isPending} onClose={() => setEdit(null)} onSave={submit} />}
    </div>
  );
}

function scopeLabel(x: Row, d: Setup) {
  const names = (ids: string[], src: Row[]) => ids.map((i) => src.find((s) => s["id"] === i)?.["name"]).filter(Boolean).join("، ");
  if ((x["grade_ids"] as string[]).length) return `صفوف: ${names(x["grade_ids"], d.grades)}`;
  if ((x["stage_ids"] as string[]).length) return `مراحل: ${[...new Set((x["stage_ids"] as string[]).map((s) => d.grades.find((g) => g["stage_id"] === s)?.["stage"]))].join("، ")}`;
  if ((x["school_ids"] as string[]).length) return names(x["school_ids"], d.schools);
  return "جميع مدارس المجموعة";
}

function Multi({ label, options, value, onChange }: { label: string; options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return <fieldset className="space-y-1"><legend className="text-sm font-medium">{label} <span className="text-xs text-muted-foreground">(بلا تحديد = الكل)</span></legend>
    <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-lg border p-2">{options.map((o) => <label key={o.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={value.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} />{o.name}</label>)}</div></fieldset>;
}

function DiscountDialog({ d, initial, onSave, onClose, pending }: { d: Setup; initial: Row; onSave: (v: Row) => void; onClose: () => void; pending: boolean }) {
  const [v, setV] = useState<Row>(initial);
  const set = (k: string, val: unknown) => setV((o) => ({ ...o, [k]: val }));
  const stages = useMemo(() => [...new Map(d.grades.map((g) => [g["stage_id"], { id: g["stage_id"] as string, name: g["stage"] as string }])).values()], [d.grades]);
  const val = Number(v["value"]);
  const ok = String(v["name"]).trim() && v["value"] !== "" && val >= 0 && !(v["value_type"] === "percent" && val > 100) && v["starts"] && v["ends"] && v["starts"] <= v["ends"] && (v["terms"] as number[]).length;
  const terms = v["terms"] as number[];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{v["id"] ? "تعديل خصم" : "خصم جديد"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="dn">اسم الخصم</Label><Input id="dn" value={v["name"]} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="dd">الوصف</Label><Input id="dd" value={v["description"] ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="dt">نوع الخصم</Label><select id="dt" className={selectCls("w-full")} value={v["value_type"]} onChange={(e) => set("value_type", e.target.value)}><option value="percent">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></div>
          <div className="space-y-1"><Label htmlFor="dv">القيمة {v["value_type"] === "percent" ? "(%)" : "(ر.س)"}</Label><Input id="dv" type="number" min={0} max={v["value_type"] === "percent" ? 100 : undefined} value={v["value"]} onChange={(e) => set("value", e.target.value)} /></div>
          {v["value_type"] === "fixed" && <div className="space-y-1 sm:col-span-2"><Label htmlFor="fs">احتساب المبلغ الثابت</Label><select id="fs" className={selectCls("w-full")} value={v["fixed_scope"]} onChange={(e) => set("fixed_scope", e.target.value)}><option value="per_item">مبلغ ثابت لكل بند</option><option value="per_term">مبلغ ثابت لكل فصل</option><option value="total">مبلغ إجمالي موزع على البنود المؤهلة</option></select></div>}
          <div className="space-y-1"><Label htmlFor="ds">تاريخ البداية</Label><Input id="ds" type="date" value={v["starts"]} onChange={(e) => set("starts", e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="de">تاريخ النهاية (شامل)</Label><Input id="de" type="date" value={v["ends"]} onChange={(e) => set("ends", e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="dk">مجال التطبيق</Label><select id="dk" className={selectCls("w-full")} value={v["kind"]} onChange={(e) => set("kind", e.target.value)}><option value="tuition">الرسوم الدراسية فقط</option><option value="transport">رسوم النقل المدرسي فقط</option><option value="both">الرسوم الدراسية والنقل</option></select></div>
          <div className="space-y-1"><Label htmlFor="dterm">الفصل الدراسي</Label><select id="dterm" className={selectCls("w-full")} value={terms.length === 2 ? "b" : String(terms[0])} onChange={(e) => set("terms", e.target.value === "b" ? [1, 2] : [Number(e.target.value)])}><option value="1">الفصل الأول</option><option value="2">الفصل الثاني</option><option value="b">الفصلان</option></select></div>
          <div className="sm:col-span-2"><Multi label="المدارس" options={d.schools.map((s) => ({ id: s["id"], name: s["name"] }))} value={v["school_ids"]} onChange={(x) => set("school_ids", x)} /></div>
          <Multi label="المراحل (هذا الفرع)" options={stages} value={v["stage_ids"]} onChange={(x) => set("stage_ids", x)} />
          <Multi label="الصفوف (هذا الفرع)" options={d.grades.map((g) => ({ id: g["id"], name: g["name"] }))} value={v["grade_ids"]} onChange={(x) => set("grade_ids", x)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v["automatic"]} onChange={(e) => set("automatic", e.target.checked)} /> تطبيق تلقائي وفق الشروط</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v["stackable"]} onChange={(e) => set("stackable", e.target.checked)} /> السماح بالجمع مع خصومات أخرى</label>
          <div className="space-y-1"><Label htmlFor="dp">الأولوية</Label><Input id="dp" type="number" value={v["priority"]} onChange={(e) => set("priority", Number(e.target.value))} /></div>
          <div className="space-y-1"><Label htmlFor="dc">الحد الأقصى للخصم (اختياري)</Label><Input id="dc" type="number" min={0} value={v["cap"]} onChange={(e) => set("cap", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" checked={!!v["sibling"]} onChange={(e) => set("sibling", e.target.checked)} /> خصم إخوة (عبر كل مدارس المجموعة، بالعلاقات الأسرية الموثقة)</label>
          {v["sibling"] && <>
            <div className="space-y-1"><Label htmlFor="sm">الحد الأدنى لعدد الإخوة</Label><Input id="sm" type="number" min={2} value={v["sibling_min"]} onChange={(e) => set("sibling_min", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="smode">المستفيدون</Label><select id="smode" className={selectCls("w-full")} value={v["sibling_mode"]} onChange={(e) => set("sibling_mode", e.target.value)}><option value="all">جميع الإخوة</option><option value="second">الطالب الثاني وما بعده</option><option value="tiers">شرائح حسب ترتيب الإخوة (الأكبر سنًا أولًا)</option></select></div>
            {v["sibling_mode"] === "tiers" && <div className="space-y-2 sm:col-span-2">
              {(v["sibling_tiers"] as Row[]).map((t, i) => <div key={i} className="flex items-center gap-2 text-sm">من الطالب رقم <Input className="w-20" type="number" min={1} value={t["rank"]} onChange={(e) => set("sibling_tiers", (v["sibling_tiers"] as Row[]).map((x, j) => j === i ? { ...x, rank: Number(e.target.value) } : x))} /> القيمة <Input className="w-24" type="number" min={0} value={t["value"]} onChange={(e) => set("sibling_tiers", (v["sibling_tiers"] as Row[]).map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))} /><Button size="sm" variant="ghost" onClick={() => set("sibling_tiers", (v["sibling_tiers"] as Row[]).filter((_, j) => j !== i))}>حذف</Button></div>)}
              <Button size="sm" variant="outline" onClick={() => set("sibling_tiers", [...(v["sibling_tiers"] as Row[]), { rank: (v["sibling_tiers"] as Row[]).length + 2, value: 0 }])}>إضافة شريحة</Button>
            </div>}
          </>}
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="dno">ملاحظات</Label><Input id="dno" value={v["notes"] ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <Button disabled={!ok || pending} onClick={() => onSave(v)}>حفظ</Button>
      </DialogContent>
    </Dialog>
  );
}
