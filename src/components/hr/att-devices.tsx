import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc, type HrEmp } from "@/components/hr/shared";
import { dtm } from "@/components/hr/attendance";

export type Device = { id: string; name: string; school: string | null; school_id: string | null; serial_no: string | null; is_active: boolean; last_seen: string | null; device_seen: string | null; last_punch_at: string | null; last_received_at: string | null; secret_rotated_at: string | null; unmatched: number };
type Unm = { pin: string; reason: "unknown_pin" | "other_school" | "inactive"; count: number; first_at: string; last_at: string };
type Pin = { pin: string; employee_id: string; employee: string; employee_no: string };
const REASON: Record<Unm["reason"], string> = { unknown_pin: "رقم غير معروف", other_school: "موظف من مدرسة أخرى", inactive: "ملف غير نشط" };

/** Connected = bridge reported within the last 5 minutes. */
export function connState(d: Device): { label: string; cls: string } {
  if (!d.is_active) return { label: "موقوف", cls: "bg-muted text-muted-foreground" };
  if (!d.serial_no || !d.school_id) return { label: "غير مكتمل الإعداد", cls: "bg-warning/15" };
  if (!d.last_seen) return { label: "لم يتصل بعد", cls: "bg-muted text-muted-foreground" };
  return Date.now() - new Date(d.last_seen).getTime() < 5 * 60_000 ? { label: "متصل", cls: "bg-success/10 text-success" } : { label: "منقطع", cls: "bg-destructive/10 text-destructive" };
}

