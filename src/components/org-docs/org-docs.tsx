import type React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarRange, Download, FileText, Handshake, Mail, Paperclip, Pencil, Phone, Plus, Printer, School, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
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
import { ask } from "@/components/confirm";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { archiveDay, archiveDetails, filterArchive, recordCategory, recordType, type ArchiveRecord, type Con, type Doc } from "./archive-model";
import { ATTACHMENT_ACCEPT, DOCUMENT_TYPES, SERVICE_TYPES, withSavedOption } from "./form-options";

export type OrgDocsTab = "docs" | "contractors" | "archive";
type Tab = OrgDocsTab;
type Caps = { owner: boolean; schools: { id: string; name: string; view: boolean; create: boolean; edit: boolean; download: boolean }[]; group: { view: boolean; create: boolean; edit: boolean; download: boolean } };

const STATUS: Record<string, [string, string]> = {
  valid: ["سارية", "bg-primary/10 text-primary"], expiring: ["تنتهي خلال 30 يومًا", "bg-accent text-accent-foreground"],
  expired: ["منتهية", "bg-destructive/10 text-destructive"], none: ["بلا تاريخ انتهاء", "bg-muted text-muted-foreground"],
};

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

export function OrgDocsPage({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
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
    <div dir="rtl">
      <PageHeader eyebrow="إدارة المدارس" title="الوثائق والعقود" desc="وثائق المنشأة وعقود المتعهدين. ما تراه وما تستطيع تنزيله أو تعديله محدد بصلاحياتك لكل مدرسة." />
      <div role="tablist" aria-label="أقسام الوثائق" className="mb-5 grid gap-2 rounded-2xl border bg-muted/40 p-1.5 sm:inline-grid sm:grid-cols-3">
        {([["docs", "وثائق المنشأة", "السجلات والتراخيص والشهادات", FileText], ["contractors", "المتعهدون", "عقود الخدمات والشراكات المجتمعية", Handshake], ["archive", "الأرشيف", "الوثائق والمتعهدون المحذوفون", Archive]] as const).map(([k, l, d, I]) => {
          const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-start transition-colors ${on ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/60"}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}><I className="size-4" aria-hidden /></span>
              <span><span className={`block text-sm font-bold ${on ? "text-foreground" : ""}`}>{l}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
            </button>
          );
        })}
      </div>
      {tab === "docs" ? <Docs org={org} caps={c} /> : tab === "contractors" ? <Contractors org={org} caps={c} /> : <ArchivePane org={org} />}
    </div>
  );
}

function ArchiveButton({ org, type, record }: { org: string; type: "docs" | "contractors"; record: Doc | Con }) {
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: () => rpc("od_archive", { _org: org, _what: type, _id: record.id }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["od", org] });
      toast.success("نُقل السجل إلى الأرشيف");
    },
    onError: (error) => toast.error(arabicError(error)),
  });
  return <Button size="sm" variant="ghost" disabled={archive.isPending} aria-label={`حذف ${record.name}`} onClick={async () => {
    if (await ask(`نقل «${record.name}» إلى الأرشيف؟`)) archive.mutate();
  }}><Trash2 className="size-4" /><span className="sr-only">حذف</span></Button>;
}

const REPORT_FIELDS = ["النوع", "الاسم", "التصنيف", "تاريخ الأرشفة", "الحالة", "النطاق", "رقم الوثيقة", "جهة الإصدار", "تاريخ الإصدار", "تاريخ الانتهاء", "المدارس", "المسؤول", "الجوال", "البريد", "بداية السريان", "نهاية السريان", "شراكات مجتمعية", "الملاحظات", "المرفقات"];

