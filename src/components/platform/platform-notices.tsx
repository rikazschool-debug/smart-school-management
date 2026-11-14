import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, useSession } from "@/lib/session";

const ROLES: [string, string][] = [["org_owner", "ملاك المجموعات"], ["principal", "مديرو المدارس"], ["vice_principal", "الوكلاء"], ["teacher", "المعلمون"], ["supervisor", "المشرفون"], ["student_affairs", "شؤون الطلاب"], ["guardian", "أولياء الأمور"], ["student", "الطلاب"]];
const SCOPE: Record<string, string> = { all: "كل المجموعات", orgs: "مجموعات محددة", schools: "فروع محددة" };

/** Platform owner notices to groups/branches; recipients resolved and notified on the server (platform_notice_send). */
export function PlatformNotices() {
  const { active } = useSession();
  const qc = useQueryClient();
  const ok = active?.role === "platform_admin";
  const orgs = useQuery({ queryKey: ["platform-orgs"], enabled: ok, queryFn: async () => { const { data, error } = await db.rpc("platform_orgs"); if (error) throw error; return ((data ?? []) as Row[]).filter((o) => !o["is_test"]); } });
  const log = useQuery({ queryKey: ["platform-notices"], enabled: ok, queryFn: async () => { const { data, error } = await db.rpc("platform_notices_list" as never); if (error) throw error; return (data ?? []) as Row[]; } });
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [scope, setScope] = useState("all");
  const [pick, setPick] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>(["org_owner", "principal"]);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  if (!ok) return <ForbiddenState />;
  const tog = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { data, error } = await db.rpc("platform_notice_send" as never, { _key: key, _title: title, _body: body, _scope: scope, _orgs: scope === "orgs" ? pick : [], _schools: scope === "schools" ? pick : [], _roles: roles } as never);
    setBusy(false);
    if (error) { toast.error(arabicError(error)); return; }
    toast.success(`أُرسل الإشعار إلى ${(data as Row)["recipients"]} مستلم`);
    setTitle(""); setBody(""); setPick([]); setKey(crypto.randomUUID());
    void qc.invalidateQueries({ queryKey: ["platform-notices"] });
  }
  const all = orgs.data ?? [];
  return (
    <>
      <PageHeader title="إشعارات المنصة" desc="أرسل إشعارًا إلى كل المجموعات أو مجموعات أو فروع محددة، واختر من يستلمه." />
      <div className="grid gap-5 lg:grid-cols-5">
        <form onSubmit={send} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm lg:col-span-3">
          <div className="space-y-1"><Label htmlFor="pn-t">العنوان</Label><Input id="pn-t" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="pn-b">نص الإشعار</Label><Textarea id="pn-b" rows={4} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="space-y-2"><Label>إلى</Label>
            <div className="flex flex-wrap gap-2">{Object.entries(SCOPE).map(([k, l]) => <Button key={k} type="button" size="sm" variant={scope === k ? "default" : "outline"} onClick={() => { setScope(k); setPick([]); }}>{l}</Button>)}</div>
            {scope !== "all" && (orgs.isLoading ? <LoadingState rows={1} /> : (
              <div className="max-h-56 space-y-2 overflow-auto rounded-xl border p-3 text-sm">
                {all.map((o) => scope === "orgs" ? (
                  <label key={o["id"]} className="flex items-center gap-2"><input type="checkbox" checked={pick.includes(o["id"])} onChange={() => setPick(tog(pick, o["id"]))} />{o["name"]}</label>
                ) : (
                  <div key={o["id"]}><p className="font-semibold">{o["name"]}</p>
                    {((o["schools"] ?? []) as Row[]).map((s) => <label key={s["id"]} className="ms-4 flex items-center gap-2"><input type="checkbox" checked={pick.includes(s["id"])} onChange={() => setPick(tog(pick, s["id"]))} />{s["name"]}</label>)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="space-y-2"><Label>المستلمون</Label>
            <div className="flex flex-wrap gap-2">{ROLES.map(([k, l]) => <Button key={k} type="button" size="sm" variant={roles.includes(k) ? "default" : "outline"} onClick={() => setRoles(tog(roles, k))}>{l}</Button>)}</div>
          </div>
          <Button type="submit" disabled={busy}><Send className="size-4" />{busy ? "جارٍ الإرسال…" : "إرسال الإشعار"}</Button>
        </form>
        <section className="rounded-2xl border bg-card shadow-sm lg:col-span-2">
          <h2 className="border-b p-4 font-bold">الإشعارات المرسلة</h2>
          {log.isLoading ? <LoadingState rows={2} /> : log.error ? <ErrorState message={arabicError(log.error)} /> : !log.data?.length ? <p className="p-4 text-sm text-muted-foreground">لم يُرسل أي إشعار بعد.</p> : (
            <ul className="max-h-[32rem] divide-y overflow-auto">
              {log.data.map((n) => (
                <li key={n["id"]} className="p-4 text-sm"><p className="font-semibold">{n["title"]}</p><p className="mt-1 line-clamp-2 text-muted-foreground">{n["body"]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{SCOPE[n["scope"]]} · {n["recipients"]} مستلم · {new Date(n["created_at"]).toLocaleString("ar-SA")}</p></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
