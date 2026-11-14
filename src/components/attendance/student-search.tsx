// Check-in by name/code: type-ahead via att_search_students, registration via checkin_student (same server rules as a card scan).
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";

export function StudentSearchCheckin({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Row | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await db.rpc("att_search_students", { _school: schoolId, _q: term });
      if (alive) setItems((data as Row[]) ?? []);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, schoolId]);

  const checkin = async (s: Row) => {
    if (busy) return; setBusy(true);
    const { data, error } = await db.rpc("checkin_student", { _school: schoolId, _student: s["id"] });
    setBusy(false);
    setLast(error ? { result: "error", name: s["full_name"], message: arabicError(error) } : { ...(data as Row), name: s["full_name"], section: s["section"] });
    setQ(""); setItems([]);
    qc.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("att-") });
  };
  const ok = last && ["present", "late"].includes(last["result"]);

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold"><Search className="size-5 text-primary" />تسجيل الحضور بالبحث بالاسم أو رقم الطالب</h2>
      <p className="mb-3 text-sm text-muted-foreground">اكتب أول حرفين من اسم الطالب أو رقمه، ثم اختره من القائمة. تُطبق القواعد نفسها المطبقة على مسح البطاقة.</p>
      <div className="relative">
        <Input aria-label="بحث عن طالب" placeholder="اسم الطالب أو رقمه" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 text-lg" autoComplete="off" />
        {items.length > 0 && (
          <ul role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-popover shadow-lg">
            {items.map((s) => (
              <li key={s["id"]} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
                <div className="min-w-0 flex-1"><p className="font-semibold">{s["full_name"]}</p><p className="text-xs text-muted-foreground">رقم {s["code"]} • {s["section"] ?? "—"}</p></div>
                <Button size="sm" disabled={busy} onClick={() => void checkin(s)}>تسجيل حضور</Button>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && items.length === 0 && <p className="mt-2 text-sm text-muted-foreground">لا توجد نتائج مطابقة.</p>}
      </div>
      {last && (
        <div role="status" className={`mt-4 flex items-center gap-2 rounded-xl border-2 p-3 font-semibold ${ok ? "border-primary bg-primary/5" : last["result"] === "duplicate" ? "bg-muted" : "border-destructive bg-destructive/5"}`}>
          {ok ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}{last["name"]} — {last["message"]}
        </div>
      )}
    </section>
  );
}
