import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Wand2, XCircle } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ask } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError } from "@/lib/session";
import { readiness, verify, type TTInput } from "@/lib/timetable-model";
import type { SolveResult, Weights } from "@/lib/timetable-solver";

const STATUS: Record<SolveResult["status"], { label: string; tone: string }> = {
  done: { label: "مكتمل", tone: "bg-primary/10 text-primary" },
  partial: { label: "جزئي", tone: "bg-accent text-accent-foreground" },
  infeasible: { label: "تعذر الحل", tone: "bg-destructive/10 text-destructive" },
  timeout: { label: "انتهى وقت البحث", tone: "bg-accent text-accent-foreground" },
};
const PRIORITY: Record<string, { label: string; w: Partial<Weights> }> = {
  spread: { label: "توزيع المادة على الأسبوع", w: { spread: 10, soft: 6, dayPrefs: 3 } },
  teacher: { label: "رغبات المعلمين (التفضيلات)", w: { soft: 14, spread: 5, dayPrefs: 4 } },
  balance: { label: "توازن حمل المعلم وتقليل الفراغات", w: { balance: 4, gaps: 6, spread: 5, soft: 6 } },
};

/** Generation: readiness → worker run (cancel/timeout/progress) → preview → apply/regenerate/ignore.
 *  The server re-checks the input hash and every slot on apply; a result built on old input is refused. */
