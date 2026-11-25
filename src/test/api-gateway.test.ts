import { describe, expect, it } from "vitest";
import { apiPath, keyEnv, webhookUrlOk } from "@/lib/api-gateway";

describe("webhook target guard", () => {
  it("accepts a public https host", () => expect(webhookUrlOk("https://example.com/rikaz-hook")).toBe(true));
  it("refuses plain http", () => expect(webhookUrlOk("http://example.com/x")).toBe(false));
  it("refuses IP literals", () => expect(webhookUrlOk("https://10.0.0.1/x")).toBe(false));
  it("refuses localhost and internal names", () => { expect(webhookUrlOk("https://localhost/x")).toBe(false); expect(webhookUrlOk("https://db.internal/x")).toBe(false); });
  it("refuses non-default ports and credentials", () => { expect(webhookUrlOk("https://example.com:8443/x")).toBe(false); expect(webhookUrlOk("https://u:p@example.com/x")).toBe(false); });
});
describe("api keys and paths", () => {
  it("reads the environment from the prefix", () => { expect(keyEnv("rk_live_" + "a".repeat(43))).toBe("live"); expect(keyEnv("rk_test_" + "a".repeat(43))).toBe("test"); expect(keyEnv("sk_" + "a".repeat(43))).toBeNull(); });
  it("allows at most resource/id", () => { expect(apiPath("students/abc")).toEqual(["students", "abc"]); expect(apiPath("a/b/c")).toBeNull(); expect(apiPath("students/../x")).toBeNull(); });
});
