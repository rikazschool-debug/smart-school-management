import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { PageHeader, ForbiddenState, LoadingState, EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { XbranchSettings } from "@/components/comm/xbranch";

export const Route = createFileRoute("/_authenticated/app/chat-settings")({
  component: Page,
  head: () => ({ meta: [{ title: "ضبط المحادثات — ركاز" }, { name: "description", content: "الردود المحفوظة والردود الآلية وإعدادات الصوتيات والمرفقات" }] }),
});

type Reply = { id: string; title: string; shortcut: string; body: string; roles: string[]; active: boolean };
type Rule = { id: string; kind: "welcome" | "off_hours"; name: string; body: string; school_ids: string[]; recipient_roles: string[]; priority: number; cooldown_hours: number; hours: { days: number[]; start: string; end: string }; sender_label: string; active: boolean; runs: number };
type Admin = {
  caps: { replies: boolean; autoreply: boolean; media: boolean };
  settings: { voice_enabled: boolean; voice_max_sec: number; voice_max_bytes: number; attachments_enabled: boolean };
  replies: Reply[]; rules: Rule[]; schools: { id: string; name: string }[];
  log: { at: string; entity: string; action: string; actor: string }[]; runs: { at: string; rule: string; result: string }[];
};
const ROLE_KEYS = ["principal", "vice_principal", "dept_head", "supervisor", "student_affairs", "teacher", "counselor", "nurse", "security", "guardian", "student"] as const;
const STAFF_ROLES = ["org_owner", "principal", "vice_principal", "dept_head", "supervisor", "student_affairs", "teacher", "counselor", "nurse", "security"] as const;
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const ENT: Record<string, string> = { settings: "إعدادات الصوت والمرفقات", reply: "رد محفوظ", rule: "رد آلي" };
const roleLabel = (r: string) => r === "all" ? "الجميع" : (ROLE_LABELS as Record<string, string>)[r] ?? r;

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const q = useQuery({ enabled: !!org, queryKey: ["cs-admin", org], queryFn: async () => { const { data, error } = await db.rpc("cs_admin", { _org: org }); if (error) throw error; return data as Admin; } });
  if (!active) return <ForbiddenState />;
  if (!org) return <EmptyState title="اختر مدرسة من شريط السياق أولًا" />;
  if (q.isLoading) return <LoadingState />;
  if (q.error) return /صلاحية/.test(arabicError(q.error)) ? <ForbiddenState /> : <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <>
      <PageHeader title="ضبط المحادثات" desc="إعدادات مؤسستك فقط. هذه الصلاحية لا تتيح قراءة المحادثات الخاصة أو ملفاتها." />
      <div className="space-y-6">
        {active.role === "org_owner" && <XbranchSettings orgId={org} />}
        <Media org={org} d={d} />
        <Replies org={org} d={d} />
        <Rules org={org} d={d} />
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-bold">سجل تغييرات الإعدادات</h2>
          {d.log.length ? <ul className="divide-y text-sm">{d.log.map((l, i) => <li key={i} className="flex flex-wrap gap-2 py-1.5"><span>{ENT[l.entity] ?? l.entity}</span><span className="text-muted-foreground">{l.action === "create" ? "إضافة" : "تعديل"}</span><span className="ms-auto text-xs text-muted-foreground">{l.actor} · {new Date(l.at).toLocaleString("ar-SA")}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">لا تغييرات بعد.</p>}
        </section>
      </div>
    </>
  );
}

function useRefresh(org: string) { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["cs-admin", org] }); }

