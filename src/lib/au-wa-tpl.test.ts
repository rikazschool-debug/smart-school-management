import { describe, expect, it } from "vitest";
import { auTplRow } from "./au-wa-tpl";
const t = (o: Record<string, unknown>) => ({ status: "APPROVED", category: "UTILITY", body_original: "مرحبًا {{1}} المبلغ {{2}}", header: { type: "none" }, buttons: [], ...o });
describe("automation WhatsApp templates", () => {
  it("approved utility template is usable with its variables", () => {
    const r = auTplRow(t({ name: "payment_reminder_v1" }))!;
    expect(r.usable).toBe(true); expect(r.params).toEqual(["1", "2"]);
  });
  it("marketing templates are not usable by automation", () => expect(auTplRow(t({ name: "open_chat_v2", category: "MARKETING" }))!.usable).toBe(false));
  it("login code templates are not usable", () => expect(auTplRow(t({ name: "rikaz_login_otp", category: "AUTHENTICATION" }))!.usable).toBe(false));
  it("templates of existing services are reserved", () => expect(auTplRow(t({ name: "rikaz_guardian_account_ready" }))!.usable).toBe(false));
  it("media header templates are not usable", () => expect(auTplRow(t({ name: "x_doc", header: { type: "document", link: "https://a/b.pdf" } }))!.usable).toBe(false));
  it("deleted templates are dropped", () => expect(auTplRow(t({ name: "old", status: "DELETED" }))).toBeNull());
});
