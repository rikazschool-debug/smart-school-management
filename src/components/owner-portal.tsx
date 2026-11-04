import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, CheckCircle2, Construction, KeyRound, Link2, Lock, PauseCircle, PencilLine, Plus, ShieldCheck, Wallet, Wrench, Bus, type LucideIcon } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

export type SectionKey = "school_admin" | "finance" | "operations" | "hr";
export const SECTION_LABELS: Record<SectionKey, string> = { school_admin: "إدارة المدارس", finance: "المالية والمحاسبة", operations: "النقل المدرسي والصيانة", hr: "الموارد البشرية" };

/** Section availability set by the platform owner; read fresh from the server (no cache across sessions). */
export function useOrgSections(orgId: string | null) {
  return useQuery({
    queryKey: ["org-sections", orgId],
    enabled: !!orgId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await db.rpc("org_sections_get", { _org: orgId });
      if (error) throw error;
      return Object.fromEntries((data as Row[]).map((r) => [r["section"], r])) as Record<SectionKey, Row>;
    },
  });
}

/** Per-school overview for the owner (server-checked: owner/platform admin only). */
export function useSchoolsOverview(orgId: string | null) {
  return useQuery({
    queryKey: ["schools-overview", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.rpc("org_schools_overview", { _org: orgId });
      if (error) throw error;
      return data as Row[];
    },
  });
}

export function SectionLocked() {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <Lock className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="font-bold">غير مفعّل لمؤسستك</p>
      <p className="mt-1 text-sm text-muted-foreground">هذا القسم معلّق من مالك المنصة. بياناته محفوظة، ويعود الوصول عند إعادة تفعيله.</p>
    </div>
  );
}

export function UnderConstruction({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <Construction className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="font-bold">{title} — تحت الإنشاء</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint ?? "لم تُنفّذ وظائف هذا القسم بعد، ولا تُعرض فيه بيانات."}</p>
    </div>
  );
}

type Feature = { icon: LucideIcon; label: string; to: string; search?: Record<string, unknown> };
type Card = { key: string; section?: SectionKey; title: string; desc: string; to: string; icon: LucideIcon; note?: string; features: Feature[]; open: string };

const CARDS: Card[] = [
  {
    key: "schools", section: "school_admin", title: "إدارة المدارس", icon: Building2, to: "/app/school-home", open: "فتح إدارة المدارس",
    desc: "مدارس المؤسسة وفروعها، وتشغيلها اليومي: الإعداد الأكاديمي والطلاب والجداول والحضور والتواصل.",
    features: [
      { icon: Plus, label: "إضافة مدرسة جديدة", to: "/app/schools", search: { new: true } },
      { icon: PencilLine, label: "تعديل بيانات المدرسة", to: "/app/schools" },
      { icon: PauseCircle, label: "تفعيل فرع أو إيقافه", to: "/app/schools" },
      { icon: Link2, label: "ربط الموظفين بالمدرسة", to: "/app/schools" },
    ],
  },
  {
    key: "operations", section: "operations", title: "النقل المدرسي والصيانة", icon: Bus, to: "/app/operations", open: "فتح القسم",
    desc: "صيانة المدارس والباصات من الطلب حتى اعتماد الإنجاز، وبيانات الباصات الأساسية. تشغيل النقل مؤجل.",
    features: [
      { icon: Wrench, label: "صيانة المدارس", to: "/app/maintenance", search: { tab: "school" } },
      { icon: Bus, label: "صيانة الباصات", to: "/app/maintenance", search: { tab: "bus" } },
    ],
  },
  {
    key: "hr", section: "hr", title: "الموارد البشرية", icon: Construction, to: "/app/hr", open: "فتح القسم", note: "تحت الإنشاء",
    desc: "شؤون الموظفين. لم تُنفّذ وظائفه بعد، ولا تُعرض فيه بيانات.",
    features: [],
  },
  {
    key: "finance", section: "finance", title: "المالية والمحاسبة", icon: Wallet, to: "/app/finance", open: "فتح المالية",
    desc: "المشتريات والعهد المالية: طلب العهدة وصرفها، والفواتير والضريبة، والطلبات والتسوية والتقارير.",
    features: [
      { icon: Wallet, label: "المشتريات والعهد", to: "/app/procurement" },
    ],
  },
  {
    key: "users", title: "إعداد المستخدمين والصلاحيات", icon: ShieldCheck, to: "/app/permissions", open: "فتح الصلاحيات",
    desc: "المستخدمون والدعوات، والمسميات والأدوار، وصلاحيات كل شخص ونطاقها.",
    features: [
      { icon: Link2, label: "المستخدمون والدعوات", to: "/app/members" },
      { icon: KeyRound, label: "الأدوار والصلاحيات", to: "/app/permissions" },
    ],
  },
];

