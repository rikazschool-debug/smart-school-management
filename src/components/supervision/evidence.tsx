import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Download, Eye, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { deliverPrivateBlob, filePreviewKind } from "@/lib/private-file-delivery";
import type { Recommendation } from "./work-model";
type Evidence = { id: string; name: string; path: string; mime: string; size: number; teacher_visible: boolean; recommendation_id: string | null };
export function EvidencePanel({ plan, visit, canWork, recommendations = [] }: { plan?: string; visit?: string; canWork: boolean; recommendations?: Recommendation[] }) {
  const [busy, setBusy] = useState(false); const [shared, setShared] = useState(false); const [rec, setRec] = useState(""); const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);
  const q = useQuery({ queryKey: ["sv3-files", plan, visit], retry: false, queryFn: async () => { const r = await db.rpc("sv3_file_list", { _plan: plan ?? null, _visit: visit ?? null }); if (r.error) throw r.error; return r.data as Evidence[]; } });
  const own = recommendations.filter((r) => r.can_update && r.state !== "completed");
  async function upload(file: File | undefined) {
    if (!file) return; setBusy(true);
    try { const r = await db.rpc("sv3_file_create", { _p: { plan_id: plan ?? null, visit_id: visit ?? null, recommendation_id: rec || null, name: file.name, mime: file.type, size: file.size, teacher_visible: shared } }); if (r.error) throw r.error;
      const f = r.data as { id: string; path: string }; const up = await db.storage.from("rikaz-files").upload(f.path, file, { contentType: file.type }); if (up.error) throw up.error;
      toast.success("حُفظ الشاهد"); await q.refetch();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function open(f: Evidence, download: boolean) {
    const r = await db.storage.from("rikaz-files").createSignedUrl(f.path, 30); if (r.error || !r.data) return void toast.error("الملف غير متاح ضمن صلاحيتك الحالية");
    if (download) { const response = await fetch(r.data.signedUrl); if (!response.ok) return void toast.error("تعذر تنزيل الملف"); await deliverPrivateBlob(await response.blob(), f.name); }
    else { setPreview({ url: r.data.signedUrl, name: f.name, mime: f.mime }); }
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