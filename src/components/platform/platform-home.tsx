import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, ClipboardList, Inbox, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

const STATUS: Record<string, string> = { new: "جديد", contacted: "تم التواصل", accepted: "مقبول", rejected: "مرفوض" };

/** Platform owner home: real totals from platform_orgs / platform_overview / platform_signup_requests (all platform-admin-only RPCs). */
export function PlatformHome() {
  const orgs = useQuery({ queryKey: ["platform-orgs"], queryFn: async () => { const { data, error } = await db.rpc("platform_orgs"); if (error) throw error; return (data ?? []) as Row[]; } });
  const ov = useQuery({ queryKey: ["platform-overview"], queryFn: async () => { const { data, error } = await db.rpc("platform_overview"); if (error) throw error; return data as Row; } });
  const req = useQuery({ queryKey: ["signup-requests"], queryFn: async () => { const { data, error } = await db.rpc("platform_signup_requests"); if (error) throw error; return (data ?? []) as Row[]; } });
  if (orgs.isLoading || ov.isLoading) return <LoadingState rows={3} />;
  const err = orgs.error ?? ov.error;
  if (err) return <ErrorState message={arabicError(err)} onRetry={() => { orgs.refetch(); ov.refetch(); }} />;
  const real = (orgs.data ?? []).filter((o) => !o["is_test"]);
  const schools = real.flatMap((o) => (o["schools"] ?? []) as Row[]);
  const u = (ov.data?.["users"] ?? {}) as Row;
  const reqs = req.data ?? [];
  const fresh = reqs.filter((r) => r["status"] === "new");

  const stats: { label: string; value: number; sub: string; icon: LucideIcon; to: string; main?: boolean }[] = [
    { label: "المجموعات المشتركة", value: real.length, sub: `${real.filter((o) => o["is_active"]).length} نشطة`, icon: ShieldCheck, to: "/app/platform", main: true },
    { label: "المدارس والفروع", value: schools.length, sub: `${schools.filter((s) => !s["is_active"]).length} موقوفة`, icon: Building2, to: "/app/schools" },
    { label: "طلبات تسجيل جديدة", value: fresh.length, sub: `من ${reqs.length} طلبًا`, icon: Inbox, to: "/app/signup-requests" },
    { label: "المستخدمون", value: Number(u["staff"] ?? 0) + Number(u["guardians"] ?? 0) + Number(u["students"] ?? 0), sub: `${u["staff"] ?? 0} موظف · ${u["students"] ?? 0} طالب`, icon: UsersRound, to: "/app/platform" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className={"group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md " + (s.main ? "bg-primary text-primary-foreground" : "bg-card")}>
            <s.icon className={"absolute -bottom-3 -start-3 size-20 opacity-10"} />
            <div className="flex items-center gap-2 text-sm font-semibold"><s.icon className="size-4" />{s.label}</div>
            <p className="mt-3 font-display text-4xl leading-none">{s.value}</p>
            <p className={"mt-2 text-xs " + (s.main ? "text-primary-foreground/80" : "text-muted-foreground")}>{s.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card shadow-sm lg:col-span-2">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="font-bold">المجموعات ومدارسها</h2>
            <Link to="/app/platform" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">إدارة المجموعات والصلاحيات <ArrowLeft className="size-4" /></Link>
          </header>
          {!real.length ? <p className="p-6 text-sm text-muted-foreground">لا توجد مجموعات بعد.</p> : (
            <ul className="divide-y">
              {real.slice(0, 8).map((o) => { const sc = (o["schools"] ?? []) as Row[]; const owner = ((o["owners"] ?? []) as Row[])[0]; return (
                <li key={o["id"]} className="flex items-center gap-3 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary font-bold text-primary">{String(o["name"] ?? "؟").slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{o["name"]}</p>
                    <p className="truncate text-xs text-muted-foreground">المالك: {owner?.["name"] ?? "بلا مالك"} · {sc.length} فرع{sc.length ? ` — ${sc.map((s) => s["name"]).join("، ")}` : ""}</p>
                  </div>
                  <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + (o["is_active"] ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{o["is_active"] ? "نشطة" : "موقوفة"}</span>
                </li>); })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-bold"><ClipboardList className="size-4 text-primary" />طلبات التسجيل</h2>
            <Link to="/app/signup-requests" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">الكل <ArrowLeft className="size-4" /></Link>
          </header>
          {req.isLoading ? <LoadingState rows={2} /> : !reqs.length ? <p className="p-6 text-sm text-muted-foreground">لم يصل أي طلب من صفحة «إنشاء حساب» بعد.</p> : (
            <ul className="divide-y">
              {reqs.slice(0, 6).map((r) => (
                <li key={r["id"]} className="p-4 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r["org_name"]}</span><span className="text-xs text-muted-foreground" dir="ltr">{r["ref"]}</span></div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{r["contact_name"]} · {r["city"] ?? "—"}</span><span className={"rounded-full px-2 py-0.5 " + (r["status"] === "new" ? "bg-accent text-accent-foreground" : "bg-secondary")}>{STATUS[r["status"]] ?? r["status"]}</span></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
