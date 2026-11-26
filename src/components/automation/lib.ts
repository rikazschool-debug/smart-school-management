import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

/** Every automation command is an owner-checked Postgres RPC; the UI never decides permissions. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = (await supabase.rpc(fn as never, args as never)) as unknown as { data: T; error: { message: string } | null };
  if (r.error) throw r.error;
  return r.data;
}
export const fmt = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }) : "—");
export const fmtDay = (t?: string | null) => (t ? new Date(t).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric" }) : "—");
export const ms = (v?: number | null) => (v == null ? "—" : v >= 60000 ? `${Math.round(v / 60000)} د` : v >= 1000 ? `${(v / 1000).toFixed(1)} ث` : `${v} ms`);

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
  draft: ["مسودة", "bg-muted text-muted-foreground", "لم تُعتمد بعد، ولا تعمل."],
  changed: ["تعديلات بانتظار الاعتماد", "bg-warning/15 text-warning-foreground", "الإصدار المعتمد كما هو، والمسودة الحالية تختلف عنه وتحتاج اعتمادًا."],
  paused: ["معتمدة — موقوفة", "bg-secondary text-secondary-foreground", "لها إصدار معتمد، لكنها لا تعمل حتى تفعيلها."],
  active: ["مفعّلة", "bg-primary/15 text-primary", "الإصدار المعتمد يعمل الآن."],
  archived: ["مؤرشفة", "bg-muted text-muted-foreground", "متوقفة ومخفية من القوائم؛ سجلات تنفيذها محفوظة."],
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
};
const ERR: [RegExp, string][] = [
  [/condition no longer true/, "انتهى المسار: لم يعد السجل مطابقًا (مثل إنجاز التكليف)"], [/rule condition false/, "لم يعد شرط القاعدة متحققًا"],
  [/rule inactive\/changed or killed/, "القاعدة أوقفت أو تغيّر إصدارها أو الإيقاف الطارئ مفعّل"], [/school out of scope/, "الفرع خارج النطاق أو موقوف"],
  [/event not ready/, "الحدث لم يعد جاهزًا"],
];
export const jobError = (e?: string | null) => (e ? ERR.find(([r]) => r.test(e))?.[1] ?? e : "—");
export const DOW = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
