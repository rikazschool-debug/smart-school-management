/** School map (fm_* RPCs). Pure helpers only — rights are decided on the server (fm_save_room / fm_save_building). */
export type RoomCat = "classroom" | "lab" | "workshop" | "hall" | "library" | "office" | "staff" | "clinic" | "prayer" | "sports" | "canteen" | "storage" | "restroom" | "other";
export const CATS: Record<RoomCat, string> = {
  classroom: "الفصول الدراسية", lab: "المختبرات", workshop: "المعامل", hall: "القاعات", library: "المكتبة ومصادر التعلم",
  office: "المكاتب الإدارية", staff: "غرف المعلمين", clinic: "العيادة", prayer: "المصلى", sports: "الصالات والملاعب",
  canteen: "المقصف", storage: "المستودعات", restroom: "دورات المياه", other: "أخرى",
};
export const CAT_ORDER = Object.keys(CATS) as RoomCat[];
export const ROOM_STATUS: Record<string, string> = { ready: "جاهزة", maintenance: "تحت الصيانة", closed: "مغلقة" };

export type Building = { id: string; name: string; floors: number; has_basement: boolean; notes: string | null; image_file_id: string | null; image_name: string | null; image_mime: string | null; updated_at: string };
export type Room = {
  id: string; building_id: string; category: RoomCat; name: string; code: string | null; floor: number; capacity: number | null; area: number | null; status: string;
  resp_user: string | null; resp_name: string | null; resp_roles: string[]; resp_title: string | null; resp_phone: string | null; resp_notes: string | null;
  equipment: string | null; notes: string | null; updated_at: string;
};
export type MapData = { buildings: Building[]; rooms: Room[] };
export type Caps = { owner: boolean; schools: { id: string; name: string; view: boolean; create: boolean; edit: boolean }[] };

const ORD = ["الأرضي", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
export const floorLabel = (f: number) => (f < 0 ? "القبو" : f === 0 ? "الدور الأرضي" : `الدور ${ORD[f] ?? f}`);
/** Floors of a building from top to bottom, as drawn on the map. */
export const floorsOf = (b: Pick<Building, "floors" | "has_basement">) => {
  const out: number[] = [];
  for (let f = b.floors - 1; f >= 0; f--) out.push(f);
  if (b.has_basement) out.push(-1);
  return out;
};

export type Stats = {
  rooms: number; capacity: number; withCapacity: number; noResp: number; maintenance: number; closed: number;
  byCat: { cat: RoomCat; count: number; capacity: number }[];
};
/** Counts come only from saved rooms; a room without a capacity adds nothing to capacity (never counted as zero seats). */
export function mapStats(rooms: Room[]): Stats {
  const by = new Map<RoomCat, { count: number; capacity: number }>();
  let capacity = 0, withCapacity = 0, noResp = 0, maintenance = 0, closed = 0;
  for (const r of rooms) {
    const c = by.get(r.category) ?? { count: 0, capacity: 0 };
    c.count++;
    if (r.capacity != null) { c.capacity += r.capacity; capacity += r.capacity; withCapacity++; }
    by.set(r.category, c);
    if (!r.resp_user && !r.resp_title) noResp++;
    if (r.status === "maintenance") maintenance++;
    if (r.status === "closed") closed++;
  }
  return { rooms: rooms.length, capacity, withCapacity, noResp, maintenance, closed, byCat: CAT_ORDER.filter((k) => by.has(k)).map((k) => ({ cat: k, ...by.get(k)! })) };
}

export function filterRooms(rooms: Room[], q: string, cat: string, status: string): Room[] {
  const s = q.trim();
  return rooms.filter((r) => (!cat || r.category === cat) && (!status || r.status === status)
    && (!s || [r.name, r.code, r.resp_name, r.resp_title, r.equipment].some((v) => v?.includes(s))));
}

/** Client mirror of fm_save_room checks, so the form explains problems before sending. */
export function roomProblems(p: { name: string; floor: number; capacity: string; area: string }, b: Pick<Building, "floors" | "has_basement"> | undefined): string[] {
  const out: string[] = [];
  if (!b) out.push("اختر المبنى");
  if (!p.name.trim()) out.push("اكتب اسم الغرفة");
  if (b && (p.floor >= b.floors || (p.floor < 0 && !b.has_basement) || p.floor < -1)) out.push("الدور غير موجود في هذا المبنى");
  if (p.capacity && (!/^\d+$/.test(p.capacity) || Number(p.capacity) > 5000)) out.push("السعة رقم صحيح من 0 إلى 5000");
  if (p.area && !(Number(p.area) > 0)) out.push("المساحة رقم أكبر من صفر");
  return out;
}
