import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SubjectPresetPicker } from "@/components/subject-preset-picker";

it("fills only the selected subject name and requires a fresh grade after stage change", () => {
  const fill = vi.fn();
  render(<SubjectPresetPicker onSelect={fill} />);
  fireEvent.change(screen.getByLabelText("المرحلة"), { target: { value: "المتوسطة" } });
  fireEvent.change(screen.getByLabelText("الصف / المستوى"), { target: { value: "ثالث" } });
  fireEvent.change(screen.getByLabelText("المقرر الجاهز"), { target: { value: "التفكير الناقد" } });
  expect(fill).toHaveBeenCalledExactlyOnceWith("التفكير الناقد");
  fireEvent.change(screen.getByLabelText("المرحلة"), { target: { value: "رياض الأطفال" } });
  expect(screen.getByLabelText("الصف / المستوى")).toHaveValue("");
  expect(screen.getByLabelText("المقرر الجاهز")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("الصف / المستوى"), { target: { value: "KG1" } });
  fireEvent.change(screen.getByLabelText("المقرر الجاهز"), { target: { value: "اللقاء الأخير" } });
  expect(fill).toHaveBeenLastCalledWith("اللقاء الأخير");
});