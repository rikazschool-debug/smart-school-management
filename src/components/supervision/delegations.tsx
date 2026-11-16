import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, XCircle } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { DELEG_KIND, fromRiyadhInput, riyadhText, toRiyadhInput, type SvAssignment, type SvDelegation, type SvForm, type SvMe } from "./model";

type Staff = { user_id: string; school_id: string; role: string; name: string };
const ROLE: Record<string, string> = { principal: "مدير", vice_principal: "وكيل", supervisor: "مشرف", dept_head: "رئيس قسم", org_owner: "مالك" };

export function Delegations({ org, me }: { org: string; me: SvMe }) {
  const q = useQuery({ queryKey: ["sv-deleg", org], queryFn: async () => { const r = await db.rpc("sv_deleg_list", { _org: org }); if (r.error) throw r.error; return r.data as SvDelegation[]; } });
  const [adding, setAdding] = useState(false);
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  async function revoke(d: SvDelegation) { const why = await askText("سبب إلغاء التفويض", { required: true, ok: "إلغاء التفويض" }); if (!why) return; const r = await db.rpc("sv_deleg_revoke", { _id: d.id, _reason: why }); if (r.error) { toast.error(arabicError(r.error)); return; } toast.success("أُلغي التفويض"); q.refetch(); }
  const rows = q.data ?? [];
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">التفويض محدد بالعمل والنطاق والمدة، ويمنحه مالك المجموعة فقط. لا يعتمد المفوَّض عملًا كتبه، ولا يحصل على صلاحية عامة.</p>
    {me.owner && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" />تفويض جديد</Button>}
    {adding && <DelegForm org={org} me={me} onDone={(ok) => { setAdding(false); if (ok) q.refetch(); }} />}
    {!rows.length ? <EmptyState title="لا توجد تفويضات" hint="مثال: تفويض مدير فرع بإدارة الإسناد في فرعه، أو تسمية بديل مستقل يعتمد أعمال المدير." />
      : <ul className="grid gap-3 md:grid-cols-2">{rows.map((d) => <li key={d.id} className="rounded-2xl border bg-card p-4">
        <div className="flex justify-between gap-2"><b>{DELEG_KIND[d.kind]}</b><span className={`rounded-full px-2 py-0.5 text-xs ${d.live ? "bg-success/15 text-success" : "bg-muted"}`}>{d.revoked_at ? "ملغى" : d.live ? "ساري" : "غير ساري الآن"}</span></div>
        <p className="mt-1 text-sm">{d.delegate}{d.school ? ` — ${d.school}` : " — كل المجموعة"}{d.form_key ? ` · نموذج: ${d.form_key}` : ""}{d.record_id ? " · سجل محدد" : ""}</p>
        <p className="text-xs text-muted-foreground">{riyadhText(d.starts_at)} ← {riyadhText(d.ends_at)}</p>
        <p className="text-xs text-muted-foreground">السبب: {d.reason}{d.granter ? ` · منحه ${d.granter}` : ""}</p>
        {me.owner && !d.revoked_at && <Button className="mt-2" size="sm" variant="outline" onClick={() => revoke(d)}><XCircle className="size-4" />إلغاء</Button>}
      </li>)}</ul>}
  </div>;
}

function DelegForm({ org, me, onDone }: { org: string; me: SvMe; onDone: (ok: boolean) => void }) {
  const staff = useQuery({ queryKey: ["sv-staff", org], queryFn: async () => { const r = await db.rpc("sv_staff", { _org: org }); if (r.error) throw r.error; return r.data as Staff[]; } });
  const forms = useQuery({ queryKey: ["sv-forms", org], queryFn: async () => { const r = await db.rpc("sv_form_list", { _org: org }); if (r.error) throw r.error; return r.data as SvForm[]; } });
  const asg = useQuery({ queryKey: ["sv-asg", org], queryFn: async () => { const r = await db.rpc("sv_asg_list", { _org: org }); if (r.error) throw r.error; return r.data as SvAssignment[]; } });
  const [kind, setKind] = useState<SvDelegation["kind"]>("assign"); const [school, setSchool] = useState(me.schools[0]?.id ?? ""); const [who, setWho] = useState(""); const [form, setForm] = useState(""); const [asgId, setAsg] = useState("");
  const [st, setSt] = useState(toRiyadhInput(new Date().toISOString())); const [en, setEn] = useState(""); const [why, setWhy] = useState(""); const [busy, setBusy] = useState(false);
  const people = (staff.data ?? []).filter((p) => (kind === "forms" ? true : p.school_id === school) && (kind !== "assign" || p.role === "principal"));
  const uniq = [...new Map(people.map((p) => [p.user_id, p])).values()];
  const keys = [...new Map((forms.data ?? []).map((f) => [f.key, f.title])).entries()];
  async function save() { setBusy(true); try { const r = await db.rpc("sv_deleg_save", { _p: { org_id: org, school_id: kind === "forms" ? null : school, delegate_id: who, kind, form_key: kind === "approve" ? form || null : null, assignment_id: kind === "read" ? asgId : null, starts_at: fromRiyadhInput(st), ends_at: fromRiyadhInput(en), reason: why } });
    if (r.error) throw r.error; toast.success("مُنح التفويض"); onDone(true); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  return <div className="space-y-3 rounded-2xl border bg-card p-4">
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm">نوع التفويض<select className={selectCls("mt-1 w-full")} value={kind} onChange={(e) => { setKind(e.target.value as SvDelegation["kind"]); setWho(""); }}>{Object.entries(DELEG_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {kind !== "forms" && <label className="text-sm">الفرع<select className={selectCls("mt-1 w-full")} value={school} onChange={(e) => { setSchool(e.target.value); setWho(""); }}>{me.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      <label className="text-sm">المفوَّض<select className={selectCls("mt-1 w-full")} value={who} onChange={(e) => setWho(e.target.value)}><option value="">— اختر —</option>{uniq.map((p) => <option key={p.user_id} value={p.user_id}>{p.name} ({ROLE[p.role] ?? p.role})</option>)}</select></label>
      {kind === "approve" && <label className="text-sm">النموذج (اختياري لتضييق النطاق)<select className={selectCls("mt-1 w-full")} value={form} onChange={(e) => setForm(e.target.value)}><option value="">كل النماذج في الفرع</option>{keys.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>}
      {kind === "read" && <label className="text-sm">الإسناد المنتهي<select className={selectCls("mt-1 w-full")} value={asgId} onChange={(e) => setAsg(e.target.value)}><option value="">— اختر —</option>{(asg.data ?? []).filter((a) => a.school_id === school && (a.state === "ended" || a.state === "cancelled")).map((a) => <option key={a.id} value={a.id}>{a.supervisor} — حتى {riyadhText(a.ends_at)}</option>)}</select></label>}
      <label className="text-sm">من (الرياض)<Input className="mt-1" type="datetime-local" value={st} onChange={(e) => setSt(e.target.value)} /></label>
      <label className="text-sm">إلى (الرياض)<Input className="mt-1" type="datetime-local" value={en} onChange={(e) => setEn(e.target.value)} /></label>
    </div>
    <label className="block text-sm">السبب<Input className="mt-1" value={why} onChange={(e) => setWhy(e.target.value)} /></label>
    <div className="flex gap-2"><Button disabled={busy || !who || !en || why.trim().length < 3 || (kind === "read" && !asgId)} onClick={save}>منح التفويض</Button><Button variant="ghost" onClick={() => onDone(false)}>إلغاء</Button></div>
  </div>;
}
