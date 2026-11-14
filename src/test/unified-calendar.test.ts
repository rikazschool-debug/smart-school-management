import { describe, expect, it } from "vitest";
import { mergeCalendar } from "@/components/events/calendar";

describe("unified calendar merge", () => {
  it("keeps event sessions and admin items with their kinds, Riyadh day and links", () => {
    const r = mergeCalendar(
      [{ item_id: "e1", kind: "trip", title: "رحلة", status: "published", school: "أ", starts_at: "2026-11-10T21:30:00Z", ends_at: null, session: null }],
      [{ kind: "meeting", id: "m1", title: "اجتماع", day: "2026-11-10", start_time: "09:00:00", end_time: "10:00:00", status: "scheduled", link: "/app/admin/meetings/m1" }],
    );
    expect(r.map((x) => [x.kind, x.day, x.start])).toEqual([["meeting", "2026-11-10", "09:00"], ["trip", "2026-11-11", "00:30"]]);
    expect(r[0]!.link).toBe("/app/admin/meetings/m1");
  });
  it("shows an org meeting returned for two branches only once", () => {
    const m = { kind: "meeting", id: "m1", title: "اجتماع", day: "2026-11-10", start_time: null, end_time: null, status: "scheduled", link: "x" };
    expect(mergeCalendar([], [m, { ...m }])).toHaveLength(1);
  });
});
