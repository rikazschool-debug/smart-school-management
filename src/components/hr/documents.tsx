// HR documents: shared UI for the admin center and «خدماتي الوظيفية». The server (hr_doc_*) decides scope, confidentiality and who may review;
// files are private (rikaz-files) and opened only through hr_doc_file → 60-second signed URL.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { uploadObject } from "@/components/classroom-posts";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

export type DocVersion = { id: string; version: number; status: string; title: string | null; doc_no: string | null; issuer: string | null; issued_on: string | null; expires_on: string | null; has_file: boolean; file_name: string | null; uploaded_at: string; uploaded_by: string | null; reviewed_at: string | null; reviewed_by: string | null; review_reason: string | null };
export type DocRow = { id: string | null; employee_id: string; employee: string; employee_no: string; school: string | null; type_id: string; type: string; confidential: boolean; contract_id?: string | null; contract_no?: string | null; status: string; accepted_version?: number | null; current?: DocVersion | null; latest?: DocVersion | null };
export type DocDetail = DocRow & { versions: DocVersion[]; self: boolean; can: { review: boolean; download: boolean; upload: boolean }; events: { at: string; action: string; reason: string | null; by: string }[] | null };
export type DocType = { id: string; name: string; confidential?: boolean; needs_number: boolean; needs_expiry: boolean; employee_upload?: boolean; required_all?: boolean; required_kinds?: string[]; alert_days?: number[]; is_active?: boolean };

export const D_STATUS: Record<string, string> = { missing: "مطلوب — لم يُرفع", required: "مطلوب", under_review: "تحت المراجعة", accepted: "مقبول", rejected: "مرفوض — يلزم إعادة الرفع", expired: "منتهٍ" };
export const DV_STATUS: Record<string, string> = { under_review: "تحت المراجعة", accepted: "مقبولة", rejected: "مرفوضة", superseded: "سابقة (استُبدلت)" };
export const D_EVENT: Record<string, string> = { upload: "رفع نسخة", "review:accept": "قبول", "review:reject": "رفض", download: "فتح الملف" };
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx";

export function DocStatus({ s }: { s: string }) {
  const tone = s === "accepted" ? "bg-success/10 text-success" : s === "under_review" ? "bg-warning/10 text-warning" : s === "missing" || s === "rejected" || s === "expired" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={"rounded px-1.5 text-xs " + tone}>{D_STATUS[s] ?? s}</span>;
}

export async function openDocFile(versionId: string) {
  try {
    const f = await rpc<{ storage_path: string; name: string }>("hr_doc_file", { _version: versionId });
    const { data, error } = await supabase.storage.from("rikaz-files").createSignedUrl(f.storage_path, 60, { download: f.name });
    if (error) throw error;
    window.open(data.signedUrl, "_blank", "noopener");
  } catch { toast.error("تعذر فتح الملف أو ليست لديك صلاحية"); }
}

