export function filePreviewKind(mime: string): "pdf" | "image" | "text" | "unsupported" {
  if (mime === "application/pdf") return "pdf";
  if (["image/png", "image/jpeg", "image/webp"].includes(mime)) return "image";
  if (mime === "text/plain") return "text";
  return "unsupported";
}
export async function deliverPrivateBlob(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}