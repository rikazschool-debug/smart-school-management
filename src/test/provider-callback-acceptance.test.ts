import { beforeAll, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleWatiWebhook } from "@/lib/wati-webhook.server";
import { handleMessageWorker } from "@/lib/message-worker.server";
const enabled = process.env["RIKAZ_CALLBACK_ACCEPTANCE"] === "1";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(message);
}
let fixture: any, service: SupabaseClient;
describe.skipIf(!enabled)("isolated delivery callback persistence", () => {
  beforeAll(() => {
    assert(
      process.env["SUPABASE_URL"] === "http://qa-gateway:8000",
      "Isolated database required",
    );
    fixture = JSON.parse(
      readFileSync(process.env["RIKAZ_ACCEPTANCE_FIXTURE"]!, "utf8"),
    );
    assert(fixture.isolated === true, "Private isolated fixture required");
    service = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
  for (const kind of ["acct", "evt"])
    it(`correlates ${kind} callbacks once and rejects foreign-instance updates`, async () => {
      const table = kind === "acct" ? "acct_outbox" : "evt_outbox",
        id = kind === "acct" ? fixture.liveAcct : fixture.liveEvt;
      const row = await service
        .from(table)
        .select("delivery_ref")
        .eq("id", id)
        .single();
      const ref = row.data?.delivery_ref;
      assert(typeof ref === "string", "Accepted isolated message missing");
      const send = (local: string, eventType: string) =>
        handleWatiWebhook(
          new Request(
            `https://example.invalid/api/public/wati/webhook?key=${process.env["WATI_WEBHOOK_SECRET"]}`,
            {
              method: "POST",
              body: JSON.stringify({ eventType, localMessageId: local }),
            },
          ),
        );
      const inboxBefore = await service
        .from("wa_webhook_events")
        .select("*", { count: "exact", head: true });
      assert(
        (await send(ref, "sentMessageDELIVERED_v2")).status === 200,
        "Owned callback failed",
      );
      assert(
        (
          await send(
            ref.replace(
              /^rk-[a-f0-9]{32}-/,
              "rk-ffffffffffffffffffffffffffffffff-",
            ),
            "sentMessageREAD_v2",
          )
        ).status === 200,
        "Foreign callback handling failed",
      );
      await send(ref, "templateMessageSent_v2");
      await send(ref, "templateMessageFailed");
      await send(ref, "sentMessageDELIVERED_v2");
      const result = await service
        .from(table)
        .select("status")
        .eq("id", id)
        .single();
      assert(
        result.data?.status === "delivered",
        "Delivery downgraded or foreign status applied",
      );
      const inboxAfter = await service
        .from("wa_webhook_events")
        .select("*", { count: "exact", head: true });
      assert(
        inboxBefore.count === inboxAfter.count,
        "Unrelated inbox events inserted",
      );
    });
  it("runs the scoped worker after acceptance without draining other organizations", async () => {
    process.env["RIKAZ_MESSAGE_ORG_ALLOWLIST"] = fixture.liveOrg;
    const r = await handleMessageWorker(
      new Request("http://localhost/api/internal/messages/dispatch", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env["RIKAZ_MESSAGE_WORKER_SECRET"]}`,
        },
      }),
    );
    assert(r.status === 200, "Worker request failed");
    const j = await r.json();
    assert(
      j.n === 0,
      "Worker drained another organization or repeated accepted messages",
    );
    const old = await service
      .from("acct_outbox")
      .select("status,attempts")
      .eq("id", fixture.acctOld)
      .single();
    assert(
      old.data?.status === "queued" && old.data.attempts === 0,
      "Historical queue changed",
    );
  });
});
