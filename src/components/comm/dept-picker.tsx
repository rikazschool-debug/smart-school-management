import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { ROLE_AR } from "@/lib/comm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
export type DeptRow = { id: string; name: string; school_id: string; school_name: string; people: { user_id: string; name: string; role: string }[] };

/** Departments of every selected branch (grouped by branch) with the people linked to each one.
 *  The server (hub_dept_people) returns only branches the caller may draft/publish/organize in. */
export function DeptPicker({ org, schools, value, onChange }: { org: string | null; schools: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const q = useQuery({
    enabled: !!org && schools.length > 0,
    queryKey: ["hub-dept-people", org, [...schools].sort()],
    queryFn: async () => { const { data, error } = await db.rpc("hub_dept_people" as never, { _org: org, _schools: schools } as never); if (error) throw error; return (data ?? []) as DeptRow[]; },
  });
  if (!schools.length) return null;
  if (q.isLoading) return <p className="text-xs text-muted-foreground">جارٍ تحميل الأقسام…</p>;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-xs text-muted-foreground">لا توجد أقسام في الفروع المختارة.</p>;
  const byBranch = new Map<string, DeptRow[]>();
  for (const d of rows) byBranch.set(d.school_name, [...(byBranch.get(d.school_name) ?? []), d]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-2" aria-label="الأقسام والأشخاص">
      {[...byBranch.entries()].map(([branch, ds]) => (
        <div key={branch} className="rounded-lg border p-2">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{branch}</p>
          <ul className="space-y-1">
            {ds.map((d) => (
              <li key={d.id}>
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                    <input type="checkbox" aria-label={`قسم ${d.name} — ${branch}`} checked={value.includes(d.id)} onChange={() => toggle(d.id)} onClick={(e) => e.stopPropagation()} />
                    <span>{d.name}</span>
                    <span className="text-xs text-muted-foreground">({d.people.length} شخص — اضغط للعرض)</span>
                  </summary>
                  <ul className="ms-6 mt-1 flex flex-wrap gap-1">
                    {!d.people.length ? <li className="text-xs text-muted-foreground">لا يوجد أشخاص مرتبطون بالقسم</li>
                      : d.people.map((p: Row) => <li key={p.user_id} className="rounded-full bg-muted px-2 py-0.5 text-xs">{p.name} · {ROLE_AR[p.role] ?? p.role}</li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
