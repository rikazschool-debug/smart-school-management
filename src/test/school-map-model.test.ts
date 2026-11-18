import { describe, expect, it } from "vitest";
import { floorsOf, mapPrintScope, mapStats, roomProblems, type Building, type Room } from "@/components/school-map/model";

const room = (o: Partial<Room>): Room => ({ id: "x", building_id: "b", category: "classroom", name: "1/أ", code: null, floor: 0, capacity: null, area: null, status: "ready", resp_user: null, resp_name: null, resp_roles: [], resp_title: null, resp_phone: null, resp_notes: null, equipment: null, notes: null, updated_at: "", ...o });

describe("school map", () => {
  const building = (id: string): Building => ({ id, name: id, floors: 1, has_basement: false, notes: null, image_file_id: null, image_name: null, image_mime: null, updated_at: "" });
  const map = { buildings: [building("main"), building("annex"), building("office")], rooms: [
    room({ id: "lab-1", building_id: "main", category: "lab" }), room({ id: "class-1", building_id: "main" }),
    room({ id: "lab-2", building_id: "annex", category: "lab" }), room({ id: "office-1", building_id: "office", category: "office" }),
  ] };
  it("prints only the selected category across branch buildings", () => {
    const printed = mapPrintScope(map, "lab");
    expect(printed.rooms.map((r) => r.id)).toEqual(["lab-1", "lab-2"]);
    expect(printed.buildings.map((b) => b.id)).toEqual(["main", "annex"]);
  });
  it("prints the full map when no category is selected", () => {
    expect(mapPrintScope(map, "")).toEqual(map);
  });
  it("does not count a room without capacity as zero seats", () => {
    const s = mapStats([room({ capacity: 30 }), room({ capacity: null })]);
    expect(s.capacity).toBe(30);
    expect(s.withCapacity).toBe(1);
    expect(s.rooms).toBe(2);
  });
  it("groups counts per category and flags rooms with no responsible", () => {
    const s = mapStats([room({ category: "lab", resp_user: "u" }), room({ category: "lab" }), room({ category: "classroom", status: "maintenance" })]);
    expect(s.byCat).toEqual([{ cat: "classroom", count: 1, capacity: 0 }, { cat: "lab", count: 2, capacity: 0 }]);
    expect(s.noResp).toBe(2);
    expect(s.maintenance).toBe(1);
  });
  it("draws floors top to bottom with the basement last", () => {
    expect(floorsOf({ floors: 3, has_basement: true })).toEqual([2, 1, 0, -1]);
  });
  it("refuses a floor the building does not have", () => {
    expect(roomProblems({ name: "مختبر", floor: 3, capacity: "", area: "" }, { floors: 2, has_basement: false })).toContain("الدور غير موجود في هذا المبنى");
    expect(roomProblems({ name: "مختبر", floor: -1, capacity: "", area: "" }, { floors: 2, has_basement: false })).toContain("الدور غير موجود في هذا المبنى");
    expect(roomProblems({ name: "مختبر", floor: 1, capacity: "24", area: "" }, { floors: 2, has_basement: false })).toEqual([]);
  });
  it("requires the authorized person's name when responsible details are entered", () => {
    const base = { name: "مختبر", floor: 0, capacity: "", area: "" };
    expect(roomProblems({ ...base, resp_title: "معلم" }, { floors: 2, has_basement: false })).toContain("اختر اسم المخوَّل من منسوبي الفرع");
    expect(roomProblems({ ...base, resp_title: "معلم", resp_user: "u1" }, { floors: 2, has_basement: false })).toEqual([]);
    expect(roomProblems(base, { floors: 2, has_basement: false })).toEqual([]);
  });
});
