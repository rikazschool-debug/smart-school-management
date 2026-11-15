import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SubjectPresetPicker, SubjectNameSelect } from "@/components/subject-preset-picker";

it("fills only the selected subject name and requires a fresh grade after stage change", () => {
  const fill = vi.fn();
  render(<SubjectPresetPicker onSelect={fill} />);
  fireEvent.change(screen.getByLabelText("المرحلة"), { target: { value: "المتوسطة" } });
  fireEvent.change(screen.getByLabelText("الصف / المستوى"), { target: { value: "ثالث" } });
  fireEvent.change(screen.getByLabelText("المقرر الجاهز"), { target: { value: "التفكير الناقد" } });
  expect(fill).toHaveBeenLastCalledWith("التفكير الناقد");
  fireEvent.change(screen.getByLabelText("المرحلة"), { target: { value: "رياض الأطفال" } });
  expect(screen.getByLabelText("الصف / المستوى")).toHaveValue("");
  expect(screen.getByLabelText("المقرر الجاهز")).toBeDisabled();
  expect(fill).toHaveBeenLastCalledWith("");
  fireEvent.change(screen.getByLabelText("الصف / المستوى"), { target: { value: "KG1" } });
  fireEvent.change(screen.getByLabelText("المقرر الجاهز"), { target: { value: "اللقاء الأخير" } });
  expect(fill).toHaveBeenLastCalledWith("اللقاء الأخير");
});

it("excludes subjects not linked to the selected stage and grade", () => {
  const fill = vi.fn();
  render(<SubjectNameSelect value="" values={{ _subjectStage: "رياض الأطفال", _subjectGrade: "KG1" }} set={fill} />);
  expect(screen.queryByRole("option", { name: "الفيزياء" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "الحلقة" } });
  expect(fill).toHaveBeenCalledWith({ name: "الحلقة" });
});
it("offers no subjects before choosing both stage and grade", () => {
  render(<SubjectNameSelect value="" values={{ _subjectStage: "الثانوية" }} set={vi.fn()} />);
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.queryByRole("option", { name: "الفيزياء" })).toBeNull();
});