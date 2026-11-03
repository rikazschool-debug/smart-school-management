import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Pill } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { E_STATUS, sar, type PcMe, type Row } from "@/components/procurement/shared";

export const N_STATUS: Record<string, string> = { draft: "مسودة", awaiting_assignment: "بانتظار الإسناد", in_progress: "لدى مسؤول المشتريات", done: "منفّذ بالكامل", closed_partial: "مغلق بتنفيذ جزئي", cancelled: "ملغى" };
const N_TONE: Record<string, "muted" | "warn" | "ok" | "bad"> = { draft: "muted", awaiting_assignment: "warn", in_progress: "warn", done: "ok", closed_partial: "warn", cancelled: "muted" };
const qn = (v: unknown) => new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 2 }).format(Number(v ?? 0));

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw error;
  return data as Row;
}
function useNeedInvalidate() {
  const qc = useQueryClient();
  return () => { for (const k of ["pc-needs", "pc-need", "pc-tasks", "pc-my-needs"]) qc.invalidateQueries({ queryKey: [k] }); };
}

export function NeedList({ orgId, open, onNew }: { orgId: string; open: (id: string) => void; onNew: () => void }) {
  const [status, setStatus] = useState("");
  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("");
  const q = useQuery({ queryKey: ["pc-needs", orgId, status, term, from, to], queryFn: () => rpc("pc_need_list", { _org: orgId, _status: status || null, _limit: 100, _offset: 0, _q: term || null, _from: from || null, _to: to || null }) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const all = q.data.rows as Row[];
  const branches = [...new Set(all.map((r) => r.school ?? "—"))];
  const rows = branch ? all.filter((r) => (r.school ?? "—") === branch) : all;
  const groups = [...new Set(rows.map((r) => r.school ?? "—"))].map((b) => [b, rows.filter((r) => (r.school ?? "—") === b)] as const);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="بحث بالمرجع أو الغرض" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select aria-label="الحالة" className={selectCls("min-w-0")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>{Object.entries(N_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {branches.length > 1 && <select aria-label="الفرع" className={selectCls("min-w-0")} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">كل الفروع</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}</select>}
        <label className="text-xs">من<Input type="date" className="w-36" value={from} onChange={(e) => { setFrom(e.target.value);  }} /></label>
        <label className="text-xs">إلى<Input type="date" className="w-36" value={to} onChange={(e) => { setTo(e.target.value);  }} /></label>
        {q.data.can_create && <Button size="sm" className="ms-auto" onClick={onNew}><Plus className="size-4" />طلب احتياج</Button>}
      </div>
      <p className="text-xs text-muted-foreground">مدير المدرسة يكتب الاحتياج ويعتمده، فيصل إلى مسؤول المشتريات المرتبط بالمدرسة. اعتماد الفاتورة والصرف خطوة مستقلة لدى معتمد آخر.</p>
      {!rows.length ? <EmptyState title="لا توجد طلبات احتياج" hint="ستظهر هنا طلبات مدرستك أو المسندة إليك." /> : (
        <div className="space-y-4">{groups.map(([b, rs]) => (
        <section key={b} className="space-y-1"><h3 className="text-sm font-semibold">{b} <span className="text-xs font-normal text-muted-foreground">({rs.length})</span></h3>
        <ul className="divide-y rounded-xl border bg-card">
          {rs.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => open(r.id)} className="flex min-h-12 w-full flex-wrap items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted/40">
                <span className="font-mono text-xs">{r.ref}</span>
                <span className="min-w-0 flex-1 truncate">{r.purpose}<span className="block text-xs text-muted-foreground">{day(r.created_at)} · {r.creator ?? ""}{r.assigned_name ? ` · استلمه: ${r.assigned_name}` : " · لم يُستلم بعد"}</span></span>
                <span className="tabular-nums">{r.amount == null ? "" : sar(r.amount)}</span>
                <Pill tone={N_TONE[r.status] ?? "muted"}>{N_STATUS[r.status] ?? r.status}</Pill>
              </button>
            </li>
          ))}
        </ul></section>))}</div>
      )}
    </div>
  );
}

type NLine = { description: string; qty: string; unit_price: string; category_id: string };
export function NeedForm({ orgId, me, initial, onDone, onCancel }: { orgId: string; me: PcMe; initial?: Row; onDone: (id: string) => void; onCancel: () => void }) {
  const meta = useQuery({ queryKey: ["pc-needs", orgId, "meta"], queryFn: () => rpc("pc_need_list", { _org: orgId, _status: "draft", _limit: 1, _offset: 0 }) });
  const [school, setSchool] = useState<string>(initial?.school_id ?? "");
  const [purpose, setPurpose] = useState<string>(initial?.purpose ?? "");
  const [lines, setLines] = useState<NLine[]>(initial?.lines?.map((l: Row) => ({ description: l.description, qty: String(l.qty), unit_price: l.unit_price == null ? "" : String(l.unit_price), category_id: l.category_id ?? "" })) ?? [{ description: "", qty: "1", unit_price: "", category_id: "" }]);
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const inv = useNeedInvalidate();
  const schools = (meta.data?.schools ?? []) as { id: string; name: string }[];
  const sch = school || schools[0]?.id || "";
  const est = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  const upd = (i: number, k: keyof NLine, v: string) => setLines(lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function save() {
    setBusy(true);
    try {
      const id = await rpc("pc_need_save", { _org: orgId, _id: initial?.id ?? null, _rev: initial?.rev ?? 0, _key: initial ? null : key,
        _d: { school_id: sch, purpose, lines: lines.map((l) => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price === "" ? null : Number(l.unit_price), category_id: l.category_id || null })) } });
      toast.success("حُفظ طلب الاحتياج — راجعه ثم اعتمده"); inv(); onDone(id as string);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  if (meta.isLoading) return <LoadingState />;
  return (
    <div className="max-w-3xl space-y-4 rounded-2xl border bg-card p-5">
      <h2 className="font-bold">{initial ? `تعديل ${initial.ref}` : "طلب احتياج جديد"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {!initial && <div><Label>المدرسة</Label><select className={selectCls()} value={sch} onChange={(e) => setSchool(e.target.value)}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        <div className={initial ? "sm:col-span-2" : ""}><Label htmlFor="need-purpose">الغرض</Label><Input id="need-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="مثل: قرطاسية الفصل الثاني" /></div>
      </div>
      <div className="space-y-2">
        <Label>البنود المطلوبة</Label>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:flex sm:flex-wrap sm:items-center sm:border-0 sm:p-0">
            <Input aria-label={`وصف البند ${i + 1}`} className="col-span-2 sm:min-w-40 sm:flex-1" placeholder="الصنف" value={l.description} onChange={(e) => upd(i, "description", e.target.value)} />
            <Input aria-label={`كمية البند ${i + 1}`} className="sm:w-24" inputMode="decimal" placeholder="الكمية" value={l.qty} onChange={(e) => upd(i, "qty", e.target.value)} />
            <Input aria-label={`السعر التقديري للبند ${i + 1}`} className="sm:w-28" inputMode="decimal" placeholder="سعر تقديري" value={l.unit_price} onChange={(e) => upd(i, "unit_price", e.target.value)} />
            {me.categories.length > 0 && <select aria-label={`تصنيف البند ${i + 1}`} className={selectCls("col-span-2 sm:col-span-1 sm:w-40")} value={l.category_id} onChange={(e) => upd(i, "category_id", e.target.value)}><option value="">بلا تصنيف</option>{me.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            {lines.length > 1 && <Button size="icon" variant="ghost" aria-label="حذف البند" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}
          </div>
        ))}
        {lines.length < 50 && <Button size="sm" variant="outline" onClick={() => setLines([...lines, { description: "", qty: "1", unit_price: "", category_id: "" }])}><Plus className="size-4" />بند</Button>}
        <p className="rounded-lg bg-muted/50 p-2 text-sm">التقدير: <b className="tabular-nums">{sar(est)}</b> <span className="text-xs text-muted-foreground">(للاسترشاد — المبلغ الفعلي من الفواتير)</span></p>
      </div>
      <div className="flex gap-2"><Button disabled={busy || !sch} onClick={() => void save()}>حفظ</Button><Button variant="ghost" onClick={onCancel}>إلغاء</Button></div>
    </div>
  );
}

export function NeedDetail({ id, me, back, edit, openExpense, newInvoice }: { id: string; me: PcMe; back: () => void; edit: (r: Row) => void; openExpense: (id: string) => void; newInvoice: (needId: string) => void }) {
  const q = useQuery({ queryKey: ["pc-need", id], queryFn: () => rpc("pc_need_get", { _id: id }) });
  const inv = useNeedInvalidate();
  const [to, setTo] = useState("");
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const r = q.data;
  const can = r.can as { edit: boolean; approve: boolean; assign: boolean; claim: boolean; invoice: boolean; close: boolean; cancel: boolean };
  async function act(action: string, ask: string | null, required: boolean, user: string | null = null) {
    let reason: string | null = null;
    if (ask) { reason = await askText(ask, { required }); if (reason === null) return; }
    try { await rpc("pc_need_action", { _id: id, _action: action, _rev: r.rev, _reason: reason, _user: user }); toast.success("تم"); inv(); }
    catch (e) { toast.error(arabicError(e)); }
  }
  const partial = (r.lines as Row[]).some((l) => Number(l.approved) < Number(l.qty));
  return (
    <div className="space-y-4">
      <button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />طلبات الاحتياج</button>
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{r.ref}</span><h2 className="font-bold">{r.purpose}</h2><Pill tone={N_TONE[r.status] ?? "muted"}>{N_STATUS[r.status] ?? r.status}</Pill></div>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted-foreground">المدرسة: </dt><dd className="inline">{r.school}</dd></div>
          <div><dt className="inline text-muted-foreground">طلبه: </dt><dd className="inline">{r.creator}</dd></div>
          <div><dt className="inline text-muted-foreground">اعتمد الاحتياج: </dt><dd className="inline">{r.approver_name ?? "—"}</dd></div>
          <div><dt className="inline text-muted-foreground">مسؤول المشتريات: </dt><dd className="inline">{r.assigned_name ?? (r.status === "awaiting_assignment" ? (r.officers_count ? "لم يُسند بعد" : "لا يوجد مسؤول مخوّل للفرع") : "—")}</dd></div>
          <div><dt className="inline text-muted-foreground">التقدير: </dt><dd className="inline tabular-nums">{r.amount == null ? "—" : sar(r.amount)}</dd></div>
          {r.close_note && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">سبب الإغلاق: </dt><dd className="inline">{r.close_note}</dd></div>}
        </dl>
        {r.status === "awaiting_assignment" && <p className="rounded-lg bg-secondary/60 p-2 text-xs">بانتظار الإسناد: أُخطر مالك المؤسسة{r.officers_count ? "، ويمكن لمسؤول مشتريات مخوّل للفرع استلامه" : "؛ امنح شخصًا دور «مسؤول مشتريات» لهذا الفرع من صفحة الصلاحيات"}.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {can.edit && <Button size="sm" variant="outline" onClick={() => edit(r)}>تعديل</Button>}
          {can.approve && <Button size="sm" onClick={() => void act("approve", "ملاحظة الاعتماد (اختياري)", false)}>اعتماد الاحتياج وإرساله</Button>}
          {can.claim && <Button size="sm" onClick={() => void act("assign", null, false, me.me)}>استلام الطلب</Button>}
          {can.invoice && <Button size="sm" onClick={() => newInvoice(id)}>تسجيل فاتورة شراء</Button>}
          {can.close && <Button size="sm" variant="outline" onClick={() => void act("close", partial ? "تنفيذ جزئي — سبب الإغلاق" : "ملاحظة الإغلاق (اختياري)", partial)}>إغلاق الطلب</Button>}
          {can.cancel && <Button size="sm" variant="ghost" onClick={() => void act("cancel", "سبب الإلغاء", true)}>إلغاء</Button>}
        </div>
        {can.assign && (r.officers as Row[]).length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="min-w-0 flex-1"><Label>إسناد إلى مسؤول مشتريات</Label>
              <select className={selectCls()} value={to} onChange={(e) => setTo(e.target.value)}><option value="">— اختر —</option>{(r.officers as Row[]).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            <Button size="sm" disabled={!to} onClick={() => void act("assign", r.assigned_to ? "سبب إعادة الإسناد" : "ملاحظة (اختياري)", !!r.assigned_to, to)}>إسناد</Button>
          </div>
        )}
      </div>
      <section className="space-y-2">
        <h3 className="font-semibold">البنود والمتبقي</h3>
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {(r.lines as Row[]).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
              <span className="min-w-0 flex-1 font-semibold">{l.description}{l.category && <span className="ms-2 text-xs font-normal text-muted-foreground">{l.category}</span>}</span>
              <span className="text-xs">المطلوب {qn(l.qty)}</span>
              <span className="text-xs">في فواتير {qn(l.committed)}</span>
              <span className="text-xs">معتمد {qn(l.approved)}</span>
              <span className={`text-xs font-semibold ${Number(l.remaining) > 0 ? "text-primary" : "text-muted-foreground"}`}>المتبقي {qn(l.remaining)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">صُرف {sar(l.spent)}{l.unit_price != null ? ` من تقدير ${sar(Number(l.qty) * Number(l.unit_price))}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">فواتير الشراء المرتبطة</h3>
        {!(r.expenses as Row[]).length ? <p className="text-sm text-muted-foreground">لا فواتير بعد.</p> : (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {(r.expenses as Row[]).map((e) => (
              <li key={e.id}><button type="button" onClick={() => openExpense(e.id)} className="flex w-full items-center gap-2 p-3 text-start hover:bg-muted/40" disabled={!me.caps.view}>
                <span className="font-mono text-xs">{e.ref}</span><span className="min-w-0 flex-1 truncate">{e.supplier}</span><span className="tabular-nums">{sar(e.total)}</span><Pill tone={e.status === "approved" ? "ok" : "warn"}>{E_STATUS[e.status] ?? e.status}</Pill>
              </button></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Needs assigned to me and in progress — used by the invoice form to link lines. */
export function useMyNeeds(orgId: string) {
  return useQuery({
    queryKey: ["pc-my-needs", orgId],
    queryFn: async () => {
      const list = await rpc("pc_need_list", { _org: orgId, _status: "in_progress", _limit: 100, _offset: 0 });
      const mine = (list.rows as Row[]).filter((r) => r.mine);
      return Promise.all(mine.map((r) => rpc("pc_need_get", { _id: r.id })));
    },
  });
}
