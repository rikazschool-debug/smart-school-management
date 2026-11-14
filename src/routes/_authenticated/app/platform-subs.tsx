import { createFileRoute } from "@tanstack/react-router";
import { PlatformSubs } from "@/components/platform/platform-subs";

export const Route = createFileRoute("/_authenticated/app/platform-subs")({
  head: () => ({ meta: [{ title: "الاشتراكات والصلاحيات — ركاز" }, { name: "description", content: "إدارة باقات واشتراكات المجموعات." }] }),
  component: PlatformSubs,
});
