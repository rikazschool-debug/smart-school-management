import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AcademicPresetPicker } from "@/components/academic-preset-picker";

vi.mock("@/components/crud-page", () => ({
  db: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }), eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) },
  useOptions: () => ({ data: [{ value: "school-kg", label: "رياض الأطفال" }, { value: "school-primary", label: "الابتدائية" }], isLoading: false }),
}));
function mount(kind: "stage" | "grade", onSelect: (values: Record<string, unknown>) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["academic-catalog", "org-test"], [
    { id: "kg", kind: "stage", name: "رياض الأطفال", sort_order: 1 },
    { id: "primary", kind: "stage", name: "الابتدائية", sort_order: 2 },
    { id: "kg1", kind: "grade", name: "KG1", stage: "رياض الأطفال", sort_order: 1 },
    { id: "six", kind: "grade", name: "سادس", stage: "الابتدائية", sort_order: 6 },
  ]);
  render(<QueryClientProvider client={client}><AcademicPresetPicker kind={kind} org="org-test" school="school-test" onSelect={onSelect} /></QueryClientProvider>);
}
it("fills a catalog stage without changing any record", () => {
  const fill = vi.fn(); mount("stage", fill);
  fireEvent.change(screen.getByLabelText("المرحلة الجاهزة"), { target: { value: "primary" } });
  expect(fill).toHaveBeenCalledExactlyOnceWith({ name: "الابتدائية", sort_order: 2 });
});
it("fills a grade with the school stage ID and clears stale grade when switching stages", () => {
  const fill = vi.fn(); mount("grade", fill);
  fireEvent.change(screen.getByLabelText("مرحلة الصف الجاهز"), { target: { value: "school-kg" } });
  fireEvent.change(screen.getByLabelText("الصف الجاهز"), { target: { value: "kg1" } });
  expect(fill).toHaveBeenLastCalledWith({ name: "KG1", sort_order: 1, stage_id: "school-kg" });
  fireEvent.change(screen.getByLabelText("مرحلة الصف الجاهز"), { target: { value: "school-primary" } });
  expect(fill).toHaveBeenLastCalledWith({ name: "", sort_order: null, stage_id: "school-primary" });
  fireEvent.change(screen.getByLabelText("الصف الجاهز"), { target: { value: "six" } });
  expect(fill).toHaveBeenLastCalledWith({ name: "سادس", sort_order: 6, stage_id: "school-primary" });
});