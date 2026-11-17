import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Camera, Download, Eye, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { deliverPrivateBlob, filePreviewKind } from "@/lib/private-file-delivery";
import type { Recommendation } from "./work-model";
import { readSupervisionEvidence, uploadSupervisionEvidence } from "@/lib/supervision-files.functions";
type Evidence = { id: string; name: string; path: string; mime: string; size: number; teacher_visible: boolean; recommendation_id: string | null };
export function EvidencePanel({ plan, visit, canWork, recommendations = [] }: { plan?: string; visit?: string; canWork: boolean; recommendations?: Recommendation[] }) {
  const uploadFn = useServerFn(uploadSupervisionEvidence); const readFn = useServerFn(readSupervisionEvidence);
  const [busy, setBusy] = useState(false); const [shared, setShared] = useState(false); const [rec, setRec] = useState(""); const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);
  const q = useQuery({ queryKey: ["sv3-files", plan, visit], retry: false, queryFn: async () => { const r = await db.rpc("sv3_file_list", { _plan: plan ?? null, _visit: visit ?? null }); if (r.error) throw r.error; return r.data as Evidence[]; } });
  const own = recommendations.filter((r) => r.can_update && r.state !== "completed");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  async function upload(file: File | undefined) {
    if (!file) return; setBusy(true);
    try { const r = await db.rpc("sv3_file_create", { _p: { plan_id: plan ?? null, visit_id: visit ?? null, recommendation_id: rec || null, name: file.name, mime: file.type, size: file.size, teacher_visible: shared } }); if (r.error) throw r.error;
      const f = r.data as { id: string }; const form = new FormData(); form.set("id", f.id); form.set("file", file); await uploadFn({ data: form });
      toast.success("حُفظ الشاهد"); await q.refetch();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function open(f: Evidence, download: boolean) {
    try { const r = await readFn({ data: { id: f.id } }); const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0)); const blob = new Blob([bytes], { type: r.mime }); if (download) await deliverPrivateBlob(blob, r.name); else setPreview({ url: URL.createObjectURL(blob), name: r.name, mime: r.mime }); } catch (e) { toast.error(arabicError(e)); }
  }
  return <section className="space-y-3 border-t pt-4">
    <h3 className="font-bold">المرفقات والشواهد</h3>
    {(canWork || own.length > 0) && <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {recommendations.length > 0 && <select aria-label="ربط الشاهد بالتوصية" className={selectCls()} value={rec} onChange={(e) => setRec(e.target.value)}><option value="">شاهد الزيارة</option>{(canWork ? recommendations : own).map((r) => <option key={r.id} value={r.id}>التوصية {r.no}: {r.action}</option>)}</select>}
        {canWork && !plan && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />يظهر للمعلم المعني</label>}
        <label className="cursor-pointer text-sm"><span className="flex items-center gap-1"><Paperclip className="size-4" />إرفاق ملف</span><input aria-label="إرفاق شاهد" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" disabled={busy || (!canWork && !rec)} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <label className="cursor-pointer text-sm"><span className="flex items-center gap-1"><Camera className="size-4" />التقاط صورة</span><input aria-label="التقاط شاهد بالكاميرا" className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy || (!canWork && !rec)} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div><p className="text-xs text-muted-foreground">صور، PDF وWord — حتى 10 ميغابايت. {busy ? "جارٍ الرفع…" : ""}</p>
    </div>}
    {q.error && <p className="text-sm text-destructive">{arabicError(q.error)}</p>}
    <ul className="divide-y">{(q.data ?? []).map((f) => <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1 break-words">{f.name} <span className="text-xs text-muted-foreground">{f.teacher_visible ? "مشترك مع المعلم" : "للمراجعة الداخلية"}</span></span><Button variant="ghost" size="icon" title="معاينة" aria-label={`معاينة ${f.name}`} onClick={() => open(f, false)}><Eye /></Button><Button variant="ghost" size="icon" title="تنزيل" aria-label={`تنزيل ${f.name}`} onClick={() => open(f, true)}><Download /></Button></li>)}</ul>
    {preview && <div role="dialog" aria-label="معاينة المرفق" className="fixed inset-0 z-50 flex flex-col bg-background p-4"><div className="flex items-center justify-between gap-2"><h3 className="truncate font-bold">{preview.name}</h3><Button variant="outline" onClick={() => setPreview(null)}>إغلاق</Button></div>{filePreviewKind(preview.mime) === "image" ? <img className="mt-4 min-h-0 flex-1 object-contain" alt={preview.name} src={preview.url} /> : filePreviewKind(preview.mime) === "pdf" ? <iframe title={preview.name} src={preview.url} className="mt-4 w-full flex-1" /> : <p className="mt-4">المعاينة غير متاحة لهذا النوع؛ يمكن تنزيله.</p>}</div>}
  </section>;
}