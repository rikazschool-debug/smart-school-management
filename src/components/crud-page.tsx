import { useEffect, useRef, useState, type ReactNode } from "react";
import { ask, askText } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Filter, Printer, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PersonCard } from "@/components/people/person-card";
import { BulkBar } from "@/components/people/bulk-bar";
import { TagChip, usePpCaps, useSchoolOrg, useTags, type PersonKind, type Tag } from "@/components/people/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "email" | "select" | "checkbox";
  required?: boolean;
  options?: { table: string; label: string; filter?: Record<string, unknown>; order?: string } | { value: string; label: string }[];
  hideInForm?: boolean;
};

/** `text` gives the plain value for export when `render` returns JSX. */
export type Column = { label: string; render: (r: Row) => ReactNode; text?: (r: Row) => string | number | null | undefined };

/** Server-side filter. `path` defaults to key; `inner` names an embed made !inner while the filter is active
 *  (e.g. filter students by enrollments.section_id); `extra` adds fixed conditions with it. */
export type FilterDef = {
  key: string; label: string;
  options?: { value: string; label: string }[];
  remote?: { table: string; label: string; filter?: Record<string, unknown>; order?: string };
  path?: string; inner?: string; extra?: Record<string, unknown>;
};

const PAGE = 25;
const clean = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

export function useOptions(table: string, label: string, schoolId: string | null, filter?: Record<string, unknown>, order?: string) {
  return useQuery({
    queryKey: ["opts", table, schoolId, filter],
    enabled: !!schoolId,
    queryFn: async () => {
      let q = db.from(table).select(`id, ${label}`).eq("school_id", schoolId);
      for (const [k, v] of Object.entries(filter ?? {})) q = q.eq(k, v);
      const { data, error } = await q.order(order ?? label);
      if (error) throw error;
      return (data as Row[]).map((r) => ({ value: r["id"] as string, label: String(r[label]) }));
    },
  });
}

