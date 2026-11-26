import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

/** Every automation command is a permission-checked Postgres RPC (owner, or tree grant + live scoped delegation); the UI only mirrors au_me. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = (await supabase.rpc(fn as never, args as never)) as unknown as { data: T; error: { message: string } | null };
  if (r.error) throw r.error;
  return r.data;
}
export const fmt = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }) : "—");
export const fmtDay = (t?: string | null) => (t ? new Date(t).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric" }) : "—");
export const ms = (v?: number | null) => (v == null ? "—" : v >= 60000 ? `${Math.round(v / 60000)} د` : v >= 1000 ? `${(v / 1000).toFixed(1)} ث` : `${v} ms`);

export type AuMe = { owner: boolean; full: boolean; perms: Record<string, boolean>; separate_approver: boolean; delegations: Any[] };
/** Caller's automation permissions (server-computed). `enabled` false skips the call (owner/family contexts). */
export function useAuMe(orgId: string | null, enabled = true) {
  return useQuery({ queryKey: ["au-me", orgId], enabled: !!orgId && enabled, staleTime: 60_000, retry: false, queryFn: async () => { try { return await rpc<AuMe>("au_me", { _org: orgId }); } catch { return null; } } });
}
/** Per-rule capabilities from the server (_au_rule_caps); a UI mirror only. */
export type Caps = Partial<Record<"owner" | "create" | "edit" | "clone" | "designer" | "simulate" | "submit" | "versions" | "restore" | "archive" | "review" | "approve" | "reject" | "activate" | "pause" | "rerun" | "retry", boolean>>;
export const can = (me: AuMe | null | undefined, k: string) => !!me && (me.owner || !!me.perms[k]);
export function useRegistry(orgId: string) {
  return useQuery({ queryKey: ["au-registry", orgId], staleTime: 300_000, queryFn: () => rpc<Any>("au_registry", { _org: orgId }) });
}
export function useOrgSchools(orgId: string) {
  return useQuery({
    queryKey: ["au-schools", orgId], staleTime: 300_000,
    queryFn: async () => { const r = await supabase.from("schools").select("id,name,is_active").eq("org_id", orgId).order("name"); if (r.error) throw r.error; return (r.data ?? []) as { id: string; name: string; is_active: boolean }[]; },
  });
}

export const RULE_ST: Record<string, [string, string, string]> = {
  draft: ["مسودة", "bg-muted text-muted-foreground", "تُعدَّل بحرية، ولا تعمل."],
  validated: ["تم التحقق", "bg-secondary text-secondary-foreground", "اجتازت فحص الخادم؛ المحاكاة هي الخطوة التالية."],
  simulated: ["تمت المحاكاة", "bg-secondary text-secondary-foreground", "جُرّبت على البيانات الحالية دون إرسال؛ جاهزة للإرسال للاعتماد."],
  pending_review: ["بانتظار المراجعة", "bg-warning/15 text-warning-foreground", "متوسطة أو عالية الخطورة؛ تحتاج مراجعة قبل الاعتماد."],
  pending_approval: ["بانتظار الاعتماد", "bg-warning/15 text-warning-foreground", "تنتظر معتمدًا مخوّلًا غير منشئها."],
  needs_changes: ["تحتاج إلى تعديل", "bg-destructive/10 text-destructive", "أُعيدت مع ملاحظات؛ عدّلها ثم أعد التحقق والمحاكاة."],
  rejected: ["مرفوضة", "bg-destructive/10 text-destructive", "رُفضت مع السبب؛ يمكن تعديلها وإعادة إرسالها."],
  approved: ["معتمدة", "bg-primary/10 text-primary", "لها إصدار معتمد، ولا تعمل حتى تفعيلها."],
  paused: ["متوقفة مؤقتًا", "bg-secondary text-secondary-foreground", "سبق تفعيلها ثم أوقفت؛ الإصدار المعتمد محفوظ."],
  active: ["مفعّلة", "bg-primary/15 text-primary", "الإصدار المعتمد يعمل الآن."],
  archived: ["مؤرشفة", "bg-muted text-muted-foreground", "متوقفة ومخفية من القوائم؛ سجلات تنفيذها محفوظة."],
};
export const RISK: Record<string, [string, string, string]> = {
  low: ["منخفضة", "bg-primary/10 text-primary", "إشعار داخلي روتيني في مدرسة واحدة: اعتماد مباشر بعد الإرسال."],
  medium: ["متوسطة", "bg-warning/15 text-warning-foreground", "مهام أو تصعيد أو أولياء أمور أو عدة مدارس: مراجعة ثم اعتماد."],
  high: ["عالية", "bg-destructive/10 text-destructive", "مالية أو موارد بشرية أو مقيدة أو واسعة: لا يعتمدها ولا يفعّلها إلا مدير النظام."],
};
export const JOB_ST: Record<string, [string, string]> = {
  queued: ["بالانتظار", "bg-secondary text-secondary-foreground"], done: ["منفّذة", "bg-primary/15 text-primary"],
  cancelled: ["ملغاة", "bg-muted text-muted-foreground"], dead: ["فاشلة — معزولة", "bg-destructive/10 text-destructive"],
};
export const SCHED: Record<string, string> = {
  event: "فوري عند وقوع الحدث", condition: "عند تحقق الشرط", every_5m: "كل 5 دقائق", every_15m: "كل 15 دقيقة", every_30m: "كل 30 دقيقة",
  hourly: "كل ساعة", daily: "يوميًا", weekly: "أسبوعيًا", monthly: "شهريًا", at: "موعد مخصص", manual: "يدوي",
};
export const AUDIT_ACT: Record<string, string> = {
  save_draft: "حفظ مسودة", approve: "اعتماد إصدار", activate: "تفعيل", deactivate: "إيقاف", run_now: "تشغيل يدوي", retry: "إعادة محاولة",
  kill_switch: "الإيقاف الطارئ", clone: "نسخ قاعدة", archive: "أرشفة", unarchive: "استرجاع من الأرشيف", restore_version: "استرجاع إصدار سابق", settings: "تعديل الإعدادات",
  validate: "تحقق", simulate: "محاكاة", submit: "إرسال للاعتماد", review_pass: "اجتياز المراجعة", return: "إعادة للتعديل", reject: "رفض", create: "إنشاء",
  delegation_create: "منح تفويض", delegation_revoke: "سحب تفويض", policy: "تعديل سياسة الاعتماد", denied: "محاولة وصول مرفوضة", platform_kill: "إيقاف المنصة الطارئ",
};
const ERR: [RegExp, string][] = [
  [/condition no longer true/, "انتهى المسار: لم يعد السجل مطابقًا (مثل إنجاز التكليف)"], [/rule condition false/, "لم يعد شرط القاعدة متحققًا"],
  [/rule inactive\/changed or killed/, "القاعدة أوقفت أو تغيّر إصدارها أو الإيقاف الطارئ مفعّل"], [/school out of scope/, "الفرع خارج النطاق أو موقوف"],
  [/event not ready/, "الحدث لم يعد جاهزًا"], [/approval authority lost/, "أُلغي: لم يعد من اعتمد القاعدة أو فعّلها مخوّلًا"],
];
export const jobError = (e?: string | null) => (e ? ERR.find(([r]) => r.test(e))?.[1] ?? e : "—");
export const DOW = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
