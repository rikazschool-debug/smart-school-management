import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, Plus, Settings2, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { rpc, type HrEmp } from "@/components/hr/shared";
import { KIND } from "@/components/hr/contracts-shared";
import { D_STATUS, DocDetailPanel, DocStatus, DocUploadForm, type DocRow, type DocType } from "@/components/hr/documents";

type Caps = { enabled: boolean; types_admin: boolean; caps: Record<"view" | "sensitive" | "upload" | "review" | "download" | "export" | "settings", boolean>; schools: { id: string; name: string }[] };
type Search = { d?: string; types?: string; up?: string };

export const Route = createFileRoute("/_authenticated/app/hr_/documents")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    if (typeof s["d"] === "string") o.d = s["d"] as string;
    if (s["types"]) o.types = "1";
    if (s["up"]) o.up = "1";
    return o;
  },
  head: () => ({ meta: [{ title: "مستندات الموظفين — الموارد البشرية — ركاز" }, { name: "description", content: "مستندات الموظفين ومتطلباتها ومراجعتها وتنبيهات انتهائها." }, { property: "og:title", content: "مستندات الموظفين — ركاز" }, { property: "og:description", content: "مركز مستندات الموظفين في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["hr-d-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("hr_doc_caps", { _org: org }) });
  if (!active) return null;
  const k = caps.data;
  return (
    <>
      <Link to="/app/hr" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />ملفات الموظفين</Link>
      <PageHeader title="مستندات الموظفين" desc="كل مستند مرتبط بملف الموظف، وكل نسخة محفوظة. لا تُقبل نسخة إلا من مراجع غير رافعها وغير الموظف نفسه. الملفات خاصة وتُفتح بصلاحية فقط." />
      {caps.isLoading ? <LoadingState /> : caps.error ? <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} />
        : !k!.enabled ? <SectionLocked /> : !(k!.caps.view || k!.types_admin) ? <ForbiddenState /> : <Workspace org={org!} k={k!} />}
    </>
  );
}

