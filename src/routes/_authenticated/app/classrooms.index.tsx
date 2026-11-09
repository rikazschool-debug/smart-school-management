import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { School } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { ListTools, applyListTools, useListTools } from "@/components/list-tools";
import { NAV_BY_ROLE } from "@/lib/roles";
import { arabicError, useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/classrooms/")({ component: Page });

/** Section rooms (one per class+section) the caller can open; subject classrooms live inside each. */
function useSectionRooms(schoolId: string | null) {
  return useQuery({
    queryKey: ["section-rooms", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await db.rpc("section_rooms_list", { _school: schoolId });
      if (error) throw error;
      return data as Row[];
    },
  });
}

function Page() {
  const { active } = useSession();
  const q = useSectionRooms(active?.schoolId ?? null);
  const t = useListTools();
  if (!active || !NAV_BY_ROLE[active.role].includes("classrooms")) return <ForbiddenState />;
  return (
    <>
      <PageHeader title="الفصول الرقمية" desc="فصل رقمي واحد لكل صف وشعبة، وداخله المواد ومعلموها ومشاركاتها. تظهر لك الفصول والمواد التي تخصك فقط." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState title="لا توجد فصول رقمية" hint="يُنشأ الفصل تلقائيًا عند اعتماد تكليف معلم بمقرر." />
      ) : (() => { const rows = applyListTools(t, q.data, (c) => c["title"] ?? ""); return <>
        <ListTools s={t} placeholder="ابحث باسم الصف أو الشعبة" count={rows.length} exp={{ title: "الفصول الرقمية", school: active.schoolName, headers: ["الفصل", "المواد", "المشاركات"], rows: () => rows.map((c) => [c["title"], c["subjects"], c["posts"]]) }} />
        {rows.length ? <ClassroomGrid rows={rows} /> : <EmptyState title="لا نتائج مطابقة" hint="غيّر كلمة البحث." />}
      </>; })()}
    </>
  );
}

function ClassroomGrid({ rows }: { rows: Row[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((c) => (
        <Link key={c["id"]} to="/app/classrooms/section/$id" params={{ id: c["id"] }} className="group rounded-2xl border bg-card p-5 shadow-sm hover:border-primary">
          <School className="mb-3 size-6 text-primary" />
          <p className="font-bold leading-relaxed group-hover:text-primary">{c["title"]}</p>
          {c["subjects"] != null && <p className="mt-1 text-sm text-muted-foreground">{c["subjects"]} مادة · {c["posts"]} مشاركة</p>}
        </Link>
      ))}
    </div>
  );
}
