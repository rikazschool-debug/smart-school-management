import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";

const ST: Record<string, string> = { new: "جديد", contacted: "تم التواصل", accepted: "مقبول", rejected: "مرفوض" };
const STG: Record<string, string> = { kg: "رياض أطفال", primary: "ابتدائي", middle: "متوسط", secondary: "ثانوي", intl: "دولي" };

/** Platform owner: public school-registration requests, newest first. */
export function SignupRequests() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["platform-signup-requests"], queryFn: async () => { const { data, error } = await db.rpc("platform_signup_requests"); if (error) throw error; return (data ?? []) as Row[]; } });
  async function setStatus(r: Row, status: string) {
    const note = await askText({ title: `${r["ref"]} — ${ST[status]}`, label: "ملاحظة (اختيارية)", optional: true } as never);
    if (note === null) return;
    const { error } = await db.rpc("platform_signup_set", { _id: r["id"], _status: status, _note: note ?? "" });
    if (error) return toast.error(arabicError(error));
    toast.success("تم التحديث"); qc.invalidateQueries({ queryKey: ["platform-signup-requests"] });
  }
  const rows = q.data ?? [];
  const fresh = rows.filter((r) => r["status"] === "new").length;
  return (
    <section className="mb-6 rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-3 text-sm">
        <span className="font-semibold">طلبات التسجيل ({rows.length}){fresh > 0 && <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{fresh} جديد</span>}</span>
      </div>
      {q.isLoading ? <LoadingState rows={2} /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title="لا توجد طلبات تسجيل بعد" /> : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r["id"]} className="grid gap-2 p-4 text-sm md:grid-cols-[110px_1fr_auto]">
              <div><p className="font-display text-lg text-primary" dir="ltr">{r["ref"]}</p><p className="text-xs text-muted-foreground">{new Date(r["created_at"]).toLocaleDateString("ar-SA")}</p></div>
              <div className="space-y-1">
                <p className="font-semibold">{r["org_name"]}{r["city"] ? ` — ${r["city"]}` : ""}</p>
                <p>{r["contact_name"]}{r["job_title"] ? ` (${r["job_title"]})` : ""} • <span dir="ltr">{r["phone"]}</span>{r["email"] ? <> • <span dir="ltr">{r["email"]}</span></> : null}</p>
                <p className="text-xs text-muted-foreground">المدارس: {r["schools_count"] ?? "—"} • الطلاب: {r["students_count"] ?? "—"} • المراحل: {(r["stages"] as string[]).map((s) => STG[s]).join("، ") || "—"}</p>
                {r["notes"] && <p className="rounded bg-muted p-2 text-xs">{r["notes"]}</p>}
                {r["admin_note"] && <p className="text-xs">ملاحظتك: {r["admin_note"]}</p>}
              </div>
              <div className="flex flex-wrap items-start gap-1 md:flex-col">
                <span className="rounded-full border px-2 py-0.5 text-xs">{ST[r["status"]]}</span>
                {(["contacted", "accepted", "rejected"] as const).filter((s) => s !== r["status"]).map((s) => <Button key={s} size="sm" variant="ghost" onClick={() => setStatus(r, s)}>{ST[s]}</Button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
