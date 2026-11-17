import { unzipSync } from "fflate";
export const SV_FILE_LIMIT = 10485760;
const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx" };
export function validateSupervisionFile(bytes: Uint8Array, mime: string, name: string) {
  if (!bytes.length || bytes.length > SV_FILE_LIMIT) throw Error("الملف يتجاوز الحد المسموح: 10 ميغابايت");
  const extension = name.toLowerCase().split(".").at(-1);
  if (!extensions[mime] || (extension !== extensions[mime] && !(mime === "image/jpeg" && extension === "jpeg"))) throw Error("نوع الملف وامتداده غير متطابقين");
  const matches = (offset: number, signature: number[]) => signature.every((v, i) => bytes[offset + i] === v);
  const text = new TextDecoder("latin1").decode(bytes);
  let valid = false;
  if (mime === "image/png") valid = matches(0, [137,80,78,71,13,10,26,10]) && text.includes("IHDR") && text.includes("IEND");
  if (mime === "image/jpeg") valid = matches(0, [255,216,255]) && matches(bytes.length - 2, [255,217]);
  if (mime === "image/webp") valid = text.startsWith("RIFF") && text.slice(8,12) === "WEBP" && bytes.length >= 20;
  if (mime === "application/pdf") valid = text.startsWith("%PDF-") && text.slice(-1024).includes("%%EOF") && !/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/.test(text);
  // Legacy Word is not accepted on signature alone: CFB containers can carry VBA/executables.
  if (mime === "application/msword") throw Error("مستند Word القديم غير مدعوم للرفع الآمن؛ احفظه بصيغة DOCX أو PDF");
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    let expanded = 0;
    for (let i = 0; i + 46 <= bytes.length; i++) if (matches(i, [80,75,1,2])) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + i, 46);
      expanded += view.getUint32(24, true);
      if (expanded > 30 * 1024 * 1024 || (view.getUint16(8, true) & 1)) throw Error("مستند مضغوط كبير أو مشفر غير مدعوم");
    }
    if (!expanded) throw Error("بنية المستند غير صالحة");
    const entries = unzipSync(bytes);
    valid = !!entries["[Content_Types].xml"] && !!entries["word/document.xml"] && !Object.keys(entries).some((n) => /vba|embeddings|\.exe$|\.bin$|\.\.\//i.test(n)) && !Object.entries(entries).some(([n, b]) => n.endsWith(".rels") && /TargetMode\s*=\s*["']External/i.test(new TextDecoder().decode(b)));
  }
  if (!valid) throw Error("محتوى الملف لا يطابق نوعه أو يتضمن محتوى نشطًا غير مسموح");
  return { mime, size: bytes.length };
}