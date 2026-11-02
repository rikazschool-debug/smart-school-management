import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Uploader, FileList } from "@/components/homework/files";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
type Recip = { mode: "self" | "authorized" | "one_time"; person: string; name: string; relationship: string; phone: string; id_last4: string; ack: boolean };
const emptyRecip: Recip = { mode: "self", person: "", name: "", relationship: "", phone: "", id_last4: "", ack: false };
const recipArgs = (r: Recip) => ({ _mode: r.mode, _person: r.mode === "authorized" ? r.person || null : null, _delegate: r.mode === "one_time" ? { name: r.name, relationship: r.relationship, phone: r.phone, id_last4: r.id_last4, ack: r.ack } : null });
function recipError(r: Recip) {
  if (r.mode === "authorized" && !r.person) return "اختر المستلم المعتمد";
  if (r.mode === "one_time") {
    if (r.name.trim().split(/\s+/).length < 3) return "اكتب الاسم الكامل للمفوَّض (ثلاثي على الأقل)";
    if (!r.relationship.trim()) return "صلة القرابة أو العلاقة مطلوبة";
    if (!/^\+?[0-9]{9,15}$/.test(r.phone.replace(/[\s-]/g, ""))) return "رقم الجوال غير صحيح";
    if (!/^[0-9]{4}$/.test(r.id_last4)) return "آخر 4 أرقام من هوية المفوَّض مطلوبة";
    if (!r.ack) return "إقرار التفويض مطلوب";
  }
  return null;
}
function RecipientFields({ value: r, onChange, persons, childName }: { value: Recip; onChange: (r: Recip) => void; persons: Row[]; childName: string }) {
  const set = (p: Partial<Recip>) => onChange({ ...r, ...p });
  return (
    <fieldset className="space-y-2 rounded-xl border p-3">
      <legend className="px-1 text-sm font-semibold">المستلم والتفويض</legend>
      {([["self", "سأستلم بنفسي"], ["authorized", "مستلم مفوض معتمد سابقًا"], ["one_time", "تفويض شخص آخر لهذا الطلب"]] as const).map(([m, l]) => (
        <label key={m} className="flex items-center gap-2 text-sm"><input type="radio" name="recip" checked={r.mode === m} onChange={() => set({ mode: m })} disabled={m === "authorized" && !persons.length} />{l}{m === "authorized" && !persons.length ? " (لا يوجد مستلمون معتمدون)" : ""}</label>
      ))}
      {r.mode === "authorized" && <select aria-label="المستلم المعتمد" className={sel} value={r.person} onChange={(e) => set({ person: e.target.value })}><option value="">— اختر —</option>{persons.map((p) => <option key={p["id"]} value={p["id"]}>{p["full_name"]}{p["relationship"] ? ` — ${p["relationship"]}` : ""}</option>)}</select>}
      {r.mode === "one_time" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="dn">الاسم الكامل</Label><Input id="dn" value={r.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="dr">صلة القرابة أو العلاقة</Label><Input id="dr" value={r.relationship} onChange={(e) => set({ relationship: e.target.value })} placeholder="مثال: خال، سائق العائلة" /></div>
          <div className="space-y-1"><Label htmlFor="dp">رقم الجوال</Label><Input id="dp" dir="ltr" inputMode="tel" value={r.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="05xxxxxxxx" /></div>
          <div className="space-y-1"><Label htmlFor="dl">آخر 4 أرقام من هويته</Label><Input id="dl" dir="ltr" inputMode="numeric" maxLength={4} value={r.id_last4} onChange={(e) => set({ id_last4: e.target.value.replace(/\D/g, "") })} />
            <p className="text-xs text-muted-foreground">يطابقها الأمن مع الهوية عند الاستلام. لا نطلب رقم الهوية كاملًا.</p></div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={r.ack} onChange={(e) => set({ ack: e.target.checked })} />أقرّ بأنني أفوّض هذا الشخص باستلام ابني «{childName}» لهذا الطلب واليوم فقط. التفويض لا يمنحه حسابًا أو صلة أسرية أو متابعة تعليمية، ويحتاج اعتماد المدرسة.</label>
        </div>
      )}
    </fieldset>
  );
}
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
  const mine = useQuery({ queryKey: ["att-mine", user.id], refetchInterval: 10000, queryFn: async () => { const { data, error } = await db.from("pickup_requests").select("id, student_id, kind, status, reason, pickup_name, planned_at, created_at, decision_note, handed_at, delegate_mode, delegate_status, delegate_note, students(full_name)").eq("requested_by", user.id).order("created_at", { ascending: false }).limit(50); if (error) throw error; return data as Row[]; } });
  const [recip, setRecip] = useState<Recip>(emptyRecip);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editRecip, setEditRecip] = useState<Recip>(emptyRecip);
  const [reason, setReason] = useState("");
  const [time, setTime] = useState("");
  const submit = async (kind: "quick" | "permission") => {
    if (!child) return void toast.error("اختر الابن");
    if (kind === "permission" && !reason.trim()) return void toast.error("سبب الاستئذان مطلوب");
    const planned = time ? new Date(`${riyadhToday()}T${time}:00+03:00`).toISOString() : null;
    const re = recipError(recip); if (re) return void toast.error(re);
    const { error } = await db.rpc("submit_pickup_request", { _student: child, _kind: kind, _reason: kind === "permission" ? reason : null, _planned_at: planned, ...recipArgs(recip) });
    if (error) return void toast.error(arabicError(error));
    setRecip(emptyRecip);
    toast.success(kind === "quick" ? "أُرسل طلب الاستلام. أبلغ الاستقبال عند وصول المستلم." : "قُدّم الاستئذان للمسؤول المخول. يمكنك إرفاق مستند من «طلباتي»."); setReason(""); setTime("");
    qc.invalidateQueries({ queryKey: ["att-mine"] }); setTab("mine");
  };
  const canPick = kids.data?.find((k) => k["student_id"] === child)?.["can_pickup"];
  const childName = kids.data?.find((k) => k["student_id"] === child)?.["students"]?.full_name ?? "";
  const picker = (
    <>
      <div className="space-y-1"><Label htmlFor="kid">الابن</Label><select id="kid" className={sel} value={child} onChange={(e) => { setKid(e.target.value); setRecip(emptyRecip); }}>{kids.data?.map((k) => <option key={k["student_id"]} value={k["student_id"]}>{k["students"]?.full_name}</option>)}</select></div>
      <RecipientFields value={recip} onChange={setRecip} persons={persons.data ?? []} childName={childName} />
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
                    {r["delegate_mode"] === "one_time" && <p className="mt-1 text-xs">التفويض: <Badge variant="outline">{r["delegate_status"] === "approved" ? "معتمد" : r["delegate_status"] === "rejected" ? "مرفوض" : "بانتظار الاعتماد"}</Badge>{r["delegate_note"] ? ` • ${r["delegate_note"]}` : ""}</p>}
                    {["submitted", "under_review", "approved"].includes(r["status"]) && <Button size="sm" variant="outline" className="mt-2" onClick={() => { setEditRecip(emptyRecip); setEditing(r); }}>تعديل المستلم</Button>}
                    {r["kind"] === "permission" && <PickupFiles id={r["id"]} open={["submitted", "under_review"].includes(r["status"])} />}
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
      <EditRecipient row={editing} value={editRecip} onChange={setEditRecip} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["att-mine"] }); }} />
    </>
  );
}

