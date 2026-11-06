import { useRef } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { db } from "@/components/crud-page";
import { uploadObject } from "@/components/classroom-posts";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";

// Attachments chosen in the create form. create_support_draft_file validates type/size/permission and makes a pending row;
// support_open links only fully uploaded files (it re-checks the stored object).
export type DraftFile = { key: string; file: File; id?: string | undefined; state: "uploading" | "ok" | "failed"; error?: string | undefined };

export function DraftFiles({ school, files, setFiles }: { school: string; files: DraftFile[]; setFiles: (f: (p: DraftFile[]) => DraftFile[]) => void }) {
  const aborts = useRef(new Map<string, AbortController>());
  const patch = (key: string, p: Partial<DraftFile>) => setFiles((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)));
  async function upload(d: DraftFile) {
    patch(d.key, { state: "uploading", error: undefined });
    let rec: { id: string; storage_path: string };
    try {
      const { data, error } = await db.rpc("create_support_draft_file" as never, { _school: school, _name: d.file.name, _mime: d.file.type || "application/octet-stream", _size: d.file.size } as never);
      if (error) throw error;
      rec = (data as unknown as { id: string; storage_path: string }[])[0]!;
    } catch (e) { patch(d.key, { state: "failed", error: arabicError(e) }); return; }
    const ac = new AbortController(); aborts.current.set(d.key, ac);
    const r = await uploadObject(rec.storage_path, d.file, ac.signal);
    aborts.current.delete(d.key);
    if (r === "ok") patch(d.key, { state: "ok", id: rec.id });
    else { await db.rpc("support_release_file", { _file: rec.id }); patch(d.key, { state: "failed", error: r === "aborted" ? "أُلغي الرفع" : "فشل الرفع" }); }
  }
  async function remove(d: DraftFile) {
    aborts.current.get(d.key)?.abort();
    if (d.id) await db.rpc("support_release_file", { _file: d.id });
    setFiles((l) => l.filter((x) => x.key !== d.key));
  }
  function add(list: FileList | null) {
    if (!school) return void toast.error("اختر الفرع أولًا");
    for (const f of Array.from(list ?? [])) {
      const d: DraftFile = { key: crypto.randomUUID(), file: f, state: "uploading" };
      setFiles((l) => [...l, d]); void upload(d);
    }
  }
  return (
    <div className="space-y-2">
      <label className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${school ? "cursor-pointer hover:bg-muted" : "opacity-50"}`}>
        <Paperclip className="h-4 w-4" /> إرفاق ملفات (اختياري)
        <input type="file" multiple className="hidden" disabled={!school} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="المرفقات">
          {files.map((d) => (
            <li key={d.key} className="flex flex-wrap items-center gap-2 rounded border p-1.5">
              <span className="flex-1 truncate">{d.file.name}</span>
              <span className={`text-xs ${d.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                {d.state === "uploading" ? "جارٍ الرفع…" : d.state === "ok" ? "اكتمل الرفع" : `تعذّر: ${d.error ?? ""}`}
              </span>
              {d.state === "failed" && <Button size="sm" variant="outline" onClick={() => upload(d)}>إعادة المحاولة</Button>}
              <Button size="sm" variant="ghost" onClick={() => remove(d)}>{d.state === "uploading" ? "إلغاء" : "إزالة"}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
