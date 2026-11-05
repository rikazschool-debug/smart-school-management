// HR letters: shared types, status labels, detail panel (staff + self) and print/PDF.
// All data comes from hr_letter_* RPCs; the server decides what text (incl. pay) is sent.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

export type LetterCan = { review: boolean; issue: boolean; edit: boolean; cancel: boolean; reissue: boolean };
export type LetterRow = {
  id: string; employee_id: string; employee: string; employee_no: string; school: string | null; template_id: string; template: string; kind: string; template_version: number;
  needs_review: boolean; has_comp: boolean; status: string; rev: number; purpose: string | null; addressee: string | null; requested_by: string | null; requested_at: string; mine_request: boolean;
  reviewed_by: string | null; reviewed_at: string | null; decision_reason: string | null; ref_no: string | null; issued_by: string | null; issued_at: string | null;
  cancel_reason: string | null; cancelled_at: string | null; parent_id: string | null; parent_ref: string | null; children: { id: string; ref_no: string | null; status: string }[];
  org_name: string; body?: string | null; body_hidden?: boolean; can: LetterCan; events?: { at: string; action: string; reason: string | null; by: string }[] | null;
};
export type LetterTpl = { id: string; name: string; kind: string; version: number; needs_review: boolean; employee_request: boolean; has_comp: boolean; is_active: boolean; updated_at: string; body: string | null };
export type LetterVar = { key: string; label: string; comp?: boolean };

export const L_STATUS: Record<string, string> = {
  requested: "بانتظار المراجعة", approved: "معتمد — بانتظار الإصدار", returned: "أُعيد للتعديل", rejected: "مرفوض",
  issued: "صادر", cancelled: "ملغى", superseded: "استُبدل بتصحيح",
};
export const L_KIND: Record<string, string> = { employment: "تعريف بالعمل", salary: "تعريف بالراتب", experience: "شهادة خبرة", other: "أخرى" };
const EVENT: Record<string, string> = { request: "تقديم الطلب", resubmit: "تعديل وإعادة إرسال", "review:approve": "اعتماد", "review:return": "إرجاع للتعديل", "review:reject": "رفض", issue: "إصدار", cancel: "إلغاء", reissue: "طلب تصحيح/إعادة إصدار", open: "فتح الخطاب" };
const dt = (s: string | null | undefined) => (s ? s.slice(0, 16).replace("T", " ") : "");

