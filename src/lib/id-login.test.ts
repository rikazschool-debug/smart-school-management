import { describe, expect, it } from "vitest";
import { idLoginMessage, maskPhone } from "./id-login";

describe("id login", () => {
  it("does not reveal whether the ID exists, has no phone, or conflicts", () => {
    const m = idLoginMessage("not_found");
    expect(idLoginMessage("no_phone")).toBe(m);
    expect(idLoginMessage("conflict_phone")).toBe(m);
    expect(idLoginMessage("no_account")).toBe(m);
  });
  it("masks all but the last 3 digits", () => expect(maskPhone("966501234567")).toBe("••••••567"));
});
