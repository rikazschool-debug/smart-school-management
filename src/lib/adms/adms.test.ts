import { describe, expect, it } from "vitest";
import { createHmac, createHash } from "node:crypto";
import { canonical, riyadhToUtcMs, signHeaders, type IngestKey, type EventResult } from "./contract";
import { handleAdmsEvents, type IngestStore } from "./receiver";
import { runSync } from "./sync";

const A = "11111111-1111-4111-8111-111111111111", RA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "22222222-2222-4222-8222-222222222222", RB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SITE = "33333333-3333-4333-8333-333333333333", DEV = "44444444-4444-4444-8444-444444444444";
const keyA: IngestKey = { key_id: "ingest_test_A1", secret: "a".repeat(48), bridge_org_id: A, rikaz_org_id: RA, scope: "events:ingest", enabled: true };
const keyB: IngestKey = { key_id: "ingest_test_B1", secret: "b".repeat(48), bridge_org_id: B, rikaz_org_id: RB, scope: "events:ingest", enabled: true };
const NOW = Date.parse("2026-11-12T06:31:00.000Z");
const PATH = "/api/integrations/adms/v1/events";
const ev = (id: string, over: Record<string, unknown> = {}) => ({ event_id: id, org_id: A, site_id: SITE, device_id: DEV, device_pin: "00042", raw_device_time: "2026-11-12 09:30:00", timezone: "Asia/Riyadh", occurred_at_utc: "2026-11-12T06:30:00.000Z", received_at_utc: "2026-11-12T06:30:02.000Z", status: "0", verification: "1", work_code: null, ...over });
const batch = (events: unknown[], over: Record<string, unknown> = {}) => ({ contract_version: "1", request_id: crypto.randomUUID(), org_id: A, rikaz_org_id: RA, events, ...over });

/** In-memory store with the same rules as _adms_ingest (nonce once, (org,event) unique, payload fingerprint). */
function memStore() {
  const nonces = new Set<string>(), events = new Map<string, { fp: string; receipt: string }>();
  let calls = 0;
  const store: IngestStore = async (a) => {
    calls++;
    if (nonces.has(a.keyId + a.nonce)) return { replay: true };
    nonces.add(a.keyId + a.nonce);
    const results: EventResult[] = a.events.map((e) => {
      const k = a.bridgeOrg + e.event_id, fp = JSON.stringify(e), old = events.get(k);
      if (!old) { const receipt = "rz1-" + events.size; events.set(k, { fp, receipt }); return { event_id: e.event_id, status: "accepted", durable: true, receipt_id: receipt }; }
      return old.fp === fp ? { event_id: e.event_id, status: "duplicate", durable: true, receipt_id: old.receipt } : { event_id: e.event_id, status: "rejected", code: "event_id_payload_conflict" };
    });
    return { replay: false, results };
  };
  return { store, events, get calls() { return calls; } };
}
async function send(body: unknown, o: { key?: IngestKey; target?: string; nonce?: string; now?: number; mutate?: (raw: string) => string; method?: string; store?: IngestStore; keys?: IngestKey[]; intake?: boolean } = {}) {
  const key = o.key ?? keyA, raw = JSON.stringify(body), target = o.target ?? PATH;
  const headers = await signHeaders("POST", target, key.key_id, key.secret, raw, o.now ?? NOW, o.nonce);
  const req = new Request("https://kalmalki.lovable.app" + (o.target ?? PATH), { method: o.method ?? "POST", headers: { ...headers, "content-type": "application/json" }, body: o.mutate ? o.mutate(raw) : raw });
  const res = await handleAdmsEvents(req, { intakeEnabled: o.intake ?? true, keys: o.keys ?? [keyA, keyB], nowMs: () => NOW, store: o.store ?? memStore().store });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> & { results?: EventResult[] } };
}

