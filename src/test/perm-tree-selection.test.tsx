import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermTree, type Grant, type PermCatalog } from "@/components/perm-tree";

const ask = vi.hoisted(() => vi.fn());
vi.mock("@/components/confirm", () => ({ ask }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const c: PermCatalog = {
  areas: [{ key: "academic", label: "الإعداد الأكاديمي" }, { key: "admin", label: "الإدارة" }],
  sections: [
    { key: "years", label: "السنوات", parent: "academic", actions: ["view", "edit"], scopes: ["branch"] },
    { key: "classes", label: "الشعب", parent: "academic", actions: ["view", "edit"], scopes: ["branch"] },
    { key: "tasks", label: "التكليفات", parent: "admin", actions: ["view", "edit"], scopes: ["branch"] },
  ], actions: { view: "عرض", edit: "تعديل" }, scopes: { branch: "الفرع" }, locked: [],
};
function Editor({ initial = [] }: { initial?: Grant[] }) {
  const [value, onChange] = useState(initial);
  return <><PermTree c={c} value={value} onChange={onChange} /><output data-testid="grants">{JSON.stringify(value)}</output></>;
}
const grants = () => JSON.parse(screen.getByTestId("grants").textContent ?? "[]") as Grant[];
describe("permission tree draft selection", () => {
  it("area view grants only view at branch scope", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "منح العرض" }));
    expect(grants()).toEqual([{ section: "years", action: "view", scope: "branch" }, { section: "classes", action: "view", scope: "branch" }]);
  });
  it("navigation and search do not change assignments", () => {
    const initial = [{ section: "years", action: "edit", scope: "branch" }];
    render(<Editor initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /^الإدارة/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "بحث في الأقسام" }), { target: { value: "الشعب" } });
    expect(grants()).toEqual(initial);
  });
  it("cancelled area removal preserves every grant", async () => {
    ask.mockResolvedValue(false);
    const initial = [{ section: "years", action: "edit", scope: "branch" }];
    render(<Editor initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "إلغاء صلاحيات الإعداد الأكاديمي" }));
    await waitFor(() => expect(ask).toHaveBeenCalledOnce());
    expect(grants()).toEqual(initial);
  });
  it("confirmed removal affects the whole area, including filtered actions, but no other area", async () => {
    ask.mockResolvedValue(true);
    render(<Editor initial={[{ section: "years", action: "view", scope: "branch" }, { section: "classes", action: "edit", scope: "branch" }, { section: "tasks", action: "edit", scope: "branch" }]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "بحث في الأقسام" }), { target: { value: "السنوات" } });
    fireEvent.click(screen.getByRole("button", { name: "إلغاء صلاحيات الإعداد الأكاديمي" }));
    await waitFor(() => expect(grants()).toEqual([{ section: "tasks", action: "edit", scope: "branch" }]));
  });
});