import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, FileText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { waBots, waRunBot, waSendTemplate, waSync, waTemplates } from "@/lib/wa-inbox.functions";
import { waTplAutofill, waTplFill, type WaTpl } from "@/lib/wa-template";
import { waWhen as when } from "@/lib/wa-time";

type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ST: Record<string, string> = { pending: "قيد التنفيذ", accepted: "قبِله WATI", failed: "فشل", unknown: "غير مؤكد" };
const CAT: Record<string, string> = { UTILITY: "خدمي", MARKETING: "تسويقي" };
const HDR: Record<string, string> = { image: "صورة", video: "فيديو", document: "ملف", text: "نص" };

/** «إرسال قالب» / «تشغيل بوت» above the composer; each button shows only when wa_act_caps allows it (the server re-checks). */
export function ActionBar({ conv, windowOpen }: { conv: string; windowOpen: boolean }) {
  const qc = useQueryClient();
  const c = useQuery({ queryKey: ["wa-card", conv, "acts"], queryFn: async () => { const r = await supabase.rpc("wa_act_caps" as never, { _conv: conv } as never); if (r.error) throw r.error; return r.data as Row; } });
  const log = useQuery({ queryKey: ["wa-card", conv, "alog"], queryFn: async () => { const r = await supabase.rpc("wa_act_log" as never, { _conv: conv } as never); if (r.error) throw r.error; return r.data as Row[]; } });
  const [dlg, setDlg] = useState<"" | "tpl" | "bot">("");
  if (!c.data || (!c.data.template && !c.data.bot)) return null;
  const done = () => { void qc.invalidateQueries({ queryKey: ["wa-card", conv] }); void qc.invalidateQueries({ queryKey: ["wa-msgs", conv] }); void qc.invalidateQueries({ queryKey: ["wa-convs"] }); };
  const un = c.data.unresolved as Row | null;
  return (
    <div className="space-y-1 border-t px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {c.data.template && <Button size="sm" variant={windowOpen ? "outline" : "default"} onClick={() => setDlg("tpl")}><FileText className="size-4" /> إرسال قالب</Button>}
        {c.data.bot && <Button size="sm" variant="outline" onClick={() => setDlg("bot")}><Bot className="size-4" /> تشغيل بوت</Button>}
        {!windowOpen && c.data.template && <span className="text-xs text-muted-foreground">نافذة الرد الحر مغلقة — يمكنك إرسال قالب معتمد.</span>}
        {Array.isArray(log.data) && log.data.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">سجل القوالب والبوتات ({log.data.length})</summary>
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">{log.data.map((x) => <li key={x.id} className="rounded border p-1.5">
            <span className="font-medium">{x.kind === "bot" ? "بوت" : "قالب"}: {x.label}</span> · <span className={x.status === "accepted" ? "text-primary" : "text-destructive"}>{ST[x.status]}</span>
            <div className="text-muted-foreground">{x.by} · {when(x.at)}</div>{x.error && x.status !== "accepted" && <div className="text-destructive">{x.error}</div>}</li>)}</ul></details>}
      </div>
      {un && <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">{un.kind === "bot" ? "تشغيل بوت" : "إرسال قالب"} «{un.ref_label}» لم تتأكد نتيجته بعد — راجع المحادثة قبل أي محاولة جديدة.</div>}
      {dlg === "tpl" && <TemplateDialog conv={conv} caps={c.data} onClose={() => setDlg("")} onDone={done} />}
      {dlg === "bot" && <BotDialog conv={conv} caps={c.data} windowOpen={windowOpen} onClose={() => setDlg("")} onDone={done} />}
    </div>
  );
}

