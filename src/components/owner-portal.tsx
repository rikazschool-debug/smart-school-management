import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, ArrowLeft, Building2, CheckCircle2, Construction, IdCard, KeyRound, Link2, Lock, PauseCircle, PencilLine, Plus, ShieldCheck, Wallet, Wrench, Bus, UserPlus, Megaphone, CalendarDays, type LucideIcon, LifeBuoy } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

export type SectionKey = "school_admin" | "admissions" | "finance" | "operations" | "hr" | "comm_hub";
export const SECTION_LABELS: Record<SectionKey, string> = { school_admin: "إدارة المدارس", admissions: "القبول والتسجيل", finance: "المالية والمحاسبة", operations: "النقل المدرسي وصيانة المركبات", hr: "الموارد البشرية", comm_hub: "إدارة الإشعارات" };

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
      { icon: UserPlus, label: "القبول والتسجيل", to: "/app/admissions", search: { tab: "apps" } },
      { icon: Link2, label: "الوثائق والعقود", to: "/app/org-docs", search: { tab: "docs" } },
      { icon: Link2, label: "زيارات أولياء الأمور", to: "/app/family-visits", search: {} },
    ],
  },
  {
    key: "transport", section: "operations", title: "النقل المدرسي وصيانة المركبات", icon: Bus, to: "/app/bus-maintenance", open: "فتح النقل والباصات",
    desc: "سجلات الباصات وحالة تشغيلها وطلبات صيانتها حتى الفحص والعودة للخدمة. المسارات والتوزيع والتتبع مؤجلة.",
    features: [
      { icon: Bus, label: "الباصات وحالة التشغيل", to: "/app/bus-maintenance", search: { tab: "buses" } },
      { icon: Wrench, label: "طلبات صيانة الباصات", to: "/app/bus-maintenance", search: { tab: "requests" } },
      { icon: Construction, label: "تشغيل النقل (تحت الإنشاء)", to: "/app/transport" },
    ],
  },
  {
    key: "school_maint", section: "operations", title: "إدارة صيانة المباني", icon: Wrench, to: "/app/maintenance", open: "فتح صيانة المدارس",
    desc: "طلبات صيانة مباني المدارس وفروعها من الطلب حتى اعتماد الإنجاز.",
    features: [
      { icon: Plus, label: "طلب صيانة جديد", to: "/app/maintenance", search: { new: "1" } },
      { icon: Wrench, label: "طلبات صيانة المدارس", to: "/app/maintenance" },
    ],
  },
  {
    key: "hr", section: "hr", title: "الموارد البشرية", icon: IdCard, to: "/app/hr", open: "فتح القسم", note: "الحزمة الأولى",
    desc: "ملفات الموظفين وتعييناتهم في المدارس، مربوطة بحساباتهم وسجلات المعلمين دون تكرار. مع العقود والمستندات والخطابات والإجازات؛ الرواتب تُضاف لاحقًا.",
    features: [
      { icon: IdCard, label: "ملفات الموظفين", to: "/app/hr" },
      { icon: Star, label: "نظام التقييم الشامل", to: "/app/evaluation", search: { tab: "summary" } },
      { icon: IdCard, label: "التدريب والتطوير", to: "/app/hr/training" },
      { icon: Plus, label: "إضافة موظف", to: "/app/hr", search: { add: "1" } },
      { icon: IdCard, label: "الخطابات", to: "/app/hr/letters" },
      { icon: IdCard, label: "الإجازات", to: "/app/hr/leave" },
      { icon: IdCard, label: "الحضور والانصراف", to: "/app/hr/attendance" },
      { icon: IdCard, label: "الرواتب والسلف", to: "/app/hr/payroll" },
      { icon: IdCard, label: "التوظيف", to: "/app/hr/recruit" },
      { icon: IdCard, label: "العهد العينية", to: "/app/hr/assets" },
      { icon: IdCard, label: "الأداء الوظيفي", to: "/app/hr/performance" },
      { icon: IdCard, label: "التأمين الطبي", to: "/app/hr/insurance" },
      { icon: IdCard, label: "السكن", to: "/app/hr/housing" },
      { icon: IdCard, label: "تقارير الموارد البشرية", to: "/app/hr/reports" },
    ],
  },
  {
    key: "finance", section: "finance", title: "المالية والمحاسبة", icon: Wallet, to: "/app/finance", open: "فتح المالية",
    desc: "المشتريات والعهد المالية: طلب العهدة وصرفها، والفواتير والضريبة، والطلبات والتسوية والتقارير.",
    features: [
      { icon: Wallet, label: "المشتريات والعهد", to: "/app/procurement" },
    ],
  },
  {
    key: "hub", section: "comm_hub", title: "الإشعارات والاجتماعات", icon: Megaphone, to: "/app/hub", open: "فتح البوابة",
    desc: "إشعارات موجّهة لفروع وفئات وأشخاص محددين مع معاينة وسجل، واجتماعات حضورية وأونلاين بين الفروع مع الدعوات والردود والحضور.",
    features: [
      { icon: Megaphone, label: "الإشعارات وسجلها", to: "/app/hub" },
      { icon: CalendarDays, label: "الاجتماعات وسجلها", to: "/app/admin/meetings" },
    ],
  },
  {
    key: "support", title: "الدعم الفني والمساعدة", icon: LifeBuoy, to: "/app/support", open: "فتح الدعم",
    desc: "صندوق واحد لتذاكر كل مدارس المجموعة: إنشاء وإسناد وتحويل بين الفروع، ومتابعة المهل والتقارير.",
    features: [
      { icon: LifeBuoy, label: "ملخص الدعم", to: "/app/support", search: { tab: "summary" } },
      { icon: LifeBuoy, label: "كل التذاكر", to: "/app/support", search: { tab: "manage" } },
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
    <dl className="grid grid-cols-4 gap-1.5">
      {items.map((i) => (
        <div key={i.l} className="rounded-lg bg-secondary/50 px-2 py-1.5">
          <dt className="sr-only">{i.l}</dt>
          <dd className="font-display text-lg leading-none tabular-nums">{i.v}</dd>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{i.l}</p>
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {CARDS.map((c) => {
        const locked = c.section ? q.data?.[c.section]?.["enabled"] === false : false;
        return (
          <section key={c.key} aria-labelledby={`card-${c.key}`} aria-disabled={locked || undefined}
            className={"group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md " + (locked ? "opacity-60" : "")}>
            <span aria-hidden className={"absolute inset-x-0 top-0 h-1 " + (locked ? "bg-muted" : c.note ? "bg-warning" : "bg-primary")} />
            <div className="flex items-start gap-3 p-4 pb-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{locked ? <Lock className="size-5" /> : <c.icon className="size-5" />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 id={`card-${c.key}`} className="font-display text-base leading-tight">{c.title}</h2>
                  {locked ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">غير مفعّل</span>
                    : c.note ? <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px]">{c.note}</span>
                    : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success"><CheckCircle2 className="size-3" />متاح</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{c.desc}</p>
              </div>
            </div>
            {c.key === "schools" && !locked && <div className="px-4 pb-3"><SchoolsStats orgId={orgId} /></div>}
            {!locked && c.features.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 px-4 pb-3">
                {c.features.map((f) => (
                  <li key={f.label}>
                    <Link to={f.to} {...(f.search ? { search: f.search } : {})} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs transition-colors hover:border-primary/40 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <f.icon className="size-3.5 shrink-0 text-primary" />{f.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto border-t bg-secondary/30 px-4 py-2.5">
              {locked ? <p className="text-xs text-muted-foreground">علّقه مالك المنصة؛ بياناته محفوظة.</p> : (
                <Link to={c.to} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
