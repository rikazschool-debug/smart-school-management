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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      const { data, error } = await db.rpc("platform_orgs");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const [showTest, setShowTest] = useState(false);
  if (!ok) return <ForbiddenState />;
  const rows = (q.data ?? []).filter((o) => showTest || !o["is_test"]);
  const testCount = (q.data ?? []).filter((o) => o["is_test"]).length;
  return (
    <>
      <PageHeader title="المؤسسات المشتركة" desc="عرض كل المؤسسات على المنصة وعدد مدارسها." />
      <PlatformOverview />
      <CleanupHealth />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title="لا توجد مؤسسات بعد" /> : (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-3 text-sm">
            <span className="font-semibold">المؤسسات ومالكوها وفروعها ({rows.length})</span>
            {testCount > 0 && <Button size="sm" variant="ghost" onClick={() => setShowTest((v) => !v)}>{showTest ? "إخفاء مؤسسات الاختبار" : `إظهار مؤسسات الاختبار (${testCount})`}</Button>}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead className="text-start">المؤسسة</TableHead><TableHead className="text-start">المالك</TableHead><TableHead className="text-start">الفروع</TableHead><TableHead className="text-start">التسجيل</TableHead><TableHead className="text-start">الحالة</TableHead><TableHead className="text-start">الأقسام</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o["id"]}>
                  <TableCell className="align-top font-semibold">{o["name"]}{o["is_test"] && <span className="ms-1 text-xs font-normal text-muted-foreground">(اختبار)</span>}</TableCell>
                  <TableCell className="align-top text-sm">{(o["owners"] ?? []).length ? (o["owners"] as Row[]).map((w, i) => (
                    <div key={i}>{w["name"]}<span className="block text-xs text-muted-foreground" dir="ltr">{w["email"]}</span>
                      <span className="block text-xs">الهوية: <span dir="ltr">{w["national_id"] ?? "—"}</span> • الجوال: <span dir="ltr">{w["phone"] ?? "—"}</span></span></div>
                  )) : <span className="text-muted-foreground">بلا مالك</span>}</TableCell>
                  <TableCell className="align-top text-sm">
                    <span className="font-semibold">{o["schools"]?.length ?? 0}</span>
                    <ul className="mt-1 space-y-0.5 text-xs">{(o["schools"] as Row[] ?? []).map((s) => <li key={s["id"]}>{s["name"]}{s["city"] ? ` — ${s["city"]}` : ""}{!s["is_active"] && <span className="text-destructive"> (موقوف)</span>}</li>)}</ul>
                  </TableCell>
                  <TableCell>{new Date(o["created_at"]).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{o["is_active"] ? "نشطة" : "موقوفة"}</TableCell>
                  <TableCell className="space-y-1"><EditOrgDialog org={o} /><SectionsDialog org={o} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

type Ov = Record<string, Record<string, any>>;
/** Platform-wide counts per section (no organization names or records). */
function PlatformOverview() {
  const q = useQuery({ queryKey: ["platform-overview"], queryFn: async () => { const { data, error } = await db.rpc("platform_overview"); if (error) throw error; return data as Ov; } });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!; const av = d["availability"] ?? {};
  const cards: { key: string; title: string; note?: string; items: [string, unknown][] }[] = [
    { key: "school_admin", title: "إدارة المدارس", items: [["مؤسسة", d["schools"]?.["orgs"]], ["فرع نشط", d["schools"]?.["active"]], ["فرع موقوف", d["schools"]?.["paused"]]] },
    { key: "finance", title: "المالية والمحاسبة", items: [["عهدة مفتوحة", d["finance"]?.["open_custodies"]], ["طلب بانتظار قرار", d["finance"]?.["pending_requests"]]] },
    { key: "operations", title: "النقل المدرسي والصيانة", items: [["طلب صيانة مدارس مفتوح", d["operations"]?.["school_open"]], ["طلب صيانة باصات مفتوح", d["operations"]?.["bus_open"]], ["طلب متأخر", d["operations"]?.["overdue"]], ["باص", d["operations"]?.["buses"]], ["باص متوقف أو بانتظار فحص", d["operations"]?.["buses_stopped"]]] },
    { key: "hr", title: "الموارد البشرية", note: "تحت الإنشاء", items: [] },
    { key: "users", title: "المستخدمون والصلاحيات", items: [["موظف نشط", d["users"]?.["staff"]], ["ولي أمر", d["users"]?.["guardians"]], ["طالب", d["users"]?.["students"]], ["دعوة معلّقة", d["users"]?.["pending_invites"]]] },
  ];
  return (
    <section className="mb-6" aria-label="ملخص المنصة">
      <div className="mb-2 flex items-baseline justify-between"><h2 className="font-bold">ملخص الأقسام على المنصة</h2><span className="text-xs text-muted-foreground">أرقام إجمالية فقط • آخر تحديث {t(d["at"])}</span></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className="rounded-xl border bg-card p-4 text-sm">
            <p className="font-semibold">{c.title} {c.note && <span className="text-xs font-normal text-muted-foreground">({c.note})</span>}</p>
            {av[c.key] && <p className="mt-0.5 text-xs text-muted-foreground">مفعّل لدى {av[c.key]["on"]} • معلّق لدى {av[c.key]["off"]}</p>}
            {c.items.length ? (
              <dl className="mt-3 grid grid-cols-2 gap-2">
                {c.items.map(([l, v]) => <div key={l} className="rounded-lg bg-secondary/50 px-3 py-2"><dd className="font-display text-lg leading-none">{String(v ?? 0)}</dd><dt className="mt-1 text-xs text-muted-foreground">{l}</dt></div>)}
              </dl>
            ) : <p className="mt-3 text-muted-foreground">لم تُنفّذ وظائفه بعد، ولا تُعرض فيه بيانات.</p>}
          </div>
        ))}
      </div>
    </section>
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

/** Platform owner edits the organization name and its owner's name, ID number and mobile (used for ID + code sign-in). Saved only via platform_org_save. */
function EditOrgDialog({ org }: { org: Row }) {
  const qc = useQueryClient();
  const owner = ((org["owners"] ?? []) as Row[])[0];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", owner: "", nid: "", phone: "" });
  const [busy, setBusy] = useState(false);
  function start(v: boolean) {
    if (v) setF({ name: org["name"] ?? "", owner: owner?.["name"] === "—" ? "" : owner?.["name"] ?? "", nid: owner?.["national_id"] ?? "", phone: owner?.["phone"] ?? "" });
    setOpen(v);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await db.rpc("platform_org_save", { _org: org["id"], _name: f.name, _owner: owner?.["user_id"] ?? null, _owner_name: f.owner, _nid: f.nid, _phone: f.phone });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظت بيانات المؤسسة والمالك");
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["platform-orgs"] });
  }
  return (
    <Dialog open={open} onOpenChange={start}>
      <DialogTrigger asChild><Button size="sm" variant="outline">تعديل البيانات</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>بيانات {org["name"]}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1"><Label htmlFor="o-name">اسم المؤسسة</Label><Input id="o-name" value={f.name} maxLength={150} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          {owner ? (<>
            <p className="pt-2 text-sm font-semibold">بيانات المالك الشخصية <span className="text-xs font-normal text-muted-foreground" dir="ltr">{owner["email"]}</span></p>
            <div className="space-y-1"><Label htmlFor="o-owner">اسم المالك</Label><Input id="o-owner" value={f.owner} maxLength={120} onChange={(e) => setF({ ...f, owner: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="o-nid">رقم الهوية أو الإقامة</Label><Input id="o-nid" dir="ltr" inputMode="numeric" maxLength={10} value={f.nid} onChange={(e) => setF({ ...f, nid: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="o-phone">رقم الجوال (يصل إليه رمز الدخول)</Label><Input id="o-phone" dir="ltr" inputMode="tel" maxLength={16} placeholder="05xxxxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">بعد الحفظ يدخل المالك من «الإدارة والموظفين» برقم الهوية ثم الرمز المرسل إلى جواله.</p>
          </>) : <p className="text-sm text-muted-foreground">لا يوجد مالك لهذه المؤسسة.</p>}
          <Button className="w-full" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
