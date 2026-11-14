import { describe, it, expect } from "vitest";
import { fillOperator } from "./wa-placeholders";
describe("fillOperator", () => {
  it("first name placeholder gets the employee's first name", () => {
    expect(fillOperator("معك {{operator.first_name}} وأنا استلمت محادثتك", "أحمد فهد النهير")).toBe("معك أحمد وأنا استلمت محادثتك");
  });
  it("full name placeholder gets the whole name", () => {
    expect(fillOperator("{{operator.name}}", "أحمد فهد")).toBe("أحمد فهد");
  });
  it("leaves text unchanged when the name is unknown", () => {
    expect(fillOperator("معك {{operator.first_name}}", null)).toBe("معك {{operator.first_name}}");
  });
});
