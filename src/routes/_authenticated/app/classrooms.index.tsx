import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, GraduationCap, MessageSquare, School, Users } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { ListTools, applyListTools, useListTools } from "@/components/list-tools";
import { NAV_BY_ROLE } from "@/lib/roles";
import { arabicError, useSession } from "@/lib/session";
import { useSchoolPerms } from "@/lib/school-perms";

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
  const permissions = useSchoolPerms(active?.schoolId);
  if (!active || (!NAV_BY_ROLE[active.role].includes("classrooms") && !permissions?.["bt_classroom.view"]) || permissions?.["bt_classroom.view"] === false) return <ForbiddenState />;
  return (
    <>
      <PageHeader title="الفصول الرقمية" desc="فصل رقمي واحد لكل صف وشعبة، وداخله المواد ومعلموها ومشاركاتها. تظهر لك الفصول والمواد التي تخصك فقط." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState title="لا توجد فصول رقمية" hint="يُنشأ الفصل تلقائيًا لكل شعبة فور إنشائها." />
      ) : (() => { const rows = applyListTools(t, q.data, (c) => c["title"] ?? ""); return <>
        <ListTools s={t} placeholder="ابحث باسم الصف أو الشعبة" count={rows.length} exp={{ title: "الفصول الرقمية", school: active.schoolName, headers: ["الفصل", "المواد", "المعلمون", "الطلاب", "المشاركات"], rows: () => rows.map((c) => [c["title"], c["subjects"], c["teachers"], c["students"] ?? "—", c["posts"]]) }} />
        {rows.length ? <ClassroomGrid rows={rows} /> : <EmptyState title="لا نتائج مطابقة" hint="غيّر كلمة البحث." />}
      </>; })()}
    </>
  );
}

function Stat({ icon: I, n, label }: { icon: typeof School; n: unknown; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-lg bg-muted/60 px-2 py-2">
      <I className="mb-1 size-4 shrink-0 text-primary" />
      <span className="text-base font-bold tabular-nums">{n == null ? "—" : String(n)}</span>
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function ClassroomGrid({ rows }: { rows: Row[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((c) => (
        <Link key={c["id"]} to="/app/classrooms/section/$id" params={{ id: c["id"] }}
          className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
          <div className="flex items-start gap-3 bg-gradient-to-l from-primary/15 to-transparent p-5">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-xl font-black">{c["section"] ?? "؟"}</span>
            </div>
            <div className="min-w-0 flex-1">
              {c["stage"] && <p className="truncate text-xs font-medium text-primary">{c["stage"]}</p>}
              <p className="truncate text-lg font-bold group-hover:text-primary">{c["grade"] ?? c["title"]}</p>
              <p className="truncate text-sm text-muted-foreground">شعبة {c["section"]}{c["year"] ? ` · ${c["year"]}` : ""}</p>
            </div>
            {c["mine"] && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">فصلي</span>}
          </div>
          <div className="grid grid-cols-4 gap-2 p-4 pt-3">
            <Stat icon={BookOpen} n={c["subjects"]} label="مادة" />
            <Stat icon={GraduationCap} n={c["teachers"]} label="معلم" />
            <Stat icon={Users} n={c["students"]} label="طالب" />
            <Stat icon={MessageSquare} n={c["posts"]} label="مشاركة" />
          </div>
          <div className="mt-auto flex items-center justify-between border-t px-4 py-2.5 text-sm text-primary">
            <span>{Number(c["subjects"]) ? "دخول الفصل" : "فصل جديد — لم تُضف مواد بعد"}</span>
            <ArrowLeft className="size-4 transition group-hover:-translate-x-1" />
          </div>
        </Link>
      ))}
    </div>
  );
}
