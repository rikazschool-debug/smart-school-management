import { useEffect, useState, type ReactNode } from "react";
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
  const [v, setV] = useState<Row>(initial);
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
                      onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
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
  canDelete = canWrite, order = "created_at", defaults, extraActions, toolbar, exportable = true, onCreated,
}: {
  title: string; table: string; schoolId: string; select?: string; fields: Field[]; columns: Column[];
  searchKeys: string[]; filter?: Record<string, unknown>; filters?: FilterDef[]; canWrite: boolean;
  canDelete?: boolean; order?: string; defaults?: Row; extraActions?: (r: Row) => ReactNode;
  /** extra buttons next to «إضافة» (e.g. import) */ toolbar?: ReactNode; exportable?: boolean;
  /** called with the new row after a successful create */ onCreated?: (r: Row) => void;
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
  const clearAll = () => { setInput(""); setSearch(""); setFv({}); setPage(0); };

  const build = (head = false) => {
    let sel = select;
    for (const f of active) if (f.inner) sel = sel.replace(new RegExp(`\\b${f.inner}\\(`), `${f.inner}!inner(`);
    let qq = db.from(table).select(sel, { count: "exact", head }).eq("school_id", schoolId);
    for (const [k, v] of Object.entries(filter ?? {})) qq = qq.eq(k, v);
    for (const f of active) { qq = qq.eq(f.path ?? f.key, fv[f.key]); for (const [k, v] of Object.entries(f.extra ?? {})) qq = qq.eq(k, v); }
    if (search && searchKeys.length) qq = qq.or(searchKeys.map((k) => `${k}.ilike.*${search}*`).join(","));
    return qq.order(order, { ascending: order !== "created_at" }).order("id");
  };
  // the key carries every parameter, so a slow older response can never overwrite the newer one
  const q = useQuery({
    queryKey: [table, schoolId, select, filter, search, fv, page],
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
      if (editing?.["id"]) { const res = await db.from(table).update(v).eq("id", editing["id"]); if (res.error) throw res.error; return null; }
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
  async function doExport(kind: "xlsx" | "pdf" | "print") {
    setExporting(true);
    try {
      const all: Row[] = [];
      for (let p = 0; p < 20; p++) {
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
          {canWrite && <Button size="sm" onClick={() => setEditing({})}><Plus className="size-4" /> إضافة</Button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pe-9" placeholder="بحث…" aria-label={`بحث في ${title}`} value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
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
        {filterText().map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-foreground">{t}</span>)}
        {filtering && <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={clearAll}><X className="size-3" /> مسح الفلاتر</button>}
      </div>
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
              {columns.map((c) => <TableHead key={c.label} className="text-start">{c.label}</TableHead>)}
              {(canWrite || extraActions) && <TableHead className="text-start">إجراءات</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r["id"]}>
                  {columns.map((c) => <TableCell key={c.label}>{c.render(r)}</TableCell>)}
                  {(canWrite || extraActions) && <TableCell className="whitespace-nowrap"><Actions r={r} /></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="space-y-2 md:hidden">
          {rows.map((r) => (
            <li key={r["id"]} className="rounded-xl border bg-card p-3 text-sm">
              <div className="font-medium">{columns[0]?.render(r)}</div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {columns.slice(1).map((c) => <div key={c.label} className="min-w-0"><dt className="text-muted-foreground">{c.label}</dt><dd className="break-words">{c.render(r)}</dd></div>)}
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
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.["id"] ? "تعديل" : "إضافة"} — {title}</DialogTitle></DialogHeader>
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
