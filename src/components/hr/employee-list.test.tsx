import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { HrEmployeeList } from "./employee-list";

afterEach(cleanup);
const rows = [{ id: "employee-1", employee_no: "E001", full_name: "موظف اختبار", job_title: "إداري", status: "active", has_login: true }];

describe("HR employee list interaction", () => {
  it("opens the selected employee file by its identifier", () => {
    const onOpen = vi.fn();
    render(<HrEmployeeList rows={rows} selected={new Set()} selectable onSelect={vi.fn()} onOpen={onOpen} />);
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "فتح ملف موظف اختبار" }));
    expect(onOpen).toHaveBeenCalledWith("employee-1");
  });
  it("selects an employee without opening their file", () => {
    const onSelect = vi.fn(), onOpen = vi.fn();
    render(<HrEmployeeList rows={rows} selected={new Set()} selectable onSelect={onSelect} onOpen={onOpen} />);
    fireEvent.click(within(screen.getByRole("table")).getByRole("checkbox"));
    expect(onSelect).toHaveBeenCalledWith("employee-1");
    expect(onOpen).not.toHaveBeenCalled();
  });
});