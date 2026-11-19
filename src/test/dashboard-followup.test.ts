import { describe, expect, it } from "vitest";
import { absenceLink, sortAbsences, type StaffAbsence } from "@/components/dashboard/follow-up";
import { workSummary } from "@/components/dashboard/work-panel";
import { satWeekStart } from "@/components/dashboard/week-calendar";

const a = (p: Partial<StaffAbsence>): StaffAbsence => ({ employee_id: p.name ?? "x", name: "x", job_title: null, category: "admin", teacher_id: null, status: "absent", date: "2026-11-19", recorded: false, ...p });

describe("dashboard follow-up", () => {
  it("lists teacher absences before administrative staff", () => {
    const out = sortAbsences([a({ name: "إداري", category: "admin" }), a({ name: "معلم", category: "teacher", teacher_id: "t1", status: "not_in" })]);
    expect(out.map((x) => x.name)).toEqual(["معلم", "إداري"]);
  });
  it("opens the substitutes tab with the absent teacher and day picked", () => {
    expect(absenceLink(a({ category: "teacher", teacher_id: "t1" }))).toEqual({ to: "/app/schedule", search: { tab: "subs", teacher: "t1", date: "2026-11-19" } });
  });
  it("sends administrative absences to the HR fingerprint report", () => {
    expect(absenceLink(a({ category: "admin" })).to).toBe("/app/hr/attendance");
  });
});

describe("homework/tests switch", () => {
  it("counts homework and tests separately", () => {
    const rows = [{ kind: "test", status: "published" }, { kind: "homework", status: "closed" }, { kind: "test", status: "draft" }];
    expect(workSummary(rows, "test").total).toBe(2);
    expect(workSummary(rows, "homework").total).toBe(1);
  });
});

describe("weekly calendar", () => {
  it("weeks start on Saturday", () => {
    expect(satWeekStart("2026-11-19")).toBe("2026-11-14"); // Thursday → previous Saturday
    expect(satWeekStart("2026-11-14")).toBe("2026-11-14");
  });
});
