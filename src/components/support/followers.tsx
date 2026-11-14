import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, X } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Cand = { user_id: string; name: string; role: string; school_name: string; dept_name: string | null };
const roleLabel = (r: string | null) => (r ? ROLE_LABELS[r as Role] ?? r : "");

/**
 * Followers of one ticket — a separate field from the handler. Candidates come only from support_follower_candidates;
 * support_set_follower re-checks permission and eligibility. Following grants read + alerts only.
 */
export function FollowersPanel({ d, userId, onChange }: { d: Row; userId: string; onChange: () => void }) {
  const t = d.ticket, can = d.can;
  const list: Row[] = d.follower_list ?? [];
  const open = !["closed", "cancelled"].includes(t.status);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const cands = useQuery({
    enabled: !!can.followers && open && q.trim().length >= 2,
    queryKey: ["support-follow-cands", t.id, q.trim()],
    queryFn: async () => {
      const { data, error } = await db.rpc("support_follower_candidates" as never, { _ticket: t.id, _q: q.trim() } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Cand[];
    },
  });
  async function set(user: string, on: boolean, name?: string) {
    if (!on && !(await ask(user === userId ? "إلغاء متابعتك لهذه التذكرة؟" : `إزالة ${name ?? "المتابع"} من المتابعين؟ يتوقف اطلاعه وتنبيهاته فورًا.`, { destructive: true }))) return;
    setBusy(true);
    const { error } = await db.rpc("support_set_follower" as never, { _ticket: t.id, _user: user, _on: on } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(on ? "أُضيف المتابع" : "أُزيل المتابع"); setQ(""); onChange();
  }
  if (t.scope !== "school" || (!list.length && !can.followers && !can.follow)) return null;
  const meFollowing = list.some((f) => f.user_id === userId);
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" aria-label="المتابعون">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-semibold">المتابعون <span className="text-xs font-normal text-muted-foreground">— يطّلعون على التذكرة وردودها العلنية ومرفقاتها وتصلهم التنبيهات، دون رد أو معالجة</span></p>
        {can.follow && !meFollowing && open && t.assignee !== userId && t.requester !== userId && <Button size="sm" variant="outline" disabled={busy} onClick={() => set(userId, true)}><Eye className="size-4" />متابعة التذكرة</Button>}
      </div>
      {list.length ? (
        <ul className="flex flex-wrap gap-2">
          {list.map((f) => (
            <li key={f.user_id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
              {f.name}{f.role ? ` · ${roleLabel(f.role)}` : ""}
              {(can.followers || f.user_id === userId) && <button type="button" aria-label={`إزالة ${f.name}`} disabled={busy} onClick={() => set(f.user_id, false, f.name)}><X className="size-3" /></button>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">لا يوجد متابعون.</p>}
      {can.followers && open && (
        <div className="space-y-2">
          <Label htmlFor="sf-q">إضافة متابع من موظفي الفرع</Label>
          <Input id="sf-q" placeholder="ابحث بالاسم أو جزء منه (حرفان على الأقل)" value={q} onChange={(e) => setQ(e.target.value)} />
          {(cands.data ?? []).length > 0 && (
            <ul className="max-h-56 overflow-auto rounded-lg border text-sm" aria-label="المؤهلون للمتابعة">
              {cands.data!.map((c) => (
                <li key={c.user_id}>
                  <button type="button" disabled={busy} className="flex w-full gap-2 border-b p-2 text-start hover:bg-muted" onClick={() => set(c.user_id, true)}>
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{roleLabel(c.role)} · {c.dept_name ?? "بلا قسم"} · {c.school_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && !cands.isLoading && !(cands.data ?? []).length && <p className="text-xs text-muted-foreground">لا يوجد مؤهلون بهذا الاسم في فرع التذكرة.</p>}
        </div>
      )}
    </div>
  );
}