function TemplateDialog({ conv, caps, onClose, onDone }: { conv: string; caps: Row; onClose: () => void; onDone: () => void }) {
  const list = useServerFn(waTemplates); const send = useServerFn(waSendTemplate); const sync = useServerFn(waSync);
  const q = useQuery({ queryKey: ["wa-tpls", conv], queryFn: () => list({ data: { conv } }), staleTime: 60_000 });
  const [s, setS] = useState(""); const [pick, setPick] = useState<WaTpl | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const shown = useMemo(() => (q.data?.templates ?? []).filter((t) => !s.trim() || `${t.name} ${t.body}`.toLowerCase().includes(s.trim().toLowerCase())), [q.data, s]);
  const choose = (t: WaTpl) => { setPick(t); setVals(waTplAutofill(t, { name: caps.contact_name, branch: caps.bot_branch })); setKey(crypto.randomUUID()); };
  const missing = pick ? pick.vars.filter((v) => !(vals[v.name] ?? "").trim()) : [];
  const go = async () => {
    if (!pick) return; setBusy(true);
    try {
      const r = await send({ data: { conv, key, name: pick.name, values: vals } });
      if (r.status === "accepted") { toast.success(r.duplicate ? "سبق إرسال هذا الطلب وقبِله WATI" : "قبِل WATI القالب — تتبّع حالة التسليم في المحادثة"); void sync({ data: { conv } }).finally(onDone); onClose(); return; }
      if (r.status === "unknown") toast.warning(`لم تتأكد نتيجة الإرسال: ${r.error ?? ""}. راجع المحادثة قبل الإعادة.`);
      else toast.error(`لم يُرسل القالب: ${r.error ?? ""}`);
      setKey(crypto.randomUUID()); onDone();
    } catch (e) { toast.error((e as Error).message); setKey(crypto.randomUUID()); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>إرسال قالب معتمد</DialogTitle>
          <DialogDescription>إلى {caps.contact_name || "العميل"} <span dir="ltr">+{caps.wa_id}</span> — القوالب المعتمدة من WATI فقط، ودون قوالب المصادقة ورموز الدخول.</DialogDescription></DialogHeader>
        {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : !q.data?.ok ? <ErrorState message={`تعذّر جلب القوالب من WATI: ${q.data?.error ?? ""}`} onRetry={() => void q.refetch()} /> : (
          <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="relative"><Search className="absolute right-2 top-2.5 size-4 text-muted-foreground" /><Input value={s} onChange={(e) => setS(e.target.value)} placeholder="بحث في القوالب" className="pr-8" /></div>
              {!shown.length ? <EmptyState title="لا توجد قوالب مطابقة" /> : <ul className="max-h-[55vh] space-y-1 overflow-y-auto">{shown.map((t) => (
                <li key={t.id || t.name}><button onClick={() => choose(t)} className={`w-full rounded border p-2 text-right text-sm hover:bg-muted ${pick?.name === t.name ? "border-primary bg-primary/5" : ""}`}>
                  <div className="truncate font-medium" dir="ltr">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.language || "—"} · {CAT[t.category] ?? t.category}{t.vars.length ? ` · ${t.vars.length} متغير` : ""}</div></button></li>))}</ul>}
            </div>
            {!pick ? <div className="rounded border p-6"><EmptyState title="اختر قالبًا لمعاينته" /></div> : (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="mb-1 text-[11px] text-muted-foreground">معاينة · اللغة: {pick.language || "—"}</div>
                  {pick.header && <div className="mb-2 rounded bg-card px-2 py-1 text-xs">{pick.header.type === "text" ? <b>{waTplFill(pick.header.text ?? "", vals)}</b>
                    : <>مرفق في رأس القالب: {HDR[pick.header.type] ?? pick.header.type}{pick.header.link && !/\{\{/.test(pick.header.link) ? " (ثابت ومعتمد في WATI)" : " (رابط تحدده أدناه)"}</>}</div>}
                  <div className="whitespace-pre-wrap">{waTplFill(pick.body, vals)}</div>
                  {pick.buttons.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{pick.buttons.map((b, i) => <span key={i} className="rounded-full border bg-card px-2 py-0.5 text-xs" title={b.url ?? ""}>{b.text || b.type}{b.type === "url" ? " ↗" : ""}</span>)}</div>}
                </div>
                {pick.vars.length > 0 ? <div className="space-y-2">{pick.vars.map((v) => (
                  <label key={v.name} className="block text-xs"><span className="mb-0.5 block font-medium"><code dir="ltr">{`{{${v.name}}}`}</code>{v.where === "header" ? " — رابط المرفق (https)" : v.where === "button" ? " — جزء رابط الزر" : ""}</span>
                    <Input value={vals[v.name] ?? ""} dir={v.where === "body" ? undefined : "ltr"} maxLength={1000} placeholder={v.sample ? `مثال من WATI: ${v.sample}` : ""} onChange={(e) => setVals((p) => ({ ...p, [v.name]: e.target.value }))} /></label>))}</div>
                  : <p className="text-xs text-muted-foreground">هذا القالب بلا متغيرات.</p>}
                <p className="text-[11px] text-muted-foreground">عُبّئ الاسم والفرع من بيانات المحادثة عند توفرها؛ راجع كل القيم قبل الإرسال.</p>
                <div className="flex gap-2"><Button className="flex-1" disabled={busy || missing.length > 0} onClick={() => void go()}>{busy ? "جارٍ الإرسال…" : missing.length ? `أكمل ${missing.length} متغير` : "إرسال القالب"}</Button>
                  <Button variant="ghost" onClick={onClose}>إلغاء</Button></div>
              </div>)}
          </div>)}
      </DialogContent>
    </Dialog>);
}

function BotDialog({ conv, caps, windowOpen, onClose, onDone }: { conv: string; caps: Row; windowOpen: boolean; onClose: () => void; onDone: () => void }) {
  const list = useServerFn(waBots); const run = useServerFn(waRunBot);
  const q = useQuery({ queryKey: ["wa-bots", conv], queryFn: () => list({ data: { conv } }), staleTime: 60_000 });
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null); const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const go = async () => {
    if (!pick) return; setBusy(true);
    try {
      const r = await run({ data: { conv, key, bot: pick.id } });
      if (r.status === "accepted") {
        const ev = (r as { events?: string[] }).events ?? [];
        toast.success(`قبِل WATI تشغيل البوت «${pick.name}»`);
        if (ev.includes("blocked")) toast.warning("تنبيه: خطوات البوت نفسه حظرت المحادثة في WATI فور التشغيل — راجع إعداد البوت في WATI أو أعد فتحها.", { duration: 12_000 });
        else if (ev.includes("ended") && !ev.includes("sent")) toast.warning("انتهى البوت فورًا في WATI دون أن يرسل رسالة للعميل — راجع خطوات البوت في WATI.", { duration: 12_000 });
        else if (ev.includes("closed")) toast.warning("أغلق البوت المحادثة في WATI بعد التشغيل.", { duration: 10_000 });
        onDone(); onClose(); return;
      }
      if (r.status === "unknown") toast.warning(`لم تتأكد نتيجة التشغيل: ${r.error ?? ""}. راجع المحادثة قبل الإعادة.`);
      else toast.error(`لم يُشغَّل البوت: ${r.error ?? ""}`);
      setKey(crypto.randomUUID()); onDone();
    } catch (e) { toast.error((e as Error).message); setKey(crypto.randomUUID()); } finally { setBusy(false); }
  };
  const cur = caps.assignee ? `${caps.assignee}${caps.assignee_bot ? " (بوت)" : ""}` : "غير مسندة";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>تشغيل بوت WATI</DialogTitle><DialogDescription>على محادثة {caps.contact_name || "العميل"} <span dir="ltr">+{caps.wa_id}</span></DialogDescription></DialogHeader>
        {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : !q.data?.ok ? <ErrorState message={`تعذّر جلب البوتات من WATI: ${q.data?.error ?? ""}`} onRetry={() => void q.refetch()} /> : !pick ? (
          !q.data.bots.length ? <EmptyState title="لا توجد بوتات في WATI" /> :
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">{q.data.bots.map((b) => <li key={b.id}><button onClick={() => setPick(b)} className="w-full rounded border p-2 text-right text-sm hover:bg-muted">{b.name}</button></li>)}</ul>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-3"><div>البوت: <b>{pick.name}</b></div><div>المستلم: <b>{caps.contact_name || "—"}</b> <span dir="ltr">+{caps.wa_id}</span></div>
              <div>الإسناد الحالي في WATI: <b>{cur}</b>{(caps.teams ?? []).length ? ` · الفريق: ${(caps.teams as string[]).join("، ")}` : ""}</div></div>
            <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">
              <li>يبدأ WATI تدفّق البوت من أوله، ويرسل رسائله للعميل باسم البوت. إن كان بوت آخر يعمل على المحادثة يحلّ هذا محلّه.</li>
              <li>أثناء التشغيل يتولّى البوت المحادثة، وقد يغيّر WATI الإسناد أو الفريق حسب خطوات البوت نفسه (مثل «تحويل إلى فريق»). ركاز لا يغيّر الإسناد بنفسه، ويقرأه من WATI بعد التشغيل ويطبّق الصلاحيات عليه.</li>
              {!windowOpen && <li className="text-destructive">نافذة الرد الحر مغلقة: قد لا تصل رسائل البوت للعميل حتى يرد. الأنسب إرسال قالب معتمد أولًا.</li>}
            </ul>
            <div className="flex gap-2"><Button className="flex-1" disabled={busy} onClick={() => void go()}>{busy ? "جارٍ التشغيل…" : `تأكيد تشغيل «${pick.name}»`}</Button><Button variant="ghost" onClick={() => setPick(null)}>رجوع</Button></div>
          </div>)}
      </DialogContent>
    </Dialog>);
}
