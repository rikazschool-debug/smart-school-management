import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { StudentTimeline } from "@/components/attendance/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { KIND, PICKUP_STATUS, hm, riyadhToday } from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/app/pickup")({
  head: () => ({ meta: [{ title: "الخروج والاستئذان — ركاز" }, { name: "description", content: "طلبات استلام الأبناء والاستئذان ومتابعتها، وسجل الحضور." }] }),
  component: Page,
});

function Page() {
  return <RequireSchool nav="pickup">{(ctx) => (ctx.role === "student" ? <StudentView /> : <GuardianView ctx={ctx} />)}</RequireSchool>;
}

function StudentView() {
  const { user } = useSession();
  const me = useQuery({ queryKey: ["att-me", user.id], queryFn: async () => ((await db.from("students").select("id, full_name").eq("user_id", user.id).limit(1)).data ?? [])[0] as Row | undefined });
  return (
    <>
      <PageHeader title="سجل حضوري" desc="سجلك فقط: الحضور والتأخر والخروج والعودة. طلبات الخروج تقدمها أسرتك من حسابها." />
      {me.isLoading ? <LoadingState /> : !me.data ? <EmptyState title="لم يُربط حسابك بسجل طالب بعد" /> : <StudentTimeline studentId={me.data["id"]} />}
    </>
  );
}

const sel = selectCls("w-full");
type Tab = "quick" | "permission" | "mine" | "record";

