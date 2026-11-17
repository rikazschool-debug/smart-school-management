import { describe, expect, it } from "vitest";
import { floorsOf, mapStats, roomProblems, type Room } from "@/components/school-map/model";

const room = (o: Partial<Room>): Room => ({ id: "x", building_id: "b", category: "classroom", name: "1/أ", code: null, floor: 0, capacity: null, area: null, status: "ready", resp_user: null, resp_name: null, resp_roles: [], resp_title: null, resp_phone: null, resp_notes: null, equipment: null, notes: null, updated_at: "", ...o });

describe("school map", () => {
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
});
