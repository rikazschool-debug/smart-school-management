import { safeEqual } from "./wati-otp";
import { dispatchMessages, deliveryPhones } from "./message-delivery.server";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Scheduler-only capability; the browser session and a query-string secret cannot invoke it. */
export async function handleMessageWorker(request: Request) {
  const secret = process.env["RIKAZ_MESSAGE_WORKER_SECRET"],
    provided = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !safeEqual(provided, `Bearer ${secret}`))
    return new Response("unauthorized", { status: 401 });
  if (request.method !== "POST") return new Response("method", { status: 405 });
  if (deliveryPhones()?.length === 0)
    return Response.json({ paused: true, n: 0 });
  const orgs = (process.env["RIKAZ_MESSAGE_ORG_ALLOWLIST"] ?? "")
    .split(",")
    .filter((x) => UUID.test(x));
  if (!orgs.length)
    return Response.json(
      { paused: true, reason: "organization scope required", n: 0 },
      { status: 503 },
    );
  const { supabaseAdmin: a } =
    await import("@/integrations/supabase/client.server");
  let n = 0;
  for (const org of orgs.slice(0, 20))
    for (const kind of ["acct", "evt"] as const) {
      const rows = await a.rpc(
        "_rk_delivery_pending" as never,
        { _org: org, _kind: kind, _limit: 20 } as never,
      );
      if (rows.error) return new Response("retry", { status: 500 });
      try {
        n += await dispatchMessages(kind, {
          org,
          ids: (rows.data ?? []) as string[],
        });
      } catch {
        return Response.json(
          {
            reason:
              "delivery deferred; review template or provider configuration",
          },
          { status: 503 },
        );
      }
    }
  return Response.json({ n });
}
