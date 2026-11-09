import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Automatic online status. The server clock decides: a session is online while it beat within 90s and was not ended.
 *  The client only sends beats for its own tab; every read goes through presence_* RPCs scoped on the server. */
export const BEAT_MS = 30_000;
export type Presence = { online: boolean; last_seen: string | null };

const TAB_KEY = "rikaz-presence-tab";
function tabKey(): string {
  let k = sessionStorage.getItem(TAB_KEY);
  if (!k) { k = crypto.randomUUID(); sessionStorage.setItem(TAB_KEY, k); }
  return k;
}

// keep `this` bound: a detached supabase.rpc throws silently inside the promise
const rpc = (fn: string, args: Record<string, unknown>) => (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(fn, args);

/** Ends this tab's presence now (sign-out). */
export async function endPresence() {
  if (typeof window === "undefined") return;
  try { await rpc("presence_end", { _tab: tabKey() }); } catch { /* the 90s timeout covers it */ }
}

/** Mounted once in the app shell: beat every 30s, beat again when the tab returns, best-effort end on page close. */
export function usePresenceBeat(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    const tab = tabKey();
    let token: string | null = null;
    // the query builder is lazy: it only sends once .then() is called
    const beat = () => { void rpc("presence_beat", { _tab: tab }).then(() => undefined, () => undefined); void supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; }); };
    beat();
    const t = window.setInterval(beat, BEAT_MS);
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    const onHide = () => {
      const url = import.meta.env["VITE_SUPABASE_URL"] as string, key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
      if (!url || !key || !token) return;
      try {
        void fetch(`${url}/rest/v1/rpc/presence_end`, { method: "POST", keepalive: true, headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ _tab: tab }) });
      } catch { /* timeout covers it */ }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); };
  }, [userId]);
}

type Row = { user_id?: string; conversation_id?: string; online: boolean; last_seen: string | null };
function usePresenceMap(key: string, fn: string, args: Record<string, unknown> | null, idField: "user_id" | "conversation_id") {
  return useQuery({
    queryKey: ["presence", key, args],
    enabled: !!args,
    refetchInterval: BEAT_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await rpc(fn, args!);
      if (error) throw error;
      return new Map(((data as Row[]) ?? []).map((r) => [r[idField] as string, { online: r.online, last_seen: r.last_seen } satisfies Presence]));
    },
  });
}
/** Org owner: users of that org. */
export const usePresenceOrg = (orgId: string | null) => usePresenceMap("org", "presence_org", orgId ? { _org: orgId } : null, "user_id");
/** Conversation members the caller may see (same rules as the member list). */
export const usePresenceConv = (convId: string | null) => usePresenceMap("conv", "presence_conv", convId ? { _conv: convId } : null, "user_id");
/** Caller's private chats → other party's status. */
export const usePresenceMyConvs = (schoolId: string | null, on = true) => usePresenceMap("myconvs", "presence_my_convs", on ? { _school: schoolId } : null, "conversation_id");

const nf = new Intl.NumberFormat("ar-SA");
/** «آخر ظهور منذ ٥ دقائق» within a day, else the Riyadh date+time. */
export function lastSeenText(iso: string | null, now = Date.now()): string {
  if (!iso) return "آخر ظهور غير متاح";
  const d = new Date(iso), s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return "آخر ظهور منذ لحظات";
  const m = Math.round(s / 60);
  if (m < 60) return `آخر ظهور منذ ${m === 1 ? "دقيقة" : m === 2 ? "دقيقتين" : `${nf.format(m)} ${m <= 10 ? "دقائق" : "دقيقة"}`}`;
  const h = Math.round(m / 60);
  if (h < 24) return `آخر ظهور منذ ${h === 1 ? "ساعة" : h === 2 ? "ساعتين" : `${nf.format(h)} ${h <= 10 ? "ساعات" : "ساعة"}`}`;
  return "آخر ظهور " + d.toLocaleString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
}

/** Green dot + «متصل», or grey dot + last seen. `compact` = dot only (title carries the text). */
export function PresenceBadge({ p, compact }: { p: Presence | undefined; compact?: boolean }) {
  if (!p) return null;
  const text = p.online ? "متصل" : lastSeenText(p.last_seen);
  return (
    <span data-presence={p.online ? "online" : "offline"} title={text} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${p.online ? "bg-success" : "bg-muted-foreground/40"}`} />
      {compact ? <span className="sr-only">{text}</span> : <span className={p.online ? "font-semibold text-success" : ""}>{text}</span>}
    </span>
  );
}
