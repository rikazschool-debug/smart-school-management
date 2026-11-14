// Attachment list for public pages (no account). Links are signed by the server for 60 seconds on each load.
import { useQuery } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";

type F = { id: string; name: string; size: number; url: string | null };
export function PublicFiles({ title, load, qk }: { title: string; load: () => Promise<F[]>; qk: unknown[] }) {
  const q = useQuery({ queryKey: qk, queryFn: load, staleTime: 30_000 });
  if (!q.data?.length) return null;
  return (
    <div className="mt-4 rounded-xl border p-3">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ul className="space-y-1 text-sm">
        {q.data.map((f) => (
          <li key={f.id} className="flex items-center gap-2"><Paperclip className="size-4" />
            {f.url ? <a className="text-primary underline" href={f.url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => void q.refetch(), 500)}>{f.name}</a> : <span>{f.name}</span>}
            <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} ك.ب</span></li>
        ))}
      </ul>
    </div>
  );
}
