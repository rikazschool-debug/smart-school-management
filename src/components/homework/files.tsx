import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { uploadObject } from "@/components/classroom-posts";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";

const BUCKET = "rikaz-files";

/** Opens a private file through a 60-second signed URL (storage RLS checks can_read_file). */
export async function openFile(f: Row) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(f["storage_path"], 60, { download: f["name"] });
  if (error) { toast.error("تعذر فتح الملف أو ليست لديك صلاحية"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

export function FileList({ files, onRemove }: { files: Row[]; onRemove?: ((f: Row) => void) | undefined }) {
  if (!files.length) return null;
  return (
    <ul className="space-y-1 text-sm">
      {files.map((f) => (
        <li key={f["id"]} className="flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5" />
          <button className="text-primary underline-offset-2 hover:underline" onClick={() => openFile(f)}>{f["name"]}</button>
          <span className="text-xs text-muted-foreground">{Math.ceil(f["size_bytes"] / 1024)} ك.ب</span>
          {onRemove && <Button variant="ghost" size="sm" onClick={() => onRemove(f)}>حذف</Button>}
        </li>
      ))}
    </ul>
  );
}

/** create row via RPC (validates type/size/permission) -> upload -> on failure the row is released for cleanup. */
export function Uploader({ create, onDone, release, label = "إرفاق ملف" }: {
  create: (f: File) => Promise<{ id: string; storage_path: string }>;
  release: (id: string) => Promise<unknown>;
  onDone: () => void;
  label?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const ac = useRef<AbortController | null>(null);
  async function go(f: File) {
    let rec: { id: string; storage_path: string };
    try { rec = await create(f); } catch (e) { toast.error(arabicError(e)); return; }
    setBusy(f.name);
    ac.current = new AbortController();
    const r = await uploadObject(rec.storage_path, f, ac.current.signal);
    setBusy(null);
    if (r !== "ok") {
      await release(rec.id).catch(() => undefined);
      toast.error(r === "aborted" ? "أُلغي الرفع" : "فشل رفع الملف؛ أعد المحاولة");
    } else toast.success("اكتمل رفع الملف");
    onDone();
  }
  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        <Paperclip className="h-4 w-4" /> {label}
        <input type="file" className="hidden" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void go(f); }} />
      </label>
      {busy && (<><span className="text-xs text-muted-foreground">جارٍ رفع {busy}… (الرفع وحده لا يعني التسليم)</span><Button size="sm" variant="ghost" onClick={() => ac.current?.abort()}>إلغاء الرفع</Button></>)}
    </div>
  );
}
