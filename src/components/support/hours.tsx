import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { db } from "@/components/crud-page";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any; // RPC jsonb rows
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

// Branch/department working-hour exceptions and holidays for support targets. All rules (who may edit,
// validation, which hours a ticket uses, skipping holidays) live in support_hours_* / support_holiday_* RPCs.
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const t5 = (v: unknown) => String(v ?? "").slice(0, 5);

export function SupportHoursPanel({ orgId }: { orgId: string }) {
  const list = useQuery({ queryKey: ["support-hours", orgId], queryFn: async () => { const { data, error } = await db.rpc("support_hours_list", { _org: orgId }); if (error) throw error; return data as { hours: Row[]; holidays: Row[] }; } });
  const branches = useQuery({ queryKey: ["support-branches", orgId], queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name")).data ?? []) as Row[] });
  const [h, setH] = useState({ school: "", dept: "", days: [0, 1, 2, 3, 4] as number[], start: "07:00", end: "14:00" });
  const [hol, setHol] = useState({ school: "", from: "", to: "", name: "" });
  const depts = useQuery({ enabled: !!h.school, queryKey: ["support-hours-depts", h.school], queryFn: async () => ((await db.rpc("support_route_departments", { _school: h.school, _ticket: null })).data ?? []) as Row[] });
  const call = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await db.rpc(fn, args);
    if (error) { toast.error(arabicError(error)); return false; }
    toast.success(ok); list.refetch(); return true;
  };
  if (list.isLoading) return <LoadingState />;
  const d = list.data ?? { hours: [], holidays: [] };
  const toggle = (i: number) => setH({ ...h, days: h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i].sort() });
  return (
    <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="ساعات خاصة بفرع أو قسم">
        <p className="font-semibold">ساعات خاصة بفرع أو قسم</p>
        <p className="text-xs text-muted-foreground">تذكرة القسم تتبع ساعات قسمها إن وُجدت، ثم ساعات الفرع، ثم الساعات العامة أعلاه.</p>
        {d.hours.length ? (
          <ul className="space-y-1 text-sm">
            {d.hours.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1" data-testid="hours-row">
                <span><b>{r.school}</b>{r.department ? ` — ${r.department}` : " — كل الأقسام"}: {(r.work_days as number[]).map((i) => DAYS[i]).join("، ")} · {t5(r.work_start)}–{t5(r.work_end)}</span>
                <Button size="sm" variant="ghost" aria-label="حذف" onClick={async () => { if (await ask("حذف هذه الساعات والعودة للساعات العامة؟")) call("support_hours_delete", { _id: r.id }, "حُذفت"); }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">كل الفروع تتبع الساعات العامة.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="الفرع" className={selectCls()} value={h.school} onChange={(e) => setH({ ...h, school: e.target.value, dept: "" })}>
            <option value="">اختر الفرع</option>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select aria-label="القسم" className={selectCls()} value={h.dept} disabled={!h.school} onChange={(e) => setH({ ...h, dept: e.target.value })}>
            <option value="">كل أقسام الفرع</option>{(depts.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((n, i) => <label key={n} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"><input type="checkbox" checked={h.days.includes(i)} onChange={() => toggle(i)} /> {n}</label>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="sh-s">بداية الدوام</Label><Input id="sh-s" type="time" value={h.start} onChange={(e) => setH({ ...h, start: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="sh-e">نهاية الدوام</Label><Input id="sh-e" type="time" value={h.end} onChange={(e) => setH({ ...h, end: e.target.value })} /></div>
        </div>
        <Button variant="outline" disabled={!h.school} onClick={() => call("support_hours_save", { _org: orgId, _school: h.school, _dept: h.dept || null, _days: h.days, _start: h.start, _end: h.end }, "حُفظت ساعات الفرع")}><Plus className="size-4" /> حفظ الساعات الخاصة</Button>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="الإجازات">
        <p className="font-semibold">الإجازات</p>
        <p className="text-xs text-muted-foreground">أيام الإجازة لا تُحتسب في مواعيد الرد والحل للتذاكر الجديدة.</p>
        {d.holidays.length ? (
          <ul className="space-y-1 text-sm">
            {d.holidays.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1" data-testid="holiday-row">
                <span><b>{r.name}</b> · {r.date_from}{r.date_to !== r.date_from ? ` ← ${r.date_to}` : ""} · {r.school ?? "كل الفروع"}</span>
                <Button size="sm" variant="ghost" aria-label="حذف" onClick={async () => { if (await ask(`حذف إجازة «${r.name}»؟`)) call("support_holiday_delete", { _id: r.id }, "حُذفت"); }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">لا إجازات مسجلة.</p>}
        <Input aria-label="اسم الإجازة" placeholder="اسم الإجازة (مثل: إجازة اليوم الوطني)" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="hl-f">من</Label><Input id="hl-f" type="date" value={hol.from} onChange={(e) => setHol({ ...hol, from: e.target.value, to: hol.to || e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="hl-t">إلى</Label><Input id="hl-t" type="date" value={hol.to} onChange={(e) => setHol({ ...hol, to: e.target.value })} /></div>
        </div>
        <select aria-label="نطاق الإجازة" className={selectCls()} value={hol.school} onChange={(e) => setHol({ ...hol, school: e.target.value })}>
          <option value="">كل الفروع</option>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <Button variant="outline" disabled={!hol.from || hol.name.trim().length < 2} onClick={async () => { if (await call("support_holiday_save", { _org: orgId, _school: hol.school || null, _from: hol.from, _to: hol.to || hol.from, _name: hol.name }, "أُضيفت الإجازة")) setHol({ school: "", from: "", to: "", name: "" }); }}><Plus className="size-4" /> إضافة إجازة</Button>
      </section>
    </div>
  );
}
