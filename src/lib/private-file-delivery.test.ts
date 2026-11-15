import { expect, it } from "vitest";
import { filePreviewKind } from "./private-file-delivery";
it("previews PDF, safe bitmap images and plain text", () => {
 expect(filePreviewKind("application/pdf")).toBe("pdf");
 expect(filePreviewKind("image/png")).toBe("image");
 expect(filePreviewKind("text/plain")).toBe("text");
});
it("does not execute SVG, HTML or Office inside a preview", () => {
 for (const mime of ["image/svg+xml", "text/html", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) expect(filePreviewKind(mime)).toBe("unsupported");
});