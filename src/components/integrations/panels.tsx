import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Play, Plus, RotateCw, Send, Zap, Pencil, Check, X, KeyRound, Activity, Bell, Fingerprint, Lock, FlaskConical, ShieldCheck, Gauge } from "lucide-react";
type Tone = "ok" | "warn" | "bad";
import { toast } from "sonner";
import { ask, askText } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { buildOpenApi, buildPostman, type SpecRes } from "@/lib/api-spec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { dispatchWebhooks } from "@/lib/integrations.functions";
import { webhookUrlOk } from "@/lib/api-gateway";
import { act, Badge, Card, DELIVERY_STATUS, EVENT_LABELS, fmt, HOOK_STATUS, Json, OUTCOME, rpc, SecretDialog, useCatalog, type Row } from "./shared";
import { useKeys } from "./keys";

// ---------- overview ----------
export function OverviewTab({ orgId }: { orgId: string }) {
  const q = useQuery({ queryKey: ["api", "overview", orgId], queryFn: () => rpc<Row>("api_overview", { _org: orgId }) });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const o = q.data ?? {};
  const k = o["keys"] ?? {}, r = o["requests_24h"] ?? {}, dl = o["deliveries"] ?? {}, w = o["webhooks"] ?? {};
  const groups: { t: string; d: string; icon: typeof KeyRound; items: { l: string; v: number | string; tone?: Tone | undefined; hint?: string }[] }[] = [
    { t: "المفاتيح", d: "حالة مفاتيح الربط الصادرة", icon: KeyRound, items: [
      { l: "فعّالة", v: k["active"] ?? 0, tone: "ok" },
      { l: "موقوفة / ملغاة", v: (k["paused"] ?? 0) + (k["revoked"] ?? 0) },
      { l: "تنتهي خلال 14 يومًا", v: k["expiring"] ?? 0, tone: k["expiring"] ? "warn" : undefined },
      { l: "إنتاج / اختبار", v: `${k["live"] ?? 0} / ${k["test"] ?? 0}` },
    ] },
    { t: "الطلبات — آخر 24 ساعة", d: "حركة الاستدعاءات على البوابة", icon: Activity, items: [
      { l: "إجمالي الطلبات", v: r["total"] ?? 0 },
      { l: "ناجحة", v: r["ok"] ?? 0, tone: r["ok"] ? "ok" : undefined },
      { l: "مرفوضة الصلاحية", v: r["denied"] ?? 0, tone: r["denied"] ? "bad" : undefined },
      { l: "متوسط زمن الاستجابة", v: r["avg_ms"] ?? 0, hint: "مللي ث" },
    ] },
    { t: "الإشعارات والاعتمادات", d: "ما ينتظر إجراءً منك", icon: Bell, items: [
      { l: "سداد بانتظار الاعتماد", v: o["inbox_pending"] ?? 0, tone: o["inbox_pending"] ? "warn" : undefined },
      { l: "إشعارات بانتظار الإرسال", v: dl["pending"] ?? 0, tone: dl["pending"] ? "warn" : undefined },
      { l: "إشعارات متوقفة", v: dl["dead"] ?? 0, tone: dl["dead"] ? "bad" : undefined },
      { l: "Webhooks فعّالة", v: `${w["active"] ?? 0} / ${w["total"] ?? 0}` },
    ] },
  ];
  const rules: { icon: typeof KeyRound; t: string; d: string }[] = [
    { icon: Fingerprint, t: "المفتاح يظهر مرة واحدة", d: "ركاز يحفظ بصمته (SHA-256) فقط." },
    { icon: Lock, t: "نطاق محصور", d: "كل مفتاح محصور في مجموعتك ومدارسه وأعوامه وشعبه وحقوله؛ الحقول الحساسة باختيار صريح فقط." },
    { icon: FlaskConical, t: "مفاتيح الاختبار آمنة", d: "تتحقق من كل شيء ولا تحفظ أي تعديل." },
    { icon: ShieldCheck, t: "لا حذف عبر API", d: "عمليات السداد الواردة تنتظر اعتمادك قبل تسجيلها." },
    { icon: Gauge, t: "حدود ومراقبة", d: "حدود بالدقيقة واليوم، تقييد اختياري بعناوين IP، وتنبيه عند التجاوز أو الرفض." },
    { icon: Send, t: "إرسال Webhooks يدوي", d: "من هذه اللوحة حتى تعتمد أول تكامل؛ لا إرسال تلقائي." },
  ];
  const toneCls: Record<Tone, string> = { ok: "text-success", warn: "text-warning-foreground", bad: "text-destructive" };
  const dot: Record<Tone, string> = { ok: "bg-success", warn: "bg-warning", bad: "bg-destructive" };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.t} className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <header className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><g.icon className="h-4 w-4" /></span>
              <div className="min-w-0"><h3 className="truncate font-display text-sm font-bold">{g.t}</h3><p className="truncate text-xs text-muted-foreground">{g.d}</p></div>
            </header>
            <div className="grid grid-cols-2">
              {g.items.map((it, i) => (
                <div key={it.l} className={`p-4 ${i % 2 === 0 ? "border-e" : ""} ${i < 2 ? "border-b" : ""}`}>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{it.tone && <span className={`h-1.5 w-1.5 rounded-full ${dot[it.tone]}`} />}{it.l}</div>
                  <div className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${it.tone ? toneCls[it.tone] : ""}`}>{it.v}{it.hint && <span className="ms-1 text-xs font-normal text-muted-foreground">{it.hint}</span>}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="font-display text-base font-bold">قواعد الأمان المطبقة</h3></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((x) => (
            <div key={x.t} className="flex gap-3 rounded-lg border bg-background/60 p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><x.icon className="h-4 w-4" /></span>
              <div className="min-w-0"><div className="text-sm font-semibold">{x.t}</div><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{x.d}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- logs ----------
export function LogsTab({ orgId }: { orgId: string }) {
  const keys = useKeys(orgId);
  const [key, setKey] = useState(""); const [outcome, setOutcome] = useState("");
  const q = useQuery({ queryKey: ["api", "logs", orgId, key, outcome], queryFn: () => rpc<Row[]>("api_requests_list", { _org: orgId, _key: key || null, _outcome: outcome || null, _limit: 200 }) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className={selectCls("w-56")} value={key} onChange={(e) => setKey(e.target.value)}><option value="">كل المفاتيح</option>{(keys.data ?? []).map((k) => <option key={k["id"]} value={k["id"]}>{k["name"]}</option>)}</select>
        <select className={selectCls("w-44")} value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="">كل النتائج</option>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
      </div>
      {q.isLoading ? <LoadingState rows={3} /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !(q.data ?? []).length ? <EmptyState title="لا توجد طلبات مسجلة" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>المفتاح</TableHead><TableHead>العملية</TableHead><TableHead>المورد</TableHead><TableHead>المدرسة</TableHead><TableHead>النتيجة</TableHead><TableHead>الرمز</TableHead><TableHead>المصدر</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((r) => (
                <TableRow key={r["id"]}>
                  <TableCell className="whitespace-nowrap text-xs">{fmt(r["at"])}</TableCell>
                  <TableCell className="text-xs">{r["key_name"] ?? <span className="text-muted-foreground">مفتاح غير صالح</span>}</TableCell>
                  <TableCell dir="ltr" className="text-xs font-mono">{r["method"]}</TableCell>
                  <TableCell className="text-xs font-mono" dir="ltr">{r["resource"]}{r["record_id"] ? `/${String(r["record_id"]).slice(0, 8)}` : ""}</TableCell>
                  <TableCell className="text-xs">{r["school_name"] ?? "—"}</TableCell>
                  <TableCell><Badge cls={OUTCOME[r["outcome"]]?.cls}>{r["status"]} · {OUTCOME[r["outcome"]]?.l ?? r["outcome"]}</Badge></TableCell>
                  <TableCell className="text-xs font-mono" dir="ltr">{r["code"] ?? ""}</TableCell>
                  <TableCell className="text-xs">{r["via"] === "explorer" ? "المستكشف" : (r["ip"] ?? "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------- webhooks ----------
type HookDraft = { id: string | null; name: string; key_id: string; url: string; events: string[]; include_data: boolean };
export function WebhooksTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const keys = useKeys(orgId); const cat = useCatalog();
  const hooks = useQuery({ queryKey: ["api", "hooks", orgId], queryFn: () => rpc<Row[]>("api_webhooks_list", { _org: orgId }) });
  const dels = useQuery({ queryKey: ["api", "deliveries", orgId], queryFn: () => rpc<Row[]>("api_webhook_deliveries", { _org: orgId, _webhook: null, _limit: 100 }) });
  const [edit, setEdit] = useState<HookDraft | null>(null); const [secret, setSecret] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [view, setView] = useState<Row | null>(null);
  const dispatch = useServerFn(dispatchWebhooks);
  const refresh = () => qc.invalidateQueries({ queryKey: ["api"] });
  const events = (cat.data ?? []).flatMap((r) => r.events ?? []);
  const save = async () => {
    if (!edit) return;
    if (!webhookUrlOk(edit.url)) { toast.error("الرابط يجب أن يكون https باسم نطاق عام دون منفذ أو عنوان IP"); return; }
    const r = await act<{ secret?: string }>("api_webhook_save", { _org: orgId, _id: edit.id, _p: edit }, "حُفظ الإشعار");
    if (r) { setEdit(null); refresh(); if (r.secret) setSecret(r.secret); }
  };
  const sendNow = async () => {
    if (!(await ask("إرسال الإشعارات المعلّقة الآن إلى عناوين الأنظمة المرتبطة؟"))) return;
    setBusy(true);
    try { const r = await dispatch({ data: { orgId } }); toast.success(r.sent ? `أُرسل ${r.sent}: وصل ${r.delivered}، فشل ${r.failed}` : "لا توجد إشعارات مستحقة الآن"); } catch (e) { toast.error(arabicError(e)); }
    setBusy(false); refresh();
  };
  const liveKeys = (keys.data ?? []).filter((k) => k["status"] !== "revoked");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">الإرسال يدوي حتى تعتمد أول تكامل: تتجمع الأحداث هنا، وتُرسل فقط عند الضغط على «إرسال المعلّق الآن». الإشعار الفاشل يُعاد بتأخير متزايد حتى 6 محاولات، ويتعطل الإشعار بعد 10 إخفاقات متتالية.</div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={sendNow}><Send className="ms-1 h-4 w-4" />{busy ? "جارٍ الإرسال…" : "إرسال المعلّق الآن"}</Button>
        <Button disabled={!liveKeys.length} onClick={() => setEdit({ id: null, name: "", key_id: liveKeys[0]?.["id"] ?? "", url: "https://", events: [], include_data: false })}><Plus className="ms-1 h-4 w-4" />Webhook جديد</Button>
      </div>
      {hooks.isLoading ? <LoadingState rows={2} /> : !(hooks.data ?? []).length ? <EmptyState title="لا توجد إشعارات Webhook" hint={liveKeys.length ? "أضف عنوانًا يستقبل الأحداث من ركاز." : "أنشئ مفتاحًا بصلاحية قراءة أولًا."} /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(hooks.data ?? []).map((w) => (
            <Card key={w["id"]} title={w["name"]} action={<Badge cls={w["status"] === "active" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>{HOOK_STATUS[w["status"]]}</Badge>}>
              <p className="break-all font-mono text-xs" dir="ltr">{w["url"]}</p>
              <p className="mt-1 text-xs text-muted-foreground">المفتاح: {w["key_name"]} · السر {w["secret_hint"]} · {w["include_data"] ? "يتضمن البيانات" : "معرّفات فقط"}</p>
              <div className="mt-1 flex flex-wrap gap-1">{(w["events"] as string[]).map((e) => <Badge key={e}>{EVENT_LABELS[e] ?? e}</Badge>)}</div>
              {w["last_error"] && <p className="mt-1 text-xs text-destructive">آخر خطأ: {w["last_error"]}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEdit({ id: w["id"], name: w["name"], key_id: w["key_id"], url: w["url"], events: w["events"], include_data: w["include_data"] })}><Pencil className="ms-1 h-3.5 w-3.5" />تعديل</Button>
                <Button size="sm" variant="outline" onClick={async () => { if (await act("api_webhook_test", { _id: w["id"] }, "أضيف إشعار اختبار؛ أرسله بزر «إرسال المعلّق الآن»")) refresh(); }}><Zap className="ms-1 h-3.5 w-3.5" />اختبار</Button>
                <Button size="sm" variant="outline" onClick={async () => { if (!(await ask("تدوير السر يوقف التحقق بالسر الحالي فورًا. متابعة؟"))) return; const r = await act<{ secret: string }>("api_webhook_rotate_secret", { _id: w["id"] }); if (r) { setSecret(r.secret); refresh(); } }}><RotateCw className="ms-1 h-3.5 w-3.5" />تدوير السر</Button>
                {w["status"] === "active" ? <Button size="sm" variant="outline" onClick={async () => { if (await act("api_webhook_status", { _id: w["id"], _status: "paused" }, "أوقف")) refresh(); }}><Pause className="ms-1 h-3.5 w-3.5" />إيقاف</Button>
                  : <Button size="sm" variant="outline" onClick={async () => { if (await act("api_webhook_status", { _id: w["id"], _status: "active" }, "فُعّل")) refresh(); }}><Play className="ms-1 h-3.5 w-3.5" />تفعيل</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card title="سجل الإرسال">
        {dels.isLoading ? <LoadingState rows={2} /> : !(dels.data ?? []).length ? <p className="text-sm text-muted-foreground">لا توجد إشعارات بعد.</p> : (
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>الإشعار</TableHead><TableHead>الحدث</TableHead><TableHead>الحالة</TableHead><TableHead>المحاولات</TableHead><TableHead>آخر رد</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{(dels.data ?? []).map((d) => (
              <TableRow key={d["id"]}>
                <TableCell className="whitespace-nowrap text-xs">{fmt(d["created_at"])}</TableCell><TableCell className="text-xs">{d["webhook_name"]}</TableCell><TableCell className="text-xs">{EVENT_LABELS[d["event"]] ?? d["event"]}</TableCell>
                <TableCell><Badge cls={d["status"] === "delivered" ? "bg-success/15 text-success" : d["status"] === "dead" ? "bg-destructive/15 text-destructive" : undefined}>{DELIVERY_STATUS[d["status"]]}</Badge></TableCell>
                <TableCell className="text-xs">{d["attempts"]}</TableCell><TableCell className="text-xs">{d["last_code"] ?? ""} {d["last_error"] ?? ""}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => setView(d)}>المحتوى</Button></TableCell>
              </TableRow>))}</TableBody>
          </Table></div>
        )}
      </Card>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader><DialogTitle>{edit.id ? "تعديل Webhook" : "Webhook جديد"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>الاسم</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>المفتاح المرتبط (يحدد نطاق البيانات)</Label><select className={selectCls()} value={edit.key_id} onChange={(e) => setEdit({ ...edit, key_id: e.target.value })}>{liveKeys.map((k) => <option key={k["id"]} value={k["id"]}>{k["name"]} — {k["system_name"]}</option>)}</select></div>
              <div><Label>عنوان الاستقبال (https)</Label><Input dir="ltr" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} /></div>
              <div><Label>الأحداث</Label><div className="mt-1 flex flex-wrap gap-1.5">{events.map((ev) => { const on = edit.events.includes(ev); return <button type="button" key={ev} onClick={() => setEdit({ ...edit, events: on ? edit.events.filter((x) => x !== ev) : [...edit.events, ev] })} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{EVENT_LABELS[ev] ?? ev}</button>; })}</div></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.include_data} onChange={(e) => setEdit({ ...edit, include_data: e.target.checked })} />إرفاق بيانات السجل (بالحقول المسموحة للمفتاح فقط)</label>
            </div>
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setEdit(null)}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {view && <Dialog open onOpenChange={(o) => !o && setView(null)}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>محتوى الإشعار</DialogTitle></DialogHeader><Json v={view["payload"]} /></DialogContent></Dialog>}
      <SecretDialog secret={secret} onClose={() => setSecret(null)} title="سر التوقيع" note="يظهر مرة واحدة؛ استخدمه في النظام المستقبل للتحقق من ترويسة X-Rikaz-Signature." />
    </div>
  );
}

// ---------- inbox ----------
export function InboxTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient(); const [st, setSt] = useState("pending");
  const q = useQuery({ queryKey: ["api", "inbox", orgId, st], queryFn: () => rpc<Row[]>("api_inbox_list", { _org: orgId, _status: st || null }) });
  const S: Record<string, string> = { pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", failed: "تعذر التسجيل", cancelled: "ألغاه النظام المرسل" };
  const isPay = (i: Row) => i["resource"] === "payments";
  const decide = async (i: Row, approve: boolean) => {
    let reason: string | null = null;
    if (approve) { if (!(await ask(isPay(i) ? `اعتماد سداد ${i["amount"]} ر.س للطالب ${i["student_name"]} وتسجيله في حسابه؟` : `اعتماد «${i["payload"]?.["title"]}» وإنشاؤه في ${i["resource_label"]} باسمك؟`))) return; }
    else { reason = await askText("سبب الرفض (يظهر للنظام المرسل):", { required: true }); if (!reason) return; }
    const r = await act<{ status: string; error?: string }>("api_inbox_decide", { _id: i["id"], _approve: approve, _reason: reason });
    if (r?.status === "failed") toast.error(`تعذر التسجيل: ${r.error}`); else if (r) toast.success(approve ? (isPay(i) ? "اعتُمد وسُجّل السداد" : "اعتُمد وأُنشئ الطلب") : "رُفضت العملية");
    qc.invalidateQueries({ queryKey: ["api"] });
  };
  return (
    <div className="space-y-3">
      <select className={selectCls("w-48")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">الكل</option>{Object.entries(S).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {q.isLoading ? <LoadingState rows={2} /> : !(q.data ?? []).length ? <EmptyState title="لا توجد عمليات" hint="عمليات السداد وطلبات الصيانة والدعم الواردة من الأنظمة الخارجية تظهر هنا لاعتمادها قبل تسجيلها." /> : (
        <div className="grid gap-3 lg:grid-cols-2">{(q.data ?? []).map((i) => (
          <Card key={i["id"]} title={isPay(i) ? `${i["student_name"] ?? "طالب"} — ${i["amount"]} ر.س` : `${i["resource_label"]}: ${i["payload"]?.["title"] ?? ""}`} action={<Badge>{S[i["status"]]}</Badge>}>
            <p className="text-xs text-muted-foreground">{i["school_name"]} · من {i["system_name"]} ({i["key_name"]}) · {fmt(i["created_at"])}</p>
            {isPay(i) ? <p className="mt-1 text-xs">طريقة السداد: {i["payload"]?.["method"]} · التاريخ: {i["payload"]?.["paid_at"]} {i["payload"]?.["ref"] ? `· المرجع ${i["payload"]["ref"]}` : ""}</p>
              : <p className="mt-1 whitespace-pre-wrap text-xs">{i["payload"]?.["description"] ?? i["payload"]?.["body"]}{i["payload"]?.["place"] ? ` · المكان: ${i["payload"]["place"]}` : ""}</p>}
            {i["reason"] && <p className="mt-1 text-xs">السبب: {i["reason"]}</p>}
            {i["result"]?.["error"] && <p className="mt-1 text-xs text-destructive">{i["result"]["error"]}</p>}
            {i["status"] === "pending" && <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => decide(i, true)}><Check className="ms-1 h-3.5 w-3.5" />اعتماد</Button><Button size="sm" variant="outline" onClick={() => decide(i, false)}><X className="ms-1 h-3.5 w-3.5" />رفض</Button></div>}
          </Card>))}</div>
      )}
    </div>
  );
}

// ---------- explorer ----------
export function ExplorerTab({ orgId }: { orgId: string }) {
  const keys = useKeys(orgId); const cat = useCatalog();
  const [key, setKey] = useState(""); const [method, setMethod] = useState("GET"); const [path, setPath] = useState("students"); const [qs, setQs] = useState("per_page=5"); const [body, setBody] = useState("{}");
  const [out, setOut] = useState<Row | null>(null); const [busy, setBusy] = useState(false);
  const run = async () => {
    const k = key || keys.data?.[0]?.["id"]; if (!k) return;
    let b: unknown = null;
    if (method !== "GET") { try { b = JSON.parse(body || "{}"); } catch { toast.error("جسم الطلب ليس JSON صالحًا"); return; } }
    const q = Object.fromEntries(new URLSearchParams(qs));
    setBusy(true);
    const r = await act<Row>("api_explore", { _key: k, _method: method, _path: path, _q: q, _body: b });
    setBusy(false); if (r) setOut(r);
  };
  if (!(keys.data ?? []).length) return <EmptyState title="أنشئ مفتاحًا أولًا" />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">يجرّب الطلب بصلاحيات المفتاح المختار تمامًا كما يراه النظام الخارجي، ولا يحفظ أي تعديل حتى لو كان المفتاح للإنتاج.</p>
      <div className="grid gap-2 md:grid-cols-[1fr_7rem_1fr_1fr_auto]">
        <select className={selectCls()} value={key} onChange={(e) => setKey(e.target.value)}>{(keys.data ?? []).map((k) => <option key={k["id"]} value={k["id"]}>{k["name"]} ({k["env"] === "live" ? "إنتاج" : "اختبار"})</option>)}</select>
        <select className={selectCls()} value={method} onChange={(e) => setMethod(e.target.value)} dir="ltr">{["GET", "POST", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}</select>
        <Input dir="ltr" value={path} onChange={(e) => setPath(e.target.value)} placeholder="students أو students/{id}" list="api-res" />
        <datalist id="api-res">{(cat.data ?? []).map((r) => <option key={r.key} value={r.key} />)}<option value="me" /></datalist>
        <Input dir="ltr" value={qs} onChange={(e) => setQs(e.target.value)} placeholder="page=1&per_page=25" />
        <Button disabled={busy} onClick={run}>تنفيذ</Button>
      </div>
      {method !== "GET" && method !== "DELETE" && <Textarea dir="ltr" rows={6} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />}
      {out && <div><Badge cls={Number(out["status"]) < 300 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>HTTP {out["status"]}</Badge><div className="mt-2"><Json v={out["body"]} /></div></div>}
    </div>
  );
}

// ---------- docs ----------
function download(name: string, v: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(v, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DocsTab() {
  const cat = useCatalog();
  const base = typeof window === "undefined" ? "/api/public/v1" : `${window.location.origin}/api/public/v1`;
  const Code = ({ c }: { c: string }) => <pre className="overflow-auto rounded-md bg-muted p-3 text-xs" dir="ltr">{c}</pre>;
  return (
    <div className="space-y-4">
      <Card title="ملفات التوثيق" action={<div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!cat.data} onClick={() => download("rikaz-openapi.json", buildOpenApi((cat.data ?? []) as SpecRes[], base))}>تنزيل OpenAPI</Button>
        <Button size="sm" variant="outline" disabled={!cat.data} onClick={() => download("rikaz-postman.json", buildPostman((cat.data ?? []) as SpecRes[], base))}>تنزيل Postman</Button>
      </div>}>
        <p className="text-xs text-muted-foreground">يُولَّدان من دليل الموارد نفسه الذي تطبقه بوابة API، ولا يتضمنان أي مفتاح سري؛ أدخل مفتاحك في متغير api_key.</p>
      </Card>
      <Card title="الاتصال">
        <Code c={`GET ${base}/me\nAuthorization: Bearer rk_live_...\n\nGET ${base}/students?school_id=...&per_page=50&page=1&sort=updated_at&order=desc&updated_since=2026-01-01T00:00:00Z\nGET ${base}/students/{id}\nPOST ${base}/admissions          (Idempotency-Key مستحسن)\nPATCH ${base}/admissions/{id}    ({"rev": n, ...})\nPOST ${base}/payments            (Idempotency-Key إلزامي، يُسجَّل بعد اعتماد الإدارة)\nPOST ${base}/building_maintenance (يُنشأ بعد اعتماد الإدارة؛ تابع عبر inbox_requests)\nPOST ${base}/inbox_requests/{id}/cancel  (إلغاء طلبك ما دام بانتظار الاعتماد)\nPOST ${base}/payment_requests/{id}/cancel`} />
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
          <li>الردود JSON: <code dir="ltr">{"{ data, meta: { page, per_page, total } }"}</code> أو <code dir="ltr">{"{ error: { code, message } }"}</code>.</li>
          <li>مفتاح الاختبار <code dir="ltr">rk_test_</code> يعيد نفس النتيجة مع <code dir="ltr">dry_run: true</code> ولا يحفظ.</li>
          <li>نوع المفتاح يحدد ما يصل إليه: مفتاح المدارس لا يصل لموارد الإدارة المركزية والعكس (403 area_denied)، والمشترك يصل للاثنين.</li>
          <li>الحذف غير مدعوم (405). الحقول غير المصرح بها أو المعاملات غير المعروفة ترفض صراحة.</li>
          <li>حدود الطلبات في ترويستي <code dir="ltr">X-RateLimit-Limit / X-RateLimit-Remaining</code>، والتجاوز يعيد 429.</li>
        </ul>
      </Card>
      <Card title="التحقق من Webhook">
        <Code c={`X-Rikaz-Event: student.updated\nX-Rikaz-Delivery: <uuid>\nX-Rikaz-Timestamp: <unix seconds>\nX-Rikaz-Signature: sha256=HMAC_SHA256(secret, timestamp + "." + rawBody)\n\n// ارفض الطلب إذا اختلف التوقيع أو كان الوقت أقدم من 5 دقائق، واعتبر X-Rikaz-Delivery مفتاح عدم التكرار.`} />
      </Card>
      <Card title="الموارد">
        {cat.isLoading ? <LoadingState rows={2} /> : (
          <div className="space-y-3">{(cat.data ?? []).map((r) => (
            <details key={r.key} className="rounded-md border p-2">
              <summary className="cursor-pointer text-sm"><b dir="ltr" className="font-mono">{r.key}</b> — {r.label} <span className="text-xs text-muted-foreground">({[r.ops.read && "قراءة", r.ops.create && (r.create_mode === "approval" ? "إضافة باعتماد" : "إضافة"), r.ops.update && "تعديل", r.ops.cancel && "إلغاء طلب"].filter(Boolean).join("، ")}){r.area === "central" ? " · الإدارة المركزية" : ""}</span></summary>
              <div className="mt-2 text-xs">
                {r.filters?.length ? <p>الفلاتر: <span dir="ltr" className="font-mono">{r.filters.join(", ")}</span></p> : null}
                {r.sortable?.length ? <p>الفرز: <span dir="ltr" className="font-mono">{r.sortable.join(", ")}</span></p> : null}
                {r.search && <p>البحث (q) في: <span className="font-mono">{r.search}</span></p>}
                {r.events?.length ? <p>الأحداث: <span dir="ltr" className="font-mono">{r.events.join(", ")}</span></p> : null}
                <table className="mt-1 w-full text-start"><tbody>{r.fields.map((f) => <tr key={f.k} className="border-t"><td dir="ltr" className="py-0.5 font-mono">{f.k}</td><td>{f.l}</td><td className="text-muted-foreground">{[f.s && "حساس", f.r && "مطلوب عند الإضافة", f.c && !f.r && "يُرسل عند الإضافة", f.u && "قابل للتعديل"].filter(Boolean).join("، ")}</td></tr>)}</tbody></table>
              </div>
            </details>))}</div>
        )}
      </Card>
    </div>
  );
}
