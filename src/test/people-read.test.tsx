import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
import { usePeopleRead } from "@/lib/people-read";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; };
}
describe("family navigation mirrors server-authorized school reads", () => {
  it("shows authorized admission staff's family pages for their school only", async () => {
    mocks.rpc.mockImplementation(async (_name, args) => ({ data: args._school === "authorized-school", error: null }));
    const { result, rerender } = renderHook(({ school }) => usePeopleRead(school), { initialProps: { school: "authorized-school" }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe(true));
    rerender({ school: "foreign-school" });
    await waitFor(() => expect(result.current.data).toBe(false));
    expect(mocks.rpc).toHaveBeenCalledWith("staff_view", { _school: "authorized-school" });
    expect(mocks.rpc).toHaveBeenCalledWith("staff_view", { _school: "foreign-school" });
  });
  it("does not grant access after a permission check error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: Error("denied") });
    const { result } = renderHook(() => usePeopleRead("school"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it("does not query or grant access without a school", () => {
    const { result } = renderHook(() => usePeopleRead(null), { wrapper: wrapper() });
    expect(result.current.data).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});