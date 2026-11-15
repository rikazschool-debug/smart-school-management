import { useEffect, useRef, useState } from "react";
import { ErrorState, LoadingState } from "@/components/states";
export function PdfPages({ blob }: { blob: Blob }) {
  const container = useRef<HTMLDivElement>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => {
    let stopped = false; let destroy: (() => void) | undefined; const node = container.current; if (!node) return;
    node.replaceChildren();
    void (async () => {
      const pdfjs = await import("pdfjs-dist"); const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({ data: await blob.arrayBuffer(), isEvalSupported: false }); destroy = () => { void task.destroy(); };
      const pdf = await task.promise;
      for (let n = 1; n <= pdf.numPages && !stopped; n++) {
        const page = await pdf.getPage(n); const canvas = document.createElement("canvas"); const viewport = page.getViewport({ scale: 1.3 });
        canvas.width = viewport.width; canvas.height = viewport.height; canvas.className = "mb-3 h-auto w-full border"; canvas.setAttribute("aria-label", `صفحة ${n}`);
        const context = canvas.getContext("2d"); if (!context) throw new Error("تعذر عرض PDF");
        await page.render({ canvas, canvasContext: context, viewport }).promise; if (!stopped) node.append(canvas);
      }
      if (!stopped) setLoading(false);
    })().catch(() => { if (!stopped) { setError("تعذرت معاينة PDF؛ يمكنك تنزيل الملف."); setLoading(false); } });
    return () => { stopped = true; destroy?.(); node.replaceChildren(); };
  }, [blob]);
  return <>{loading && <LoadingState />}{error && <ErrorState message={error} />}<div ref={container} className="max-h-[65vh] overflow-y-auto" /></>;
}