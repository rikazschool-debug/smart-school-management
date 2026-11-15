import { AtSign } from "lucide-react";
import type { MentionPerson } from "@/lib/mentions";

/** People of this conversation to mention after typing @ (list from conversation_people). */
export function MentionMenu({ items, active, onPick, onHover }: { items: MentionPerson[]; active: number; onPick: (p: MentionPerson) => void; onHover: (i: number) => void }) {
  return (
    <ul role="listbox" aria-label="الإشارة إلى شخص" className="max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 shadow">
      {items.map((p, i) => (
        <li key={p.user_id} role="option" aria-selected={i === active}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => onHover(i)} onClick={() => onPick(p)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm ${i === active ? "bg-accent" : "hover:bg-muted"}`}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><AtSign className="size-3.5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.full_name}</span>{p.label && <span className="block truncate text-xs text-muted-foreground">{p.label}</span>}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