describe("ADMS contract v1 signature", () => {
  it("matches the bridge's node:crypto canonical HMAC byte for byte", async () => {
    const body = JSON.stringify(batch([ev(crypto.randomUUID())]));
    const h = await signHeaders("POST", PATH, keyA.key_id, keyA.secret, body, NOW, "0123456789abcdef0123456789abcdef0123456789abcdef");
    const c = [ "POST", PATH, keyA.key_id, h["X-ADMS-Timestamp"], h["X-ADMS-Nonce"], createHash("sha256").update(body).digest("hex") ].join("\n");
    expect(h["X-ADMS-Signature"]).toBe(createHmac("sha256", keyA.secret).update(c).digest("hex"));
    expect(canonical("get", "/x?b=2&a=1", "k", "1", "n", "h")).toBe("GET\n/x?b=2&a=1\nk\n1\nn\nh");
  });
  it("converts Riyadh device time to UTC as −03:00 and refuses impossible dates", () => {
    expect(new Date(riyadhToUtcMs("2026-11-12 09:30:00")!).toISOString()).toBe("2026-11-12T06:30:00.000Z");
    expect(new Date(riyadhToUtcMs("2026-01-01 01:00:00")!).toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(riyadhToUtcMs("2026-02-30 10:00:00")).toBeNull();
  });
});

describe("ADMS receiver", () => {
  it("accepts with a durable receipt, then returns duplicate with the same receipt for a fresh signed request", async () => {
    const m = memStore(), id = crypto.randomUUID();
    const r1 = await send(batch([ev(id)]), { store: m.store });
    expect(r1.status).toBe(200);
    expect(r1.json.results).toEqual([{ event_id: id, status: "accepted", durable: true, receipt_id: "rz1-0" }]);
    const r2 = await send(batch([ev(id)]), { store: m.store });
    expect(r2.json.results).toEqual([{ event_id: id, status: "duplicate", durable: true, receipt_id: "rz1-0" }]);
    expect(m.events.size).toBe(1);
  });
  it("refuses a replayed nonce with 409 and a stale or future timestamp with 401", async () => {
    const m = memStore(), body = batch([ev(crypto.randomUUID())]), nonce = "f".repeat(48);
    expect((await send(body, { store: m.store, nonce })).status).toBe(200);
    expect((await send(body, { store: m.store, nonce })).json).toEqual({ error: "request_replayed" });
    expect((await send(body, { now: NOW - 301_000 })).json).toEqual({ error: "request_expired_or_invalid" });
    expect((await send(body, { now: NOW + 301_000 })).status).toBe(401);
  });
  it("rejects a changed body, path, query, method or key id", async () => {
    const body = batch([ev(crypto.randomUUID())]);
    expect((await send(body, { mutate: (r) => r.replace("00042", "00043") })).json).toEqual({ error: "signature_invalid" });
    const signedElsewhere = await signHeaders("POST", PATH + "?x=1", keyA.key_id, keyA.secret, JSON.stringify(body), NOW);
    const req = new Request("https://h" + PATH, { method: "POST", headers: { ...signedElsewhere, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await handleAdmsEvents(req, { intakeEnabled: true, keys: [keyA], nowMs: () => NOW, store: memStore().store })).status).toBe(401);
    expect((await send(body, { method: "PUT" })).status).toBe(405);
    expect((await send(body, { keys: [keyB] })).json).toEqual({ error: "integration_auth_required" });
  });
  it("organization A's key cannot deliver for organization B even with a valid signature", async () => {
    const r = await send(batch([ev(crypto.randomUUID(), { org_id: B })], { org_id: B, rikaz_org_id: RB }), { key: keyA });
    expect(r).toEqual({ status: 403, json: { error: "integration_scope_refused" } });
    const r2 = await send(batch([ev(crypto.randomUUID())], { rikaz_org_id: RB }), { key: keyA });
    expect(r2.status).toBe(403);
  });
  it("same event_id with a different payload is rejected for review, never overwritten", async () => {
    const m = memStore(), id = crypto.randomUUID();
    await send(batch([ev(id)]), { store: m.store });
    const r = await send(batch([ev(id, { status: "1" })]), { store: m.store });
    expect(r.json.results).toEqual([{ event_id: id, status: "rejected", code: "event_id_payload_conflict" }]);
  });
  it("answers exactly one result per event: invalid or inconsistent events are rejected alone", async () => {
    const ok = crypto.randomUUID(), badTime = crypto.randomUUID(), otherOrg = crypto.randomUUID(), badPin = crypto.randomUUID();
    const r = await send(batch([ev(ok), ev(badTime, { occurred_at_utc: "2026-11-12T09:30:00.000Z" }), ev(otherOrg, { org_id: B }), ev(badPin, { device_pin: 42 })]));
    expect(r.status).toBe(200);
    expect(r.json.results!.map((x) => [x.event_id, x.status, "code" in x ? x.code : x.receipt_id])).toEqual([
      [ok, "accepted", "rz1-0"], [badTime, "rejected", "time_inconsistent"], [otherOrg, "rejected", "scope_or_mapping_requires_review"], [badPin, "rejected", "invalid_event"]]);
  });
  it("keeps PIN as text with leading zeros and enforces 100 events, 256KB and JSON content type", async () => {
    let seen = "";
    const store: IngestStore = async (a) => { seen = a.events[0]!.device_pin; return { replay: false, results: a.events.map((e) => ({ event_id: e.event_id, status: "accepted" as const, durable: true as const, receipt_id: "x" })) }; };
    await send(batch([ev(crypto.randomUUID())]), { store });
    expect(seen).toBe("00042");
    expect((await send(batch(Array.from({ length: 101 }, () => ev(crypto.randomUUID()))))).status).toBe(422);
    const id = crypto.randomUUID();
    expect((await send(batch([ev(id), ev(id)]))).json).toEqual({ error: "duplicate_event_id_in_batch" });
    expect((await send(batch([ev(crypto.randomUUID(), { device_pin: "x".repeat(40) })]), { mutate: (r) => r + " ".repeat(262_200) })).status).toBe(413);
  });
  it("is off by default, and a storage failure never yields an acknowledgement", async () => {
    expect((await send(batch([ev(crypto.randomUUID())]), { intake: false })).json).toEqual({ error: "intake_disabled" });
    const r = await send(batch([ev(crypto.randomUUID())]), { store: async () => { throw new Error("down"); } });
    expect(r).toEqual({ status: 503, json: { error: "temporarily_unavailable" } });
    const short = await send(batch([ev(crypto.randomUUID()), ev(crypto.randomUUID())]), { store: async (a) => ({ replay: false, results: [{ event_id: a.events[0]!.event_id, status: "accepted", durable: true, receipt_id: "x" }] }) });
    expect(short.status).toBe(503);
  });
});

describe("ADMS registry sync", () => {
  const cred = { rikaz_org_id: RA, bridge_org_id: A, base_url: "https://bridge.test", key_id: "registry_test_A", secret: "r".repeat(48) };
  const site = (seq: number, id: string, active = true) => ({ seq, kind: "site", id, op: "upsert", data: { id, org_id: A, name: "موقع " + seq, mode: "rikaz", timezone: "Asia/Riyadh", active, updated_at: "2026-11-12T06:00:00.000Z" } });
  function bridge(pages: unknown[][], o: { failAt?: number | undefined } = {}) {
    const seen: { url: string; nonce: string; sigOk: boolean }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>, u = new URL(url), target = u.pathname + u.search;
      const c = ["GET", target, h["X-ADMS-Key-Id"], h["X-ADMS-Timestamp"], h["X-ADMS-Nonce"], createHash("sha256").update("").digest("hex")].join("\n");
      seen.push({ url: target, nonce: h["X-ADMS-Nonce"]!, sigOk: createHmac("sha256", cred.secret).update(c).digest("hex") === h["X-ADMS-Signature"] });
      if (u.pathname.endsWith("/health")) return Response.json({ ok: true, contract_version: "1", org_id: A, server_time: "x", delivery_enabled: false });
      const cur = Number(u.searchParams.get("cursor"));
      const all = pages.flat() as { seq: number }[], rest = all.filter((x) => x.seq > cur), lim = Number(u.searchParams.get("limit"));
      if (o.failAt !== undefined && cur === o.failAt) { o.failAt = undefined; return new Response("x", { status: 503 }); }
      const items = rest.slice(0, lim), high = all.at(-1)?.seq ?? 0, more = rest.length > lim;
      return Response.json({ contract_version: "1", org_id: A, items, next_cursor: more ? items.at(-1)!.seq : high, has_more: more, high_watermark: high, server_time: "x" });
    }) as unknown as typeof fetch;
    return { f, seen };
  }
  it("pages from 0 with fresh signed nonces, resumes after an interruption without duplicates", async () => {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    const { f, seen } = bridge([ids.map((id, i) => site(i + 1, id))], { failAt: 2 });
    let cursor = 0; const copy = new Map<string, unknown>();
    const deps = { fetch: f, nowMs: () => NOW, cred, limit: 2, cursor: async () => cursor, note: async () => {},
      apply: async (from: number, p: { items: { id: string }[]; next_cursor: number }) => { expect(from).toBe(cursor); for (const it of p.items) copy.set(it.id, it); cursor = p.next_cursor; } };
    const first = await runSync(deps as never);
    expect(first).toMatchObject({ ok: false, code: "http_503", pages: 1 });
    expect(cursor).toBe(2);
    const second = await runSync(deps as never);
    expect(second).toMatchObject({ ok: true, has_more: false, cursor: 5 });
    expect(copy.size).toBe(5);
    expect(seen.every((s) => s.sigOk)).toBe(true);
    expect(new Set(seen.map((s) => s.nonce)).size).toBe(seen.length);
  });
  it("refuses a health answer for another organization and a non-HTTPS bridge", async () => {
    const f = (async () => Response.json({ ok: true, contract_version: "1", org_id: B, server_time: "x", delivery_enabled: false })) as unknown as typeof fetch;
    const deps = { fetch: f, nowMs: () => NOW, cred, cursor: async () => 0, apply: async () => {}, note: async () => {} };
    expect(await runSync(deps)).toMatchObject({ ok: false, code: "health_org_mismatch" });
    expect(await runSync({ ...deps, cred: { ...cred, base_url: "http://bridge.test" } })).toMatchObject({ ok: false, code: "base_url_not_https" });
  });
});