export function GeneratePanel({ tt, open, onClose, onApplied }: { tt: Row; open: boolean; onClose: () => void; onApplied: () => void }) {
  const [mode, setMode] = useState<"fill" | "redistribute">("fill");
  const [limit, setLimit] = useState(20);
  const [prio, setPrio] = useState("spread");
  const [run, setRun] = useState<{ id: string; input: TTInput } | null>(null);
  const [prog, setProg] = useState<{ placed: number; total: number } | null>(null);
  const [res, setRes] = useState<SolveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seed = useRef(7);
  const input = useQuery({
    queryKey: ["tt-input", tt["id"]],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.rpc("tt_input" as never, { _tt: tt["id"] } as never);
      if (error) throw error;
      return data as unknown as TTInput;
    },
  });
  useEffect(() => () => { worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!open) { setRes(null); setProg(null); } }, [open]);

  const finish = async (runId: string, status: string, summary: unknown) => {
    await db.rpc("tt_gen_finish" as never, { _run: runId, _status: status, _summary: summary } as never);
  };
  const stopWorker = () => { worker.current?.terminate(); worker.current = null; if (timer.current) clearTimeout(timer.current); };

  const start = async () => {
    if (mode === "redistribute" && !(await ask("إعادة التوزيع تحذف كل الحصص غير المثبتة في المسودة عند التطبيق وتوزعها من جديد. المسودة لا تتغير حتى تضغط «تطبيق على المسودة». متابعة؟"))) return;
    setBusy(true); setRes(null); setProg({ placed: 0, total: 0 });
    const { data, error } = await db.rpc("tt_gen_start" as never, { _tt: tt["id"], _mode: mode } as never);
    if (error) { setBusy(false); setProg(null); return void toast.error(arabicError(error)); }
    const d = data as unknown as { run_id: string; input: TTInput };
    setRun({ id: d.run_id, input: d.input });
    const w = new Worker(new URL("../../lib/timetable.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    // hard stop slightly after the solver's own time limit (worker hang / crash)
    timer.current = setTimeout(async () => { stopWorker(); setBusy(false); setProg(null); await finish(d.run_id, "failed", { reason: "worker timeout" }); toast.error("توقفت مهمة التوليد؛ المسودة لم تتغير. أعد المحاولة."); }, (limit + 15) * 1000);
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "progress") setProg({ placed: m.placed, total: m.total });
      else if (m.type === "result") {
        stopWorker(); setBusy(false); setProg(null);
        const r = m.res as SolveResult;
        setRes(r);
        await finish(d.run_id, r.status, { status: r.status, placed: r.slots.length, ms: r.ms, perCourse: r.perCourse.filter((p) => p.placed < p.required || !!p.reason), softMisses: r.softMisses.length });
      } else if (m.type === "error") {
        stopWorker(); setBusy(false); setProg(null);
        await finish(d.run_id, "failed", { reason: m.message });
        toast.error("فشلت مهمة التوليد؛ المسودة لم تتغير. أعد المحاولة.");
      }
    };
    w.onerror = async () => { stopWorker(); setBusy(false); setProg(null); await finish(d.run_id, "failed", { reason: "worker error" }); toast.error("فشلت مهمة التوليد؛ المسودة لم تتغير."); };
    w.postMessage({ input: d.input, opt: { mode, timeLimitMs: limit * 1000, seed: seed.current++, weights: PRIORITY[prio]!.w } });
  };
  const cancel = async () => {
    stopWorker(); setBusy(false); setProg(null);
    if (run) await db.rpc("tt_gen_ignore" as never, { _run: run.id } as never);
    toast("أُلغي التوليد؛ المسودة كما هي.");
  };
  const apply = async () => {
    if (!run || !res) return;
    setBusy(true);
    const { data, error } = await db.rpc("tt_gen_apply" as never, { _run: run.id, _slots: res.slots } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(`طُبّقت النتيجة: أضيفت ${data} حصة إلى المسودة`);
    setRes(null); setRun(null); onApplied(); onClose();
  };
  const ignore = async () => { if (run) await db.rpc("tt_gen_ignore" as never, { _run: run.id } as never); setRes(null); setRun(null); toast("تم التجاهل؛ المسودة كما هي."); };

  const issues = input.data ? readiness(input.data, mode) : [];
  const blocks = issues.filter((i) => i.level === "block");
  const indep = res && run ? verify(run.input, [...res.kept, ...res.slots]) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>توليد الجدول تلقائيًا</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">محرك حل قيود داخل المتصفح، دون ذكاء اصطناعي. القيود الإلزامية لا تُخالف أبدًا لتحقيق تفضيل. لا تتغير المسودة حتى تضغط «تطبيق على المسودة».</p>
        {!res && (
          <div className="grid gap-3 sm:grid-cols-3">
            <fieldset className="space-y-1 sm:col-span-3" disabled={busy}>
              <legend className="text-sm font-medium">ماذا يفعل التوليد؟</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="gm" checked={mode === "fill"} onChange={() => setMode("fill")} /> إكمال الخانات الناقصة مع حفظ كل الحصص الحالية</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="gm" checked={mode === "redistribute"} onChange={() => setMode("redistribute")} /> إعادة توزيع الحصص غير المثبتة (المثبتة 📌 تبقى)</label>
            </fieldset>
            <div className="space-y-1"><Label htmlFor="g-prio">أولوية التفضيلات</Label><select id="g-prio" disabled={busy} className={selectCls("w-full")} value={prio} onChange={(e) => setPrio(e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="g-lim">مهلة البحث</Label><select id="g-lim" disabled={busy} className={selectCls("w-full")} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[10, 20, 45, 90].map((s) => <option key={s} value={s}>{s} ثانية</option>)}</select></div>
          </div>
        )}
        {!res && (
          <section className="rounded-xl border p-3" aria-live="polite">
            <h3 className="mb-2 text-sm font-bold">فحص الجاهزية</h3>
            {input.isLoading ? <LoadingState /> : input.error ? <ErrorState message={arabicError(input.error)} onRetry={() => input.refetch()} /> : !issues.length ? (
              <p className="flex items-center gap-1 text-sm text-primary"><CheckCircle2 className="size-4" /> لا توجد مشكلات أولية. اجتياز الفحص لا يضمن إمكانية الحل الكامل.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-sm" data-testid="readiness">
                {issues.map((i, k) => <li key={k} className={`flex gap-1 ${i.level === "block" ? "text-destructive" : "text-muted-foreground"}`}>{i.level === "block" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}<span><b>{i.level === "block" ? "يمنع التوليد: " : "تنبيه: "}</b>{i.text}</span></li>)}
              </ul>
            )}
          </section>
        )}
        {busy && prog && (
          <div className="rounded-xl border p-3 text-sm" role="status">
            <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> جارٍ التوليد… {prog.total ? `${prog.placed} من ${prog.total} حصة` : ""}</p>
            <Button className="mt-2" size="sm" variant="outline" onClick={cancel}>إلغاء</Button>
          </div>
        )}
        {!res && !busy && <Button disabled={!input.data || blocks.length > 0} onClick={start}><Wand2 className="me-1 size-4" /> بدء التوليد</Button>}
        {res && (
          <section className="space-y-3" data-testid="gen-result">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS[res.status].tone}`}>{STATUS[res.status].label}</span>
              <span className="text-sm text-muted-foreground">{res.slots.length} حصة جديدة — {(res.ms / 1000).toFixed(1)} ث</span>
            </div>
            <p className="text-sm">{res.note}</p>
            <p className={`flex items-center gap-1 text-sm ${indep.length ? "text-destructive" : "text-primary"}`}>
              {indep.length ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />} الفحص المستقل للنتيجة: {indep.length ? `${indep.length} مخالفة` : "بلا مخالفات إلزامية"}
            </p>
            {indep.length > 0 && <ul className="text-xs text-destructive">{indep.slice(0, 10).map((x) => <li key={x}>{x}</li>)}</ul>}
            <details open className="rounded-xl border p-2">
              <summary className="cursor-pointer text-sm font-semibold">المقررات: المطلوب والموزع ({res.perCourse.filter((p) => p.placed < p.required || !!p.reason).length} ناقص)</summary>
              <table className="mt-2 w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-start">المقرر</th><th className="text-start">المطلوب</th><th className="text-start">الموزع</th><th className="text-start">السبب المعروف</th></tr></thead>
                <tbody>{[...res.perCourse].sort((a, b) => (a.placed >= a.required ? 1 : 0) - (b.placed >= b.required ? 1 : 0)).map((p) => (
                  <tr key={p.course_id} className="border-t"><td>{p.subject} — {p.section}</td><td>{p.required}</td><td className={p.placed < p.required ? "font-bold text-destructive" : ""}>{p.placed}</td><td>{p.reason ?? (p.placed >= p.required ? "✓" : "")}</td></tr>
                ))}</tbody></table>
            </details>
            <details className="rounded-xl border p-2">
              <summary className="cursor-pointer text-sm font-semibold">أنصبة المعلمين قبل التوزيع وبعده</summary>
              <table className="mt-2 w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-start">المعلم</th><th className="text-start">النصاب</th><th className="text-start">قبل</th><th className="text-start">بعد</th></tr></thead>
                <tbody>{res.teacherLoads.map((t) => <tr key={t.teacher_id} className="border-t"><td>{t.name}</td><td>{t.weekly_max ?? "غير محدد"}</td><td>{t.before}</td><td>{t.after}</td></tr>)}</tbody></table>
            </details>
            <details className="rounded-xl border p-2">
              <summary className="cursor-pointer text-sm font-semibold">تفضيلات غير محققة ({res.softMisses.length})</summary>
              <ul className="mt-2 space-y-0.5 text-xs">{res.softMisses.map((x) => <li key={x}>☆ {x}</li>)}{!res.softMisses.length && <li>لا توجد.</li>}</ul>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !res.slots.length || indep.length > 0} onClick={apply}>تطبيق على المسودة</Button>
              <Button variant="outline" disabled={busy} onClick={async () => { await ignore(); await start(); }}>إعادة التوليد</Button>
              <Button variant="ghost" disabled={busy} onClick={ignore}>تجاهل</Button>
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