export function DeviceCard({ org, d, schools, onToggle }: { org: string; d: Device; schools: { id: string; name: string }[]; onToggle: () => void }) {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ["hr-att-setup"] }); qc.invalidateQueries({ queryKey: ["hr-att-unm", d.id] }); qc.invalidateQueries({ queryKey: ["hr-att-pins", d.id] }); };
  const err = (e: unknown) => toast.error(arabicError(e));
  const [cfg, setCfg] = useState({ school: d.school_id ?? "", sn: d.serial_no ?? "" });
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<{ id: string; secret: string } | null>(null);
  const save = useMutation({ mutationFn: () => rpc("hr_att_device_config", { _id: d.id, _school: cfg.school || null, _serial: cfg.sn }), onSuccess: () => { toast.success("حُفظ إعداد الجهاز"); inv(); }, onError: err });
  const rot = useMutation({ mutationFn: () => rpc<{ id: string; secret: string }>("hr_att_device_rotate", { _id: d.id }), onSuccess: (r) => { setKey(r); inv(); }, onError: err });
  const unm = useQuery({ enabled: open, queryKey: ["hr-att-unm", d.id], queryFn: () => rpc<Unm[]>("hr_att_unmatched_list", { _dev: d.id }) });
  const pins = useQuery({ enabled: open, queryKey: ["hr-att-pins", d.id], queryFn: () => rpc<Pin[]>("hr_att_device_pins_list", { _dev: d.id }) });
  const emps = useQuery({ enabled: open, queryKey: ["hr-list", org, d.school_id ?? "", "", "active"], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: d.school_id, _q: null, _status: "active" }) });
  const [pick, setPick] = useState<Record<string, string>>({});
  const link = useMutation({ mutationFn: (a: { pin: string; emp: string }) => rpc<{ moved: number }>("hr_att_pin_link", { _dev: d.id, _pin: a.pin, _emp: a.emp }), onSuccess: (r) => { toast.success(`رُبط الرقم ونُقلت ${r.moved} حركة إلى ملف الموظف`); inv(); }, onError: err });
  const dis = useMutation({ mutationFn: (a: { pin: string; reason: string }) => rpc("hr_att_unmatched_dismiss", { _dev: d.id, _pin: a.pin, _reason: a.reason }), onSuccess: () => { toast.success("أُغلقت السجلات"); inv(); }, onError: err });
  const unl = useMutation({ mutationFn: (pin: string) => rpc("hr_att_pin_unlink", { _dev: d.id, _pin: pin }), onSuccess: inv, onError: err });
  const st = connState(d);
  return (
    <li className="rounded-xl border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b className="flex-1">{d.name}</b>
        <span className={"rounded px-1.5 text-xs " + st.cls}>{st.label}</span>
        {d.unmatched > 0 && <span className="rounded bg-warning/15 px-1.5 text-xs">{d.unmatched} رقم غير مطابق</span>}
        <Button size="sm" variant="ghost" onClick={onToggle}>{d.is_active ? "إيقاف" : "تفعيل"}</Button>
      </div>
      <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
        <div><dt className="inline">آخر اتصال: </dt><dd className="inline">{d.last_seen ? dtm(d.last_seen) : "—"}</dd></div>
        <div><dt className="inline">آخر اتصال بالجهاز نفسه: </dt><dd className="inline">{d.device_seen ? dtm(d.device_seen) : "—"}</dd></div>
        <div><dt className="inline">آخر سجل وصل: </dt><dd className="inline">{d.last_punch_at ? dtm(d.last_punch_at) : "—"}</dd></div>
      </dl>
      <form className="mt-2 grid gap-2 sm:flex sm:flex-wrap sm:items-end" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
        <div><Label htmlFor={`ds-${d.id}`}>المدرسة</Label><select id={`ds-${d.id}`} className={selectCls("mt-1 w-full sm:w-48")} value={cfg.school} onChange={(e) => setCfg({ ...cfg, school: e.target.value })}><option value="">— اختر —</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><Label htmlFor={`dn-${d.id}`}>الرقم التسلسلي (SN)</Label><Input id={`dn-${d.id}`} dir="ltr" className="mt-1 w-full font-mono sm:w-48" value={cfg.sn} onChange={(e) => setCfg({ ...cfg, sn: e.target.value.toUpperCase() })} /></div>
        <Button size="sm" type="submit" disabled={save.isPending}>حفظ</Button>
        <Button size="sm" type="button" variant="outline" disabled={rot.isPending} onClick={() => rot.mutate()}>مفتاح ربط جديد</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(!open)}>{open ? "إخفاء" : "مطابقة أرقام الجهاز"}</Button>
      </form>
      {key && <div className="mt-2 rounded-lg border border-warning bg-warning/10 p-2 text-xs"><p>انسخها الآن إلى برنامج الربط؛ لن يظهر المفتاح مرة أخرى، والمفتاح السابق توقف.</p><p dir="ltr" className="break-all font-mono">DEVICE_ID={key.id}<br />DEVICE_SECRET={key.secret}<br />DEVICE_SN={cfg.sn || "?"}</p><Button size="sm" variant="ghost" onClick={() => setKey(null)}>تم</Button></div>}
      {d.secret_rotated_at && !key && <p className="mt-1 text-xs text-muted-foreground">آخر تغيير للمفتاح: {dtm(d.secret_rotated_at)}</p>}
      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <h4 className="text-xs font-bold">سجلات غير مطابقة</h4>
            {(unm.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">لا توجد. الرقم في الجهاز يطابق رقم الموظف في ركاز تلقائيًا.</p> : (
              <ul className="mt-1 space-y-1">{unm.data!.map((u) => (
                <li key={u.pin} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-2 text-xs">
                  <span className="font-mono" dir="ltr">#{u.pin}</span><span>{REASON[u.reason]} · {u.count} حركة · آخرها {dtm(u.last_at)}</span>
                  <select aria-label={`موظف الرقم ${u.pin}`} className={selectCls("w-48")} value={pick[u.pin] ?? ""} onChange={(e) => setPick({ ...pick, [u.pin]: e.target.value })}>
                    <option value="">اختر الموظف…</option>{(emps.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}</select>
                  <Button size="sm" disabled={!pick[u.pin] || link.isPending} onClick={() => link.mutate({ pin: u.pin, emp: pick[u.pin]! })}>ربط ونقل الحركات</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب تجاهل سجلات هذا الرقم", { required: true }); if (r) dis.mutate({ pin: u.pin, reason: r }); }}>تجاهل</Button>
                </li>))}</ul>)}
          </div>
          <div>
            <h4 className="text-xs font-bold">أرقام مربوطة يدويًا</h4>
            {(pins.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">لا توجد.</p> : <ul className="mt-1 flex flex-wrap gap-2">{pins.data!.map((p) => (
              <li key={p.pin} className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs"><span dir="ltr" className="font-mono">#{p.pin}</span>← {p.employee}<button type="button" className="text-destructive" onClick={() => unl.mutate(p.pin)}>فك</button></li>))}</ul>}
          </div>
        </div>
      )}
    </li>
  );
}
