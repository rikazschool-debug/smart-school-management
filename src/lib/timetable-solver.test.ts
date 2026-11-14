import { describe, expect, it } from "vitest";
import { demoInput } from "./timetable-fixture";
import { Model, hasDouble, readiness, verify } from "./timetable-model";
import { solve } from "./timetable-solver";

describe("timetable solver", () => {
  it("solves the 5-section / 10-teacher demo completely and the independent verifier finds no violation", () => {
    const inp = demoInput();
    expect(readiness(inp, "fill").filter((x) => x.level === "block")).toEqual([]);
    const r = solve(inp, { mode: "fill", timeLimitMs: 15000 });
    expect(r.status).toBe("done");
    expect(verify(inp, r.slots)).toEqual([]);
    for (const c of inp.courses) expect(r.slots.filter((s) => s.course_id === c.id).length).toBe(c.weekly);
    const m = new Model(inp);
    for (const c of inp.courses.filter((x) => x.needs_double)) expect(hasDouble(m, r.slots, c.id)).toBe(true);
  });

  it("'no last two periods' holds every day, including the shorter Thursday", () => {
    const inp = demoInput();
    const r = solve(inp, { mode: "fill", timeLimitMs: 15000 });
    const m = new Model(inp);
    for (const d of m.days) {
      const les = m.dayLessons.get(d)!;
      const last2 = les.slice(-2);
      expect(r.slots.some((s) => s.teacher_id === "t5" && s.day === d && last2.includes(s.period_id))).toBe(false);
    }
    expect(m.dayLessons.get(4)!.length).toBe(6);
    expect(m.dayLessons.get(0)!.length).toBe(7);
    // t6: only Monday
    const mon = m.dayLessons.get(1)!.slice(-2);
    expect(r.slots.some((s) => s.teacher_id === "t6" && s.day === 1 && mon.includes(s.period_id))).toBe(false);
    expect(r.slots.some((s) => s.teacher_id === "t4" && s.day === 3)).toBe(false);
  });

  it("weekly and daily teacher caps are never exceeded", () => {
    const inp = demoInput();
    inp.teachers.find((t) => t.id === "t3")!.daily_max = 4;
    const r = solve(inp, { mode: "fill", timeLimitMs: 15000 });
    for (const d of [0, 1, 2, 3, 4]) expect(r.slots.filter((s) => s.teacher_id === "t3" && s.day === d).length).toBeLessThanOrEqual(4);
    expect(verify(inp, r.slots)).toEqual([]);
  });

  it("impossible case (24 lessons, only 20 available) is reported, not forced", () => {
    const inp = demoInput();
    const t = inp.teachers.find((x) => x.id === "t1")!; t.weekly_max = 30; t.daily_max = 4;
    inp.courses.filter((c) => c.teacher_id === "t1").forEach((c) => (c.weekly = 8, c.daily_max = 2));
    const block = readiness(inp, "fill").filter((x) => x.level === "block");
    expect(block.some((b) => b.text.includes("معلم 1") && b.text.includes("20"))).toBe(true);
    const r = solve(inp, { mode: "fill", timeLimitMs: 4000 });
    expect(r.status).not.toBe("done");
    expect(verify(inp, r.slots)).toEqual([]);
    expect(r.slots.filter((s) => s.teacher_id === "t1").length).toBeLessThanOrEqual(20);
  });

  it("a soft preference is never satisfied by breaking a hard rule, and misses are listed", () => {
    const inp = demoInput();
    // t2 prefers no first period; t2 teaches 3×6=18 so some first periods may be needed — fine, but hard rules still hold
    const r = solve(inp, { mode: "fill", timeLimitMs: 15000 });
    expect(verify(inp, r.slots)).toEqual([]);
    const m = new Model(inp);
    const firsts = r.slots.filter((s) => s.teacher_id === "t2" && m.dayLessons.get(s.day)![0] === s.period_id);
    expect(r.softMisses.filter((x) => x.startsWith("معلم 2")).length).toBe(firsts.length);
  });

  it("redistribute keeps pinned slots; fill keeps everything and only adds", () => {
    const inp = demoInput();
    const first = solve(inp, { mode: "fill", timeLimitMs: 15000 });
    const pinned = first.slots.slice(0, 10).map((s, i) => ({ ...s, id: `x${i}`, pinned: true }));
    const loose = first.slots.slice(10, 40).map((s, i) => ({ ...s, id: `y${i}`, pinned: false }));
    const r1 = solve({ ...inp, slots: [...pinned, ...loose] }, { mode: "redistribute", timeLimitMs: 15000, seed: 99 });
    expect(r1.kept.map((s) => s.id).sort()).toEqual(pinned.map((s) => s.id).sort());
    expect(verify(inp, [...pinned, ...r1.slots])).toEqual([]);
    expect(r1.status).toBe("done");
    const r2 = solve({ ...inp, slots: [...pinned, ...loose] }, { mode: "fill", timeLimitMs: 15000 });
    expect(r2.kept.length).toBe(40);
    expect(verify(inp, [...pinned, ...loose, ...r2.slots])).toEqual([]);
    expect(pinned.length + loose.length + r2.slots.length).toBe(inp.courses.reduce((a, c) => a + c.weekly, 0));
  });

  it("courses without a live assignment or teachers without a load are skipped with a reason", () => {
    const inp = demoInput();
    inp.courses[0]!.teacher_id = null;
    const r = solve(inp, { mode: "fill", timeLimitMs: 15000 });
    expect(r.perCourse[0]!.placed).toBe(0);
    expect(r.perCourse[0]!.reason).toContain("تكليف");
    expect(r.slots.some((s) => s.teacher_id === "t11")).toBe(false);
  });

  it("fill rebuilds a broken double lesson: the missing lesson goes next to the remaining one", () => {
    const inp = demoInput();
    const m = new Model(inp);
    const first = solve(inp, { mode: "fill", timeLimitMs: 15000 }).slots.map((s, i) => ({ ...s, id: `z${i}`, pinned: false }));
    const dbl = inp.courses.find((c) => c.needs_double)!;
    // remove one half of the double so only singles remain for that course
    const day = [...new Set(first.filter((s) => s.course_id === dbl.id).map((s) => s.day))].find((d) => first.filter((s) => s.course_id === dbl.id && s.day === d).length >= 2)!;
    const half = first.find((s) => s.course_id === dbl.id && s.day === day)!;
    const kept = first.filter((s) => s.id !== half.id);
    expect(hasDouble(m, kept, dbl.id)).toBe(false);
    const r = solve({ ...inp, slots: kept }, { mode: "fill", timeLimitMs: 15000 });
    expect(r.status).toBe("done");
    expect(r.slots.length).toBe(1);
    expect(hasDouble(m, [...kept, ...r.slots], dbl.id)).toBe(true);
    expect(verify(inp, [...kept, ...r.slots])).toEqual([]);
  });
});
