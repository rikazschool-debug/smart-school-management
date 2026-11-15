import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ask: vi.fn(), rpc: vi.fn(), provision: vi.fn(), canPlace: true }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.provision }));
vi.mock("@/lib/accounts.functions", () => ({ provisionAccounts: vi.fn() }));
vi.mock("@/components/confirm", () => ({ ask: mocks.ask, askText: vi.fn() }));
vi.mock("@/lib/session", () => ({ arabicError: (error: unknown) => String(error) }));
vi.mock("./shared", () => ({ pp: mocks.rpc }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (fn: string, args: unknown) => fn === "can_place_students" ? { data: mocks.canPlace, error: null } : mocks.rpc(fn, args),
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "section", name: "A", grades: { name: "1" }, academic_years: { name: "QA" } }], error: null }) }) }) }),
} }));
import { BulkBar } from "./bulk-bar";

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.canPlace = true; });
function open(accounts = false) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BulkBar kind="student" schoolId="qa-school" caps={{ accounts, bulk: true, export: false, tags_assign: true, tags_manage: false, view: true }}
      tags={[{ id: "tag", name: "QA", active: true, color: "green", kinds: ["student"] }]} count={2} mode="ids" total={2} pageCount={2}
      onPage={() => {}} onAll={() => {}} onClear={() => {}} resolveIds={async () => ["first", "second"]} nameOf={(id) => id}
      onExport={async () => {}} />
  </QueryClientProvider>);
}
async function choosePlacement() {
  await waitFor(() => expect(screen.getByRole("option", { name: "التسكين" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("الإجراء الجماعي"), { target: { value: "place" } });
  await waitFor(() => expect(screen.getByRole("option", { name: "QA · 1 / A" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("شعبة التسكين الجماعي"), { target: { value: "section" } });
}
describe("confirmed bulk student flow with no live accounts or provider requests", () => {
  it("account creation uses a mocked provider and preserves already linked accounts", async () => {
    mocks.ask.mockResolvedValue(true);
    mocks.provision.mockResolvedValue([{ id: "first", state: "already" }, { id: "second", state: "missing_id" }]);
    open(true);
    fireEvent.change(screen.getByLabelText("الإجراء الجماعي"), { target: { value: "login_create" } });
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ" }));
    await waitFor(() => expect(screen.getByText("نجح 1 · رُفض 1 · تعذّر 0")).toBeInTheDocument());
    expect(mocks.provision).toHaveBeenCalledExactlyOnceWith({ data: { kind: "student", ids: ["first", "second"] } });
    expect(screen.getByText("له حساب مسبقًا")).toBeInTheDocument();
  });
  it("cancelled confirmation never places any student", async () => {
    mocks.ask.mockResolvedValue(false); open(); await choosePlacement();
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledOnce());
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("places each selected student and displays both success and failure", async () => {
    mocks.ask.mockResolvedValue(true);
    mocks.rpc.mockImplementation(async (_fn: string, args: { _student: string }) => ({ error: args._student === "second" ? "school denied" : null }));
    open(); await choosePlacement(); fireEvent.click(screen.getByRole("button", { name: "تنفيذ" }));
    await waitFor(() => expect(screen.getByText("نجح 1 · رُفض 0 · تعذّر 1")).toBeInTheDocument());
    expect(mocks.rpc.mock.calls.map(([fn, args]) => [fn, args])).toEqual([
      ["student_place", { _student: "first", _section: "section" }], ["student_place", { _student: "second", _section: "section" }],
    ]);
    expect(screen.getByText("school denied")).toBeInTheDocument(); expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("tags are confirmed and reuse the existing bulk function", async () => {
    mocks.ask.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ repeat: false, ok: 2, refused: 0, failed: 0, results: [{ id: "first", status: "ok", reason: null }, { id: "second", status: "ok", reason: null }] });
    open(); fireEvent.change(screen.getByLabelText("الإجراء الجماعي"), { target: { value: "tag_add" } });
    fireEvent.change(screen.getByLabelText("الوسم"), { target: { value: "tag" } });
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("pp_bulk", expect.objectContaining({ _school: "qa-school", _ids: ["first", "second"], _action: "tag_add", _tag: "tag" })));
    expect(mocks.ask).toHaveBeenCalledOnce(); expect(mocks.provision).not.toHaveBeenCalled();
  });
});