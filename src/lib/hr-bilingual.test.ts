import { describe, expect, it } from "vitest";
import { bi, enHint } from "@/lib/hr-bilingual";

describe("HR bilingual labels", () => {
  it("label is «Arabic / English» on one line", () => { expect(bi("nationality", "الجنسية")).toBe("الجنسية / Nationality"); });
  it("typing «معلم» in job title shows Teacher", () => { expect(enHint("job_title", "معلم")).toBe("Teacher"); });
  it("choosing «متزوج» shows Married", () => { expect(enHint("marital_status", "متزوج")).toBe("Married"); });
  it("empty value hides the hint", () => { expect(enHint("job_title", "")).toBe(""); });
  it("names are never translated", () => { expect(enHint("full_name", "معلم")).toBe(""); expect(enHint("display_name", "سعودي")).toBe(""); });
  it("unknown value is not guessed", () => { expect(enHint("job_title", "وظيفة غير معروفة")).toBe(""); });
});
