import { createFileRoute } from "@tanstack/react-router";
import { PlatformNotices } from "@/components/platform/platform-notices";

export const Route = createFileRoute("/_authenticated/app/platform-notices")({
  head: () => ({ meta: [{ title: "إشعارات المنصة — ركاز" }, { name: "description", content: "إرسال إشعارات المنصة إلى المجموعات والفروع." }] }),
  component: PlatformNotices,
});
