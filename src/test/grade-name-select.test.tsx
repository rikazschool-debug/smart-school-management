import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GradeNameSelect, stageKey } from "@/components/academic-preset-picker";

vi.mock("@/components/crud-page", () => ({
  db: {},
  useOptions: () => ({ data: [{ value: "st-p", label: "المرحلة الابتدائية" }, { value: "st-kg", label: "رياض الأطفال" }], isLoading: false }),
}));
function mount(stage: string, set: (p: Record<string, unknown>) => void) {
  const c = new QueryClient(); c.setQueryData(["academic-catalog", "o"], [
    { id: "1", kind: "grade", name: "KG1", stage: "رياض الأطفال", sort_order: 1 },
    { id: "2", kind: "grade", name: "سادس", stage: "الابتدائية", sort_order: 6 },
  ]);
  render(<QueryClientProvider client={c}><GradeNameSelect org="o" school="s" value="" values={{ stage_id: stage }} set={set} /></QueryClientProvider>);
}
it("treats «المرحلة X» and «X» as one stage", () => expect(stageKey("المرحلة الابتدائية")).toBe("الابتدائية"));
it("lists only the chosen stage's grades and fills the order", () => {
  const set = vi.fn(); mount("st-p", set);
  expect(screen.queryByRole("option", { name: "KG1" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "سادس" } });
  expect(set).toHaveBeenCalledWith({ name: "سادس", sort_order: 6 });
});
it("is disabled until a stage is chosen", () => { mount("", vi.fn()); expect(screen.getByRole("combobox")).toBeDisabled(); });
