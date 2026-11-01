import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { arabicError, useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/platform")({
  head: () => ({ meta: [{ title: "إدارة المنصة — ركاز" }, { name: "description", content: "المؤسسات المشتركة وحالة تنظيف الملفات." }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const ok = active?.role === "platform_admin";
  const q = useQuery({
    queryKey: ["platform-orgs"],
    enabled: ok,
    queryFn: async () => {
      const { data, error } = await db.from("organizations").select("*, schools(id)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  if (!ok) return <ForbiddenState />;
  return (
    <>
      <PageHeader title="المؤسسات المشتركة" desc="عرض كل المؤسسات على المنصة وعدد مدارسها." />
      <CleanupHealth />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد مؤسسات بعد" /> : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead className="text-start">المؤسسة</TableHead><TableHead className="text-start">المدارس</TableHead><TableHead className="text-start">التسجيل</TableHead><TableHead className="text-start">الحالة</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data.map((o) => (
                <TableRow key={o["id"]}>
                  <TableCell>{o["name"]}</TableCell>
                  <TableCell>{o["schools"]?.length ?? 0}</TableCell>
                  <TableCell>{new Date(o["created_at"]).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{o["is_active"] ? "نشطة" : "موقوفة"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

const KIND: Record<string, string> = { stale: "متأخر — لا نجاح خلال 3 ساعات", stuck: "تشغيل لم ينتهِ خلال 30 دقيقة", failing: "آخر تشغيل فشل أو ملفات تعذر حذفها" };
const t = (v: unknown) => (v ? new Date(String(v)).toLocaleString("ar") : "—");

/** Live state of the scheduled file cleanup; checked independently every hour by its own scheduled monitor. */
function CleanupHealth() {
  const q = useQuery({ queryKey: ["cleanup-health"], queryFn: async () => { const { data, error } = await db.rpc("cleanup_health"); if (error) throw error; return data as Row; } });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const h = q.data!; const last = h["last_run"] as Row | null; const alerts = (h["open_alerts"] ?? []) as Row[];
  return (
    <section className="mb-6 rounded-xl border bg-card p-4 text-sm">
      <h2 className="mb-2 font-bold">تنظيف الملفات المجدول</h2>
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
        <div><dt className="text-muted-foreground">آخر بدء</dt><dd>{t(h["last_start"])}</dd></div>
        <div><dt className="text-muted-foreground">آخر نجاح</dt><dd>{t(h["last_success"])}</dd></div>
        <div><dt className="text-muted-foreground">آخر فشل</dt><dd>{t(h["last_failure"])}</dd></div>
        <div><dt className="text-muted-foreground">آخر تشغيل</dt><dd>{last ? `فُحص ${last["marked"]} • حُذف ${last["rows_removed"]} • طلبات حذف ${last["delete_requests"]} • تعذر ${last["failed"]}` : "—"}</dd></div>
        <div><dt className="text-muted-foreground">ملفات متعثرة</dt><dd>{String(h["stuck_files"] ?? 0)}</dd></div>
      </dl>
      <p className={"mt-3 " + (alerts.length ? "text-destructive" : "text-muted-foreground")}>
        {alerts.length ? alerts.map((a) => `${KIND[a["kind"]] ?? a["kind"]} منذ ${t(a["opened_at"])}`).join(" • ") : "لا توجد تنبيهات مفتوحة."}
      </p>
    </section>
  );
}
