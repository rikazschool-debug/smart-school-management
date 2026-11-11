import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Paperclip, RefreshCw, Search, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ask } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { waMedia, waSend, waSync } from "@/lib/wa-inbox.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const ST: Record<string, string> = { sending: "يُرسل…", accepted: "قبِله WATI", sent: "أُرسلت", delivered: "وصلت", read: "قُرئت", replied: "رُدّ عليها", failed: "فشلت", unknown: "غير مؤكدة", received: "" };
const KIND: Record<string, string> = { image: "صورة", document: "ملف", video: "فيديو", audio: "صوت", voice: "رسالة صوتية", sticker: "ملصق" };
const when = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "short", timeStyle: "short" }) : "");

/** «واتساب» tab of the platform support desk: WATI conversations stored by the webhook, replies through WATI. */
export function WhatsAppInbox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const sync = useServerFn(waSync);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["wa-convs", q],
    queryFn: async () => { const r = await supabase.rpc("wa_conversations_list" as never, { _q: q || null } as never); if (r.error) throw r.error; return (r.data ?? []) as Row[]; },
    refetchInterval: 15_000,
  });
  const [busy, setBusy] = useState(false);
  const pull = async () => { setBusy(true); try { await sync({ data: {} }); await qc.invalidateQueries({ queryKey: ["wa-convs"] }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  useEffect(() => { void pull(); /* refresh list from WATI once on open */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative flex-1"><Search className="absolute right-2 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم" className="pr-8" /></div>
          <Button size="icon" variant="outline" onClick={pull} disabled={busy} aria-label="تحديث من WATI"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /></Button>
        </div>
        {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message="تعذّر تحميل المحادثات" onRetry={() => void list.refetch()} /> : !list.data?.length ? <EmptyState title="لا توجد محادثات بعد" /> : (
          <ul className="max-h-[70vh] divide-y overflow-y-auto">
            {list.data.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpen(c.id)} className={`w-full p-3 text-right hover:bg-muted ${open === c.id ? "bg-muted" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.contact_name || c.wa_id || "بدون اسم"}</span>
                    {c.unread > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{c.unread}</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{c.last_text ?? ""}</div>
                  <div className="text-[11px] text-muted-foreground">{when(c.last_at)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open ? <Thread key={open} id={open} /> : <div className="rounded-lg border bg-card p-8"><EmptyState title="اختر محادثة" /></div>}
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const qc = useQueryClient();
  const sync = useServerFn(waSync); const send = useServerFn(waSend); const media = useServerFn(waMedia);
  const t = useQuery({
    queryKey: ["wa-msgs", id],
    queryFn: async () => { const r = await supabase.rpc("wa_messages_list" as never, { _conv: id } as never); if (r.error) throw r.error; return r.data as Row; },
    refetchInterval: 10_000,
  });
  useEffect(() => { void sync({ data: { conv: id } }).then(() => qc.invalidateQueries({ queryKey: ["wa-msgs", id] })).catch((e: Error) => toast.error(`تعذّر جلب الرسائل من WATI: ${e.message}`)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [t.data?.messages?.length]);
  const [text, setText] = useState(""); const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doSend = async (file?: File) => {
    const body = text.trim();
    if (!file && !body) return;
    if (!t.data?.conversation?.window_open && !(await ask("مرّ أكثر من 24 ساعة على آخر رسالة من العميل؛ قد يرفض واتساب الرد الحر. متابعة؟"))) return;
    setSending(true);
    try {
      let f: { name: string; mime: string; b64: string; caption?: string } | undefined;
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error("الملف أكبر من 5 ميغابايت");
        const buf = new Uint8Array(await file.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        f = { name: file.name, mime: file.type || "application/octet-stream", b64: btoa(bin), ...(body ? { caption: body } : {}) };
      }
      const r = await send({ data: { conv: id, key: crypto.randomUUID(), ...(f ? { file: f } : { text: body }) } });
      if (r.status === "failed") toast.error(`رفض WATI الإرسال: ${r.error ?? ""}`);
      else if (r.status === "unknown") toast.warning("لم يتأكد قبول WATI للرسالة — تحقق قبل الإعادة");
      else { toast.success("أُرسلت إلى WATI"); setText(""); }
    } catch (e) { toast.error((e as Error).message); } finally { setSending(false); void qc.invalidateQueries({ queryKey: ["wa-msgs", id] }); void qc.invalidateQueries({ queryKey: ["wa-convs"] }); }
  };
  const openMedia = async (m: Row) => {
    try {
      const r = await media({ data: { msg: m.id } });
      const bin = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bin], { type: r.mime }));
      window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { toast.error((e as Error).message); }
  };

  if (t.isLoading) return <LoadingState />;
  if (t.error) return <ErrorState message="تعذّر تحميل المحادثة" onRetry={() => void t.refetch()} />;
  const c = t.data.conversation; const msgs: Row[] = t.data.messages;
  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div><div className="font-semibold">{c.contact_name || c.wa_id}</div>{c.wa_id && <div className="text-xs text-muted-foreground" dir="ltr">+{c.wa_id}</div>}</div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${c.window_open ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{c.window_open ? "نافذة الرد مفتوحة (24 ساعة)" : "نافذة الرد مغلقة"}</span>
      </div>
      <div className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "out" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === "out" ? "bg-primary/10" : "bg-muted"}`}>
              {m.kind !== "text" && KIND[m.kind] && (
                m.has_media ? <button onClick={() => openMedia(m)} className="mb-1 flex items-center gap-1 text-primary underline"><Paperclip className="size-3" /> فتح {KIND[m.kind]}{m.file_name ? ` — ${m.file_name}` : ""}</button>
                  : <div className="mb-1 text-xs text-muted-foreground">[{KIND[m.kind]}{m.file_name ? ` — ${m.file_name}` : ""}]</div>
              )}
              {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}
              <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                <span>{when(m.at)}</span>
                {m.direction === "out" && <span>{ST[m.status] ?? m.status}</span>}
                {m.direction === "out" && m.operator_name && <span>{m.operator_name}</span>}
              </div>
              {m.error && <div className="mt-1 text-[11px] text-destructive">{m.error}</div>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="flex items-end gap-2 border-t p-2">
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void doSend(f); }} />
        <Button size="icon" variant="outline" disabled={sending} onClick={() => fileRef.current?.click()} aria-label="إرفاق ملف"><Paperclip className="size-4" /></Button>
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب الرد… (يُرسل مع المرفق كتعليق إن وُجد)" className="flex-1" />
        <Button disabled={sending || !text.trim()} onClick={() => doSend()}><Send className="size-4" /> إرسال</Button>
      </div>
    </div>
  );
}
