import { describe, expect, it, vi } from "vitest";
import { geminiSpeech, speechWav, reserveSpeech } from "./gemini-speech.server";
describe("VPS speech format and provider boundary", () => {
  it("wraps mono PCM as a valid WAV without altering the audio bytes", () => {
    const bytes = Uint8Array.from(
      atob(speechWav(btoa("\x01\x02\x03\x04"), "audio/L16;codec=pcm;rate=24000")),
      (c) => c.charCodeAt(0),
    );
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(24000);
    expect([...bytes.slice(44)]).toEqual([1, 2, 3, 4]);
    expect(speechWav(btoa(String.fromCharCode(...bytes)), "audio/wav")).toBe(
      btoa(String.fromCharCode(...bytes)),
    );
  });
  it("rejects malformed audio and unsupported sample rates", () => {
    expect(() => speechWav(btoa("bad"), "audio/wav")).toThrow();
    expect(() => speechWav(btoa("00"), "audio/L16;rate=8000")).toThrow();
    expect(() => speechWav(btoa("000"), "audio/pcm")).toThrow();
    expect(() => speechWav(btoa("00"), "text/html")).toThrow();
  });
  it("keeps API keys in headers, uses an approved fixed host and reports no provider body", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: btoa("00"), mimeType: "audio/L16;rate=24000" } }],
              },
            },
          ],
        }),
      );
    expect((await geminiSpeech("اسم اصطناعي", "synthetic-key", undefined, f)).type).toBe(
      "audio/wav",
    );
    expect(f.mock.calls[0]![0]).not.toContain("synthetic-key");
    expect(f.mock.calls[0]![1].headers["x-goog-api-key"]).toBe("synthetic-key");
    const failed = vi
      .fn()
      .mockResolvedValue(new Response("private provider diagnostic", { status: 401 }));
    await expect(geminiSpeech("اختبار", "synthetic-key", undefined, failed)).rejects.toThrow(
      "(401)",
    );
  });
  it("rejects a model change before any provider request", async () => {
    const f = vi.fn();
    await expect(geminiSpeech("اختبار", "synthetic-key", "unreviewed-model", f)).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it("limits parallel requests and prevents double release", () => {
    const a = reserveSpeech("qa-a"),
      b = reserveSpeech("qa-b");
    expect(() => reserveSpeech("qa-c")).toThrow();
    a();
    a();
    b();
    const c = reserveSpeech("qa-c");
    c();
  });
});
