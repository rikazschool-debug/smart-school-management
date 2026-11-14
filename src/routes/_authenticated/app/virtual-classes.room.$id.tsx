import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MeetingRoom } from "@/components/admin/meeting-room";
import { ForbiddenState, PageHeader } from "@/components/states";
import { useSession } from "@/lib/session";
import { NAV_BY_ROLE } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/virtual-classes/room/$id")({
  head: () => ({ meta: [{ title: "غرفة الحصة الافتراضية | ركاز" }, { name: "description", content: "صوت جماعي ومشاركة شاشة بين المعلم وطلاب الفصل" }] }),
  component: Room,
});

function Room() {
  const { id } = Route.useParams();
  const { active } = useSession();
  const nav = useNavigate();
  // the database decides who may enter (course teacher hosts, currently enrolled students join)
  if (!active || !NAV_BY_ROLE[active.role].includes("virtual")) return <ForbiddenState />;
  return (
    <div className="space-y-3">
      <Link to="/app/virtual-classes" className="text-sm text-primary">← الحصص الافتراضية</Link>
      <PageHeader title="الحصة الافتراضية" desc="المعلم يدير الصوت ومشاركة الشاشة؛ ارفع يدك لطلب الكلام." />
      <MeetingRoom meetingId={id} onExit={() => nav({ to: "/app/virtual-classes" })} />
    </div>
  );
}