function GuardianView({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("permission");
  const kids = useQuery({
    queryKey: ["att-kids", user.id, ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("student_guardians").select("student_id, can_pickup, verified, guardians!inner(user_id), students(full_name)").eq("guardians.user_id", user.id).eq("school_id", ctx.schoolId).eq("verified", true);
      if (error) throw error;
      return data as Row[];
    },
  });
  const [kid, setKid] = useState("");
  const child = kid || kids.data?.[0]?.["student_id"] || "";
  const persons = useQuery({ queryKey: ["att-gpersons", child], enabled: !!child, queryFn: async () => ((await db.from("authorized_pickups").select("id, full_name, relationship").eq("student_id", child).eq("active", true)).data ?? []) as Row[] });
  const mine = useQuery({ queryKey: ["att-mine", user.id], refetchInterval: 10000, queryFn: async () => { const { data, error } = await db.from("pickup_requests").select("id, kind, status, reason, pickup_name, planned_at, created_at, decision_note, handed_at, students(full_name)").eq("requested_by", user.id).order("created_at", { ascending: false }).limit(50); if (error) throw error; return data as Row[]; } });
  const [person, setPerson] = useState("");
  const [reason, setReason] = useState("");
  const [time, setTime] = useState("");
  const submit = async (kind: "quick" | "permission") => {
    if (!child) return void toast.error("اختر الابن");
    if (kind === "permission" && !reason.trim()) return void toast.error("سبب الاستئذان مطلوب");
    const planned = time ? new Date(`${riyadhToday()}T${time}:00+03:00`).toISOString() : null;
    const { error } = await db.rpc("create_pickup_request", { _student: child, _kind: kind, _reason: kind === "permission" ? reason : null, _planned_at: planned, _person: person || null });
    if (error) return void toast.error(arabicError(error));
    toast.success(kind === "quick" ? "أُرسل طلب الاستلام. أبلغ الاستقبال عند وصول المستلم." : "قُدّم الاستئذان للمسؤول المخول"); setReason(""); setTime("");
    qc.invalidateQueries({ queryKey: ["att-mine"] }); setTab("mine");
  };
  const canPick = kids.data?.find((k) => k["student_id"] === child)?.["can_pickup"];
  const picker = (
    <>
      <div className="space-y-1"><Label htmlFor="kid">الابن</Label><select id="kid" className={sel} value={child} onChange={(e) => { setKid(e.target.value); setPerson(""); }}>{kids.data?.map((k) => <option key={k["student_id"]} value={k["student_id"]}>{k["students"]?.full_name}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="pp">المستلم</Label><select id="pp" className={sel} value={person} onChange={(e) => setPerson(e.target.value)}><option value="">أنا (ولي الأمر)</option>{persons.data?.map((p) => <option key={p["id"]} value={p["id"]}>{p["full_name"]}{p["relationship"] ? ` — ${p["relationship"]}` : ""}</option>)}</select>
        <p className="text-xs text-muted-foreground">لإضافة مستلم جديد تواصل مع شؤون الطلاب لتوثيقه أولًا.</p></div>
    </>
  );
  return (
    <>
      <PageHeader title="الخروج والاستئذان" desc="اطلب استلام ابنك أو استئذانه أثناء الدوام، وتابع الحالة. باركود الحضور ليس تصريح خروج." />
      <div role="tablist" className="mb-5 flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {([["quick", "استلام سريع"], ["permission", "استئذان"], ["mine", "طلباتي"], ["record", "سجل الحضور"]] as [Tab, string][]).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{l}</button>)}
      </div>
      {kids.isLoading ? <LoadingState /> : kids.error ? <ErrorState message={arabicError(kids.error)} onRetry={() => kids.refetch()} /> : !kids.data?.length ? <EmptyState title="لا يوجد أبناء موثقون في حسابك بهذه المدرسة" /> : <>
        {(tab === "quick" || tab === "permission") && !canPick && <p className="mb-3 rounded-xl border border-destructive bg-destructive/5 p-3 text-sm text-destructive">حسابك غير مخوّل باستلام هذا الابن. تواصل مع المدرسة.</p>}
        {tab === "quick" && (
          <form className="grid max-w-xl gap-3 rounded-2xl border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit("quick"); }}>
            <p className="text-sm text-muted-foreground">للاستلام عند نهاية الدوام. يتحقق الاستقبال من وصول المستلم وصلاحيته قبل بدء التجهيز والنداء.</p>
            {picker}<Button disabled={!canPick}>طلب الاستلام</Button>
          </form>
        )}
        {tab === "permission" && (
          <form className="grid max-w-xl gap-3 rounded-2xl border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit("permission"); }}>
            <p className="text-sm text-muted-foreground">للخروج أثناء الدوام؛ يُرسل للمسؤول المخول للموافقة أو الرفض بسبب.</p>
            {picker}
            <div className="space-y-1"><Label htmlFor="rs">السبب</Label><Input id="rs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: موعد في المستشفى" /></div>
            <div className="space-y-1"><Label htmlFor="tm">الموعد المتوقع (اختياري)</Label><Input id="tm" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <Button disabled={!canPick}>تقديم الاستئذان</Button>
          </form>
        )}
        {tab === "mine" && (
          <Section title="طلباتي">
            {mine.isLoading ? <LoadingState /> : !mine.data?.length ? <EmptyState title="لا توجد طلبات" /> : (
              <ul className="space-y-2">
                {mine.data.map((r) => (
                  <li key={r["id"]} className="rounded-xl border bg-card p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{r["students"]?.full_name}</b> — {KIND[r["kind"]]} <Badge className="ms-1" variant={["rejected", "cancelled"].includes(r["status"]) ? "outline" : "default"}>{PICKUP_STATUS[r["status"]]}</Badge></span>
                      {["submitted", "under_review", "approved", "arrived"].includes(r["status"]) && <Button size="sm" variant="ghost" onClick={async () => { const t = await askText("سبب الإلغاء (اختياري)"); if (t === null) return; const { error } = await db.rpc("cancel_pickup", { _id: r["id"], _reason: t || null }); if (error) toast.error(arabicError(error)); else { toast.success("أُلغي الطلب"); mine.refetch(); } }}>إلغاء</Button>}
                    </div>
                    <p className="mt-1 text-muted-foreground">قُدّم {new Date(r["created_at"]).toLocaleDateString("ar-SA-u-nu-latn")} {hm(r["created_at"])} • المستلم: {r["pickup_name"]}{r["reason"] ? ` • السبب: ${r["reason"]}` : ""}{r["decision_note"] ? ` • القرار: ${r["decision_note"]}` : ""}{r["handed_at"] ? ` • سُلّم ${hm(r["handed_at"])}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        {tab === "record" && (<>
          <div className="mb-3 max-w-xs space-y-1"><Label htmlFor="kid2">الابن</Label><select id="kid2" className={sel} value={child} onChange={(e) => setKid(e.target.value)}>{kids.data.map((k) => <option key={k["student_id"]} value={k["student_id"]}>{k["students"]?.full_name}</option>)}</select></div>
          {child && <StudentTimeline studentId={child} />}
        </>)}
      </>}
    </>
  );
}
