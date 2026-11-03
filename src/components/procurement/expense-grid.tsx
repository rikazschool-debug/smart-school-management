import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { calcLine, num, sar, todayRiyadh, usePcForms, type PcMe, type Row } from "@/components/procurement/shared";
import { useInvalidate } from "@/components/procurement/custody";

type G = { k: string; date: string; supplier: string; invoice_no: string; description: string; category_id: string; amount: string; tax: boolean; notes: string; custom: Record<string, string>; err?: string | undefined; id?: string | undefined };
const blank = (): G => ({ k: crypto.randomUUID(), date: todayRiyadh(), supplier: "", invoice_no: "", description: "", category_id: "", amount: "", tax: true, notes: "", custom: {} });

/** Spreadsheet-style entry: one row per invoice, saved together. Each row goes through the same pc_expense_save RPC (server checks, VAT, form version). */
export function ExpenseGrid({ orgId, me, onDone, onCancel }: { orgId: string; me: PcMe; onDone?: () => void; onCancel?: () => void }) {
  const custodies = useQuery({
    queryKey: ["pc-my-open", orgId],
    queryFn: async () => { const { data, error } = await db.rpc("pc_custody_list", { _org: orgId, _status: "open", _q: null, _school: null, _mine: false, _limit: 200, _offset: 0 }); if (error) throw error; return data.rows as Row[]; },
  });
  const forms = usePcForms(orgId);
  const form = forms.data?.versions.find((v) => v.status === "published");
  const core = ((form?.core ?? forms.data?.default_core ?? []) as Row[]);
  const shown = (k: string) => { const c = core.find((x) => x.key === k); return !c || !c.hidden; };
  const label = (k: string, f: string) => core.find((x) => x.key === k)?.label || f;
  const custom = ((form?.fields ?? []) as Row[]);
  const ownSchools = me.schools.filter((s) => me.create_schools.includes(s.id));
  const [own, setOwn] = useState(false);
  const [custody, setCustody] = useState("");
  const [school, setSchool] = useState(ownSchools[0]?.id ?? "");
  const [incl, setIncl] = useState(true);
  const [rows, setRows] = useState<G[]>(() => Array.from({ length: 10 }, blank));
  const [busy, setBusy] = useState(false);
  const inv = useInvalidate();
  const rate = Number(me.settings?.vat_rate ?? 15);
  const upd = (i: number, p: Partial<G>) => setRows(rows.map((r, j) => (j === i ? (r.id ? r : { ...r, ...p, err: undefined }) : r)));
  const calc = useMemo(() => rows.map((r) => calcLine(Number(r.amount) || 0, r.tax, rate, incl)), [rows, rate, incl]);
  const tot = calc.reduce((a, p) => ({ net: num(a.net + p.net), vat: num(a.vat + p.vat), total: num(a.total + p.total) }), { net: 0, vat: 0, total: 0 });
  const sel = custodies.data?.find((c) => c.id === custody);
  const filled = rows.filter((r) => r.supplier || r.description || r.amount);

  async function saveRows(): Promise<G[] | null> {
    if (!own && !custody) { toast.error("اختر العهدة أولًا"); return null; }
    if (!filled.length) { toast.error("أدخل فاتورة واحدة على الأقل"); return null; }
    let ok = 0, bad = 0;
    const out: G[] = [];
    for (const r of rows) {
      if (r.id || !(r.supplier || r.description || r.amount)) { out.push(r); continue; }
      const body = { purchase_date: r.date, supplier: r.supplier, invoice_no: r.invoice_no, invoice_date: r.date, description: r.description, notes: r.notes,
        own_funds: own, custody_id: own ? null : custody, school_id: own ? school : null, benefit_school_id: null, corrects_id: null, purchase_request_id: null,
        tax_invoice: r.tax, vat_inclusive: incl, category_id: r.category_id || null, custom: r.custom,
        lines: [{ description: r.description, amount: Number(r.amount), taxable: r.tax, need_line_id: null, qty: null }] };
      const { data, error } = await db.rpc("pc_expense_save", { _org: orgId, _id: null, _d: body, _rev: 0, _key: r.k });
      const id = typeof data === "string" ? data : (data as Row | null)?.id;
      if (error || !id) { bad++; out.push({ ...r, err: error ? arabicError(error) : "تعذّر الحفظ" }); } else { ok++; out.push({ ...r, id, err: undefined }); }
    }
    setRows(out);
    inv();
    if (ok) toast.success(`حُفظت ${ok} فاتورة — يبقى الكشف كما هو حتى «إنهاء وإرسال للمراجعة»`);
    if (bad) toast.error(`لم تُحفظ ${bad} — راجع الصفوف المظللة`);
    return bad ? null : out;
  }
  async function saveAll() { setBusy(true); await saveRows(); setBusy(false); }
  async function finish() {
    setBusy(true);
    const saved = await saveRows();
    if (!saved) { setBusy(false); return; }
    let sent = 0; const errs: string[] = [];
    for (const r of saved.filter((x) => x.id)) {
      const { data: e } = await db.rpc("pc_expense_get", { _id: r.id! });
      const rev = (e as Row | null)?.rev ?? 0;
      const { error } = await db.rpc("pc_expense_action", { _id: r.id!, _action: "submit", _rev: rev, _reason: null });
      if (error) errs.push(arabicError(error)); else sent++;
    }
    setBusy(false); inv();
    if (sent) toast.success(`أُرسلت ${sent} فاتورة للمراجعة`);
    if (errs.length) { toast.error(errs[0]!); return; }
    setRows(Array.from({ length: 10 }, blank)); onDone?.();
  }

  const cell = "h-9 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-1";
  const th = "whitespace-nowrap border-b border-l px-2 py-2 text-start text-xs font-medium text-muted-foreground";
  const td = "border-b border-l p-0";
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">تسجيل فواتير المشتريات</h2>
        {form && <span className="text-xs text-muted-foreground">النموذج: الإصدار {form.version}</span>}
      </div>
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={!own} onChange={() => setOwn(false)} /> على عهدة</label>
        <label className="flex items-center gap-1"><input type="radio" checked={own} onChange={() => setOwn(true)} /> من مال الموظف</label>
        {!own ? (
          <div className="min-w-64"><Label>العهدة</Label>
            <select className={selectCls()} value={custody} onChange={(e) => setCustody(e.target.value)}>
              <option value="">— اختر —</option>{(custodies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.ref} · {c.holder} · المتاح {sar(c.bal.available)}</option>)}
            </select>
          </div>
        ) : (
          <div className="min-w-48"><Label>الفرع</Label><select className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)}>{ownSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        )}
        <label className="flex items-center gap-1"><input type="checkbox" checked={incl} onChange={(e) => setIncl(e.target.checked)} /> المبالغ شاملة الضريبة ({rate}%)</label>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-muted/50"><tr>
            <th className={th}>#</th>
            <th className={th}>{label("purchase_date", "التاريخ")}</th>
            <th className={th}>{label("supplier", "المورد")}</th>
            {shown("invoice_no") && <th className={th}>{label("invoice_no", "رقم الفاتورة")}</th>}
            <th className={th}>{label("description", "البيان")}</th>
            {shown("category") && me.categories.length > 0 && <th className={th}>{label("category", "التصنيف")}</th>}
            <th className={th}>المبلغ</th>
            <th className={th}>ضريبية</th>
            {custom.map((f) => <th key={f.key} className={th}>{f.label}{f.required ? " *" : ""}</th>)}
            {shown("notes") && <th className={th}>{label("notes", "ملاحظات")}</th>}
            <th className={th}>الضريبة</th><th className={th}>الإجمالي</th><th className={th} />
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.k} className={r.err ? "bg-destructive/10" : r.id ? "bg-primary/5" : ""} title={r.err}>
                <td className={`${td} px-2 text-xs text-muted-foreground`}>{i + 1}</td>
                <td className={td}><Input type="date" max={todayRiyadh()} className={cell} value={r.date} onChange={(e) => upd(i, { date: e.target.value })} aria-label={`التاريخ ${i + 1}`} /></td>
                <td className={td}><Input className={cell} value={r.supplier} onChange={(e) => upd(i, { supplier: e.target.value })} aria-label={`المورد ${i + 1}`} /></td>
                {shown("invoice_no") && <td className={td}><Input className={cell} value={r.invoice_no} onChange={(e) => upd(i, { invoice_no: e.target.value })} aria-label={`رقم الفاتورة ${i + 1}`} /></td>}
                <td className={td}><Input className={cell} value={r.description} onChange={(e) => upd(i, { description: e.target.value })} aria-label={`البيان ${i + 1}`} /></td>
                {shown("category") && me.categories.length > 0 && <td className={td}><select className="h-9 w-full bg-transparent px-2 text-sm" value={r.category_id} onChange={(e) => upd(i, { category_id: e.target.value })} aria-label={`التصنيف ${i + 1}`}><option value="">—</option>{me.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>}
                <td className={td}><Input className={`${cell} w-28 tabular-nums`} inputMode="decimal" value={r.amount} onChange={(e) => upd(i, { amount: e.target.value })} aria-label={`المبلغ ${i + 1}`} /></td>
                <td className={`${td} text-center`}><input type="checkbox" checked={r.tax} onChange={(e) => upd(i, { tax: e.target.checked })} aria-label={`ضريبية ${i + 1}`} /></td>
                {custom.map((f) => <td key={f.key} className={td}>{f.type === "choice"
                  ? <select className="h-9 w-full bg-transparent px-2 text-sm" value={r.custom[f.key] ?? ""} onChange={(e) => upd(i, { custom: { ...r.custom, [f.key]: e.target.value } })}><option value="">—</option>{(f.options ?? []).map((o: string) => <option key={o}>{o}</option>)}</select>
                  : <Input className={cell} type={f.type === "number" ? "text" : f.type === "date" ? "date" : "text"} value={r.custom[f.key] ?? ""} onChange={(e) => upd(i, { custom: { ...r.custom, [f.key]: e.target.value } })} aria-label={`${f.label} ${i + 1}`} />}</td>)}
                {shown("notes") && <td className={td}><Input className={cell} value={r.notes} onChange={(e) => upd(i, { notes: e.target.value })} aria-label={`ملاحظات ${i + 1}`} /></td>}
                <td className={`${td} px-2 tabular-nums text-muted-foreground`}>{sar(calc[i]!.vat)}</td>
                <td className={`${td} px-2 tabular-nums`}>{sar(calc[i]!.total)}</td>
                <td className={td}>{rows.length > 1 && <Button size="icon" variant="ghost" aria-label={`حذف الصف ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 font-semibold"><tr>
            <td className="px-2 py-2" colSpan={99}>الإجمالي: {filled.length} فاتورة · قبل الضريبة {sar(tot.net)} · الضريبة {sar(tot.vat)} · <b>{sar(tot.total)}</b>{sel ? <span className="ms-2 text-xs font-normal text-muted-foreground">المتاح في العهدة {sar(sel.bal.available)}</span> : null}</td>
          </tr></tfoot>
        </table>
      </div>
      {rows.some((r) => r.err) && <ul className="space-y-0.5 text-xs text-destructive">{rows.map((r, i) => r.err && <li key={r.k}>الصف {i + 1}: {r.err}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        {rows.length < 50 && <Button variant="outline" onClick={() => setRows([...rows, blank()])}><Plus className="size-4" />صف</Button>}
        <Button variant="outline" disabled={busy} onClick={() => void saveAll()}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
        <Button disabled={busy} onClick={() => void finish()}>إنهاء وإرسال للمراجعة</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>إلغاء</Button>}
      </div>
      <p className="text-xs text-muted-foreground">«حفظ» يحفظ الصفوف ويبقيها ظاهرة (الصفوف المحفوظة مظللة)، و«إنهاء وإرسال للمراجعة» يرسلها كلها. المرفق اختياري. لربط فاتورة بطلب احتياج استخدم زر «فاتورة» من صفحة الطلب.</p>
    </div>
  );
}
