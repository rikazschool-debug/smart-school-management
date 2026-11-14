import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Building2, Search } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { arabicError, useSession } from "@/lib/session";

/** Platform owner: every group and its branches; opening one switches into that group's/branch's context (full group menu). */
export function PlatformSchools() {
  const { contexts, setActive } = useSession();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const orgs = useQuery({ queryKey: ["platform-orgs"], queryFn: async () => { const { data, error } = await db.rpc("platform_orgs"); if (error) throw error; return (data ?? []) as Row[]; } });
  if (orgs.isLoading) return <LoadingState rows={3} />;
  if (orgs.error) return <ErrorState message={arabicError(orgs.error)} onRetry={() => orgs.refetch()} />;
  const term = q.trim();
  const rows = (orgs.data ?? []).filter((o) => !o["is_test"]).filter((o) => !term || String(o["name"]).includes(term) || ((o["schools"] ?? []) as Row[]).some((s) => String(s["name"]).includes(term)));
  function open(schoolId: string) {
    const c = contexts.find((x) => x.key === `admin:${schoolId}`);
    if (!c) return;
    setActive(c.key);
    void navigate({ to: "/app" });
  }
  return (
    <>
      <PageHeader title="المدارس والفروع" desc="كل المجموعات على المنصة وفروعها. اختر فرعًا للدخول إليه وإدارته بقائمة المجموعة." />
      <div className="relative mb-4 max-w-sm"><Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input className="ps-9" placeholder="ابحث باسم المجموعة أو الفرع" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!rows.length ? <EmptyState title="لا توجد نتائج" /> : (
        <div className="space-y-5">
          {rows.map((o) => { const sc = (o["schools"] ?? []) as Row[]; const owner = ((o["owners"] ?? []) as Row[])[0]; return (
            <section key={o["id"]} className="rounded-2xl border bg-card shadow-sm">
              <header className="flex flex-wrap items-center gap-3 border-b p-4">
                <span className="grid size-10 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">{String(o["name"]).slice(0, 1)}</span>
                <div className="min-w-0 flex-1"><p className="font-bold">{o["name"]}</p><p className="text-xs text-muted-foreground">المالك: {owner?.["name"] ?? "بلا مالك"} · {sc.length} فرع</p></div>
                <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + (o["is_active"] ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{o["is_active"] ? "نشطة" : "موقوفة"}</span>
                {sc[0] && <Button size="sm" onClick={() => open(sc[0]!["id"])}>دخول المجموعة</Button>}
              </header>
              {!sc.length ? <p className="p-4 text-sm text-muted-foreground">لا توجد فروع بعد.</p> : (
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sc.map((s) => (
                    <button key={s["id"]} type="button" onClick={() => open(s["id"])} className="group flex items-center gap-3 rounded-xl border p-3 text-start transition hover:border-primary hover:shadow-sm">
                      <Building2 className="size-5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{s["name"]}</span><span className="block text-xs text-muted-foreground">{s["city"] ?? "—"}{!s["is_active"] && <span className="text-destructive"> · موقوف</span>}</span></span>
                      <ArrowLeft className="size-4 text-muted-foreground transition group-hover:-translate-x-1 group-hover:text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </section>); })}
        </div>
      )}
    </>
  );
}
