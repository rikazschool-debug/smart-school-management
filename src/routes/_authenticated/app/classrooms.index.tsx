import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { School } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { ListTools, applyListTools, useListTools } from "@/components/list-tools";
import { NAV_BY_ROLE } from "@/lib/roles";
import { arabicError, useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/classrooms/")({ component: Page });

export function useClassrooms(schoolId: string | null) {
  return useQuery({
    queryKey: ["classrooms", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await db.from("classrooms").select("id, title, status, course_id").eq("school_id", schoolId).order("title");
      if (error) throw error;
      return data as Row[];
    },
  });
}

function Page() {
  const { active } = useSession();
  const q = useClassrooms(active?.schoolId ?? null);
  const t = useListTools();
  if (!active || !NAV_BY_ROLE[active.role].includes("classrooms")) return <ForbiddenState />;
  return (
    <>
      <PageHeader title="الفصول الرقمية" desc="فصل واحد لكل مقرر معتمد (مادة + شعبة + سنة). تظهر لك الفصول التي تخصك فقط." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState title="لا توجد فصول رقمية" hint="يُنشأ الفصل تلقائيًا عند اعتماد تكليف معلم بمقرر." />
      ) : (() => { const rows = applyListTools(t, q.data, (c) => c["title"] ?? ""); return <>
        <ListTools s={t} placeholder="ابحث باسم المادة أو الشعبة" count={rows.length} exp={{ title: "الفصول الرقمية", school: active.schoolName, headers: ["الفصل", "الحالة"], rows: () => rows.map((c) => [c["title"], c["status"] === "active" ? "نشط" : c["status"] ?? ""]) }} />
        {rows.length ? <ClassroomGrid rows={rows} /> : <EmptyState title="لا نتائج مطابقة" hint="غيّر كلمة البحث." />}
      </>; })()}
    </>
  );
}

export function ClassroomGrid({ rows }: { rows: Row[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((c) => (
        <Link key={c["id"]} to="/app/classrooms/$id" params={{ id: c["id"] }} className="group rounded-2xl border bg-card p-5 shadow-sm hover:border-primary">
          <School className="mb-3 size-6 text-primary" />
          <p className="font-bold leading-relaxed group-hover:text-primary">{c["title"]}</p>
        </Link>
      ))}
    </div>
  );
}
