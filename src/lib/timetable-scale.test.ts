import { describe, expect, it } from "vitest";
import { demoInput } from "./timetable-fixture";
import { verify } from "./timetable-model";
import { solve } from "./timetable-solver";
import type { TTInput } from "./timetable-model";

/** 6 copies of the demo school (30 sections, 66 teachers, own rooms each) — a larger school. */
function big(n: number): TTInput {
  const base = demoInput();
  const out: TTInput = { ...base, courses: [], teachers: [], rooms: [], unavailability: [], busy: [], slots: [] };
  for (let k = 0; k < n; k++) {
    const x = (id: string | null) => (id == null ? id : `${id}_${k}`);
    out.courses.push(...base.courses.map((c) => ({ ...c, id: x(c.id)!, section_id: x(c.section_id)!, teacher_id: x(c.teacher_id), section: `${c.section}-${k}` })));
    out.teachers.push(...base.teachers.map((t) => ({ ...t, id: x(t.id)! })));
    out.rooms.push(...base.rooms.map((r) => ({ ...r, id: x(r.id)! })));
    out.unavailability.push(...base.unavailability.map((u) => ({ ...u, teacher_id: x(u.teacher_id)! })));
  }
  return out;
}

describe("timetable at scale", () => {
  it("solves a 30-section school completely within 20s and verification passes", () => {
    const inp = big(6);
    const t0 = Date.now();
    const r = solve(inp, { mode: "fill", timeLimitMs: 20000 });
    const ms = Date.now() - t0;
    expect(r.status).toBe("done");
    expect(ms).toBeLessThan(20000);
    const v0 = Date.now();
    expect(verify(inp, r.slots)).toEqual([]);
    expect(Date.now() - v0).toBeLessThan(2000);
  }, 60000);
});
