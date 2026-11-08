import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormFields, missingRequired } from "@/components/events/form-render";
import { APP_STATUS, fmtDT, type Answers, type Field } from "@/components/events/shared";
import { PUBLIC_ERR, trackPublicApp, updatePublicApp } from "@/lib/events-public.functions";
import { Shell } from "./join.$token";

export const Route = createFileRoute("/join/track/$code")({
  head: () => ({ meta: [
    { title: "متابعة طلب التسجيل — ركاز" }, { name: "description", content: "تابع حالة طلب تسجيلك في الدورة واستكمل البيانات المطلوبة." },
    { property: "og:title", content: "متابعة طلب التسجيل — ركاز" }, { property: "og:description", content: "صفحة خاصة بصاحب الطلب لمتابعة حالته." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: TrackPage,
});

type Track = { error?: string; ref: string; status: string; message: string | null; name: string; created_at: string; updated_at: string; rev: number;
  item: { title: string; school: string; status: string; cancel_reason: string | null; sessions: { starts_at: string; title: string | null }[] };
  can_update: boolean; can_withdraw: boolean; fields: Field[] | null; answers: Answers | null };

function TrackPage() {
  const { code } = Route.useParams();
  const q = useQuery({ queryKey: ["evt-track", code], queryFn: () => trackPublicApp({ data: { code } }) as Promise<Track> });
  const [ans, setAns] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  useEffect(() => { if (q.data?.answers) setAns(q.data.answers); }, [q.data?.answers]);
  if (q.isLoading) return <Shell><p className="text-muted-foreground">جارٍ التحميل…</p></Shell>;
  const t = q.data;
  if (!t || t.error) return <Shell><p className="text-destructive">{t?.error === "rate" ? PUBLIC_ERR["rate"] : "رابط المتابعة غير صحيح."}</p></Shell>;
  const [label] = APP_STATUS[t.status] ?? [t.status];

  async function act(action: "update" | "withdraw") {
    if (!t || busy) return;
    if (action === "update" && t.fields) { const m = missingRequired(t.fields, ans); if (m) { setErr(`الحقل «${m}» مطلوب`); return; } }
    if (action === "withdraw" && !sure) { setSure(true); return; }
    setBusy(true); setErr(null);
    try {
      const r = (await updatePublicApp({ data: { code, rev: t.rev, action, answers: ans } })) as Record<string, unknown>;
      if (r["ok"]) { toast.success(action === "withdraw" ? "سُحب طلبك" : "أُرسلت البيانات"); await q.refetch(); return; }
      setErr(String(r["message"] ?? PUBLIC_ERR[String(r["error"])] ?? PUBLIC_ERR["server"]));
    } catch { setErr(PUBLIC_ERR["server"]!); } finally { setBusy(false); }
  }

  return (
    <Shell>
      <p className="text-xs text-muted-foreground">{t.item.school}</p>
      <h1 className="mt-1 text-xl font-bold">{t.item.title}</h1>
      <div className="mt-4 rounded-xl border p-4">
        <p className="text-sm">المشارك: <b>{t.name}</b> · الرقم المرجعي: <b dir="ltr">{t.ref}</b></p>
        <p className="mt-2 text-lg font-bold" data-status={t.status}>الحالة: {label}</p>
        {t.message && <p className="mt-1 whitespace-pre-wrap text-sm">{t.message}</p>}
        <p className="mt-2 text-xs text-muted-foreground">أُرسل {fmtDT(t.created_at)} · آخر تحديث {fmtDT(t.updated_at)}</p>
        {t.item.status === "cancelled" && <p className="mt-2 text-sm text-destructive">أُلغيت الدورة{t.item.cancel_reason ? `: ${t.item.cancel_reason}` : ""}</p>}
      </div>
      {t.can_update && t.fields && (
        <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void act("update"); }}>
          <h2 className="font-bold">استكمال البيانات</h2>
          <FormFields fields={t.fields} value={ans} onChange={setAns} disabled={busy} />
          <Button type="submit" disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال البيانات المستكملة"}</Button>
        </form>
      )}
      {err && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
      {t.can_withdraw && <div className="mt-4 flex flex-wrap items-center gap-2"><Button variant={sure ? "destructive" : "outline"} disabled={busy} onClick={() => void act("withdraw")}>{sure ? "تأكيد سحب الطلب نهائيًا" : "سحب الطلب"}</Button>{sure && <Button variant="ghost" onClick={() => setSure(false)}>تراجع</Button>}</div>}
    </Shell>
  );
}
