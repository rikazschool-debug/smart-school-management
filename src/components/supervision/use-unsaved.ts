import { useEffect, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ask } from "@/components/confirm";

/** One guard for route exits and local view changes; never persist sensitive drafts. */
export function useUnsaved(dirty: boolean) {
  const bypass = useRef(false);
  useEffect(() => { if (dirty) bypass.current = false; }, [dirty]);
  useBlocker({
    shouldBlockFn: async () => dirty && !bypass.current && !(await ask("لديك تغييرات غير محفوظة. المغادرة دون حفظ؟", { destructive: true, ok: "مغادرة دون حفظ" })),
    enableBeforeUnload: () => dirty && !bypass.current,
  });
  return {
    saved: () => { bypass.current = true; },
    changed: () => { bypass.current = false; },
    leave: async (next: () => void) => {
      if (dirty && !bypass.current && !(await ask("لديك تغييرات غير محفوظة. المغادرة دون حفظ؟", { destructive: true, ok: "مغادرة دون حفظ" }))) return;
      bypass.current = true; next();
    },
  };
}