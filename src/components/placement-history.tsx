import { useQuery } from "@tanstack/react-query";
import { History, MapPin } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { arabicError } from "@/lib/session";

const ST: Record<string, string> = { active: "حالي", ended: "منتهٍ", transferred: "منقول", withdrawn: "منسحب", completed: "مكتمل" };
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-SA-u-nu-latn") : "—");
export const placementLabel = (e?: Row) => (e ? `${e["sections"]?.grades?.name ?? ""} / شعبة ${e["sections"]?.name ?? ""}` : "");

export function usePlacements(studentId: string) {
  return useQuery({ queryKey: ["placements", studentId], queryFn: async () => {
    const { data, error } = await db.from("enrollments").select("id, status, start_date, end_date, created_at, sections(name, grades(name, stages(name))), academic_years(name)").eq("student_id", studentId).order("created_at", { ascending: false });
    if (error) throw error; return data as unknown as Row[];
  } });
}

/** Current and previous placements of one student (read via RLS). */
export function PlacementHistory({ studentId }: { studentId: string }) {
  const q = usePlacements(studentId);
  if (q.isLoading) return <p className="text-xs text-muted-foreground">جارٍ تحميل التسكين…</p>;
  if (q.error) return <p className="text-xs text-destructive">{arabicError(q.error)}</p>;
  const rows = q.data ?? []; const cur = rows.find((r) => r["status"] === "active"); const past = rows.filter((r) => r !== cur);
  return (
    <div className="space-y-3">
      {cur ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2 font-bold text-primary"><MapPin className="size-4" />التسكين الحالي</div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[["المرحلة", cur["sections"]?.grades?.stages?.name], ["الصف", cur["sections"]?.grades?.name], ["الشعبة", cur["sections"]?.name], ["العام", cur["academic_years"]?.name], ["منذ", d(cur["start_date"] ?? cur["created_at"])]].map(([k, v]) => <div key={k as string}><span className="block text-muted-foreground">{k}</span><span className="font-medium">{(v as string) || "—"}</span></div>)}
          </div>
        </div>
      ) : <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">الطالب غير مسكّن حاليًا.</p>}
      {past.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground"><History className="size-3.5" />التسكينات السابقة ({past.length})</div>
          <ul className="max-h-32 divide-y overflow-y-auto rounded-md border text-xs">{past.map((r) => (
            <li key={r["id"]} className="flex flex-wrap items-center justify-between gap-2 p-2"><span className="font-medium">{placementLabel(r)}</span><span className="text-muted-foreground">{r["academic_years"]?.name ?? ""} · {d(r["start_date"] ?? r["created_at"])} ← {d(r["end_date"])} · {ST[r["status"]] ?? r["status"]}</span></li>))}</ul>
        </div>
      )}
    </div>
  );
}