function Workspace({ org, k }: { org: string; k: Caps }) {
  const s = Route.useSearch();
  const nav = useNavigate({ from: "/app/hr/documents" });
  const [f, setF] = useState({ q: "", school: "", type: "", status: "", expiring: "" });
  const types = useQuery({ queryKey: ["hr-doc-types", org], queryFn: () => rpc<DocType[]>("hr_doc_types_list", { _org: org }) });
  const list = useQuery({ queryKey: ["hr-docs", org, f], enabled: k.caps.view, queryFn: () => rpc<DocRow[]>("hr_doc_list", { _org: org, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }) });
  const rows = list.data ?? [];
  const set = (key: keyof typeof f, v: string) => setF((x) => ({ ...x, [key]: v }));
  const exp = (kind: "xlsx" | "pdf") => {
    const headers = ["الموظف", "الرقم الوظيفي", "المدرسة", "النوع", "الحالة", "رقم المستند", "الانتهاء"];
    const data = rows.map((r) => [r.employee, r.employee_no, r.school ?? "", r.type, D_STATUS[r.status] ?? r.status, r.current?.doc_no ?? "", r.current?.expires_on ?? ""]);
    const meta = { title: "مستندات الموظفين", filters: [f.status ? D_STATUS[f.status]! : "", f.expiring ? `تنتهي خلال ${f.expiring} يومًا` : "", f.q ? `بحث: ${f.q}` : ""].filter(Boolean) };
    return kind === "xlsx" ? exportXlsx(meta, headers, data) : exportPdf(meta, headers, data);
  };
  const kpi = (st: string) => rows.filter((r) => r.status === st).length;
  return (
    <div className="space-y-4">
      {k.caps.view && <div className="grid gap-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-center">
        <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم الوظيفي" className="w-full sm:w-56" value={f.q} onChange={(e) => set("q", e.target.value)} />
        <select aria-label="المدرسة" className={selectCls("w-full sm:w-40")} value={f.school} onChange={(e) => set("school", e.target.value)}><option value="">كل المدارس</option>{k.schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select aria-label="النوع" className={selectCls("w-full sm:w-40")} value={f.type} onChange={(e) => set("type", e.target.value)}><option value="">كل الأنواع</option>{(types.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select aria-label="الحالة" className={selectCls("w-full sm:w-48")} value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">كل الحالات</option>{["missing", "under_review", "accepted", "rejected", "expired"].map((x) => <option key={x} value={x}>{D_STATUS[x]}</option>)}</select>
        <select aria-label="قرب الانتهاء" className={selectCls("w-full sm:w-44")} value={f.expiring} onChange={(e) => set("expiring", e.target.value)}><option value="">كل التواريخ</option><option value="30">تنتهي خلال 30 يومًا</option><option value="60">تنتهي خلال 60 يومًا</option><option value="90">تنتهي خلال 90 يومًا</option></select>
        <span className="hidden flex-1 sm:block" />
        <div className="flex flex-wrap gap-2">
          {k.caps.export && rows.length > 0 && <><Button variant="outline" size="sm" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></>}
          {k.types_admin && <Button variant="outline" size="sm" onClick={() => nav({ search: { types: "1" } })}><Settings2 className="size-4" />الأنواع والمتطلبات</Button>}
          {k.caps.upload && <Button size="sm" onClick={() => nav({ search: { up: "1" } })}><Upload className="size-4" />رفع مستند</Button>}
        </div>
      </div>}
      {s.types && <TypesEditor org={org} types={types.data ?? []} onClose={() => nav({ search: {} })} />}
      {s.up && <NewUpload org={org} types={(types.data ?? []).filter((t) => t.is_active)} onClose={() => nav({ search: {} })} />}
      {s.d && <DocDetailPanel id={s.d} org={org} onClose={() => nav({ search: {} })} />}
      {k.caps.view && !list.isLoading && !list.error && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["missing", "under_review", "rejected", "expired"] as const).map((st) => (
            <button key={st} type="button" onClick={() => set("status", st)} className="rounded-xl border bg-card p-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className={"block text-2xl font-bold " + (kpi(st) ? "text-warning" : "")}>{kpi(st)}</span><span className="block text-xs text-muted-foreground">{D_STATUS[st]}</span>
            </button>
          ))}
        </div>
      )}
      {!k.caps.view ? null : list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : !rows.length ? (
        <EmptyState title="لا توجد مستندات مطابقة" hint={(types.data ?? []).length ? "ارفع مستندًا أو غيّر التصفية." : "ابدأ بإضافة أنواع المستندات ومتطلباتها."} />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <li key={(r.id ?? "m") + r.employee_id + r.type_id}>
              <div className="flex h-full flex-col gap-1 rounded-xl border bg-card p-3 text-sm">
                <span className="flex items-start justify-between gap-2"><span className="font-semibold">{r.employee}</span><DocStatus s={r.status} /></span>
                <span className="text-xs text-muted-foreground"><bdi dir="ltr">{r.employee_no}</bdi>{r.school ? ` · ${r.school}` : ""} · {r.type}{r.confidential ? " · سري" : ""}</span>
                {r.current?.expires_on && <span className="text-xs text-muted-foreground">ينتهي <bdi dir="ltr">{r.current.expires_on}</bdi></span>}
                {r.id ? <Button size="sm" variant="ghost" className="mt-auto self-start" onClick={() => nav({ search: { d: r.id! } })}>عرض التفاصيل</Button>
                  : k.caps.upload && <UploadMissing org={org} r={r} types={types.data ?? []} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadMissing({ org, r, types }: { org: string; r: DocRow; types: DocType[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const t = types.find((x) => x.id === r.type_id);
  if (!t) return null;
  return open ? <DocUploadForm org={org} type={t} employeeId={r.employee_id} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["hr-docs"] }); }} onCancel={() => setOpen(false)} />
    : <Button size="sm" variant="outline" className="mt-auto self-start" onClick={() => setOpen(true)}><Upload className="size-4" />رفع</Button>;
}

function NewUpload({ org, types, onClose }: { org: string; types: DocType[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [emp, setEmp] = useState(""); const [type, setType] = useState("");
  const emps = useQuery({ queryKey: ["hr-emps-docs", org], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _f: {} }) });
  const t = types.find((x) => x.id === type);
  return (
    <Section title="رفع مستند لموظف">
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label htmlFor="nu-e">الموظف</Label><select id="nu-e" className={selectCls("w-full")} value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">اختر</option>{(emps.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.full_name} — {e.employee_no}</option>)}</select></div>
        <div><Label htmlFor="nu-t">نوع المستند</Label><select id="nu-t" className={selectCls("w-full")} value={type} onChange={(e) => setType(e.target.value)}><option value="">اختر</option>{types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      </div>
      {emps.isError && <p className="mt-2 text-sm text-muted-foreground">لا تملك عرض قائمة الموظفين؛ ارفع من بطاقة المستند المطلوب.</p>}
      {emp && t ? <div className="mt-3"><DocUploadForm org={org} type={t} employeeId={emp} onDone={() => { qc.invalidateQueries({ queryKey: ["hr-docs"] }); onClose(); }} onCancel={onClose} /></div>
        : <Button className="mt-3" size="sm" variant="ghost" onClick={onClose}>إغلاق</Button>}
    </Section>
  );
}

const blank: DocType = { id: "", name: "", confidential: false, needs_number: false, needs_expiry: false, employee_upload: true, required_all: false, required_kinds: [], alert_days: [], is_active: true };
function TypesEditor({ org, types, onClose }: { org: string; types: DocType[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [e, setE] = useState<DocType | null>(null);
  const [days, setDays] = useState("");
  const save = useMutation({
    mutationFn: (t: DocType) => rpc("hr_doc_type_save", { _org: org, _id: t.id || null, _p: { ...t, alert_days: days.split(/[,،\s]+/).filter(Boolean).map(Number) } }),
    onSuccess: () => { toast.success("حُفظ النوع"); setE(null); qc.invalidateQueries({ queryKey: ["hr-doc-types"] }); qc.invalidateQueries({ queryKey: ["hr-docs"] }); },
    onError: (x) => toast.error(arabicError(x)),
  });
  const chk = (k: keyof DocType, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!e![k]} onChange={(x) => setE({ ...e!, [k]: x.target.checked })} />{label}</label>;
  return (
    <Section title="أنواع المستندات ومتطلباتها" desc="المتطلبات يحددها المالك أو المفوض؛ لا توجد أنواع افتراضية. مواعيد التنبيه لكل نوع اختيارية.">
      {!e ? (
        <div className="space-y-2">
          <ul className="grid gap-2 md:grid-cols-2">{types.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm"><div className="flex-1"><b>{t.name}</b>{!t.is_active && " (موقوف)"}
              <span className="block text-xs text-muted-foreground">{[t.confidential && "سري", t.required_all ? "مطلوب من الجميع" : t.required_kinds?.length ? `مطلوب لعقود: ${t.required_kinds.map((k) => KIND[k]).join("، ")}` : "اختياري", t.needs_expiry && "له تاريخ انتهاء", t.alert_days?.length ? `تنبيه قبل ${t.alert_days.join("، ")} يومًا` : "", t.employee_upload ? "يرفعه الموظف" : "ترفعه الموارد البشرية فقط"].filter(Boolean).join(" · ")}</span></div>
              <Button size="sm" variant="ghost" onClick={() => { setE(t); setDays((t.alert_days ?? []).join(", ")); }}>تعديل</Button></li>))}</ul>
          <div className="flex gap-2"><Button size="sm" onClick={() => { setE(blank); setDays(""); }}><Plus className="size-4" />نوع جديد</Button><Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button></div>
        </div>
      ) : (
        <form className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2" onSubmit={(x) => { x.preventDefault(); save.mutate(e); }}>
          <div className="sm:col-span-2"><Label htmlFor="ty-n">اسم النوع</Label><Input id="ty-n" required value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></div>
          {chk("confidential", "سري (يحتاج صلاحية المستندات السرية)")}{chk("needs_number", "رقم المستند مطلوب")}{chk("needs_expiry", "له تاريخ انتهاء")}{chk("employee_upload", "يرفعه الموظف من خدماته")}{chk("required_all", "مطلوب من كل الموظفين")}{e.id && chk("is_active", "مفعّل")}
          {!e.required_all && <fieldset className="sm:col-span-2"><legend className="text-sm">مطلوب لأنواع العقود</legend><div className="flex flex-wrap gap-3">{Object.entries(KIND).map(([k, l]) => <label key={k} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={e.required_kinds?.includes(k)} onChange={(x) => setE({ ...e, required_kinds: x.target.checked ? [...(e.required_kinds ?? []), k] : (e.required_kinds ?? []).filter((y) => y !== k) })} />{l}</label>)}</div></fieldset>}
          {e.needs_expiry && <div className="sm:col-span-2"><Label htmlFor="ty-d">أيام التنبيه قبل الانتهاء (اختياري، مفصولة بفاصلة)</Label><Input id="ty-d" dir="ltr" value={days} onChange={(x) => setDays(x.target.value)} /></div>}
          <div className="flex gap-2 sm:col-span-2"><Button size="sm" type="submit" disabled={save.isPending}>حفظ</Button><Button size="sm" type="button" variant="ghost" onClick={() => setE(null)}>رجوع</Button></div>
        </form>
      )}
    </Section>
  );
}
