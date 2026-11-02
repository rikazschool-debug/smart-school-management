// Staff attendance screens. Every action is an RPC that re-checks the caller's role (att_gate / att_approver / counselor).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Printer, ScanLine, XCircle } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { ListTools, applyListTools, useListTools, ExportButtons } from "@/components/list-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, type AppContext } from "@/lib/session";
import { DAY_STATUS, DAY_TONE, KIND, MOVE_KIND, PICKUP_STATUS, hm, riyadhToday, sectionOf } from "@/lib/attendance";

type Ctx = AppContext & { schoolId: string };
const rpc = async (fn: string, args: Record<string, unknown>, ok?: string) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) { toast.error(arabicError(error)); return { ok: false as const, data: null }; }
  if (ok) toast.success(ok);
  return { ok: true as const, data };
};
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("att-") }); };
const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DAY_TONE[s] ?? "bg-muted"}`}>{DAY_STATUS[s] ?? s}</span>;

function useStudents(S: string) {
  return useQuery({
    queryKey: ["att-students", S],
    queryFn: async () => {
      const { data, error } = await db.from("students").select("id, full_name, status, enrollments(status, sections(name, grades(name)))").eq("school_id", S).eq("status", "active").order("full_name");
      if (error) throw error;
      return data as Row[];
    },
  });
}

/* ================= Today board ================= */
export function TodayTab({ ctx, canApprove }: { ctx: Ctx; canApprove: boolean }) {
  const S = ctx.schoolId;
  const [date, setDate] = useState(riyadhToday());
  const refresh = useRefresh();
  const board = useQuery({ queryKey: ["att-board", S, date], refetchInterval: 15000, queryFn: async () => { const { data, error } = await db.rpc("attendance_board", { _school: S, _date: date }); if (error) throw error; return data as Row | null; } });
  const review = useQuery({ queryKey: ["att-review", S, date], queryFn: async () => { const { data, error } = await db.rpc("att_day_rows", { _school: S, _from: date, _to: date, _status: "pending_review" }); if (error) throw error; return data as Row[]; } });
  const corr = useQuery({ queryKey: ["att-corr", S], enabled: canApprove, queryFn: async () => { const { data, error } = await db.from("attendance_corrections").select("id, old_status, new_status, new_late, reason, requested_at, attendance_days(date, students(full_name))").eq("school_id", S).eq("status", "pending").order("requested_at"); if (error) throw error; return data as Row[]; } });
  const b = board.data;
  const pol = b?.["policy"] as Row | null | undefined;
  const tiles: [string, number | undefined, string][] = [
    ["المتوقع حضورهم", b?.["expected"], ""], ["لم يُسجل حضوره بعد", b?.["not_yet"], ""],
    ["حاضر", b?.["present"], "text-primary"], ["متأخر", b?.["late"], "text-amber-600"], ["غياب يحتاج مراجعة", b?.["pending_review"], ""], ["مُصعّد للوكيل", b?.["escalated"], "text-amber-600"],
    ["غائب بعد المراجعة", b?.["absent"], "text-destructive"], ["بعذر", b?.["excused"], ""], ["داخل المدرسة الآن", b?.["inside"], "text-primary"],
    ["خروج مبكر", b?.["early_out"], ""], ["طلبات مفتوحة", b?.["open_requests"], ""],
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="ad">التاريخ</Label><Input id="ad" type="date" value={date} max={riyadhToday()} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        {pol ? <p className="pb-2 text-sm text-muted-foreground">الدوام {String(pol["day_start"]).slice(0, 5)} • السماح {pol["grace_minutes"]} د • التأخر يُحسب من {pol["late_from"] === "grace_end" ? "نهاية السماح" : "بداية الدوام"} • المراجعة {String(pol["absence_review_at"]).slice(0, 5)}</p>
          : board.isSuccess && <p className="pb-2 text-sm text-destructive">لم تُعتمد سياسة حضور لهذه المدرسة بعد — يحددها المالك أو المدير من «الإعدادات».</p>}
        <Button variant="outline" className="ms-auto" onClick={async () => { const r = await rpc("build_absence_review", { _school: S, _date: date }); if (r.ok) { toast.success(r.data ? `أُضيف ${r.data} طالب إلى قائمة المراجعة` : "القائمة محدّثة"); refresh(); } }}>تحديث قائمة الغياب</Button>
      </div>
      {board.isLoading ? <LoadingState /> : board.error ? <ErrorState message={arabicError(board.error)} onRetry={() => board.refetch()} /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map(([l, v, c]) => <div key={l} className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-2xl font-bold ${c}`}>{v ?? 0}</p></div>)}
        </div>
      )}
      <Section title="غياب يحتاج مراجعة" desc="تُعد القائمة تلقائيًا بعد موعد الحصر لمن لم يسجل دخوله من المسكنين في هذا اليوم. لا يُعتمد الغياب قبل المراجعة، ووصول الطالب لاحقًا يحوّله إلى «متأخر» مع حفظ القرار السابق.">
        {review.isLoading ? <LoadingState /> : !review.data?.length ? <EmptyState title="لا يوجد غياب بانتظار المراجعة" /> : (
          <ul className="divide-y rounded-xl border bg-card">
            {review.data.map((d) => (
              <li key={d["id"]} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span><b>{d["student_name"]}</b> <span className="text-muted-foreground">— {d["section"]}</span>{d["escalated_at"] && <Badge variant="outline" className="ms-2 border-amber-500 text-amber-700" title={d["escalation_note"] ?? ""}>مُصعّد للوكيل</Badge>}</span>
                {canApprove && <span className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={async () => { if (await ask("اعتماد الغياب؟ سيُشعر ولي الأمر.")) { const r = await rpc("resolve_absence", { _day: d["id"], _status: "absent", _reason: null }, "اعتُمد الغياب"); if (r.ok) refresh(); } }}>اعتماد غياب</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { const t = await askText("سبب العذر", { required: true }); if (t) { const r = await rpc("resolve_absence", { _day: d["id"], _status: "excused", _reason: t }, "سُجّل العذر"); if (r.ok) refresh(); } }}>بعذر</Button>
                  {!d["escalated_at"] && <Button size="sm" variant="ghost" onClick={async () => { const t = await askText("سبب التصعيد للوكيل", { required: true }); if (t) { const r = await rpc("escalate_absence", { _day: d["id"], _reason: t }, "صُعّد للوكيل"); if (r.ok) refresh(); } }}>تصعيد</Button>}
                </span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {canApprove && (
        <Section title="طلبات التصحيح" desc="يُحفظ السجل الأصلي والقيمة السابقة دائمًا.">
          {!corr.data?.length ? <EmptyState title="لا توجد طلبات تصحيح معلقة" /> : (
            <ul className="divide-y rounded-xl border bg-card">
              {corr.data.map((c) => (
                <li key={c["id"]} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span><b>{c["attendance_days"]?.students?.full_name}</b> — {c["attendance_days"]?.date}: {DAY_STATUS[c["old_status"]]} ← {DAY_STATUS[c["new_status"]]}{c["new_status"] === "late" ? ` (${c["new_late"]} د)` : ""} • السبب: {c["reason"]}</span>
                  <span className="flex gap-1">
                    <Button size="sm" onClick={async () => { const r = await rpc("decide_attendance_correction", { _id: c["id"], _approve: true, _note: null }, "اعتُمد التصحيح"); if (r.ok) refresh(); }}>اعتماد</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { const t = await askText("سبب الرفض", { required: true }); if (t) { const r = await rpc("decide_attendance_correction", { _id: c["id"], _approve: false, _note: t }, "رُفض الطلب"); if (r.ok) refresh(); } }}>رفض</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      <PresentNow S={S} />
    </div>
  );
}

function PresentNow({ S, withReturn }: { S: string; withReturn?: boolean }) {
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ["att-present", S], refetchInterval: 15000, queryFn: async () => { const { data, error } = await db.rpc("present_now", { _school: S }); if (error) throw error; return data as Row[]; } });
  const t = useListTools([{ key: "k", label: "الحالة", options: [{ value: "inside", label: "داخل المدرسة" }, { value: "out", label: "خرج" }] }]);
  const rows = applyListTools(t, q.data ?? [], (r) => `${r["student_name"]} ${r["section"]}`, (r) => (r["last_kind"] === "out" ? "out" : "inside"));
  return (
    <Section title="الموجودون بالمدرسة اليوم" desc="آخر حركة لكل طالب: الدخول أو الخروج أو العودة.">
      {q.isLoading ? <LoadingState /> : !q.data?.length ? <EmptyState title="لا توجد حركات اليوم بعد" /> : <>
        <ListTools s={t} placeholder="ابحث بالطالب أو الشعبة" count={rows.length} exp={{ title: "الموجودون بالمدرسة", headers: ["الطالب", "الشعبة", "آخر حركة", "الوقت"], rows: () => rows.map((r) => [r["student_name"], r["section"], MOVE_KIND[r["last_kind"]], hm(r["last_at"])]) }} />
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r["student_id"]} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span><b>{r["student_name"]}</b> <span className="text-muted-foreground">— {r["section"]}</span></span>
              <span className="flex items-center gap-2">
                <Badge variant={r["last_kind"] === "out" ? "outline" : "secondary"}>{MOVE_KIND[r["last_kind"]]} {hm(r["last_at"])}</Badge>
                {withReturn && r["last_kind"] === "out" && <Button size="sm" variant="outline" onClick={async () => { const n = await askText("ملاحظة العودة (اختياري)"); if (n === null) return; const x = await rpc("record_return", { _student: r["student_id"], _note: n || null }, "سُجّلت العودة"); if (x.ok) refresh(); }}>تسجيل عودة</Button>}
              </span>
            </li>
          ))}
        </ul>
      </>}
    </Section>
  );
}

/* ================= Gate: barcode scan, manual entry, returns ================= */
export function GateTab({ ctx, canApprove }: { ctx: Ctx; canApprove: boolean }) {
  const S = ctx.schoolId;
  const refresh = useRefresh();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Row | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const submit = async () => {
    const token = code.trim(); if (!token || busy) return;
    setBusy(true); setCode("");
    const { data, error } = await db.rpc("scan_attendance", { _school: S, _token: token });
    setBusy(false); input.current?.focus();
    if (error) { setLast({ result: "error", message: arabicError(error) }); return; }
    setLast(data as Row); refresh();
  };
  const tone = last?.["result"] === "present" ? "border-primary bg-primary/5" : last?.["result"] === "late" ? "border-amber-500 bg-amber-500/10" : last?.["result"] === "duplicate" ? "border-muted-foreground/30 bg-muted" : "border-destructive bg-destructive/5";
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><ScanLine className="size-5 text-primary" />مسح بطاقة الحضور الصباحي <Link to="/app/attendance-station" className="ms-auto text-sm font-medium text-primary hover:underline">فتح شاشة المسح الكاملة (كاميرا/قارئ) ←</Link></h2>
        <p className="mb-3 text-sm text-muted-foreground">وجّه قارئ الباركود نحو البطاقة؛ يكتب القارئ الرمز ويضغط Enter تلقائيًا. الوقت يُحتسب من الخادم. البطاقة للحضور فقط وليست تصريح خروج.</p>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex gap-2">
          <Input ref={input} dir="ltr" autoComplete="off" aria-label="رمز البطاقة" placeholder="رمز البطاقة" value={code} onChange={(e) => setCode(e.target.value)} className="h-12 text-lg" />
          <Button className="h-12" disabled={busy}>تسجيل</Button>
        </form>
        {last && (
          <div role="status" aria-live="assertive" className={`mt-4 flex items-center gap-4 rounded-2xl border-2 p-4 ${tone}`}>
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-background text-2xl font-bold">{String(last["name"] ?? "؟").slice(0, 1)}</div>
            <div className="min-w-0">
              {last["name"] && <p className="text-xl font-bold">{last["name"]}</p>}
              {last["section"] && <p className="text-sm text-muted-foreground">{last["section"]}</p>}
              <p className="mt-1 flex items-center gap-1 font-semibold">{["present", "late"].includes(last["result"]) ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}{last["message"]}</p>
            </div>
          </div>
        )}
              </section>
      {canApprove && <ManualEntry S={S} />}
      <PresentNow S={S} withReturn />
    </div>
  );
}

function ManualEntry({ S }: { S: string }) {
  const st = useStudents(S);
  const refresh = useRefresh();
  const [sid, setSid] = useState(""); const [kind, setKind] = useState("arrived"); const [reason, setReason] = useState("");
  return (
    <form className="grid gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-4" onSubmit={async (e) => {
      e.preventDefault(); if (!sid) return void toast.error("اختر الطالب"); if (!reason.trim()) return void toast.error("السبب مطلوب");
      const r = await rpc("manual_attendance", { _student: sid, _status: kind, _reason: reason }, "سُجّل الحضور اليدوي"); if (r.ok) { setSid(""); setReason(""); refresh(); }
    }}>
      <h2 className="font-bold sm:col-span-4">تسجيل يدوي استثنائي (بسبب موثق)</h2>
      <select className={selectCls("w-full")} aria-label="الطالب" value={sid} onChange={(e) => setSid(e.target.value)}><option value="">— الطالب —</option>{st.data?.map((s) => <option key={s["id"]} value={s["id"]}>{s["full_name"]} — {sectionOf(s)}</option>)}</select>
      <select className={selectCls("w-full")} aria-label="النوع" value={kind} onChange={(e) => setKind(e.target.value)}><option value="arrived">وصل (يُحتسب الوقت الآن)</option><option value="excused">غياب بعذر</option></select>
      <Input aria-label="السبب" placeholder="السبب (إلزامي)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button>تسجيل</Button>
    </form>
  );
}

/* ================= Pickups: approvals (approver), gate actions, teacher preparation ================= */
export function PickupsTab({ ctx, canApprove, gate }: { ctx: Ctx; canApprove: boolean; gate: boolean }) {
  const S = ctx.schoolId;
  const refresh = useRefresh();
  const pending = useQuery({ queryKey: ["att-pk-pending", S], enabled: canApprove, refetchInterval: 15000, queryFn: async () => { const { data, error } = await db.from("pickup_requests").select("id, kind, reason, pickup_name, planned_at, created_at, students(full_name, enrollments(status, sections(name, grades(name)))), guardians(full_name)").eq("school_id", S).in("status", ["submitted", "under_review"]).order("created_at"); if (error) throw error; return data as Row[]; } });
  const queue = useQuery({ queryKey: ["att-pk-queue", S], refetchInterval: 8000, queryFn: async () => { const { data, error } = await db.rpc("pickup_queue", { _school: S }); if (error) throw error; return data as Row[]; } });
  const act = async (fn: string, args: Record<string, unknown>, ok: string) => { const r = await rpc(fn, args, ok); if (r.ok) refresh(); };
  return (
    <div className="space-y-6">
      {canApprove && (
        <Section title="استئذانات بانتظار القرار" desc="الاعتماد لا يعني خروج الطالب؛ يبدأ التنفيذ عند وصول المستلم.">
          {pending.isLoading ? <LoadingState /> : !pending.data?.length ? <EmptyState title="لا توجد طلبات بانتظار القرار" /> : (
            <ul className="space-y-2">
              {pending.data.map((r) => (
                <li key={r["id"]} className="rounded-xl border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{r["students"]?.full_name}</b> — {sectionOf(r["students"] ?? {})} • ولي الأمر: {r["guardians"]?.full_name} • المستلم: {r["pickup_name"]}</span>
                    <span className="flex gap-1">
                      <Button size="sm" onClick={() => act("decide_pickup", { _id: r["id"], _approve: true, _note: null }, "اعتُمد الاستئذان")}>اعتماد</Button>
                      <Button size="sm" variant="ghost" onClick={async () => { const t = await askText("سبب الرفض", { required: true }); if (t) await act("decide_pickup", { _id: r["id"], _approve: false, _note: t }, "رُفض الاستئذان"); }}>رفض</Button>
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">السبب: {r["reason"] ?? "—"}{r["planned_at"] ? ` • الموعد: ${hm(r["planned_at"])}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {canApprove && <DelegateReviews S={S} />}
      <Section title={gate ? "الاستلام اليوم" : "طلبات تجهيز طلابك"} desc={gate ? "تحقق من هوية المستلم قبل «وصل المستلم»، وسلّم الطالب فقط بعد «جاهز»." : "أكّد جاهزية الطالب عند تجهيزه. لا تملك تعديل حركة البوابة."}>
        {queue.isLoading ? <LoadingState /> : queue.error ? <ErrorState message={arabicError(queue.error)} onRetry={() => queue.refetch()} /> : !queue.data?.length ? <EmptyState title="لا توجد طلبات استلام نشطة" /> : (
          <ul className="space-y-2">
            {queue.data.map((r) => (
              <li key={r["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
                <span className="min-w-0"><b>{r["student_name"]}</b> — {r["section"]} <Badge variant="outline" className="ms-1">{KIND[r["kind"]]}</Badge> <Badge className="ms-1">{PICKUP_STATUS[r["status"]]}</Badge>
                  <span className="block text-muted-foreground">المستلم: {r["pickup_name"]}{r["relationship"] ? ` (${r["relationship"]})` : ""} • {r["delegate_mode"] === "one_time" ? `تفويض لهذا الطلب${r["phone_hint"] ? ` • جوال ${r["phone_hint"]}` : ""} • تحقق بآخر 4 أرقام من الهوية` : r["delegate_mode"] === "authorized" ? `مستلم معتمد${r["pickup_national_id"] ? ` • الهوية: ${r["pickup_national_id"]}` : ""}` : "ولي الأمر نفسه"}</span></span>
                <span className="flex flex-wrap gap-1">
                  {gate && r["status"] === "approved" && (r["delegate_mode"] === "one_time" && r["delegate_status"] !== "approved"
                    ? <Badge variant="outline" className="border-amber-500 text-amber-700">{r["delegate_status"] === "rejected" ? "رُفض التفويض — لا تسلّم" : "التفويض بانتظار الاعتماد"}</Badge>
                    : <Button size="sm" onClick={async () => {
                      const who = `«${r["pickup_name"]}»${r["relationship"] ? ` — ${r["relationship"]} للطالب` : ""}`;
                      if (!(await ask(`اطلب الهوية الأصلية وطابق الاسم ${who} مع الصورة والبيانات وفق إجراء المدرسة. هل تحققت بنفسك من الهوية؟ (لا تصوّر الهوية ولا تدوّن رقمها)`, { ok: "نعم، تحققت من الهوية" }))) return;
                      if (r["delegate_mode"] === "one_time") {
                        const l4 = await askText(`أدخل آخر 4 أرقام من هوية ${r["pickup_name"]} (مطابقة إضافية فقط)`, { required: true }); if (!l4) return;
                        const { data, error } = await db.rpc("pickup_arrived", { _id: r["id"], _id_last4: l4, _confirmed: true });
                        if (error) return void toast.error(arabicError(error));
                        const d = data as Row;
                        if (!d?.["ok"]) { toast.error(`${d?.["message"] ?? "غير مطابق"}${d?.["attempts_left"] != null ? ` — المحاولات المتبقية: ${d["attempts_left"]}` : ""}`); refresh(); return; }
                        toast.success("تم التحقق وسُجّل الوصول وأُضيف النداء"); refresh(); return;
                      }
                      await act("pickup_arrived", { _id: r["id"], _confirmed: true }, "سُجّل وصول المستلم وأُضيف النداء");
                    }}>وصل المستلم</Button>)}
                  {r["status"] === "arrived" && <Button size="sm" variant="outline" onClick={() => act("pickup_progress", { _id: r["id"], _to: "preparing" }, "جارٍ التجهيز")}>بدء التجهيز</Button>}
                  {["arrived", "preparing"].includes(r["status"]) && <Button size="sm" variant="outline" onClick={() => act("pickup_progress", { _id: r["id"], _to: "ready" }, "الطالب جاهز")}>الطالب جاهز</Button>}
                  {gate && r["status"] === "ready" && <Button size="sm" onClick={async () => { if (await ask(`تأكيد تسليم ${r["student_name"]} إلى ${r["pickup_name"]}؟`)) await act("handover_pickup", { _id: r["id"] }, "تم التسليم وسُجّل الخروج"); }}>تأكيد التسليم</Button>}
                  {gate && <Button size="sm" variant="ghost" onClick={async () => { const t = await askText("سبب الإلغاء", { required: true }); if (t) await act("cancel_pickup", { _id: r["id"], _reason: t }, "أُلغي الطلب"); }}>إلغاء</Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function DelegateReviews({ S }: { S: string }) {
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ["att-deleg", S], refetchInterval: 15000, queryFn: async () => { const { data, error } = await db.rpc("delegate_reviews", { _school: S }); if (error) throw error; return data as Row[]; } });
  const act = async (id: string, approve: boolean) => {
    const note = approve ? null : await askText("سبب رفض التفويض", { required: true }); if (!approve && !note) return;
    const r = await rpc("decide_delegate", { _id: id, _approve: approve, _note: note }, approve ? "اعتُمد التفويض" : "رُفض التفويض"); if (r.ok) refresh();
  };
  return (
    <Section title="تفويضات بانتظار الاعتماد" desc="اعتماد الشخص المفوض منفصل عن اعتماد خروج الطالب. التفويض لهذا الطلب واليوم ولمرة واحدة فقط.">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد تفويضات معلقة" /> : (
        <ul className="space-y-2">
          {q.data.map((r) => (
            <li key={r["id"]} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
              <span><b>{r["student_name"]}</b> — {r["section"]} <Badge variant="outline" className="ms-1">{KIND[r["kind"]]}</Badge> <Badge className="ms-1">{PICKUP_STATUS[r["status"]]}</Badge>
                <span className="block text-muted-foreground">ولي الأمر: {r["guardian_name"]} • المفوَّض: {r["pickup_name"]} ({r["relationship"]}) • جوال: <span dir="ltr">{r["phone"]}</span> • الهوية تنتهي بـ {r["id_last4"]} • صالح حتى {hm(r["valid_until"])}</span></span>
              <span className="flex gap-1"><Button size="sm" onClick={() => act(r["id"], true)}>اعتماد التفويض</Button><Button size="sm" variant="ghost" onClick={() => act(r["id"], false)}>رفض</Button></span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ================= Branch comparison (org owner) ================= */
export function CompareTab({ ctx }: { ctx: Ctx }) {
  const [from, setFrom] = useState(riyadhToday()); const [to, setTo] = useState(riyadhToday());
  const q = useQuery({ queryKey: ["att-compare", ctx.orgId, from, to], enabled: !!ctx.orgId, queryFn: async () => { const { data, error } = await db.rpc("attendance_compare", { _org: ctx.orgId, _from: from, _to: to }); if (error) throw error; return data as Row[]; } });
  const cols = [["school_name", "الفرع"], ["expected", "المتوقعون"], ["resolved", "محسوم"], ["unresolved", "غير محسوم"], ["completion_rate", "اكتمال الرصد %"], ["records", "سجلات"], ["present", "حاضر"], ["late", "متأخر"], ["absent", "غائب"], ["excused", "بعذر"], ["pending", "بانتظار المراجعة"], ["early_out", "خروج مبكر"], ["attendance_rate", "نسبة الحضور من المحسوم %"]] as const;
  return (
    <Section title="مقارنة الفروع" desc="لمالك المؤسسة فقط. المتوقعون = الطلاب المسكّنون في أيام الدراسة حتى اليوم. اكتمال الرصد = المحسوم ÷ المتوقعين. نسبة الحضور = (حاضر + متأخر) ÷ المحسوم فقط، وليست نسبة نهائية لكل المتوقعين ما لم يكتمل الرصد. التوقيت المعتمد: الرياض.">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="cf">من</Label><Input id="cf" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ct">إلى</Label><Input id="ct" type="date" value={to} min={from} max={riyadhToday()} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>
        {q.data && <ExportButtons title="مقارنة الفروع" school={ctx.orgName} filters={[`من ${from} إلى ${to}`]} headers={cols.map(([, l]) => l)} rows={() => (q.data ?? []).map((r) => cols.map(([k]) => r[k] ?? ""))} />}
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد بيانات" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{cols.map(([k, l]) => <th key={k} className="px-3 py-2 text-start font-semibold">{l}</th>)}</tr></thead>
          <tbody>{q.data.map((r) => <tr key={r["school_id"]} className="border-t">{cols.map(([k]) => <td key={k} className="px-3 py-2">{r[k] ?? "—"}</td>)}</tr>)}</tbody></table></div>
      )}
    </Section>
  );
}

/* ================= Cards & authorized pickup persons ================= */
export function CardsTab({ ctx }: { ctx: Ctx }) {
  const S = ctx.schoolId;
  const st = useStudents(S);
  const refresh = useRefresh();
  const cards = useQuery({ queryKey: ["att-cards", S], queryFn: async () => { const { data, error } = await db.from("student_cards").select("id, student_id, token, status, issued_at").eq("school_id", S).eq("status", "active"); if (error) throw error; return data as Row[]; } });
  const [persons, setPersons] = useState<Row | null>(null);
  const t = useListTools([{ key: "c", label: "البطاقة", options: [{ value: "yes", label: "لها بطاقة" }, { value: "no", label: "بلا بطاقة" }] }]);
  const byStudent = new Map((cards.data ?? []).map((c) => [c["student_id"], c]));
  const rows = applyListTools(t, st.data ?? [], (s) => `${s["full_name"]} ${sectionOf(s)}`, (s) => (byStudent.has(s["id"]) ? "yes" : "no"));
  const print = async (list: Row[]) => {
    const { default: JsBarcode } = await import("jsbarcode");
    const html = list.map((s) => { const c = byStudent.get(s["id"]); if (!c) return ""; const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); JsBarcode(svg, c["token"], { format: "CODE128", width: 3, height: 70, displayValue: true, fontSize: 14, margin: 6 });
      return `<div class="card"><div class="n">${s["full_name"]}</div><div class="m">${ctx.schoolName} • ${sectionOf(s)}</div><div class="m">رقم الطالب: ${String(s["id"]).slice(0, 8)}</div>${svg.outerHTML}<div class="f">بطاقة حضور صباحي فقط — ليست تصريح خروج</div></div>`; }).join("");
    if (!html) return void toast.error("لا توجد بطاقات صادرة للطباعة");
    const w = window.open("", "_blank"); if (!w) return void toast.error("اسمح بالنوافذ المنبثقة للطباعة");
    w.document.write(`<html dir="rtl"><head><title>بطاقات الطلاب</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet"><style>body{font-family:Cairo,sans-serif;display:flex;flex-wrap:wrap;gap:8px}.card{width:85mm;height:54mm;border:1px solid #999;border-radius:8px;padding:8px;box-sizing:border-box;display:flex;flex-direction:column;gap:2px}.n{font-weight:700;font-size:15px}.m{font-size:11px;color:#444}svg{max-width:100%;height:auto;margin-top:auto;align-self:center}.f{font-size:9px;color:#666}@media print{.card{break-inside:avoid}}</style></head><body>${html}<script>setTimeout(()=>print(),600)</script></body></html>`);
    w.document.close();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">تُصدر البطاقة تلقائيًا عند إضافة الطالب أو تسكينه. الرمز 10 أرقام عشوائية لا تحمل بيانات الطالب. إلغاء البطاقة المفقودة يوقفها فورًا عند البوابة، ويُطلب سبب لإصدار البديل.</p>
      <ListTools s={t} placeholder="ابحث باسم الطالب أو الشعبة" count={rows.length} exp={{ title: "بطاقات الطلاب", school: ctx.schoolName, headers: ["الطالب", "الشعبة", "البطاقة", "تاريخ الإصدار"], rows: () => rows.map((s) => [s["full_name"], sectionOf(s), byStudent.has(s["id"]) ? "صادرة" : "لا توجد", byStudent.get(s["id"])?.["issued_at"]?.slice(0, 10) ?? ""]) }} />
      <Button size="sm" variant="outline" onClick={() => print(rows)}><Printer className="size-4" />طباعة بطاقات النتائج</Button>
      {st.isLoading ? <LoadingState /> : !rows.length ? <EmptyState title="لا نتائج" /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((s) => { const c = byStudent.get(s["id"]); return (
            <li key={s["id"]} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span><b>{s["full_name"]}</b> <span className="text-muted-foreground">— {sectionOf(s)}</span> {c ? <Badge variant="secondary">بطاقة صادرة</Badge> : <Badge variant="outline">بلا بطاقة</Badge>}</span>
              <span className="flex flex-wrap gap-1">
                {!c ? <Button size="sm" onClick={async () => { const r = await rpc("issue_student_card", { _student: s["id"], _reason: null }, "أُصدرت البطاقة"); if (r.ok) refresh(); }}>إصدار بطاقة</Button> : <>
                  <Button size="sm" variant="outline" onClick={() => print([s])}>طباعة</Button>
                  <Button size="sm" variant="outline" onClick={async () => { const t2 = await askText("سبب إصدار البديل (سيُلغى الرمز القديم)", { required: true }); if (t2) { const r = await rpc("issue_student_card", { _student: s["id"], _reason: t2 }, "أُصدرت بطاقة بديلة"); if (r.ok) refresh(); } }}>بطاقة بديلة</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { const t2 = await askText("سبب الإلغاء", { required: true }); if (t2) { const r = await rpc("revoke_student_card", { _card: c["id"], _reason: t2 }, "أُلغيت البطاقة"); if (r.ok) refresh(); } }}>إلغاء</Button>
                </>}
                <Button size="sm" variant="ghost" onClick={() => setPersons(s)}>المستلمون المفوضون</Button>
              </span>
            </li>
          ); })}
        </ul>
      )}
      <Dialog open={!!persons} onOpenChange={(o) => !o && setPersons(null)}>
        <DialogContent><DialogHeader><DialogTitle>المستلمون المفوضون — {persons?.["full_name"]}</DialogTitle></DialogHeader>{persons && <Persons student={persons} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function Persons({ student }: { student: Row }) {
  const q = useQuery({ queryKey: ["att-persons", student["id"]], queryFn: async () => { const { data, error } = await db.from("authorized_pickups").select("*").eq("student_id", student["id"]).order("created_at"); if (error) throw error; return data as Row[]; } });
  const [f, setF] = useState({ name: "", nid: "", rel: "", phone: "" });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">يُضاف المستلم هنا بعد التحقق من وثائقه. لا يضيف ولي الأمر مستلمًا جديدًا بكتابة اسمه داخل الطلب. ولي الأمر الموثق مخوّل بالاستلام تلقائيًا.</p>
      <ul className="space-y-1">{(q.data ?? []).map((p) => (
        <li key={p["id"]} className="flex items-center justify-between rounded border px-3 py-1.5"><span>{p["full_name"]} — {p["relationship"] ?? ""} — {p["national_id"] ?? ""}{!p["active"] && " (موقوف)"}</span>
          <Button size="sm" variant="ghost" onClick={async () => { const r = await rpc("set_authorized_pickup_active", { _id: p["id"], _active: !p["active"] }); if (r.ok) q.refetch(); }}>{p["active"] ? "إيقاف" : "تفعيل"}</Button></li>
      ))}</ul>
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const r = await rpc("add_authorized_pickup", { _student: student["id"], _name: f.name, _national_id: f.nid || null, _relationship: f.rel || null, _phone: f.phone || null }, "أُضيف المستلم"); if (r.ok) { setF({ name: "", nid: "", rel: "", phone: "" }); q.refetch(); } }}>
        <Input placeholder="الاسم الكامل" aria-label="اسم المستلم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="رقم الهوية" aria-label="رقم الهوية" value={f.nid} onChange={(e) => setF({ ...f, nid: e.target.value })} />
        <Input placeholder="صلة القرابة" aria-label="صلة القرابة" value={f.rel} onChange={(e) => setF({ ...f, rel: e.target.value })} />
        <Input placeholder="الجوال" aria-label="الجوال" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Button className="sm:col-span-2">إضافة مستلم موثق</Button>
      </form>
    </div>
  );
}

/* ================= Records (search/filters/export) + timeline + corrections ================= */
export function RecordsTab({ ctx, canCorrect }: { ctx: Ctx; canCorrect: boolean }) {
  const S = ctx.schoolId;
  const [from, setFrom] = useState(riyadhToday()); const [to, setTo] = useState(riyadhToday());
  const [timeline, setTimeline] = useState<Row | null>(null);
  const q = useQuery({ queryKey: ["att-records", S, from, to], queryFn: async () => { const { data, error } = await db.rpc("att_day_rows", { _school: S, _from: from, _to: to }); if (error) throw error; return data as Row[]; } });
  const sections = [...new Set((q.data ?? []).map((d) => d["section"]))].sort();
  const t = useListTools([
    { key: "status", label: "الحالة", options: Object.entries(DAY_STATUS).map(([value, label]) => ({ value, label })) },
    { key: "section", label: "الشعبة", options: sections.map((s) => ({ value: s, label: s })) },
  ]);
  const rows = applyListTools(t, q.data ?? [], (d) => d["student_name"] ?? "", (d, k) => (k === "status" ? d["status"] : d["section"]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="rf">من</Label><Input id="rf" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="rt">إلى</Label><Input id="rt" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>
      </div>
      <ListTools s={t} placeholder="ابحث باسم الطالب" count={rows.length} exp={{ title: `سجل الحضور ${from} — ${to}`, school: ctx.schoolName, headers: ["التاريخ", "الطالب", "الشعبة", "الحالة", "دقائق التأخر", "وقت الدخول", "المصدر", "ملاحظة"], rows: () => rows.map((d) => [d["date"], d["student_name"], d["section"], DAY_STATUS[d["status"]], d["late_minutes"] || "", hm(d["first_in_at"]), d["source"] === "scan" ? "مسح" : d["source"] === "manual" ? "يدوي" : "مراجعة", d["note"] ?? ""]) }} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title={q.data?.length ? "لا نتائج مطابقة" : "لا توجد سجلات في هذه الفترة"} /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.slice(0, 300).map((d) => (
            <li key={d["id"]} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span><span className="text-muted-foreground">{d["date"]}</span> • <button className="font-semibold hover:text-primary" onClick={() => setTimeline({ id: d["student_id"], name: d["student_name"] })}>{d["student_name"]}</button> <span className="text-muted-foreground">— {d["section"]}</span>{d["escalated_at"] && <Badge variant="outline" className="ms-2 border-amber-500 text-amber-700" title={d["escalation_note"] ?? ""}>مُصعّد للوكيل</Badge>}</span>
              <span className="flex items-center gap-2"><Pill s={d["status"]} />{d["status"] === "late" && <span className="text-xs">{d["late_minutes"]} د</span>}<span className="text-xs text-muted-foreground">{hm(d["first_in_at"])}</span>
                {canCorrect && d["status"] !== "pending_review" && <Button size="sm" variant="ghost" onClick={async () => {
                  const ns = await askText("الحالة الصحيحة: اكتب حاضر أو متأخر أو غائب أو بعذر", { required: true }); if (!ns) return;
                  const map: Record<string, string> = { "حاضر": "present", "متأخر": "late", "غائب": "absent", "بعذر": "excused" };
                  const st = map[ns.trim()]; if (!st) return void toast.error("حالة غير معروفة");
                  let late = 0; if (st === "late") { const m = await askText("دقائق التأخر", { required: true }); if (!m) return; late = Number(m) || 1; }
                  const why = await askText("سبب التصحيح", { required: true }); if (!why) return;
                  await rpc("request_attendance_correction", { _day: d["id"], _new_status: st, _new_late: late, _reason: why }, "قُدّم طلب التصحيح للاعتماد");
                }}>طلب تصحيح</Button>}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 300 && <p className="text-xs text-muted-foreground">يُعرض أول 300 سجل؛ التصدير يشمل كل النتائج ({rows.length}).</p>}
      <Dialog open={!!timeline} onOpenChange={(o) => !o && setTimeline(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>السجل الزمني — {timeline?.["name"]}</DialogTitle></DialogHeader>{timeline && <StudentTimeline studentId={timeline["id"]} />}</DialogContent>
      </Dialog>
    </div>
  );
}

/** Chronological record (days + gate movements + requests). Shared by staff, guardian and student views; RLS scopes the rows. */
export function StudentTimeline({ studentId, days = 30 }: { studentId: string; days?: number }) {
  const from = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  const q = useQuery({
    queryKey: ["att-timeline", studentId, from],
    queryFn: async () => {
      const [d, m, r] = await Promise.all([
        db.from("attendance_days").select("date, status, late_minutes, first_in_at, note").eq("student_id", studentId).gte("date", from),
        db.from("gate_movements").select("date, kind, at, note").eq("student_id", studentId).gte("date", from),
        db.from("pickup_requests").select("req_date, kind, status, created_at, handed_at, pickup_name").eq("student_id", studentId).gte("req_date", from),
      ]);
      const err = d.error ?? m.error; if (err) throw err;
      type E = { at: string; date: string; text: string; tone?: string };
      const ev: E[] = [
        ...((d.data ?? []) as Row[]).map((x) => ({ at: x["first_in_at"] ?? x["date"] + "T00:00:00Z", date: x["date"], text: `${DAY_STATUS[x["status"]]}${x["status"] === "late" ? ` ${x["late_minutes"]} دقيقة` : ""}${x["note"] ? ` — ${x["note"]}` : ""}`, tone: x["status"] })),
        ...((m.data ?? []) as Row[]).filter((x) => x["kind"] !== "in").map((x) => ({ at: x["at"], date: x["date"], text: `${MOVE_KIND[x["kind"]]} ${hm(x["at"])}${x["note"] ? ` — ${x["note"]}` : ""}` })),
        ...((r.data ?? []) as Row[]).map((x) => ({ at: x["created_at"], date: x["req_date"], text: `${KIND[x["kind"]]}: ${PICKUP_STATUS[x["status"]]} — المستلم ${x["pickup_name"]}` })),
      ];
      return ev.sort((a, b) => b.at.localeCompare(a.at));
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title={`لا توجد سجلات في آخر ${days} يومًا`} />;
  return (
    <ol className="max-h-[60vh] space-y-1 overflow-auto text-sm">
      {q.data.map((e, i) => <li key={i} className="flex gap-3 rounded border px-3 py-1.5"><span className="w-24 shrink-0 text-muted-foreground">{e.date}</span><span>{e.tone ? <Pill s={e.tone} /> : null} {e.tone ? e.text.replace(DAY_STATUS[e.tone] ?? "", "") : e.text}</span></li>)}
    </ol>
  );
}

/* ================= Counselor follow-up (no automatic penalties) ================= */
export function FollowupTab({ ctx }: { ctx: Ctx }) {
  const S = ctx.schoolId;
  const [days, setDays] = useState(30); const [min, setMin] = useState(3);
  const [tl, setTl] = useState<Row | null>(null);
  const from = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  const q = useQuery({ queryKey: ["att-alerts", S, from, min], queryFn: async () => { const { data, error } = await db.rpc("attendance_alerts", { _school: S, _from: from, _to: riyadhToday(), _min: min }); if (error) throw error; return data as Row[]; } });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">تنبيهات للمتابعة الإرشادية فقط؛ لا تُطبَّق أي عقوبة تلقائيًا.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="fd">آخر (يوم)</Label><Input id="fd" type="number" min={1} max={180} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))} className="w-28" /></div>
        <div className="space-y-1"><Label htmlFor="fm">الحد الأدنى للتكرار</Label><Input id="fm" type="number" min={1} value={min} onChange={(e) => setMin(Math.max(1, Number(e.target.value) || 1))} className="w-28" /></div>
        {!!q.data?.length && <ExportButtons title="تنبيهات المواظبة" school={ctx.schoolName} filters={[`آخر ${days} يومًا`, `التكرار ≥ ${min}`]} headers={["الطالب", "الشعبة", "تأخر", "غياب", "خروج مبكر"]} rows={() => (q.data ?? []).map((r) => [r["student_name"], r["section"], r["late"], r["absent"], r["early_out"]])} />}
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا يوجد طلاب تجاوزوا الحد في الفترة" /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {q.data.map((r) => <li key={r["student_id"]} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"><button className="font-semibold hover:text-primary" onClick={() => setTl({ id: r["student_id"], name: r["student_name"] })}>{r["student_name"]}</button><span className="text-muted-foreground">{r["section"]} • تأخر {r["late"]} • غياب {r["absent"]} • خروج مبكر {r["early_out"]}</span></li>)}
        </ul>
      )}
      <Dialog open={!!tl} onOpenChange={(o) => !o && setTl(null)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>السجل الزمني — {tl?.["name"]}</DialogTitle></DialogHeader>{tl && <StudentTimeline studentId={tl["id"]} days={days} />}</DialogContent></Dialog>
    </div>
  );
}
