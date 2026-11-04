import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { FileList, Uploader } from "@/components/homework/files";
import { Pill, fmt } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { E_STATUS, TONE, calcLine, day, num, sar, todayRiyadh, usePcForms, type PcMe, type Row } from "@/components/procurement/shared";
import { LogList, useInvalidate } from "@/components/procurement/custody";
import { ActionBox, BackLink, DateRange, DetailHeader, Field, FormActions, FormCard, Pager, Panel, SearchBox, TD, TDN, TFOOT, TH, THEAD, THN, TR, TRC, TableCard, Toolbar } from "@/components/procurement/ui";
import { useMyNeeds } from "@/components/procurement/needs";

const files = (fs: Row[]) => (fs ?? []).map((f: Row) => ({ ...f, size_bytes: f.size ?? 0 }));
const run = async (p: PromiseLike<{ error: unknown }>, ok?: string) => {
  const { error } = await p;
  if (error) { toast.error(arabicError(error)); return false; }
  if (ok) toast.success(ok);
  return true;
};
const PAGE = 20;

export function ExpenseList({ orgId, me, open, orgName, onNew }: { orgId: string; me: PcMe; open: (id: string) => void; orgName: string; onNew?: (() => void) | undefined }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [school, setSchool] = useState("");
  const [cat, setCat] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const args = { _org: orgId, _status: status || null, _q: q || null, _school: school || null, _custody: null, _category: cat || null, _from: from || null, _to: to || null };
  const list = useQuery({
    queryKey: ["pc-expenses", args, page],
    queryFn: async () => { const { data, error } = await db.rpc("pc_expense_list", { ...args, _limit: PAGE, _offset: page * PAGE }); if (error) throw error; return data as { total: number; sums: Row; rows: Row[] }; },
  });
  const reset = () => setPage(0);
  async function exp(kind: "xlsx" | "pdf") {
    const { data, error } = await db.rpc("pc_expense_list", { ...args, _limit: 5000, _offset: 0 });
    if (error) { toast.error(arabicError(error)); return; }
    const rows = (data.rows as Row[]).map((e) => [e.ref, day(e.purchase_date), e.custody_ref ?? "من مال الموظف", e.creator, e.supplier, e.invoice_no ?? "", e.description, e.category ?? "", E_STATUS[e.status] ?? e.status, Number(e.net), Number(e.vat), Number(e.total)]);
    const meta = { title: "سجل المصروفات والفواتير", school: orgName, filters: [status && `الحالة: ${E_STATUS[status] ?? status}`, q && `بحث: ${q}`, from && `من ${from}`, to && `إلى ${to}`].filter(Boolean) as string[],
      note: `الإجمالي: ${sar(data.sums.total)} (قبل الضريبة ${sar(data.sums.net)} + ضريبة ${sar(data.sums.vat)})` };
    const h = ["المرجع", "تاريخ الشراء", "العهدة", "المسجِّل", "المورد", "رقم الفاتورة", "البيان", "التصنيف", "الحالة", "قبل الضريبة", "الضريبة", "الإجمالي"];
    if (kind === "xlsx") exportXlsx(meta, h, rows); else await exportPdf(meta, h, rows);
  }
  const total = list.data?.total ?? 0;
  return (
    <div className="space-y-3">
      <Toolbar actions={<>
        {me.caps.export && <><Button size="sm" variant="outline" onClick={() => void exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exp("pdf")}><FileText className="size-4" />PDF</Button></>}
        {onNew && <Button size="sm" onClick={onNew}><Plus className="size-4" />تسجيل فاتورة مشتريات</Button>}
      </>}>
        <SearchBox placeholder="المورد أو الفاتورة أو البيان" value={q} onChange={(v) => { setQ(v); reset(); }} />
        <Field label="الحالة"><select className={selectCls("w-40", true)} value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
          <option value="">كل الحالات</option><option value="pending">بانتظار القرار</option>{Object.entries(E_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></Field>
        {me.schools.length > 1 && <Field label="الفرع"><select className={selectCls("w-36", true)} value={school} onChange={(e) => { setSchool(e.target.value); reset(); }}><option value="">كل الفروع</option>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {me.categories.length > 0 && <Field label="التصنيف"><select className={selectCls("w-36", true)} value={cat} onChange={(e) => { setCat(e.target.value); reset(); }}><option value="">كل التصنيفات</option>{me.categories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <DateRange from={from} to={to} setFrom={(v) => { setFrom(v); reset(); }} setTo={(v) => { setTo(v); reset(); }} />
      </Toolbar>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => void list.refetch()} /> : !list.data?.rows.length ? <EmptyState title="لا توجد مصروفات" hint={onNew ? "سجّل فاتورة مشتريات من الزر أعلاه، أو من داخل العهدة المصروفة لك." : "الفواتير التي تحفظها من جدول التسجيل تظهر هنا."} /> : (
        <TableCard caption={<><span><b className="text-foreground tabular-nums">{total}</b> فاتورة</span><span>قبل الضريبة {sar(list.data.sums.net)}</span><span>الضريبة {sar(list.data.sums.vat)}</span><span>الإجمالي <b className="text-foreground">{sar(list.data.sums.total)}</b></span></>}>
          <table className="w-full text-sm">
            <thead className={THEAD}><tr>{["المرجع", "التاريخ", "الفرع", "العهدة", "المورد", "الفاتورة", "البيان", "الحالة"].map((h) => <th key={h} className={TH}>{h}</th>)}<th className={THN}>الضريبة</th><th className={THN}>الإجمالي</th></tr></thead>
            <tbody>{list.data.rows.map((e) => (
              <tr key={e.id} className={TRC} onClick={() => open(e.id)}>
                <td className={`${TD} font-mono text-xs`}>{e.ref}</td><td className={`${TD} whitespace-nowrap`}>{day(e.purchase_date)}</td><td className={TD}>{e.school ?? "—"}</td><td className={`${TD} font-mono text-xs`}>{e.custody_ref ?? "من مال الموظف"}</td>
                <td className={`${TD} font-medium`}>{e.supplier}</td><td className={TD}>{e.invoice_no ?? "—"}</td><td className={`${TD} max-w-48 truncate`}>{e.description}</td>
                <td className={TD}><span className="flex flex-wrap gap-1"><Pill tone={TONE[e.status] ?? "muted"}>{E_STATUS[e.status]}</Pill>{e.dup_ref && <Pill tone="bad">مكرر محتمل</Pill>}</span></td>
                <td className={TDN}>{sar(e.vat)}</td><td className={`${TDN} font-semibold`}>{sar(e.total)}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableCard>
      )}
      <Pager page={page} total={total} size={PAGE} setPage={setPage} />
    </div>
  );
}

type Line = { description: string; amount: string; taxable: boolean; need_line_id?: string; qty?: string };
export function ExpenseForm({ orgId, me, custodyId, needId, initial, corrects, onDone, onCancel }: {
  needId?: string | undefined;
  orgId: string; me: PcMe; custodyId?: string | null | undefined; initial?: Row; corrects?: Row | undefined; onDone: (id: string) => void; onCancel: () => void;
}) {
  const custodies = useQuery({
    queryKey: ["pc-my-open", orgId],
    queryFn: async () => { const { data, error } = await db.rpc("pc_custody_list", { _org: orgId, _status: "open", _q: null, _school: null, _mine: false, _limit: 200, _offset: 0 }); if (error) throw error; return (data.rows as Row[]); },
  });
  const ownSchools = me.schools.filter((s) => me.create_schools.includes(s.id));
  const [own, setOwn] = useState<boolean>(initial?.own_funds ?? false);
  const [custody, setCustody] = useState<string>(initial?.custody_id ?? corrects?.custody_id ?? custodyId ?? "");
  const [school, setSchool] = useState<string>(initial?.school_id ?? ownSchools[0]?.id ?? "");
  const [ben, setBen] = useState<string>(initial?.benefit_school_id ?? "");
  const [d, setD] = useState({
    description: initial?.description ?? (corrects ? `تصحيح ${corrects.ref}` : ""), supplier: initial?.supplier ?? corrects?.supplier ?? "", invoice_no: initial?.invoice_no ?? "",
    invoice_date: initial?.invoice_date ?? "", purchase_date: initial?.purchase_date ?? todayRiyadh(), category_id: initial?.category_id ?? corrects?.category_id ?? "",
    notes: initial?.notes ?? "", no_attachment_reason: initial?.no_attachment_reason ?? "",
  });
  const [tax, setTax] = useState<boolean>(initial?.tax_invoice ?? corrects?.tax_invoice ?? false);
  const [incl, setIncl] = useState<boolean>(initial?.vat_inclusive ?? corrects?.vat_inclusive ?? me.settings?.vat_inclusive ?? false);
  const [lines, setLines] = useState<Line[]>(initial?.lines?.map((l: Row) => ({ description: l.description, amount: String(l.amount), taxable: l.taxable, need_line_id: l.need_line_id ?? "", qty: l.qty == null ? "" : String(l.qty) })) ?? [{ description: "", amount: "", taxable: true }]);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, string>>(initial?.custom ?? {});
  const [pr, setPr] = useState<string>(initial?.purchase_request_id ?? needId ?? "");
  const needs = useMyNeeds(orgId);
  const need = needs.data?.find((n) => n.id === pr);
  const [prefilled, setPrefilled] = useState(!!initial);
  if (!prefilled && need) {
    setPrefilled(true);
    if (!own && !custody) setOwn(true);
    const rest = (need.lines as Row[]).filter((l) => Number(l.remaining) > 0);
    if (rest.length) setLines(rest.map((l) => ({ description: l.description, amount: "", taxable: true, need_line_id: l.id, qty: String(l.remaining) })));
  }
  const forms = usePcForms(orgId);
  const form = initial ? forms.data?.versions.find((v) => v.id === initial.form_id) : forms.data?.versions.find((v) => v.status === "published");
  const core = (form?.core ?? forms.data?.default_core ?? []) as Row[];
  const custom = (form?.fields ?? []) as Row[];
  const purchases = useQuery({
    queryKey: ["pc-purchase-open", orgId],
    queryFn: async () => { const { data, error } = await db.rpc("pc_request_list", { _org: orgId, _kind: "purchase", _status: "approved", _q: null, _custody: null, _limit: 100, _offset: 0 }); if (error) throw error; return data.rows as Row[]; },
  });
  const inv = useInvalidate();
  const rate = Number(initial?.vat_rate ?? me.settings?.vat_rate ?? 15);
  const sel = custodies.data?.find((c) => c.id === custody);
  const preview = useMemo(() => lines.map((l) => calcLine(Number(l.amount) || 0, tax && l.taxable, rate, incl)), [lines, tax, rate, incl]);
  const tot = preview.reduce((a, p) => ({ net: num(a.net + p.net), vat: num(a.vat + p.vat), total: num(a.total + p.total) }), { net: 0, vat: 0, total: 0 });
  const set = (k: keyof typeof d, v: string) => setD({ ...d, [k]: v });
  async function save() {
    setBusy(true);
    const body = { ...d, own_funds: own, custody_id: own ? null : custody, school_id: own ? school : null, benefit_school_id: ben || null, corrects_id: corrects?.id ?? initial?.corrects_id ?? null,
      tax_invoice: tax, vat_inclusive: incl, category_id: d.category_id || null, custom: answers, purchase_request_id: pr || null, lines: lines.map((l) => ({ description: l.description, amount: Number(l.amount), taxable: l.taxable, need_line_id: need ? l.need_line_id || null : null, qty: need && l.qty ? Number(l.qty) : null })) };
    const { data, error } = await db.rpc("pc_expense_save", { _org: orgId, _id: initial?.id ?? null, _d: body, _rev: initial?.rev ?? 0, _key: initial ? null : key });
    setBusy(false);
    if (error) { toast.error(arabicError(error)); return; }
    toast.success("حُفظ المصروف — أرفق الفاتورة ثم أرسله للمراجعة"); inv(); onDone(data as string);
  }
  const benOptions = sel ? me.schools.filter((s) => s.id === sel.school_id || (sel.school_ids ?? []).includes(s.id)) : [];
  const L = (k: string, fallback: string) => { const c = core.find((x) => x.key === k); return c ? c.label + (c.required && !c.protected ? " *" : "") : fallback; };
  const H = (k: string) => { const h = core.find((x) => x.key === k)?.help; return h ? <p className="mt-0.5 text-xs text-muted-foreground">{h}</p> : null; };
  const blocks: Record<string, React.ReactNode> = {
    purchase_date: <div key="purchase_date"><Label>{L("purchase_date", "تاريخ الشراء")}</Label><Input type="date" max={todayRiyadh()} value={d.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />{H("purchase_date")}</div>,
    supplier: <div key="supplier"><Label htmlFor="pc-supplier">{L("supplier", "المورد")}</Label><Input id="pc-supplier" value={d.supplier} onChange={(e) => set("supplier", e.target.value)} />{H("supplier")}</div>,
    description: <div key="description" className="sm:col-span-2"><Label htmlFor="pc-desc">{L("description", "البيان")}</Label><Input id="pc-desc" value={d.description} onChange={(e) => set("description", e.target.value)} />{H("description")}</div>,
    tax: <div key="tax" className="sm:col-span-2 space-y-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tax} onChange={(e) => setTax(e.target.checked)} /> {L("tax", "فاتورة ضريبية")} (ضريبة القيمة المضافة {rate}%)</label>{H("tax")}
      {tax && <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={!incl} onChange={() => setIncl(false)} /> المبالغ قبل الضريبة</label>
        <label className="flex items-center gap-1"><input type="radio" checked={incl} onChange={() => setIncl(true)} /> المبالغ شاملة الضريبة</label>
      </div>}
      {tax && <p className="text-xs text-muted-foreground">اختيار «ضريبية» لا يثبت صحة الفاتورة أو أهلية استرداد ضريبتها.</p>}
    </div>,
    invoice_no: <div key="invoice_no"><Label htmlFor="pc-inv">{tax ? L("invoice_no", "رقم الفاتورة") + (tax ? " (إلزامي)" : "") : `${L("invoice_no", "رقم الفاتورة")} / الإيصال`}</Label><Input id="pc-inv" value={d.invoice_no} onChange={(e) => set("invoice_no", e.target.value)} />{H("invoice_no")}</div>,
    invoice_date: <div key="invoice_date"><Label>{L("invoice_date", "تاريخ الفاتورة")}</Label><Input type="date" max={todayRiyadh()} value={d.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} />{H("invoice_date")}</div>,
    category: me.categories.length > 0 ? <div key="category"><Label>{L("category", "التصنيف")}</Label><select className={selectCls()} value={d.category_id} onChange={(e) => set("category_id", e.target.value)}><option value="">بدون</option>{me.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{H("category")}</div> : null,
    benefit_school: !own && benOptions.length > 1 ? <div key="benefit_school"><Label>{L("benefit_school", "الفرع المستفيد")}</Label><select className={selectCls()} value={ben} onChange={(e) => setBen(e.target.value)}><option value="">فرع العهدة</option>{benOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>{H("benefit_school")}</div> : null,
    notes: <div key="notes" className="sm:col-span-2"><Label>{L("notes", "ملاحظات")}{corrects ? " (سبب التصحيح — إلزامي)" : ""}</Label><Textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} />{H("notes")}</div>,
    lines: <div key="lines" className="space-y-2 sm:col-span-2">
      <Label>{L("lines", "البنود")}</Label>{H("lines")}
      {lines.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input className="min-w-40 flex-1" placeholder="بيان البند" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          {need && <select aria-label={`بند الاحتياج ${i + 1}`} className={selectCls("w-full sm:w-48")} value={l.need_line_id ?? ""} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, need_line_id: e.target.value } : x)))}>
            <option value="">غير مرتبط بالاحتياج</option>{(need.lines as Row[]).map((n) => <option key={n.id} value={n.id}>{n.description} (متبقٍ {Number(n.remaining)})</option>)}</select>}
          {need && l.need_line_id && <Input aria-label={`الكمية ${i + 1}`} className="w-20" inputMode="decimal" placeholder="الكمية" value={l.qty ?? ""} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />}
          <Input className="w-28" inputMode="decimal" placeholder="المبلغ" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          {tax && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.taxable} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, taxable: e.target.checked } : x)))} /> خاضع</label>}
          <span className="w-40 text-xs tabular-nums text-muted-foreground">{tax ? `ضريبة ${sar(preview[i]!.vat)} · ` : ""}{sar(preview[i]!.total)}</span>
          {lines.length > 1 && <Button size="icon" variant="ghost" aria-label="حذف البند" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}
        </div>
      ))}
      {lines.length < 50 && <Button size="sm" variant="outline" onClick={() => setLines([...lines, { description: "", amount: "", taxable: true }])}><Plus className="size-4" />بند</Button>}
      <p className="rounded-lg bg-muted/50 p-2 text-sm tabular-nums">قبل الضريبة {sar(tot.net)} · الضريبة {sar(tot.vat)} · <b>الإجمالي {sar(tot.total)}</b> <span className="text-xs text-muted-foreground">(معاينة — يحسب الخادم القيمة النهائية)</span></p>
      {corrects && <p className="text-xs text-muted-foreground">للتخفيض استخدم مبلغًا سالبًا (مثل −15).</p>}
    </div>,
  };
  const threshold = me.settings?.purchase_request_above;
  return (
    <FormCard wide title={initial ? `تعديل ${initial.ref}` : corrects ? `تصحيح المصروف ${corrects.ref}` : "تسجيل مصروف / فاتورة"} subtitle={form ? `نموذج الإدخال: الإصدار ${form.version}` : undefined}>
      {!corrects && !initial?.corrects_id && (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={!own} onChange={() => setOwn(false)} /> على عهدة</label>
          <label className="flex items-center gap-1"><input type="radio" checked={own} onChange={() => setOwn(true)} /> من مال الموظف (مسار مستقل يحتاج اعتمادًا)</label>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {!own ? (
          <div className="sm:col-span-2"><Label>العهدة</Label>
            <select className={selectCls()} value={custody} disabled={!!corrects || !!initial} onChange={(e) => setCustody(e.target.value)}>
              <option value="">— اختر —</option>{(custodies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.ref} · {c.holder} · المتاح {sar(c.bal.available)}</option>)}
            </select>
            {sel && <p className="mt-1 text-xs text-muted-foreground">المتاح الآن: {sar(sel.bal.available)}</p>}
          </div>
        ) : (
          <div><Label>الفرع</Label><select className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)}>{ownSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        )}
        {core.filter((c) => !c.hidden).map((c) => blocks[c.key] ?? null)}
        {custom.map((f) => (
          <div key={f.key} className={f.type === "longtext" ? "sm:col-span-2" : ""}>
            <Label>{f.label}{f.required ? " *" : ""}</Label>
            {f.type === "longtext" ? <Textarea rows={2} value={answers[f.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />
              : f.type === "choice" ? <select className={selectCls()} value={answers[f.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })}><option value="">— اختر —</option>{(f.options as string[]).map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : f.type === "file" ? (initial?.files?.length ? <select className={selectCls()} value={answers[f.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })}><option value="">— اختر من المرفقات —</option>{(initial.files as Row[]).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                : <p className="text-xs text-muted-foreground">احفظ ثم ارفع الملف ضمن المرفقات واختره هنا عند التعديل.</p>)
              : <Input type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={answers[f.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />}
            {f.help && <p className="mt-0.5 text-xs text-muted-foreground">{f.help}</p>}
          </div>
        ))}
        {!corrects && (needs.data?.length ?? 0) > 0 && (
          <div className="sm:col-span-2"><Label>طلب احتياج مسند إليك</Label>
            <select className={selectCls()} value={need ? pr : ""} onChange={(e) => { setPr(e.target.value); setPrefilled(false); }}><option value="">بدون</option>{(needs.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.ref} · {r.purpose} · {r.school}</option>)}</select>
            {need && <p className="mt-1 text-xs text-muted-foreground">اربط كل بند ببند الاحتياج وكميته؛ يمكن تنفيذ الطلب على أكثر من فاتورة، ولا تتجاوز الكمية المتبقي.</p>}
          </div>
        )}
        {!corrects && !need && (purchases.data?.length ?? 0) > 0 && (
          <div className="sm:col-span-2"><Label>طلب شراء مسبق معتمد{threshold ? ` (إلزامي فوق ${sar(threshold)})` : " (اختياري)"}</Label>
            <select className={selectCls()} value={need ? "" : pr} onChange={(e) => setPr(e.target.value)}><option value="">بدون</option>{(purchases.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.ref} · {r.purpose} · {sar(r.amount)}</option>)}</select>
          </div>
        )}
        {!corrects && threshold && !(purchases.data?.length) && <p className="text-xs text-muted-foreground sm:col-span-2">المصروف فوق {sar(threshold)} يحتاج طلب شراء مسبق معتمد.</p>}
        <div className="sm:col-span-2"><Label>سبب عدم وجود مرفق (عند تعذّر الفاتورة)</Label><Textarea rows={2} value={d.no_attachment_reason} onChange={(e) => set("no_attachment_reason", e.target.value)} placeholder="يُعتمد استثناءً من شخص آخر" /></div>
      </div>
      <FormActions><Button disabled={busy || (!own && !custody)} onClick={() => void save()}>حفظ</Button><Button variant="ghost" onClick={onCancel}>إلغاء</Button></FormActions>
    </FormCard>
  );
}

function RefundBox({ e, onChange }: { e: Row; onChange: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div><Label>مبلغ الاسترداد</Label><Input className="w-28" inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} /></div>
      <div className="flex-1"><Label>السبب</Label><Input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="إرجاع صنف، خصم لاحق…" /></div>
      <Button size="sm" onClick={async () => { if (await run(db.rpc("pc_refund_create", { _expense: e.id, _amount: Number(amount), _reason: reason, _key: key }), "سُجّل طلب الاسترداد — لا يرفع الرصيد قبل التأكيد")) { setAmount(""); setReason(""); setKey(crypto.randomUUID()); onChange(); } }}>طلب استرداد</Button>
    </div>
  );
}

