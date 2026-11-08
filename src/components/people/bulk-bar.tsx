import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { pp, type PersonKind, type PpCaps, type Tag } from "./shared";

type Result = { id: string; status: "ok" | "refused" | "failed"; reason: string | null };
type Out = { repeat: boolean; ok: number; refused: number; failed: number; results: Result[] };
const ACTION: Record<string, string> = { tag_add: "إسناد وسم", tag_remove: "إزالة وسم", account_on: "تنشيط حساب الدخول", account_off: "إيقاف حساب الدخول" };

/** Selection toolbar for teacher/student/guardian lists. The server re-checks scope and permission for every record (pp_bulk). */
export function BulkBar({ kind, schoolId, caps, tags, count, mode, total, pageCount, onPage, onAll, onClear, resolveIds, nameOf, onExport }: {
  kind: PersonKind; schoolId: string; caps: PpCaps; tags: Tag[]; count: number; mode: "ids" | "all"; total: number; pageCount: number;
  onPage: () => void; onAll: () => void; onClear: () => void; resolveIds: () => Promise<string[]>; nameOf: (id: string) => string | undefined;
  onExport: (ids: string[]) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [action, setAction] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ title: string; out: Out } | null>(null);
  const usable = tags.filter((t) => t.kinds.includes(kind));
  async function run() {
    if (!action) return;
    if (action.startsWith("tag") && !tag) return void toast.error("اختر الوسم");
    const label = `${ACTION[action]}${action.startsWith("tag") ? ` «${usable.find((t) => t.id === tag)?.name}»` : ""}`;
    const n = mode === "all" ? total : count;
    let reason: string | null = null;
    if (action.startsWith("account")) {
      reason = await askText(`${label} لـ ${n} سجل.\nحالة السجل الدراسي أو الوظيفي لا تتغير. اكتب السبب:`, { required: true, ok: "تنفيذ" });
      if (reason == null) return;
    } else if (!(await ask(`${label} لـ ${n} سجل؟`, { ok: "تنفيذ" }))) return;
    setBusy(true);
    try {
      const ids = await resolveIds();
      const key = crypto.randomUUID(); // one key per confirmed run: a double click or retry repeats nothing
      const out = await pp<Out>("pp_bulk", { _key: key, _school: schoolId, _kind: kind, _ids: ids, _action: action, _tag: tag || null, _reason: reason });
      setReport({ title: label, out }); void qc.invalidateQueries();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function exp() {
    setBusy(true);
    try { const ids = await resolveIds(); await onExport(ids); void pp("pp_export_log", { _key: crypto.randomUUID(), _school: schoolId, _kind: kind, _count: ids.length }); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const actions = [
    ...(caps.tags_assign && usable.length ? ["tag_add", "tag_remove"] : []),
    ...(caps.accounts ? ["account_on", "account_off"] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-2 text-sm" role="region" aria-label="التحديد">
      <strong>{mode === "all" ? `جميع النتائج (${total})` : `${count} محدد`}</strong>
      <Button size="sm" variant="ghost" onClick={onPage}>تحديد هذه الصفحة ({pageCount})</Button>
      {mode !== "all" && total > pageCount && <Button size="sm" variant="ghost" onClick={onAll}>تحديد جميع النتائج ({total})</Button>}
      <Button size="sm" variant="ghost" onClick={onClear}>إلغاء التحديد</Button>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        {caps.export && <Button size="sm" variant="outline" disabled={busy} onClick={() => void exp()}>تصدير المحددين</Button>}
        {actions.length > 0 && <>
          <select aria-label="الإجراء الجماعي" className={selectCls()} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">إجراء…</option>
            {actions.map((a) => <option key={a} value={a}>{ACTION[a]}</option>)}
          </select>
          {action.startsWith("tag") && (
            <select aria-label="الوسم" className={selectCls()} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">الوسم…</option>
              {usable.filter((t) => t.active || action === "tag_remove").map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (معطل)"}</option>)}
            </select>
          )}
          <Button size="sm" disabled={busy || !action} onClick={() => void run()}>{busy ? "جارٍ التنفيذ…" : "تنفيذ"}</Button>
        </>}
      </div>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>نتيجة: {report?.title}</DialogTitle></DialogHeader>
          {report && <>
            {report.out.repeat && <p className="text-sm text-muted-foreground">نُفذ هذا الطلب سابقًا؛ عُرضت نتيجته دون تكرار الأثر.</p>}
            <p className="text-sm">نجح {report.out.ok} · رُفض {report.out.refused} · تعذّر {report.out.failed}</p>
            <ul className="divide-y text-sm">
              {report.out.results.map((r) => (
                <li key={r.id} className="flex gap-2 py-1">
                  <span className="flex-1">{nameOf(r.id) ?? "سجل"}</span>
                  <span className={r.status === "ok" ? "text-primary" : "text-destructive"}>{r.status === "ok" ? "نجح" : r.status === "refused" ? "رُفض" : "تعذّر"}</span>
                  {r.reason && <span className="text-xs text-muted-foreground">{r.reason}</span>}
                </li>
              ))}
            </ul>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
