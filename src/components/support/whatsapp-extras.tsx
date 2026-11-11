import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Lock, Mic, MessageSquareText, Paperclip, Plus, Send, Square, StickyNote, Tag, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { waContactAttrs, waTag } from "@/lib/wa-inbox.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const when = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "short", timeStyle: "short" }) : "");
const rpc = async (fn: string, args?: Record<string, unknown>) => { const r = await supabase.rpc(fn as never, args as never); if (r.error) throw r.error; return r.data as Row; };
const RikazOnly = () => <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground"><Lock className="size-3" />في ركاز فقط</span>;

/** Side card: WATI contact data + Rikaz links, all filtered server-side (wa_contact_card / waContactAttrs re-check access). */
export function ContactCard({ conv }: { conv: string }) {
  const qc = useQueryClient();
  const card = useQuery({ queryKey: ["wa-card", conv], queryFn: () => rpc("wa_contact_card", { _conv: conv }) });
  const attrsFn = useServerFn(waContactAttrs); const tagFn = useServerFn(waTag);
  const attrs = useQuery({ queryKey: ["wa-attrs", conv], queryFn: () => attrsFn({ data: { conv } }), staleTime: 300_000 });
  const [tag, setTag] = useState("");
  const toggle = async (name: string, on: boolean) => {
    try { const r = await tagFn({ data: { conv, name, on } }); if (on && !r.ok) toast.warning("حُفظ الوسم في ركاز، لكن WATI لم يقبله (لا يقبل WATI إلا وسمًا معرَّفًا مسبقًا عنده)."); setTag(""); }
    catch (e) { toast.error((e as Error).message); }
    void qc.invalidateQueries({ queryKey: ["wa-card", conv] });
  };
  if (card.isLoading) return <aside className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">…</aside>;
  if (card.error) return null;
  const c = card.data; const a = attrs.data as Row;
  const Sec = ({ t, children, extra }: { t: string; children: React.ReactNode; extra?: React.ReactNode }) => (
    <section className="space-y-1.5 border-b p-3 last:border-0"><div className="flex items-center justify-between text-xs font-bold text-muted-foreground">{t}{extra}</div>{children}</section>);
  const Line = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-left font-medium">{v || "—"}</span></div>;
  return (
    <aside className="max-h-[78vh] overflow-y-auto rounded-lg border bg-card" aria-label="بيانات جهة الاتصال">
      <Sec t="جهة الاتصال" extra={<span className="text-[10px] font-normal">من WATI</span>}>
        <p className="font-semibold">{c.name || "بدون اسم"}</p>
        <div className="flex items-center justify-between text-sm"><span dir="ltr">+{c.phone}</span>
          <button className="text-muted-foreground hover:text-primary" aria-label="نسخ الرقم" onClick={() => { void navigator.clipboard.writeText(`+${c.phone}`); toast.success("نُسخ الرقم"); }}><Copy className="size-4" /></button></div>
        {a?.ok && a.source && <Line k="المصدر" v={a.source} />}
      </Sec>
      <Sec t="الإسناد" extra={<span className="text-[10px] font-normal">من WATI</span>}>
        <Line k="الموظف" v={c.assignee?.name ?? (c.assignee_code ? "كود غير مربوط" : "غير مسندة")} />
        <Line k="مالك جهة الاتصال" v={c.contact_owner} />
        <Line k="الفرع" v={(c.branches ?? []).join("، ")} />
        <Line k="الفرق" v={(a?.ok ? a.teams : c.contact_teams ?? []).join("، ")} />
      </Sec>
      {c.students?.length > 0 && (
        <Sec t="الطلاب المرتبطون"><ul className="space-y-1 text-sm">{c.students.map((s: Row) => <li key={s.id}>{s.name}<span className="block text-xs text-muted-foreground">{s.school}{s.relationship ? ` · ${s.relationship}` : ""}</span></li>)}</ul></Sec>)}
      {Array.isArray(c.tickets) && (
        <Sec t="تذاكر الدعم">{!c.tickets.length ? <p className="text-xs text-muted-foreground">لا توجد</p> : <ul className="space-y-1 text-sm">{c.tickets.map((t: Row) => <li key={t.id}><bdi dir="ltr" className="text-xs">{t.ref}</bdi> {t.title}</li>)}</ul>}</Sec>)}
      {a?.ok && a.params?.length > 0 && (
        <Sec t="خصائص جهة الاتصال" extra={<span className="text-[10px] font-normal">من WATI (قراءة فقط)</span>}>{a.params.map((p: Row) => <Line key={p.name} k={p.name} v={p.value} />)}</Sec>)}
      <Sec t="الوسوم" extra={<span className="text-[10px] font-normal">ركاز + إرسال إلى WATI</span>}>
        <div className="flex flex-wrap gap-1">{(c.tags ?? []).map((t: Row) => (
          <span key={t.name} title={t.sync === "ok" ? "متزامن مع WATI" : t.sync === "failed" ? `في ركاز فقط — ${t.error ?? ""}` : "قيد الإرسال إلى WATI"}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${t.sync === "ok" ? "border-primary/40 bg-primary/10" : "border-dashed"}`}>
            <Tag className="size-3" />{t.name}{t.sync !== "ok" && <Lock className="size-3 text-muted-foreground" />}
            <button aria-label={`حذف الوسم ${t.name}`} onClick={() => void toggle(t.name, false)}><X className="size-3" /></button></span>))}</div>
        <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) void toggle(tag.trim(), true); }}>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} placeholder="أضف وسمًا…" className="h-8" /><Button size="sm" type="submit" variant="outline"><Plus className="size-4" /></Button></form>
        <p className="text-[10px] text-muted-foreground">لا يتيح WATI قراءة وسومه عبر الربط؛ الوسوم المعروضة هي المضافة من ركاز. الوسم بقفل = محفوظ في ركاز فقط.</p>
      </Sec>
      <Sec t="ملاحظات داخلية" extra={<RikazOnly />}>
        {!c.notes?.length ? <p className="text-xs text-muted-foreground">لا توجد ملاحظات. اكتبها من تبويب «ملاحظة داخلية» أسفل المحادثة.</p> :
          <ul className="space-y-2">{c.notes.map((n: Row) => <li key={n.id} className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{n.by} · {when(n.at)}</p></li>)}</ul>}
      </Sec>
    </aside>
  );
}

type SendFile = { name: string; mime: string; b64: string; caption?: string; voice?: boolean };
const toB64 = async (b: Blob) => { const buf = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };
const VOICE_MIME = () => (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : null);

/** Composer with two clearly separate modes: «رد واتساب» (goes to the customer) and «ملاحظة داخلية» (Rikaz only, never sent). */
export function Composer({ conv, sending, onSend, owner }: { conv: string; sending: boolean; owner: boolean; onSend: (p: { text?: string; file?: SendFile }) => Promise<boolean> }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(false); const [manage, setManage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const quick = useQuery({ queryKey: ["wa-quick"], queryFn: () => rpc("wa_quick_list0") });
  const rec = useRef<{ r: MediaRecorder; chunks: Blob[]; t0: number } | null>(null);
  const [recSec, setRecSec] = useState<number | null>(null);
  useEffect(() => { if (recSec === null) return; const i = setInterval(() => setRecSec(Math.round((Date.now() - (rec.current?.t0 ?? Date.now())) / 1000)), 500); return () => clearInterval(i); }, [recSec !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendText = async () => {
    const body = text.trim(); if (!body) return;
    if (mode === "note") {
      setBusy(true);
      try { await rpc("wa_note_add", { _conv: conv, _body: body }); setText(""); toast.success("حُفظت الملاحظة الداخلية (لم تُرسل للعميل)"); void qc.invalidateQueries({ queryKey: ["wa-card", conv] }); }
      catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      return;
    }
    if (await onSend({ text: body })) setText("");
  };
  const sendFile = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) { toast.error("الملف أكبر من 5 ميغابايت"); return; }
    const body = text.trim();
    if (await onSend({ file: { name: f.name, mime: f.type || "application/octet-stream", b64: await toB64(f), ...(body ? { caption: body } : {}) } })) setText("");
  };
  const startRec = async () => {
    const mime = VOICE_MIME();
    if (!mime) { toast.error("متصفحك لا يسجّل بصيغة OGG التي يشترطها واتساب للرسائل الصوتية. جرّب Firefox أو Chrome حديثًا، أو أرفق ملفًا صوتيًا."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, { mimeType: mime }); const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.start(); rec.current = { r, chunks, t0: Date.now() }; setRecSec(0);
    } catch { toast.error("لم يُسمح باستخدام الميكروفون"); }
  };
  const stopRec = (send: boolean) => {
    const cur = rec.current; if (!cur) return;
    cur.r.onstop = async () => {
      cur.r.stream.getTracks().forEach((t) => t.stop()); rec.current = null; setRecSec(null);
      if (!send) return;
      const blob = new Blob(cur.chunks, { type: "audio/ogg" });
      if (blob.size > 5 * 1024 * 1024) { toast.error("التسجيل أطول من المسموح (5 ميغابايت)"); return; }
      await onSend({ file: { name: `voice-${Date.now()}.ogg`, mime: "audio/ogg", b64: await toB64(blob), voice: true } });
    };
    cur.r.stop();
  };
  const note = mode === "note";
  const list: Row[] = (quick.data ?? []).filter((q: Row) => q.is_active);
  return (
    <div className={`border-t p-2 ${note ? "bg-warning/10" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex shrink-0 whitespace-nowrap rounded-md border bg-background p-0.5 text-sm">
          <button role="tab" aria-selected={!note} onClick={() => setMode("reply")} className={`flex items-center gap-1 rounded px-3 py-1 ${!note ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><MessageSquareText className="size-4" />رد واتساب</button>
          <button role="tab" aria-selected={note} onClick={() => setMode("note")} className={`flex items-center gap-1 rounded px-3 py-1 ${note ? "bg-warning text-warning-foreground" : "text-muted-foreground"}`}><StickyNote className="size-4" />ملاحظة داخلية</button>
        </div>
        <span className="text-xs text-muted-foreground">{note ? "لا تُرسل للعميل — يراها الموظفون المخوّلون بهذه المحادثة فقط، مع اسمك ووقتها." : "تُرسل إلى العميل عبر WATI."}</span>
      </div>
      {qr && !note && (
        <div className="mb-2 max-h-48 overflow-y-auto rounded-md border bg-background">
          <div className="flex items-center justify-between border-b px-2 py-1 text-xs"><span className="flex items-center gap-1 font-bold">الردود الجاهزة <RikazOnly /></span>{owner && <button className="text-primary" onClick={() => setManage(true)}>إدارة</button>}</div>
          {!list.length ? <p className="p-2 text-xs text-muted-foreground">لا توجد ردود جاهزة{owner ? " — أضفها من «إدارة»." : "."}</p> :
            list.map((q) => <button key={q.id} onClick={() => { setText(q.body); setQr(false); }} className="block w-full border-b p-2 text-right text-sm last:border-0 hover:bg-muted"><b>{q.title}</b><span className="block truncate text-xs text-muted-foreground">{q.body}</span></button>)}
        </div>)}
      {manage && <QuickManage list={quick.data ?? []} onClose={() => { setManage(false); void qc.invalidateQueries({ queryKey: ["wa-quick"] }); }} />}
      {recSec !== null ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
          <span className="size-2 animate-pulse rounded-full bg-destructive" />يجري التسجيل… {recSec} ث
          <Button size="sm" variant="ghost" className="mr-auto" onClick={() => stopRec(false)}>إلغاء</Button>
          <Button size="sm" onClick={() => stopRec(true)}><Square className="size-4" />إيقاف وإرسال</Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {!note && <>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendFile(f); }} />
            <Button size="icon" variant="outline" disabled={sending} onClick={() => fileRef.current?.click()} aria-label="إرفاق ملف"><Paperclip className="size-4" /></Button>
            <Button size="icon" variant="outline" disabled={sending} onClick={() => void startRec()} aria-label="تسجيل رسالة صوتية"><Mic className="size-4" /></Button>
            <Button size="icon" variant={qr ? "secondary" : "outline"} onClick={() => setQr((x) => !x)} aria-label="الردود الجاهزة"><Zap className="size-4" /></Button>
          </>}
          <Textarea rows={2} value={text} onChange={(e) => { setText(e.target.value); if (!note && e.target.value === "/") setQr(true); }} placeholder={note ? "اكتب ملاحظة داخلية للفريق…" : "اكتب الرد… أو / للردود الجاهزة (يُرسل مع المرفق كتعليق إن وُجد)"} className={`flex-1 ${note ? "border-warning" : ""}`} />
          <Button disabled={sending || busy || !text.trim()} variant={note ? "secondary" : "default"} onClick={() => void sendText()}>{note ? <><StickyNote className="size-4" />حفظ الملاحظة</> : <><Send className="size-4" />إرسال</>}</Button>
        </div>
      )}
    </div>
  );
}

function QuickManage({ list, onClose }: { list: Row[]; onClose: () => void }) {
  const [ed, setEd] = useState<Row | null>(null);
  const save = async () => {
    try { await rpc("wa_quick_save0", { _id: ed.id ?? null, _title: ed.title ?? "", _body: ed.body ?? "", _active: ed.is_active ?? true }); toast.success("حُفظ الرد الجاهز"); setEd(null); onClose(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="mb-2 space-y-2 rounded-md border bg-background p-2 text-sm">
      <div className="flex items-center justify-between"><b>إدارة الردود الجاهزة</b> <RikazOnly /><Button size="sm" variant="ghost" onClick={onClose}><X className="size-4" /></Button></div>
      {ed ? (
        <div className="space-y-2">
          <Input placeholder="العنوان" value={ed.title ?? ""} onChange={(e) => setEd({ ...ed, title: e.target.value })} maxLength={60} />
          <Textarea rows={3} placeholder="نص الرد" value={ed.body ?? ""} onChange={(e) => setEd({ ...ed, body: e.target.value })} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ed.is_active ?? true} onChange={(e) => setEd({ ...ed, is_active: e.target.checked })} />مفعّل</label>
          <div className="flex gap-2"><Button size="sm" onClick={() => void save()}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => setEd(null)}>إلغاء</Button></div>
        </div>
      ) : (<>
        {list.map((q) => <button key={q.id} onClick={() => setEd(q)} className="block w-full rounded border p-2 text-right hover:bg-muted"><b>{q.title}</b>{!q.is_active && " (معطّل)"}<span className="block truncate text-xs text-muted-foreground">{q.body}</span></button>)}
        <Button size="sm" variant="outline" onClick={() => setEd({ is_active: true })}><Plus className="size-4" />رد جديد</Button>
      </>)}
    </div>
  );
}
