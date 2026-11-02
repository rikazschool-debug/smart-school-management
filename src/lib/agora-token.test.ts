import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
// Agora's official builder, used only as a reference in tests
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { AccessToken2 } from "agora-token/src/AccessToken2";
import { buildRtcToken, RTC_JOIN, RTC_PUBLISH_AUDIO, RTC_PUBLISH_DATA, RTC_PUBLISH_VIDEO } from "./agora-token";

const APP = "0123456789abcdef0123456789abcdef";
const CERT = "fedcba9876543210fedcba9876543210";

describe("agora rtc token", () => {
  it("matches the official AccessToken2 bytes for the same issue time and salt", async () => {
    const ref = new AccessToken2(APP, CERT, 1700000000, 600);
    ref.salt = 12345;
    // build the same privileges as RtcTokenBuilder2 publisher role
    const official = RtcTokenBuilder.buildTokenWithUid(APP, CERT, "rikaz-abc", 42, RtcRole.PUBLISHER, 600, 600);
    expect(official.startsWith("007")).toBe(true);
    const ours = await buildRtcToken({ appId: APP, appCertificate: CERT, channel: "rikaz-abc", uid: 42, ttl: 600, issueTs: 1700000000, salt: 12345,
      privileges: { [RTC_JOIN]: 600, [RTC_PUBLISH_AUDIO]: 600, [RTC_PUBLISH_VIDEO]: 600, [RTC_PUBLISH_DATA]: 600 } });
    // compare decompressed content against the official builder fed the same issueTs/salt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new (require("agora-token/src/AccessToken2").ServiceRtc as any)("rikaz-abc", 42);
    for (const p of [1, 2, 3, 4]) svc.add_privilege(p, 600);
    ref.add_service(svc);
    const refTok: string = ref.build();
    const dec = (t: string) => inflateSync(Buffer.from(t.slice(3), "base64")).toString("hex");
    expect(dec(ours)).toBe(dec(refTok));
  });

  it("a muted participant token carries join but not publish-audio", async () => {
    const t = await buildRtcToken({ appId: APP, appCertificate: CERT, channel: "c", uid: 7, ttl: 300, issueTs: 1700000000, salt: 1, privileges: { [RTC_JOIN]: 300 } });
    const parsed = new AccessToken2();
    expect(parsed.from_string(t)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rtc = (parsed as any).services.find((s: any) => s.service_type() === 1);
    expect(Object.keys(rtc.__privileges).map(Number)).toEqual([RTC_JOIN]);
    expect(rtc.__uid).toBe("7");
  });
});
