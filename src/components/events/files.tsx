// Event attachments (staff add/remove with edit rights) and application files. Lists come from evt_files/evt_app_files,
// files open only through 60-second signed links; storage re-checks can_read_file on every open.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rpc } from "@/components/hr/shared";
import { ask } from "@/components/confirm";
import { openFile } from "@/lib/comm";
import { arabicError } from "@/lib/session";
import { uploadItemFile } from "./upload";

type F = { id: string; name: string; size_bytes: number; storage_path: string; field?: string };
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} ك.ب`;

export function ItemFiles({ item, canEdit }: { item: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["evt-files", item], queryFn: () => rpc<F[]>("evt_files", { _item: item }) });
  const [up, setUp] = useState<{ name: string; pct: number; error?: string; file: File } | null>(null);
  const reload = () => void qc.invalidateQueries({ queryKey: ["evt-files", item] });
  async function send(file: File) {
    setUp({ name: file.name, pct: 0, file });
    try { await uploadItemFile(item, file, (pct) => setUp((u) => (u ? { ...u, pct } : u))); setUp(null); toast.success("أُضيف المرفق"); reload(); }
    catch (e) { setUp((u) => (u ? { ...u, error: arabicError(e) } : u)); reload(); }
  }
  const list = q.data ?? [];
  if (!canEdit && !list.length) return null;
  return (
    <div className="rounded-xl border p-3">
      <p className="mb-2 text-sm font-bold">المرفقات</p>
      {list.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p>}
      <ul className="space-y-1 text-sm">
        {list.map((f) => (
          <li key={f.id} className="flex items-center gap-2"><Paperclip className="size-4" />
            <button type="button" className="text-primary underline" onClick={() => void openFile(f)}>{f.name}</button>
            <span className="text-xs text-muted-foreground">{kb(f.size_bytes)}</span>
            {canEdit && <Button size="icon" variant="ghost" aria-label={`حذف ${f.name}`} onClick={async () => {
              if (!(await ask(`حذف المرفق «${f.name}»؟`))) return;
              try { await rpc("evt_file_remove", { _file: f.id }); reload(); } catch (e) { toast.error(arabicError(e)); }
            }}><Trash2 className="size-3" /></Button>}
          </li>
        ))}
      </ul>
      {up && <p className="mt-2 text-sm">{up.name}: {up.error ? <span className="text-destructive">{up.error} <Button size="sm" variant="outline" onClick={() => void send(up.file)}>إعادة المحاولة</Button></span> : `${up.pct}%`}</p>}
      {canEdit && list.length < 10 && !up?.pct && <input type="file" aria-label="إضافة مرفق" className="mt-2 block text-sm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />}
    </div>
  );
}

export function AppFiles({ app, labels }: { app: string; labels: Record<string, string> }) {
  const q = useQuery({ queryKey: ["evt-app-files", app], queryFn: () => rpc<F[]>("evt_app_files", { _app: app }) });
  if (!q.data?.length) return null;
  return (
    <div className="rounded-xl border p-3">
      <p className="mb-2 text-sm font-bold">ملفات الطلب</p>
      <ul className="space-y-1 text-sm">
        {q.data.map((f) => <li key={f.id} className="flex items-center gap-2"><Paperclip className="size-4" />
          <span className="text-xs text-muted-foreground">{labels[f.field ?? ""] ?? ""}</span>
          <button type="button" className="text-primary underline" onClick={() => void openFile(f)}>{f.name}</button>
          <span className="text-xs text-muted-foreground">{kb(f.size_bytes)}</span></li>)}
      </ul>
    </div>
  );
}
