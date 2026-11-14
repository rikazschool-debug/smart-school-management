/** Sections of a digital classroom (section room). The server (section_room_get) decides what each viewer actually receives. */
export type RoomTab = "subjects" | "students" | "guardians" | "group";
export type RoomView = "staff" | "teacher" | "family";
export const ROOM_TABS: [RoomTab, string][] = [["subjects", "المواد والمعلمون"], ["students", "الطلاب"], ["guardians", "أولياء الأمور"], ["group", "مجموعة الفصل"]];

/** staff (principal/owner/vice/affairs…): all four; teacher: no guardians list; guardian/student: subjects/teachers and the class group (no rosters). */
export function roomTabsFor(view: RoomView): RoomTab[] {
  if (view === "staff") return ["subjects", "students", "guardians", "group"];
  if (view === "teacher") return ["subjects", "students", "group"];
  return ["subjects", "group"];
}

/** Sidebar mirror by membership role (no data yet in the menu); the page re-derives from the server view. */
export function roomTabsForRole(role: string): RoomTab[] {
  if (role === "guardian" || role === "student") return roomTabsFor("family");
  if (["org_owner", "principal", "vice_principal", "student_affairs", "platform_admin"].includes(role)) return roomTabsFor("staff");
  return roomTabsFor("teacher");
}
