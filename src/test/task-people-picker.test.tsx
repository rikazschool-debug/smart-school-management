import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PeoplePicker } from "@/components/people-picker";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/crud-page", () => ({ db: { rpc } }));
vi.mock("@/lib/session", () => ({ arabicError: String }));
afterEach(() => { cleanup(); rpc.mockReset(); });

const facets = [
  { kind: "role", id: "teacher", label: "teacher" },
  { kind: "dept", id: "science", label: "العلوم" },
  { kind: "stage", id: "primary", label: "الابتدائية" },
  { kind: "title", id: "معلم علوم", label: "معلم علوم" },
];
const person = { user_id: "second", full_name: "ريم صالح", roles: ["teacher"], employee_no: "2042", job_title: "معلم علوم" };

function mount(single: boolean) {
  const label = single ? "المسؤول الأساسي" : "المشاركون";
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = render(<QueryClientProvider client={client}><PeoplePicker purpose="task" label={label} school="branch" single={single} value={single ? [] : ["third"]} exclude={single ? [] : ["lead"]} onChange={onChange} /></QueryClientProvider>);
  return { group: within(ui.getByRole("group", { name: label })), label, onChange };
}

it.each([true, false])("sends branch academic filters and the employee-number search for task picker (single=%s)", async (single) => {
  rpc.mockImplementation(async (_method, args) => ({ data: args._facets ? facets : [], error: null }));
  const { group, label } = mount(single);
  await group.findByRole("option", { name: "الابتدائية" });
  fireEvent.change(group.getByRole("combobox", { name: "الفئة" }), { target: { value: "teacher" } });
  fireEvent.change(group.getByRole("combobox", { name: "القسم التعليمي" }), { target: { value: "science" } });
  fireEvent.change(group.getByRole("combobox", { name: "المرحلة التعليمية" }), { target: { value: "primary" } });
  fireEvent.change(group.getByRole("combobox", { name: "المسمى الوظيفي" }), { target: { value: "معلم علوم" } });
  fireEvent.change(group.getByRole("textbox", { name: `بحث في ${label}` }), { target: { value: "2042" } });
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("people_pick_task", {
    _school: "branch", _q: "2042", _role: "teacher", _dept: "science", _stage: "primary", _title: "معلم علوم", _exclude: single ? [] : ["lead"],
  }));
});

it("adds a second participant to the same task without including its lead", async () => {
  rpc.mockImplementation(async (_method, args) => ({ data: args._facets ? facets : [person, { ...person, user_id: "lead", full_name: "مسؤول أول" }], error: null }));
  const { group, onChange } = mount(false);
  fireEvent.click(await group.findByRole("checkbox", { name: /ريم صالح/ }));
  expect(group.queryByRole("checkbox", { name: /مسؤول أول/ })).toBeNull();
  expect(onChange).toHaveBeenCalledWith(["third", "second"]);
});