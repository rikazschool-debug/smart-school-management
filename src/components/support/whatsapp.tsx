import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Paperclip, RefreshCw, Search, Send } from "lucide-react";
import { selectCls } from "@/components/ui/native-select";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ask } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { waMedia, waSend, waSync, waSyncAssign } from "@/lib/wa-inbox.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const ST: Record<string, string> = { sending: "يُرسل…", accepted: "قبِله WATI", sent: "أُرسلت", delivered: "وصلت", read: "قُرئت", replied: "رُدّ عليها", failed: "فشلت", unknown: "غير مؤكدة", received: "" };
const KIND: Record<string, string> = { image: "صورة", document: "ملف", video: "فيديو", audio: "صوت", voice: "رسالة صوتية", sticker: "ملصق" };
const when = (t?: string | null) => (t ? new Date(t).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "short", timeStyle: "short" }) : "");

/** «واتساب» tab: conversations visible per WATI assignment (owner = all; «محادثاتي» / «محادثات الفرع» by permission). The server filters. */
export function WhatsAppInbox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [links, setLinks] = useState(false);
  const sync = useServerFn(waSync); const syncAssign = useServerFn(waSyncAssign);
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["wa-me"], queryFn: async () => { const r = await supabase.rpc("wa_me" as never); if (r.error) throw r.error; return r.data as Row; }, refetchInterval: 30_000 });
  const boxes: { k: string; l: string }[] = me.data ? [
    ...(me.data.owner ? [{ k: "", l: "كل المحادثات" }] : []),
    ...(me.data.owner || me.data.mine ? [{ k: "mine", l: "محادثاتي" }] : []),
    ...(me.data.owner || me.data.branch ? [{ k: "branch", l: "محادثات الفرع" }] : []),
    ...(me.data.owner ? [{ k: "unmapped", l: "أكواد غير مربوطة" }] : []),
  ] : [];
  const [box, setBox] = useState<string | null>(null);
  const b = box ?? boxes[0]?.k ?? "";
  const list = useQuery({
    queryKey: ["wa-convs", q, b],
    enabled: !!me.data,
    queryFn: async () => { const r = await supabase.rpc("wa_conversations_list" as never, { _q: q || null, _box: b || null } as never); if (r.error) throw r.error; return (r.data ?? []) as Row[]; },
    refetchInterval: 15_000,
  });
  const [busy, setBusy] = useState(false);
  const refreshAll = () => Promise.all([qc.invalidateQueries({ queryKey: ["wa-convs"] }), qc.invalidateQueries({ queryKey: ["wa-me"] })]);
  const pull = async (force = false) => {
    setBusy(true);
    try { await sync({ data: {} }); await syncAssign({ data: { force } }); await refreshAll(); }
    catch (e) { toast.error((e as Error).message); await refreshAll(); } finally { setBusy(false); }
  };
  useEffect(() => { void pull(); const t = setInterval(() => { void syncAssign({ data: {} }).then(refreshAll).catch(() => void refreshAll()); }, 60_000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (me.isLoading) return <LoadingState />;
  if (me.error) return <ErrorState message="لا تملك صلاحية محادثات واتساب" />;
  if (links) return <WaLinks onBack={() => { setLinks(false); void refreshAll(); }} />;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex flex-wrap gap-1">
          {boxes.map((x) => (
            <button key={x.k} role="tab" aria-selected={b === x.k} onClick={() => { setBox(x.k); setOpen(null); }}
              className={`rounded-full border px-3 py-1 text-sm ${b === x.k ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}>{x.l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>آخر مزامنة للإسناد من WATI: {me.data.synced_at ? when(me.data.synced_at) : "لم تتم بعد"}</span>
          {me.data.sync_error && <span className="text-destructive">({String(me.data.sync_error).slice(0, 60)})</span>}
          {me.data.owner && <Button size="sm" variant="outline" onClick={() => setLinks(true)}><Link2 className="size-4" /> ربط موظفي وفرق واتساب</Button>}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b p-2">
            <div className="relative flex-1"><Search className="absolute right-2 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم" className="pr-8" /></div>
            <Button size="icon" variant="outline" onClick={() => pull(true)} disabled={busy} aria-label="تحديث من WATI"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /></Button>
          </div>
          {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message="تعذّر تحميل المحادثات" onRetry={() => void list.refetch()} /> : !list.data?.length ? <EmptyState title="لا توجد محادثات هنا" /> : (
            <ul className="max-h-[70vh] divide-y overflow-y-auto">
              {list.data.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setOpen(c.id)} className={`w-full p-3 text-right hover:bg-muted ${open === c.id ? "bg-muted" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.contact_name || c.wa_id || "بدون اسم"}</span>
                      {c.unread > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{c.unread}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{c.last_text ?? ""}</div>
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <span>{when(c.last_at)}</span>
                      {c.mine && <span className="rounded bg-primary/10 px-1 text-primary">مسندة إليّ</span>}
                      {!c.mine && c.assignee_name && <span className="rounded bg-muted px-1">{c.assignee_name}</span>}
                      {(c.branches ?? []).map((n: string) => <span key={n} className="rounded bg-muted px-1">{n}</span>)}
                      {c.unmapped && <span className="rounded bg-destructive/10 px-1 text-destructive">كود غير مربوط</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {open ? <Thread key={open} id={open} /> : <div className="rounded-lg border bg-card p-8"><EmptyState title="اختر محادثة" /></div>}
      </div>
    </div>
  );
}

/** Owner-only page: WATI operator code → Rikaz employee, WATI team code → branch, with sample chats to verify before saving. */
function WaLinks({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["wa-codes"], queryFn: async () => { const r = await supabase.rpc("wa_codes" as never); if (r.error) throw r.error; return r.data as Row; } });
  const [pick, setPick] = useState<Record<string, string>>({});
  const save = async (kind: "op" | "team", code: string, value: string, label?: string) => {
    const v = value || null;
    if (!v && !(await ask("إلغاء ربط هذا الكود؟ ستعود محادثاته للمالك فقط."))) return;
    const r = kind === "op" ? await supabase.rpc("wa_link_operator" as never, { _code: code, _user: v } as never)
      : await supabase.rpc("wa_link_team" as never, { _code: code, _school: v, _label: label ?? null } as never);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("حُفظ الربط"); void qc.invalidateQueries({ queryKey: ["wa-codes"] });
  };
  if (d.isLoading) return <LoadingState />;
  if (d.error) return <ErrorState message="تعذّر تحميل الأكواد" onRetry={() => void d.refetch()} />;
  const hint = (arr: { n: string; k: number }[] | null) => (arr ?? []).map((x) => `${x.n} (${x.k})`).join("، ");
  const Card = ({ c, kind }: { c: Row; kind: "op" | "team" }) => {
    const cur = kind === "op" ? c.user_id ?? "" : c.school_id ?? "";
    const key = kind + c.code; const val = pick[key] ?? cur;
    return (
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <code className="text-xs" dir="ltr">{c.code}</code>
          <span className="text-xs text-muted-foreground">{c.count} محادثة</span>
        </div>
        <div className="text-xs text-muted-foreground">أمثلة: {(c.samples ?? []).join("، ") || "—"}</div>
        {kind === "op" && c.owners?.length > 0 && <div className="text-xs">«مالك جهة الاتصال» في WATI: {hint(c.owners)}</div>}
        {kind === "op" && c.operators?.length > 0 && <div className="text-xs">اسم المرسل في ردود هذه المحادثات: {hint(c.operators)}</div>}
        {kind === "team" && c.names?.length > 0 && <div className="text-xs">اسم الفريق على جهات الاتصال: {hint(c.names)}</div>}
        <div className="flex items-center gap-2">
          <select className={selectCls()} value={val} onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.value }))}>
            <option value="">— غير مربوط —</option>
            {kind === "op" ? d.data.staff.map((s: Row) => <option key={s.user_id} value={s.user_id}>{s.name} — {s.school}</option>)
              : d.data.schools.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" disabled={val === cur} onClick={() => save(kind, c.code, val, kind === "team" ? c.names?.[0]?.n : undefined)}>حفظ</Button>
        </div>
        {cur && <div className="text-xs text-primary">مربوط حاليًا: {kind === "op" ? c.user_name : c.school_name}</div>}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">ربط موظفي وفرق واتساب</h2>
          <p className="text-sm text-muted-foreground">WATI لا يتيح أسماء موظفيه وفرقه عبر الواجهة، لذلك تظهر الأكواد مع أمثلة للتحقق. الإسناد نفسه يبقى من WATI.</p></div>
        <Button variant="outline" onClick={onBack}>رجوع للمحادثات</Button>
      </div>
      <section className="space-y-2"><h3 className="font-semibold">موظفو WATI ← حسابات ركاز</h3>
        {d.data.operators.length ? <div className="grid gap-2 md:grid-cols-2">{d.data.operators.map((c: Row) => <Card key={c.code} c={c} kind="op" />)}</div> : <EmptyState title="لا أكواد بعد — حدّث المزامنة" />}</section>
      <section className="space-y-2"><h3 className="font-semibold">فرق WATI ← الفروع</h3>
        {d.data.teams.length ? <div className="grid gap-2 md:grid-cols-2">{d.data.teams.map((c: Row) => <Card key={c.code} c={c} kind="team" />)}</div> : <EmptyState title="لا أكواد بعد" />}</section>
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

/** Server gate mirror (wa_org_ok): owner of the linked org, or a wa_inbox mine/branch holder there. */
export function useWaOrgOk(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["wa-org-ok", orgId], enabled: !!orgId, staleTime: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc("wa_org_ok" as never, { _org: orgId } as never); if (error) return false; return data === true; },
  });
}
