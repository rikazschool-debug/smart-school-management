// ADMS bridge copy: the bridge (attendance.kalmalki.com) owns organizations/sites/devices; this screen only links its
// sites to Rikaz branches or administrative locations, reviews old devices explicitly and maps device PINs to employees.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc, type HrEmp } from "@/components/hr/shared";
import { dtm } from "@/components/hr/attendance";
import { admsSyncNow } from "@/lib/adms.functions";

type Site = { id: string; name: string; mode: string; active: boolean; removed: boolean; school_id: string | null; admin_site_id: string | null; linked_at: string | null };
type Dev = { id: string; site_id: string; name: string; serial_no: string; model: string; active: boolean; removed: boolean; last_contact_at: string | null; last_punch_at: string | null; legacy_device_id: string | null; unmatched: number; pins: number };
type Overview = {
  bound: boolean; bridge_org_id: string | null; cursor: number | null; last_health_at: string | null; last_sync_at: string | null; last_sync_items: number | null;
  last_error: string | null; last_error_at: string | null; processing_enabled: boolean; states: Record<string, number>;
  schools: { id: string; name: string }[]; admin_sites: { id: string; name: string; is_active: boolean }[];
  legacy_devices: { id: string; name: string; serial_no: string | null; linked: boolean }[]; sites: Site[]; devices: Dev[];
};
const SYNC_MSG: Record<string, string> = {
  not_configured: "لم تُجهَّز مفاتيح القراءة لهذه المؤسسة على خادم ركاز بعد.", not_installed: "قاعدة بيانات التكامل لم تُطبَّق بعد.", forbidden: "غير مصرح.",
  health_org_mismatch: "الجسر أعاد مؤسسة مختلفة عن المربوطة؛ أُوقفت المزامنة.", base_url_not_https: "عنوان الجسر يجب أن يكون HTTPS.",
};
const STATE: Record<string, string> = { stored: "بانتظار المعالجة", device_unknown: "جهاز لم يُزامَن", withdrawn: "مسحوب من الجسر", site_unlinked: "موقع غير مربوط", unmatched: "رقم غير مطابق", employee_review: "مراجعة موظف", time_review: "وقت خارج السياسة", processed: "عولجت", late: "بعد إغلاق اليوم", dismissed: "مستبعدة" };
const notInstalled = (e: unknown) => (e as { code?: string } | null)?.code === "PGRST202";

function status(active: boolean, removed: boolean) {
  if (removed) return <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">مسحوب من الجسر</span>;
  return active ? <span className="rounded bg-success/10 px-1.5 text-xs text-success">مفعّل في الجسر</span> : <span className="rounded bg-warning/15 px-1.5 text-xs">معطّل في الجسر</span>;
}

