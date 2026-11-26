// «القنوات والرسائل»: channel readiness, the approved WATI templates mirror (refreshed on demand through auWaSync, read-only on
// WATI) and the outgoing message log. Phone numbers are never returned by au_msgs_list; message text is shown to the system
// manager only. Real sending stays off until explicitly approved (au_platform.wa_live + RIKAZ_AU_WA_LIVE).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState, EmptyState } from "@/components/states";
import { auWaSync } from "@/lib/au-wa.functions";
import { fmt, rpc, type Any } from "./lib";

const ST: Record<string, [string, string]> = {
  simulated: ["محاكاة", "bg-secondary text-secondary-foreground"], queued: ["بالانتظار", "bg-secondary text-secondary-foreground"], sending: ["جارٍ الإرسال", "bg-secondary text-secondary-foreground"],
  accepted: ["قبلها المزود", "bg-primary/15 text-primary"], delivered: ["سُلّمت", "bg-primary/15 text-primary"], read: ["قُرئت", "bg-primary/15 text-primary"],
  failed: ["فشلت", "bg-destructive/10 text-destructive"], unknown: ["غير مؤكدة — لا تُعاد آليًا", "bg-warning/15 text-warning-foreground"], cancelled: ["أُلغيت", "bg-muted text-muted-foreground"],
};
const READY: Record<string, string> = { ready: "جاهزة", simulation: "محاكاة فقط", not_ready: "غير جاهزة" };

export function ChannelsTab({ orgId, canSync }: { orgId: string; canSync: boolean }) {
  const qc = useQueryClient();
  const sync = useServerFn(auWaSync);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const info = useQuery({ queryKey: ["au-channels", orgId], queryFn: () => rpc<Any>("au_channels_info", { _org: orgId }) });
  const tpls = useQuery({ queryKey: ["au-wa-tpls", orgId], queryFn: () => rpc<Any>("au_wa_templates_list", { _org: orgId, _q: null }) });
  const msgs = useQuery({ queryKey: ["au-msgs", orgId, status], queryFn: () => rpc<Any[]>("au_msgs_list", { _org: orgId, _status: status || null, _limit: 200 }) });
  const doSync = async () => {
    setBusy(true);
    try { const r = await sync({ data: { org: orgId } }); toast.success(`تم تحديث القوالب: ${r.usable} قابلة للاستخدام من ${r.total}`); await qc.invalidateQueries({ queryKey: ["au-wa-tpls"] }); await qc.invalidateQueries({ queryKey: ["au-channels"] }); }
    catch (e) { toast.error((e as Error).message || "تعذر تحديث القوالب"); } finally { setBusy(false); }
  };
  if (info.isLoading) return <LoadingState />;
  if (info.error) return <ErrorState message={(info.error as Error).message} />;
  const i = info.data ?? {};
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        {((i.channels ?? []) as Any[]).map((c) => (
          <div key={c.code} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between"><span className="font-semibold">{c.label}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{READY[c.readiness] ?? c.readiness}</span></div>
            {c.note && <p className="mt-2 text-xs leading-5 text-muted-foreground">{c.note}</p>}
          </div>))}
      </section>
      <p className="rounded-lg bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
        الإرسال الحقيقي عبر واتساب: <b>{i.wa_live ? "مفعّل" : "معطّل"}</b>. الموافقة على التواصل: {i.consent_mode === "explicit" ? "موافقة صريحة لكل مستلم" : "الرقم المسجل يكفي ما لم يطلب صاحبه الإيقاف"}.
        لا تُكرر المطالبة نفسها إن أرسلتها خدمة الرسوم القائمة خلال {i.claim_gap_days ?? 3} أيام، ولا يبرر اختلاف القناة أو القالب تكرارها.
      </p>
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold">قوالب واتساب المعتمدة {i.synced_at ? <span className="text-xs font-normal text-muted-foreground">· آخر تحديث {fmt(i.synced_at)}</span> : null}</h3>
          {canSync && <Button size="sm" variant="outline" disabled={busy} onClick={() => void doSync()}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />تحديث من WATI</Button>}
        </div>
        {tpls.isLoading ? <LoadingState /> : !((tpls.data?.items ?? []) as Any[]).length ? <EmptyState title="لا توجد قوالب بعد" hint="حدّث القوالب من حساب WATI المرتبط." /> : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted/60"><tr><th className="px-3 py-2 text-start">القالب</th><th className="px-3 py-2 text-start">المتغيرات</th><th className="px-3 py-2 text-start">الحالة</th></tr></thead>
              <tbody>{((tpls.data?.items ?? []) as Any[]).map((t) => (
                <tr key={t.name} className="border-t border-border align-top"><td className="px-3 py-2"><div className="font-medium" dir="ltr">{t.name}</div><div className="line-clamp-2 max-w-md text-xs text-muted-foreground">{t.body}</div></td>
                  <td className="px-3 py-2 text-xs" dir="ltr">{((t.params ?? []) as string[]).map((p) => `{{${p}}}`).join(" ") || "—"}</td>
                  <td className="px-3 py-2 text-xs">{t.usable ? <span className="text-primary">متاح للأتمتة</span> : <span className="text-muted-foreground">{t.reason}</span>}</td></tr>))}</tbody></table>
          </div>)}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2"><h3 className="font-bold">سجل الرسائل الخارجية</h3>
          <select className={selectCls()} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="تصفية الحالة"><option value="">كل الحالات</option>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {msgs.isLoading ? <LoadingState /> : msgs.error ? <ErrorState message={(msgs.error as Error).message} /> : !msgs.data?.length ? <EmptyState title="لا رسائل بعد" hint="تظهر هنا رسائل واتساب التي تنشئها القواعد (محاكاة حتى الموافقة على الإرسال)." /> : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm"><thead className="bg-muted/60"><tr>{["الوقت", "المستلم", "القاعدة", "القالب", "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
              <tbody>{msgs.data.map((m) => { const s = ST[m.status] ?? [m.status, ""]; return (
                <tr key={m.id} className="border-t border-border align-top"><td className="px-3 py-2 text-xs">{fmt(m.at)}</td><td className="px-3 py-2">{m.recipient}<div className="text-xs text-muted-foreground">{m.school}</div></td>
                  <td className="px-3 py-2 text-xs">{m.rule}</td><td className="px-3 py-2 text-xs" dir="ltr">{m.template}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${s[1]}`}>{s[0]}</span>{m.preview && <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted-foreground">نص الرسالة</summary><p className="whitespace-pre-wrap pt-1">{m.preview}</p></details>}</td></tr>); })}</tbody></table>
          </div>)}
      </section>
    </div>
  );
}
