import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { toast } from "sonner";
import { FileList, Uploader } from "@/components/homework/files";
import { arabicError } from "@/lib/session";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

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

const ACTIONS: Record<string, string> = { started: "بدأ التنفيذ", file_added: "أُضيف مرفق", file_removed: "أُزيل مرفق", progress: "تحديث تقدم",
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

/** Attachments for a request/task: row via create_admin_file (checks role/type/size) → upload; reads go through signed URLs. */
export function AdminFiles({ entity, id, canAdd, userId, doneAt }: { entity: "task" | "request"; id: string; canAdd: boolean; userId: string; doneAt?: string | null }) {
  const q = useQuery({
    queryKey: ["adm-files", entity, id],
    queryFn: async () => {
      const fs = ((await db.from("files").select("id, name, storage_path, size_bytes, uploaded_by, created_at").eq("source_type", "admin").eq("category", entity).eq("source_id", id).order("created_at")).data ?? []) as Row[];
      const ids = [...new Set(fs.map((f) => f.uploaded_by))];
      const ps = ids.length ? (((await db.from("profiles").select("id, full_name").in("id", ids)).data ?? []) as Row[]) : [];
      const nm = Object.fromEntries(ps.map((p) => [p.id, p.full_name]));
      return fs.map((f) => ({ ...f, uploader: nm[f.uploaded_by] ?? "—" }));
    },
  });
  const all = q.data ?? [];
  // Files added after completion are addenda: shown separately, never counted as the original proof.
  const late = doneAt ? all.filter((f) => f["created_at"] > doneAt) : [];
  const files = all.filter((f) => !late.includes(f));
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className="font-semibold">المرفقات</p>
      {!files.length && <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p>}
      <FileList files={files} onRemove={canAdd && !doneAt ? async (f) => { if (f["uploaded_by"] !== userId) return void toast.error("يحذف الملف من رفعه فقط"); const { error } = await db.rpc("remove_admin_file", { _file: f["id"] }); if (error) toast.error(arabicError(error)); q.refetch(); } : undefined} />
      {late.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-sm font-medium">ملحق بعد الإنجاز</p>
          <p className="text-xs text-muted-foreground">أضيفت بعد إنجاز التكليف ولا تُعد بديلًا عن إثبات الإنجاز الأصلي.</p>
          <FileList files={late} />
          <ul className="text-xs text-muted-foreground">{late.map((f) => <li key={f["id"]}>{f["name"]} — {f["uploader"]}، {fmt(f["created_at"])}</li>)}</ul>
        </div>
      )}
      {canAdd && doneAt && <p className="text-xs text-muted-foreground">أي ملف يُرفع الآن يظهر «ملحقًا بعد الإنجاز» ولا يغيّر حالة التكليف أو تاريخ إنجازه.</p>}
      {canAdd && <Uploader create={async (f) => { const { data, error } = await db.rpc("create_admin_file", { _entity: entity, _id: id, _name: f.name, _mime: f.type || "application/octet-stream", _size: f.size }); if (error) throw error; return (data as { id: string; storage_path: string }[])[0]!; }} release={(fid) => db.rpc("remove_admin_file", { _file: fid })} onDone={() => q.refetch()} />}
    </div>
  );
}
