import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { KeyRound, Plus, ShieldOff } from "lucide-react";
import { ask, askText } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { fmt, rpc, useOrgSchools, useRegistry, type Any } from "./lib";
import { serverMsg } from "./designer/meta";

const DST: Record<string, [string, string]> = { live: ["نشط", "bg-primary/15 text-primary"], scheduled: ["مجدول", "bg-secondary text-secondary-foreground"], expired: ["منتهٍ", "bg-muted text-muted-foreground"], revoked: ["مسحوب", "bg-destructive/10 text-destructive"] };
const ACTS: [string, string][] = [["notify", "إشعار داخلي"], ["reminder", "تذكير"], ["escalate", "تصعيد"], ["task", "مهمة متابعة"], ["review", "طلب مراجعة"]];
const ROLE: Record<string, string> = { principal: "مدير مدرسة", vice_principal: "وكيل", teacher: "معلم", dept_head: "رئيس قسم", supervisor: "مشرف", student_affairs: "شؤون الطلاب", counselor: "موجّه", nurse: "التوجيه الصحي", security: "أمن" };

/** System manager only: who holds automation permissions (from the permission tree) and their scoped, time-bounded delegations. */
export function AccessTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["au-access", orgId], queryFn: () => rpc<Any>("au_access", { _org: orgId }) });
  const [form, setForm] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["au-access", orgId] }); qc.invalidateQueries({ queryKey: ["au-me"] }); };
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={serverMsg(arabicError(q.error))} />;
  const perms = (q.data.perms ?? []) as Any[], people = (q.data.people ?? []) as Any[], dels = (q.data.delegations ?? []) as Any[];
  const secs = [...new Map(perms.map((p) => [p.section, p.section_label])).entries()];
  const policy = async (on: boolean) => { try { await rpc("au_policy_save", { _org: orgId, _separate: on }); toast.success("حُفظت سياسة الاعتماد"); refresh(); } catch (e) { toast.error(serverMsg(arabicError(e))); } };
  const revoke = async (d: Any) => {
    const r = await askText(`سبب سحب تفويض ${d.name}:`, { required: true, ok: "سحب التفويض" }); if (r === null) return;
    try { const x = await rpc<Any>("au_deleg_revoke", { _id: d.id, _reason: r }); toast.success(`سُحب التفويض — أُعيدت ${x.returned} قاعدة للتعديل${x.blocked_active ? `، وتوقف تنفيذ ${x.blocked_active} قاعدة مفعّلة حتى يعاد اعتمادها` : ""}`); refresh(); }
    catch (e) { toast.error(serverMsg(arabicError(e))); }
  };
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-bold">كيف تعمل الصلاحيات</h3>
        <ol className="list-decimal space-y-1 ps-5 text-xs text-muted-foreground">
          <li>امنح الوظائف من <Link to="/app/permissions" className="font-semibold text-primary underline">الأدوار والصلاحيات</Link> ضمن «مركز الأتمتة الذكية». لا يحصل أي دور عليها تلقائيًا.</li>
          <li>ثم أضف هنا تفويضًا يحدد المدارس والأقسام والأحداث والإجراءات والمستلمين والمدة. بدون تفويض نشط لا تعمل أي صلاحية.</li>
          <li>الاعتماد والتفعيل لمدير المدرسة أو الوكيل فقط. الإعدادات والإيقاف الطارئ والقواعد عالية الخطورة لك وحدك.</li>
        </ol>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!q.data.separate_approver} onChange={(e) => void policy(e.target.checked)} />
          اشتراط معتمد غير منشئ القاعدة حتى لمدير النظام</label>
      </section>

      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><KeyRound className="size-4" />مصفوفة الصلاحيات ({people.length})</h3>
        {people.length === 0 ? <p className="text-xs text-muted-foreground">لم تُمنح صلاحيات مركز الأتمتة لأي موظف بعد.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-muted-foreground"><tr className="border-b"><th className="p-2 text-start">الموظف</th>{secs.map(([k, l]) => <th key={k} className="p-2 text-start">{String(l).replace("مركز الأتمتة — ", "")}</th>)}<th className="p-2 text-start">التفويض</th></tr></thead>
            <tbody>{people.map((p) => <tr key={p.user_id} className="border-b align-top last:border-0">
              <td className="p-2"><div className="font-semibold">{p.name ?? "—"}</div><div className="text-muted-foreground">{(p.roles as string[]).map((r) => ROLE[r] ?? r).join("، ")}</div></td>
              {secs.map(([k]) => { const mine = perms.filter((x) => x.section === k && (p.perms as string[]).includes(x.key)); return <td key={k} className="p-2">{mine.length ? <ul className="space-y-0.5">{mine.map((x) => <li key={x.key} className={["au_control.approve", "au_control.activate"].includes(x.key) && !p.senior ? "text-muted-foreground line-through" : ""} title={["au_control.approve", "au_control.activate"].includes(x.key) && !p.senior ? "غير فعّالة: تتطلب دور مدير مدرسة أو وكيل" : undefined}>{String(x.label).replace(/ \(.*\)$/, "")}</li>)}</ul> : "—"}</td>; })}
              <td className="p-2">{p.live ? <span className={`rounded-full px-2 py-0.5 font-semibold ${DST["live"]![1]}`}>نشط</span> : <span className="text-destructive">لا يوجد — الصلاحيات معطلة</span>}{(p.denied as string[]).length > 0 && <div className="text-muted-foreground">ممنوع صراحة: {(p.denied as string[]).length}</div>}</td>
            </tr>)}</tbody></table></div>)}
      </section>

      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">التفويضات ({dels.length})</h3>
          <button onClick={() => setForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />تفويض جديد</button></div>
        {form && <DelegationForm orgId={orgId} people={people} onDone={() => { setForm(false); refresh(); }} />}
        {dels.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد تفويضات.</p> : (
          <ul className="divide-y text-xs">{dels.map((d) => <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
            <div className="space-y-0.5"><div className="flex items-center gap-2"><b className="text-sm">{d.name}</b><span className={`rounded-full px-2 py-0.5 font-semibold ${DST[d.status]?.[1]}`}>{DST[d.status]?.[0]}</span></div>
              <div>المدارس: {d.all_schools ? "جميع مدارسه" : (d.schools as string[]).join("، ")}{d.central ? " + الإدارة المركزية" : ""} · الأقسام: {d.sections?.length ? d.sections.length : "كل الأقسام"} · الأحداث: {d.events?.length ?? "كل الأحداث"} · الإجراءات: {d.actions ? (d.actions as string[]).map((a) => ACTS.find((x) => x[0] === a)?.[1] ?? a).join("، ") : "كلها"} · المستلمون: {d.recipients?.length ?? "كلهم"}</div>
              <div className="text-muted-foreground">من {fmt(d.starts_at)} إلى {d.ends_at ? fmt(d.ends_at) : "دون نهاية"} · السبب: {d.reason} · منحه {d.created_by}{d.revoked_at ? ` · سُحب ${fmt(d.revoked_at)} (${d.revoke_reason})` : ""}</div></div>
            {(d.status === "live" || d.status === "scheduled") && <button onClick={() => void revoke(d)} className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2.5 py-1.5 font-semibold text-destructive"><ShieldOff className="size-3.5" />سحب</button>}
          </li>)}</ul>)}
      </section>
    </div>
  );
}