function SchoolsStats({ orgId }: { orgId: string | null }) {
  const q = useSchoolsOverview(orgId);
  if (q.isLoading) return <p className="text-xs text-muted-foreground">جارٍ عدّ المدارس…</p>;
  if (q.error || !q.data) return null;
  const active = q.data.filter((s) => s["is_active"]).length;
  const paused = q.data.length - active;
  const staff = q.data.reduce((a, s) => a + Number(s["staff_total"] ?? 0), 0);
  const students = q.data.reduce((a, s) => a + Number(s["students"] ?? 0), 0);
  const items = [
    { v: active, l: "مدرسة نشطة" },
    { v: paused, l: "فرع موقوف" },
    { v: staff, l: "موظف مرتبط" },
    { v: students, l: "طالب" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.l} className="rounded-xl bg-secondary/50 px-3 py-2">
          <dt className="sr-only">{i.l}</dt>
          <dd className="font-display text-xl leading-none">{i.v}</dd>
          <p className="mt-1 text-xs text-muted-foreground">{i.l}</p>
        </div>
      ))}
    </dl>
  );
}

export function OwnerPortal({ orgId }: { orgId: string | null }) {
  const q = useOrgSections(orgId);
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {CARDS.map((c) => {
        const locked = c.section ? q.data?.[c.section]?.["enabled"] === false : false;
        const wide = c.key === "schools";
        return (
          <section key={c.key} aria-labelledby={`card-${c.key}`} aria-disabled={locked || undefined}
            className={"flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6 " + (wide ? "md:col-span-2 " : "") + (locked ? "opacity-60" : "")}>
            <div className="flex items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">{locked ? <Lock className="size-7" /> : <c.icon className="size-7" />}</span>
              <div className="min-w-0 flex-1">
                <h2 id={`card-${c.key}`} className="flex flex-wrap items-center gap-2 font-display text-xl">{c.title}
                  {locked ? <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-normal">غير مفعّل لمؤسستك</span>
                    : c.note ? <span className="rounded-full bg-warning/15 px-2 py-0.5 font-sans text-xs font-normal">{c.note}</span>
                    : <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-sans text-xs font-normal text-success"><CheckCircle2 className="size-3" />متاح</span>}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            </div>
            {c.key === "schools" && !locked && <SchoolsStats orgId={orgId} />}
            {!locked && c.features.length > 0 && (
              <ul className={"grid gap-2 " + (wide ? "sm:grid-cols-2 lg:grid-cols-4" : "")}>
                {c.features.map((f) => (
                  <li key={f.label}>
                    <Link to={f.to} {...(f.search ? { search: f.search } : {})} className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <f.icon className="size-4 shrink-0 text-primary" /><span className="truncate">{f.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto">
              {locked ? <p className="text-xs text-muted-foreground">علّقه مالك المنصة؛ بياناته محفوظة.</p> : (
                <Link to={c.to} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {c.open}<ArrowLeft className="size-4" />
                </Link>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