function Media({ org, d }: { org: string; d: Admin }) {
  const refresh = useRefresh(org);
  const [s, setS] = useState({ voice: d.settings.voice_enabled, sec: d.settings.voice_max_sec, mb: +(d.settings.voice_max_bytes / 1048576).toFixed(1), att: d.settings.attachments_enabled });
  const can = d.caps.media;
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 font-bold">الرسائل الصوتية والمرفقات</h2>
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await db.rpc("cs_settings_save", { _org: org, _voice: s.voice, _max_sec: s.sec, _max_mb: s.mb, _attach: s.att });
        if (error) toast.error(arabicError(error)); else { toast.success("حُفظت الإعدادات"); refresh(); }
      }}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" disabled={!can} checked={s.voice} onChange={(e) => setS({ ...s, voice: e.target.checked })} />تفعيل الرسائل الصوتية</label>
        <div><Label htmlFor="cs-sec">أقصى مدة (ثانية)</Label><Input id="cs-sec" type="number" min={5} max={600} disabled={!can} value={s.sec} onChange={(e) => setS({ ...s, sec: Number(e.target.value) })} /></div>
        <div><Label htmlFor="cs-mb">أقصى حجم (م.ب)</Label><Input id="cs-mb" type="number" step="0.1" min={0.1} max={20} disabled={!can} value={s.mb} onChange={(e) => setS({ ...s, mb: Number(e.target.value) })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" disabled={!can} checked={s.att} onChange={(e) => setS({ ...s, att: e.target.checked })} />السماح بالمرفقات</label>
        {can && <div className="sm:col-span-4"><Button size="sm">حفظ</Button></div>}
      </form>
    </section>
  );
}

