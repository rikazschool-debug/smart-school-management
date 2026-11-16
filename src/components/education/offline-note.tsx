import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";

/** Shown in plan forms while the device is offline: nothing is saved until the connection returns. */
export function OfflineNote() {
  const on = useOnline();
  if (on) return null;
  return <p role="status" className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><WifiOff className="size-4 shrink-0" />لا يوجد اتصال بالإنترنت. يمكنك متابعة الكتابة، لكن لن يُحفظ شيء حتى يعود الاتصال؛ لا تغلق الصفحة.</p>;
}
