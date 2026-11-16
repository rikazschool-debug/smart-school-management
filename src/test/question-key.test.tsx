import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QuestionFields } from "@/components/homework/question-fields";
import { blankQuestion } from "@/components/homework/exam-model";
it("the teacher sets the correct answer with the «صحيحة» control, and a question without one is flagged", () => {
  const q = { ...blankQuestion(), prompt: "س", options: ["أ", "ب", "ج"], correct: [] as number[] };
  const onChange = vi.fn();
  render(<QuestionFields questions={[q]} onChange={onChange} />);
  expect(screen.getByRole("alert").textContent).toContain("لم تحدد الإجابة الصحيحة");
  fireEvent.click(screen.getByLabelText("الإجابة الصحيحة للسؤال 1 البديل 3"));
  expect(onChange.mock.calls.at(-1)?.[0][0].correct).toEqual([2]);
});
