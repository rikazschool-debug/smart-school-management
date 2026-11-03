import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Pill, fmt } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { ACTION, C_STATUS, E_STATUS, SCOPE_LABEL, TONE, sar, type PcMe, type Row } from "@/components/procurement/shared";
import { useInvalidate } from "@/components/procurement/custody";

function Item({ r, onClick, extra }: { r: Row; onClick: () => void; extra?: React.ReactNode }) {
  const isExp = r.entity === "expense" || r.supplier !== undefined;
  return (
    <li className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40" onClick={onClick}>
      <span className="font-mono text-xs">{r.ref}</span>
      <span className="min-w-0 truncate">{isExp ? `${r.description} — ${r.supplier}` : r.purpose}</span>
      <span className="text-muted-foreground">{isExp ? r.creator : r.holder}</span>
      <span className="ms-auto tabular-nums">{sar(isExp ? r.total : r.amount)}</span>
      <Pill tone={TONE[r.status] ?? "muted"}>{isExp ? E_STATUS[r.status] : C_STATUS[r.status]}</Pill>{extra}
    </li>
  );
}

function Block({ title, rows, children }: { title: string; rows: number; children: React.ReactNode }) {
  if (!rows) return null;
  return <section className="space-y-2"><h3 className="font-semibold">{title} <span className="text-sm text-muted-foreground">({rows})</span></h3><ul className="divide-y rounded-xl border bg-card">{children}</ul></section>;
}

export function TasksTab({ orgId, openC, openE }: { orgId: string; openC: (id: string) => void; openE: (id: string) => void }) {
  const q = useQuery({ queryKey: ["pc-tasks", orgId], queryFn: async () => { const { data, error } = await db.rpc("pc_tasks", { _org: orgId }); if (error) throw error; return data as Row; } });
  const inv = useInvalidate();
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const t = q.data;
  const n = t.ack.length + t.custody_decide.length + t.custody_disburse.length + t.expense_decide.length + t.refund_decide.length + t.mine.length;
  if (!n) return <EmptyState title="لا مهام بانتظارك" hint="ستظهر هنا العهد والفواتير التي تحتاج قرارك أو استكمالك." />;
  return (
    <div className="space-y-5">
      <Block title="بانتظار تأكيد استلامك" rows={t.ack.length}>
        {t.ack.map((a: Row) => (
          <li key={a.move} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <button className="font-mono text-xs text-primary" onClick={() => openC(a.custody_id)}>{a.ref}</button><span>صُرف لك {sar(a.amount)} · {fmt(a.at)}</span>
            <Button size="sm" className="ms-auto" onClick={async () => { const { error } = await db.rpc("pc_ack", { _move: a.move }); if (error) toast.error(arabicError(error)); else { toast.success("تم تأكيد الاستلام"); inv(); } }}>تأكيد الاستلام</Button>
          </li>
        ))}
      </Block>
      <Block title="عهد بانتظار اعتمادك" rows={t.custody_decide.length}>{t.custody_decide.map((r: Row) => <Item key={r.id} r={r} onClick={() => openC(r.id)} />)}</Block>
      <Block title="عهد معتمدة بانتظار الصرف" rows={t.custody_disburse.length}>{t.custody_disburse.map((r: Row) => <Item key={r.id} r={r} onClick={() => openC(r.id)} />)}</Block>
      <Block title="مصروفات بانتظار المراجعة أو الاعتماد" rows={t.expense_decide.length}>{t.expense_decide.map((r: Row) => <Item key={r.id} r={r} onClick={() => openE(r.id)} extra={r.dup_ref ? <Pill tone="bad">مكرر محتمل</Pill> : null} />)}</Block>
      <Block title="استردادات بانتظار التأكيد" rows={t.refund_decide.length}>
        {t.refund_decide.map((r: Row) => <li key={r.id} className="flex cursor-pointer gap-2 px-3 py-2 text-sm hover:bg-muted/40" onClick={() => openE(r.expense_id)}><span className="font-mono text-xs">{r.ref}</span><span>{r.reason} — {r.by}</span><span className="ms-auto tabular-nums">{sar(r.amount)}</span></li>)}
      </Block>
      <Block title="طلباتي المفتوحة" rows={t.mine.length}>{t.mine.map((r: Row) => <Item key={r.id} r={r} onClick={() => (r.entity === "expense" ? openE(r.id) : openC(r.id))} />)}</Block>
    </div>
  );
}