function SelectField({ f, schoolId, value, onChange }: { f: Field; schoolId: string; value: string; onChange: (v: string) => void }) {
  const o = f.options;
  const remote = o && !Array.isArray(o) ? o : null;
  const q = useOptions(remote?.table ?? "schools", remote?.label ?? "name", remote ? schoolId : null, remote?.filter, remote?.order);
  const opts = Array.isArray(o) ? o : (q.data ?? []);
  return (
    <select
      id={f.key}
      className={selectCls("w-full")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={f.required}
    >
      <option value="">— اختر —</option>
      {opts.map((x) => (
        <option key={x.value} value={x.value}>
          {x.label}
        </option>
      ))}
    </select>
  );
}

export function RecordForm({
  fields,
  schoolId,
  initial,
  onSubmit,
  submitting,
}: {
  fields: Field[];
  schoolId: string;
  initial: Row;
  onSubmit: (v: Row) => void;
  submitting: boolean;
}) {
  const autoDn = (n: unknown) => { const w = String(n ?? "").trim().split(/\s+/).filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : (w[0] ?? ""); };
  const hasDn = fields.some((f) => f.key === "display_name" && !f.hideInForm) && fields.some((f) => f.key === "full_name");
  const [v, setV] = useState<Row>(() => hasDn && !initial["display_name"] && initial["full_name"] ? { ...initial, display_name: autoDn(initial["full_name"]) } : initial);
  // display name follows first + last word of the full name until the user edits it
  const [dnTouched, setDnTouched] = useState(() => !!initial["display_name"] && initial["display_name"] !== autoDn(initial["full_name"]));
  const change = (key: string, val: unknown) => {
    if (key === "display_name") setDnTouched(true);
    setV((x) => ({ ...x, [key]: val, ...(hasDn && key === "full_name" && !dnTouched ? { display_name: autoDn(val) } : {}) }));
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e): void => {
        e.preventDefault();
        for (const f of fields)
          if (f.required && !f.hideInForm && (v[f.key] === undefined || v[f.key] === "" || v[f.key] === null))
            return void toast.error(`حقل «${f.label}» مطلوب`);
        const out: Row = {};
        for (const f of fields) {
          if (f.hideInForm) continue;
          let val = v[f.key];
          if (val === "" || val === undefined) val = null;
          if (f.type === "number" && val !== null) val = Number(val);
          if (f.type === "checkbox") val = !!val;
          out[f.key] = val;
        }
        onSubmit(out);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields
          .filter((f) => !f.hideInForm)
          .map((f) => (
            <div key={f.key} className={f.type === "checkbox" ? "flex items-center gap-2 pt-6" : "space-y-1.5"}>
              {f.type === "checkbox" ? (
                <>
                  <input id={f.key} type="checkbox" checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} />
                  <Label htmlFor={f.key}>{f.label}</Label>
                </>
              ) : (
                <>
                  <Label htmlFor={f.key}>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {f.type === "select" ? (
                    <SelectField f={f} schoolId={schoolId} value={v[f.key] ?? ""} onChange={(x) => setV({ ...v, [f.key]: x })} />
                  ) : (
                    <Input
                      id={f.key}
                      type={f.type ?? "text"}
                      value={v[f.key] ?? ""}
                      onChange={(e) => change(f.key, e.target.value)}
                    />
                  )}
                </>
              )}
            </div>
          ))}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting}>
          {submitting ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CrudTable({
  title, table, schoolId, select = "*", fields, columns, searchKeys, filter, filters, canWrite,
  canDelete = canWrite, canCreate = canWrite, order = "created_at", defaults, extraActions, toolbar, exportable = true, onCreated, onUpdated, person,
}: {
  title: string; table: string; schoolId: string; select?: string; fields: Field[]; columns: Column[];
  searchKeys: string[]; filter?: Record<string, unknown>; filters?: FilterDef[]; canWrite: boolean; /** hide the generic «إضافة» when a screen owns its own add flow */ canCreate?: boolean;
  canDelete?: boolean; order?: string; defaults?: Row; extraActions?: (r: Row) => ReactNode;
  /** extra buttons next to «إضافة» (e.g. import) */ toolbar?: ReactNode; exportable?: boolean;
  /** called with the new row after a successful create */ onCreated?: ((r: Row) => void) | undefined;
  /** called with the row id after a successful edit */ onUpdated?: ((id: string) => void) | undefined;
  /** people lists: name opens the side card; selection, tag filter and bulk actions (all re-checked on the server) */ person?: { kind: PersonKind } | undefined;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [fv, setFv] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setSearch(clean(input)); setPage(0); }, 300); return () => clearTimeout(t); }, [input]);
  const setFilter = (k: string, v: string) => { setFv((x) => ({ ...x, [k]: v })); setPage(0); };
  const active = (filters ?? []).filter((f) => fv[f.key]);
  const clearAll = () => { setInput(""); setSearch(""); setFv({}); setTagF(""); setPage(0); };
  // ---- people tools
  const caps = usePpCaps(person ? schoolId : null).data;
  const org = useSchoolOrg(person ? schoolId : null).data;
  const tagList = useTags(org, !!person && !!caps?.view).data ?? [];
  const kindTags = person ? tagList.filter((t) => t.kinds.includes(person.kind)) : [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagF, setTagF] = useState("");
  const tagIds = useQuery({ enabled: !!person && !!tagF, queryKey: ["pp-tag-ids", schoolId, person?.kind, tagF], queryFn: async () => {
    const { data, error } = await db.rpc("pp_tag_ids", { _school: schoolId, _kind: person!.kind, _tag: tagF }); if (error) throw error; return data as string[];
  } });
  const rowTags = useQuery({ enabled: !!person && !!caps?.view && kindTags.length > 0, queryKey: ["pp-row-tags", schoolId, person?.kind, kindTags.map((t) => t.id).join()], queryFn: async () => {
    const m = new Map<string, Tag[]>();
    for (const t of kindTags) {
      const { data, error } = await db.rpc("pp_tag_ids", { _school: schoolId, _kind: person!.kind, _tag: t.id }); if (error) throw error;
      for (const id of (data as string[]) ?? []) m.set(id, [...(m.get(id) ?? []), t]);
    }
    return m;
  } });
  const showTags = !!person && !!caps?.view;
  const qcTags = useQueryClient();
  async function setTag(id: string, tag: string, on: boolean) {
    const { error } = await db.rpc("pp_tag_set", { _kind: person!.kind, _id: id, _tag: tag, _on: on });
    if (error) return void toast.error(arabicError(error));
    await Promise.all([qcTags.invalidateQueries({ queryKey: ["pp-row-tags"] }), qcTags.invalidateQueries({ queryKey: ["pp-card"] }), qcTags.invalidateQueries({ queryKey: ["pp-tag-ids"] }), qcTags.invalidateQueries({ queryKey: ["pp-tags"] })]);
  }
  const tagsCell = (r: Row) => { const l = rowTags.data?.get(r["id"]) ?? []; return l.length ? <div className="flex flex-wrap gap-1">{l.map((t) => <TagChip key={t.id} t={t} />)}</div> : <span className="text-xs text-muted-foreground">—</span>; };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selAll, setSelAll] = useState(false);
  const names = useRef(new Map<string, string>());
  useEffect(() => { setSel(new Set()); setSelAll(false); }, [search, fv, tagF, schoolId]);
  const selecting = !!person && !!caps && (caps.bulk || caps.export);

  const build = (head = false, onlyIds?: string[], pick?: string) => {
    let sel = pick ?? select;
    for (const f of active) if (f.inner) sel = sel.replace(new RegExp(`\\b${f.inner}\\(`), `${f.inner}!inner(`);
    let qq = db.from(table).select(sel, { count: "exact", head }).eq("school_id", schoolId);
    for (const [k, v] of Object.entries(filter ?? {})) qq = qq.eq(k, v);
    for (const f of active) { const col = f.path ?? f.key; qq = fv[f.key] === "__none" ? qq.or(`${col}.is.null,${col}.eq.لا يوجد`) : qq.eq(col, fv[f.key]); for (const [k, v] of Object.entries(f.extra ?? {})) qq = qq.eq(k, v); }
    if (search && searchKeys.length) qq = qq.or(searchKeys.map((k) => `${k}.ilike.*${search}*`).join(","));
    if (tagF) qq = qq.in("id", tagIds.data?.length ? tagIds.data : ["00000000-0000-0000-0000-000000000000"]);
    if (onlyIds) qq = qq.in("id", onlyIds);
    return qq.order(order, { ascending: order !== "created_at" }).order("id");
  };
  // the key carries every parameter, so a slow older response can never overwrite the newer one
  const q = useQuery({
    queryKey: [table, schoolId, select, filter, search, fv, page, tagF, tagIds.data],
    enabled: !tagF || !!tagIds.data,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await build().range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data as Row[], count: (count ?? 0) as number };
    },
  });
  const total = useQuery({ queryKey: [table, schoolId, filter, "total"], queryFn: async () => {
    let qq = db.from(table).select("id", { count: "exact", head: true }).eq("school_id", schoolId);
    for (const [k, v] of Object.entries(filter ?? {})) qq = qq.eq(k, v);
    const { count } = await qq; return (count ?? 0) as number;
  } });
  const save = useMutation({
    mutationFn: async (v: Row) => {
      const payload = { ...defaults, ...v, school_id: schoolId };
      if (editing?.["id"]) { const res = await db.from(table).update(v).eq("id", editing["id"]); if (res.error) throw res.error; onUpdated?.(editing["id"] as string); return null; }
      const res = onCreated ? await db.from(table).insert(payload).select().single() : await db.from(table).insert(payload);
      if (res.error) throw res.error;
      return (res.data as Row | null) ?? null;
    },
    onSuccess: (row) => { toast.success("تم الحفظ"); setEditing(null); qc.invalidateQueries(); if (row && onCreated) onCreated(row); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from(table).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries(); },
    onError: (e) => toast.error(arabicError(e)),
  });

  const labelOf = useFilterLabels(filters ?? [], schoolId);
  const filterText = () => [...(search ? [`بحث: ${search}`] : []), ...active.map((f) => `${f.label}: ${labelOf(f.key, fv[f.key]!)}`)];
  const plain = (c: Column, r: Row) => { const t = c.text?.(r); if (t !== undefined) return t ?? ""; const v = c.render(r); return typeof v === "string" || typeof v === "number" ? v : ""; };
  async function doExport(kind: "xlsx" | "pdf" | "print", onlyIds?: string[]) {
    setExporting(true);
    try {
      const all: Row[] = [];
      if (onlyIds) {
        for (let i = 0; i < onlyIds.length; i += 150) {
          const { data, error } = await build(false, onlyIds.slice(i, i + 150)); if (error) throw error; all.push(...(data as Row[]));
        }
      } else for (let p = 0; p < 20; p++) {
        const { data, error } = await build().range(p * 1000, p * 1000 + 999);
        if (error) throw error;
        all.push(...(data as Row[])); if ((data as Row[]).length < 1000) break;
      }
      if (!all.length) { toast.error("لا توجد سجلات مطابقة للتصدير"); return; }
      const headers = columns.map((c) => c.label);
      const rows = all.map((r) => columns.map((c) => plain(c, r)));
      const meta = { title, school: document.querySelector("[data-school-name]")?.textContent ?? undefined, filters: filterText() };
      if (kind === "xlsx") exportXlsx(meta, headers, rows); else if (kind === "pdf") await exportPdf(meta, headers, rows); else printReport(meta, headers, rows);
      toast.success(`صُدّر ${all.length} سجل`);
    } catch (e) { toast.error(arabicError(e)); } finally { setExporting(false); }
  }

  const rows = q.data?.rows ?? [];
  for (const r of rows) names.current.set(r["id"], r["display_name"] || r["full_name"] || "");
  async function resolveIds(): Promise<string[]> {
    if (!selAll) return [...sel];
    const out: string[] = [];
    for (let p = 0; p < 2; p++) {
      const { data, error } = await build(false, undefined, "id, full_name, display_name").range(p * 1000, p * 1000 + 999);
      if (error) throw error;
      for (const r of data as Row[]) { out.push(r["id"]); names.current.set(r["id"], r["display_name"] || r["full_name"] || ""); }
      if ((data as Row[]).length < 1000) break;
    }
    return out;
  }
  const isSel = (id: string) => selAll || sel.has(id);
  const toggle = (id: string) => { if (selAll) { setSelAll(false); setSel(new Set(rows.map((r) => r["id"]).filter((x) => x !== id))); return; } setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const nameCell = (r: Row) => person && caps?.view
    ? <button type="button" className="text-start font-medium text-primary hover:underline" onClick={() => setOpenId(r["id"])}>{columns[0]?.render(r)}</button>
    : columns[0]?.render(r);
  const cell = (c: Column, i: number, r: Row) => i === 0 ? nameCell(r) : c.render(r);
  const count = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const filtering = !!search || active.length > 0;
  const selects = (filters ?? []).map((f) => <FilterSelect key={f.key} f={f} schoolId={schoolId} value={fv[f.key] ?? ""} onChange={(v) => setFilter(f.key, v)} />);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{total.data ?? "…"}</span>
        <div className="ms-auto flex flex-wrap gap-2">
          {toolbar}
          {exportable && (<>
            <Button variant="outline" size="sm" disabled={exporting || !count} onClick={() => doExport("xlsx")}><FileSpreadsheet className="size-4" /> تنزيل Excel</Button>
            <Button variant="outline" size="sm" disabled={exporting || !count} onClick={() => doExport("pdf")}><FileDown className="size-4" /> {exporting ? "جارٍ التجهيز…" : "تنزيل PDF"}</Button>
            <Button variant="ghost" size="sm" disabled={exporting || !count} onClick={() => doExport("print")} title="يفتح نافذة الطباعة في المتصفح"><Printer className="size-4" /> طباعة</Button>
          </>)}
          {canWrite && canCreate && <Button size="sm" onClick={() => setEditing({ ...(defaults ?? {}) })}><Plus className="size-4" /> إضافة</Button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pe-9" placeholder="بحث…" aria-label={`بحث في ${title}`} value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        {person && caps?.view && (
          <select aria-label="الوسم" disabled={kindTags.length === 0} title={kindTags.length === 0 ? "لا توجد وسوم بعد — أضفها من صفحة المدارس (قاموس الوسوم)" : undefined}
            className={selectCls("w-full md:w-auto")} value={tagF} onChange={(e) => { setTagF(e.target.value); setPage(0); }}>
            <option value="">{kindTags.length === 0 ? "الوسوم: لا توجد بعد" : "الوسم: الكل"}</option>
            {kindTags.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (معطل)"}</option>)}
          </select>
        )}
        {!!filters?.length && (<>
          <div className="hidden flex-wrap gap-2 md:flex">{selects}</div>
          <Sheet>
            <SheetTrigger asChild><Button variant="outline" size="sm" className="md:hidden"><Filter className="size-4" /> الفلاتر{active.length ? ` (${active.length})` : ""}</Button></SheetTrigger>
            <SheetContent side="bottom" dir="rtl" className="space-y-3">
              <SheetHeader><SheetTitle>فلاتر {title}</SheetTitle></SheetHeader>
              <div className="grid gap-2">{selects}</div>
              {active.length > 0 && <Button variant="ghost" onClick={clearAll}>مسح الفلاتر</Button>}
            </SheetContent>
          </Sheet>
        </>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span>{q.isFetching && !q.isLoading ? "جارٍ التحديث…" : `${count} نتيجة`}</span>
        {tagF && <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">الوسم: {kindTags.find((t) => t.id === tagF)?.name}</span>}
        {filterText().map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-foreground">{t}</span>)}
        {filtering && <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={clearAll}><X className="size-3" /> مسح الفلاتر</button>}
      </div>
      {selecting && (sel.size > 0 || selAll) && caps && (
        <BulkBar kind={person!.kind} schoolId={schoolId} caps={caps} tags={kindTags} count={sel.size} mode={selAll ? "all" : "ids"} total={count} pageCount={rows.length}
          onPage={() => { setSelAll(false); setSel((x) => new Set([...x, ...rows.map((r) => r["id"])])); }} onAll={() => setSelAll(true)}
          onClear={() => { setSel(new Set()); setSelAll(false); }} resolveIds={resolveIds} nameOf={(id) => names.current.get(id)}
          onExport={(ids) => doExport("xlsx", ids)} />
      )}
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        filtering || (total.data ?? 0) > 0
          ? <EmptyState title="لا نتائج مطابقة" hint="غيّر البحث أو امسح الفلاتر." />
          : <EmptyState title="لا توجد سجلات" hint={canWrite ? "ابدأ بإضافة أول سجل." : undefined} />
      ) : (<>
        <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
          <Table>
            <TableHeader><TableRow>
              {selecting && <TableHead className="w-8"><input type="checkbox" aria-label="تحديد هذه الصفحة" className="size-4 accent-primary"
                checked={rows.length > 0 && rows.every((r) => isSel(r["id"]))} onChange={(e) => { setSelAll(false); setSel((x) => { const n = new Set(x); for (const r of rows) e.target.checked ? n.add(r["id"]) : n.delete(r["id"]); return n; }); }} /></TableHead>}
              {columns.map((c) => <TableHead key={c.label} className="text-start">{c.label}</TableHead>)}
              {showTags && <TableHead className="text-start">الوسوم</TableHead>}
              {(canWrite || extraActions) && <TableHead className="text-start">إجراءات</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r["id"]} data-state={isSel(r["id"]) ? "selected" : undefined}>
                  {selecting && <TableCell><input type="checkbox" aria-label={`تحديد ${names.current.get(r["id"]) ?? ""}`} className="size-4 accent-primary" checked={isSel(r["id"])} onChange={() => toggle(r["id"])} /></TableCell>}
                  {columns.map((c, i) => <TableCell key={c.label}>{cell(c, i, r)}</TableCell>)}
                  {showTags && <TableCell>{tagsCell(r)}</TableCell>}
                  {(canWrite || extraActions) && <TableCell className="whitespace-nowrap"><Actions r={r} /></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="space-y-2 md:hidden">
          {rows.map((r) => (
            <li key={r["id"]} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-start gap-2 font-medium">
                {selecting && <input type="checkbox" aria-label={`تحديد ${names.current.get(r["id"]) ?? ""}`} className="mt-1 size-5 accent-primary" checked={isSel(r["id"])} onChange={() => toggle(r["id"])} />}
                <div className="min-w-0 flex-1">{nameCell(r)}</div>
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {columns.slice(1).map((c) => <div key={c.label} className="min-w-0"><dt className="text-muted-foreground">{c.label}</dt><dd className="break-words">{c.render(r)}</dd></div>)}
                {showTags && <div className="col-span-2"><dt className="text-muted-foreground">الوسوم</dt><dd>{tagsCell(r)}</dd></div>}
              </dl>
              {(canWrite || extraActions) && <div className="mt-2 flex flex-wrap gap-1 border-t pt-2"><Actions r={r} /></div>}
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
            <span>صفحة {page + 1} من {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>التالي</Button>
          </div>
        )}
      </>)}
      {person && <PersonCard kind={person.kind} id={openId} org={org} onClose={() => setOpenId(null)} />}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.["id"] ? "تعديل" : "إضافة"} — {title}</DialogTitle></DialogHeader>
          {editing && person && editing["id"] && caps?.tags_assign && (
            <div className="space-y-1.5 rounded-lg border p-3">
              <Label>الوسوم <span className="text-xs font-normal text-muted-foreground">(تُحفظ فور الضغط)</span></Label>
              {kindTags.filter((t) => t.active).length === 0 ? <p className="text-xs text-muted-foreground">لا توجد وسوم لهذا النوع بعد — أضفها من قسم «الوسوم» في القائمة الجانبية.</p> : (
                <div className="flex flex-wrap gap-2">
                  {kindTags.filter((t) => t.active || rowTags.data?.get(editing["id"])?.some((x) => x.id === t.id)).map((t) => {
                    const on = !!rowTags.data?.get(editing["id"])?.some((x) => x.id === t.id);
                    return (
                      <button key={t.id} type="button" aria-pressed={on} onClick={() => void setTag(editing["id"], t.id, !on)}
                        className={`rounded-full border-2 ${on ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
                        <TagChip t={{ name: (on ? "✓ " : "+ ") + t.name, color: t.color }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {editing && <RecordForm fields={fields} schoolId={schoolId} initial={editing} onSubmit={(v) => save.mutate(v)} submitting={save.isPending} />}
        </DialogContent>
      </Dialog>
    </section>
  );

  function Actions({ r }: { r: Row }) {
    return (<>
      {extraActions?.(r)}
      {canWrite && <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => setEditing(r)}><Pencil className="size-4" /></Button>}
      {canDelete && <Button variant="ghost" size="icon" aria-label="حذف" onClick={async () => { if (await ask("تأكيد الحذف؟ لن يُحذف السجل إن كان مرتبطًا بسجلات أخرى.", { destructive: true, ok: "حذف" })) del.mutate(r["id"]); }}><Trash2 className="size-4 text-destructive" /></Button>}
    </>);
  }
}

function FilterSelect({ f, schoolId, value, onChange }: { f: FilterDef; schoolId: string; value: string; onChange: (v: string) => void }) {
  const q = useOptions(f.remote?.table ?? "schools", f.remote?.label ?? "name", f.remote ? schoolId : null, f.remote?.filter, f.remote?.order);
  const opts = f.options ?? q.data ?? [];
  return (
    <select aria-label={f.label} className={selectCls("w-full md:w-auto")} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{f.label}: الكل</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Labels for active filter chips (remote options read from the same cached option queries). */
function useFilterLabels(filters: FilterDef[], schoolId: string) {
  const qc = useQueryClient();
  return (key: string, value: string) => {
    const f = filters.find((x) => x.key === key);
    if (!f) return value;
    const opts = f.options ?? (qc.getQueryData(["opts", f.remote?.table, schoolId, f.remote?.filter]) as { value: string; label: string }[] | undefined) ?? [];
    return opts.find((o) => o.value === value)?.label ?? value;
  };
}
