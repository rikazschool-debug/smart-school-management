import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b: any = { middleware: () => b, inputValidator: () => b, handler: (f: unknown) => f };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { speakArabic } from "./announce.functions";
const school = "00000000-0000-4000-8000-000000000001",
  pickup = "00000000-0000-4000-8000-000000000002";
describe("VPS speech permissions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("refuses a caller without gate permission before calling Google", async () => {
    vi.stubEnv("RIKAZ_TTS_PROVIDER", "gemini");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(
      (speakArabic as any)({
        data: { text: "اختبار", school, pickup },
        context: { userId: "qa", supabase: { rpc: vi.fn().mockResolvedValue({ data: false }) } },
      }),
    ).rejects.toThrow("غير مصرح");
    expect(f).not.toHaveBeenCalled();
  });
  it("refuses an old, foreign or forged pickup even for a gate operator", async () => {
    vi.stubEnv("RIKAZ_TTS_PROVIDER", "gemini");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const rpc = vi.fn().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: [] });
    await expect(
      (speakArabic as any)({
        data: { text: "اختبار", school, pickup },
        context: { userId: "qa", supabase: { rpc } },
      }),
    ).rejects.toThrow("لم يعد");
    expect(f).not.toHaveBeenCalled();
  });
  it("generates only the current server-authorized student call, ignoring injected client text", async () => {
    vi.stubEnv("RIKAZ_TTS_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "synthetic-key");
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
    vi.stubGlobal("fetch", f);
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({
        data: [{ id: pickup, student_name: "اسم اصطناعي", section: "شعبة اصطناعية" }],
      });
    expect(
      (
        await (speakArabic as any)({
          data: { text: "client injected private text", school, pickup },
          context: { userId: "qa-authorized", supabase: { rpc } },
        })
      ).type,
    ).toBe("audio/wav");
    expect(f.mock.calls[0]![1].body).toContain("اسم اصطناعي");
    expect(f.mock.calls[0]![1].body).not.toContain("client injected");
  });
});
