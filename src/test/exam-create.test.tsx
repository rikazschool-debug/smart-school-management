import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { ExamCreate } from "@/components/homework/exam-create";
const calls = vi.hoisted(() => ({ save: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>, useNavigate: () => calls.navigate }));
vi.mock("@/lib/session", () => ({ useSchool: () => ({ schoolId: "school", schoolName: "مدرسة اختبار" }), arabicError: (e: Error) => e.message }));
vi.mock("@/lib/school-perms", () => ({ useSchoolPerms: () => ({ "bt_homework.create": true, "bt_homework.view": true }) }));
vi.mock("@/components/crud-page", () => ({ db: {
  from: (table: string) => { const result = { data: table === "courses" ? [{ id: "course", section_id: "section", year_id: "year", subjects: { name: "الرياضيات" }, academic_years: { name: "1448" }, terms: { name: "الأول" }, sections: { name: "أ", grade_id: "grade", grades: { name: "الخامس", stage_id: "stage", stages: { name: "الابتدائية" } } } }] : [{ student_id: "student", students: { full_name: "طالب اختبار", csmart_no: null } }], error: null }; const query = { select: () => query, eq: () => query, then: (resolve: (r: object) => void) => Promise.resolve(result).then(resolve) }; return query; },
  rpc: async (name: string, args: object) => { if (name === "is_course_teacher") return { data: true, error: null }; calls.save(name, args); return { data: "new-exam", error: null }; },
} }));
it("saves selected student, presentation mode, questions and models atomically without publication", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ExamCreate /></QueryClientProvider>);
  await screen.findByLabelText("اسم الاختبار");
  fireEvent.change(screen.getByLabelText("اسم الاختبار"), { target: { value: "اختبار حساب" } });
  fireEvent.change(screen.getByLabelText("وقت النهاية"), { target: { value: "2027-01-01T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: /الاستهداف/ }));
  await waitFor(() => expect(screen.getByLabelText("المقرر والشعبة").querySelectorAll("option")).toHaveLength(2));
  fireEvent.change(screen.getByLabelText("المقرر والشعبة"), { target: { value: "course" } });
  fireEvent.click(screen.getByLabelText("طلاب محددون"));
  await screen.findByLabelText("تحديد طالب اختبار"); fireEvent.click(screen.getByLabelText("تحديد طالب اختبار"));
  fireEvent.click(screen.getByRole("button", { name: /الأسئلة والنماذج/ }));
  fireEvent.change(screen.getByLabelText("نص السؤال 1"), { target: { value: "2+2" } });
  for (const [i, text] of ["3", "4", "5", "6"].entries()) fireEvent.change(screen.getByLabelText(`البديل ${i + 1} للسؤال 1`), { target: { value: text } });
  fireEvent.click(screen.getByLabelText("الإجابة الصحيحة للسؤال 1 البديل 2"));
  fireEvent.change(screen.getByLabelText("النماذج"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ مسودة الاختبار" }));
  await waitFor(() => expect(calls.save).toHaveBeenCalledTimes(1));
  expect(calls.save).toHaveBeenCalledWith("exam_draft_save", expect.objectContaining({ _delivery: "online", _count: 2, _d: expect.objectContaining({ course_id: "course", audience: "selected", students: ["student"], max_score: 1 }), _questions: [expect.objectContaining({ prompt: "2+2", correct: [1] })] }));
  await waitFor(() => expect(calls.navigate).toHaveBeenCalledWith({ to: "/app/homework/$id", params: { id: "new-exam" } }));
});