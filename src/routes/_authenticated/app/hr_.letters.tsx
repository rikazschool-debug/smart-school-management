import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, Plus, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { exportPdf, exportXlsx } from "@/lib/export";
import { rpc, type HrEmp } from "@/components/hr/shared";
import { L_KIND, L_STATUS, LetterPanel, LetterStatus, type LetterRow, type LetterTpl, type LetterVar } from "@/components/hr/letters";

type Caps = { enabled: boolean; templates_admin: boolean; vars: LetterVar[]; caps: Record<"view" | "create" | "review" | "issue" | "comp" | "templates" | "export", boolean> };
type Search = { l?: string; tpl?: string; new?: string };

export const Route = createFileRoute("/_authenticated/app/hr_/letters")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    if (typeof s["l"] === "string") o.l = s["l"] as string;
    if (s["tpl"]) o.tpl = "1";
    if (s["new"]) o.new = "1";
    return o;
  },
  head: () => ({ meta: [{ title: "الخطابات — الموارد البشرية — ركاز" }, { name: "description", content: "قوالب الخطابات الوظيفية وطلباتها ومراجعتها وإصدارها برقم مرجعي." }, { property: "og:title", content: "الخطابات — ركاز" }, { property: "og:description", content: "إدارة الخطابات الوظيفية في ركاز." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["hr-l-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("hr_letter_caps", { _org: org }) });
  if (!active) return null;
  const k = caps.data;
  const any = k && Object.values(k.caps).some(Boolean);
  return (
    <>
      <Link to="/app/hr" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />ملفات الموظفين</Link>
      <PageHeader title="الخطابات" desc="طلب ← مراجعة حسب النوع ← إصدار برقم مرجعي. نص الخطاب الصادر ثابت لا يتغير بتعديل القالب، والتصحيح يُنشئ خطابًا مرتبطًا بالأصل." />
      {caps.isLoading ? <LoadingState /> : caps.error ? <ErrorState message={arabicError(caps.error)} onRetry={() => caps.refetch()} />
        : !k!.enabled ? <SectionLocked /> : !any ? <ForbiddenState /> : <Workspace org={org!} k={k!} />}
    </>
  );
}

function Workspace({ org, k }: { org: string; k: Caps }) {
  const s = Route.useSearch();
  const nav = useNavigate({ from: "/app/hr/letters" });
  const [f, setF] = useState({ q: "", status: "", template: "" });
  const tpl = useQuery({ queryKey: ["hr-l-tpl", org], queryFn: () => rpc<LetterTpl[]>("hr_letter_templates", { _org: org }) });
  const list = useQuery({ queryKey: ["hr-letters", org, f], enabled: k.caps.view, queryFn: () => rpc<LetterRow[]>("hr_letter_list", { _org: org, _f: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }) });
  const rows = list.data ?? [];
  const exp = (kind: "xlsx" | "pdf") => {
    const headers = ["الموظف", "الرقم الوظيفي", "المدرسة", "النوع", "الحالة", "الرقم المرجعي", "تاريخ الطلب", "تاريخ الإصدار"];
    const data = rows.map((r) => [r.employee, r.employee_no, r.school ?? "", r.template, L_STATUS[r.status] ?? r.status, r.ref_no ?? "", r.requested_at.slice(0, 10), r.issued_at?.slice(0, 10) ?? ""]);
    const meta = { title: "سجل الخطابات", filters: [f.status ? L_STATUS[f.status]! : "", f.q ? `بحث: ${f.q}` : ""].filter(Boolean) };
    return kind === "xlsx" ? exportXlsx(meta, headers, data) : exportPdf(meta, headers, data);
  };
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {k.caps.create && <Button size="sm" onClick={() => nav({ search: { new: "1" } })}><Plus className="size-4" />خطاب لموظف</Button>}
        {k.templates_admin && <Button size="sm" variant="outline" onClick={() => nav({ search: s.tpl ? {} : { tpl: "1" } })}><Settings2 className="size-4" />{s.tpl ? "إخفاء القوالب" : "قوالب الخطابات"}</Button>}
        {k.caps.export && k.caps.view && rows.length > 0 && <><Button size="sm" variant="outline" onClick={() => exp("xlsx")}><Download className="size-4" />Excel</Button><Button size="sm" variant="outline" onClick={() => exp("pdf")}><FileText className="size-4" />PDF</Button></>}
      </div>
      {s.tpl && k.templates_admin && <Templates org={org} k={k} list={tpl.data ?? []} />}
      {s.new && k.caps.create && <CreateForm org={org} tpl={(tpl.data ?? []).filter((t) => t.is_active)} onClose={() => nav({ search: {} })} onDone={(id) => nav({ search: { l: id } })} />}
      {s.l && <LetterPanel id={s.l} onClose={() => nav({ search: {} })} />}
      {k.caps.view && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["requested", "بانتظار المراجعة"], ["approved", "بانتظار الإصدار"], ["returned", "أُعيدت للتعديل"], ["issued", "صادرة"]].map(([st, lb]) => (
            <button key={st} type="button" onClick={() => setF((x) => ({ ...x, status: x.status === st ? "" : st! }))} className={"rounded-xl border bg-card p-3 text-start " + (f.status === st ? "border-primary" : "")}>
              <span className="block text-2xl font-bold">{count(st!)}</span><span className="block text-xs text-muted-foreground">{lb}</span></button>))}
        </div>
        <div className="grid gap-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-center">
          <Input aria-label="بحث" placeholder="بحث بالاسم أو الرقم المرجعي" className="w-full sm:w-56" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select aria-label="الحالة" className={selectCls("w-full sm:w-48")} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(L_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select aria-label="النوع" className={selectCls("w-full sm:w-48")} value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}><option value="">كل الأنواع</option>{(tpl.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="لا توجد خطابات" hint="تظهر هنا طلبات الموظفين والخطابات الصادرة ضمن نطاقك." /> : (
          <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => (
            <li key={r.id}><button type="button" onClick={() => nav({ search: { l: r.id } })} className="w-full rounded-xl border bg-card p-3 text-start text-sm hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center justify-between gap-2"><span className="font-semibold">{r.employee}</span><LetterStatus s={r.status} /></span>
              <span className="block text-xs text-muted-foreground">{r.template} · {r.school ?? ""} · <bdi dir="ltr">{r.ref_no ?? r.requested_at.slice(0, 10)}</bdi>{r.has_comp ? " · يتضمن الراتب" : ""}</span>
            </button></li>))}</ul>
        )}
      </>}
    </div>
  );
}

