import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { openFile } from "@/lib/comm";


/** Image preview in a message: short-lived signed URL (private bucket); click opens full size. */
export function ImageThumb({ file }: { file: Row }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    db.storage.from("rikaz-files").createSignedUrl(file["storage_path"], 300).then(({ data, error }) => {
      if (!live) return; if (error || !data) setFailed(true); else setSrc(data.signedUrl);
    });
    return () => { live = false; };
  }, [file["storage_path"]]);
  return (
    <button type="button" onClick={() => openFile(file)} title={file["name"]} className="block overflow-hidden rounded-lg border bg-muted">
      {src && !failed ? <img src={src} alt={file["name"]} loading="lazy" className="max-h-56 max-w-64 object-cover" onError={() => setFailed(true)} />
        : <span className="flex size-24 items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></span>}
    </button>
  );
}

/** Preview of an image chosen but not yet sent (local object URL, revoked on unmount). */
export function LocalThumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { const u = URL.createObjectURL(file); setSrc(u); return () => URL.revokeObjectURL(u); }, [file]);
  return src ? <img src={src} alt="" className="size-10 rounded object-cover" /> : null;
}