export function LetterStatus({ s }: { s: string }) {
  const cls = s === "issued" ? "bg-success/10 text-success" : s === "requested" || s === "approved" ? "bg-warning/10 text-warning" : s === "returned" || s === "rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={"rounded px-1.5 text-xs " + cls}>{L_STATUS[s] ?? s}</span>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Opens the frozen letter text in a print window (browser «حفظ كملف PDF» gives a multi-page Arabic PDF). Text is escaped — never HTML. */
export function printLetter(l: LetterRow) {
  if (!l.body) return;
  const w = window.open("", "_blank"); if (!w) { toast.error("اسمح بالنوافذ المنبثقة للطباعة"); return; }
  const cancelled = l.status === "cancelled" || l.status === "superseded";
  w.document.write(`<html dir="rtl" lang="ar"><head><title>${esc(l.template)} — ${esc(l.ref_no ?? "")}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet"><style>
    @page{size:A4;margin:22mm 18mm}body{font-family:Cairo,sans-serif;font-size:14px;line-height:2;color:#111}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #1f2a44;padding-bottom:8px;margin-bottom:24px}
    h1{font-size:20px;margin:0}.m{font-size:12px;color:#444}.b{white-space:pre-wrap}footer{margin-top:40px;font-size:11px;color:#555;border-top:1px solid #ccc;padding-top:6px}
    .x{color:#b00;font-weight:700;border:2px solid #b00;padding:4px 10px;display:inline-block;margin-bottom:12px}</style></head><body>
    <header><div><h1>${esc(l.org_name)}</h1><div class="m">${esc(l.template)}</div></div><div class="m">الرقم المرجعي: <bdi dir="ltr">${esc(l.ref_no ?? "")}</bdi><br>تاريخ الإصدار: <bdi dir="ltr">${esc((l.issued_at ?? "").slice(0, 10))}</bdi></div></header>
    ${cancelled ? `<div class="x">${l.status === "cancelled" ? "خطاب ملغى" : "خطاب مستبدل بتصحيح"} — غير صالح للاستخدام</div>` : ""}
    <div class="b">${esc(l.body)}</div>
    <footer>صادر من نظام ركاز. لا يتضمن هذا الخطاب توقيعًا أو ختمًا إلكترونيًا موثقًا من جهة خارجية.</footer>
    <script>setTimeout(()=>print(),700)</script></body></html>`);
  w.document.close();
}

/** Detail of one letter with the actions the server allows. */
export function LetterPanel({ id, onClose, self }: { id: string; onClose: () => void; self?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-l", id], queryFn: () => rpc<LetterRow>("hr_letter_get", { _id: id }) });
  const [edit, setEdit] = useState<{ purpose: string; addressee: string } | null>(null);
  const done = (msg: string) => { toast.success(msg); setEdit(null); qc.invalidateQueries({ queryKey: ["hr-l"] }); qc.invalidateQueries({ queryKey: ["hr-letters"] }); qc.invalidateQueries({ queryKey: ["hr-l-mine"] }); };
  const act = useMutation({
    mutationFn: async (a: { fn: string; args: Record<string, unknown>; msg: string }) => { await rpc(a.fn, a.args); return a.msg; },
    onSuccess: (m) => done(m), onError: (e) => toast.error(arabicError(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const l = q.data!;
  const run = (fn: string, args: Record<string, unknown>, msg: string) => act.mutate({ fn, args: { _id: l.id, ...args }, msg });
  const reason = async (label: string, fn: string, extra: Record<string, unknown>, msg: string) => { const r = await askText(label, { required: true }); if (r) run(fn, { ...extra, _reason: r }, msg); };
  return (
    <section aria-label={`خطاب ${l.template}`} className="space-y-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><p className="font-bold">{l.template} {!self && <>— {l.employee}</>}</p>
          <p className="text-xs text-muted-foreground">{l.school ?? ""} · طُلب <bdi dir="ltr">{dt(l.requested_at)}</bdi>{l.requested_by ? ` بواسطة ${l.requested_by}` : ""}</p></div>
        <LetterStatus s={l.status} />
        <Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">الجهة: </dt><dd className="inline">{l.addressee ?? "—"}</dd></div>
        <div><dt className="inline text-muted-foreground">الغرض: </dt><dd className="inline">{l.purpose ?? "—"}</dd></div>
        {l.ref_no && <div><dt className="inline text-muted-foreground">الرقم المرجعي: </dt><dd className="inline"><bdi dir="ltr">{l.ref_no}</bdi> · <bdi dir="ltr">{dt(l.issued_at)}</bdi>{l.issued_by ? ` · ${l.issued_by}` : ""}</dd></div>}
        {l.parent_ref && <div><dt className="inline text-muted-foreground">تصحيح للخطاب: </dt><dd className="inline"><bdi dir="ltr">{l.parent_ref}</bdi></dd></div>}
        {l.children.length > 0 && <div><dt className="inline text-muted-foreground">تصحيحات: </dt><dd className="inline">{l.children.map((c) => <span key={c.id} className="me-2"><bdi dir="ltr">{c.ref_no ?? "—"}</bdi> ({L_STATUS[c.status]})</span>)}</dd></div>}
        {l.has_comp && <div className="text-warning">يتضمن الراتب — يظهر لصاحب الخطاب ولمن يملك صلاحيته فقط</div>}
      </dl>
      {l.decision_reason && <p className={l.status === "returned" || l.status === "rejected" ? "rounded-lg bg-destructive/10 p-2 text-destructive" : "text-muted-foreground"}>سبب القرار: {l.decision_reason}</p>}
      {l.cancel_reason && <p className="rounded-lg bg-muted p-2">سبب الإلغاء: {l.cancel_reason}</p>}
      {l.body && <div className="space-y-2"><div className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 leading-8">{l.body}</div>
        <div className="flex flex-wrap gap-2">
          {l.ref_no && <Button size="sm" disabled={pdfBusy} onClick={() => void downloadPdf(l)}><FileDown className="size-4" />{pdfBusy ? "جارٍ تجهيز الملف…" : "تنزيل PDF"}</Button>}
          <Button size="sm" variant="outline" onClick={() => printLetter(l)}><Printer className="size-4" />طباعة</Button></div></div>}
      {l.body_hidden && <p className="rounded-lg bg-muted p-2 text-muted-foreground">نص هذا الخطاب يتضمن الراتب ولا تملك صلاحية عرضه.</p>}
      {edit ? (
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run("hr_letter_update", { _rev: l.rev, _purpose: edit.purpose, _addressee: edit.addressee }, "أُعيد إرسال الطلب"); }}>
          <div><Label htmlFor="l-addr">الجهة الموجه إليها</Label><Input id="l-addr" value={edit.addressee} onChange={(e) => setEdit({ ...edit, addressee: e.target.value })} /></div>
          <div><Label htmlFor="l-purp">الغرض</Label><Input id="l-purp" value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /></div>
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={act.isPending}>حفظ وإعادة الإرسال</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {l.can.review && <><Button size="sm" disabled={act.isPending} onClick={() => run("hr_letter_decide", { _rev: l.rev, _decision: "approve" }, "اعتُمد الطلب")}>اعتماد</Button>
            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => reason("سبب الإرجاع للتعديل", "hr_letter_decide", { _rev: l.rev, _decision: "return" }, "أُعيد الطلب")}>إرجاع للتعديل</Button>
            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => reason("سبب الرفض", "hr_letter_decide", { _rev: l.rev, _decision: "reject" }, "رُفض الطلب")}>رفض</Button></>}
          {l.can.issue && <Button size="sm" disabled={act.isPending} onClick={() => run("hr_letter_issue", { _rev: l.rev }, "صدر الخطاب")}>إصدار الخطاب</Button>}
          {l.can.edit && <Button size="sm" variant="outline" onClick={() => setEdit({ purpose: l.purpose ?? "", addressee: l.addressee ?? "" })}>تعديل الطلب</Button>}
          {l.can.reissue && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => reason("سبب التصحيح أو إعادة الإصدار", "hr_letter_reissue", {}, "أُنشئ طلب تصحيح مرتبط بالأصل")}>تصحيح / إعادة إصدار</Button>}
          {l.can.cancel && <Button size="sm" variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => reason(l.status === "issued" ? "سبب إلغاء الخطاب الصادر" : "سبب إلغاء الطلب", "hr_letter_cancel", { _rev: l.rev }, "أُلغي")}>{l.status === "issued" ? "إلغاء الخطاب" : "إلغاء الطلب"}</Button>}
        </div>
      )}
      {l.events && l.events.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">السجل</summary>
        <ul className="mt-1 space-y-0.5 text-xs">{l.events.map((e, i) => <li key={i}><bdi dir="ltr">{dt(e.at)}</bdi> · {e.by} · {EVENT[e.action] ?? e.action}{e.reason ? ` — ${e.reason}` : ""}</li>)}</ul></details>}
    </section>
  );
}