export function AdmsBridge({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["adms-ov", org],
    retry: false,
    queryFn: () => rpc<Overview>("adms_overview", { _org: org }),
  });
  const inv = () => qc.invalidateQueries({ queryKey: ["adms-ov", org] });
  const err = (e: unknown) => toast.error(arabicError(e));
  const syncFn = useServerFn(admsSyncNow);
  const sync = useMutation({
    mutationFn: () => syncFn({ data: { org } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`طُبّقت ${r.items} تغييرات من الجسر`);
      else toast.error(SYNC_MSG[r.code] ?? `تعذّرت المزامنة (${r.code})`);
      inv();
    },
    onError: err,
  });
  const link = useMutation({
    mutationFn: (a: { site: string; v: string }) =>
      rpc("adms_site_link", {
        _site: a.site,
        _school: a.v.startsWith("s:") ? a.v.slice(2) : null,
        _admin_site: a.v.startsWith("a:") ? a.v.slice(2) : null,
      }),
    onSuccess: () => {
      toast.success("حُفظ ربط الموقع");
      inv();
    },
    onError: err,
  });
  const [adm, setAdm] = useState("");
  const [eventsPage, setEventsPage] = useState(0);
  type RawEvents = {
    total: number;
    rows: {
      event_id: string;
      device_name: string;
      device_pin: string;
      raw_device_time: string;
      received_at: string;
      state: string;
      receipt_id: string;
      quality: string;
    }[];
  };
  const raw = useQuery({
    queryKey: ["adms-events", org, eventsPage],
    enabled: !!q.data,
    queryFn: () =>
      rpc<RawEvents>("adms_events_list", {
        _org: org,
        _device: null,
        _offset: eventsPage * 30,
        _limit: 30,
      }),
    refetchInterval: 30000,
  });
  const addAdm = useMutation({
    mutationFn: () =>
      rpc("adms_admin_site_save", { _org: org, _id: null, _name: adm, _active: true }),
    onSuccess: () => {
      setAdm("");
      inv();
    },
    onError: err,
  });
  const legacy = useMutation({
    mutationFn: (a: { dev: string; legacy: string | null }) =>
      rpc("adms_device_legacy_link", { _device: a.dev, _legacy: a.legacy }),
    onSuccess: () => {
      toast.success("حُفظ ربط الجهاز القديم");
      inv();
    },
    onError: err,
  });

  if (q.isLoading)
    return <p className="mt-3 text-sm text-muted-foreground">جارٍ تحميل أجهزة الجسر…</p>;
  if (q.error)
    return (
      <div className="mt-3 rounded-xl border border-dashed p-3 text-sm">
        <h3 className="font-bold">أجهزة جسر الحضور (ADMS)</h3>
        <p className="mt-1 text-muted-foreground">
          {notInstalled(q.error)
            ? "التكامل الجديد مُجهّز وغير مفعّل: لم تُطبَّق قاعدة بياناته بعد، ولا يُستقبل أي حضور منه."
            : arabicError(q.error)}
        </p>
      </div>
    );
  const o = q.data!;
  const siteName = (id: string) => o.sites.find((s) => s.id === id)?.name ?? "موقع غير مزامن";
  return (
    <div className="mt-3 space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-sm font-bold">أجهزة جسر الحضور (ADMS)</h3>
        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
          <RefreshCw className="size-4" />
          مزامنة الآن
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        المؤسسات والمواقع والأجهزة تُدار في لوحة الجسر فقط. هنا تربط مواقعه بفروع ركاز أو مواقع
        إدارية وتطابق أرقام الأجهزة بالموظفين. حضور الجوال والموقع الجغرافي مستقل ولا يتأثر.
      </p>
      <dl className="grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="inline text-muted-foreground">مؤسسة الجسر: </dt>
          <dd className="inline font-mono" dir="ltr">
            {o.bridge_org_id ?? "غير مربوطة"}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">آخر تطبيق ناجح في ركاز: </dt>
          <dd className="inline">
            {o.last_sync_at
              ? `${dtm(o.last_sync_at)} · ${o.last_sync_items ?? 0} تغيير · المؤشر ${o.cursor}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">آخر خطأ في ركاز: </dt>
          <dd className="inline">
            {o.last_error ? (
              <>
                <span dir="ltr" className="font-mono">
                  {o.last_error}
                </span>{" "}
                · {dtm(o.last_error_at!)}
              </>
            ) : (
              "لا يوجد"
            )}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">معالجة الحضور من الجسر: </dt>
          <dd className="inline">{o.processing_enabled ? "مفعّلة" : "متوقفة"}</dd>
        </div>
      </dl>
      {Object.keys(o.states).length > 0 && (
        <p className="flex flex-wrap gap-1 text-xs">
          {Object.entries(o.states).map(([k, n]) => (
            <span key={k} className="rounded bg-secondary px-1.5">
              {STATE[k] ?? k}: {n}
            </span>
          ))}
        </p>
      )}

      <section>
        <h4 className="text-xs font-bold">مواقع الجسر وربطها</h4>
        {o.sites.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا توجد مواقع بعد. سجّل الموقع في لوحة الجسر ثم اضغط «مزامنة الآن».
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {o.sites.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-2 text-sm"
              >
                <span className="flex-1 font-semibold">{s.name}</span>
                {status(s.active, s.removed)}
                <select
                  aria-label={`ربط ${s.name}`}
                  className={selectCls("w-full sm:w-56")}
                  value={
                    s.school_id ? "s:" + s.school_id : s.admin_site_id ? "a:" + s.admin_site_id : ""
                  }
                  disabled={link.isPending}
                  onChange={async (e) => {
                    const v = e.target.value;
                    if (await ask("تغيير ربط الموقع لا يغيّر الحركات المعالجة سابقًا. متابعة؟"))
                      link.mutate({ site: s.id, v });
                  }}
                >
                  <option value="">— غير مربوط —</option>
                  <optgroup label="الفروع">
                    {o.schools.map((x) => (
                      <option key={x.id} value={"s:" + x.id}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="مواقع إدارية">
                    {o.admin_sites
                      .filter((x) => x.is_active)
                      .map((x) => (
                        <option key={x.id} value={"a:" + x.id}>
                          {x.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adm.trim() && !addAdm.isPending) addAdm.mutate();
          }}
        >
          <Input
            aria-label="اسم موقع إداري"
            placeholder="موقع إداري جديد (بلا مدرسة)"
            className="w-full sm:w-64"
            value={adm}
            onChange={(e) => setAdm(e.target.value)}
          />
          <Button size="sm" type="submit" variant="outline" disabled={addAdm.isPending}>
            إضافة موقع إداري
          </Button>
        </form>
      </section>

      <section>
        <h4 className="text-xs font-bold">أجهزة الجسر</h4>
        {o.devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد أجهزة بعد.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {o.devices.map((d) => (
              <li key={d.id} className="rounded-xl border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="flex-1">{d.name}</b>
                  {status(d.active, d.removed)}
                  {d.unmatched > 0 && (
                    <span className="rounded bg-warning/15 px-1.5 text-xs">
                      {d.unmatched} رقم غير مطابق
                    </span>
                  )}
                </div>
                <dl className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <div>
                    <dt className="inline">SN: </dt>
                    <dd className="inline font-mono" dir="ltr">
                      {d.serial_no}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">الموقع: </dt>
                    <dd className="inline">{siteName(d.site_id)}</dd>
                  </div>
                  <div>
                    <dt className="inline">آخر اتصال موثّق: </dt>
                    <dd className="inline">{d.last_contact_at ? dtm(d.last_contact_at) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline">آخر حركة خام: </dt>
                    <dd className="inline">{d.last_punch_at ? dtm(d.last_punch_at) : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <label htmlFor={`lg-${d.id}`}>جهاز قديم في ركاز (ربط صريح للمراجعة):</label>
                  <select
                    id={`lg-${d.id}`}
                    className={selectCls("w-full sm:w-56")}
                    value={d.legacy_device_id ?? ""}
                    disabled={legacy.isPending}
                    onChange={async (e) => {
                      const v = e.target.value || null;
                      if (
                        await ask(
                          v
                            ? "ربط هذا الجهاز بالجهاز القديم المختار؟ لا تُدمج السجلات القديمة."
                            : "إلغاء ربط الجهاز القديم؟",
                        )
                      )
                        legacy.mutate({ dev: d.id, legacy: v });
                    }}
                  >
                    <option value="">— لا يوجد —</option>
                    {o.legacy_devices
                      .filter((x) => !x.linked || x.id === d.legacy_device_id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                          {x.serial_no ? ` (${x.serial_no})` : ""}
                        </option>
                      ))}
                  </select>
                </div>
                <DevicePins
                  org={org}
                  d={d}
                  school={o.sites.find((s) => s.id === d.site_id)?.school_id ?? null}
                  onChange={inv}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2 border-t pt-3">
        <h4 className="text-sm font-bold">الحركات الخام المحفوظة في ركاز</h4>
        <p className="text-xs text-muted-foreground">
          ظهور الحركة بإيصال يعني حفظها في ركاز، ولا يعني احتسابها حضورًا أو راتبًا. المعالجة
          مستقلة، ومطابقة رقم الجهاز بالموظف صريحة. أرشيف التجربة المعزول لا يُنقل إلى هنا.
        </p>
        {raw.isLoading ? (
          <p className="text-xs">جارٍ القراءة…</p>
        ) : raw.error ? (
          <p className="text-xs text-destructive">{arabicError(raw.error)}</p>
        ) : !raw.data?.rows.length ? (
          <p className="text-xs text-muted-foreground">
            لا توجد حركات مستقبلة على هذه الصفحة؛ لا يوجد اتصال أو حضور افتراضي.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr>
                  {[
                    "الجهاز",
                    "رقم المستخدم",
                    "وقت الجهاز",
                    "الحفظ في ركاز",
                    "الحالة",
                    "الإيصال",
                  ].map((h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {raw.data.rows.map((e) => (
                  <tr key={e.event_id} className="border-t">
                    <td className="p-2">{e.device_name}</td>
                    <td dir="ltr" className="p-2">
                      {e.device_pin}
                    </td>
                    <td dir="ltr" className="p-2">
                      {e.raw_device_time}
                    </td>
                    <td className="p-2">{dtm(e.received_at)}</td>
                    <td className="p-2">{STATE[e.state] ?? e.state}</td>
                    <td dir="ltr" className="max-w-40 truncate p-2" title={e.receipt_id}>
                      {e.receipt_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            disabled={eventsPage === 0}
            onClick={() => setEventsPage((p) => p - 1)}
          >
            السابق
          </Button>
          <span>
            {raw.data?.total ?? 0} حركة · صفحة {eventsPage + 1}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={(eventsPage + 1) * 30 >= (raw.data?.total ?? 0)}
            onClick={() => setEventsPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      </section>
    </div>
  );
}

type Unm = { pin: string; count: number; first_at: string; last_at: string; suggest: { id: string; name: string; employee_no: string } | null };
type Pin = { pin: string; employee_id: string; employee: string; employee_no: string };
function DevicePins({ org, d, school, onChange }: { org: string; d: Dev; school: string | null; onChange: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const unm = useQuery({ enabled: open, queryKey: ["adms-unm", d.id], queryFn: () => rpc<Unm[]>("adms_unmatched_list", { _device: d.id }) });
  const pins = useQuery({ enabled: open, queryKey: ["adms-pins", d.id], queryFn: () => rpc<Pin[]>("adms_pins_list", { _device: d.id }) });
  const emps = useQuery({ enabled: open, queryKey: ["hr-list", org, school ?? "", "", "active"], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: school, _q: null, _status: "active" }) });
  const inv = () => { qc.invalidateQueries({ queryKey: ["adms-unm", d.id] }); qc.invalidateQueries({ queryKey: ["adms-pins", d.id] }); onChange(); };
  const err = (e: unknown) => toast.error(arabicError(e));
  const link = useMutation({ mutationFn: (a: { pin: string; emp: string }) => rpc<{ requeued: number }>("adms_pin_link", { _device: d.id, _pin: a.pin, _emp: a.emp }), onSuccess: (r) => { toast.success(`رُبط الرقم وأُعيدت ${r.requeued} حركة للمعالجة`); inv(); }, onError: err });
  const unl = useMutation({ mutationFn: (pin: string) => rpc("adms_pin_unlink", { _device: d.id, _pin: pin }), onSuccess: inv, onError: err });
  return (
    <div className="mt-2">
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "إخفاء المطابقة" : `مطابقة أرقام الجهاز (${d.pins} مربوط)`}</Button>
      {open && (
        <div className="mt-2 space-y-3">
          <div>
            <h5 className="text-xs font-bold">أرقام غير مطابقة</h5>
            {(unm.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">لا توجد. لا يُطابَق أي رقم تلقائيًا؛ الربط هنا صريح لكل جهاز.</p> : (
              <ul className="mt-1 space-y-1">{unm.data!.map((u) => (
                <li key={u.pin} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-2 text-xs">
                  <span className="font-mono" dir="ltr">#{u.pin}</span><span>{u.count} حركة · آخرها {dtm(u.last_at)}</span>
                  {u.suggest && !pick[u.pin] && <button type="button" className="rounded border px-1.5 hover:border-primary" onClick={() => setPick({ ...pick, [u.pin]: u.suggest!.id })}>اقتراح: {u.suggest.name} ({u.suggest.employee_no})</button>}
                  <select aria-label={`موظف الرقم ${u.pin}`} className={selectCls("w-48")} value={pick[u.pin] ?? ""} onChange={(e) => setPick({ ...pick, [u.pin]: e.target.value })}>
                    <option value="">اختر الموظف…</option>{(emps.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}</select>
                  <Button size="sm" disabled={!pick[u.pin] || link.isPending} onClick={() => link.mutate({ pin: u.pin, emp: pick[u.pin]! })}>ربط</Button>
                </li>))}</ul>)}
          </div>
          <div>
            <h5 className="text-xs font-bold">أرقام مربوطة</h5>
            {(pins.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">لا يوجد.</p> : (
              <ul className="mt-1 flex flex-wrap gap-2">{pins.data!.map((p) => (
                <li key={p.pin} className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs"><span className="font-mono" dir="ltr">#{p.pin}</span>{p.employee}
                  <button type="button" className="text-destructive" onClick={async () => { if (await ask(`فك ربط الرقم ${p.pin}؟ الحركات المعالجة سابقًا لا تتغير.`)) unl.mutate(p.pin); }}>فك الربط</button></li>))}</ul>)}
          </div>
        </div>
      )}
    </div>
  );
}
