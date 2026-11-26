import { CheckCircle2, XCircle, Clock, Users, AlertTriangle } from "lucide-react";
import { fmt, type Any } from "../lib";
import { serverMsg } from "./meta";

const RC = (r: Any, c: string) => ((r?.recipients ?? []) as Any[]).find((x) => x.code === c)?.label ?? c;
const STEP: Record<string, string> = { notify: "إشعار", reminder: "تذكير", escalate: "تصعيد", task: "مهمة", review: "طلب مراجعة" };
const EXCL: Record<string, string> = { outside_scope: "خارج نطاق المدارس المختارة", condition_false: "الشرط غير متحقق" };

/** Read-only rendering of au_simulate_def: the engine computed everything; nothing was sent or written. */
export function SimResult({ s, r }: { s: Any; r: Any }) {
  if (!s) return null;
  if (!s.ok) return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">لا يمكن المحاكاة: {serverMsg(String(s.error ?? ""))}</div>;
  const items = (s.items ?? []) as Any[];
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">محاكاة فعلية من المحرك على البيانات الحالية — لم يُرسل أي إشعار ولم يُنشأ أي سجل.</div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">سجلات مطابقة</div><div className="text-xl font-bold">{s.matched}</div></div>
        <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">مستبعدة</div><div className="text-xl font-bold">{s.excluded}</div></div>
        <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">التشغيل التالي</div><div className="text-xs font-semibold">{s.next_run ? fmt(s.next_run) : "عند وقوع الحدث/يدويًا"}</div></div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{s.quiet?.on && s.quiet?.start ? `منع الإشعارات ${String(s.quiet.start).slice(0, 5)}–${String(s.quiet.end).slice(0, 5)}` : "لا فترة منع"}</span>
        <span>· الحد اليومي {s.limits?.max_per_user_day} لكل مستخدم و{s.limits?.family_max_day} لولي الأمر · التأجيل {s.limits?.cap_defer_days} أيام</span>
        {s.workdays_only && <span>· أيام العمل فقط</span>}
      </div>
      {(s.other_rules ?? []).length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-2 text-xs"><AlertTriangle className="me-1 inline size-3.5" />قواعد معتمدة أخرى على الحدث نفسه (عند التعارض تُرسل الأعلى أولوية):
          {(s.other_rules as Any[]).map((x, i) => <span key={i} className="ms-1 font-semibold">{x.name} (أولوية {x.priority}{x.active ? "، مفعّلة" : ""})</span>)}</div>
      )}
      {(s.preview ?? []).length > 0 && (
        <div className="space-y-1"><div className="text-xs font-bold text-muted-foreground">معاينة الرسالة على أول سجل مطابق</div>
          {(s.preview as Any[]).map((p, i) => <div key={i} className="rounded-lg border bg-card p-2 shadow-sm"><div className="font-semibold">{p.step === "escalate" ? "تصعيد: " : ""}{p.title}</div><div className="text-xs text-muted-foreground">{p.body}</div></div>)}</div>
      )}
      <div>
        <div className="mb-1 text-xs font-bold text-muted-foreground">السجلات المطابقة ومستلموها المتوقعون {s.matched > items.length ? `(أول ${items.length})` : ""}</div>
        {items.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد سجلات مطابقة الآن.</p> : (
          <ul className="max-h-64 space-y-1 overflow-auto">{items.map((it, i) => (
            <li key={i} className="rounded-md border p-2">
              <div className="flex items-center gap-1 font-semibold"><CheckCircle2 className="size-3.5 text-primary" />{it.label}<span className="ms-auto text-xs font-normal text-muted-foreground">{it.school ?? "الإدارة المركزية"}</span></div>
              <div className="mt-1 flex flex-wrap gap-1">{(it.recipients as Any[]).map((x, j) => (
                <span key={j} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${x.eligible ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Users className="size-3" />{STEP[x.step] ?? x.step}: {RC(r, x.code)} — {x.eligible} مؤهل{x.excluded ? ` · ${x.excluded} مستبعد` : ""}{x.would_defer ? ` · ${x.would_defer} سيؤجَّل (الحد)` : ""}{x.conflicts ? ` · ${x.conflicts} تعارض` : ""}
                </span>))}</div>
            </li>))}</ul>)}
      </div>
      {(s.excluded_items ?? []).length > 0 && (
        <details className="rounded-md border p-2"><summary className="cursor-pointer text-xs font-bold text-muted-foreground">السجلات المستبعدة وأسبابها</summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto text-xs">{(s.excluded_items as Any[]).map((x, i) => <li key={i} className="flex gap-1"><XCircle className="size-3.5 text-muted-foreground" />{x.label} — {EXCL[x.reason] ?? x.reason}</li>)}</ul></details>
      )}
    </div>
  );
}
