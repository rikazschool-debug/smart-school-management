import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, ArrowLeft, Building2, Construction, IdCard, KeyRound, Link2, Lock, PauseCircle, PencilLine, Plus, ShieldCheck, Wallet, Wrench, Bus, UserPlus, Megaphone, CalendarDays, type LucideIcon, LifeBuoy, Phone } from "lucide-react";
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
      { icon: CalendarDays, label: "الاجتماعات", to: "/app/admin/meetings" },
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
    key: "school_maint", section: "operations", title: "إدارة صيانة المباني", icon: Wrench, to: "/app/maintenance", open: "فتح صيانة المباني",
    desc: "طلبات صيانة مباني المدارس وفروعها من الطلب حتى اعتماد الإنجاز.",
    features: [
      { icon: Plus, label: "طلب صيانة جديد", to: "/app/maintenance", search: { new: "1" } },
      { icon: Wrench, label: "طلبات صيانة المباني", to: "/app/maintenance" },
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
    key: "hub", section: "comm_hub", title: "إدارة الإشعارات", icon: Megaphone, to: "/app/hub", open: "فتح إدارة الإشعارات",
    desc: "إشعارات موجّهة لفروع وفئات وأشخاص محددين مع معاينة وسجل، وتعاميم لكل الفروع أو مدارس محددة.",
    features: [
      { icon: Megaphone, label: "الإشعارات وسجلها", to: "/app/hub" },
      { icon: Megaphone, label: "التعاميم", to: "/app/hub", search: { tab: "circulars" } },
    ],
  },
  {
    key: "support", title: "الدعم الفني والمساعدة", icon: LifeBuoy, to: "/app/support", open: "فتح الدعم",
    desc: "صندوق واحد لتذاكر كل مدارس المجموعة: إنشاء وإسناد وتحويل بين الفروع، ومتابعة المهل والتقارير، والمكالمات الهاتفية.",
    features: [
      { icon: LifeBuoy, label: "ملخص الدعم", to: "/app/support", search: { tab: "summary" } },
      { icon: LifeBuoy, label: "كل التذاكر", to: "/app/support", search: { tab: "manage" } },
      { icon: Phone, label: "المكالمات الهاتفية", to: "/app/calls", search: { mq: "live" } },
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

/** Group-wide figures shown as a strip above the sections (real data from schools overview). */
function SchoolsStats({ orgId }: { orgId: string | null }) {
  const q = useSchoolsOverview(orgId);
  if (q.isLoading) return <div className="h-[72px] animate-pulse rounded-2xl bg-secondary/50" aria-label="جارٍ عدّ المدارس" />;
  if (q.error || !q.data) return null;
  const active = q.data.filter((s) => s["is_active"]).length;
  const paused = q.data.length - active;
  const staff = q.data.reduce((a, s) => a + Number(s["staff_total"] ?? 0), 0);
  const students = q.data.reduce((a, s) => a + Number(s["students"] ?? 0), 0);
  const items = [
    { v: active, l: "مدرسة نشطة", icon: Building2 },
    { v: paused, l: "فرع موقوف", icon: PauseCircle },
    { v: staff, l: "موظف مرتبط", icon: IdCard },
    { v: students, l: "طالب", icon: UserPlus },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-card sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.l} className="flex items-center gap-3 px-4 py-3 sm:[&:not(:first-child)]:border-s">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><i.icon className="size-5" /></span>
          <div className="min-w-0">
            <dd className="font-display text-2xl leading-none tabular-nums">{i.v}</dd>
            <dt className="mt-1 truncate text-xs text-muted-foreground">{i.l}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}

const CAP = 5;
function SectionCard({ c, locked }: { c: Card; locked: boolean }) {
  const [all, setAll] = useState(false);
  const list = all ? c.features : c.features.slice(0, CAP);
  const more = c.features.length - CAP;
  return (
    <section aria-labelledby={`card-${c.key}`} aria-disabled={locked || undefined}
      className={"group relative flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-all duration-200 " + (locked ? "opacity-60" : "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md")}>
      <div className="flex items-start gap-3">
        <span className={"grid size-10 shrink-0 place-items-center rounded-xl transition-colors " + (locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground")}>
          {locked ? <Lock className="size-5" /> : <c.icon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`card-${c.key}`} className="font-display text-[15px] leading-snug">{c.title}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px]">
            {locked ? <span className="text-muted-foreground">غير مفعّل</span>
              : c.note ? <><span className="size-1.5 rounded-full bg-warning" /><span className="text-muted-foreground">{c.note}</span></>
              : <><span className="size-1.5 rounded-full bg-success" /><span className="text-success">متاح</span></>}
          </p>
        </div>
        {!locked && <Link to={c.to} aria-label={c.open} title={c.open} className="grid size-8 shrink-0 place-items-center rounded-full border text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4" /></Link>}
      </div>
      <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground" title={c.desc}>{c.desc}</p>
      {locked ? <p className="mt-auto pt-3 text-xs text-muted-foreground">علّقه مالك المنصة؛ بياناته محفوظة.</p> : (
        <div className="mt-3 border-t pt-2.5">
          <ul className="flex flex-wrap gap-1">
            {list.map((f) => (
              <li key={f.label}>
                <Link to={f.to} {...(f.search ? { search: f.search } : {})}
                  className="inline-flex min-h-7 items-center gap-1 rounded-full border bg-background px-2 text-[11.5px] transition-colors hover:border-primary/40 hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <f.icon className="size-3.5 shrink-0 text-primary/70" />{f.label}
                </Link>
              </li>
            ))}
          </ul>
          {more > 0 && <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-1.5 text-xs font-semibold text-primary hover:underline">{all ? "عرض أقل" : `+${more} أخرى`}</button>}
        </div>
      )}
    </section>
  );
}

export function OwnerPortal({ orgId }: { orgId: string | null }) {
  const q = useOrgSections(orgId);
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const schoolsOn = q.data?.["school_admin"]?.["enabled"] !== false;
  return (
    <div className="space-y-4">
      {schoolsOn && <SchoolsStats orgId={orgId} />}
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((c) => <SectionCard key={c.key} c={c} locked={c.section ? q.data?.[c.section]?.["enabled"] === false : false} />)}
      </div>
    </div>
  );
}
