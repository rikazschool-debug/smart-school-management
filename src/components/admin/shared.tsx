import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";

export const TASK_STATUS: Record<string, string> = {
  new: "جديد", in_progress: "قيد التنفيذ", awaiting_confirmation: "بانتظار التأكيد", done: "منجز", returned: "معاد للاستكمال", cancelled: "ملغى",
};
export const REQ_STATUS: Record<string, string> = {
  draft: "مسودة", submitted: "مقدم", in_progress: "قيد المعالجة", completed: "مكتمل", rejected: "مرفوض", returned: "معاد للاستكمال",
};
export const FORM_STATUS: Record<string, string> = { draft: "مسودة", active: "مفعل", archived: "مؤرشف" };
export const PRIORITY: Record<string, string> = { low: "منخفضة", normal: "عادية", high: "عالية" };
export const FIELD_TYPES: Record<string, string> = { text: "نص قصير", longtext: "نص طويل", choice: "اختيار", date: "تاريخ", number: "رقم" };
export const STAFF_ROLES: Record<string, string> = {
  principal: "مدير المدرسة", vice_principal: "الوكيل", dept_head: "رئيس القسم", supervisor: "المشرف", student_affairs: "شؤون الطلاب",
  teacher: "المعلم", counselor: "المرشد", nurse: "الممرض", security: "الأمن",
};

export type Field = { key?: string; label: string; type: string; required: boolean; options: string[] };

export const isLead = (role: string) => role === "principal" || role === "vice_principal";

export function useStaff(school: string) {
  return useQuery({
    queryKey: ["adm-staff", school],
    queryFn: async () => {
      const { data, error } = await db.rpc("staff_directory", { _school: school });
      if (error) throw error;
      const seen = new Set<string>();
      return (data as Row[]).filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)));
    },
  });
}

export function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "ok" | "bad" }) {
  const cls = { muted: "bg-secondary text-secondary-foreground", warn: "bg-accent text-accent-foreground", ok: "bg-primary/10 text-primary", bad: "bg-destructive/10 text-destructive" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—");

export function useEvents(entity: string, id: string) {
  return useQuery({
    queryKey: ["adm-events", entity, id],
    queryFn: async () => {
      const { data, error } = await db.from("adm_events").select("id, action, details, created_at").eq("entity", entity).eq("entity_id", id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as Row[];
    },
  });
}

const ACTIONS: Record<string, string> = {
  created: "أُنشئ", edited: "عُدّل", new_version: "إصدار جديد", draft: "حُفظت مسودة", submitted: "قُدّم", in_progress: "بدأت المعالجة", completed: "اكتمل",
  rejected: "رُفض", returned: "أُعيد", reassigned: "حُوّل", acknowledged: "اطّلع المسؤول", progress: "تحديث التقدم", done: "أُنجز",
  awaiting_confirmation: "بانتظار التأكيد", blocked: "عائق", comment: "تعليق", clarify: "طلب توضيح", updated: "تعديل", cancelled: "أُلغي", confirmed: "أُكّد",
};

export function Timeline({ entity, id }: { entity: string; id: string }) {
  const ev = useEvents(entity, id);
  if (!ev.data?.length) return <p className="text-sm text-muted-foreground">لا توجد أحداث بعد.</p>;
  return (
    <ol className="space-y-2">
      {ev.data.map((e) => (
        <li key={e.id} className="rounded-lg border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span>
            <span className="text-xs text-muted-foreground">{fmt(e.created_at)}</span>
          </div>
          {(e.details?.note || e.details?.body || e.details?.reason) && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{e.details.note ?? e.details.body ?? e.details.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
