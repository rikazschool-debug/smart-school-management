import { useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPdf, exportXlsx, type ExportMeta } from "@/lib/export";

type Cell = string | number | null;

/** One Excel/PDF pair for every procurement section; exports exactly the rows the section shows (already scoped by the server). */
export function ExportButtons({ meta, headers, rows }: { meta: ExportMeta; headers: string[]; rows: () => Cell[][] }) {
  const [busy, setBusy] = useState(false);
  async function run(kind: "xlsx" | "pdf") {
    const data = rows();
    if (!data.length) { toast.error("لا بيانات للتصدير"); return; }
    setBusy(true);
    try { if (kind === "xlsx") exportXlsx(meta, headers, data as never); else await exportPdf(meta, headers, data as never); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("xlsx")}><FileSpreadsheet className="size-4" />Excel</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("pdf")}><FileDown className="size-4" />PDF</Button>
    </div>
  );
}
