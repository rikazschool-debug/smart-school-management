import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MeetingRoom } from "@/components/admin/meeting-room";
import { ForbiddenState, PageHeader } from "@/components/states";
import { useSession } from "@/lib/session";
import { NAV_BY_ROLE } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/admin/room/$id")({
  head: () => ({ meta: [{ title: "غرفة الاجتماع الافتراضي | ركاز" }, { name: "description", content: "صوت جماعي ومشاركة شاشة لاجتماعات الموظفين" }] }),
  component: Room,
});

function Room() {
  const { id } = Route.useParams();
  const { active } = useSession();
  const nav = useNavigate();
  // staff only; the database decides whether this person is invited
  if (!active || (active.role !== "guardian" && !NAV_BY_ROLE[active.role].includes("meetings"))) return <ForbiddenState />;
  return (
    <div className="space-y-3">
      <Link to="/app/admin/meetings/$id" params={{ id }} className="text-sm text-primary">← تفاصيل الاجتماع</Link>
      <PageHeader title="الاجتماع الافتراضي" desc="صوت جماعي ومشاركة شاشة. الدخول للمدعوين فقط." />
      <MeetingRoom meetingId={id} onExit={() => nav({ to: "/app/admin/meetings/$id", params: { id } })} />
    </div>
  );
}
