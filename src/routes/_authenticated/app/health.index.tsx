import { createFileRoute } from "@tanstack/react-router";
import { HealthDesk } from "@/components/health/health-desk";

export const Route = createFileRoute("/_authenticated/app/health/")({
  head: () => ({ meta: [{ title: "الصحة المدرسية — ركاز" }, { name: "description", content: "الملفات الصحية للطلاب وجدول الأدوية اليومي وسجل العيادة المدرسية." }] }),
  component: HealthDesk,
});
