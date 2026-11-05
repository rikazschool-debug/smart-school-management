// HR contracts types/labels. The server (hr_contract_*) decides scope and strips compensation for people without comp_view.
export type CompLine = { kind: "basic" | "allowance" | "benefit"; label: string; amount: string; currency: string; period: "monthly" | "annual" | "one_time" };
export type CData = { kind: string; job_title: string | null; start_date: string; end_date: string | null; probation_days: number | null; probation_terms: string | null; terms: string | null; notes: string | null; assignment_id: string | null; template_id: string | null; template_name?: string; template_version?: number; body?: string; comp?: CompLine[] };
export type CVersion = { id: string; version: number; status: string; effective_from: string; reason: string | null; updated_at: string; data: CData; comp_hidden: boolean; created_by: string | null; issued_by: string | null; issued_at: string | null; ack_at: string | null; ack_source: string | null; ack_reason: string | null; ack_by: string | null };
export type CRow = { id: string; contract_no: string; status: string; employee_id: string; employee: string; employee_no: string; school_id: string; school: string; kind: string; job_title: string | null; start_date: string; end_date: string | null; in_force: number | null; expired: boolean; renewed?: boolean; days_left: number | null; pending_version: number | null; draft_version: number | null; basic: { amount: number; currency: string; period: string } | null };
export type CDetail = {
  self?: boolean;
  contract: { id: string; contract_no: string; status: string; in_force: number | null; start_date: string; end_date: string | null; ended_on: string | null; end_reason?: string | null; school_id?: string; school: string; parent_id?: string | null; parent_no?: string | null; employee_id?: string; employee?: string; employee_no?: string; has_login?: boolean };
  versions: CVersion[];
  renewals?: { id: string; contract_no: string; status: string }[];
  can?: { draft: boolean; approve: boolean; comp_view: boolean; comp_edit: boolean };
  events?: { at: string; action: string; reason: string | null; by: string }[];
};
export type CCaps = { enabled: boolean; caps: Record<"view" | "draft" | "approve" | "comp_view" | "comp_edit" | "export", boolean>; templates_admin: boolean; schools: { id: string; name: string; draft: boolean }[] };

export const C_STATUS: Record<string, string> = { draft: "مسودة", pending: "بانتظار إقرار الموظف", active: "ساري", terminated: "منتهٍ بالإنهاء", cancelled: "ملغى" };
export const V_STATUS: Record<string, string> = { draft: "مسودة", issued: "صادر بانتظار الإقرار", accepted: "مقبول (ساري)", superseded: "سابق (استُبدل)", rejected: "مرفوض", withdrawn: "مسحوب" };
export const KIND: Record<string, string> = { fixed: "محدد المدة", open: "غير محدد المدة", part_time: "دوام جزئي", temporary: "مؤقت" };
export const COMP_KIND: Record<string, string> = { basic: "أساسي", allowance: "بدل", benefit: "استحقاق تعاقدي" };
export const PERIOD: Record<string, string> = { monthly: "شهري", annual: "سنوي", one_time: "مرة واحدة" };
export const EVENT: Record<string, string> = { create: "إنشاء", renewal: "إنشاء تجديد", edit_draft: "تعديل مسودة", redraft: "مسودة جديدة بعد رفض/سحب", amend_draft: "مسودة تعديل", issue: "اعتماد وإصدار", withdraw: "سحب إصدار", "ack:accept": "قبول الموظف", "ack:reject": "رفض الموظف", "ack:accept:paper": "إقرار ورقي بالقبول", "ack:reject:paper": "إقرار ورقي بالرفض", cancel: "إلغاء", terminate: "إنهاء" };

export const money = (l: { amount: string | number; currency: string }) => `${Number(l.amount).toLocaleString("ar-SA-u-nu-latn", { maximumFractionDigits: 2 })} ${l.currency}`;
