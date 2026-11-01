import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BellOff, Bell, Archive, ArchiveRestore, Flag, Paperclip, Pencil, Reply, Trash2, Users, X, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, useSession } from "@/lib/session";
import { KIND_LABEL, SafeText, cleanupStalePending, discardPendingFile, openFile, timeLabel, uploadMessageFile, type PendingFile } from "@/lib/comm";
import { GroupPanel } from "@/components/comm/group-panel";

const PAGE = 30;

type Local = { clientId: string; body: string; replyTo: Row | null; fileIds: string[]; status: "sending" | "failed"; error?: string };

export function Thread({ conv, onBack, onChanged }: { conv: Row; onBack: () => void; onChanged: () => void }) {
  const id = conv["id"] as string;
  const qc = useQueryClient();
  const { user } = useSession();
  const [panel, setPanel] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const msgs = useInfiniteQuery({
    queryKey: ["msgs", id],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      let q = db.from("messages").select("id, seq, sender_id, body, reply_to, created_at, edited_at, deleted_at").eq("conversation_id", id).order("seq", { ascending: false }).limit(PAGE);
      if (pageParam != null) q = q.lt("seq", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return data as Row[];
    },
    getNextPageParam: (last) => (last.length < PAGE ? null : (last[last.length - 1]!["seq"] as number)),
  });
  const people = useQuery({
    queryKey: ["people", id],
    queryFn: async () => {
      const { data, error } = await db.rpc("conversation_people", { _conv: id });
      if (error) throw error;
      return data as Row[];
    },
  });
  const list = useMemo(() => (msgs.data?.pages.flat() ?? []).slice().sort((a, b) => a["seq"] - b["seq"]), [msgs.data]);
  const ids = list.map((m) => m["id"]);
  const files = useQuery({
    queryKey: ["msg-files", id, ids.length, list[list.length - 1]?.["seq"]],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await db.from("files").select("id, name, size_bytes, storage_path, source_id").eq("source_type", "message").in("source_id", ids);
      return (data ?? []) as Row[];
    },
  });
  const names = useMemo(() => Object.fromEntries((people.data ?? []).map((p) => [p["user_id"], p["full_name"]])), [people.data]);
  const maxSeq = list.length ? list[list.length - 1]!["seq"] : 0;

  // realtime: RLS still applies, so removed members stop receiving events
  useEffect(() => {
    const ch = supabase
      .channel(`conv-${id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["msgs", id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["people", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  // mark read only up to the newest message actually loaded & shown; loading older pages never advances it
  useEffect(() => {
    if (!maxSeq || document.visibilityState !== "visible") return;
    db.rpc("mark_conversation_read", { _conv: id, _seq: maxSeq }).then(() => {
      onChanged();
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    });
  }, [id, maxSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [maxSeq]);
  useEffect(() => { cleanupStalePending(); }, []);

  const [locals, setLocals] = useState<Local[]>([]);
  const [reply, setReply] = useState<Row | null>(null);
  const block = conv["send_block"] as string | null;
  const isGroup = conv["kind"] === "group";
  const others = (people.data ?? []).filter((p) => p["user_id"] !== user.id);

  async function send(l: Local) {
    setLocals((x) => [...x.filter((y) => y.clientId !== l.clientId), { ...l, status: "sending" }]);
    const { error } = await db.rpc("send_message", { _conv: id, _body: l.body, _client_id: l.clientId, _reply_to: l.replyTo?.["id"] ?? null, _files: l.fileIds });
    if (error) {
      setLocals((x) => x.map((y) => (y.clientId === l.clientId ? { ...y, status: "failed", error: arabicError(error) } : y)));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["msgs", id] });
    setLocals((x) => x.filter((y) => y.clientId !== l.clientId));
    onChanged();
  }

  function receipt(m: Row) {
    if (m["sender_id"] !== user.id) return null;
    const readers = others.filter((p) => p["last_read_seq"] >= m["seq"]).length;
    if (!others.length) return "محفوظة";
    if (isGroup) return readers ? `قرأها ${readers} من ${others.length}` : "متاحة للأعضاء";
    return readers ? "قُرئت" : "وصلت للمستلم (لم تُقرأ)";
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b p-3">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="رجوع للقائمة" onClick={onBack}><ArrowRight className="size-5" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold">{conv["title"]}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {KIND_LABEL[conv["kind"]]}{conv["student_name"] ? ` • بشأن الطالب: ${conv["student_name"]}` : ""}{conv["counterpart"] ? ` • ${conv["counterpart"]}` : ""}{conv["school_name"] ? ` • ${conv["school_name"]}` : " • عابرة للفروع"}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={conv["muted"] ? "إلغاء الكتم" : "كتم الإشعارات"} title={conv["muted"] ? "إلغاء الكتم" : "كتم الإشعارات"} onClick={async () => { await db.rpc("set_member_prefs", { _conv: id, _muted: !conv["muted"], _archived: null }); onChanged(); }}>
          {conv["muted"] ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label={conv["archived"] ? "إخراج من الأرشيف" : "أرشفة لدي"} title={conv["archived"] ? "إخراج من الأرشيف" : "أرشفة لدي"} onClick={async () => { await db.rpc("set_member_prefs", { _conv: id, _muted: null, _archived: !conv["archived"] }); onChanged(); }}>
          {conv["archived"] ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </Button>
        {isGroup && <Button variant={panel ? "secondary" : "ghost"} size="icon" aria-label="الأعضاء والإعدادات" onClick={() => setPanel(!panel)}><Users className="size-4" /></Button>}
      </header>
      {panel && isGroup ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3"><GroupPanel convId={id} myRole={conv["my_role"]} onChanged={() => { onChanged(); qc.invalidateQueries({ queryKey: ["people", id] }); }} /></div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {msgs.hasNextPage && (
            <div className="mb-3 text-center">
              <Button size="sm" variant="outline" disabled={msgs.isFetchingNextPage} onClick={() => msgs.fetchNextPage()}>{msgs.isFetchingNextPage ? "جارٍ التحميل…" : "تحميل رسائل أقدم"}</Button>
            </div>
          )}
          {msgs.isLoading ? <LoadingState /> : msgs.error ? (
            <div className="space-y-2"><ErrorState message={arabicError(msgs.error)} /><Button size="sm" onClick={() => msgs.refetch()}>إعادة المحاولة</Button></div>
          ) : !list.length && !locals.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">لا توجد رسائل بعد. ابدأ المحادثة.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((m) => (
                <Message key={m["id"]} m={m} mine={m["sender_id"] === user.id} name={names[m["sender_id"]] ?? "عضو سابق"} parent={m["reply_to"] ? list.find((x) => x["id"] === m["reply_to"]) : undefined}
                  files={(files.data ?? []).filter((f) => f["source_id"] === m["id"])} receipt={receipt(m)} canAct={!block} isGroup={isGroup}
                  onReply={() => setReply(m)} onChanged={() => qc.invalidateQueries({ queryKey: ["msgs", id] })} />
              ))}
              {locals.map((l) => (
                <li key={l.clientId} className="ms-auto max-w-[85%] rounded-2xl bg-primary/10 p-3 text-sm">
                  {l.body && <SafeText text={l.body} />}
                  {l.fileIds.length > 0 && <p className="text-xs text-muted-foreground">📎 {l.fileIds.length} مرفق</p>}
                  <p className="mt-1 flex items-center gap-2 text-xs">
                    {l.status === "sending" ? <><Loader2 className="size-3 animate-spin" /> جارٍ الإرسال…</> : (
                      <span className="text-destructive">فشل الإرسال: {l.error}
                        <button className="ms-2 inline-flex items-center gap-1 underline" onClick={() => send(l)}><RotateCcw className="size-3" />إعادة المحاولة</button>
                        <button className="ms-2 underline" onClick={() => setLocals((x) => x.filter((y) => y.clientId !== l.clientId))}>تجاهل</button>
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div ref={bottom} />
        </div>
      )}
      {!panel && (block ? (
        <p className="border-t bg-muted/50 p-3 text-center text-sm text-muted-foreground">{block}</p>
      ) : (
        <Composer conv={conv} reply={reply} names={names} onCancelReply={() => setReply(null)} onSend={(body, fileIds) => {
          const l: Local = { clientId: crypto.randomUUID(), body, replyTo: reply, fileIds, status: "sending" };
          setReply(null);
          return send(l);
        }} />
      ))}
    </div>
  );
}

function Message({ m, mine, name, parent, files, receipt, canAct, isGroup, onReply, onChanged }: {
  m: Row; mine: boolean; name: string; parent: Row | undefined; files: Row[]; receipt: string | null; canAct: boolean; isGroup: boolean; onReply: () => void; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m["body"]);
  const deleted = !!m["deleted_at"];
  return (
    <li className={`group max-w-[85%] rounded-2xl p-3 text-sm ${mine ? "ms-auto bg-primary/10" : "me-auto border bg-card"}`}>
      {!mine && <p className="mb-1 text-xs font-semibold text-primary">{name}</p>}
      {parent && <p className="mb-1 truncate border-s-2 border-primary/50 ps-2 text-xs text-muted-foreground">رد على: {parent["deleted_at"] ? "رسالة محذوفة" : parent["body"] || "مرفق"}</p>}
      {m["reply_to"] && !parent && <p className="mb-1 border-s-2 ps-2 text-xs text-muted-foreground">رد على رسالة أقدم</p>}
      {deleted ? <p className="italic text-muted-foreground">حُذفت هذه الرسالة</p> : editing ? (
        <form className="space-y-1" onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await db.rpc("edit_message", { _id: m["id"], _body: text });
          if (error) return void toast.error(arabicError(error));
          setEditing(false); onChanged();
        }}>
          <Textarea aria-label="تعديل الرسالة" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
          <div className="flex gap-1"><Button size="sm">حفظ</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button></div>
        </form>
      ) : m["body"] && <SafeText text={m["body"]} />}
      {!deleted && files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {files.map((f) => <li key={f["id"]}><button onClick={() => openFile(f)} className="flex max-w-full items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"><Paperclip className="size-3 shrink-0" /><span className="truncate">{f["name"]}</span> ({Math.ceil(f["size_bytes"] / 1024)} ك.ب)</button></li>)}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>{timeLabel(m["created_at"])}</span>
        {m["edited_at"] && !deleted && <span>• معدّلة</span>}
        {receipt && <span>• {receipt}</span>}
        {!deleted && canAct && (
          <span className="flex gap-1 opacity-70 group-hover:opacity-100">
            <button aria-label="رد" title="رد" onClick={onReply}><Reply className="size-3.5" /></button>
            {mine && <button aria-label="تعديل" title="تعديل" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></button>}
            {(mine || isGroup) && <button aria-label="حذف" title="حذف" onClick={async () => {
              if (!window.confirm("حذف الرسالة؟ يبقى أثرها «حُذفت هذه الرسالة».")) return;
              const { error } = await db.rpc("delete_message", { _id: m["id"] });
              if (error) toast.error(arabicError(error)); else onChanged();
            }}><Trash2 className="size-3.5" /></button>}
            {!mine && <button aria-label="إبلاغ" title="إبلاغ" onClick={async () => {
              const reason = window.prompt("سبب الإبلاغ (يراه المسؤول المخول فقط)");
              if (!reason) return;
              const { error } = await db.rpc("report_message", { _message: m["id"], _reason: reason, _file: null });
              if (error) toast.error(arabicError(error)); else toast.success("أُرسل البلاغ للجهة المخولة بالمراجعة");
            }}><Flag className="size-3.5" /></button>}
          </span>
        )}
      </div>
    </li>
  );
}

function Composer({ conv, reply, names, onCancelReply, onSend }: { conv: Row; reply: Row | null; names: Record<string, string>; onCancelReply: () => void; onSend: (body: string, fileIds: string[]) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const allowFiles = conv["kind"] !== "group" || conv["school_id"];
  const uploading = pending.some((p) => p.status === "uploading");

  async function start(p: PendingFile) {
    setPending((x) => x.map((y) => (y.key === p.key ? { ...p, status: "uploading" } : y)));
    try {
      const r = await uploadMessageFile(conv["id"], p.file);
      setPending((x) => x.map((y) => (y.key === p.key ? { ...y, status: "ready", id: r.id, path: r.path } : y)));
    } catch (e) {
      setPending((x) => x.map((y) => (y.key === p.key ? { ...y, status: "failed", error: (e as Error).message } : y)));
    }
  }

  return (
    <form className="space-y-2 border-t p-3" onSubmit={async (e) => {
      e.preventDefault();
      if (uploading) return void toast.error("انتظر اكتمال رفع المرفقات");
      if (pending.some((p) => p.status === "failed")) return void toast.error("أزل المرفق الفاشل أو أعد رفعه قبل الإرسال");
      const ready = pending.filter((p) => p.status === "ready").map((p) => p.id!);
      if (!body.trim() && !ready.length) return;
      const b = body;
      setBody(""); setPending([]);
      await onSend(b, ready);
    }}>
      {reply && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1 text-xs">
          <Reply className="size-3" /> <span className="min-w-0 flex-1 truncate">رد على {names[reply["sender_id"]] ?? ""}: {reply["body"]}</span>
          <button type="button" aria-label="إلغاء الرد" onClick={onCancelReply}><X className="size-3" /></button>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {pending.map((p) => (
            <li key={p.key} className={`flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs ${p.status === "failed" ? "border-destructive text-destructive" : ""}`}>
              {p.status === "uploading" ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />}
              <span className="max-w-40 truncate">{p.file.name}</span>
              <span>{p.status === "uploading" ? "جارٍ الرفع…" : p.status === "ready" ? "جاهز" : p.error}</span>
              {p.status === "failed" && <button type="button" className="underline" onClick={() => start(p)}>إعادة</button>}
              {p.status !== "uploading" && <button type="button" aria-label="إزالة المرفق" onClick={() => { if (p.id && p.path) discardPendingFile(p.id, p.path); setPending((x) => x.filter((y) => y.key !== p.key)); }}><X className="size-3" /></button>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <Textarea aria-label="نص الرسالة" placeholder="اكتب رسالتك…" rows={2} maxLength={4000} className="min-h-0 flex-1 resize-none" value={body} onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        {allowFiles && conv["kind"] && (
          <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border hover:bg-muted" aria-label="إرفاق ملف" title="إرفاق ملف">
            <Paperclip className="size-4" />
            <input type="file" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              const p: PendingFile = { key: crypto.randomUUID(), file: f, status: "uploading" };
              setPending((x) => [...x, p]); start(p);
            }} />
          </label>
        )}
        <Button className="shrink-0" disabled={uploading}>إرسال</Button>
      </div>
    </form>
  );
}
