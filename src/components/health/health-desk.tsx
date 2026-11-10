import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Download, HeartPulse, Home, Pill, Search, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { rpc } from "@/components/hr/shared";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { EVENT_KINDS, HealthFile } from "@/components/health/health-file";

type Row = { id: string; name: string; national_id: string | null; section: string | null; blood: string | null; allergies: string | null; conditions: { name: string; severity: string }[]; meds: number; school_meds: number; last_event: string | null; has_file: boolean };
type Today = { doses: { med_id: string; student_id: string; student: string; name: string; dose: string | null; time: string; given: boolean }[]; visits_today: number; sent_home_today: number; recent: { id: string; student_id: string; student: string; kind: string; summary: string; at: string }[]; can_record: boolean; can_manage: boolean; can_export: boolean };
const FLAGS: [string, string][] = [["", "كل الطلاب"], ["conditions", "لديهم أمراض/حالات"], ["allergies", "لديهم حساسية"], ["meds", "يتناولون أدوية"], ["school_meds", "أدوية خلال الدوام"], ["nofile", "بدون بطاقة صحية"]];

export function HealthDesk() {
  const { active } = useSession();
  const school = active?.schoolId ?? null;
  const [q, setQ] = useState(""); const [flag, setFlag] = useState("");
  const today = useQuery({ queryKey: ["health-today", school], enabled: !!school, queryFn: () => rpc<Today>("health_today", { _school: school }) });
  const list = useQuery({ queryKey: ["health-list", school, q, flag], enabled: !!school && !today.error, queryFn: () => rpc<Row[]>("health_students", { _school: school, _q: q || null, _flag: flag || null }) });
  if (!active) return null;
  if (!school) return <EmptyState title="اختر مدرسة أولاً" />;
  if (today.isLoading) return <LoadingState />;
  if (today.error) return /غير مصرح/.test(arabicError(today.error)) ? <ForbiddenState /> : <ErrorState message={arabicError(today.error)} onRetry={() => today.refetch()} />;
  const t = today.data!;
  const rows = list.data ?? [];
  const pending = t.doses.filter((d) => !d.given).length;
  const doExport = (kind: "xlsx" | "pdf") => {
    const h = ["الطالب", "الشعبة", "فصيلة الدم", "الحساسية", "الحالات", "عدد الأدوية", "أدوية بالمدرسة"];
    const r = rows.map((x) => [x.name, x.section, x.blood, x.allergies, x.conditions.map((c) => c.name).join("، "), x.meds, x.school_meds]);
    const meta = { title: "الكشف الصحي للطلاب", school: active.schoolName, filters: [FLAGS.find((f) => f[0] === flag)?.[1] ?? "", q].filter(Boolean) };
    kind === "xlsx" ? exportXlsx(meta, h, r) : exportPdf(meta, h, r);
  };
  return (
    <div>
      <PageHeader eyebrow="المرشدة الصحية" title="الصحة المدرسية" desc="الملفات الصحية لجميع طلاب المدرسة، جدول أدوية اليوم، وسجل العيادة."
        action={t.can_export ? <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => doExport("xlsx")}><Download className="size-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => doExport("pdf")}><Download className="size-4" />PDF</Button></div> : undefined} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Pill} label="جرعات اليوم المتبقية" value={pending} tone={pending ? "warn" : "ok"} />
        <Kpi icon={Stethoscope} label="أحداث العيادة اليوم" value={t.visits_today} />
        <Kpi icon={Home} label="أُرسلوا للمنزل اليوم" value={t.sent_home_today} />
        <Kpi icon={AlertTriangle} label="طلاب لديهم حالات" value={rows.filter((r) => r.conditions.length).length} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1"><Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input className="ps-9" placeholder="ابحث بالاسم أو الهوية" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className={selectCls + " w-auto"} value={flag} onChange={(e) => setFlag(e.target.value)}>{FLAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : rows.length === 0 ? <EmptyState title="لا يوجد طلاب مطابقون" /> : (
            <ul className="divide-y">{rows.map((r) => (
              <li key={r.id}>
                <Link to="/app/health/$id" params={{ id: r.id }} className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-secondary/50">
                  <span className={"grid size-10 shrink-0 place-items-center rounded-full " + (r.conditions.some((c) => c.severity === "high") || r.allergies ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary")}><HeartPulse className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.section ?? "غير مسكّن"}{!r.has_file ? " · بدون بطاقة صحية" : ""}</p>
                  </div>
                  <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                    {r.blood && <Chip>{r.blood}</Chip>}
                    {r.allergies && <Chip danger>حساسية</Chip>}
                    {r.conditions.slice(0, 2).map((c) => <Chip key={c.name} danger={c.severity === "high"}>{c.name}</Chip>)}
                    {r.meds > 0 && <Chip>{r.meds} دواء</Chip>}
                  </div>
                </Link>
              </li>
            ))}</ul>
          )}
        </section>
        <aside className="space-y-5">
          <Doses t={t} school={school} />
          <section className="rounded-2xl border bg-card p-4">
            <h3 className="mb-3 font-bold">آخر أحداث العيادة</h3>
            {t.recent.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أحداث بعد.</p> : (
              <ul className="space-y-2 text-sm">{t.recent.map((e) => (
                <li key={e.id}><Link to="/app/health/$id" params={{ id: e.student_id }} className="block rounded-lg p-2 hover:bg-secondary/50"><b>{e.student}</b> — {EVENT_KINDS[e.kind] ?? e.kind}<p className="truncate text-xs text-muted-foreground">{e.summary}</p></Link></li>
              ))}</ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Doses({ t, school }: { t: Today; school: string }) {
  const qc = useQueryClient();
  const give = useMutation({
    mutationFn: (d: Today["doses"][number]) => rpc("health_event_add", { _student: d.student_id, _p: { kind: "med_given", med_id: d.med_id, summary: `إعطاء ${d.name}${d.dose ? ` (${d.dose})` : ""}`, action_taken: d.time, shared: true } }),
    onSuccess: () => { toast.success("سُجّل إعطاء الجرعة وأُشعر ولي الأمر"); qc.invalidateQueries({ queryKey: ["health-today", school] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 font-bold"><Clock className="size-4 text-primary" />جدول أدوية اليوم</h3>
      {t.doses.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أدوية مجدولة خلال الدوام اليوم.</p> : (
        <ul className="space-y-2">{t.doses.map((d) => (
          <li key={d.med_id + d.time} className="flex items-center gap-2 rounded-xl border p-2 text-sm">
            <span dir="ltr" className="w-12 font-mono text-xs">{d.time || "—"}</span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{d.student}</p><p className="truncate text-xs text-muted-foreground">{d.name} {d.dose ?? ""}</p></div>
            {d.given ? <span className="flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="size-4" />أُعطي</span>
              : t.can_record && <Button size="sm" disabled={give.isPending} onClick={() => give.mutate(d)}>أُعطي</Button>}
          </li>
        ))}</ul>
      )}
    </section>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Pill; label: string; value: number; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <span className={"mb-2 grid size-9 place-items-center rounded-lg " + (tone === "warn" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary")}><Icon className="size-5" /></span>
      <p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
function Chip({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return <span className={"rounded-full px-2 py-0.5 text-[11px] " + (danger ? "bg-destructive/15 text-destructive" : "bg-secondary text-secondary-foreground")}>{children}</span>;
}

export function HealthStudentPage() {
  const { id } = useParams({ from: "/_authenticated/app/health/$id" });
  return (
    <div>
      <Link to="/app/health" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />كل الطلاب</Link>
      <HealthFile key={id} studentId={id} />
    </div>
  );
}
