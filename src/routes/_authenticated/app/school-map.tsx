import { createFileRoute } from "@tanstack/react-router";
import { SchoolMap } from "@/components/school-map/school-map";

export const Route = createFileRoute("/_authenticated/app/school-map")({
  head: () => ({ meta: [{ title: "الخريطة المدرسية — ركاز" }, { name: "description", content: "مباني الفرع وأدوارها وغرفها مصنّفة مع المسؤول المخوَّل عن كل غرفة وإحصاء بسيط." }, { property: "og:title", content: "الخريطة المدرسية — ركاز" }, { property: "og:description", content: "الفصول والمختبرات والمعامل والقاعات ومسؤولوها." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: SchoolMap,
});
