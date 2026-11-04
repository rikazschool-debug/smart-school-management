import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";

export type Kind = "school" | "bus";
type Sch = { id: string; name: string };
export type MtCaps = Record<Kind, Record<"request" | "execute" | "follow" | "view" | "fleet", Sch[]>>;
export type MtMe = { enabled: boolean; owner?: boolean; caps?: MtCaps; reopen_days?: number };

/** Capabilities come only from the server (mt_me → perm_allows per branch); the UI mirrors them. */
export function useMtMe(orgId: string | null, enabled = true) {
  return useQuery({
    enabled: !!orgId && enabled,
    queryKey: ["mt-me", orgId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("mt_me", { _org: orgId });
      if (error) throw error;
      return data as MtMe;
    },
  });
}

/** Does the caller hold any maintenance capability for this kind (any branch)? */
export const hasKind = (me: MtMe | undefined, k: Kind) =>
  !!me?.enabled && !!me.caps && Object.values(me.caps[k]).some((s) => s.length > 0);
export const canFleet = (me: MtMe | undefined) => !!me?.caps?.bus.fleet.length;

export const KIND_LABEL: Record<Kind, string> = { school: "صيانة المدارس", bus: "صيانة الباصات" };
export const STATUS: Record<string, string> = {
  new: "جديد", awaiting_assign: "بانتظار الإسناد", assigned: "مسند وبانتظار الاستلام", clarify: "مطلوب توضيح", scheduled: "زيارة مجدولة",
  in_progress: "قيد التنفيذ", waiting_parts: "بانتظار قطع أو جهة خارجية", awaiting_approval: "بانتظار اعتماد الإنجاز", closed: "مغلق بإنجاز معتمد",
  returned: "معاد للاستكمال", cancelled: "ملغى بسبب",
};
export const STATUS_TONE: Record<string, string> = {
  awaiting_assign: "bg-warning/15 text-warning-foreground", clarify: "bg-warning/15 text-warning-foreground", returned: "bg-warning/15 text-warning-foreground",
  awaiting_approval: "bg-primary/10 text-primary", closed: "bg-success/10 text-success", cancelled: "bg-muted text-muted-foreground",
};
export const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "مرتفعة", urgent: "عاجلة" };
export const BUS_STATUS: Record<string, string> = { available: "متاح للخدمة", stopped: "متوقف للصيانة", inspection: "بانتظار فحص" };
export const EVENT: Record<string, string> = {
  create: "إنشاء الطلب", parts: "اقتراح بنود شراء", need: "إنشاء احتياج شراء مرتبط", auto_assign: "إسناد تلقائي", assign: "إسناد", reassign: "إعادة إسناد", claim: "استلام الطلب", accept: "استلام الطلب",
  decline: "اعتذار عن الإسناد", clarify: "طلب توضيح", clarified: "توضيح من مقدم الطلب", reply: "رد", note: "ملاحظة داخلية", schedule: "تحديد موعد الزيارة",
  reschedule: "إعادة جدولة", progress: "تحديث التقدم", waiting: "بانتظار قطع أو جهة خارجية", submit_completion: "طلب اعتماد الإنجاز", approve: "اعتماد الإنجاز وإغلاق",
  return: "إعادة للاستكمال", reopen: "إعادة فتح", cancel: "إلغاء", cost: "تحديث التكلفة التقديرية", file: "إرفاق ملف",
};
export const PLACE_TYPES = ["فصل", "مكتب", "دورة مياه", "معمل", "ممر", "ساحة", "مستودع", "أخرى"];
export const dt = (d?: string | null) => (d ? new Date(d).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—");
export const dd = (d?: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" }) : "—");
