import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { db, RecordForm, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError, useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/schools")({ component: Page });

function Page() {
  const { active, refresh } = useSession();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const orgId = active?.orgId;
  const allowed = active && (active.role === "org_owner" || active.role === "platform_admin");
  const q = useQuery({
    queryKey: ["schools", orgId],
    enabled: !!allowed,
    queryFn: async () => {
      let qq = db.from("schools").select("*, organizations(name)").order("name");
      if (orgId) qq = qq.eq("org_id", orgId);
      const { data, error } = await qq;
      if (error) throw error;
      return data as Row[];
    },
  });
  const save = useMutation({
    mutationFn: async (v: Row) => {
      const r = editing?.["id"] ? await db.from("schools").update(v).eq("id", editing["id"]) : await db.from("schools").insert({ ...v, org_id: orgId });
      if (r.error) throw r.error;
    },
    onSuccess: () => { toast.success("تم الحفظ"); setEditing(null); qc.invalidateQueries(); refresh(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  if (!allowed) return <ForbiddenState />;
  return (
    <>
      <PageHeader title="المدارس والفروع" desc={active.orgName} />
      <div className="mb-4 flex justify-end">
        {orgId && <Button onClick={() => setEditing({ is_active: true })}><Plus className="size-4" /> مدرسة جديدة</Button>}
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد مدارس" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((s) => (
            <button key={s["id"]} onClick={() => setEditing(s)} className="rounded-2xl border bg-card p-5 text-start shadow-sm hover:border-primary">
              <p className="font-bold">{s["name"]}</p>
              <p className="text-sm text-muted-foreground">{[s["city"], s["stage_type"], s["code"]].filter(Boolean).join(" · ") || "—"}</p>
              <p className="mt-3 text-xs">{s["is_active"] ? "نشطة" : "موقوفة"} · {s["organizations"]?.name}</p>
            </button>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editing?.["id"] ? "تعديل مدرسة" : "مدرسة جديدة"}</DialogTitle></DialogHeader>
          {editing && (
            <RecordForm schoolId="" initial={editing} submitting={save.isPending} onSubmit={(v) => save.mutate(v)}
              fields={[
                { key: "name", label: "الاسم", required: true },
                { key: "code", label: "الرمز" },
                { key: "city", label: "المدينة" },
                { key: "stage_type", label: "المراحل (مثال: متوسط وثانوي)" },
                { key: "is_active", label: "نشطة", type: "checkbox" },
              ]} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
