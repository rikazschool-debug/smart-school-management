import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NavigationSection } from "@/components/navigation-section";

it("can be expanded, collapsed and reopened when navigating into it", () => {
  const { rerender } = render(<NavigationSection label="قسم" active={false} routeKey="a"><a href="/destination">وجهة</a></NavigationSection>);
  expect(screen.queryByRole("link", { name: "وجهة" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "فتح قسم" }));
  expect(screen.getByRole("link", { name: "وجهة" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "طي قسم" }));
  expect(screen.queryByRole("link", { name: "وجهة" })).toBeNull();
  rerender(<NavigationSection label="قسم" active={true} routeKey="b"><a href="/destination">وجهة</a></NavigationSection>);
  expect(screen.getByRole("link", { name: "وجهة" })).toBeTruthy();
});

it("toggling children does not activate the parent's navigation command", () => {
  const navigate = vi.fn();
  render(<NavigationSection label="قسم" active={true} routeKey="a" trigger={<a href="/destination" onClick={navigate}>الصفحة</a>}><a href="/child">الفرع</a></NavigationSection>);
  fireEvent.click(screen.getByRole("button", { name: "طي قسم" }));
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "الصفحة" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "الفرع" })).toBeNull();
});