export function ExpenseDetail({ id, me, back, openCustody, openExpense }: { id: string; me: PcMe; back: () => void; openCustody: (id: string) => void; openExpense: (id: string) => void }) {
  const q = useQuery({ queryKey: ["pc-expense", id], queryFn: async () => { const { data, error } = await db.rpc("pc_expense_get", { _id: id }); if (error) throw error; return data as Row; } });
  const [mode, setMode] = useState<"" | "edit" | "correct" | "refund">("");
  const inv = useInvalidate();
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const e = q.data!;
  if (mode === "edit") return <ExpenseForm orgId={e.org_id} me={me} initial={e} onDone={() => { setMode(""); inv(); }} onCancel={() => setMode("")} />;
  if (mode === "correct") return <ExpenseForm orgId={e.org_id} me={me} corrects={e} onDone={(nid) => { setMode(""); openExpense(nid); }} onCancel={() => setMode("")} />;
  const act = async (action: string, msg: string, reasonPrompt?: string) => {
    let reason: string | null = null;
    if (reasonPrompt) { reason = await askText(reasonPrompt, { required: true }); if (!reason) return; }
    if (await run(db.rpc("pc_expense_action", { _id: e.id, _action: action, _rev: e.rev, _reason: reason }), msg)) inv();
  };
  async function approve() {
    if (e.no_files || e.no_attachment_reason) { await act("approve", "اعتُمد المصروف", `المصروف بلا مرفق («${e.no_attachment_reason ?? ""}»). اكتب سبب موافقتك على الاستثناء:`); return; }
    if (await ask(`اعتماد ${sar(e.total)}؟ سيُخصم من رصيد العهدة مرة واحدة.`)) await act("approve", "اعتُمد المصروف");
  }
  return (
    <div className="space-y-4">
      <BackLink onClick={back} label="الفواتير" />
      <DetailHeader refText={<>{e.ref}{e.corrects_id ? " · تصحيح" : ""}</>} title={e.description} status={<Pill tone={TONE[e.status] ?? "muted"}>{E_STATUS[e.status]}</Pill>}
        facts={[
          ["المورد", e.supplier], ["رقم الفاتورة", e.invoice_no ? `${e.invoice_no}${e.invoice_date ? ` · ${day(e.invoice_date)}` : ""}` : "—"], ["تاريخ الشراء", day(e.purchase_date)],
          ["الإجمالي", <b key="t" className="tabular-nums">{sar(e.total)}</b>],
          ["العهدة", e.custody_id ? <button key="c" className="text-primary" onClick={() => openCustody(e.custody_id)}>{e.custody_ref} ({e.holder})</button> : "من مال الموظف"],
          ["المسجِّل", e.creator], ["الفرع المستفيد", e.benefit_school], ...(e.category ? [["التصنيف", e.category] as [string, React.ReactNode]] : []),
        ]}
        actions={<>
          {e.can.edit && <><Button size="sm" variant="outline" onClick={() => setMode("edit")}>تعديل</Button><Button size="sm" onClick={() => void act("submit", "أُرسل للمراجعة")}>إرسال للمراجعة</Button></>}
          {e.can.review && <Button size="sm" variant="outline" onClick={() => void act("review", "بدأت المراجعة")}>بدء المراجعة</Button>}
          {e.can.decide && <Button size="sm" onClick={() => void approve()}>اعتماد</Button>}
          {e.can.return && <Button size="sm" variant="outline" onClick={() => void act("return", "أُعيد للاستكمال", "ما المطلوب استكماله؟")}>إعادة للاستكمال</Button>}
          {e.can.decide && <Button size="sm" variant="destructive" onClick={() => void act("reject", "رُفض", "سبب الرفض")}>رفض</Button>}
          {e.can.edit && <Button size="sm" variant="ghost" onClick={() => void act("cancel", "أُلغي", "سبب الإلغاء")}>إلغاء</Button>}
          {e.can.correct && <Button size="sm" variant="outline" onClick={() => setMode("correct")}>قيد تصحيح</Button>}
          {e.can.refund && <Button size="sm" variant="outline" onClick={() => setMode(mode === "refund" ? "" : "refund")}>استرداد</Button>}
        </>}>
        <div className="space-y-1 text-sm empty:hidden">
          {e.corrects_id && <p><button className="text-primary" onClick={() => openExpense(e.corrects_id)}>المصروف الأصلي</button></p>}
          {e.notes && <p>ملاحظات: {e.notes}</p>}
          <CustomValues e={e} />
          {e.no_attachment_reason && <p className="rounded-lg bg-warning/10 px-3 py-2">بلا مرفق: {e.no_attachment_reason}</p>}
          {e.decision_reason && <p className="text-muted-foreground">سبب القرار: {e.decision_reason}</p>}
          {e.dup_ref && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">تنبيه: المورد ورقم الفاتورة يطابقان {e.dup_ref} — لا يُعتمد مكرر.</p>}
        </div>
      </DetailHeader>
      {mode === "refund" && <RefundBox e={e} onChange={() => { setMode(""); inv(); }} />}
      <Panel title="بنود الفاتورة" count={(e.lines as Row[]).length} flush>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className={THEAD}><tr>{["#", "البند", "خاضع"].map((h) => <th key={h} className={TH}>{h}</th>)}{["قبل الضريبة", "الضريبة", "الإجمالي"].map((h) => <th key={h} className={THN}>{h}</th>)}</tr></thead>
          <tbody>
            {(e.lines as Row[]).map((l) => <tr key={l.id} className={TR}><td className={TD}>{l.ord}</td><td className={TD}>{l.description}</td><td className={TD}>{l.taxable && e.tax_invoice ? "نعم" : "لا"}</td><td className={TDN}>{sar(l.net)}</td><td className={TDN}>{sar(l.vat)}</td><td className={TDN}>{sar(l.total)}</td></tr>)}
          </tbody>
          <tfoot className={TFOOT}><tr><td className={TD} colSpan={3}>الإجمالي{e.tax_invoice ? ` (ضريبة ${Number(e.vat_rate)}% ${e.vat_inclusive ? "شاملة" : "مضافة"})` : ""}</td><td className={TDN}>{sar(e.net)}</td><td className={TDN}>{sar(e.vat)}</td><td className={TDN}>{sar(e.total)}</td></tr></tfoot>
        </table></div>
      </Panel>
      <Panel title="الفاتورة والمرفقات" count={(e.files as Row[]).length}>
        <div className="space-y-2">
        <FileList files={files(e.files)} onRemove={e.can.edit ? async (f) => { if (await run(db.rpc("pc_file_remove", { _file: f["id"] }), "أُزيل الملف")) inv(); } : undefined} />
        {!e.files.length && <p className="text-sm text-muted-foreground">لا مرفقات.</p>}
        {e.can.edit && <Uploader label="إرفاق الفاتورة" create={async (f) => { const { data, error } = await db.rpc("create_pc_file", { _entity: "expense", _id: e.id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }} release={(fid) => db.rpc("pc_file_remove", { _file: fid })} onDone={inv} />}
        </div>
      </Panel>
      {e.corrections.length > 0 && <Panel title="قيود التصحيح" count={e.corrections.length}><div className="space-y-1">{(e.corrections as Row[]).map((x) => <button key={x.id} className="block text-sm text-primary" onClick={() => openExpense(x.id)}>{x.ref} · {sar(x.total)} · {E_STATUS[x.status]}</button>)}</div></Panel>}
      {e.refunds.length > 0 && (
        <Panel title="الاستردادات" count={e.refunds.length}><div className="space-y-2">
          {(e.refunds as Row[]).map((r) => (
            <div key={r.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><b className="tabular-nums">{sar(r.amount)}</b><span>{r.reason}</span><span className="text-muted-foreground">— {r.by} · {fmt(r.at)}</span>
                <Pill tone={r.status === "collected" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{r.status === "collected" ? "مُستلم" : r.status === "rejected" ? "مرفوض" : "بانتظار التأكيد"}</Pill></div>
              <FileList files={files(r.files)} />
              {r.status === "pending" && (r.created_by === me.me || r.can_decide) && <Uploader label="إرفاق سند الاسترداد" create={async (f) => { const { data, error } = await db.rpc("create_pc_file", { _entity: "refund", _id: r.id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data[0]; }} release={(fid) => db.rpc("pc_file_remove", { _file: fid })} onDone={inv} />}
              {r.can_decide && <div className="flex gap-2">
                <Button size="sm" onClick={async () => { if (await run(db.rpc("pc_refund_decide", { _id: r.id, _collect: true, _reason: null }), "تأكد الاسترداد وأُضيف للرصيد")) inv(); }}>تأكيد الاستلام</Button>
                <Button size="sm" variant="outline" onClick={async () => { const why = await askText("سبب الرفض", { required: true }); if (why && (await run(db.rpc("pc_refund_decide", { _id: r.id, _collect: false, _reason: why }), "رُفض"))) inv(); }}>رفض</Button>
              </div>}
            </div>
          ))}
        </div></Panel>
      )}
      <LogList log={e.log} />
    </div>
  );
}

function CustomValues({ e }: { e: Row }) {
  const forms = usePcForms(e.org_id);
  const f = forms.data?.versions.find((v) => v.id === e.form_id);
  if (!f) return null;
  const vals = (f.fields as Row[]).filter((x) => e.custom?.[x.key]);
  return (
    <div className="text-sm">
      <span className="text-xs text-muted-foreground">نموذج الإصدار {f.version}</span>
      {vals.map((x) => <p key={x.key}>{x.label}: {x.type === "file" ? ((e.files as Row[]).find((y) => y.id === e.custom[x.key])?.name ?? "ملف") : e.custom[x.key]}</p>)}
      {e.purchase_request_id && <p className="text-xs text-muted-foreground">مرتبط بطلب شراء مسبق</p>}
    </div>
  );
}
