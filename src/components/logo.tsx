import { useId } from "react";

/** Rikaz logo: rounded tile with an «R» cut out. `light` = white tile for dark backgrounds. */
export function RikazLogo({ light, className = "size-9" }: { light?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" className={`${className} shrink-0 ${light ? "text-primary-foreground" : "text-primary"}`} role="img" aria-label="ركاز">
      <defs>
        <mask id={`rk${id}`}>
          <rect width="100" height="100" fill="#fff" />
          <path d="M-2 27 H62 A12.5 12.5 0 0 1 62 52 H-2" fill="none" stroke="#000" strokeWidth="9" />
          <path d="M56 52 L94 100" stroke="#000" strokeWidth="9.5" />
        </mask>
      </defs>
      <rect x="4" y="6" width="92" height="88" rx="16" fill="currentColor" mask={`url(#rk${id})`} />
    </svg>
  );
}
