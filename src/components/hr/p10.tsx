import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

// P10 screens: employee address, hourly permissions (employee → direct manager → HR), opening balances.
// Every rule (scope, masking, overlaps, totals, maker ≠ approver) is enforced by the server RPCs.

/* ---------------- address ---------------- */
type Addr = { city: string | null; district?: string | null; street?: string | null; building?: string | null; postal_code?: string | null; details?: string | null; masked: boolean; updated_at: string };
const ADDR_F = [["city", "المدينة"], ["district", "الحي"], ["street", "الشارع"], ["building", "رقم المبنى"], ["postal_code", "الرمز البريدي"], ["details", "تفاصيل إضافية"]] as const;
export function AddressCard({ emp }: { emp: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-addr", emp], queryFn: () => rpc<{ address: Addr | null; can_edit: boolean }>("hr_address_get", { _emp: emp }) });
  const [f, setF] = useState<Record<string, string> | null>(null);
  const save = useMutation({
    mutationFn: async (v: Record<string, string>) => {
      let reason: string | null = null;
      if (q.data?.address) { reason = await askText("سبب تعديل العنوان", { required: true, ok: "حفظ" }); if (!reason) throw new Error("أُلغي"); }
      return rpc("hr_address_save", { _emp: emp, _p: v, _reason: reason });
    },
    onSuccess: () => { toast.success("حُفظ العنوان"); setF(null); qc.invalidateQueries({ queryKey: ["hr-addr", emp] }); },
    onError: (e) => { if ((e as Error).message !== "أُلغي") toast.error(arabicError(e)); },
  });
  if (q.isLoading) return <LoadingState rows={1} />;
  if (q.error) return null;
  const a = q.data!.address;
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2"><p className="flex-1 font-bold">العنوان</p>
        {q.data!.can_edit && !f && <Button size="sm" variant="outline" onClick={() => setF(Object.fromEntries(ADDR_F.map(([k]) => [k, (a?.[k] as string) ?? ""])))}>{a ? "تعديل العنوان" : "إضافة عنوان"}</Button>}</div>
      {f ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {ADDR_F.map(([k, l]) => <div key={k} className={k === "details" ? "sm:col-span-3" : ""}><Label htmlFor={"ad-" + k}>{l}</Label><Input id={"ad-" + k} className="mt-1" dir={k === "postal_code" || k === "building" ? "ltr" : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
          <div className="flex gap-2 sm:col-span-3"><Button disabled={save.isPending} onClick={() => save.mutate(f)}>{save.isPending ? "…" : "حفظ"}</Button><Button variant="ghost" onClick={() => setF(null)}>إلغاء</Button></div>
          <p className="text-xs text-muted-foreground sm:col-span-3">العنوان اختياري ويُستخدم للتواصل الرسمي فقط. لا يراه إلا من له صلاحية البيانات الحساسة؛ يرى غيرهم المدينة فقط. يُسجَّل في السجل أي الحقول تغيّرت دون قيمها.</p>
        </div>
      ) : !a ? <p className="text-muted-foreground">لا يوجد عنوان مسجّل.</p> : (
        <p>{a.masked ? <>{a.city} <span className="text-xs text-muted-foreground">(التفاصيل محجوبة لصلاحيتك)</span></> : [a.city, a.district, a.street, a.building && `مبنى ${a.building}`, a.postal_code && `ص.ب ${a.postal_code}`, a.details].filter(Boolean).join("، ")}</p>
      )}
    </div>
  );
}

/* ---------------- hourly permissions ---------------- */
export type PermRow = { id: string; employee: string; employee_no: string; school: string | null; kind: string; kind_label: string; date_from: string; date_to: string | null; time_from: string | null; time_to: string | null; minutes: number | null; reason: string; status: string; rev: number; requested_at: string; manager: string | null; manager_by: string | null; hr_by: string | null; decision_reason: string | null; can: { decide: boolean; cancel: boolean } };
export const PM_KIND: [string, string][] = [["late_arrival", "تأخر صباحي"], ["early_exit", "خروج مبكر"], ["out_return", "خروج وعودة"], ["mission", "مهمة رسمية"], ["absence", "غياب بعذر"]];
export const PM_STATUS: Record<string, string> = { pending_manager: "بانتظار المدير المباشر", pending_hr: "بانتظار الموارد البشرية", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى" };
const mins = (m: number | null) => m == null ? "" : m >= 60 ? `${Math.floor(m / 60)} س ${m % 60 ? (m % 60) + " د" : ""}` : `${m} د`;
function when(r: PermRow) {
  const t = (x: string | null) => x ? <bdi dir="ltr">{x}</bdi> : null;
  if (r.kind === "absence") return <><bdi dir="ltr">{r.date_from}</bdi>{r.date_to && r.date_to !== r.date_from && <> ← <bdi dir="ltr">{r.date_to}</bdi></>}</>;
  if (r.kind === "mission") return <><bdi dir="ltr">{r.date_from}</bdi> {t(r.time_from)} ← {r.date_to && r.date_to !== r.date_from && <bdi dir="ltr">{r.date_to} </bdi>}{t(r.time_to)}</>;
  if (r.kind === "early_exit") return <><bdi dir="ltr">{r.date_from}</bdi> · من {t(r.time_from)}</>;
  return <><bdi dir="ltr">{r.date_from}</bdi> · {t(r.time_from)} ← {t(r.time_to)}</>;
}
export function PermCard({ r, onDecide, onCancel, busy }: { r: PermRow; onDecide?: (d: "approve" | "reject") => void; onCancel?: () => void; busy?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <span className="flex flex-wrap items-center gap-2"><b className="flex-1">{r.kind_label}{onDecide && <span className="font-normal text-muted-foreground"> — {r.employee}</span>}</b>
        <span className={"rounded-full px-2 py-0.5 text-xs " + (r.status === "approved" ? "bg-success/15 text-success" : r.status === "rejected" ? "bg-destructive/10 text-destructive" : r.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-warning/15")}>{PM_STATUS[r.status]}</span></span>
      <span className="block text-xs text-muted-foreground">{when(r)}{r.minutes != null && <> · {mins(r.minutes)}</>}{r.school && <> · {r.school}</>}</span>
      <span className="mt-1 block">{r.reason}</span>
      {(r.manager_by || r.hr_by) && <span className="block text-xs text-muted-foreground">{[r.manager_by && `المدير: ${r.manager_by}`, r.hr_by && `الموارد البشرية: ${r.hr_by}`].filter(Boolean).join(" · ")}</span>}
      {r.decision_reason && <span className="block text-xs text-destructive">السبب: {r.decision_reason}</span>}
      {(r.can.decide && onDecide) || (r.can.cancel && onCancel) ? (
        <span className="mt-2 flex gap-2">
          {r.can.decide && onDecide && <><Button size="sm" disabled={busy} onClick={() => onDecide("approve")}>موافقة</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide("reject")}>رفض</Button></>}
          {r.can.cancel && onCancel && <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>إلغاء الطلب</Button>}
        </span>
      ) : null}
    </div>
  );
}

export function MyPermissions({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-pm-my", org], queryFn: () => rpc<{ active: boolean; items: PermRow[] }>("hr_perm_my", { _org: org }) });
  const blank = { kind: "late_arrival", date_from: "", date_to: "", time_from: "", time_to: "", reason: "" };
  const [f, setF] = useState<typeof blank | null>(null);
  const send = useMutation({
    mutationFn: (v: typeof blank) => rpc("hr_perm_request", { _org: org, _p: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")) }),
    onSuccess: () => { toast.success("أُرسل الطلب إلى مديرك المباشر"); setF(null); qc.invalidateQueries({ queryKey: ["hr-pm-my"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const cancel = useMutation({
    mutationFn: (r: PermRow) => rpc("hr_perm_cancel", { _id: r.id, _rev: r.rev }),
    onSuccess: () => { toast.success("أُلغي الطلب"); qc.invalidateQueries({ queryKey: ["hr-pm-my"] }); },
    onError: (e) => { toast.error(arabicError(e)); qc.invalidateQueries({ queryKey: ["hr-pm-my"] }); },
  });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data!.active) return <EmptyState title="لا يوجد ملف وظيفي نشط لك" />;
  const k = f?.kind;
  return (
    <Section title="استئذاناتي" desc="تأخر صباحي، خروج مبكر، خروج وعودة، مهمة رسمية، أو غياب بعذر. يوافق مديرك المباشر ثم تعتمد الموارد البشرية. لا أثر ماليًا للاستئذان هنا."
      action={!f ? <Button size="sm" onClick={() => setF(blank)}>طلب استئذان</Button> : undefined}>
      {f && (
        <div className="mb-4 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><Label htmlFor="pm-k">النوع</Label><select id="pm-k" className={selectCls("mt-1 w-full")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{PM_KIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><Label htmlFor="pm-d">{k === "absence" || k === "mission" ? "من تاريخ" : "التاريخ"}</Label><Input id="pm-d" type="date" className="mt-1" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></div>
          {k !== "absence" && <div><Label htmlFor="pm-t1">{k === "early_exit" ? "ساعة الخروج" : "من الساعة"}</Label><Input id="pm-t1" type="time" className="mt-1" value={f.time_from} onChange={(e) => setF({ ...f, time_from: e.target.value })} /></div>}
          {(k === "absence" || k === "mission") && <div><Label htmlFor="pm-d2">إلى تاريخ{k === "absence" ? " (اختياري)" : ""}</Label><Input id="pm-d2" type="date" className="mt-1" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></div>}
          {k !== "absence" && k !== "early_exit" && <div><Label htmlFor="pm-t2">{k === "late_arrival" ? "ساعة الوصول" : k === "out_return" ? "ساعة العودة" : "إلى الساعة"}</Label><Input id="pm-t2" type="time" className="mt-1" value={f.time_to} onChange={(e) => setF({ ...f, time_to: e.target.value })} /></div>}
          <div className="sm:col-span-2 lg:col-span-3"><Label htmlFor="pm-r">السبب</Label><Input id="pm-r" className="mt-1" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button disabled={send.isPending || !f.date_from || f.reason.trim().length < 3} onClick={() => send.mutate(f)}>{send.isPending ? "…" : "إرسال"}</Button><Button variant="ghost" onClick={() => setF(null)}>إلغاء</Button></div>
        </div>
      )}
      {!q.data!.items.length ? <EmptyState title="لا توجد طلبات استئذان" /> : (
        <ul className="grid gap-2 md:grid-cols-2">{q.data!.items.map((r) => <li key={r.id}><PermCard r={r} busy={cancel.isPending} onCancel={async () => { if (await ask("إلغاء طلب الاستئذان؟", { ok: "إلغاء الطلب" })) cancel.mutate(r); }} /></li>)}</ul>
      )}
    </Section>
  );
}

export function PermQueue({ org, team }: { org: string; team?: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(team ? "" : "pending_hr");
  const [kind, setKind] = useState("");
  const q = useQuery({ queryKey: ["hr-pm-list", org, team, status, kind], queryFn: () => rpc<PermRow[]>("hr_perm_list", { _org: org, _f: { ...(team ? { team: true } : {}), ...(status ? { status } : {}), ...(kind ? { kind } : {}) } }) });
  const decide = useMutation({
    mutationFn: async ({ r, d }: { r: PermRow; d: "approve" | "reject" }) => {
      let reason: string | null = null;
      if (d === "reject") { reason = await askText("سبب الرفض", { required: true, ok: "رفض" }); if (!reason) throw new Error("أُلغي"); }
      else if (!(await ask(`الموافقة على «${r.kind_label}» لـ ${r.employee}؟`, { ok: "موافقة" }))) throw new Error("أُلغي");
      return rpc("hr_perm_decide", { _id: r.id, _rev: r.rev, _decision: d, _reason: reason });
    },
    onSuccess: () => { toast.success("سُجّل القرار"); qc.invalidateQueries({ queryKey: ["hr-pm-list"] }); },
    onError: (e) => { if ((e as Error).message !== "أُلغي") toast.error(arabicError(e)); qc.invalidateQueries({ queryKey: ["hr-pm-list"] }); },
  });
  const rows = q.data ?? [];
  return (
    <Section title={team ? "استئذانات فريقي" : "طلبات الاستئذان"} desc={team ? "موافقتك تحيل الطلب إلى الموارد البشرية." : "تعتمد الموارد البشرية بعد موافقة المدير المباشر. القائمة ضمن نطاق صلاحيتك فقط."}
      action={<span className="flex flex-wrap gap-2">
        <select aria-label="الحالة" className={selectCls("w-44")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(PM_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="النوع" className={selectCls("w-36")} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الأنواع</option>{PM_KIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </span>}>
      {q.isLoading ? <LoadingState rows={2} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title="لا توجد طلبات" /> : (
        <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => <li key={r.id}><PermCard r={r} busy={decide.isPending} onDecide={(d) => decide.mutate({ r, d })} /></li>)}</ul>
      )}
    </Section>
  );
}

/* ---------------- opening balances ---------------- */
type PreviewRow = { i: number; employee_no: string; employee: string | null; school: string | null; status: "ok" | "dup" | "error"; errors: string[]; type?: string; year?: number; days?: number; amount?: number; remaining?: number; installment_amount?: number; start_month?: string };
type Preview = { rows: PreviewRow[]; input_rows: number; ok: number; errors: number; duplicates: number; total: number; by_school: Record<string, { rows: number; total: number }> };
type Batch = { id: string; kind: string; title: string; source_ref: string; source_rows: number; source_total: number; row_count: number; skipped: number; total: number; by_school: Record<string, { rows: number; total: number }>; status: string; rev: number; prepared_by: string; prepared_at: string; approved_by: string | null; approved_at: string | null; cancel_reason: string | null; matches: boolean; rows: PreviewRow[]; can: { approve: boolean; cancel: boolean } };
const COLS = {
  leave: [["employee_no", "الرقم الوظيفي"], ["type", "نوع الإجازة"], ["year", "السنة"], ["days", "الرصيد الافتتاحي (أيام)"]],
  advance: [["employee_no", "الرقم الوظيفي"], ["amount", "مبلغ السلفة الأصلي"], ["remaining", "المتبقي"], ["installment_amount", "قيمة القسط"], ["start_month", "شهر بداية الاستقطاع (YYYY-MM)"]],
} as const;
const B_STATUS: Record<string, string> = { draft: "بانتظار الاعتماد", approved: "معتمدة", cancelled: "ملغاة" };
const num = (v: unknown) => typeof v === "number" ? v : String(v ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,\s]/g, "");

export function OpeningBalances({ org, kind }: { org: string; kind: "leave" | "advance" }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [meta, setMeta] = useState({ title: "", source_ref: "", source_rows: "", source_total: "" });
  const list = useQuery({ queryKey: ["hr-open", org, kind], queryFn: () => rpc<Batch[]>("hr_open_list", { _org: org, _kind: kind }) });
  const [open, setOpen] = useState<string | null>(null);
  const cols = COLS[kind];
  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c[1]), kind === "leave" ? ["E-001", "سنوية", new Date().getFullYear(), 21] : ["E-001", 6000, 4000, 1000, ""]]);
    ws["!cols"] = cols.map(() => ({ wch: 24 })); const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "الأرصدة"); XLSX.writeFile(wb, kind === "leave" ? "قالب-أرصدة-الإجازات.xlsx" : "قالب-أرصدة-السلف.xlsx");
  };
  const preview = useMutation({
    mutationFn: (r: Record<string, unknown>[]) => rpc<Preview>("hr_open_preview", { _org: org, _kind: kind, _rows: r }),
    onSuccess: (d) => setPv(d), onError: (e) => toast.error(arabicError(e)),
  });
  const read = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) return toast.error("الحد الأقصى لحجم الملف 5 ميجابايت");
    let wb: XLSX.WorkBook; try { wb = XLSX.read(await f.arrayBuffer()); } catch { return toast.error("تعذّر قراءة الملف"); }
    const a = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false, defval: "" });
    const head = (a[0] ?? []).map((h) => String(h).trim());
    const idx = cols.map(([, l]) => head.findIndex((h) => h === l));
    if (idx.some((i) => i < 0)) return toast.error("أعمدة الملف لا تطابق القالب؛ نزّل القالب واستخدمه");
    const r = a.slice(1).filter((row) => row.some((c) => String(c).trim() !== "")).map((row, n) => Object.fromEntries([["i", n + 2], ...cols.map(([k], j) => [k, k === "employee_no" || k === "type" || k === "start_month" ? String(row[idx[j]!] ?? "").trim() : num(row[idx[j]!])])]));
    if (!r.length) return toast.error("الملف بلا صفوف");
    setRows(r); setPv(null); setMeta({ title: "", source_ref: f.name, source_rows: String(r.length), source_total: "" }); preview.mutate(r); return undefined;
  };
  const save = useMutation({
    mutationFn: () => rpc<string>("hr_open_save", { _org: org, _kind: kind, _p: { title: meta.title, source_ref: meta.source_ref, source_rows: Number(meta.source_rows), source_total: Number(num(meta.source_total)), rows } }),
    onSuccess: () => { toast.success("حُفظت الدفعة؛ يعتمدها شخص آخر"); setRows(null); setPv(null); qc.invalidateQueries({ queryKey: ["hr-open"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const act = useMutation({
    mutationFn: async ({ b, a }: { b: Batch; a: "approve" | "cancel" }) => {
      if (a === "approve") { if (!(await ask(`اعتماد «${b.title}»؟ تُسجّل ${b.row_count} حركة افتتاحية لا تُعدّل بعد ذلك.`, { ok: "اعتماد" }))) throw new Error("أُلغي"); return rpc("hr_open_approve", { _id: b.id, _rev: b.rev }); }
      const r = await askText("سبب إلغاء الدفعة", { required: true, ok: "إلغاء الدفعة" }); if (!r) throw new Error("أُلغي");
      return rpc("hr_open_cancel", { _id: b.id, _rev: b.rev, _reason: r });
    },
    onSuccess: () => { toast.success("تم"); qc.invalidateQueries({ queryKey: ["hr-open"] }); },
    onError: (e) => { if ((e as Error).message !== "أُلغي") toast.error(arabicError(e)); qc.invalidateQueries({ queryKey: ["hr-open"] }); },
  });
  const unit = kind === "leave" ? "يوم" : "ريال";
  const val = (r: PreviewRow) => kind === "leave" ? `${r.type ?? "—"} ${r.year ?? ""} · ${r.days ?? "—"} يوم` : `أصل ${r.amount ?? "—"} · متبقٍ ${r.remaining ?? "—"} · قسط ${r.installment_amount ?? "—"} · من ${r.start_month?.slice(0, 7) ?? "—"}`;
  const LBL = { ok: "جديد", dup: "مسجّل سابقًا — يُتجاوز", error: "خطأ" };
  return (
    <div className="space-y-5">
      <Section title={kind === "leave" ? "ترحيل أرصدة الإجازات" : "ترحيل السلف القائمة"} desc={kind === "leave" ? "رصيد افتتاحي لكل موظف ونوع وسنة، يُضاف حركة «افتتاحي» لا تُعدّل. التصحيح لاحقًا بتسوية مسببة." : "سلفة قائمة صُرفت في النظام السابق: يُسجَّل أصلها ومتبقيها فقط ويبدأ الاستقطاع من الشهر المحدد عبر مسير الرواتب. لا يُصرف أي مبلغ جديد."}
        action={<span className="flex gap-2"><Button size="sm" variant="outline" onClick={template}><Download className="size-4" />القالب</Button><Button size="sm" onClick={() => file.current?.click()}><Upload className="size-4" />رفع ملف</Button></span>}>
        <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="ملف الأرصدة" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
        {preview.isPending && <LoadingState rows={2} />}
        {pv && (
          <div className="space-y-3">
            <dl className="grid gap-2 text-sm sm:grid-cols-5">
              {[["صفوف الملف", pv.input_rows], ["جديد", pv.ok], ["مسجّل سابقًا", pv.duplicates], ["أخطاء", pv.errors], [`الإجمالي الجديد (${unit})`, pv.total]].map(([l, v]) => <div key={l as string} className="rounded-lg bg-secondary/40 p-2"><dt className="text-xs text-muted-foreground">{l}</dt><dd className="text-lg font-bold">{v}</dd></div>)}
            </dl>
            {Object.keys(pv.by_school).length > 0 && <p className="text-xs text-muted-foreground">حسب المدرسة: {Object.entries(pv.by_school).map(([s, v]) => `${s}: ${v.rows} صف / ${v.total} ${unit}`).join(" · ")}</p>}
            <div className="max-h-80 overflow-auto rounded-lg border">
              <table className="w-full text-sm"><thead className="sticky top-0 bg-secondary"><tr><th className="p-2 text-start">الصف</th><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القيم</th><th className="p-2 text-start">النتيجة</th></tr></thead>
                <tbody>{pv.rows.map((r) => <tr key={r.i} className={"border-t " + (r.status === "error" ? "bg-destructive/5" : r.status === "dup" ? "opacity-70" : "")}><td className="p-2">{r.i}</td><td className="p-2"><bdi dir="ltr">{r.employee_no}</bdi> {r.employee}</td><td className="p-2 text-xs">{val(r)}</td><td className="p-2 text-xs">{LBL[r.status]}{r.errors.length > 0 && <span className="block text-destructive">{r.errors.join("، ")}</span>}</td></tr>)}</tbody></table>
            </div>
            {pv.errors > 0 ? <p className="rounded bg-destructive/10 p-2 text-sm text-destructive">صحّح الأخطاء في الملف ثم ارفعه مرة أخرى؛ لا تُحفظ دفعة فيها أخطاء.</p> : pv.ok === 0 ? <p className="rounded bg-secondary p-2 text-sm">كل الصفوف مسجّلة سابقًا؛ لا جديد للحفظ.</p> : (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><Label htmlFor="ob-t">اسم الدفعة</Label><Input id="ob-t" className="mt-1" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></div>
                <div><Label htmlFor="ob-s">مرجع المصدر</Label><Input id="ob-s" className="mt-1" value={meta.source_ref} onChange={(e) => setMeta({ ...meta, source_ref: e.target.value })} /></div>
                <div><Label htmlFor="ob-n">عدد صفوف المصدر</Label><Input id="ob-n" className="mt-1" dir="ltr" value={meta.source_rows} onChange={(e) => setMeta({ ...meta, source_rows: e.target.value })} /></div>
                <div><Label htmlFor="ob-m">إجمالي المصدر ({unit})</Label><Input id="ob-m" className="mt-1" dir="ltr" placeholder="من النظام السابق" value={meta.source_total} onChange={(e) => setMeta({ ...meta, source_total: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">اكتب إجمالي المصدر كما في النظام السابق (لا تنسخه من هنا). لا يُعتمد إلا إذا طابق الإجمالي المحسوب، ويعتمده شخص غير من أعدّه.</p>
                <div className="sm:col-span-2 lg:col-span-4"><Button disabled={save.isPending || meta.title.trim().length < 3 || !meta.source_total} onClick={() => save.mutate()}>{save.isPending ? "…" : "حفظ الدفعة للاعتماد"}</Button></div>
              </div>
            )}
          </div>
        )}
      </Section>
      <Section title="الدفعات">
        {list.isLoading ? <LoadingState rows={2} /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data!.length ? <EmptyState title="لا توجد دفعات" /> : (
          <ul className="space-y-2">{list.data!.map((b) => (
            <li key={b.id} className="rounded-xl border bg-card p-3 text-sm">
              <span className="flex flex-wrap items-center gap-2"><b className="flex-1">{b.title}</b><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{B_STATUS[b.status]}</span>
                <span className={"rounded-full px-2 py-0.5 text-xs " + (b.matches ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}>{b.matches ? "يطابق المصدر" : "لا يطابق المصدر"}</span></span>
              <span className="block text-xs text-muted-foreground">{b.source_ref} · {b.row_count} صف جديد{b.skipped ? ` + ${b.skipped} مسجّل سابقًا` : ""} من {b.source_rows} · الإجمالي {b.total} / المصدر {b.source_total} {unit}</span>
              <span className="block text-xs text-muted-foreground">أعدّها {b.prepared_by}{b.approved_by && ` · اعتمدها ${b.approved_by}`}{b.cancel_reason && ` · سبب الإلغاء: ${b.cancel_reason}`}</span>
              <span className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? "إخفاء الصفوف" : "الصفوف"}</Button>
                {b.can.approve && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ b, a: "approve" })}>اعتماد</Button>}
                {b.can.cancel && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ b, a: "cancel" })}>إلغاء</Button>}
              </span>
              {open === b.id && <ul className="mt-2 space-y-1 text-xs">{b.rows.map((r) => <li key={r.i} className="rounded bg-secondary/40 p-2"><bdi dir="ltr">{r.employee_no}</bdi> {r.employee} — {val(r)}</li>)}</ul>}
            </li>))}</ul>
        )}
      </Section>
    </div>
  );
}
