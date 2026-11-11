import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { waTransfer, waTransferVerify } from "@/lib/wa-inbox.functions";

type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const rpc = async (f: string, a: Record<string, unknown>) => { const r = await supabase.rpc(f as never, a as never); if (r.error) throw r.error; return r.data as Row; };
const ST: Record<string, string> = { done: "تم في WATI", failed: "فشل", unknown: "بانتظار التأكد", pending: "قيد التنفيذ" };
const when = (s: string) => new Date(s).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });

/** «تحويل المحادثة»: options and scope come from wa_transfer_options; success is declared only after WATI re-reads the new assignment. */
export function TransferBox({ conv }: { conv: string }) {
  const qc = useQueryClient();
  const opts = useQuery({ queryKey: ["wa-card", conv, "transfer"], queryFn: () => rpc("wa_transfer_options", { _conv: conv }) });
  const log = useQuery({ queryKey: ["wa-card", conv, "tlog"], queryFn: () => rpc("wa_transfer_log", { _conv: conv }) });
  const tf = useServerFn(waTransfer); const vf = useServerFn(waTransferVerify);
  const [open, setOpen] = useState(false); const [school, setSchool] = useState(""); const [target, setTarget] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [key, setKey] = useState(() => crypto.randomUUID());
  const o = opts.data; if (!o) return null;
  const br = (o.branches as Row[]).find((b) => b.id === school);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["wa-card", conv] }); void qc.invalidateQueries({ queryKey: ["wa-convs"] }); void qc.invalidateQueries({ queryKey: ["wa-msgs"] }); };
  const report = (r: { status: string; error?: string }) => {
    if (r.status === "done") { toast.success((r as { reopened?: boolean }).reopened ? "كانت المحادثة مغلقة في WATI؛ أُعيد فتحها وتم التحويل وتأكّد" : "تم التحويل وتأكّد في WATI"); setOpen(false); setNote(""); setTarget(""); }
    else if (r.status === "unknown") toast.warning(`لم تتأكد النتيجة بعد: ${r.error ?? ""}. اضغط «تحقّق» قبل أي محاولة جديدة.`);
    else toast.error(`لم يتم التحويل، وبقي الإسناد الفعلي كما هو. السبب: ${r.error ?? ""}`);
    setKey(crypto.randomUUID()); refresh();
  };
  const go = async () => {
    const [kind, code = ""] = target.split(":"); setBusy(true);
    try { report(await tf({ data: { conv, school, kind: kind as "operator" | "team", code, ...(note.trim() ? { note: note.trim() } : {}), key } })); }
    catch (e) { toast.error((e as Error).message); setKey(crypto.randomUUID()); refresh(); } finally { setBusy(false); }
  };
  const verify = async (id: string) => { setBusy(true); try { report(await vf({ data: { id } })); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const un = o.unresolved as Row | null;
  return (
    <section className="space-y-2 border-b p-3">
      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">تحويل المحادثة<span className="text-[10px] font-normal">يُنفَّذ في WATI</span></div>
      {un && <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">تحويل سابق «{ST[un.status]}»{un.error ? ` — ${un.error}` : ""}.
        <Button size="sm" variant="outline" className="mt-1 h-7 w-full" disabled={busy} onClick={() => void verify(un.id)}><RefreshCw className="size-3" /> تحقّق من WATI</Button></div>}
      {o.can && !un && (!open ? <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}><ArrowLeftRight className="size-4" /> تحويل المحادثة</Button> : (
        <div className="space-y-2">
          <select aria-label="الفرع" className={selectCls()} value={school} onChange={(e) => { setSchool(e.target.value); setTarget(""); }}>
            <option value="">اختر الفرع</option>{(o.branches as Row[]).map((b) => <option key={b.id} value={b.id}>{b.name}{b.current ? " (الحالي)" : ""}</option>)}</select>
          {br && <select aria-label="المستلم" className={selectCls()} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">اختر الموظف أو الفريق</option>
            {br.operators.length > 0 && <optgroup label="موظفون">{br.operators.map((p: Row) => <option key={p.code} value={`operator:${p.code}`} disabled={!p.ready || p.current}>{p.name}{p.current ? " (الحالي)" : !p.ready ? " — بلا بريد WATI" : ""}</option>)}</optgroup>}
            {br.teams.length > 0 && <optgroup label="فرق">{br.teams.map((t: Row) => <option key={t.code} value={`team:${t.code}`} disabled={!t.ready}>{t.name}{!t.ready ? " — بلا اسم WATI" : ""}</option>)}</optgroup>}
          </select>}
          {br && !br.operators.length && !br.teams.length && <p className="text-xs text-muted-foreground">لا يوجد موظف أو فريق WATI مربوط بهذا الفرع.</p>}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="ملاحظة داخلية (اختيارية، لا تُرسل للعميل)" className="border-warning/40 bg-warning/5" />
          <div className="flex gap-2"><Button size="sm" className="flex-1" disabled={busy || !target} onClick={() => void go()}>{busy ? "جارٍ التحويل والتحقق…" : "تحويل"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button></div>
        </div>))}
      {Array.isArray(log.data) && log.data.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">سجل التحويل ({log.data.length})</summary>
        <ul className="mt-1 space-y-1.5">{(log.data as Row[]).map((t) => <li key={t.id} className="rounded border p-1.5">
          <div className="font-medium">{t.from_user ?? "—"} ← {t.to_user ?? t.to_team ?? "—"} <span className={t.status === "done" ? "text-primary" : "text-destructive"}>· {ST[t.status]}</span></div>
          <div className="text-muted-foreground">{(t.from_schools ?? []).join("، ") || "—"} ← {t.to_school} · {t.by} · {when(t.at)}</div>
          {t.note && <div className="text-muted-foreground">ملاحظة: {t.note}</div>}{t.error && t.status !== "done" && <div className="text-destructive">{t.error}</div>}</li>)}</ul></details>}
    </section>);
}
