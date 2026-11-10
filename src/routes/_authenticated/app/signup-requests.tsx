import { createFileRoute } from "@tanstack/react-router";
import { SignupRequestsPage } from "@/components/platform/signup-requests";

export const Route = createFileRoute("/_authenticated/app/signup-requests")({
  head: () => ({ meta: [{ title: "طلبات التسجيل — ركاز" }, { name: "description", content: "طلبات المدارس الواردة من صفحة إنشاء حساب." }] }),
  component: SignupRequestsPage,
});