function RoleChecks({ value, onChange, keys, allOpt }: { value: string[]; onChange: (v: string[]) => void; keys: readonly string[]; allOpt?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {allOpt && <label className="flex items-center gap-1 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={value.includes("all")} onChange={(e) => onChange(e.target.checked ? ["all"] : [])} />جميع الفئات</label>}
      {!value.includes("all") && keys.map((k) => <label key={k} className="flex items-center gap-1 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />{roleLabel(k)}</label>)}
    </div>
  );
}

function Replies({ org, d }: { org: string; d: Admin }) {
  const refresh = useRefresh(org);
  const [x, setX] = useState<Partial<Reply> | null>(null);
  async function save(r: Partial<Reply>) {
    const { error } = await db.rpc("cs_reply_save", { _org: org, _id: r.id ?? null, _title: r.title ?? "", _shortcut: r.shortcut ?? "", _body: r.body ?? "", _roles: r.roles ?? [], _active: r.active ?? true });
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظ الرد"); setX(null); refresh();
  }
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2"><h2 className="font-bold">الردود المحفوظة</h2><span className="text-xs text-muted-foreground">يكتب المستخدم / في مربع الرسالة لاختيارها</span>
        {d.caps.replies && !x && <Button size="sm" className="ms-auto" onClick={() => setX({ roles: ["all"], active: true })}>+ رد جديد</Button>}</div>
      {x && (
        <form className="mb-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(x); }}>
          <div><Label htmlFor="r-t">العنوان</Label><Input id="r-t" maxLength={80} value={x.title ?? ""} onChange={(e) => setX({ ...x, title: e.target.value })} /></div>
          <div><Label htmlFor="r-s">الاختصار (فريد داخل المؤسسة)</Label><Input id="r-s" dir="ltr" maxLength={30} value={x.shortcut ?? ""} onChange={(e) => setX({ ...x, shortcut: e.target.value.replace(/\s/g, "") })} placeholder="welcome" /></div>
          <div className="sm:col-span-2"><Label htmlFor="r-b">نص الرد (نص عادي فقط)</Label><Textarea id="r-b" maxLength={2000} value={x.body ?? ""} onChange={(e) => setX({ ...x, body: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">اكتب <b>{"{الاسم}"}</b> ليُستبدل باسم الموظف المرسِل، أو <b>{"{الاسم_الأول}"}</b> لاسمه الأول فقط. مثال: «حياك الله ✨ معك {"{الاسم}"} وأنا استلمت محادثتك الآن».</p></div>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">الفئات التي تستخدمه</legend><RoleChecks allOpt value={x.roles ?? []} onChange={(v) => setX({ ...x, roles: v })} keys={["org_owner", ...ROLE_KEYS]} /></fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={x.active ?? true} onChange={(e) => setX({ ...x, active: e.target.checked })} />نشط</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setX(null)}>إلغاء</Button><Button>حفظ</Button></div>
        </form>
      )}
      <ul className="divide-y">
        {d.replies.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="font-semibold">{r.title}</span><span dir="ltr" className="text-xs text-muted-foreground">/{r.shortcut}</span>
            {!r.active && <span className="rounded bg-muted px-1.5 text-xs">معطل</span>}
            <span className="flex-1 truncate text-xs text-muted-foreground">{r.roles.map(roleLabel).join("، ")}</span>
            {d.caps.replies && <><Button size="sm" variant="ghost" onClick={() => setX(r)}>تعديل</Button><Button size="sm" variant="ghost" onClick={() => void save({ ...r, active: !r.active })}>{r.active ? "تعطيل" : "تفعيل"}</Button></>}
          </li>
        ))}
        {!d.replies.length && <li className="py-2 text-sm text-muted-foreground">لا ردود محفوظة بعد.</li>}
      </ul>
    </section>
  );
}

function Rules({ org, d }: { org: string; d: Admin }) {
  const refresh = useRefresh(org);
  const blank: Partial<Rule> = { kind: "welcome", school_ids: [], recipient_roles: [], priority: 100, cooldown_hours: 12, hours: { days: [0, 1, 2, 3, 4], start: "07:00", end: "14:00" }, sender_label: "رد آلي — إدارة المدرسة", active: false };
  const [x, setX] = useState<Partial<Rule> | null>(null);
  const [pv, setPv] = useState({ school: d.schools[0]?.id ?? "", role: "principal", first: true, at: "" });
  const [pvRes, setPvRes] = useState<{ match: boolean; rule?: string; label?: string; body?: string } | null>(null);
  async function save(r: Partial<Rule>) {
    const { error } = await db.rpc("cs_rule_save", { _org: org, _id: r.id ?? null, _kind: r.kind, _name: r.name ?? "", _body: r.body ?? "", _schools: r.school_ids ?? [], _roles: r.recipient_roles ?? [],
      _priority: r.priority ?? 100, _cooldown: r.cooldown_hours ?? 12, _hours: r.hours ?? {}, _label: r.sender_label ?? "", _active: r.active ?? false });
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظت القاعدة"); setX(null); refresh();
  }
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2"><h2 className="font-bold">الرد الآلي</h2><span className="text-xs text-muted-foreground">للمحادثات الخاصة فقط، متوقف افتراضيًا، ولا يعمل بأثر رجعي</span>
        {d.caps.autoreply && !x && <Button size="sm" className="ms-auto" onClick={() => setX(blank)}>+ قاعدة جديدة</Button>}</div>
      {x && (
        <form className="mb-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(x); }}>
          <div><Label htmlFor="a-n">اسم القاعدة</Label><Input id="a-n" maxLength={80} value={x.name ?? ""} onChange={(e) => setX({ ...x, name: e.target.value })} /></div>
          <div><Label htmlFor="a-k">النوع</Label><select id="a-k" className={selectCls("mt-1 w-full")} value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value as Rule["kind"] })}><option value="welcome">رسالة استقبال لمحادثة خاصة جديدة</option><option value="off_hours">رسالة خارج ساعات العمل</option></select></div>
          <div className="sm:col-span-2"><Label htmlFor="a-b">نص الرد</Label><Textarea id="a-b" maxLength={1000} value={x.body ?? ""} onChange={(e) => setX({ ...x, body: e.target.value })} /></div>
          <div><Label htmlFor="a-l">الاسم الظاهر</Label><Input id="a-l" maxLength={60} value={x.sender_label ?? ""} onChange={(e) => setX({ ...x, sender_label: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="a-p">الأولوية (الأصغر أولًا)</Label><Input id="a-p" type="number" value={x.priority ?? 100} onChange={(e) => setX({ ...x, priority: Number(e.target.value) })} /></div>
            <div><Label htmlFor="a-c">مهلة التكرار (ساعة)</Label><Input id="a-c" type="number" min={1} max={720} value={x.cooldown_hours ?? 12} onChange={(e) => setX({ ...x, cooldown_hours: Number(e.target.value) })} /></div></div>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">المدارس (بلا تحديد = الكل)</legend>
            <div className="flex flex-wrap gap-3">{d.schools.map((s) => <label key={s.id} className="flex items-center gap-1 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={x.school_ids?.includes(s.id) ?? false} onChange={(e) => setX({ ...x, school_ids: e.target.checked ? [...(x.school_ids ?? []), s.id] : (x.school_ids ?? []).filter((y) => y !== s.id) })} />{s.name}</label>)}</div></fieldset>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">الجهة المستقبلة (بلا تحديد = كل الموظفين)</legend><RoleChecks value={x.recipient_roles ?? []} onChange={(v) => setX({ ...x, recipient_roles: v })} keys={STAFF_ROLES} /></fieldset>
          {x.kind === "off_hours" && (
            <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">ساعات العمل (توقيت الرياض)</legend>
              <div className="flex flex-wrap items-center gap-3">
                {DAYS.map((n, i) => <label key={i} className="flex items-center gap-1 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={x.hours?.days.includes(i) ?? false} onChange={(e) => setX({ ...x, hours: { ...x.hours!, days: e.target.checked ? [...x.hours!.days, i] : x.hours!.days.filter((y) => y !== i) } })} />{n}</label>)}
                <Input aria-label="بداية الدوام" type="time" className="w-32" value={x.hours?.start ?? "07:00"} onChange={(e) => setX({ ...x, hours: { ...x.hours!, start: e.target.value } })} />
                <Input aria-label="نهاية الدوام" type="time" className="w-32" value={x.hours?.end ?? "14:00"} onChange={(e) => setX({ ...x, hours: { ...x.hours!, end: e.target.value } })} />
              </div></fieldset>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={x.active ?? false} onChange={(e) => setX({ ...x, active: e.target.checked })} />مفعّلة</label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setX(null)}>إلغاء</Button><Button>حفظ</Button></div>
        </form>
      )}
      <ul className="divide-y">
        {d.rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="font-semibold">{r.name}</span><span className="text-xs text-muted-foreground">{r.kind === "welcome" ? "استقبال" : "خارج الدوام"} · أولوية {r.priority} · {r.runs} تشغيل</span>
            <span className={`rounded px-1.5 text-xs ${r.active ? "bg-primary/15 text-primary" : "bg-muted"}`}>{r.active ? "مفعّلة" : "متوقفة"}</span>
            {d.caps.autoreply && <span className="ms-auto flex gap-1"><Button size="sm" variant="ghost" onClick={() => setX(r)}>تعديل</Button><Button size="sm" variant="ghost" onClick={() => void save({ ...r, active: !r.active })}>{r.active ? "إيقاف" : "تفعيل"}</Button></span>}
          </li>
        ))}
        {!d.rules.length && <li className="py-2 text-sm text-muted-foreground">لا قواعد بعد — الرد الآلي متوقف.</li>}
      </ul>
      {d.caps.autoreply && d.rules.length > 0 && (
        <div className="mt-4 rounded-lg border bg-muted/30 p-3">
          <h3 className="mb-2 text-sm font-bold">تجربة القواعد (لا تُرسل أي رسالة)</h3>
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="المدرسة" className={selectCls()} value={pv.school} onChange={(e) => setPv({ ...pv, school: e.target.value })}>{d.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select aria-label="الجهة المستقبلة" className={selectCls()} value={pv.role} onChange={(e) => setPv({ ...pv, role: e.target.value })}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={pv.first} onChange={(e) => setPv({ ...pv, first: e.target.checked })} />أول رسالة في المحادثة</label>
            <Input aria-label="وقت التجربة" type="datetime-local" className="w-56" value={pv.at} onChange={(e) => setPv({ ...pv, at: e.target.value })} />
            <Button size="sm" variant="outline" onClick={async () => {
              const { data, error } = await db.rpc("cs_rule_preview", { _org: org, _school: pv.school, _role: pv.role, _first: pv.first, _at: pv.at ? new Date(pv.at).toISOString() : null });
              if (error) toast.error(arabicError(error)); else setPvRes(data);
            }}>تجربة</Button>
          </div>
          {pvRes && <p className="mt-2 text-sm">{pvRes.match ? <>تنطبق «{pvRes.rule}» — يظهر باسم «{pvRes.label}»: <span className="text-muted-foreground">{pvRes.body}</span></> : "لا تنطبق أي قاعدة مفعّلة."}</p>}
        </div>
      )}
      {d.runs.length > 0 && (
        <div className="mt-4"><h3 className="mb-1 text-sm font-bold">آخر التشغيلات</h3>
          <ul className="text-xs text-muted-foreground">{d.runs.map((r, i) => <li key={i}>{new Date(r.at).toLocaleString("ar-SA")} — {r.rule}: {r.result === "sent" ? "أُرسل" : r.result}</li>)}</ul></div>
      )}
    </section>
  );
}
