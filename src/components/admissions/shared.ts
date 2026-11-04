import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";

export type Sch = { id: string; name: string };
export type AdCaps = Record<"view" | "view_branch" | "create" | "edit" | "contact" | "assign" | "transfer" | "decide" | "export" | "link" | "students" | "settings", Sch[]>;
export type AdMe = { enabled: boolean; owner?: boolean; org_level?: boolean; caps?: AdCaps };

/** Admissions capabilities of the signed-in person (server-resolved: base role + grants − deny, per branch). */
export function useAdMe(orgId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["ad-me", orgId], enabled: !!orgId && enabled, staleTime: 30_000,
    queryFn: async () => { const { data, error } = await db.rpc("ad_me", { _org: orgId }); if (error) throw error; return data as AdMe; },
  });
}
export const hasAdmissions = (m: AdMe | undefined) => !!m?.enabled && !!m.caps && (m.caps.view.length > 0 || m.caps.view_branch.length > 0 || !!m.org_level);

export const STATUS: Record<string, string> = {
  new: "جديد", received: "تم الاستلام", following: "جارٍ المتابعة", incomplete: "غير مكتمل/بانتظار بيانات", evaluating: "قيد التقييم",
  waitlist: "قائمة انتظار", accepted: "مقبول", rejected: "غير مقبول", withdrawn: "منسحب", closed: "مغلق",
};
export const CHANNEL: Record<string, string> = { call: "اتصال", whatsapp: "واتساب", sms: "رسالة نصية", email: "بريد", visit: "زيارة", other: "أخرى" };
export const OUTCOME: Record<string, string> = { reached: "تم التواصل", no_answer: "لم يرد", wrong_number: "رقم غير صحيح", callback: "طلب معاودة الاتصال", other: "أخرى" };
export const ACTION: Record<string, string> = { create: "إنشاء الطلب", status: "تغيير الحالة", contact: "تواصل", note: "ملاحظة داخلية", follow: "موعد متابعة", decide: "قرار", reopen: "إعادة فتح", assign: "إسناد", transfer: "تحويل فرع", edit: "تعديل بيانات", link: "ربط بسجل طالب", unlink: "فك الربط" };
export const ENR: Record<string, string> = { active: "مقيد", withdrawn: "منسحب", transferred: "منقول", graduated: "متخرج", none: "غير مسكّن" };
export const tone = (s: string) => (s === "accepted" ? "bg-success/15 text-success" : s === "rejected" || s === "withdrawn" || s === "closed" ? "bg-muted text-muted-foreground" : s === "new" ? "bg-primary/15 text-primary" : s === "incomplete" ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-secondary-foreground");
