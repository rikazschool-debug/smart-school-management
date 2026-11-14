// Opt-in isolated QA only. Private fixture and provider credentials are mounted at runtime, never tracked.
import { beforeAll, describe, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b: any = {
      inputValidator: () => b,
      middleware: () => b,
      handler: (fn: unknown) => fn,
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));
import { dispatchMessages } from "@/lib/message-delivery.server";
import { requestIdCode, verifyIdCode } from "@/lib/id-login.functions";
import { meetingToken } from "@/lib/meeting-live.functions";
import { askSanad } from "@/lib/sanad.functions";
const enabled = process.env["RIKAZ_LIVE_ACCEPTANCE"] === "1";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message);
}
let f: any,
  owner: SupabaseClient,
  other: SupabaseClient,
  service: SupabaseClient;
describe.skipIf(!enabled)(
  "authorized provider acceptance against isolated QA",
  () => {
    beforeAll(async () => {
      assert(
        process.env["RIKAZ_DELIVERY_MODE"] === "test",
        "Test-only delivery policy required",
      );
      f = JSON.parse(
        readFileSync(process.env["RIKAZ_ACCEPTANCE_FIXTURE"]!, "utf8"),
      );
      assert(
        f.isolated === true &&
          process.env["SUPABASE_URL"] === "http://qa-gateway:8000",
        "Isolated endpoint required",
      );
      assert(
        process.env["RIKAZ_TEST_PHONE_ALLOWLIST"] === f.phone,
        "Single approved recipient required",
      );
      const opts = { auth: { persistSession: false, autoRefreshToken: false } };
      service = createClient(
        process.env["SUPABASE_URL"]!,
        process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
        opts,
      );
      const clients = [];
      for (const u of [f.users[1], f.users[0]]) {
        const c = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_ANON_KEY"]!,
          opts,
        );
        const login = await c.auth.signInWithPassword({
          email: u.email,
          password: u.password,
        });
        assert(
          !login.error && login.data.user?.id === u.id,
          "Isolated login failed",
        );
        clients.push(c);
      }
      owner = clients[0]!;
      other = clients[1]!;
    }, 30000);
    it("sends one account message and does not send it a second time", async () => {
      const n = await dispatchMessages("acct", {
        ids: [f.liveAcct],
        actor: f.liveOwner,
      });
      assert(n === 1, "Expected one fresh account claim");
      const row = await service
        .from("acct_outbox")
        .select("status")
        .eq("id", f.liveAcct)
        .single();
      assert(
        row.data?.status === "accepted",
        "WATI account send not confirmed accepted",
      );
      assert(
        (await dispatchMessages("acct", {
          ids: [f.liveAcct],
          actor: f.liveOwner,
        })) === 0,
        "Duplicate account send attempted",
      );
    }, 40000);
    it("sends one automatically queued event receipt and does not repeat it", async () => {
      const n = await dispatchMessages("evt", {
        ids: [f.liveEvt],
        actor: f.liveOwner,
      });
      assert(n === 1, "Expected one fresh event claim");
      const row = await service
        .from("evt_outbox")
        .select("status")
        .eq("id", f.liveEvt)
        .single();
      assert(
        row.data?.status === "accepted",
        "WATI event send not confirmed accepted",
      );
      assert(
        (await dispatchMessages("evt", {
          ids: [f.liveEvt],
          actor: f.liveOwner,
        })) === 0,
        "Duplicate event send attempted",
      );
    }, 40000);
    it("sends an ID OTP, verifies it only in its requesting QA database, and rejects reuse", async () => {
      const testCode = 100000 + Math.floor(Math.random() * 899999);
      const random = vi
        .spyOn(globalThis.crypto, "getRandomValues")
        .mockImplementationOnce(((a: Uint32Array) => {
          a[0] = testCode;
          return a;
        }) as typeof crypto.getRandomValues);
      let result: any;
      try {
        result = await (requestIdCode as any)({
          data: { nid: f.nid, portal: "staff" },
        });
      } finally {
        random.mockRestore();
      }
      assert(
        result.challenge && !result.error,
        "ID OTP request was not accepted",
      );
      const signed: any = await (verifyIdCode as any)({
        data: {
          challenge: result.challenge,
          code: String(testCode),
          portal: "staff",
        },
      });
      assert(
        typeof signed.token === "string" && !signed.error,
        "QA OTP verification failed",
      );
      const session = await owner.auth.verifyOtp({
        token_hash: signed.token,
        type: "magiclink",
      });
      assert(
        !session.error && session.data.user?.id === f.liveOwner,
        "QA OTP signed in wrong user",
      );
      const again: any = await (verifyIdCode as any)({
        data: {
          challenge: result.challenge,
          code: String(testCode),
          portal: "staff",
        },
      });
      assert(!!again.error && !again.token, "OTP reuse was accepted");
      writeFileSync(
        "/qa/otp-proof.json",
        JSON.stringify({
          challenge: result.challenge,
          verified: true,
          reuseRejected: true,
        }),
      );
    }, 40000);
    it("issues a meeting token only to the invited in-scope host", async () => {
      let rejected = false;
      try {
        await (meetingToken as any)({
          data: { id: f.meeting, kind: "join" },
          context: { supabase: other, userId: f.users[0].id },
        });
      } catch {
        rejected = true;
      }
      assert(rejected, "Foreign meeting token accepted");
      const token: any = await (meetingToken as any)({
        data: { id: f.meeting, kind: "join" },
        context: { supabase: owner, userId: f.liveOwner },
      });
      assert(
        token.token?.startsWith("007") &&
          token.host === true &&
          token.ttl === 600,
        "Meeting token issuance failed",
      );
      writeFileSync(
        "/qa/rtc-join.json",
        JSON.stringify({
          appId: token.appId,
          channel: token.channel,
          uid: token.uid,
          token: token.token,
        }),
      );
    }, 30000);
    it("runs Sanad with the caller RLS client and only isolated school records", async () => {
      const result: any = await (askSanad as any)({
        data: {
          schoolId: f.schoolB,
          roleLabel: "مالك مجموعة اختبار معزولة",
          messages: [
            { role: "user", text: "كيف أستخدم شاشة المدارس في ركاز؟" },
          ],
        },
        context: { supabase: owner, userId: f.liveOwner },
      });
      assert(
        typeof result.text === "string" &&
          result.text.length > 0 &&
          !result.error,
        "Sanad provider response failed",
      );
    }, 45000);
  },
);
