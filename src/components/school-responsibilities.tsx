// Permanent school responsibilities (accountant, maintenance, transport, HR, documents) used by automation as
// "record-linked responsibility". Owner-only RPCs (school_resp_list / school_resp_set) are the only path; the people
// list is the server "resp" pool (active staff of this school, names only).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { PeoplePicker } from "@/components/people-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState, ErrorState } from "@/components/states";
import { arabicError } from "@/lib/session";

export const RESP_KIND: Record<string, string> = {
  accountant: "المحاسب المسؤول", maintenance: "مسؤول الصيانة", transport: "مسؤول النقل", hr: "مسؤول الموارد البشرية", documents: "مسؤول الوثائق",
};
type Resp = { kind: string; user_id: string | null; name: string | null; active: boolean };

export function SchoolResponsibilitiesDialog({ school, org, onClose }: { school: { id: string; name: string } | null; org: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["school-resp", school?.id], enabled: !!school,
    queryFn: async () => { const { data, error } = await db.rpc("school_resp_list" as never, { _school: school!.id } as never); if (error) throw error; return (data ?? []) as unknown as Resp[]; },
  });
  async function setUser(kind: string, user: string | null) {
    const { error } = await db.rpc("school_resp_set" as never, { _school: school!.id, _kind: kind, _user: user } as never);
    if (error) return void toast.error(arabicError(error));
    toast.success(user ? "حُفظ المسؤول" : "أُزيل المسؤول"); setEdit(null); qc.invalidateQueries({ queryKey: ["school-resp", school?.id] });
  }
  return (
    <Dialog open={!!school} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>مسؤوليات «{school?.name}»</DialogTitle></DialogHeader>
        <p className="text-xs leading-5 text-muted-foreground">تستخدمها قواعد الأتمتة عند اختيار «المسؤول المرتبط بالسجل». المسؤول يجب أن يكون موظفًا نشطًا في هذه المدرسة، ويُسجَّل كل تغيير.</p>
        {q.isLoading ? <LoadingState rows={3} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : (
          <ul className="divide-y rounded-xl border">
            {(q.data ?? []).map((r) => (
              <li key={r.kind} className="space-y-2 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{RESP_KIND[r.kind] ?? r.kind}</span>
                  <span className={"ms-auto " + (r.user_id ? "" : "text-muted-foreground")}>{r.user_id ? (r.name ?? "—") : "غير محدد"}</span>
                  {r.user_id && !r.active && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px]">لم يعد مؤهلًا</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEdit(edit === r.kind ? null : r.kind)}>{r.user_id ? "تغيير" : "تحديد"}</Button>
                  {r.user_id && <Button size="sm" variant="ghost" onClick={() => setUser(r.kind, null)}>إزالة</Button>}
                </div>
                {edit === r.kind && school && (
                  <PeoplePicker purpose="resp" school={school.id} org={org} single value={r.user_id ? [r.user_id] : []} onChange={(v) => v[0] && setUser(r.kind, v[0])} label="اختر الموظف" compact />
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Responsible person for one document or vehicle — owner only (org_doc_set_responsible / mt_bus_set_responsible log each change). */
export function RecordResponsible({ kind, id, school, org, userId, name, onSaved }: {
  kind: "doc" | "bus"; id: string; school: string | null; org: string; userId: string | null | undefined; name: string | null | undefined; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  async function setUser(user: string | null) {
    const fn = kind === "doc" ? "org_doc_set_responsible" : "mt_bus_set_responsible";
    const args = kind === "doc" ? { _doc: id, _user: user } : { _bus: id, _user: user };
    const { error } = await db.rpc(fn as never, args as never);
    if (error) return void toast.error(arabicError(error));
    toast.success(user ? "حُفظ المسؤول" : "أُزيل المسؤول"); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{kind === "doc" ? "مسؤول الوثيقة" : "مسؤول المركبة"}</span>
        <span className={userId ? "" : "text-muted-foreground"}>{userId ? (name ?? "—") : "غير محدد"}</span>
        <span className="ms-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(!open)}>{userId ? "تغيير" : "تحديد"}</Button>
          {userId && <Button type="button" size="sm" variant="ghost" onClick={() => void setUser(null)}>إزالة</Button>}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">يُستخدم في قواعد الأتمتة عند اختيار «المسؤول المرتبط بالسجل»، ويُسجَّل كل تغيير.</p>
      {open && <PeoplePicker purpose="resp" school={school} org={org} single value={userId ? [userId] : []} onChange={(v) => v[0] && void setUser(v[0])} label="اختر الموظف" compact />}
    </div>
  );
}