/** Upload a new version: server validates permission/type/size and creates the private file row; then storage upload; then confirm. */
export function DocUploadForm({ org, type, employeeId, documentId, contracts, onDone, onCancel }: {
  org: string; type: Pick<DocType, "id" | "name" | "needs_number" | "needs_expiry">; employeeId: string; documentId?: string | null;
  contracts?: { id: string; contract_no: string }[]; onDone: () => void; onCancel: () => void;
}) {
  const [v, setV] = useState({ title: "", doc_no: "", issuer: "", issued_on: "", expires_on: "", contract_id: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v, x: string) => setV((o) => ({ ...o, [k]: x }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file) { toast.error("اختر الملف"); return; }
    setBusy(true);
    try {
      const p = { ...v, type_id: type.id, employee_id: employeeId, document_id: documentId ?? "" };
      const s = await rpc<{ version_id: string; storage_path: string }>("hr_doc_upload_start", { _org: org, _p: p, _name: file.name, _mime: file.type, _size: file.size });
      let r: "ok" | "aborted" | "failed" = "failed";
      for (let i = 0; i < 3 && r !== "ok"; i++) r = await uploadObject(s.storage_path, file, new AbortController().signal);
      if (r !== "ok") throw new Error("فشل رفع الملف؛ أعد المحاولة");
      await rpc("hr_doc_upload_done", { _version: s.version_id });
      toast.success("رُفع المستند وأُرسل للمراجعة");
      onDone();
    } catch (err) { toast.error(arabicError(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2" aria-label={`رفع ${type.name}`}>
      <p className="font-semibold sm:col-span-2">رفع {type.name}</p>
      <div><Label htmlFor="dt">العنوان (اختياري)</Label><Input id="dt" value={v.title} onChange={(e) => set("title", e.target.value)} /></div>
      <div><Label htmlFor="dn">رقم المستند{type.needs_number ? " *" : ""}</Label><Input id="dn" dir="ltr" required={type.needs_number} value={v.doc_no} onChange={(e) => set("doc_no", e.target.value)} /></div>
      <div><Label htmlFor="di">جهة الإصدار</Label><Input id="di" value={v.issuer} onChange={(e) => set("issuer", e.target.value)} /></div>
      <div><Label htmlFor="dio">تاريخ الإصدار</Label><Input id="dio" type="date" value={v.issued_on} onChange={(e) => set("issued_on", e.target.value)} /></div>
      <div><Label htmlFor="dex">تاريخ الانتهاء{type.needs_expiry ? " *" : ""}</Label><Input id="dex" type="date" required={type.needs_expiry} value={v.expires_on} onChange={(e) => set("expires_on", e.target.value)} /></div>
      {contracts && contracts.length > 0 && <div><Label htmlFor="dc">العقد المرتبط</Label><select id="dc" className={selectCls("w-full")} value={v.contract_id} onChange={(e) => set("contract_id", e.target.value)}><option value="">بلا عقد</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contract_no}</option>)}</select></div>}
      <div className="sm:col-span-2"><Label htmlFor="df">الملف (PDF أو صورة أو Word)</Label><Input id="df" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">يُحفظ الملف بشكل خاص. لا تستبدل النسخة الجديدة النسخة المقبولة إلا بعد قبولها من مراجع آخر.</p>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm" disabled={busy}><Upload className="size-4" />{busy ? "جارٍ الرفع…" : "رفع وإرسال للمراجعة"}</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button></div>
    </form>
  );
}

export function VersionList({ versions, canOpen }: { versions: DocVersion[]; canOpen: boolean }) {
  return (
    <ul className="space-y-2">
      {versions.map((x) => (
        <li key={x.id} className="rounded-lg border p-2 text-sm">
          <span className="flex flex-wrap items-center gap-2"><b>النسخة {x.version}</b><span className="text-xs text-muted-foreground">{DV_STATUS[x.status] ?? x.status}</span>
            {canOpen && x.has_file && <Button size="sm" variant="ghost" onClick={() => openDocFile(x.id)}><Download className="size-4" />{x.file_name ?? "فتح"}</Button>}</span>
          <span className="block text-xs text-muted-foreground">{[x.title, x.doc_no && `رقم ${x.doc_no}`, x.issuer, x.issued_on && `صدر ${x.issued_on}`, x.expires_on && `ينتهي ${x.expires_on}`].filter(Boolean).join(" · ")}</span>
          <span className="block text-xs text-muted-foreground">رفعها {x.uploaded_by ?? "—"} · <bdi dir="ltr">{x.uploaded_at.slice(0, 10)}</bdi>{x.reviewed_by ? ` · قرار ${x.reviewed_by}` : ""}</span>
          {x.review_reason && <span className="block text-xs">{x.status === "rejected" ? "سبب الرفض: " : "ملاحظة: "}{x.review_reason}</span>}
        </li>
      ))}
    </ul>
  );
}

export function DocDetailPanel({ id, org, onClose }: { id: string; org: string; onClose: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["hr-doc", id], queryFn: () => rpc<DocDetail>("hr_doc_get", { _id: id }) });
  const [up, setUp] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["hr-doc", id] }); qc.invalidateQueries({ queryKey: ["hr-docs"] }); qc.invalidateQueries({ queryKey: ["hr-my-docs"] }); };
  const review = useMutation({ mutationFn: (a: { v: string; decision: string; reason: string | null }) => rpc("hr_doc_review", { _version: a.v, _decision: a.decision, _reason: a.reason }), onSuccess: () => { toast.success("سُجّل القرار"); refresh(); }, onError: (e) => { toast.error(arabicError(e)); refresh(); } });
  if (d.isLoading) return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  if (d.error) return <p role="alert" className="text-sm text-destructive">{arabicError(d.error)}</p>;
  const x = d.data!;
  const pending = x.versions.find((v) => v.status === "under_review");
  return (
    <section aria-label="تفاصيل المستند" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1"><p className="text-lg font-bold">{x.type} — {x.employee}</p>
          <p className="text-sm text-muted-foreground"><bdi dir="ltr">{x.employee_no}</bdi>{x.school ? ` · ${x.school}` : ""}{x.contract_no ? ` · العقد ${x.contract_no}` : ""}{x.confidential ? " · سري" : ""}</p>
          <div className="mt-1"><DocStatus s={x.status} /></div></div>
        <Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {x.can.review && pending && <><Button size="sm" disabled={review.isPending} onClick={async () => { const r = await askText(`قبول النسخة ${pending.version}؟ ملاحظة اختيارية`, { ok: "قبول" }); if (r !== null) review.mutate({ v: pending.id, decision: "accept", reason: r || null }); }}>قبول النسخة {pending.version}</Button>
          <Button size="sm" variant="outline" disabled={review.isPending} onClick={async () => { const r = await askText("سبب الرفض (يظهر للموظف)", { required: true, ok: "رفض" }); if (r) review.mutate({ v: pending.id, decision: "reject", reason: r }); }}>رفض</Button></>}
        {x.can.upload && !pending && !up && <Button size="sm" variant="outline" onClick={() => setUp(true)}><Upload className="size-4" />رفع نسخة جديدة</Button>}
      </div>
      {pending && !x.can.review && <p className="text-sm text-muted-foreground">النسخة {pending.version} تنتظر مراجعة شخص آخر.</p>}
      {up && <DocUploadForm org={org} type={{ id: x.type_id, name: x.type, needs_number: false, needs_expiry: false }} employeeId={x.employee_id} documentId={x.id} onDone={() => { setUp(false); refresh(); }} onCancel={() => setUp(false)} />}
      <VersionList versions={x.versions} canOpen={x.can.download} />
      {x.events && x.events.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">سجل التغييرات</summary><ul className="mt-2 space-y-1">{x.events.map((e, i) => <li key={i} className="text-xs"><bdi dir="ltr">{e.at.slice(0, 16).replace("T", " ")}</bdi> · {D_EVENT[e.action] ?? e.action} · {e.by}{e.reason ? ` — ${e.reason}` : ""}</li>)}</ul></details>}
    </section>
  );
}
