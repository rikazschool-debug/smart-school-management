/** Agora AccessToken2 ("007") for RTC, built with Web Crypto + CompressionStream so it runs on the Worker runtime (no Node crypto/zlib). */

export const RTC_JOIN = 1;
export const RTC_PUBLISH_AUDIO = 2;
export const RTC_PUBLISH_VIDEO = 3;
export const RTC_PUBLISH_DATA = 4;

class Buf {
  private parts: number[] = [];
  u16(v: number) { this.parts.push(v & 0xff, (v >>> 8) & 0xff); return this; }
  u32(v: number) { v = v >>> 0; this.parts.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); return this; }
  bytes(b: Uint8Array) { this.u16(b.length); for (const x of b) this.parts.push(x); return this; }
  str(s: string) { return this.bytes(new TextEncoder().encode(s)); }
  raw(b: Uint8Array) { for (const x of b) this.parts.push(x); return this; }
  out() { return new Uint8Array(this.parts); }
}

async function hmac(key: Uint8Array, msg: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, msg as BufferSource));
}

async function deflate(data: Uint8Array) {
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  void w.write(data as BufferSource);
  void w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function b64(b: Uint8Array) {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export type RtcTokenInput = {
  appId: string;
  appCertificate: string;
  channel: string;
  uid: number;
  /** seconds the token stays valid */
  ttl: number;
  /** privilege id -> seconds valid (relative), e.g. { [RTC_JOIN]: 600 } */
  privileges: Record<number, number>;
  issueTs?: number;
  salt?: number;
};

export async function buildRtcToken(i: RtcTokenInput): Promise<string> {
  if (!/^[0-9a-f]{32}$/i.test(i.appId) || !/^[0-9a-f]{32}$/i.test(i.appCertificate)) throw new Error("Agora app id/certificate malformed");
  const issueTs = i.issueTs ?? Math.floor(Date.now() / 1000);
  const salt = i.salt ?? (Math.floor(Math.random() * 99999999) + 1);
  const enc = new TextEncoder();
  let signing = await hmac(new Buf().u32(issueTs).out(), enc.encode(i.appCertificate));
  signing = await hmac(new Buf().u32(salt).out(), signing);
  const keys = Object.keys(i.privileges).map(Number).sort((a, b) => a - b);
  const svc = new Buf().u16(1).u16(keys.length);
  for (const k of keys) svc.u16(k).u32(i.privileges[k]!);
  svc.str(i.channel).str(i.uid === 0 ? "" : String(i.uid));
  const info = new Buf().str(i.appId).u32(issueTs).u32(i.ttl).u32(salt).u16(1).raw(svc.out()).out();
  const sig = await hmac(signing, info);
  const content = new Buf().bytes(sig).raw(info).out();
  return "007" + b64(await deflate(content));
}
