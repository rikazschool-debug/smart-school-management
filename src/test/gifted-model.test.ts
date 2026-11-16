import { describe, expect, it } from "vitest";
import { gtSearch, nomActions, nomIssues } from "@/components/gifted/model";
describe("gifted nominations", () => {
  it("cannot send without a domain", () => expect(nomIssues([], [{ domain: "", note: "ملاحظة كافية الطول", date: "2026-11-01" }], "2026-11-16")).toContain("اختر مجالًا واحدًا على الأقل"));
  it("rejects short indicator text", () => expect(nomIssues(["creative"], [{ domain: "creative", note: "قصير", date: "2026-11-01" }], "2026-11-16").length).toBe(1));
  it("rejects future evidence dates", () => expect(nomIssues(["creative"], [{ domain: "creative", note: "ملاحظة كافية الطول", date: "2026-12-01" }], "2026-11-16")).toEqual(["المؤشر 1: التاريخ بعد اليوم"]));
  it("decided nominations have no actions", () => { expect(nomActions("approved")).toEqual([]); expect(nomActions("rejected")).toEqual([]); expect(nomActions("draft")).toEqual([]); });
  it("review can no longer go back to review", () => expect(nomActions("review")).not.toContain("review"));
  it("drops unknown tab and bad id", () => expect(gtSearch({ tab: "x", id: "1" })).toEqual({}));
});
import { planIssues, planProgress, planActions } from "@/components/gifted/model";
const base = { kind: "individual" as const, title: "خطة إثراء", domain: "creative", need: "تعميق مهارات التصميم", owner_name: "أ. منى", start_date: "2026-11-01", end_date: "2026-12-01", strengths: "", resources: "", outputs: "", students: ["a"], goals: [{ text: "يصمم نموذجًا أوليًا", criteria: "نموذج يعمل", owner: "أ. منى", due: "2026-11-20" }], activities: [{ type: "applied", title: "مشروع" }] };
describe("gifted plans", () => {
  it("complete plan has no issues", () => expect(planIssues(base)).toEqual([]));
  it("individual plan with two students refused", () => expect(planIssues({ ...base, students: ["a", "b"] })).toContain("الخطة الفردية لطالب واحد"));
  it("goal without criteria refused", () => expect(planIssues({ ...base, goals: [{ ...base.goals[0]!, criteria: "" }] })).toContain("لكل هدف نص ومعيار تحقق ومسؤول وموعد"));
  it("end before start refused", () => expect(planIssues({ ...base, end_date: "2026-10-01" })).toContain("حدّد مدة صحيحة للخطة"));
  it("all activities done does not mean goals achieved", () => expect(planProgress(base as any, { goal_status: {}, acts_done: [0] })).toMatchObject({ achieved: 0, actsDone: 1 }));
  it("closed plan has no actions", () => expect(planActions("closed")).toEqual([]));
});
import { canRegister, calendarItems } from "@/components/gifted/model";
describe("gifted programs", () => {
  const prog = { status: "open", seats: 2, counts: { total: 3, approved: 3, registered: 1, attending: 0, completed: 0, consent_pending: 0 } };
  it("needs approved nomination", () => expect(canRegister({ nom: "nominated", consent: "not_needed", reg: "none" }, prog)).toBe("يُسجَّل الطالب بعد إقرار ترشيحه للبرنامج"));
  it("acknowledgement is not consent", () => expect(canRegister({ nom: "approved", consent: "pending", reg: "none" }, prog)).toBe("بانتظار موافقة ولي الأمر"));
  it("full seats refused", () => expect(canRegister({ nom: "approved", consent: "granted", reg: "none" }, { ...prog, counts: { ...prog.counts, registered: 2 } })).toBe("اكتملت المقاعد"));
  it("calendar skips cancelled programs and closed plans", () => expect(calendarItems([{ id: "a", title: "x", starts_on: "2026-11-01", ends_on: null, apply_by: null, status: "cancelled" }], [{ id: "p", title: "y", end_date: "2026-12-01", status: "closed", goals: [] }])).toEqual([]));
});
import { workStats } from "@/components/gifted/model";
describe("gifted works", () => {
  it("group achievement counts once, students counted distinctly", () => {
    const m = (ids: string[]) => ids.map((student_id) => ({ student_id, name: "", role: null }));
    expect(workStats([{ kind: "achievement", verify: "verified", members: m(["a", "b", "c"]) }, { kind: "achievement", verify: "pending", members: m(["a"]) }, { kind: "participation", verify: "pending", members: m(["a"]) }])).toEqual({ achievements: 2, verified: 1, participations: 1, projects: 0, students: 3 });
  });
});
import { boardStats, buildReport, consentOpen, familyNoteIssues } from "@/components/gifted/model";
describe("gifted stage 5", () => {
  const plan = (id: string, status: string, studs: { id: string; last: string | null }[], start = "2026-10-01") => ({ status, start_date: start, students: studs.map((s) => ({ ...s, name: s.id, goal_status: {}, acts_done: [] })) });
  it("a student in two running plans counts once", () => expect(boardStats([plan("a", "running", [{ id: "s1", last: null }]), plan("b", "running", [{ id: "s1", last: null }])] as never, [], [], "2026-11-16").inPlan).toBe(1));
  it("follow-up is due after 14 days without one", () => { const s = boardStats([plan("a", "running", [{ id: "s1", last: "2026-11-01" }, { id: "s2", last: "2026-11-10" }])] as never, [], [], "2026-11-16"); expect(s.dueIds).toEqual(["s1"]); });
  it("only open programs within 14 days are near", () => expect(boardStats([], [{ status: "open", starts_on: "2026-11-20", apply_by: null }, { status: "open", starts_on: "2026-12-30", apply_by: null }, { status: "closed", starts_on: "2026-11-18", apply_by: null }] as never, [], "2026-11-16").near).toBe(1));
  it("unverified works are not documented", () => expect(boardStats([], [], [{ kind: "achievement", verify: "pending", members: [] }, { kind: "achievement", verify: "verified", members: [] }] as never, "2026-11-16").achievements).toBe(1));
  it("group achievement is one row; students counted once", () => { const r = buildReport("achievements", { students: [], plans: [], progs: [], works: [{ kind: "achievement", verify: "verified", title: "t", event_name: "e", organizer: "o", event_date: "2026-11-01", level: "school", result: "1", members: [{ student_id: "a", name: "A" }, { student_id: "b", name: "B" }] }, { kind: "achievement", verify: "verified", title: "u", event_name: "e", organizer: "o", event_date: "2026-11-02", level: "school", result: "2", members: [{ student_id: "a", name: "A" }] }] as never }); expect(r.rows.length).toBe(2); expect(r.summary).toBe("2 إنجاز · 2 طالب"); });
  it("inventory report has no measure column", () => expect(buildReport("inventory", { students: [], plans: [], progs: [], works: [] }).headers.join()).not.toMatch(/مقياس|نتيجة/));
  it("family evidence needs https", () => expect(familyNoteIssues("evidence", "وصف كافٍ للشاهد", "http://x")).toContain("الشاهد يحتاج رابطًا آمنًا يبدأ بـ https://"));
  it("short family note refused", () => expect(familyNoteIssues("note", "قصير", "").length).toBe(1));
  it("consent closed once registered", () => { expect(consentOpen({ needs_consent: true, status: "open", reg: "registered" })).toBe(false); expect(consentOpen({ needs_consent: true, status: "open", reg: "none" })).toBe(true); expect(consentOpen({ needs_consent: false, status: "open", reg: "none" })).toBe(false); });
});
