import { describe, expect, it } from "vitest";
import { amountInWords } from "@/lib/student-finance/words";
describe("amountInWords", () => {
  it("2000 riyals", () => expect(amountInWords(2000)).toBe("ألفان ريال فقط لا غير"));
  it("riyals and halalas", () => expect(amountInWords("2500.50")).toBe("ألفان وخمسمائة ريال وخمسون هللة فقط لا غير"));
  it("3 riyals plural", () => expect(amountInWords(3)).toBe("ثلاثة ريالات فقط لا غير"));
  it("1525", () => expect(amountInWords(1525)).toBe("ألف وخمسمائة وخمسة وعشرون ريال فقط لا غير"));
  it("15000", () => expect(amountInWords(15000)).toBe("خمسة عشر ألف ريال فقط لا غير"));
});
