import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError } from "@/lib/session";

export type CatField = { k: string; l: string; s?: boolean; c?: boolean; r?: boolean; u?: boolean };
export type CatRes = { key: string; label: string; group: string; ops: { read?: boolean; create?: boolean; update?: boolean }; fields: CatField[]; events?: string[]; filters?: string[]; sortable?: string[]; search?: string; date?: string; all_schools_only?: boolean; own_key_only?: boolean; create_mode?: string };

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
export async function act<T = unknown>(fn: string, args: Record<string, unknown>, ok?: string): Promise<T | null> {
  try { const r = await rpc<T>(fn, args); if (ok) toast.success(ok); return r; } catch (e) { toast.error(arabicError(e)); return null; }
}

export function useCatalog() {
  return useQuery({ queryKey: ["api", "catalog"], staleTime: Infinity, queryFn: () => rpc<CatRes[]>("api_catalog_view", {}) });
}

export const EVENT_LABELS: Record<string, string> = {
  "student.created": "إضافة طالب", "student.updated": "تعديل بيانات طالب", "attendance.recorded": "تسجيل حضور/غياب", "transport.updated": "تحديث اشتراك نقل",
  "admission.status_changed": "تغيّر حالة طلب تسجيل", "notice.published": "نشر إعلان", "payment.recorded": "تسجيل سداد", "payment.reversed": "عكس سداد", ping: "اختبار اتصال",
};
export const OUTCOME: Record<string, { l: string; cls: string }> = {
  ok: { l: "ناجح", cls: "bg-success/15 text-success" }, replay: { l: "إعادة مطابقة", cls: "bg-muted text-muted-foreground" }, denied: { l: "مرفوض الصلاحية", cls: "bg-destructive/15 text-destructive" },
  rejected: { l: "مرفوض التحقق", cls: "bg-warning/15 text-warning-foreground" }, rate_limited: { l: "تجاوز الحد", cls: "bg-warning/15 text-warning-foreground" }, error: { l: "خطأ", cls: "bg-destructive/15 text-destructive" },
};
export const KEY_STATUS: Record<string, string> = { active: "فعّال", paused: "موقوف مؤقتًا", revoked: "ملغى" };
export const HOOK_STATUS: Record<string, string> = { active: "فعّال", paused: "موقوف", disabled: "معطّل" };
export const DELIVERY_STATUS: Record<string, string> = { pending: "بانتظار الإرسال", sending: "قيد الإرسال", delivered: "وصل", failed: "فشل — يعاد", dead: "متوقف بعد 6 محاولات" };
export const fmt = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "short", timeStyle: "short" }) : "—");

export function Badge({ children, cls }: { children: ReactNode; cls?: string | undefined }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls ?? "bg-muted text-muted-foreground"}`}>{children}</span>;
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      {(title || action) && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">{title && <h3 className="font-display text-sm font-bold">{title}</h3>}{action}</div>}
      {children}
    </section>
  );
}

/** Shows a secret exactly once; closing the dialog forgets it. */
export function SecretDialog({ secret, title, note, onClose }: { secret: string | null; title: string; note: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={!!secret} onOpenChange={(o) => { if (!o) { setCopied(false); onClose(); } }}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{note}</DialogDescription></DialogHeader>
        <div className="break-all rounded-md border bg-muted p-3 font-mono text-sm" dir="ltr">{secret}</div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(secret ?? ""); setCopied(true); toast.success("نُسخ"); }}><Copy className="ms-1 h-4 w-4" />{copied ? "تم النسخ" : "نسخ"}</Button>
          <Button onClick={() => { setCopied(false); onClose(); }}>حفظته في مكان آمن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Json({ v }: { v: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs" dir="ltr">{JSON.stringify(v, null, 2)}</pre>;
}

export type { Row };
