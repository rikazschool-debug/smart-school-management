import { watiOrigin } from "./wati-otp";
export type DeliveryScope = {
  ids: string[];
  actor?: string;
  org?: string;
  proof?: Record<string, string>;
};
type Row = {
  id: string;
  phone: string;
  ref: string;
  params: Record<string, string>;
};
const EXPECTED = {
  rikaz_login_otp: ["1"],
  rikaz_guardian_account_ready: ["1", "2"],
  rikaz_event_update: ["name", "2", "3", "4"],
} as const;
export function deliveryPhones(): string[] | null {
  if (
    process.env["RIKAZ_OUTBOUND_ENABLED"] === "false" ||
    process.env["RIKAZ_DELIVERY_MODE"] === "off"
  )
    return [];
  if (process.env["RIKAZ_DELIVERY_MODE"] !== "test") return null;
  return (process.env["RIKAZ_TEST_PHONE_ALLOWLIST"] ?? "")
    .split(",")
    .map((x) => x.replace(/\D/g, ""))
    .filter((x) => /^9665\d{8}$/.test(x));
}
export function deliveryPhoneAllowed(phone: string) {
  const p = deliveryPhones();
  return /^9665\d{8}$/.test(phone) && (p === null || p.includes(phone));
}
export function checkAutomaticTemplate(
  raw: Record<string, unknown>,
  name: keyof typeof EXPECTED,
) {
  if (
    raw["name"] !== name ||
    String(raw["status"]).toLowerCase() !== "approved"
  )
    throw Error("Template unavailable");
  const cat = String(raw["category"] ?? "").toUpperCase();
  if (
    name === "rikaz_login_otp"
      ? cat !== "AUTHENTICATION"
      : cat === "AUTHENTICATION"
  )
    throw Error("Template category mismatch");
  const header = raw["header"] as { type?: string; text?: string } | undefined;
  if (header?.type && !["none", "text"].includes(header.type.toLowerCase()))
    throw Error("Unsupported automatic header");
  const content = JSON.stringify([
    raw["body_original"] ?? raw["body"],
    header?.text,
    raw["buttons"],
  ]);
  const vars = [
    ...new Set(
      [...content.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((x) => x[1]),
    ),
  ].sort();
  if (JSON.stringify(vars) !== JSON.stringify([...EXPECTED[name]].sort()))
    throw Error("Template variables mismatch");
  return true;
}
export async function automaticTemplate(
  name: keyof typeof EXPECTED,
  base: string,
  token: string,
) {
  const origin = watiOrigin(base);
  if (!origin.startsWith("https://")) throw Error("HTTPS required");
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(
      `${origin}/api/ext/v3/messageTemplates?page_size=100&page_number=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
          "User-Agent": "Rikaz/1.0",
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) throw Error(`Template lookup HTTP ${r.status}`);
    const j = (await r.json()) as { templates?: Record<string, unknown>[] };
    if (!Array.isArray(j.templates))
      throw Error("Template response unsupported");
    const raw = j.templates.find((t) => t["name"] === name);
    if (raw) {
      checkAutomaticTemplate(raw, name);
      return;
    }
    if (j.templates.length < 100) break;
  }
  throw Error("Approved template missing");
}
export type SendResult = {
  status: "accepted" | "failed" | "unknown";
  providerRef: string | null;
};
export function templateSendResult(
  http: number,
  raw: unknown,
  ref: string,
): SendResult {
  if (http >= 500) return { status: "unknown", providerRef: null };
  if (http >= 400) return { status: "failed", providerRef: null };
  if (!raw || typeof raw !== "object")
    return { status: "unknown", providerRef: null };
  const j = raw as Record<string, unknown>;
  if (j["success"] === false || j["result"] === false || j["error"])
    return { status: "failed", providerRef: null };
  const rows = j["recipients"] as Record<string, unknown>[] | undefined;
  if (!Array.isArray(rows) || rows.length !== 1)
    return { status: "unknown", providerRef: null };
  const r = rows[0]!,
    echo = r["local_message_id"] ?? r["localMessageId"];
  if (echo && echo !== ref) return { status: "unknown", providerRef: null };
  if (r["error"] || (Array.isArray(r["errors"]) && r["errors"].length))
    return { status: "failed", providerRef: null };
  if (j["success"] !== true && j["result"] !== true)
    return { status: "unknown", providerRef: null };
  return {
    status: "accepted",
    providerRef: typeof echo === "string" ? echo : null,
  };
}
export async function sendAutomatic(
  base: string,
  token: string,
  template: string,
  phone: string,
  ref: string,
  params: Record<string, string>,
): Promise<SendResult> {
  if (!deliveryPhoneAllowed(phone))
    return { status: "failed", providerRef: null };
  try {
    const body: Record<string, unknown> = {
      template_name: template,
      broadcast_name: "rikaz_" + template,
      recipients: [
        {
          phone_number: phone,
          local_message_id: ref,
          custom_params: Object.entries(params).map(([name, value]) => ({
            name,
            value,
          })),
        },
      ],
    };
    if (process.env["WATI_CHANNEL"]?.trim())
      body["channel"] = process.env["WATI_CHANNEL"].trim();
    const r = await fetch(
      `${watiOrigin(base)}/api/ext/v3/messageTemplates/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`,
          "Content-Type": "application/json",
          "User-Agent": "Rikaz/1.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    return templateSendResult(r.status, await r.json().catch(() => null), ref);
  } catch {
    return { status: "unknown", providerRef: null };
  }
}
export async function dispatchMessages(
  kind: "acct" | "evt",
  scope: DeliveryScope,
): Promise<number> {
  const phones = deliveryPhones();
  if (phones?.length === 0 || !scope.ids.length) return 0;
  if (scope.ids.length > 20 || (!scope.actor && !scope.org && !scope.proof))
    throw Error("Explicit delivery scope required");
  const base = process.env["WATI_API_BASE_URL"],
    token = process.env["WATI_API_TOKEN"],
    template =
      kind === "acct" ? "rikaz_guardian_account_ready" : "rikaz_event_update";
  if (!base || !token) return 0;
  await automaticTemplate(template, base, token);
  const { supabaseAdmin: a } =
    await import("@/integrations/supabase/client.server");
  let n = 0;
  // Claim immediately before each provider call; an interrupted invocation leaves the remaining rows pending.
  for (const id of scope.ids) {
    const { data, error } = await a.rpc(
      "_rk_delivery_claim" as never,
      {
        _kind: kind,
        _ids: [id],
        _actor: scope.actor ?? null,
        _org: scope.org ?? null,
        _proof: scope.proof ?? {},
        _phones: phones,
      } as never,
    );
    if (error) throw Error("Delivery claim rejected");
    for (const r of (data ?? []) as unknown as Row[]) {
      const p = r.params,
        params: Record<string, string> =
          kind === "acct"
            ? {
                "1": (p["name"] ?? "").slice(0, 60),
                "2": (p["school"] ?? "").slice(0, 120),
              }
            : {
                name: (p["name"] ?? "").slice(0, 60),
                "2": p["ref"] ?? "",
                "3": (p["title"] ?? "").slice(0, 120),
                "4": (p["status"] ?? "").slice(0, 300),
              };
      const out = await sendAutomatic(
        base,
        token,
        template,
        r.phone,
        r.ref,
        params,
      );
      const done = await a.rpc(
        "_rk_delivery_done" as never,
        {
          _kind: kind,
          _id: r.id,
          _ref: r.ref,
          _status: out.status,
          _provider: out.providerRef,
        } as never,
      );
      if (done.error)
        throw Error("Delivery result persistence failed; claim retained");
      n++;
    }
  }
  return n;
}
export async function eventDelivery(scope: {
  app?: string;
  actor?: string;
  proof?: Record<string, string>;
}) {
  if (deliveryPhones()?.length === 0) return 0;
  const { supabaseAdmin: a } =
    await import("@/integrations/supabase/client.server");
  const { data, error } = await a.rpc(
    "_rk_event_delivery_ids" as never,
    {
      _app: scope.app ?? null,
      _actor: scope.actor ?? null,
      _proof: scope.proof ?? {},
    } as never,
  );
  if (error) throw Error("Event delivery scope rejected");
  return dispatchMessages("evt", {
    ids: (data ?? []) as string[],
    ...(scope.actor ? { actor: scope.actor } : {}),
    ...(scope.proof ? { proof: scope.proof } : {}),
  });
}
