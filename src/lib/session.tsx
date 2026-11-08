import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "./roles";

export type AppContext = {
  key: string;
  role: Role;
  orgId: string | null;
  orgName: string;
  schoolId: string | null;
  schoolName: string;
  departmentId: string | null;
};

type SessionValue = {
  user: User;
  contexts: AppContext[];
  active: AppContext | null;
  setActive: (key: string) => void;
  refresh: () => void;
  loading: boolean;
};

const Ctx = createContext<SessionValue | null>(null);
const STORAGE = "rikaz.activeContext";

async function loadContexts(): Promise<AppContext[]> {
  await supabase.rpc("accept_my_invitations");
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const [{ data: admin }, { data: mems, error }, { data: schools }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, org_id, school_id, department_id, organizations(name), schools(name)")
      .eq("user_id", uid)
      .eq("is_active", true),
    supabase.from("schools").select("id, name, org_id, organizations(name)").order("name"),
  ]);
  if (error) throw error;
  const out: AppContext[] = [];
  if (admin) {
    out.push({ key: "admin", role: "platform_admin", orgId: null, orgName: "المنصة", schoolId: null, schoolName: "كل المؤسسات", departmentId: null });
    for (const s of schools ?? [])
      out.push({ key: `admin:${s.id}`, role: "platform_admin", orgId: s.org_id, orgName: s.organizations?.name ?? "", schoolId: s.id, schoolName: s.name, departmentId: null });
  }
  for (const m of mems ?? []) {
    if (m.role === "org_owner") {
      const own = (schools ?? []).filter((s) => s.org_id === m.org_id);
      if (own.length === 0)
        out.push({ key: `${m.id}`, role: "org_owner", orgId: m.org_id, orgName: m.organizations?.name ?? "", schoolId: null, schoolName: "بلا مدارس", departmentId: null });
      for (const s of own)
        out.push({ key: `${m.id}:${s.id}`, role: "org_owner", orgId: m.org_id, orgName: m.organizations?.name ?? "", schoolId: s.id, schoolName: s.name, departmentId: null });
    } else {
      out.push({ key: m.id, role: m.role as Role, orgId: m.org_id, orgName: m.organizations?.name ?? "", schoolId: m.school_id, schoolName: m.schools?.name ?? "", departmentId: m.department_id });
    }
  }
  return out;
}

export function SessionProvider({ user, children }: { user: User; children: ReactNode }) {
  const qc = useQueryClient();
  // Re-check roles regularly: a removed role/department/school must stop showing data without a manual sign-out.
  const q = useQuery({ queryKey: ["contexts", user.id], queryFn: loadContexts, refetchInterval: 30_000, refetchOnWindowFocus: true });
  const sig = (q.data ?? []).map((c) => `${c.key}|${c.role}|${c.schoolId}|${c.departmentId}`).sort().join(";");
  const prevSig = useRef<string | null>(null);
  useEffect(() => {
    if (!q.data) return;
    if (prevSig.current !== null && prevSig.current !== sig) {
      // access changed: drop every cached page result and live subscription, then refetch under the new scope
      // reset (not remove) so mounted pages refetch under the new scope instead of holding orphaned data
      void qc.resetQueries({ predicate: (x) => x.queryKey[0] !== "contexts" });
      void supabase.removeAllChannels();
    }
    prevSig.current = sig;
  }, [sig, q.data, qc]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  useEffect(() => setActiveKey(localStorage.getItem(STORAGE)), []);
  const contexts = q.data ?? [];
  // the server decides identity visibility from the active capacity; keep it in sync on load
  const syncedKey = useRef<string | null>(null);
  useEffect(() => {
    const c = (q.data ?? []).find((x) => x.key === activeKey) ?? (q.data ?? []).find((x) => x.key === "admin") ?? (q.data ?? []).find((x) => x.schoolId) ?? (q.data ?? [])[0];
    if (!c || syncedKey.current === c.key) return;
    syncedKey.current = c.key;
    void (supabase as any).rpc("set_active_context", { _role: c.role, _school: c.schoolId }).then(() => {
      void qc.invalidateQueries({ predicate: (x) => ["msgs", "people", "cg-members", "msg-search"].includes(String(x.queryKey[0])) });
    });
  }, [q.data, activeKey, qc]);
  const active = useMemo(
    () => contexts.find((c) => c.key === activeKey) ?? contexts.find((c) => c.key === "admin") ?? contexts.find((c) => c.schoolId) ?? contexts[0] ?? null,
    [contexts, activeKey],
  );
  const value: SessionValue = {
    user,
    contexts,
    active,
    loading: q.isLoading,
    refresh: () => void q.refetch(),
    setActive: (k) => {
      localStorage.setItem(STORAGE, k);
      setActiveKey(k);
      // switching capacity (staff ↔ guardian) drops everything cached under the previous one
      const c = contexts.find((x) => x.key === k);
      if (c) void (supabase as any).rpc("set_active_context", { _role: c.role, _school: c.schoolId }).then(() => {
        void qc.resetQueries({ predicate: (x) => x.queryKey[0] !== "contexts" });
      });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside provider");
  return v;
}

/** Active school context; pages that need a school call this. */
export function useSchool() {
  const { active } = useSession();
  return active;
}

export function arabicError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.includes("violates foreign key")) return "لا يمكن الحذف: السجل مرتبط بسجلات أخرى. أوقفه أو انقل ارتباطاته أولًا.";
  if (msg.includes("duplicate key") || msg.includes("unique")) return "السجل موجود مسبقًا (تكرار غير مسموح).";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "ليست لديك صلاحية لهذا الإجراء.";
  if (msg.includes("Invalid login credentials")) return "بيانات الدخول غير صحيحة.";
  if (/rate limit|too many/i.test(msg)) return "محاولات كثيرة؛ انتظر قليلًا ثم حاول مجددًا.";
  if (msg.includes("Email not confirmed")) return "لم يتم تأكيد البريد الإلكتروني بعد.";
  return msg;
}