function ArchivePane({ org }: { org: string }) {
  const [filters, setFilters] = useState({ type: "", category: "", from: "", to: "" });
  const list = useQuery({ queryKey: ["od", org, "archive"], queryFn: () => rpc<ArchiveRecord[]>("od_archive_list", { _org: org }) });
  if (list.isLoading) return <LoadingState />;
  if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const records = list.data ?? [];
  const categories = [...new Set(records.filter((r) => !filters.type || r.record_type === filters.type).map(recordCategory))].sort((a, b) => a.localeCompare(b, "ar"));
  const rows = filterArchive(records, filters);
  const report = (format: "excel" | "pdf" | "print") => {
    const meta = { title: "أرشيف الوثائق والعقود", filters: [filters.category, filters.from && `من ${filters.from}`, filters.to && `إلى ${filters.to}`].filter(Boolean) };
    const data = rows.map((r) => {
      const details = new Map(archiveDetails(r));
      return [recordType(r), r.name, recordCategory(r), archiveDay(r), STATUS[r.status]?.[0] ?? "—", ...REPORT_FIELDS.slice(5).map((k) => details.get(k) ?? "")];
    });
    if (format === "excel") return exportXlsx(meta, REPORT_FIELDS, data);
    if (format === "pdf") return exportPdf(meta, REPORT_FIELDS, data);
    return printReport(meta, REPORT_FIELDS, data);
  };
  return <section aria-label="الأرشيف" className="space-y-4">
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">النوع<select className={selectCls()} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value, category: "" })}><option value="">الكل</option><option value="docs">الوثائق</option><option value="contractors">المتعهدون</option></select></label>
      <label className="grid gap-1 text-sm">التصنيف<select className={selectCls()} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">كل التصنيفات</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="grid gap-1 text-sm">الأرشفة من<Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">الأرشفة إلى<Input type="date" min={filters.from || undefined} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
      <div className="flex flex-wrap gap-1 sm:ms-auto">
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => report("excel")}><Download className="size-4" />Excel</Button>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => void report("pdf")}><FileText className="size-4" />PDF</Button>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => report("print")}><Printer className="size-4" />طباعة</Button>
      </div>
    </div>
    {!rows.length ? <EmptyState title={records.length ? "لا توجد سجلات تطابق الفلاتر" : "لا توجد سجلات مؤرشفة"} /> : rows.map((r) => {
      const files = r.record_type === "docs" ? (r.file_id ? [{ id: r.file_id, name: r.file_name ?? "الملف" }] : []) : r.files;
      return <details key={`${r.record_type}:${r.id}`} className="rounded-lg border bg-card">
        <summary className="cursor-pointer p-3"><strong>{r.name}</strong><span className="ms-3 break-words text-sm text-muted-foreground">{recordType(r)} · {recordCategory(r)} · <bdi>{archiveDay(r)}</bdi></span></summary>
        <div className="space-y-3 border-t p-3">
          <Badge s={r.status} />
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{archiveDetails(r).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value || "—"}</dd></div>)}</dl>
          {r.can_download && files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f) => <Button key={f.id} size="sm" variant="outline" onClick={() => openOrgFile(f.id)}><Download className="size-4" />{f.name}</Button>)}</div>}
        </div>
      </details>;
    })}
  </section>;
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
      {edit && <DocForm key={edit.id ?? "new"} org={org} caps={caps} init={edit} close={() => setEdit(null)} />}
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
                  {can("edit", d.school_id) && <ArchiveButton org={org} type="docs" record={d} />}
                </td>
              </tr>))}</tbody></table>
        </div>
      )}
    </div>
  );
}

