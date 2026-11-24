import { useQuery } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { SF_KEY } from "@/lib/student-finance/labels";

const norm = (v: string) => v.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[\s+\-]/g, "").replace(/^(00966|966|0)(?=5)/, "");
/** One search for finance lists: student name/ID/number + guardian name/ID/mobile (sf_search_index, finance-view only). */
export function useStudentSearch(schoolId: string) {
  const idx = useQuery({ queryKey: [...SF_KEY, "search-index", schoolId], queryFn: async () => { const { data, error } = await db.rpc("sf_search_index", { _school: schoolId }); if (error) throw error; return data as Record<string, string>; }, retry: false, staleTime: 60_000 });
  return (q: string, studentId: unknown, ...fallback: unknown[]) => {
    const t = norm(q.trim()); if (!t) return true;
    const hay = norm([idx.data?.[String(studentId)] ?? "", ...fallback.map((x) => String(x ?? ""))].join(" "));
    return t.split(/\s+/).every((w) => hay.includes(w)) || hay.includes(t);
  };
}
export const SEARCH_HINT = "بحث باسم الطالب أو ولي الأمر أو الهوية أو الجوال";
