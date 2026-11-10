import { createFileRoute } from "@tanstack/react-router";
import { HealthStudentPage } from "@/components/health/health-desk";

export const Route = createFileRoute("/_authenticated/app/health/$id")({
  head: () => ({ meta: [{ title: "الملف الصحي للطالب — ركاز" }, { name: "description", content: "البطاقة الصحية والأمراض والأدوية وسجل العيادة لطالب واحد." }] }),
  component: HealthStudentPage,
});
