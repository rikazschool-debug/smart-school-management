import { useMemo, useState, type ReactNode } from "react";
import { ask, askText } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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

export type Column = { label: string; render: (r: Row) => ReactNode };

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
  title,
  table,
  schoolId,
  select = "*",
  fields,
  columns,
  searchKeys,
  filter,
  filters,
  canWrite,
  canDelete = canWrite,
  order = "created_at",
  defaults,
  extraActions,
}: {
  title: string;
  table: string;
  schoolId: string;
  select?: string;
  fields: Field[];
  columns: Column[];
  searchKeys: string[];
  filter?: Record<string, unknown>;
  filters?: { key: string; label: string; options: { value: string; label: string }[] }[];
  canWrite: boolean;
  canDelete?: boolean;
  order?: string;
  defaults?: Row;
  extraActions?: (r: Row) => ReactNode;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [fv, setFv] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const key = [table, schoolId, select, filter];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      let qq = db.from(table).select(select).eq("school_id", schoolId);
      for (const [k, v] of Object.entries(filter ?? {})) qq = qq.eq(k, v);
      const { data, error } = await qq.order(order, { ascending: order !== "created_at" });
      if (error) throw error;
      return data as Row[];
    },
  });
  const save = useMutation({
    mutationFn: async (v: Row) => {
      const payload = { ...defaults, ...v, school_id: schoolId };
      const res = editing?.["id"]
        ? await db.from(table).update(v).eq("id", editing["id"])
        : await db.from(table).insert(payload);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditing(null);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(arabicError(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(arabicError(e)),
  });
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter(
      (r) =>
        (!s || searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(s))) &&
        Object.entries(fv).every(([k, v]) => !v || String(r[k]) === v),
    );
  }, [q.data, search, fv, searchKeys]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{q.data?.length ?? 0}</span>
        <div className="ms-auto flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="w-52 pe-9" placeholder="بحث…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filters?.map((f) => (
            <select
              key={f.key}
              aria-label={f.label}
              className={selectCls(undefined)}
              value={fv[f.key] ?? ""}
              onChange={(e) => setFv({ ...fv, [f.key]: e.target.value })}
            >
              <option value="">{f.label}: الكل</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {canWrite && (
            <Button onClick={() => setEditing({})}>
              <Plus className="size-4" /> إضافة
            </Button>
          )}
        </div>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد سجلات" hint={canWrite ? "ابدأ بإضافة أول سجل." : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.label} className="text-start">
                    {c.label}
                  </TableHead>
                ))}
                {(canWrite || extraActions) && <TableHead className="text-start">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r["id"]}>
                  {columns.map((c) => (
                    <TableCell key={c.label}>{c.render(r)}</TableCell>
                  ))}
                  {(canWrite || extraActions) && (
                    <TableCell className="whitespace-nowrap">
                      {extraActions?.(r)}
                      {canWrite && (
                        <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => setEditing(r)}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف"
                          onClick={async () => { if (await ask("تأكيد الحذف؟ لن يُحذف السجل إن كان مرتبطًا بسجلات أخرى.", { destructive: true, ok: "حذف" })) del.mutate(r["id"]); }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.["id"] ? "تعديل" : "إضافة"} — {title}</DialogTitle>
          </DialogHeader>
          {editing && (
            <RecordForm fields={fields} schoolId={schoolId} initial={editing} onSubmit={(v) => save.mutate(v)} submitting={save.isPending} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
