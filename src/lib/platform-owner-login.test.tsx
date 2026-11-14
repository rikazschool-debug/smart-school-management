import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), signOut: vi.fn(), signIn: vi.fn(), role: vi.fn(), eq: vi.fn(), toastError: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useNavigate: () => mocks.navigate,
  Link: (props: any) => <a href={props.to}>{props.children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/id-login.functions", () => ({ requestIdCode: vi.fn(), studentSignIn: vi.fn(), verifyIdCode: vi.fn() }));
vi.mock("@/components/site/shell", () => ({ Brand: () => <span>ركاز</span> }));
vi.mock("@/lib/session", () => ({ arabicError: () => "تعذر الدخول" }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: () => Promise.resolve({ data: { user: null } }), signOut: mocks.signOut, signInWithPassword: mocks.signIn },
  from: () => ({ select: () => ({ eq: mocks.eq }) }),
} }));

import { Route } from "../routes/auth";
const Page = Route.options.component as ComponentType;

describe("platform owner login", () => {
  beforeEach(() => {
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.signIn.mockResolvedValue({ data: { user: { id: "isolated-owner" } }, error: null });
    mocks.role.mockResolvedValue({ data: { user_id: "isolated-owner" }, error: null });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.role });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  async function submit() {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "مالك المنصة" }));
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني لمالك المنصة"), { target: { value: "owner@example.invalid" } });
    fireEvent.change(screen.getByLabelText("كلمة مرور مالك المنصة"), { target: { value: "Synthetic-Test-Only-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "دخول مالك المنصة" }));
  }

  it("uses the entered email and checks the user's own owner row", async () => {
    await submit();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app" }));
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "owner@example.invalid", password: "Synthetic-Test-Only-1234" });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "isolated-owner");
  });

  it("signs out and rejects a valid account without platform ownership", async () => {
    mocks.role.mockResolvedValue({ data: null, error: null });
    await submit();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("هذا الحساب لا يملك صلاحية مالك المنصة"));
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
