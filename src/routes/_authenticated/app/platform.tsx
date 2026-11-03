import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { arabicError, useSession } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { askText } from "@/components/confirm";
import { SECTION_LABELS, useOrgSections, type SectionKey } from "@/components/owner-portal";

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
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد مؤسسات بعد" /> : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead className="text-start">المؤسسة</TableHead><TableHead className="text-start">المدارس</TableHead><TableHead className="text-start">التسجيل</TableHead><TableHead className="text-start">الحالة</TableHead><TableHead className="text-start">الأقسام</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data.map((o) => (
                <TableRow key={o["id"]}>
                  <TableCell>{o["name"]}</TableCell>
                  <TableCell>{o["schools"]?.length ?? 0}</TableCell>
                  <TableCell>{new Date(o["created_at"]).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{o["is_active"] ? "نشطة" : "موقوفة"}</TableCell>
                  <TableCell><SectionsDialog org={o} /></TableCell>
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
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
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

/** Per-organization section availability. Toggling needs a reason; history is append-only on the server. */
function SectionsDialog({ org }: { org: Row }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const s = useOrgSections(open ? org["id"] : null);
  const log = useQuery({ queryKey: ["section-log", org["id"]], enabled: open, queryFn: async () => { const { data, error } = await db.rpc("platform_section_log", { _org: org["id"] }); if (error) throw error; return data as Row[]; } });
  async function toggle(k: SectionKey, enabled: boolean) {
    const reason = await askText(`سبب ${enabled ? "تفعيل" : "تعليق"} ${SECTION_LABELS[k]}`, { required: true, ok: enabled ? "تفعيل" : "تعليق" });
    if (!reason) return;
    const { error } = await db.rpc("platform_set_section", { _org: org["id"], _section: k, _enabled: enabled, _reason: reason });
    if (error) { toast.error(arabicError(error)); return; }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["org-sections", org["id"]] }); log.refetch();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">إتاحة الأقسام</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>أقسام {org["name"]}</DialogTitle></DialogHeader>
        {s.isLoading ? <LoadingState rows={2} /> : s.error ? <ErrorState message={arabicError(s.error)} /> : (
          <ul className="divide-y rounded-xl border">
            {(Object.keys(SECTION_LABELS) as SectionKey[]).map((k) => { const r = s.data?.[k]; const on = r?.["enabled"] !== false; return (
              <li key={k} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1"><span className="block font-semibold">{SECTION_LABELS[k]} {k === "hr" && <span className="text-xs font-normal text-muted-foreground">(تحت الإنشاء)</span>}</span>
                  <span className="block text-xs text-muted-foreground">{on ? "مفعّل" : "معلّق"}{r?.["reason"] ? ` — ${r["reason"]}` : ""}{r?.["changed_at"] ? ` • ${r["changed_by_name"] ?? ""} ${t(r["changed_at"])}` : ""}</span></span>
                <Button size="sm" variant={on ? "outline" : "default"} onClick={() => toggle(k, !on)}>{on ? "تعليق" : "تفعيل"}</Button>
              </li>); })}
          </ul>
        )}
        <h3 className="mt-2 text-sm font-bold">سجل التغييرات</h3>
        <ul className="max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
          {!log.data?.length ? <li>لا تغييرات بعد.</li> : log.data.map((l, i) => <li key={i}>{t(l["at"])} — {l["actor"]}: {SECTION_LABELS[l["section"] as SectionKey]} {l["after"] ? "فُعّل" : "عُلّق"} ({l["reason"]})</li>)}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
