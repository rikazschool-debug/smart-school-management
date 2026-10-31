import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { arabicError, useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/platform")({ component: Page });

function Page() {
  const { active } = useSession();
  const ok = active?.role === "platform_admin";
  const q = useQuery({
    queryKey: ["platform-orgs"],
    enabled: ok,
    queryFn: async () => {
      const { data, error } = await db.from("organizations").select("*, schools(id)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  if (!ok) return <ForbiddenState />;
  return (
    <>
      <PageHeader title="المؤسسات المشتركة" desc="عرض كل المؤسسات على المنصة وعدد مدارسها." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد مؤسسات بعد" /> : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead className="text-start">المؤسسة</TableHead><TableHead className="text-start">المدارس</TableHead><TableHead className="text-start">التسجيل</TableHead><TableHead className="text-start">الحالة</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data.map((o) => (
                <TableRow key={o["id"]}>
                  <TableCell>{o["name"]}</TableCell>
                  <TableCell>{o["schools"]?.length ?? 0}</TableCell>
                  <TableCell>{new Date(o["created_at"]).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{o["is_active"] ? "نشطة" : "موقوفة"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
