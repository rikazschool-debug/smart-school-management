import { describe, expect, it } from "vitest";
import { buildOpenApi, buildPostman, type SpecRes } from "./api-spec";

const cat: SpecRes[] = [
  { key: "students", label: "الطلاب", area: "school", ops: { read: true }, fields: [{ k: "id", l: "المعرّف" }, { k: "national_id", l: "الهوية", s: true }] },
  { key: "inbox_requests", label: "طلبات", area: "central", ops: { read: true, cancel: true }, actions: ["cancel"], fields: [{ k: "id", l: "المعرّف" }] },
];

describe("API documents", () => {
  it("never documents DELETE", () => {
    const o = buildOpenApi(cat, "https://x/api/public/v1");
    expect(Object.values(o.paths).some((p) => "delete" in p)).toBe(false);
  });
  it("exposes the cancel action path", () => {
    expect(Object.keys(buildOpenApi(cat, "b").paths)).toContain("/inbox_requests/{id}/cancel");
  });
  it("Postman collection carries an empty key placeholder, never a secret", () => {
    const p = buildPostman(cat, "b");
    expect(p.variable.find((v) => v.key === "api_key")?.value).toBe("");
    expect(JSON.stringify(p)).not.toMatch(/rk_(live|test)_[A-Za-z0-9]/);
  });
});
