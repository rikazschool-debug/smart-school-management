import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Password field with show/hide toggle; used for sign-in, initial passwords and resets. */
export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} dir="ltr" className={"pe-10 " + (props.className ?? "")} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Simple strength meter: 0 weak … 3 strong. */
export function passwordScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Za-z\u0600-\u06FF]/.test(p) && /\d/.test(p)) s++;
  if (p.length >= 12 || /[^A-Za-z0-9\u0600-\u06FF]/.test(p)) s++;
  return s;
}
