import { enHint } from "@/lib/hr-bilingual";

/** Small English equivalent under a field (display only, never saved). Hidden when empty or not translatable. */
export function EnHint({ k, v }: { k: string; v: string | null | undefined }) {
  const t = enHint(k, v);
  return t ? <p dir="ltr" className="mt-0.5 text-end text-xs text-muted-foreground" data-en-hint={k}>{t}</p> : null;
}
