import { useEffect, useState } from "react";
import { Download, Eye, Printer, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { filePreviewKind, deliverPrivateBlob } from "@/lib/private-file-delivery";

export function MaterialFileViewer({ file, onRemove }: { file: Row; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const kind = filePreviewKind(String(file["mime_type"] ?? ""));
  const q = useQuery({ queryKey: ["co-file-blob", file["id"]], enabled: open, staleTime: 0, gcTime: 0, retry: false, queryFn: async () => {
    const { data, error } = await db.storage.from("rikaz-files").download(file["storage_path"]);
    if (error) throw error;
    if (!(data instanceof Blob)) throw new Error("تعذر قراءة الملف");
    return data;
  } });
  const [url, setUrl] = useState(""); const [text, setText] = useState("");
  useEffect(() => {
    if (!q.data || !open) return;
    const u = URL.createObjectURL(q.data); setUrl(u);
    let live = true;
    if (kind === "text") void q.data.text().then((v) => { if (live) setText(v); });
    return () => { live = false; URL.revokeObjectURL(u); setUrl(""); setText(""); };
  }, [q.data, open, kind]);
  const print = () => {
    if (!url) return;
    // Reserve a top-level window within user activation. PDF printing is native, including all pages.
    const w = window.open("", "_blank");
    if (!w) return;
    w.opener = null;
    if (kind === "pdf") { w.location.href = url; return; }
    const doc = w.document; doc.title = String(file["name"]); doc.documentElement.dir = "rtl";
    const content = doc.createElement(kind === "image" ? "img" : "pre");
    if (content instanceof w.HTMLImageElement) { content.src = url; content.style.maxWidth = "100%"; content.onload = () => { w.focus(); w.print(); }; }
    else { content.textContent = text; content.style.whiteSpace = "pre-wrap"; }
    doc.body.append(content);
    if (kind === "text") { w.focus(); w.print(); }
  };
  return <><div className="flex min-w-0 flex-wrap items-center gap-2 border-t py-2">
    <Button variant="link" className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-start" onClick={() => setOpen(true)}><Eye className="size-4 shrink-0" />{file["name"]}</Button>
    {onRemove && <Button size="icon" variant="ghost" title="حذف المرفق" aria-label="حذف المرفق" onClick={onRemove}><Trash2 className="size-4" /></Button>}
  </div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle className="break-words">{file["name"]}</DialogTitle></DialogHeader>
    {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} /> : q.data && <>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void deliverPrivateBlob(q.data, String(file["name"]))}><Download className="size-4" />تنزيل</Button>{kind !== "unsupported" && <Button variant="outline" disabled={!url} onClick={print}><Printer className="size-4" />{kind === "pdf" ? "فتح للطباعة" : "طباعة"}</Button>}</div>
      {kind === "image" && url && <img src={url} alt={String(file["name"])} className="max-h-[65vh] max-w-full object-contain" />}
      {kind === "text" && <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded border p-4 text-sm">{text}</pre>}
      {kind === "pdf" && <p className="text-sm text-muted-foreground">يتاح الملف بكامل صفحاته عند فتحه للطباعة؛ اختر «طباعة» من عارض PDF.</p>}
      {kind === "unsupported" && <p role="status" className="text-sm text-muted-foreground">لا تتوفر معاينة لهذا النوع؛ نزّل الملف وافتحه واطبعه بالبرنامج المناسب.</p>}
    </>}
  </DialogContent></Dialog></>;
}