function DocForm({ org, caps, init, close }: { org: string; caps: Caps; init: Partial<Doc>; close: () => void }) {
  const qc = useQueryClient();
  const action = init.id ? "edit" : "create";
  const scopes = [...(caps.owner || caps.group[action] ? [["", "المجموعة كاملة"]] : []), ...caps.schools.filter((s) => caps.owner || s[action]).map((s) => [s.id, s.name])];
  const [f, setF] = useState({ kind: init.kind ?? "", name: init.name ?? "", doc_no: init.doc_no ?? "", issuer: init.issuer ?? "", issued_on: init.issued_on ?? "", expires_on: init.expires_on ?? "", school_id: init.id ? (init.school_id ?? "") : (scopes[0]?.[0] ?? "") });
  const [file, setFile] = useState<File | null>(null);
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
    <form className="mb-4 rounded-lg border bg-card p-4" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{init.id ? "تعديل وثيقة" : "وثيقة جديدة"}</h3><Button type="button" size="sm" variant="ghost" onClick={close} aria-label="إغلاق"><X className="size-4" /></Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="od-kind">نوع الوثيقة</Label><select id="od-kind" className={selectCls("w-full")} value={f.kind} onChange={set("kind")} required><option value="" disabled>اختر نوع الوثيقة</option>{withSavedOption(DOCUMENT_TYPES, init.kind).map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="od-name">اسم الوثيقة</Label><Input id="od-name" value={f.name} onChange={set("name")} required minLength={2} /></div>
        <div className="space-y-1"><Label htmlFor="od-no">رقم الوثيقة (اختياري)</Label><Input id="od-no" value={f.doc_no} onChange={set("doc_no")} /></div>
        <div className="space-y-1"><Label htmlFor="od-issuer">جهة الإصدار (اختيارية)</Label><Input id="od-issuer" value={f.issuer} onChange={set("issuer")} /></div>
        <div className="space-y-1"><Label htmlFor="od-issued">تاريخ الإصدار</Label><Input id="od-issued" type="date" value={f.issued_on} onChange={set("issued_on")} /></div>
        <div className="space-y-1"><Label htmlFor="od-expires">تاريخ الانتهاء</Label><Input id="od-expires" type="date" value={f.expires_on} onChange={set("expires_on")} /></div>
        <div className="space-y-1"><Label htmlFor="od-scope">النطاق</Label><select id="od-scope" className={selectCls()} value={f.school_id} onChange={set("school_id")}>{scopes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="od-file">المرفق (PDF أو صورة)</Label><Input id="od-file" type="file" accept={ATTACHMENT_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{init.file_name && !file && <p className="mt-1 text-xs text-muted-foreground"><FileText className="inline size-3" /> {init.file_name}</p>}</div>
      </div>
      <div className="mt-3 flex justify-end"><Button type="submit" disabled={save.isPending}>{save.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button></div>
    </form>
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
      <div className="mb-3 flex justify-end">{(caps.owner || caps.schools.some((s) => s.create)) && !edit && <Button size="sm" onClick={() => setEdit({})}><Plus className="size-4" />إضافة متعهد</Button>}</div>
      {edit && <ConForm key={edit.id ?? "new"} org={org} caps={caps} init={edit} close={() => setEdit(null)} />}
      <Filters {...{ caps, q, setQ, school, setSchool, status, setStatus }} />
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data?.length ? <EmptyState title="لا يوجد متعهدون" hint="أضف متعهدي المقصف والزي وغيرهم مع عقودهم." /> : (
        <div className="grid gap-3 md:grid-cols-2">{list.data.map((c) => (
          <article key={c.id} className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Handshake className="size-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="font-bold">{c.name}</h3>
                  {c.community_partner && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"><ShieldCheck className="size-3.5" aria-hidden />شراكات مجتمعية</span>}
                </div>
                <p className="text-xs text-muted-foreground">{c.service}</p>
              </div>
              <Badge s={c.status} />
            </div>
            <dl className="grid gap-1.5 text-sm">
              {c.contact_name && <div className="flex items-center gap-2"><UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden /><dt className="sr-only">المسؤول</dt><dd>{c.contact_name}</dd></div>}
              {c.phone && <div className="flex items-center gap-2"><Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden /><dt className="sr-only">الجوال</dt><dd dir="ltr">{c.phone}</dd></div>}
              {c.email && <div className="flex items-center gap-2"><Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden /><dt className="sr-only">البريد</dt><dd dir="ltr" className="truncate">{c.email}</dd></div>}
              <div className="flex items-center gap-2"><CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden /><dt className="sr-only">السريان</dt><dd>{c.starts_on ?? "—"} ← {c.ends_on ?? "—"}</dd></div>
              <div className="flex items-start gap-2"><School className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dt className="sr-only">المدارس</dt><dd className="flex flex-wrap gap-1">{c.schools.map((s) => <span key={s} className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{s}</span>)}</dd></div>
            </dl>
            {(c.files.length > 0 || all("edit", c.school_ids)) && <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
              {any("download", c.school_ids) && c.files.map((f) => <Button key={f.id} size="sm" variant="outline" onClick={() => openOrgFile(f.id)}><Download className="size-3" />{f.name}</Button>)}
              {all("edit", c.school_ids) && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setEdit(c)}><Pencil className="size-4" />تعديل</Button>}
              {all("edit", c.school_ids) && <ArchiveButton org={org} type="contractors" record={c} />}
            </div>}
          </article>))}</div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">{title}</legend>{children}</fieldset>;
}

function ConForm({ org, caps, init, close }: { org: string; caps: Caps; init: Partial<Con>; close: () => void }) {
  const qc = useQueryClient();
  const action = init.id ? "edit" : "create";
  const [f, setF] = useState({ name: init.name ?? "", service: init.service ?? "", contact_name: init.contact_name ?? "", phone: init.phone ?? "", email: init.email ?? "", starts_on: init.starts_on ?? "", ends_on: init.ends_on ?? "", notes: init.notes ?? "" });
  const [partner, setPartner] = useState(!!init.community_partner);
  const [schools, setSchools] = useState<string[]>(init.school_ids ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [tried, setTried] = useState(false);
  const problems = [
    ...(f.name.trim().length < 2 ? ["اكتب اسم المتعهد"] : []),
    ...(f.service.trim().length < 2 ? ["اختر نوع الخدمة"] : []),
    ...(!schools.length ? ["اختر مدرسة واحدة على الأقل"] : []),
    ...(f.starts_on && f.ends_on && f.ends_on < f.starts_on ? ["نهاية السريان قبل بدايته"] : []),
  ];
  const save = useMutation({
    mutationFn: async () => {
      const ids = [...(init.files ?? []).map((x) => x.id)];
      for (const file of files) ids.push(await uploadDraft(org, schools[0] ?? null, file));
      return rpc("od_save_contractor", { _org: org, _p: { ...f, id: init.id ?? null, school_ids: schools, file_ids: ids, community_partner: partner, starts_on: f.starts_on || null, ends_on: f.ends_on || null } });
    },
    onSuccess: () => { toast.success("حُفظ المتعهد"); void qc.invalidateQueries({ queryKey: ["od", org] }); close(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pickable = caps.schools.filter((s) => caps.owner || s[action]);
  return (
    <form className="mb-5 space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5" onSubmit={(e) => { e.preventDefault(); setTried(true); if (!problems.length) save.mutate(); }}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Handshake className="size-5" aria-hidden /></span>
        <div className="flex-1"><h3 className="font-bold">{init.id ? "تعديل متعهد" : "متعهد جديد"}</h3><p className="text-xs text-muted-foreground">بيانات المتعهد وعقده والمدارس التي يخدمها.</p></div>
        <Button type="button" size="icon" variant="ghost" onClick={close} aria-label="إغلاق"><X className="size-4" /></Button>
      </div>
      <Section title="بيانات المتعهد">
        <div className="space-y-1"><Label htmlFor="oc-n">اسم المتعهد</Label><Input id="oc-n" value={f.name} onChange={set("name")} placeholder="مؤسسة الريان للتغذية" /></div>
        <div className="space-y-1"><Label htmlFor="oc-s">نوع الخدمة</Label><select id="oc-s" className={selectCls("w-full")} value={f.service} onChange={set("service")}><option value="" disabled>اختر نوع الخدمة</option>{withSavedOption(SERVICE_TYPES, init.service).map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
      </Section>
      <Section title="التواصل">
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="oc-c">اسم المسؤول</Label><Input id="oc-c" value={f.contact_name} onChange={set("contact_name")} /></div>
        <div className="space-y-1"><Label htmlFor="oc-p">الجوال</Label><Input id="oc-p" value={f.phone} onChange={set("phone")} dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" /></div>
        <div className="space-y-1"><Label htmlFor="oc-e">البريد</Label><Input id="oc-e" type="email" value={f.email} onChange={set("email")} dir="ltr" placeholder="name@example.com" /></div>
      </Section>
      <Section title="العقد">
        <div className="space-y-1"><Label htmlFor="oc-sd">بداية السريان (اختيارية)</Label><Input id="oc-sd" type="date" value={f.starts_on} onChange={set("starts_on")} /></div>
        <div className="space-y-1"><Label htmlFor="oc-ed">نهاية السريان (اختيارية)</Label><Input id="oc-ed" type="date" value={f.ends_on} onChange={set("ends_on")} /></div>
        <div className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">العقد والمرفقات</span>
          <label htmlFor="oc-f" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-muted/30 p-3 text-sm hover:bg-muted/60">
            <Paperclip className="size-5 text-primary" aria-hidden />
            <span className="flex-1">{files.length ? files.map((x) => x.name).join("، ") : "اضغط لاختيار ملفات PDF أو صور"}</span>
            <span className="text-xs text-muted-foreground">حتى 20 ميجابايت</span>
          </label>
          <input id="oc-f" type="file" multiple className="sr-only" accept={ATTACHMENT_ACCEPT} onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          {!!init.files?.length && <p className="text-xs text-muted-foreground"><FileText className="inline size-3" /> محفوظ: {init.files.map((x) => x.name).join("، ")}</p>}
        </div>
      </Section>
      <fieldset className="rounded-xl border p-3"><legend className="px-1 text-sm font-semibold">المدارس المرتبطة</legend>
        <div className="flex flex-wrap gap-2">{pickable.map((s) => { const on = schools.includes(s.id); return (
          <button key={s.id} type="button" aria-pressed={on} onClick={() => setSchools(on ? schools.filter((x) => x !== s.id) : [...schools, s.id])}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{s.name}</button>); })}</div>
      </fieldset>
      <div className="space-y-1"><Label htmlFor="oc-no">ملاحظات (اختيارية)</Label><Textarea id="oc-no" rows={2} value={f.notes} onChange={set("notes")} /></div>
      <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${partner ? "border-primary bg-primary/5" : ""}`}>
        <input type="checkbox" className="mt-1 size-4 accent-primary" checked={partner} onChange={(e) => setPartner(e.target.checked)} />
        <span className="flex-1"><span className="flex items-center gap-1.5 font-semibold">شراكات مجتمعية {partner && <ShieldCheck className="size-4 text-primary" aria-hidden />}</span>
        </span>
      </label>
      {tried && problems.length > 0 && <ul role="alert" className="list-inside list-disc rounded-md bg-destructive/10 p-2 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button><Button type="button" variant="outline" onClick={close}>إلغاء</Button></div>
    </form>
  );
}
