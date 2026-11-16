import { describe, expect, it } from "vitest";
import { blankQuestion, rotateForm, scoreChoices, sheetIdentity, validateQuestions } from "@/components/homework/exam-model";
const q = { ...blankQuestion(), prompt: "2+2", options: ["3", "4", "5", "6"], correct: [1], points: 2 };
describe("exam authoring and model safety", () => {
  it("rejects empty MCQ alternatives", () => expect(validateQuestions([{ ...q, options: ["", "4"] }], "online")).not.toBeNull());
  it("requires a model answer for manually marked questions", () => expect(validateQuestions([{ ...q, type: "essay", answer: "" }], "paper")).not.toBeNull());
  it("limits bubble sheets to 35 single-choice questions", () => { expect(validateQuestions(Array(36).fill(q), "bubble")).not.toBeNull(); expect(validateQuestions([{ ...q, type: "essay", answer: "4" }], "bubble")).not.toBeNull(); });
  it("keeps correct marking when question and option order change", () => { const forms = [0, 1, 2].map(n => rotateForm([q, { ...q, prompt: "second", correct: [3], points: 3 }], n)); for (const form of forms) { expect(scoreChoices(form, form.map(x => x.correct[0] ?? null))).toBe(5); for (const item of form) expect(item.options[item.correct[0] ?? -1]).toBe(item.prompt === "second" ? "6" : "4"); } });
  it("does not mutate the source key when creating a variant", () => { rotateForm([q], 1); expect(q.correct).toEqual([1]); expect(q.options).toEqual(["3", "4", "5", "6"]); });
  it("rejects another form even for the correct test and target student", () => { const text = JSON.stringify({ v: 1, hw: "exam", student: "student", form: "B" }); expect(sheetIdentity(text, "exam", [{ id: "student" }], "A")).toBeNull(); expect(sheetIdentity(text, "exam", [{ id: "student" }], "B")).toBe("student"); });
});
import { examAnswersText } from "@/components/homework/exam-model";
describe("stored test attempt text", () => {
  it("shows the model and letters, marking blank answers", () => {
    expect(examAnswersText(JSON.stringify({ form: "B", answers: [[0], [], [2]] }))).toBe("النموذج B\n1: A\n2: بدون إجابة\n3: C");
  });
  it("leaves ordinary homework text unchanged", () => { expect(examAnswersText("إجابة نصية")).toBe("إجابة نصية"); });
});
