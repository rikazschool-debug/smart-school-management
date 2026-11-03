import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError } from "@/lib/session";

/** «نطاق الوكلاء والمشرفين»: the principal sets each vice's departments/teachers and each supervisor's teachers.
 *  Writes only through set_staff_scope (principal level, audited); the scope is re-checked on every request by vice_teacher_ids / supervised_teacher_ids. */
export function StaffScopes({ schoolId }: { schoolId: string }) {
  const q = useQuery({
    queryKey: ["staff-scopes", schoolId],
    queryFn: async () => {
      const [list, depts, teachers] = await Promise.all([
        db.rpc("staff_scope_list" as never, { _school: schoolId } as never),
        db.from("departments").select("id, name").eq("school_id", schoolId).order("name"),
        db.from("teachers").select("id, full_name, department_id, status").eq("school_id", schoolId).order("full_name"),
      ]);
      if (list.error) throw list.error;
      return { people: (list.data ?? []) as unknown as Row[], depts: (depts.data ?? []) as Row[], teachers: (teachers.data ?? []) as Row[] };
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const { people, depts, teachers } = q.data!;
  if (!people.length) return <EmptyState title="لا يوجد وكلاء أو مشرفون نشطون في المدرسة" hint="يضيف مالك المؤسسة الحسابات والأدوار من «المستخدمون والأدوار»." />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">تشابه الدور لا يعني تشابه النطاق: لكل وكيل أقسامه ومعلموه، ولكل مشرف معلموه المسندون إليه. يُطبَّق التغيير فورًا على الجدول والتكليفات والبيانات.</p>
      {people.map((p) => <ScopeCard key={`${p["user_id"]}-${p["kind"]}`} schoolId={schoolId} p={p} depts={depts} teachers={teachers} />)}
    </div>
  );
}

function ScopeCard({ schoolId, p, depts, teachers }: { schoolId: string; p: Row; depts: Row[]; teachers: Row[] }) {
  const qc = useQueryClient();
  const vice = p["kind"] === "vice";
  const [d, setD] = useState<string[]>(p["departments"] ?? []);
  const [t, setT] = useState<string[]>(p["teachers"] ?? []);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setD(p["departments"] ?? []); setT(p["teachers"] ?? []); }, [p]);
  const viaDept = useMemo(() => new Set(teachers.filter((x) => x["department_id"] && d.includes(x["department_id"])).map((x) => x["id"] as string)), [teachers, d]);
  const shown = teachers.filter((x) => !filter.trim() || String(x["full_name"]).includes(filter.trim()));
  const dirty = JSON.stringify([...d].sort()) !== JSON.stringify([...(p["departments"] ?? [])].sort()) || JSON.stringify([...t].sort()) !== JSON.stringify([...(p["teachers"] ?? [])].sort());
  const total = new Set([...viaDept, ...t]).size;
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  return (
    <section className="rounded-2xl border bg-card p-4" data-testid="scope-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{p["full_name"]}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{vice ? "وكيل" : "مشرف تربوي"}</span>
        <span className="text-xs text-muted-foreground">{total ? `${total} معلم ضمن النطاق` : "لا يوجد نطاق — لا يرى أي معلم"}</span>
        <Button size="sm" className="ms-auto" disabled={!dirty || busy} onClick={async () => {
          setBusy(true);
          const { error } = await db.rpc("set_staff_scope" as never, { _school: schoolId, _user: p["user_id"], _kind: p["kind"], _departments: vice ? d : [], _teachers: t } as never);
          setBusy(false);
          if (error) return void toast.error(arabicError(error));
          toast.success("حُفظ النطاق"); qc.invalidateQueries({ queryKey: ["staff-scopes", schoolId] });
        }}>{busy ? "جارٍ الحفظ…" : "حفظ النطاق"}</Button>
      </div>
      {vice && (
        <div className="mb-3">
          <p className="mb-1 text-sm font-medium">الأقسام (كل معلمي القسم)</p>
          {!depts.length ? <p className="text-xs text-muted-foreground">لا توجد أقسام بعد.</p> : (
            <div className="flex flex-wrap gap-2">
              {depts.map((x) => (
                <label key={x["id"]} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                  <input type="checkbox" checked={d.includes(x["id"])} onChange={() => toggle(d, setD, x["id"])} />{x["name"]}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mb-1 text-sm font-medium">{vice ? "معلمون إضافيون بالاسم" : "المعلمون المسندون"}</p>
      <Input className="mb-2 sm:w-64" placeholder="ابحث باسم المعلم" aria-label="بحث المعلمين" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {shown.map((x) => {
          const inherited = vice && viaDept.has(x["id"]);
          return (
            <label key={x["id"]} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${inherited ? "bg-primary/5" : ""}`}>
              <input type="checkbox" checked={inherited || t.includes(x["id"])} disabled={inherited} onChange={() => toggle(t, setT, x["id"])} />
              {x["full_name"]}{x["status"] && x["status"] !== "active" ? " (غير نشط)" : ""}{inherited ? " — عبر القسم" : ""}
            </label>
          );
        })}
      </div>
    </section>
  );
}