function CreateForm({ org, tpl, onClose, onDone }: { org: string; tpl: LetterTpl[]; onClose: () => void; onDone: (id: string) => void }) {
  const emps = useQuery({ queryKey: ["hr-list-all", org], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: null, _q: null, _status: "active" }) });
  const [v, setV] = useState({ employee: "", template: tpl[0]?.id ?? "", purpose: "", addressee: "" });
  const m = useMutation({
    mutationFn: () => rpc<string>("hr_letter_create", { _org: org, _employee: v.employee, _template: v.template, _purpose: v.purpose, _addressee: v.addressee }),
    onSuccess: (id) => { toast.success("أُنشئ طلب الخطاب"); onDone(id); }, onError: (e) => toast.error(arabicError(e)),
  });
  return (
    <form className="grid gap-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!v.employee || !v.template) { toast.error("اختر الموظف ونوع الخطاب"); return; } if (!m.isPending) m.mutate(); }}>
      <div className="flex items-center sm:col-span-2"><p className="flex-1 font-bold">خطاب لموظف</p><Button size="icon" variant="ghost" type="button" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <div><Label htmlFor="lc-e">الموظف</Label>{emps.error ? <p className="text-destructive">{arabicError(emps.error)}</p> :
        <select id="lc-e" className={selectCls("mt-1 w-full")} value={v.employee} onChange={(e) => setV({ ...v, employee: e.target.value })}><option value="">— اختر —</option>{(emps.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name} ({x.employee_no})</option>)}</select>}</div>
      <div><Label htmlFor="lc-t">نوع الخطاب</Label><select id="lc-t" className={selectCls("mt-1 w-full")} value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })}>{tpl.map((t) => <option key={t.id} value={t.id}>{t.name}{t.has_comp ? " (يتضمن الراتب)" : ""}</option>)}</select></div>
      <div><Label htmlFor="lc-a">الجهة الموجه إليها</Label><Input id="lc-a" value={v.addressee} onChange={(e) => setV({ ...v, addressee: e.target.value })} /></div>
      <div><Label htmlFor="lc-p">الغرض</Label><Input id="lc-p" value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} /></div>
      <div><Button size="sm" type="submit" disabled={m.isPending}>إنشاء الطلب</Button></div>
    </form>
  );
}

