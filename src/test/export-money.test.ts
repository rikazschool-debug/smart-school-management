import { describe, it, expect } from "vitest";
import { buildSheet, moneyValue } from "@/lib/export";

describe("Excel money cells", () => {
  it("parses Arabic-digit riyal amounts", () => {
    expect(moneyValue("٥٬٠٠٠٫٠٠ ر.س")).toBe(5000);
    expect(moneyValue("٤٬٩٩٠٫٠٠ ر.س")).toBe(4990);
    expect(moneyValue("-1,250.50 ر.س")).toBe(-1250.5);
  });
  it("leaves IDs and phones as text", () => {
    expect(moneyValue("0551234567")).toBeNull();
    expect(moneyValue("1095541038")).toBeNull();
  });
  it("writes money as a numeric cell", () => {
    const ws = buildSheet({ title: "t", filters: [] }, ["a", "b"], [["0551234567", "٥٬٠٠٠٫٠٠ ر.س"]]);
    const cells = Object.values(ws).filter((c: any) => c && c.t) as any[];
    expect(cells.some((c) => c.t === "n" && c.v === 5000)).toBe(true);
    expect(cells.some((c) => c.t === "s" && c.v === "0551234567")).toBe(true);
  });
});
