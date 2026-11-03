import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PeoplePicker } from "@/components/people-picker";
import { Pill, fmt } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const INFO_STATUS: Record<string, string> = { open: "بانتظار الإفادة", answered: "تمت الإفادة", cancelled: "أُلغي" };

/** Assignment, branch transfer and escalation (manager / org owner only — the server re-checks every step). */
export function ManagePanel({ d, onChange }: { d: Row; onChange: () => void }) {
  const t = d.ticket, can = d.can;
  const open = !["closed", "cancelled"].includes(t.status);
  const [who, setWho] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [reason, setReason] = useState("");
  const [esc, setEsc] = useState<{ title: string; body: string } | null>(null);
  const escKey = useMemo(() => crypto.randomUUID(), [esc === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const branches = useQuery({
    enabled: !!can.transfer,
    queryKey: ["support-branches", t.org_id],
    queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", t.org_id).eq("is_active", true).order("name")).data ?? []) as Row[],
  });
  async function action(a: string, value: string | null, r: string | null) {
    const { error } = await db.rpc("support_action", { _ticket: t.id, _action: a, _rev: t.rev, _reason: r, _value: value });
    if (error) return void toast.error(arabicError(error));
    toast.success("تم"); setWho([]); setBranch(""); setReason(""); onChange();
  }
  async function escalate() {
    if (!esc) return;
    const { data, error } = await db.rpc("support_escalate", { _ticket: t.id, _title: esc.title, _body: esc.body, _client_key: escKey });
    if (error) return void toast.error(arabicError(error));
    toast.success("أُرسلت تذكرة إلى دعم المنصة"); setEsc(null); onChange();
    return data;
  }
  if (!open || !(can.assign || can.transfer || can.escalate)) return null;
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <p className="font-semibold">الإسناد والتحويل</p>
      {can.assign && (
        <div className="space-y-2">
          <Label>إسناد المعالجة لشخص <span className="text-xs font-normal text-muted-foreground">— يرى هذه التذكرة فقط، وتُسحب صلاحيته فور تغيير المسؤول</span></Label>
          <PeoplePicker purpose="support_assign" school={t.school_id} post={t.id} single compact label="مسؤول المعالجة" value={who} onChange={setWho} showBranch />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!who[0]} onClick={() => action("assign", who[0]!, null)}>إسناد</Button>
            {t.assignee && <Button size="sm" variant="outline" onClick={async () => { if (await ask("سحب الإسناد من المسؤول الحالي؟")) action("assign", "", null); }}>سحب الإسناد</Button>}
          </div>
        </div>
      )}
      {can.transfer && (
        <div className="space-y-2 border-t pt-3">
          <Label htmlFor="sp-branch">تحويل إلى فرع آخر <span className="text-xs font-normal text-muted-foreground">— ينتقل الاطلاع لمدير الفرع الجديد ويُلغى الإسناد الحالي</span></Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <select id="sp-branch" className={selectCls()} value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">اختر الفرع</option>
              {(branches.data ?? []).filter((s) => s.id !== t.school_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Input aria-label="سبب التحويل" placeholder="سبب التحويل (إلزامي)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" disabled={!branch || reason.trim().length < 3} onClick={() => action("transfer", branch, reason.trim())}>تحويل</Button>
        </div>
      )}
      {can.escalate && (
        <div className="space-y-2 border-t pt-3">
          {(t.escalations ?? []).length > 0 && (
            <p className="text-sm">مُصعّدة إلى المنصة: {t.escalations.map((x: Row) => (
              <Link key={x.id} to="/app/support" search={{ t: x.id }} className="ms-1 font-mono text-primary underline" dir="ltr">{x.ref}</Link>
            ))}</p>
          )}
          {!esc ? (
            <Button size="sm" variant="outline" onClick={() => setEsc({ title: t.title, body: "" })}>تصعيد إلى دعم المنصة</Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">تُنشأ تذكرة منصة جديدة بما تكتبه هنا فقط؛ لا تُرسل التذكرة الداخلية ولا ردودها ولا مرفقاتها.</p>
              <Input aria-label="عنوان تذكرة المنصة" value={esc.title} maxLength={200} onChange={(e) => setEsc({ ...esc, title: e.target.value })} />
              <Textarea aria-label="ما تريد مشاركته مع المنصة" rows={4} placeholder="اكتب ما تريد مشاركته مع فريق المنصة" value={esc.body} onChange={(e) => setEsc({ ...esc, body: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" onClick={escalate}>إرسال للمنصة</Button>
                <Button size="sm" variant="ghost" onClick={() => setEsc(null)}>إلغاء</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Internal notes (private to one recipient, or shared with the handling team) and information requests. */
export function InternalPanel({ d, userId, onChange }: { d: Row; userId: string; onChange: () => void }) {
  const t = d.ticket;
  const open = !["closed", "cancelled"].includes(t.status);
  const [kind, setKind] = useState<"private" | "team">("team");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [asked, setAsked] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [qKey, setQKey] = useState(() => crypto.randomUUID());
  const recipients = useMemo(() => {
    const m = new Map<string, string>();
    if (t.assignee && t.assignee !== userId && t.assignee !== t.requester) m.set(t.assignee, `${t.assignee_name ?? "—"} (المسؤول الحالي)`);
    for (const x of d.managers ?? []) if (!m.has(x.id)) m.set(x.id, x.name ?? "—");
    return [...m.entries()];
  }, [d, t, userId]);

  async function addNote() {
    const { error } = await db.rpc("support_add_note", { _ticket: t.id, _kind: kind, _recipient: kind === "private" ? to || null : null, _body: body, _client_key: key });
    if (error) return void toast.error(arabicError(error));
    setBody(""); setKey(crypto.randomUUID()); toast.success("حُفظت الملاحظة"); onChange();
  }
  async function requestInfo() {
    const { error } = await db.rpc("support_request_info", { _ticket: t.id, _to: asked[0]!, _question: question, _client_key: qKey });
    if (error) return void toast.error(arabicError(error));
    setAsked([]); setQuestion(""); setQKey(crypto.randomUUID()); toast.success("أُرسل طلب الإفادة"); onChange();
  }
  async function cancelInfo(id: string) {
    if (!(await ask("إلغاء طلب الإفادة؟"))) return;
    const { error } = await db.rpc("support_info_cancel", { _req: id });
    if (error) toast.error(arabicError(error)); onChange();
  }

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-primary/40 bg-card p-4">
      <div>
        <p className="font-semibold">داخلي — لا يراه مقدم الطلب</p>
        <p className="text-xs text-muted-foreground">لا تظهر هذه الأقسام في التصدير ولا في نص الإشعارات.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">طلبات الإفادة</p>
        {!d.info.length && <p className="text-sm text-muted-foreground">لا توجد طلبات إفادة.</p>}
        {d.info.map((r: Row) => (
          <div key={r.id} className="rounded-lg border p-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>من {r.by_name ?? "—"} إلى <span className="font-medium text-foreground">{r.to_name ?? "—"}</span> · {fmt(r.created_at)}</span>
              <Pill tone={r.status === "answered" ? "ok" : r.status === "open" ? "warn" : "muted"}>{INFO_STATUS[r.status]}</Pill>
            </div>
            <p className="mt-1 whitespace-pre-wrap"><span className="text-muted-foreground">السؤال: </span>{r.question}</p>
            {r.answer && <p className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2"><span className="text-muted-foreground">الإفادة: </span>{r.answer}</p>}
            {r.status === "open" && <Button size="sm" variant="ghost" onClick={() => cancelInfo(r.id)}>إلغاء الطلب</Button>}
          </div>
        ))}
        {open && t.scope === "school" && (
          <div className="space-y-2 rounded-lg bg-muted/30 p-3">
            <Label>طلب إفادة من شخص <span className="text-xs font-normal text-muted-foreground">— يرى سؤالك فقط ويرد عليه، دون التذكرة أو بيانات أطرافها</span></Label>
            <PeoplePicker purpose="support_info" school={t.school_id} post={t.id} single compact label="من تُطلب إفادته" value={asked} onChange={setAsked} showBranch />
            <Textarea aria-label="السؤال أو الجزء المطلوب الإفادة عنه" rows={2} placeholder="اكتب السؤال أو الجزء الذي تريد مشاركته فقط" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!asked[0] || question.trim().length < 3} onClick={requestInfo}>إرسال طلب الإفادة</Button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-semibold">الملاحظات</p>
        {!d.notes.length && <p className="text-sm text-muted-foreground">لا توجد ملاحظات.</p>}
        {d.notes.map((n: Row) => (
          <div key={n.id} className={`rounded-lg border p-2.5 text-sm ${n.kind === "private" ? "border-warning/50 bg-warning/5" : "bg-muted/30"}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span><Pill tone={n.kind === "private" ? "warn" : "muted"}>{n.kind === "private" ? "ملاحظة خاصة" : "ملاحظة الفريق"}</Pill> {n.author_name ?? "—"}{n.kind === "private" && <> ← {n.recipient_name ?? "—"}</>}</span>
              <span>{fmt(n.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap">{n.body}</p>
          </div>
        ))}
        {open && (
          <div className="space-y-2 rounded-lg bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select aria-label="نوع الملاحظة" className={selectCls("w-full min-w-0")} value={kind} onChange={(e) => setKind(e.target.value as "private" | "team")}>
                <option value="team">ملاحظة الفريق — يراها مديرو التذكرة والمسؤول الحالي</option>
                <option value="private">ملاحظة خاصة — يراها كاتبها ومستلمها فقط</option>
              </select>
              {kind === "private" && (
                <select aria-label="مستلم الملاحظة" className={selectCls("w-full min-w-0")} value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">اختر المستلم</option>
                  {recipients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              )}
            </div>
            <Textarea aria-label="نص الملاحظة" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">{kind === "private" ? "تبقى مرتبطة بهذا المستلم؛ تغيير المسؤول لاحقًا لا يكشفها للمسؤول الجديد." : "يراها المسؤول الحالي ومن يُسند إليه لاحقًا."}</p>
            <Button size="sm" variant="outline" disabled={!body.trim() || (kind === "private" && !to)} onClick={addNote}>حفظ الملاحظة</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Requests addressed to me: I see only the question, never the ticket. */
export function InfoInbox() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["support-info-inbox"],
    queryFn: async () => { const { data, error } = await db.rpc("support_info_inbox"); if (error) throw error; return data as Row[]; },
  });
  const [ans, setAns] = useState<Record<string, string>>({});
  async function answer(id: string) {
    const { error } = await db.rpc("support_info_answer", { _req: id, _answer: ans[id] ?? "" });
    if (error) return void toast.error(arabicError(error));
    toast.success("أُرسلت الإفادة"); qc.invalidateQueries({ queryKey: ["support-info-inbox"] });
  }
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="لا توجد طلبات إفادة" hint="عندما يطلب منك فريق الدعم معلومة تظهر هنا." />;
  return (
    <ul className="space-y-2">
      {q.data.map((r) => (
        <li key={r.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>طلب إفادة من {r.asked_by_name ?? "—"} · {r.school_name} · <span className="font-mono" dir="ltr">{r.ref}</span></span>
            <span className="flex items-center gap-2">{fmt(r.created_at)} <Pill tone={r.status === "open" ? "warn" : r.status === "answered" ? "ok" : "muted"}>{INFO_STATUS[r.status]}</Pill></span>
          </div>
          <p className="whitespace-pre-wrap font-medium">{r.question}</p>
          {r.answer && <p className="whitespace-pre-wrap rounded bg-muted/40 p-2"><span className="text-muted-foreground">إفادتك: </span>{r.answer}</p>}
          {r.status === "open" && (
            <div className="space-y-2">
              <Textarea aria-label="إفادتك" rows={2} value={ans[r.id] ?? ""} onChange={(e) => setAns({ ...ans, [r.id]: e.target.value })} />
              <Button size="sm" disabled={!(ans[r.id] ?? "").trim()} onClick={() => answer(r.id)}>إرسال الإفادة</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