export function SummaryTab({ orgId, me }: { orgId: string; me: PcMe }) {
  const [school, setSchool] = useState("");
  const q = useQuery({ queryKey: ["pc-summary", orgId, school], queryFn: async () => { const { data, error } = await db.rpc("pc_summary", { _org: orgId, _school: school || null, _from: null, _to: null }); if (error) throw error; return data as Row; } });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const s = q.data;
  const cards: [string, string][] = [["عهد مفتوحة", String(s.open)], ["متأخرة التسوية", String(s.overdue)], ["بانتظار اعتماد/صرف", String(s.awaiting)], ["إجمالي المصروف للعهد", sar(s.disbursed)], ["المعتمد صرفه", sar(s.spent)], ["قيد المراجعة", sar(s.pending)], ["الرصيد الدفتري المفتوح", sar(s.book)], ["المتاح للصرف", sar(s.available)]];
  const Table = ({ title, rows }: { title: string; rows: Row[] }) => !rows.length ? null : (
    <section className="space-y-2"><h3 className="font-semibold">{title}</h3>
      <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["الاسم", "عدد العهد", "المصروف لها", "المعتمد", "المعلّق", "الرصيد"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t"><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.count}</td><td className="px-3 py-2 tabular-nums">{sar(r.disbursed)}</td><td className="px-3 py-2 tabular-nums">{sar(r.spent)}</td><td className="px-3 py-2 tabular-nums">{sar(r.pending)}</td><td className="px-3 py-2 tabular-nums">{sar(r.book)}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
  return (
    <div className="space-y-4">
      {me.schools.length > 1 && <select className="h-9 rounded-md border bg-background px-2 text-sm" value={school} onChange={(e) => setSchool(e.target.value)} aria-label="الفرع"><option value="">كل الفروع ضمن نطاقك</option>{me.schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{cards.map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-lg font-bold tabular-nums">{v}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">الأرقام محسوبة من حركات العهد المعتمدة ضمن نطاق صلاحيتك فقط.</p>
      <Table title="حسب المستلم" rows={s.by_holder} />
      <Table title="حسب الفرع" rows={s.by_school} />
    </div>
  );
}

export function SettingsTab({ orgId, me }: { orgId: string; me: PcMe }) {
  const st = me.settings!;
  const [f, setF] = useState({ vat_rate: String(st.vat_rate), vat_inclusive: st.vat_inclusive, require_attachment: st.require_attachment, block_overdue: st.block_overdue, low_balance: String(st.low_balance) });
  const [cat, setCat] = useState("");
  const inv = useInvalidate();
  const log = useQuery({ queryKey: ["pc-settings-log", orgId], queryFn: async () => { const { data, error } = await db.rpc("pc_settings_log", { _org: orgId }); if (error) throw error; return data as Row[]; } });
  async function save() {
    const reason = await askText("سبب التغيير (يُحفظ في السجل)", { required: true }); if (!reason) return;
    const { error } = await db.rpc("pc_settings_save", { _org: orgId, _vat_rate: Number(f.vat_rate), _vat_inclusive: f.vat_inclusive, _require_attachment: f.require_attachment, _block_overdue: f.block_overdue, _low_balance: Number(f.low_balance), _rev: st.rev, _reason: reason });
    if (error) toast.error(arabicError(error)); else { toast.success("حُفظت الإعدادات — تسري على السجلات الجديدة فقط"); inv(); }
  }
  async function saveCat(id: string | null, name: string, archived: boolean) {
    const { error } = await db.rpc("pc_category_save", { _org: orgId, _id: id, _name: name, _archived: archived });
    if (error) toast.error(arabicError(error)); else { setCat(""); inv(); }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h3 className="font-semibold">إعدادات العهد والفواتير</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>نسبة ضريبة القيمة المضافة %</Label><Input inputMode="decimal" value={f.vat_rate} onChange={(e) => setF({ ...f, vat_rate: e.target.value })} /></div>
          <div><Label>تنبيه انخفاض الرصيد (ريال)</Label><Input inputMode="decimal" value={f.low_balance} onChange={(e) => setF({ ...f, low_balance: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.vat_inclusive} onChange={(e) => setF({ ...f, vat_inclusive: e.target.checked })} /> الإدخال الافتراضي شامل الضريبة</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.require_attachment} onChange={(e) => setF({ ...f, require_attachment: e.target.checked })} /> الفاتورة إلزامية (الاستثناء بسبب واعتماد مستقل)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.block_overdue} onChange={(e) => setF({ ...f, block_overdue: e.target.checked })} /> منع عهدة جديدة لمن لديه عهدة متأخرة إلا باستثناء</label>
        <p className="text-xs text-muted-foreground">العملة: الريال السعودي. تغيير النسبة لا يغيّر الفواتير المحفوظة.</p>
        <Button onClick={() => void save()}>حفظ</Button>
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h3 className="font-semibold">تصنيفات المصروفات</h3>
        <div className="flex gap-2"><Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="تصنيف جديد" /><Button disabled={cat.trim().length < 2} onClick={() => void saveCat(null, cat.trim(), false)}>إضافة</Button></div>
        <ul className="divide-y text-sm">{me.categories.map((c) => <li key={c.id} className="flex items-center justify-between py-1.5">{c.name}<Button size="sm" variant="ghost" onClick={() => void saveCat(c.id, c.name, true)}>أرشفة</Button></li>)}</ul>
      </section>
      <section className="space-y-2 rounded-2xl border bg-card p-5 lg:col-span-2">
        <h3 className="font-semibold">سجل تغييرات الإعدادات</h3>
        {!log.data?.length ? <p className="text-sm text-muted-foreground">لا تغييرات بعد.</p> : <ul className="space-y-1 text-sm">{log.data.map((l, i) => <li key={i}><span className="text-muted-foreground">{fmt(l.at)}</span> · {ACTION[l.action] ?? l.action} · {l.actor}{l.reason ? ` «${l.reason}»` : ""}</li>)}</ul>}
      </section>
    </div>
  );
}

export function CapsNote({ me }: { me: PcMe }) {
  const labels: Record<string, string> = { view: "عرض", create: "إنشاء", review: "مراجعة", approve: "اعتماد", disburse: "صرف", export: "تصدير", settings: "إعدادات" };
  const parts = Object.entries(labels).filter(([k]) => me.caps[k as keyof PcMe["caps"]]).map(([k, l]) => `${l} (${SCOPE_LABEL[me.caps[k as keyof PcMe["caps"]]!]})`);
  return <p className="text-xs text-muted-foreground">صلاحياتك: {parts.join("، ") || "لا شيء"}{me.caps.approve && me.limit != null ? ` · حد الاعتماد ${sar(me.limit)}` : ""}</p>;
}
