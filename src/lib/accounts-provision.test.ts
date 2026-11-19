// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), createUser: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: m.from, rpc: m.rpc, auth: { admin: { createUser: m.createUser } } },
}));
import { provisionAccounts } from "./accounts.functions";

const id = "10000000-0000-4000-8000-000000000001";
const school = "10000000-0000-4000-8000-000000000002";
const oldUid = "10000000-0000-4000-8000-000000000003";

function stage(data: { user_id: string }[] | null, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data, error }),
  };
  m.from.mockReturnValue(query);
  return query;
}

function run(kind: "guardian" | "teacher", allowed = true) {
  const scoped = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [{ id, school_id: school, user_id: null, phone: "0550000017" }] }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { org_id: school } }),
  };
  const handler = provisionAccounts as unknown as (input: unknown) => Promise<unknown>;
  return handler({ data: { kind, ids: [id] }, context: {
    userId: oldUid, supabase: {
      from: () => scoped, rpc: async () => ({ data: allowed }),
    },
  } });
}

describe("preserving a staged login when a school record is saved", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["guardian", "teacher"] as const)("does not create another %s login", async (kind) => {
    const query = stage([{ user_id: oldUid }]);
    expect(await run(kind)).toEqual([{ id, state: "pending_phone" }]);
    expect(m.from).toHaveBeenCalledWith("account_setup");
    expect(query.eq.mock.calls).toEqual([["kind", kind], ["subject_id", id], ["school_id", school]]);
    expect(query.is).toHaveBeenCalledWith("completed_at", null);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("refuses conflicting staged accounts", async () => {
    stage([{ user_id: oldUid }, { user_id: school }]);
    expect(await run("guardian")).toMatchObject([{ id, state: "error" }]);
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("does not create a login if the staged account check fails", async () => {
    stage(null, new Error("unavailable"));
    expect(await run("teacher")).toMatchObject([{ id, state: "error" }]);
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it("checks permission before inspecting staged accounts", async () => {
    expect(await run("guardian", false)).toMatchObject([{ id, state: "error" }]);
    expect(m.from).not.toHaveBeenCalled();
  });
});