function EditRecipient({ row, value, onChange, onClose, onSaved }: { row: Row | null; value: Recip; onChange: (r: Recip) => void; onClose: () => void; onSaved: () => void }) {
  const persons = useQuery({ queryKey: ["att-gpersons", row?.["student_id"]], enabled: !!row, queryFn: async () => ((await db.from("authorized_pickups").select("id, full_name, relationship").eq("student_id", row!["student_id"]).eq("active", true)).data ?? []) as Row[] });
  const save = async () => {
    const e = recipError(value); if (e) return void toast.error(e);
    const { error } = await db.rpc("update_pickup_delegate", { _id: row!["id"], ...recipArgs(value) });
    if (error) return void toast.error(arabicError(error));
    toast.success(row!["kind"] === "permission" && row!["status"] === "approved" ? "عُدّل المستلم وأُعيد الطلب للمراجعة" : "عُدّل المستلم"); onSaved();
  };
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent><DialogHeader><DialogTitle>تعديل المستلم</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">تعديل المستلم بعد الاعتماد يعيد التحقق والاعتماد. التفويض السابق يُلغى.</p>
        {row && <RecipientFields value={value} onChange={onChange} persons={persons.data ?? []} childName={row["students"]?.full_name ?? ""} />}
        <Button onClick={save}>حفظ</Button>
      </DialogContent>
    </Dialog>
  );
}

function PickupFiles({ id, open }: { id: string; open: boolean }) {
  const f = useQuery({ queryKey: ["att-pfiles", id], queryFn: async () => ((await db.from("files").select("id, name, storage_path, size_bytes").eq("source_type", "pickup").eq("source_id", id)).data ?? []) as Row[] });
  if (!open && !f.data?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <FileList files={f.data ?? []} onRemove={open ? async (x) => { const { error } = await db.rpc("remove_pickup_file", { _file: x["id"] }); if (error) toast.error(arabicError(error)); else f.refetch(); } : undefined} />
      {open && (f.data?.length ?? 0) < 3 && <Uploader label="إرفاق مستند (اختياري)" create={async (file) => { const { data, error } = await db.rpc("create_pickup_file", { _pickup: id, _name: file.name, _mime: file.type, _size: file.size }); if (error) throw error; return (data as { id: string; storage_path: string }[])[0]!; }} release={(fid) => db.rpc("remove_pickup_file", { _file: fid })} onDone={() => f.refetch()} />}
      {open && <p className="text-xs text-muted-foreground">يراه المسؤول المخول فقط، لا الأمن ولا المعلم.</p>}
    </div>
  );
}
