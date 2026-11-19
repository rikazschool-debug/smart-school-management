import { createContext, useContext, useLayoutEffect, useEffect } from "react";
import type { NavKey } from "@/lib/roles";

/** Menu-derived heading for the current page: the sidebar label is the source of truth for the page title. */
export type PageMeta = { group: string | null; label: string | null; desc: string | null; exact: boolean; register: () => () => void };
const Ctx = createContext<PageMeta | null>(null);
export const PageMetaProvider = Ctx.Provider;
export function usePageMeta() { return useContext(Ctx); }
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
export function useRegisterHeader(on = true) {
  const m = useContext(Ctx);
  // the layout's fallback header must not register itself, or it would hide and re-show forever
  useIso(() => (on ? m?.register() : undefined), [m?.register, on]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Picks the most specific visible menu entry for a path (longest matching link). */
export function pickNavKey(path: string, entries: { key: NavKey; to: string; tab?: string | undefined }[], tab?: string | null): NavKey | null {
  let best: { key: NavKey; len: number; score: number } | null = null;
  for (const e of entries) {
    const hit = e.to === "/app" ? path === "/app" : path === e.to || path.startsWith(e.to + "/");
    if (!hit) continue;
    const score = e.tab ? (tab === e.tab ? 2 : -1) : 1;
    if (score < 0) continue;
    if (!best || e.to.length > best.len || (e.to.length === best.len && score > best.score)) best = { key: e.key, len: e.to.length, score };
  }
  return best?.key ?? null;
}

/** Short purpose line for pages that do not supply their own description. */
export const NAV_DESC: Partial<Record<NavKey, string>> = {
  collaboration: "مساحة مهنية للكادر لتبادل الخبرات ومواد المكتبة الرقمية.",
  family_requests: "طلبات أولياء الأمور المقدَّمة للمدرسة ومتابعة حالتها والرد عليها.",
  signup_requests: "طلبات الانضمام إلى المنصة ومراجعتها واتخاذ القرار بشأنها.",
  platform_notices: "إشعارات تصدرها المنصة للمجموعات والمستخدمين.",
  platform_subs: "اشتراكات المجموعات والأقسام المتاحة في كل باقة.",
  schools: "بيانات المدارس والفروع التابعة للمجموعة وحالتها.",
  academic: "المراحل والصفوف والشعب والأقسام والمواد التي يقوم عليها العمل الدراسي.",
  teachers: "سجل الكادر التعليمي والإداري في الفرع مع الإسناد والوسوم.",
  courses: "المقررات الدراسية لكل شعبة وإسنادها إلى المعلمين.",
  tags: "وسوم تصنيف الطلاب والكادر لاستخدامها في التصفية والاستهداف.",
  chat_settings: "إعدادات المحادثات والردود المحفوظة والتلقائية.",
  homework: "إنشاء الواجبات ومتابعة التسليم والتصحيح.",
  tests: "إعداد الاختبارات وتصحيحها واعتماد نتائجها ونشرها.",
  student_guidance: "سجلات التوجيه الطلابي والمتابعة والخطط الفردية.",
  gifted_care: "برامج رعاية الموهوبين والترشيحات والمشاركين.",
  remedial_plans: "الخطط العلاجية للطلاب ومتابعة تنفيذها.",
  supervision: "زيارات الإشراف التربوي ونماذجها واعتمادها.",
  results: "نتائج الطلاب المنشورة.",
  schedule: "الجدول المدرسي المعتمد وحصص كل شعبة ومعلم.",
  attendance: "تسجيل الحضور والغياب والاستئذان ومتابعته.",
  station: "مسح بطاقات الطلاب عند البوابة ونداء الانصراف.",
  pickup: "طلبات خروج الطلاب واستئذانهم وتسليمهم.",
  duties: "مواقع المناوبة والإشراف اليومي وجدول توزيعها.",
  notifications: "كل التنبيهات الواردة إليك في مكان واحد.",
  support: "تذاكر الدعم الفني ومتابعة طلبات المساعدة.",
  calls: "سجل المكالمات الهاتفية وقوائم الانتظار.",
  school_home: "فروع المجموعة وتفاصيل كل مدرسة.",
  hr: "ملفات الموظفين وكل خدمات الموارد البشرية.",
  my_hr: "بياناتك الوظيفية وطلباتك لدى الموارد البشرية.",
  permissions: "أدوار المستخدمين وصلاحياتهم في كل قسم.",
  operations: "بوابة النقل المدرسي وصيانة المركبات.",
  transport: "سجلات المركبات الأساسية.",
};
