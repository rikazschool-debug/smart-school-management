import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

type Item = { id: string; date: string; summary: string; recommendations: string; read: boolean };

/** Guardian view: only the summaries a counselor chose to share (edu_family_guidance); never the case, notes or files. */
export function FamilyGuidance({ studentId }: { studentId: string }) {
  const q = useQuery({ queryKey: ["family-guidance", studentId], queryFn: async () => { const r = await db.rpc("edu_family_guidance", { _student: studentId }); if (r.error) throw r.error; return r.data as Item[]; } });
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const items = q.data ?? [];
  async function read(id: string) { const r = await db.rpc("edu_family_guidance_read", { _share: id }); if (r.error) toast.error(arabicError(r.error)); else { toast.success("شكرًا، سُجل اطلاعك"); await q.refetch(); } }
  if (!items.length) return <EmptyState title="لا توجد رسائل متابعة" hint="تظهر هنا الملخصات التي تشاركها المدرسة معكم عن متابعة ابنكم." />;
  return <ul className="space-y-3">{items.map((i) => <li key={i.id} className="space-y-2 rounded-xl border bg-card p-4">
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><HeartHandshake className="size-4 text-primary" />رسالة متابعة من المدرسة · {i.date}</p>
    <p className="whitespace-pre-wrap text-sm leading-7">{i.summary}</p>
    {i.recommendations && <div className="rounded-lg bg-muted/40 p-3 text-sm"><p className="text-xs text-muted-foreground">توصيات للأسرة</p><p className="whitespace-pre-wrap">{i.recommendations}</p></div>}
    {i.read ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" />تم الاطلاع</p> : <Button size="sm" variant="outline" onClick={() => void read(i.id)}>تم الاطلاع</Button>}
  </li>)}</ul>;
}
