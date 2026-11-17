import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { SV_FILE_LIMIT, validateSupervisionFile } from "@/lib/supervision-file-validation";
describe("supervision evidence server validation", () => {
  it("refuses real content beyond 10 MiB regardless of declared size", () => { expect(() => validateSupervisionFile(new Uint8Array(SV_FILE_LIMIT+1), "image/png", "x.png")).toThrow(); });
  it("refuses an executable or renamed file disguised as PDF", () => { expect(() => validateSupervisionFile(strToU8("MZ executable"), "application/pdf", "x.pdf")).toThrow(); expect(() => validateSupervisionFile(strToU8("%PDF-1.7\n%%EOF"), "application/pdf", "x.exe")).toThrow(); });
  it("refuses active PDF content", () => { expect(() => validateSupervisionFile(strToU8("%PDF-1.7 /JavaScript (bad) %%EOF"), "application/pdf", "x.pdf")).toThrow(); });
  it("accepts document containers only without embedded code or external relationships", () => {
    const d = { "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8("<document>evidence</document>") };
    expect(validateSupervisionFile(zipSync(d), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "e.docx").size).toBeGreaterThan(0);
    expect(() => validateSupervisionFile(zipSync({ ...d, "word/vbaProject.bin": strToU8("bad") }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "e.docx")).toThrow();
  });
});