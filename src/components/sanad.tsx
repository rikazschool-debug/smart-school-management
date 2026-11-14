import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askSanad } from "@/lib/sanad.functions";

type Msg = { role: "user" | "model"; text: string };

/** Minimal safe renderer: paragraphs, bullet lines and **bold** (no HTML injection). */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-7">
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const body = line.replace(/^\s*[-*•]\s+/, "").replace(/^#+\s*/, "");
        const segs = body.split(/(\*\*[^*]+\*\*)/g).map((s, j) => (s.startsWith("**") && s.endsWith("**") ? <b key={j}>{s.slice(2, -2)}</b> : <span key={j}>{s}</span>));
        if (!body.trim()) return <div key={i} className="h-1" />;
        return bullet ? <p key={i} className="flex gap-2"><span className="text-primary">•</span><span className="min-w-0">{segs}</span></p> : <p key={i}>{segs}</p>;
      })}
    </div>
  );
}

const SUGGEST: Record<string, string[]> = {
  default: ["ما الذي يمكنك مساعدتي فيه؟", "لخّص لي أهم الأرقام في لوحتي"],
  guardian: ["ما آخر درجات أبنائي؟", "هل توجد رحلات أو فعاليات قادمة؟", "كم الرسوم المتبقية على أبنائي؟"],
  principal: ["كم عدد المعلمين وتخصصاتهم؟", "ما الشعب وعدد الطلاب في كل شعبة؟", "ما الواجبات المستحقة هذا الأسبوع؟"],
  teacher: ["ما واجباتي المفتوحة؟", "كم طالبًا في شعبي؟"],
  student: ["ما واجباتي القادمة؟", "ما درجاتي الأخيرة؟"],
};

export function Sanad({ schoolId, role, roleLabel }: { schoolId: string | null; role: string; roleLabel: string }) {
  const ask = useServerFn(askSanad);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  useEffect(() => { if (open) ta.current?.focus(); }, [open, busy]);
  useEffect(() => { setMsgs([]); }, [schoolId, role]); // a different capacity never inherits the previous answers

  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, text: t }];
    setMsgs(next); setQ(""); setBusy(true);
    try {
      const r = await ask({ data: { schoolId, roleLabel, messages: next } });
      setMsgs([...next, { role: "model", text: "error" in r && r.error ? `⚠️ ${r.error}` : (r as { text: string }).text }]);
    } catch { setMsgs([...next, { role: "model", text: "⚠️ تعذر الوصول إلى المساعد" }]); }
    finally { setBusy(false); }
  }

  const sugg = SUGGEST[role] ?? SUGGEST["default"]!;
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="المساعد سند" className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:opacity-90">
          <Bot className="size-5" /> سند
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="المساعد سند" className="fixed inset-x-2 bottom-2 z-50 flex h-[75vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:inset-x-auto sm:left-5 sm:bottom-5 sm:w-[400px]">
          <div className="flex items-center gap-3 border-b bg-primary px-4 py-3 text-primary-foreground">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15"><Bot className="size-5" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">سند</p><p className="truncate text-xs opacity-80">يجيب من سجلاتك فقط · {roleLabel}</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="size-5" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!msgs.length && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">مرحبًا، أنا سند. اسألني عن بيانات لوحتك أو عن طريقة استخدام أقسام ركاز.</p>
                <div className="flex flex-wrap gap-2">{sugg.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-muted">{s}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => m.role === "user"
              ? <div key={i} className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.text}</div>
              : <div key={i} className="max-w-[95%]"><Rich text={m.text} /></div>)}
            {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> سند يراجع سجلاتك…</p>}
            <div ref={end} />
          </div>
          <form className="flex items-end gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
            <textarea ref={ta} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(q); } }} rows={1} placeholder="اكتب سؤالك…" aria-label="سؤال لسند" className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <Button type="submit" size="icon" disabled={busy || !q.trim()} aria-label="إرسال السؤال"><Send className="size-4" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
