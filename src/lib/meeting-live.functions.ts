import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildRtcToken, RTC_JOIN, RTC_PUBLISH_AUDIO, RTC_PUBLISH_VIDEO } from "@/lib/agora-token";

/** Short token life: every renewal re-runs the membership/invitation/state checks in adm_live_join. */
const TOKEN_TTL = 600;
const UUID = /^[0-9a-f-]{36}$/i;

function agoraEnv() {
  const appId = process.env["AGORA_APP_ID"];
  const cert = process.env["AGORA_APP_CERTIFICATE"];
  const cid = process.env["AGORA_CUSTOMER_ID"];
  const csec = process.env["AGORA_CUSTOMER_SECRET"];
  if (!appId || !cert) throw new Error("إعدادات Agora ناقصة على الخادم (معرّف التطبيق أو الشهادة)");
  return { appId, cert, rest: cid && csec ? "Basic " + btoa(`${cid}:${csec}`) : null };
}

type Join = { channel: string; uid: number; screen_uid: number; host: boolean; publish_audio: boolean; screen: boolean };

/** Issues (or renews) a short-lived Agora token after the database confirms the caller may be in this meeting now. */
export const meetingToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; kind: "join" | "renew" | "screen" }) => {
    if (!UUID.test(d?.id ?? "") || !["join", "renew", "screen"].includes(d?.kind)) throw new Error("طلب غير صالح");
    return d;
  })
  .handler(async ({ data, context }) => {
    const env = agoraEnv();
    const { data: j, error } = await context.supabase.rpc("adm_live_join" as never, { _id: data.id, _kind: data.kind } as never);
    if (error) throw new Error(error.message);
    const r = j as unknown as Join;
    await processRevocations(data.id).catch(() => undefined);
    if (data.kind === "screen") {
      const token = await buildRtcToken({ appId: env.appId, appCertificate: env.cert, channel: r.channel, uid: r.screen_uid, ttl: TOKEN_TTL,
        privileges: { [RTC_JOIN]: TOKEN_TTL, [RTC_PUBLISH_VIDEO]: TOKEN_TTL, [RTC_PUBLISH_AUDIO]: TOKEN_TTL } });
      return { appId: env.appId, channel: r.channel, uid: r.screen_uid, token, ttl: TOKEN_TTL, host: r.host, publishAudio: true };
    }
    const privileges: Record<number, number> = { [RTC_JOIN]: TOKEN_TTL };
    if (r.publish_audio) privileges[RTC_PUBLISH_AUDIO] = TOKEN_TTL;
    const token = await buildRtcToken({ appId: env.appId, appCertificate: env.cert, channel: r.channel, uid: r.uid, ttl: TOKEN_TTL, privileges });
    return { appId: env.appId, channel: r.channel, uid: r.uid, screenUid: r.screen_uid, token, ttl: TOKEN_TTL, host: r.host, publishAudio: r.publish_audio };
  });

const HOST_ACTIONS = ["mute", "ask_unmute", "remove", "allow_back", "grant_share", "revoke_share", "stop_share", "end"];
const SELF_ACTIONS = ["hand", "lower", "request_share", "share_start", "share_stop", "ack_mic"];

/** Room actions. Permission checks live in adm_live_host/adm_live_self; provider-side enforcement (kick/ban/mute rules) runs right after. */
export const meetingAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; action: string; user?: string | null }) => {
    if (!UUID.test(d?.id ?? "")) throw new Error("طلب غير صالح");
    if (![...HOST_ACTIONS, ...SELF_ACTIONS, "start", "leave"].includes(d.action)) throw new Error("إجراء غير صالح");
    if (HOST_ACTIONS.includes(d.action) && d.action !== "end" && !UUID.test(d.user ?? "")) throw new Error("حدد المشارك");
    return d;
  })
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const call = data.action === "start" ? s.rpc("adm_live_start" as never, { _id: data.id } as never)
      : data.action === "leave" ? s.rpc("adm_live_leave" as never, { _id: data.id } as never)
      : HOST_ACTIONS.includes(data.action) ? s.rpc("adm_live_host" as never, { _id: data.id, _action: data.action, _user: data.user ?? null } as never)
      : s.rpc("adm_live_self" as never, { _id: data.id, _action: data.action } as never);
    const { error } = await call;
    if (error) throw new Error(error.message);
    const enforced = await processRevocations(data.id);
    return { ok: true, enforced };
  });

