import { describe, expect, it } from "vitest";
import { waTplAutofill, waTplCheck, waTplFromWati } from "./wa-template";

const base = { id: "t1", name: "open_chat_v2", category: "MARKETING", status: "approved", type: "template", language_option: { text: "Arabic" },
  body_original: "أهلاً {{name}} — {{branch}} — رقم {{2}}", header: { type: "none" }, buttons: [{ type: "quick_reply", parameter: { text: "متابعة الطلب" } }],
  custom_params: [{ name: "name", value: "عبدالله" }, { name: "branch", value: "قناديل" }, { name: "2", value: "123" }], carousel_cards: [] };

describe("WhatsApp templates", () => {
  it("excludes authentication / login-code templates", () => {
    expect(waTplFromWati({ ...base, category: "AUTHENTICATION" })).toBeNull();
    expect(waTplFromWati({ ...base, category: "UTILITY", name: "rikaz_login_otp" })).toBeNull();
  });
  it("excludes templates that are not approved", () => {
    expect(waTplFromWati({ ...base, status: "deleted" })).toBeNull();
  });
  it("uses the real WATI variable names in body order", () => {
    expect(waTplFromWati(base)!.vars.map((v) => v.name)).toEqual(["name", "branch", "2"]);
  });
  it("prefills only the client's name and branch, never guessed numbers", () => {
    const t = waTplFromWati(base)!;
    expect(waTplAutofill(t, { name: "فهد الغامدي", branch: "البنات" })).toEqual({ name: "فهد الغامدي", branch: "البنات", "2": "" });
  });
  it("refuses sending with an empty or unknown variable", () => {
    const t = waTplFromWati(base)!;
    expect(waTplCheck(t, { name: "a", branch: "b", "2": "" })).not.toBeNull();
    expect(waTplCheck(t, { name: "a", branch: "b", "2": "1", extra: "x" })).not.toBeNull();
    expect(waTplCheck(t, { name: "a", branch: "b", "2": "1" })).toBeNull();
  });
  it("requires an https link for a dynamic media header", () => {
    const t = waTplFromWati({ ...base, body_original: "hi", header: { type: "image", link: "{{img}}" } })!;
    expect(waTplCheck(t, { img: "http://x.com/a.jpg" })).not.toBeNull();
    expect(waTplCheck(t, { img: "https://x.com/a.jpg" })).toBeNull();
  });
});
