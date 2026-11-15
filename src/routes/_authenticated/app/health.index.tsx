import { createFileRoute } from "@tanstack/react-router";
import { HealthDesk } from "@/components/health/health-desk";
import { HealthCalendar } from "@/components/health/calendar";
import { useSession } from "@/lib/session";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/health/")({
  head: () => ({ meta: [{ title: "التوجيه الصحي — ركاز" }, { name: "description", content: "الملفات الصحية للطلاب والمناسبات الصحية الموثقة." }, { property: "og:title", content: "التوجيه الصحي — ركاز" }, { property: "og:description", content: "الملفات الصحية والمناسبات والحملات الموثقة من وزارة الصحة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});
function Page() {
  const { active } = useSession();
  if (active?.role !== "nurse" || !active.schoolId) return <HealthDesk />;
  return <Tabs defaultValue="files" dir="rtl"><TabsList className="mb-5"><TabsTrigger value="files">الملفات الصحية</TabsTrigger><TabsTrigger value="calendar">المناسبات الصحية</TabsTrigger></TabsList><TabsContent value="files"><HealthDesk /></TabsContent><TabsContent value="calendar"><HealthCalendar school={active.schoolId} /></TabsContent></Tabs>;
}