function DelegationForm({ orgId, people, onDone }: { orgId: string; people: Any[]; onDone: () => void }) {
  const reg = useRegistry(orgId); const schools = useOrgSchools(orgId);
  const [user, setUser] = useState(""); const [all, setAll] = useState(false); const [sch, setSch] = useState<string[]>([]); const [central, setCentral] = useState(false);
  const [secs, setSecs] = useState<string[]>([]); const [acts, setActs] = useState<string[]>(["notify"]); const [rcs, setRcs] = useState<string[]>([]);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const tog = (arr: string[], set: (v: string[]) => void, k: string) => set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const sections = ((reg.data?.sections ?? []) as Any[]).filter((s) => !String(s.key).startsWith("_") && ((reg.data?.events ?? []) as Any[]).some((e) => e.section === s.key && ["wired", "tested"].includes(e.status)));
  const recips = (reg.data?.recipients ?? []) as Any[];
  const save = async () => {
    if (!user) { toast.error("اختر الموظف"); return; }
    if (!all && sch.length === 0) { toast.error("اختر مدرسة واحدة على الأقل أو «جميع مدارسه»"); return; }
    if (!(await ask("منح هذا التفويض؟ يبدأ أثره فورًا (أو من تاريخ البداية) ويُسجَّل في سجل التدقيق.", { ok: "منح التفويض" }))) return;
    setBusy(true);
    try {
      await rpc("au_deleg_save", { _org: orgId, _user: user, _schools: all ? null : sch, _central: central, _sections: secs.length ? secs : null, _events: null, _actions: acts.length ? acts : null, _recipients: rcs.length ? rcs : null,
        _starts: from ? new Date(from).toISOString() : null, _ends: to ? new Date(to).toISOString() : null, _reason: reason });
      toast.success("أُضيف التفويض"); onDone();
    } catch (e) { toast.error(serverMsg(arabicError(e))); } finally { setBusy(false); }
  };
  const box = "flex flex-wrap gap-x-3 gap-y-1 rounded-lg border bg-background p-2";
  return (
    <div className="mb-3 space-y-3 rounded-xl border bg-muted/30 p-3 text-sm">
      <label className="block"><span className="text-xs font-semibold">الموظف (ممن مُنحوا صلاحيات المركز في شجرة الصلاحيات)</span>
        <select aria-label="الموظف" className={selectCls("mt-1 w-full", true)} value={user} onChange={(e) => setUser(e.target.value)}><option value="">— اختر —</option>{people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}</select></label>
      {people.length === 0 && <p className="text-xs text-destructive">امنح صلاحيات المركز لموظف من «الأدوار والصلاحيات» أولًا.</p>}
      <div><span className="text-xs font-semibold">المدارس</span>
        <div className={box}><label className="flex items-center gap-1"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />جميع مدارسه</label>
          {!all && (schools.data ?? []).filter((s) => s.is_active).map((s) => <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={sch.includes(s.id)} onChange={() => tog(sch, setSch, s.id)} />{s.name}</label>)}
          <label className="flex items-center gap-1"><input type="checkbox" checked={central} onChange={(e) => setCentral(e.target.checked)} />أحداث الإدارة المركزية</label></div></div>
      <div><span className="text-xs font-semibold">الأقسام (فارغ = كل الأقسام)</span>
        <div className={`${box} max-h-36 overflow-auto`}>{sections.map((s) => <label key={s.key} className="flex items-center gap-1"><input type="checkbox" checked={secs.includes(s.key)} onChange={() => tog(secs, setSecs, s.key)} />{s.label}</label>)}</div></div>
      <div><span className="text-xs font-semibold">أنواع الإجراءات المسموحة</span>
        <div className={box}>{ACTS.map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={acts.includes(k)} onChange={() => tog(acts, setActs, k)} />{l}</label>)}</div></div>
      <div><span className="text-xs font-semibold">المستلمون المسموحون (فارغ = كل المستلمين المؤهلين)</span>
        <div className={`${box} max-h-36 overflow-auto`}>{recips.map((r) => <label key={r.code} className="flex items-center gap-1"><input type="checkbox" checked={rcs.includes(r.code)} onChange={() => tog(rcs, setRcs, r.code)} />{r.label}</label>)}</div></div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block"><span className="text-xs font-semibold">يبدأ (فارغ = الآن)</span><input type="datetime-local" className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="block"><span className="text-xs font-semibold">ينتهي (فارغ = حتى السحب)</span><input type="datetime-local" className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label className="block"><span className="text-xs font-semibold">السبب</span><input className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: متابعة تكليفات الفرع خلال الفصل الأول" /></label>
      <button disabled={busy} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">منح التفويض</button>
    </div>
  );
}
