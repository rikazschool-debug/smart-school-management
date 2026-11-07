import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { db } from "@/components/crud-page";
import { uploadObject } from "@/components/classroom-posts";

type Tab = "docs" | "contractors";
export const Route = createFileRoute("/_authenticated/app/org-docs")({
  head: () => ({ meta: [{ title: "الوثائق والعقود — ركاز" }, { name: "description", content: "وثائق المنشأة وعقود المتعهدين لكل مدرسة أو للمجموعة، مع تواريخ الصلاحية." }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { tab: Tab } => ({ tab: s["tab"] === "contractors" ? "contractors" : "docs" }),
  component: Page,
});

type Caps = { owner: boolean; schools: { id: string; name: string; view: boolean; create: boolean; edit: boolean; download: boolean }[]; group: { view: boolean; create: boolean; edit: boolean; download: boolean } };
type Doc = { id: string; school_id: string | null; school: string | null; kind: string; name: string; doc_no: string | null; issuer: string | null; issued_on: string | null; expires_on: string | null; status: string; file_id: string | null; file_name: string | null };
type Con = { id: string; name: string; service: string; contact_name: string | null; phone: string | null; email: string | null; school_ids: string[]; schools: string[]; starts_on: string | null; ends_on: string | null; status: string; notes: string | null; files: { id: string; name: string }[] };

const STATUS: Record<string, [string, string]> = {
  valid: ["سارية", "bg-primary/10 text-primary"], expiring: ["تنتهي خلال 30 يومًا", "bg-accent text-accent-foreground"],
  expired: ["منتهية", "bg-destructive/10 text-destructive"], none: ["بلا تاريخ انتهاء", "bg-muted text-muted-foreground"],
};
const DOC_KINDS = ["سجل تجاري", "ترخيص تعليمي", "شهادة الدفاع المدني", "رخصة بلدية", "عقد إيجار", "شهادة الزكاة والضريبة", "تأمين", "أخرى"];
const SERVICES = ["المقصف", "الزي المدرسي", "النظافة", "الحراسة", "النقل", "الصيانة", "أخرى"];

function Badge({ s }: { s: string }) { const [l, c] = STATUS[s] ?? STATUS["none"]!; return <span className={`rounded-full px-2 py-0.5 text-xs ${c}`}>{l}</span>; }

async function openOrgFile(id: string) {
  const { data: f } = await db.from("files").select("storage_path,name").eq("id", id).maybeSingle();
  const row = f as { storage_path: string; name: string } | null;
  if (!row) return void toast.error("لا تملك صلاحية تنزيل هذا الملف");
  const { data, error } = await db.storage.from("rikaz-files").createSignedUrl(row.storage_path, 60, { download: row.name });
  if (error || !data) return void toast.error("لا تملك صلاحية تنزيل هذا الملف");
  window.open(data.signedUrl, "_blank", "noopener");
}

async function uploadDraft(org: string, school: string | null, file: File): Promise<string> {
  const d = await rpc<{ id: string; storage_path: string }[]>("od_draft_file", { _org: org, _school: school, _name: file.name, _mime: file.type, _size: file.size });
  const rec = d[0]!;
  const r = await uploadObject(rec.storage_path, file, new AbortController().signal);
  if (r !== "ok") throw new Error("فشل رفع الملف، حاول مرة أخرى");
  return rec.id;
}

function Page() {
  const { tab } = Route.useSearch();
  const nav = useNavigate({ from: "/app/org-docs" });
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["od-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("od_caps", { _org: org }) });
  if (!org) return <EmptyState title="اختر المجموعة أولًا" />;
  if (caps.isLoading) return <LoadingState />;
  if (caps.error || !caps.data) return <ErrorState message={arabicError(caps.error)} />;
  const c = caps.data;
  const canView = c.owner || c.group.view || c.schools.some((s) => s.view);
  if (!canView) return <ForbiddenState />;
  return (
    <div>
      <PageHeader eyebrow="إدارة المدارس" title="الوثائق والعقود" desc="وثائق المنشأة وعقود المتعهدين. ما تراه وما تستطيع تنزيله أو تعديله محدد بصلاحياتك لكل مدرسة." />
      <div className="mb-4 flex gap-2">
        {([["docs", "وثائق المنشأة"], ["contractors", "المتعهدون"]] as [Tab, string][]).map(([k, l]) => (
          <Button key={k} variant={tab === k ? "default" : "outline"} size="sm" onClick={() => nav({ search: { tab: k } })}>{l}</Button>
        ))}
      </div>
      {tab === "docs" ? <Docs org={org} caps={c} /> : <Contractors org={org} caps={c} />}
    </div>
  );
}

function Filters({ caps, q, setQ, school, setSchool, status, setStatus }: { caps: Caps; q: string; setQ: (v: string) => void; school: string; setSchool: (v: string) => void; status: string; setStatus: (v: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1"><Search className="absolute end-2 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو النوع أو الرقم" /></div>
      <select className={selectCls()} value={school} onChange={(e) => setSchool(e.target.value)} aria-label="المدرسة">
        <option value="">كل المدارس</option>{caps.schools.filter((s) => s.view).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className={selectCls()} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
        <option value="">كل الحالات</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}

function Docs({ org, caps }: { org: string; caps: Caps }) {
  const [q, setQ] = useState(""); const [school, setSchool] = useState(""); const [status, setStatus] = useState("");
  const [edit, setEdit] = useState<Partial<Doc> | null>(null);
  const list = useQuery({ queryKey: ["od", org, "docs", q, school, status], queryFn: () => rpc<Doc[]>("od_list", { _org: org, _what: "docs", _q: q || null, _school: school || null, _status: status || null }) });
  const can = (a: "create" | "edit" | "download", sid: string | null) => caps.owner || (sid ? !!caps.schools.find((s) => s.id === sid)?.[a] : caps.group[a]);
  const canCreate = caps.owner || caps.group.create || caps.schools.some((s) => s.create);
  return (
    <div>
      <div className="mb-3 flex justify-end">{canCreate && <Button size="sm" onClick={() => setEdit({})}><Plus className="size-4" />إضافة وثيقة</Button>}</div>
      <Filters {...{ caps, q, setQ, school, setSchool, status, setStatus }} />
      {edit && <DocForm org={org} caps={caps} init={edit} close={() => setEdit(null)} />}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data?.length ? <EmptyState title="لا توجد وثائق" hint="أضف وثائق المنشأة مثل السجل التجاري والتراخيص." /> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm"><thead className="bg-muted/50 text-start"><tr>{["النوع", "الاسم", "الرقم", "جهة الإصدار", "النطاق", "الإصدار", "الانتهاء", "الحالة", ""].map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{list.data.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-2">{d.kind}</td><td className="p-2 font-medium">{d.name}</td><td className="p-2">{d.doc_no ?? "—"}</td><td className="p-2">{d.issuer ?? "—"}</td>
                <td className="p-2">{d.school ?? "المجموعة"}</td><td className="p-2">{d.issued_on ?? "—"}</td><td className="p-2">{d.expires_on ?? "—"}</td><td className="p-2"><Badge s={d.status} /></td>
                <td className="flex gap-1 p-2">
                  {d.file_id && can("download", d.school_id) && <Button size="sm" variant="outline" onClick={() => openOrgFile(d.file_id!)} aria-label="تنزيل الملف"><Download className="size-4" /></Button>}
                  {can("edit", d.school_id) && <Button size="sm" variant="ghost" onClick={() => setEdit(d)} aria-label="تعديل"><Pencil className="size-4" /></Button>}
                </td>
              </tr>))}</tbody></table>
        </div>
      )}
    </div>
  );
}

function DocForm({ org, caps, init, close }: { org: string; caps: Caps; init: Partial<Doc>; close: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ kind: init.kind ?? "", name: init.name ?? "", doc_no: init.doc_no ?? "", issuer: init.issuer ?? "", issued_on: init.issued_on ?? "", expires_on: init.expires_on ?? "", school_id: init.school_id ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const action = init.id ? "edit" : "create";
  const scopes = [...(caps.owner || caps.group[action] ? [["", "المجموعة كاملة"]] : []), ...caps.schools.filter((s) => caps.owner || s[action]).map((s) => [s.id, s.name])];
  const save = useMutation({
    mutationFn: async () => {
      const fid = file ? await uploadDraft(org, f.school_id || null, file) : null;
      return rpc("od_save_doc", { _org: org, _p: { ...f, id: init.id ?? null, file_id: fid ?? init.file_id ?? null, issued_on: f.issued_on || null, expires_on: f.expires_on || null } });
    },
    onSuccess: () => { toast.success("حُفظت الوثيقة"); qc.invalidateQueries({ queryKey: ["od", org] }); close(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{init.id ? "تعديل وثيقة" : "وثيقة جديدة"}</h3><Button size="sm" variant="ghost" onClick={close} aria-label="إغلاق"><X className="size-4" /></Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>نوع الوثيقة</Label><Input list="od-kinds" value={f.kind} onChange={set("kind")} /><datalist id="od-kinds">{DOC_KINDS.map((k) => <option key={k} value={k} />)}</datalist></div>
        <div><Label>اسم الوثيقة</Label><Input value={f.name} onChange={set("name")} /></div>
        <div><Label>الرقم (إن وجد)</Label><Input value={f.doc_no} onChange={set("doc_no")} /></div>
        <div><Label>جهة الإصدار</Label><Input value={f.issuer} onChange={set("issuer")} /></div>
        <div><Label>تاريخ الإصدار</Label><Input type="date" value={f.issued_on} onChange={set("issued_on")} /></div>
        <div><Label>تاريخ الانتهاء</Label><Input type="date" value={f.expires_on} onChange={set("expires_on")} /></div>
        <div><Label>النطاق</Label><select className={selectCls()} value={f.school_id} onChange={set("school_id")}>{scopes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><Label>ملف PDF</Label><Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{init.file_name && !file && <p className="mt-1 text-xs text-muted-foreground"><FileText className="inline size-3" /> {init.file_name}</p>}</div>
      </div>
      <div className="mt-3 flex justify-end"><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button></div>
    </div>
  );
}

function Contractors({ org, caps }: { org: string; caps: Caps }) {
  const [q, setQ] = useState(""); const [school, setSchool] = useState(""); const [status, setStatus] = useState("");
  const [edit, setEdit] = useState<Partial<Con> | null>(null);
  const list = useQuery({ queryKey: ["od", org, "contractors", q, school, status], queryFn: () => rpc<Con[]>("od_list", { _org: org, _what: "contractors", _q: q || null, _school: school || null, _status: status || null }) });
  const all = (a: "edit" | "download", ids: string[]) => caps.owner || ids.every((id) => caps.schools.find((s) => s.id === id)?.[a]);
  const any = (a: "download", ids: string[]) => caps.owner || ids.some((id) => caps.schools.find((s) => s.id === id)?.[a]);
  return (
    <div>
      <div className="mb-3 flex justify-end">{(caps.owner || caps.schools.some((s) => s.create)) && <Button size="sm" onClick={() => setEdit({})}><Plus className="size-4" />إضافة متعهد</Button>}</div>
      <Filters {...{ caps, q, setQ, school, setSchool, status, setStatus }} />
      {edit && <ConForm org={org} caps={caps} init={edit} close={() => setEdit(null)} />}
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data?.length ? <EmptyState title="لا يوجد متعهدون" hint="أضف متعهدي المقصف والزي وغيرهم مع عقودهم." /> : (
        <div className="grid gap-3 md:grid-cols-2">{list.data.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-4">
            <div className="mb-1 flex items-start justify-between gap-2"><div><p className="font-bold">{c.name}</p><p className="text-xs text-muted-foreground">{c.service}</p></div><Badge s={c.status} /></div>
            <p className="text-sm">{[c.contact_name, c.phone, c.email].filter(Boolean).join(" · ") || "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">المدارس: {c.schools.join("، ")}</p>
            <p className="text-xs text-muted-foreground">السريان: {c.starts_on ?? "—"} ← {c.ends_on ?? "—"}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {any("download", c.school_ids) && c.files.map((f) => <Button key={f.id} size="sm" variant="outline" onClick={() => openOrgFile(f.id)}><Download className="size-3" />{f.name}</Button>)}
              {all("edit", c.school_ids) && <Button size="sm" variant="ghost" onClick={() => setEdit(c)}><Pencil className="size-4" />تعديل</Button>}
            </div>
          </div>))}</div>
      )}
    </div>
  );
}

function ConForm({ org, caps, init, close }: { org: string; caps: Caps; init: Partial<Con>; close: () => void }) {
  const qc = useQueryClient();
  const action = init.id ? "edit" : "create";
  const [f, setF] = useState({ name: init.name ?? "", service: init.service ?? "", contact_name: init.contact_name ?? "", phone: init.phone ?? "", email: init.email ?? "", starts_on: init.starts_on ?? "", ends_on: init.ends_on ?? "", notes: init.notes ?? "" });
  const [schools, setSchools] = useState<string[]>(init.school_ids ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const save = useMutation({
    mutationFn: async () => {
      const ids = [...(init.files ?? []).map((x) => x.id)];
      for (const file of files) ids.push(await uploadDraft(org, schools[0] ?? null, file));
      return rpc("od_save_contractor", { _org: org, _p: { ...f, id: init.id ?? null, school_ids: schools, file_ids: ids, starts_on: f.starts_on || null, ends_on: f.ends_on || null } });
    },
    onSuccess: () => { toast.success("حُفظ المتعهد"); qc.invalidateQueries({ queryKey: ["od", org] }); close(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{init.id ? "تعديل متعهد" : "متعهد جديد"}</h3><Button size="sm" variant="ghost" onClick={close} aria-label="إغلاق"><X className="size-4" /></Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>اسم المتعهد</Label><Input value={f.name} onChange={set("name")} /></div>
        <div><Label>نوع الخدمة</Label><Input list="od-services" value={f.service} onChange={set("service")} /><datalist id="od-services">{SERVICES.map((k) => <option key={k} value={k} />)}</datalist></div>
        <div><Label>اسم المسؤول</Label><Input value={f.contact_name} onChange={set("contact_name")} /></div>
        <div><Label>الجوال</Label><Input value={f.phone} onChange={set("phone")} dir="ltr" /></div>
        <div><Label>البريد</Label><Input value={f.email} onChange={set("email")} dir="ltr" /></div>
        <div><Label>بداية السريان</Label><Input type="date" value={f.starts_on} onChange={set("starts_on")} /></div>
        <div><Label>نهاية السريان</Label><Input type="date" value={f.ends_on} onChange={set("ends_on")} /></div>
        <div><Label>العقد والمرفقات</Label><Input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFiles([...(e.target.files ?? [])])} /></div>
        <div className="sm:col-span-2"><Label>المدارس المرتبطة</Label><div className="mt-1 flex flex-wrap gap-3">{caps.schools.filter((s) => caps.owner || s[action]).map((s) => (
          <label key={s.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={schools.includes(s.id)} onChange={() => setSchools(schools.includes(s.id) ? schools.filter((x) => x !== s.id) : [...schools, s.id])} />{s.name}</label>))}</div></div>
        <div className="sm:col-span-2"><Label>ملاحظات</Label><Textarea value={f.notes} onChange={set("notes")} /></div>
      </div>
      <div className="mt-3 flex justify-end"><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button></div>
    </div>
  );
}