/** Employee self-service: request a letter and follow own letters. */
export function MyLetters({ org }: { org: string }) {
  const qc = useQueryClient();
  const tpl = useQuery({ queryKey: ["hr-l-tpl", org], queryFn: () => rpc<LetterTpl[]>("hr_letter_templates", { _org: org }) });
  const mine = useQuery({ queryKey: ["hr-l-mine", org], queryFn: () => rpc<LetterRow[]>("hr_letter_mine", { _org: org }) });
  const [form, setForm] = useState<{ template: string; purpose: string; addressee: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const lock = useRef(false);
  const req = useMutation({
    mutationFn: (f: { template: string; purpose: string; addressee: string }) => rpc<string>("hr_letter_request", { _org: org, _template: f.template, _purpose: f.purpose, _addressee: f.addressee }),
    onSuccess: (id) => { toast.success("أُرسل طلب الخطاب"); setForm(null); setOpen(id); qc.invalidateQueries({ queryKey: ["hr-l-mine", org] }); },
    onError: (e) => toast.error(arabicError(e)),
    onSettled: () => { lock.current = false; },
  });
  const types = (tpl.data ?? []).filter((t) => t.is_active && t.employee_request);
  if (mine.isLoading || tpl.isLoading) return <LoadingState />;
  if (mine.error) return <ErrorState message={arabicError(mine.error)} onRetry={() => mine.refetch()} />;
  return (
    <div className="space-y-3">
      {!form ? (types.length ? <Button size="sm" onClick={() => setForm({ template: types[0]!.id, purpose: "", addressee: "" })}>طلب خطاب</Button>
        : <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">لا توجد أنواع خطابات متاحة للطلب حاليًا؛ تضيفها الموارد البشرية.</p>) : (
        <form className="grid gap-2 rounded-xl border bg-card p-3 text-sm sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (lock.current) return; lock.current = true; req.mutate(form); }}>
          <div><Label htmlFor="ml-t">نوع الخطاب</Label><select id="ml-t" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><Label htmlFor="ml-a">الجهة الموجه إليها</Label><Input id="ml-a" value={form.addressee} onChange={(e) => setForm({ ...form, addressee: e.target.value })} placeholder="مثال: إلى من يهمه الأمر" /></div>
          <div><Label htmlFor="ml-p">الغرض</Label><Input id="ml-p" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-3">تُعبّأ بياناتك (ومنها الراتب إن تضمنه النوع) من سجلك لدى الموارد البشرية؛ لا تكتبها بنفسك. يصدر الخطاب بعد مراجعته من المختصين.</p>
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={req.isPending}>{req.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button><Button size="sm" type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button></div>
        </form>
      )}
      {open && <LetterPanel id={open} self onClose={() => setOpen(null)} />}
      {(mine.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد خطابات بعد.</p> : (
        <ul className="grid gap-2 md:grid-cols-2">{mine.data!.map((l) => (
          <li key={l.id}><button type="button" onClick={() => setOpen(l.id)} className="w-full rounded-xl border bg-card p-3 text-start text-sm hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-center justify-between gap-2"><span className="font-semibold">{l.template}</span><LetterStatus s={l.status} /></span>
            <span className="block text-xs text-muted-foreground">{l.addressee ?? "—"} · <bdi dir="ltr">{l.ref_no ?? l.requested_at.slice(0, 10)}</bdi></span>
            {l.status === "returned" && l.decision_reason && <span className="block text-xs text-destructive">{l.decision_reason}</span>}
          </button></li>))}</ul>
      )}
    </div>
  );
}
