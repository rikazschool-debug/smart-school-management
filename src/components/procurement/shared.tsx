import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;
export type Scope = "own" | "assigned" | "branch" | "org" | null;
export type PcMe = {
  enabled: boolean; is_owner: boolean; me: string; limit: number | null;
  caps: Record<"view" | "create" | "edit" | "review" | "approve" | "disburse" | "cancel" | "export" | "settings", Scope>;
  schools: { id: string; name: string }[]; create_schools: string[]; categories: { id: string; name: string }[];
  settings: { vat_rate: number; vat_inclusive: boolean; require_attachment: boolean; block_overdue: boolean; low_balance: number; purchase_request_above: number | null; due_soon_days: number; rev: number } | null;
};

/** Capabilities come only from the server (pc_me → perm_scope); the UI just mirrors them. */
export function usePcMe(orgId: string | null, enabled = true) {
  return useQuery({
    enabled: !!orgId && enabled,
    queryKey: ["pc-me", orgId],
    queryFn: async () => {
      const { data, error } = await db.rpc("pc_me", { _org: orgId });
      if (error) throw error;
      return data as PcMe;
    },
    staleTime: 30_000,
  });
}

export type PcForm = { id: string; version: number; status: "draft" | "published" | "archived"; core: Row[]; fields: Row[]; note: string | null; published_at: string | null; published_by: string | null };
/** All form versions the caller may see (drafts only for settings holders); records keep the version they were created with. */
export function usePcForms(orgId: string | null) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["pc-forms", orgId],
    queryFn: async () => {
      const { data, error } = await db.rpc("pc_form_get", { _org: orgId });
      if (error) throw error;
      return data as { default_core: Row[]; can_edit: boolean; versions: PcForm[] };
    },
  });
}

export const C_STATUS: Record<string, string> = {
  draft: "مسودة", submitted: "بانتظار الاعتماد", approved: "معتمدة بانتظار الصرف", disbursed: "مصروفة — مفتوحة", settling: "قيد التسوية",
  closed: "مغلقة", rejected: "مرفوضة", cancelled: "ملغاة",
};
export const E_STATUS: Record<string, string> = {
  draft: "مسودة", submitted: "مرسل للمراجعة", in_review: "قيد المراجعة", returned: "معاد للاستكمال", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى",
};
export const TONE: Record<string, "muted" | "warn" | "ok" | "bad"> = {
  draft: "muted", submitted: "warn", in_review: "warn", returned: "warn", approved: "ok", disbursed: "ok", settling: "warn", closed: "muted", rejected: "bad", cancelled: "muted",
};
export const MOVE: Record<string, string> = {
  disburse: "صرف العهدة", topup: "تعزيز", refund: "استرداد", expense: "مصروف معتمد", return: "إعادة نقدية", carry_out: "ترحيل خارج", carry_in: "ترحيل داخل", adjust: "تصحيح",
};
export const METHOD: Record<string, string> = { cash: "نقدًا", transfer: "تحويل بنكي", card: "بطاقة", cheque: "شيك" };
export const ACTION: Record<string, string> = {
  create: "إنشاء", update: "تعديل", submit: "إرسال", approve: "اعتماد", reject: "رفض", return: "إعادة للاستكمال", cancel: "إلغاء", review: "بدء المراجعة",
  disburse: "صرف", ack: "تأكيد الاستلام", refund_request: "طلب استرداد", refund_collected: "تأكيد الاسترداد", refund_rejected: "رفض الاسترداد",
  file_added: "إرفاق ملف", settle_request: "طلب تسوية", settle_reopened: "إعادة فتح بعد التسوية", topup: "تعزيز مصروف", topup_paid: "صرف التعزيز",
  adjust: "معالجة فرق", carry_out: "ترحيل خارج", carry_in: "ترحيل داخل", return_cash: "استلام مبلغ معاد", close: "إغلاق بعد التسوية", transfer_out: "نقل لشخص آخر",
  transfer_in: "استلام عهدة منقولة", transfer_accepted: "تسلّم المستلم الجديد", decline: "اعتذار عن التسلّم", form_draft: "حفظ مسودة النموذج", form_publish: "نشر النموذج", form_discard: "حذف مسودة النموذج", file_removed: "إزالة ملف", settings: "تغيير الإعدادات", category: "تصنيف", review_edit: "تعديل المراجع",
};

const nf = new Intl.NumberFormat("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const sar = (v: unknown) => `${nf.format(Number(v ?? 0))} ر.س`;
export const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
export const day = (d?: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" }) : "—");
export const todayRiyadh = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
export const SCOPE_LABEL: Record<string, string> = { own: "الخاص بي", assigned: "المسند إليّ", branch: "فرعي", org: "كل المؤسسة" };

/** Preview only (same rule as the server's _pc_calc): half-up to cents, VAT per line then summed. The saved values come from the server. */
export function calcLine(amount: number, taxable: boolean, rate: number, inclusive: boolean) {
  const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
  if (!taxable || rate === 0) { const n = r2(amount); return { net: n, vat: 0, total: n }; }
  if (inclusive) { const t = r2(amount); const n = r2(t / (1 + rate / 100)); return { net: n, vat: r2(t - n), total: t }; }
  const n = r2(amount); const v = r2((n * rate) / 100); return { net: n, vat: v, total: r2(n + v) };
}