/** Heartbeat: keeps presence fresh, reports removal/end, and flushes pending provider-side revocations for this meeting. */
export const meetingBeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!UUID.test(d?.id ?? "")) throw new Error("طلب غير صالح");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: b, error } = await context.supabase.rpc("adm_live_beat" as never, { _id: data.id } as never);
    if (error) throw new Error(error.message);
    await processRevocations(data.id).catch(() => undefined);
    return b as unknown as { ok: boolean; reason?: string };
  });

async function agoraRule(auth: string, body: Record<string, unknown>, method: "POST" | "DELETE") {
  const res = await fetch("https://api.agora.io/dev/v1/kicking-rule", { method, headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { status?: string; id?: number; message?: string };
  if (!res.ok || j.status !== "success") throw new Error(`agora ${res.status} ${j.message ?? ""}`.trim());
  return j.id != null ? String(j.id) : null;
}

/** Applies queued kick/ban/mute rules through Agora's REST API (service role; queue rows are written only by SQL after permission checks). */
async function processRevocations(meetingId: string): Promise<number> {
  const env = agoraEnv();
  if (!env.rest) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const a = supabaseAdmin as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: rows } = await a.from("adm_meeting_revocations").select("*").eq("meeting_id", meetingId).is("done_at", null).lt("attempts", 5).order("created_at").limit(20);
  if (!rows?.length) return 0;
  const cname = "rikaz-" + meetingId.replace(/-/g, "");
  let n = 0;
  for (const r of rows as { id: string; user_id: string | null; uid: number | null; kind: string; rule_id: string | null; attempts: number }[]) {
    // claim the row so parallel heartbeats do not apply it twice
    const { data: claimed } = await a.from("adm_meeting_revocations").update({ attempts: 99 }).eq("id", r.id).is("done_at", null).lt("attempts", 5).select("id, attempts");
    if (!claimed?.length) continue;
    try {
      let rule: string | null = null;
      if (r.kind === "end") rule = await agoraRule(env.rest, { appid: env.appId, cname, time: 1440, privileges: ["join_channel"] }, "POST");
      else if (r.kind === "remove" || r.kind === "suspend") {
        rule = await agoraRule(env.rest, { appid: env.appId, cname, uid: r.uid, time: 1440, privileges: ["join_channel"] }, "POST");
        await agoraRule(env.rest, { appid: env.appId, cname, uid: (r.uid ?? 0) + 100000, time: 1440, privileges: ["join_channel"] }, "POST").catch(() => null);
        if (r.kind === "remove") await a.from("adm_meeting_members").update({ ban_rule: rule }).eq("meeting_id", meetingId).eq("user_id", r.user_id);
      } else if (r.kind === "screen") rule = await agoraRule(env.rest, { appid: env.appId, cname, uid: r.uid, time_in_seconds: 60, privileges: ["join_channel"] }, "POST");
      else if (r.kind === "mute") {
        rule = await agoraRule(env.rest, { appid: env.appId, cname, uid: r.uid, time: 1440, privileges: ["publish_audio"] }, "POST");
        await a.from("adm_meeting_members").update({ mute_rule: rule }).eq("meeting_id", meetingId).eq("user_id", r.user_id);
      } else if ((r.kind === "unmute" || r.kind === "unban") && r.rule_id) {
        await agoraRule(env.rest, { appid: env.appId, id: Number(r.rule_id) }, "DELETE").catch((e) => { if (!/not.?found|404/i.test(String(e))) throw e; });
        await a.from("adm_meeting_members").update(r.kind === "unmute" ? { mute_rule: null } : { ban_rule: null }).eq("meeting_id", meetingId).eq("user_id", r.user_id);
      }
      await a.from("adm_meeting_revocations").update({ done_at: new Date().toISOString(), rule_id: rule ?? r.rule_id, error: null }).eq("id", r.id);
      n++;
    } catch (e) {
      await a.from("adm_meeting_revocations").update({ attempts: (r.attempts ?? 0) + 1, error: String(e).slice(0, 300) }).eq("id", r.id);
    }
  }
  return n;
}
