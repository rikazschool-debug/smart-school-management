import { describe, expect, it } from "vitest";
import { learningLine, linkSummary, outcomeLine, planMissing, programRows, validMeetingUrl, verifiedHours, type Outcome, type Program } from "@/components/supervision/pd-model";

const prog = (over: Partial<Program> = {}): Program => ({ id: "g", school_id: "s", school: "فرع", title: "برنامج", objectives: "", need_ids: [], audience: "", trainer_name: "م", mode: "in_person", location: "قاعة", meeting_url: null, status: "open", cancel_reason: null, creator: "", rev: 1, updated_at: "", can_manage: true,
  sessions: [{ id: "s1", starts_at: "", ends_at: "", hours: 1, location: null, status: "scheduled", cancel_reason: null, rev: 1 }, { id: "s2", starts_at: "", ends_at: "", hours: 1.5, location: null, status: "scheduled", cancel_reason: null, rev: 1 }, { id: "s3", starts_at: "", ends_at: "", hours: 2, location: null, status: "cancelled", cancel_reason: "x", rev: 1 }],
  enrollments: [{ user_id: "u1", name: "أ", status: "registered", reason: null, hours: 0, attendance: [{ session_id: "s1", status: "present" }, { session_id: "s2", status: "absent" }, { session_id: "s3", status: "present" }] }, { user_id: "u2", name: "ب", status: "registered", reason: null, hours: 0, attendance: [] }],
  my_feedback: [], outcomes: [], ...over });
const out = (o: Partial<Outcome>): Outcome => ({ id: "o", user_id: "u", name: "", kind: "learning", due: "", state: "submitted", tool: "اختبار", pre: null, post: null, impact: null, evidence: null, note: null, rev: 1, verifier: null, ...o });

describe("development plan submission", () => {
  it("a draft with only needs is incomplete", () => { expect(planMissing({ need_ids: ["n"] })).toHaveLength(2); });
  it("a goal without an indicator blocks submission", () => { expect(planMissing({ need_ids: ["n"], goals: [{ goal: "هدف واضح", indicator: "", target: "3", due: "2026-12-01", owner: "u" }], activities: [{ type: "training", title: "ورشة", due: "2026-12-01", owner: "u" }] })).toEqual(["هدف كامل: الوصف والمؤشر والمستهدف والموعد والمسؤول"]); });
  it("a complete plan has nothing missing", () => { expect(planMissing({ need_ids: ["n"], goals: [{ goal: "هدف واضح", indicator: "مؤشر", target: "3 حصص", due: "2026-12-01", owner: "u" }], activities: [{ type: "training", title: "ورشة", due: "2026-12-01", owner: "u" }] })).toEqual([]); });
});
describe("program hours", () => {
  it("counts only present, non-cancelled sessions", () => { expect(verifiedHours(prog(), "u1")).toBe(1); });
  it("registration alone counts zero hours", () => { expect(verifiedHours(prog(), "u2")).toBe(0); });
  it("program report sums verified hours once", () => { expect(programRows([prog()])[0]?.[6]).toBe(1); });
});
describe("outcomes stay separate and honest", () => {
  it("learning without a pre-measure makes no comparison", () => { expect(learningLine(out({ post: "4 من 5" }))).toContain("لا مقارنة"); });
  it("impact not yet recorded is «لم يُقس»", () => { expect(outcomeLine(out({ kind: "impact", state: "pending" }))).toBe("لم يُقس الأثر بعد"); });
});
describe("meeting link", () => {
  it("rejects non-https links", () => { expect(validMeetingUrl("http://meet.google.com/x")).toBe(false); });
  it("accepts an https meeting link", () => { expect(validMeetingUrl("https://meet.google.com/abc-defg-hij")).toBe(true); });
});

describe("meeting links in reports", () => {
  it("counts each linked kind including visits", () => {
    expect(linkSummary([{ kind: "visit" }, { kind: "plan" }, { kind: "need" }, { kind: "need" }])).toBe("خطة 1، احتياج 2، زيارة 1");
  });
  it("says no links instead of an empty cell", () => { expect(linkSummary([])).toBe("لا روابط"); });
});
