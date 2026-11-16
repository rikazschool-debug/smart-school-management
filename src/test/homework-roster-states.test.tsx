import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Route } from "@/routes/_authenticated/app/homework.new";
import { ExamPaper } from "@/components/homework/exam-paper";

const state = vi.hoisted(() => ({ queries: vi.fn(), filters: vi.fn(), rosterError: false }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => ({}) }),
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>, useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/session", () => ({ useSchool: () => ({ schoolId: "school", role: "teacher" }), arabicError: (e: Error) => e.message }));
vi.mock("@/lib/school-perms", () => ({ useSchoolPerms: () => ({ "bt_homework.create": true, "bt_homework.view": true }) }));
vi.mock("@/lib/export-brand", () => ({ brandHeaderHtml: () => "" }));
vi.mock("@/components/crud-page", () => ({ db: {
  from: (table: string) => {
    state.queries(table);
    const result = { data: table === "courses" ? [{ id: "course", section_id: "section", year_id: "year", subjects: { name: "حساب" }, sections: { name: "أ" } }] : table === "enrollments" ? [{ student_id: "student", students: { full_name: "طالب اصطناعي" } }] : [], error: state.rosterError && table === "homework_targets" ? new Error("تعذر تحميل القائمة") : null };
    const query = { select: () => query, eq: (key: string, value: unknown) => { state.filters(table, key, value); return query; }, then: (resolve: (r: object) => void) => Promise.resolve(result).then(resolve) };
    return query;
  },
  rpc: async (name: string) => ({ data: name === "is_course_teacher" ? true : { questions: [{ type: "single", prompt: "سؤال", points: 1, options: ["أ", "ب"], correct: [0] }], forms: [], can_grade: true, can_edit: true, delivery: "bubble" }, error: null }),
} }));
beforeEach(() => { cleanup(); vi.clearAllMocks(); state.rosterError = false; });
function mount(element: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>);
}
it("homework selection loads active students only after choosing the course and section", async () => {
  const Entry = Route.options.component;
  if (!Entry) throw new Error("Missing creation screen");
  mount(<Entry />);
  await screen.findByLabelText("المقرر والشعبة");
  fireEvent.change(screen.getByLabelText("المستهدفون"), { target: { value: "selected" } });
  expect(state.queries.mock.calls.filter(([table]) => table === "enrollments")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("المقرر والشعبة"), { target: { value: "course" } });
  await screen.findByLabelText("طالب اصطناعي");
  expect(state.filters.mock.calls.filter(([table]) => table === "enrollments")).toEqual([["enrollments", "section_id", "section"], ["enrollments", "year_id", "year"], ["enrollments", "status", "active"]]);
});
it("camera cannot open against an empty target list", async () => {
  mount(<ExamPaper h={{ id: "exam", isTeacher: true, status: "draft" }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "تصحيح بالتصوير" })).toBeDisabled());
  expect(screen.queryByLabelText("صورة ورقة التظليل")).not.toBeInTheDocument();
  expect(state.filters).toHaveBeenCalledWith("homework_targets", "homework_id", "exam");
});
it("camera cannot open when target retrieval fails", async () => {
  state.rosterError = true;
  mount(<ExamPaper h={{ id: "exam", isTeacher: true, status: "published" }} />);
  await screen.findByText("تعذر تحميل القائمة");
  expect(screen.getByRole("button", { name: "تصحيح بالتصوير" })).toBeDisabled();
});