function Templates({ org, k, list }: { org: string; k: Caps; list: LetterTpl[] }) {
  const qc = useQueryClient();
  const [ed, setEd] = useState<(Partial<LetterTpl> & { body: string; name: string }) | null>(null);
  const [pvEmp, setPvEmp] = useState("");
  const emps = useQuery({ queryKey: ["hr-list-all", org], enabled: !!ed, queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: null, _q: null, _status: "active" }) });
  const pv = useQuery({ queryKey: ["hr-l-pv", org, ed?.body, pvEmp], enabled: !!ed && ed.body.length > 0, queryFn: () => rpc<{ text: string | null; missing: string[]; unknown: string[] }>("hr_letter_preview", { _org: org, _body: ed!.body, _employee: pvEmp || null }) });
  const save = useMutation({
    mutationFn: () => rpc("hr_letter_template_save", { _org: org, _id: ed!.id ?? null, _p: { name: ed!.name, kind: ed!.kind ?? "other", body: ed!.body, needs_review: ed!.needs_review ?? true, employee_request: ed!.employee_request ?? true, is_active: ed!.is_active ?? true, rev: ed!.version } }),
    onSuccess: () => { toast.success("حُفظ القالب (إصدار جديد عند تغيير النص)"); setEd(null); qc.invalidateQueries({ queryKey: ["hr-l-tpl", org] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const label = (key: string) => k.vars.find((x) => x.key === key)?.label ?? key;
  return (
    <Section title="قوالب الخطابات" desc="النص عربي عادي مع متغيرات معروفة فقط بين {{ }}. تعديل النص يُنشئ إصدارًا جديدًا، والخطابات الصادرة تحتفظ بنصها.">
      {!ed ? (
        <div className="space-y-2">
          <Button size="sm" onClick={() => setEd({ name: "", body: "", kind: "employment", needs_review: true, employee_request: true, is_active: true })}><Plus className="size-4" />قالب جديد</Button>
          {list.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد قوالب. أنشئ أول قالب ليتمكن الموظفون من طلب الخطابات.</p> : (
            <ul className="grid gap-2 md:grid-cols-2">{list.map((t) => (
              <li key={t.id} className="rounded-xl border bg-card p-3 text-sm">
                <div className="flex items-center gap-2"><span className="flex-1 font-semibold">{t.name}</span><span className="text-xs text-muted-foreground">إصدار {t.version}</span>
                  {t.body != null && <Button size="sm" variant="outline" onClick={() => setEd({ ...t, body: t.body! })}>تعديل</Button>}</div>
                <p className="text-xs text-muted-foreground">{L_KIND[t.kind] ?? t.kind} · {t.needs_review ? "يحتاج مراجعة" : "إصدار مباشر"} · {t.employee_request ? "يطلبه الموظف" : "بطلب من الموارد فقط"}{t.has_comp ? " · يتضمن الراتب" : ""}{t.is_active ? "" : " · موقوف"}</p>
                {t.body == null && t.has_comp && <p className="text-xs text-warning">النص مخفي: يتضمن الراتب.</p>}
              </li>))}</ul>
          )}
        </div>
      ) : (
        <form className="grid gap-3 text-sm lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
          <div className="space-y-2">
            <div><Label htmlFor="lt-n">اسم القالب</Label><Input id="lt-n" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
            <div><Label htmlFor="lt-k">النوع</Label><select id="lt-k" className={selectCls("mt-1 w-full")} value={ed.kind ?? "other"} onChange={(e) => setEd({ ...ed, kind: e.target.value })}>{Object.entries(L_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><Label htmlFor="lt-b">نص الخطاب</Label><Textarea id="lt-b" rows={12} value={ed.body} onChange={(e) => setEd({ ...ed, body: e.target.value })} /></div>
            <div className="flex flex-wrap gap-1">{k.vars.filter((x) => !x.comp || k.caps.comp).map((x) => <button key={x.key} type="button" className="rounded border bg-secondary px-1.5 py-0.5 text-xs" onClick={() => setEd({ ...ed, body: ed.body + `{{${x.key}}}` })}>{x.label}</button>)}</div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ed.needs_review ?? true} onChange={(e) => setEd({ ...ed, needs_review: e.target.checked })} />يحتاج مراجعة واعتمادًا قبل الإصدار</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ed.employee_request ?? true} onChange={(e) => setEd({ ...ed, employee_request: e.target.checked })} />يستطيع الموظف طلبه من خدماتي الوظيفية</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ed.is_active ?? true} onChange={(e) => setEd({ ...ed, is_active: e.target.checked })} />مفعّل</label>
            <div className="flex gap-2"><Button size="sm" type="submit" disabled={save.isPending}>حفظ</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEd(null)}>إلغاء</Button></div>
          </div>
          <div className="space-y-2">
            <div><Label htmlFor="lt-pe">معاينة ببيانات موظف</Label><select id="lt-pe" className={selectCls("mt-1 w-full")} value={pvEmp} onChange={(e) => setPvEmp(e.target.value)}><option value="">— بدون موظف —</option>{(emps.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></div>
            {pv.data?.unknown?.length ? <p className="text-destructive">متغيرات غير معروفة: {pv.data.unknown.join("، ")}</p> : null}
            {pv.data?.missing?.length ? <p className="text-warning">بيانات ناقصة لهذا الموظف: {pv.data.missing.map(label).join("، ")} — يُمنع الإصدار حتى تُستكمل.</p> : null}
            {pv.error && <p className="text-destructive">{arabicError(pv.error)}</p>}
            <div className="min-h-40 whitespace-pre-wrap rounded-lg border bg-background p-3 leading-8">{pv.data?.text ?? (pvEmp ? "" : "اختر موظفًا لمعاينة النص بالقيم المصرح لك بها.")}</div>
          </div>
        </form>
      )}
    </Section>
  );
}
