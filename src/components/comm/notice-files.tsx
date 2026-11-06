import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";

// Notice attachments: bc_add_file validates type/size and creates the files row before upload; reading goes through can_read_file (recipient or scoped viewer) via short-lived signed URLs.
export type NoticeFile = { id: string; name: string; mime: string; size: number; path: string; uploaded: boolean };

export function NoticeFiles({ id, editable }: { id: string; editable: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const files = useQuery({ queryKey: ["bc-files", id], queryFn: () => rpc<NoticeFile[]>("bc_files", { _id: id }) });
  const add = useMutation({
    mutationFn: async (f: File) => {
      const r = await rpc<{ id: string; storage_path: string }[]>("bc_add_file", { _id: id, _name: f.name, _mime: f.type || "application/octet-stream", _size: f.size });
      const row = r[0]!;
      const up = await supabase.storage.from("rikaz-files").upload(row.storage_path, f, { contentType: f.type });
      if (up.error) { await rpc("bc_remove_file", { _file: row.id }).catch(() => {}); throw up.error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bc-files", id] }); toast.success("أُرفق الملف"); },
    onError: (e) => toast.error(arabicError(e)),
    onSettled: () => { if (input.current) input.current.value = ""; },
  });
  const del = useMutation({ mutationFn: (f: string) => rpc("bc_remove_file", { _file: f }), onSuccess: () => qc.invalidateQueries({ queryKey: ["bc-files", id] }), onError: (e) => toast.error(arabicError(e)) });
  const open = async (f: NoticeFile) => {
    const { data, error } = await supabase.storage.from("rikaz-files").createSignedUrl(f.path, 120, { download: f.name });
    if (error || !data) return toast.error("تعذّر فتح الملف");
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const list = files.data ?? [];
  if (!editable && list.length === 0) return null;
  return (
    <div className="space-y-2" aria-label="المرفقات">
      <p className="text-sm font-semibold">المرفقات {list.length > 0 && `(${list.length})`}</p>
      {list.map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          <Paperclip className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate">{f.name}</span>
          <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} ك.ب</span>
          {!f.uploaded && <span className="text-xs text-destructive">لم يكتمل الرفع</span>}
          {f.uploaded && <Button size="sm" variant="ghost" aria-label={`تنزيل ${f.name}`} onClick={() => open(f)}><Download className="size-4" /></Button>}
          {editable && <Button size="sm" variant="ghost" aria-label={`حذف ${f.name}`} onClick={() => del.mutate(f.id)}><Trash2 className="size-4" /></Button>}
        </div>
      ))}
      {editable && (
        <>
          <input ref={input} type="file" className="hidden" aria-label="اختر ملفًا" onChange={(e) => { const f = e.target.files?.[0]; if (f) add.mutate(f); }} />
          <Button size="sm" variant="outline" disabled={add.isPending || list.length >= 5} onClick={() => input.current?.click()}><Paperclip className="size-4" />{add.isPending ? "جارٍ الرفع…" : "إرفاق ملف"}</Button>
          <p className="text-xs text-muted-foreground">حتى 5 ملفات؛ يتحقق الخادم من النوع والحجم حسب سياسة الفرع.</p>
        </>
      )}
    </div>
  );
}
