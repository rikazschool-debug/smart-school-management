import { describe, expect, it } from "vitest";
import { fillReply } from "./reply-fill";

const tpl = "حياك الله ✨\n\nمعك {الاسم} وأنا استلمت محادثتك الآن";
describe("saved reply name placeholder", () => {
  it("uses the sending account's name", () => {
    expect(fillReply(tpl, "محمد رفعت")).toBe("حياك الله ✨\n\nمعك محمد رفعت وأنا استلمت محادثتك الآن");
    expect(fillReply(tpl, "خالد")).toBe("حياك الله ✨\n\nمعك خالد وأنا استلمت محادثتك الآن");
  });
  it("first-name placeholder", () => expect(fillReply("معك {الاسم_الأول}", "خالد العتيبي")).toBe("معك خالد"));
  it("keeps the placeholder when the name is unknown", () => expect(fillReply("معك {الاسم}", "")).toBe("معك {الاسم}"));
});
