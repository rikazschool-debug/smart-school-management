// Students / teachers: Excel import (ministry reports or the blank template) and single add — one set of rules (src/lib/people-import.ts).
// Academic rows are written row by row with the RLS client; logins are created/linked by provisionAccounts (fixed roles only).
import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { FileUp, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError } from "@/lib/session";
import { provisionAccounts } from "@/lib/accounts.functions";
import { FIELDS, csmartKey, norm, parseWorkbook, sectionSuggestion, templateBook, validate, type CheckedRow, type Lookups, type PKind, type RawRow } from "@/lib/people-import";
import { ACCOUNT_STATE } from "@/components/guardian-quick-add";

type Stage = { ok: boolean; msg: string } | null;
type Result = { key: string; line: string; name: string; academic: Stage; placement: Stage; guardian: Stage; account: Stage; guardianAccount: Stage; row: CheckedRow };
const TITLE: Record<PKind, string> = { students: "الطلاب", teachers: "المعلمين" };

type SecOpt = { id: string; label: string };
async function loadLookups(kind: PKind, schoolId: string): Promise<Lookups & { secList: SecOpt[] }> {
  if (kind === "students") {
    const [ex, secs, enr] = await Promise.all([
      db.from("students").select("id, national_id, csmart_no").eq("school_id", schoolId).limit(20000),
      db.from("sections").select("id, name, capacity, year_id, grades(name), academic_years!inner(is_current)").eq("school_id", schoolId).eq("academic_years.is_current", true),
      db.from("enrollments").select("section_id").eq("school_id", schoolId).eq("status", "active").limit(50000),
    ]);
    if (ex.error) throw ex.error; if (secs.error) throw secs.error;
    const used = new Map<string, number>(); for (const e of (enr.data ?? []) as Row[]) used.set(e["section_id"], (used.get(e["section_id"]) ?? 0) + 1);
    return {
      existingIds: new Map(((ex.data ?? []) as Row[]).filter((x) => x["national_id"]).map((x) => [String(x["national_id"]).replace(/\D/g, ""), x["id"]])),
      existingCsmart: new Map(((ex.data ?? []) as Row[]).filter((x) => x["csmart_no"]).map((x) => [csmartKey(String(x["csmart_no"])), x["id"]])),
      rowCsmart: new Map(((ex.data ?? []) as Row[]).filter((x) => x["csmart_no"]).map((x) => [x["id"], String(x["csmart_no"])])),
      existingPhones: new Map(), departments: new Map(),
      sections: new Map(((secs.data ?? []) as Row[]).map((x) => [`${norm(x["grades"]?.["name"])}|${norm(x["name"])}`, { id: x["id"], year_id: x["year_id"], capacity: x["capacity"], used: used.get(x["id"]) ?? 0 }])),
      secList: ((secs.data ?? []) as Row[]).map((x) => ({ id: x["id"], label: `${x["grades"]?.["name"] ?? ""} / ${x["name"]}` })).sort((a, b) => a.label.localeCompare(b.label, "ar")),
    };
  }
  const [ex, ids, deps] = await Promise.all([
    db.from("teachers").select("id, phone").eq("school_id", schoolId).limit(20000),
    db.rpc("teacher_id_status", { _school: schoolId }),
    db.from("departments").select("id, name").eq("school_id", schoolId),
  ]);
  if (ex.error) throw ex.error;
  const { normPhone } = await import("@/lib/people-import");
  // no people_identity.view → no ID lookups; IDs from the file are then skipped (server trigger refuses them anyway)
  const nidLocked = !!ids.error;
  const nidOf = new Map(((ids.data ?? []) as Row[]).map((x) => [x["teacher_id"], x["national_id"]]));
  const rows: Record<string, any>[] = ((ex.data ?? []) as Record<string, any>[]).map((x) => Object.assign({}, x, { national_id: nidOf.get(x["id"]) ?? null }));
  return {
    existingIds: new Map(rows.filter((x) => x["national_id"]).map((x) => [String(x["national_id"]), x["id"]])),
    existingPhones: new Map(rows.map((x) => [normPhone(x["phone"]) ?? "", x["id"]] as [string, string]).filter(([p]) => p)),
    departments: new Map(((deps.data ?? []) as Row[]).map((x) => [norm(x["name"]), x["id"]])), sections: new Map(),
    rowNid: new Map(rows.filter((x) => x["national_id"]).map((x) => [x["id"], String(x["national_id"])])), secList: [],
    nidLocked,
  };
}

const AR_VALUE: Record<string, string> = { male: "ذكر", female: "أنثى", father: "أب", mother: "أم", brother: "أخ", sister: "أخت", other: "أخرى" };
const shown = (key: string, v: unknown) => { const t = String(v ?? ""); return key === "gender" || key === "relationship" ? AR_VALUE[t] ?? t : t; };

// Display name follows the full name (first + last word) until the user types their own.
const autoDn = (n: string) => { const w = n.trim().split(/\s+/).filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : (w[0] ?? ""); };
function fillDn(cur: Record<string, string>, key: string, val: string): Record<string, string> {
  const next = { ...cur, [key]: val };
  if (key === "full_name") { const dn = cur["display_name"] ?? ""; if (!dn || dn === autoDn(cur["full_name"] ?? "")) next["display_name"] = autoDn(val); }
  return next;
}

export function PeopleImport({ kind, schoolId }: { kind: PKind; schoolId: string }) {
  const qc = useQueryClient();
  const provision = useServerFn(provisionAccounts);
  const fields = FIELDS[kind];
  const [open, setOpen] = useState<"import" | "single" | null>(null);
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [map, setMap] = useState<Record<string, number> | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheets, setSheets] = useState(0);
  const [rows, setRows] = useState<CheckedRow[] | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [single, setSingle] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [lookups, setLookups] = useState<(Lookups & { secList: SecOpt[] }) | null>(null);
  const [choice, setChoice] = useState<Map<string, string>>(new Map());
  const reset = () => { setBuf(null); setMap(null); setRows(null); setResults(null); setHeaders([]); setSheets(0); setLookups(null); setChoice(new Map()); setRaw([]); };

  async function check(list: RawRow[], ch = choice) {
    const lk = lookups ?? await loadLookups(kind, schoolId);
    setLookups(lk); setRaw(list);
    setRows(validate(kind, list, { ...lk, sectionChoice: ch }));
  }
  function choose(key: string, id: string) {
    const next = new Map(choice); if (id) next.set(key, id); else next.delete(key);
    setChoice(next); if (lookups) setRows(validate(kind, raw, { ...lookups, sectionChoice: next }));
  }
  async function onFile(f: File, override?: Record<string, number>) {
    setBusy(true);
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error("الملف أكبر من 5 ميجابايت");
      const b = await f.arrayBuffer(); setBuf(b);
      const p = parseWorkbook(b, kind, override);
      if (p.problems.length) throw new Error(p.problems.join("؛ "));
      if (!p.rows.length) throw new Error("لم يُعثر على صفوف بيانات تحت العناوين");
      if (p.rows.length > 2000) throw new Error("الحد الأقصى 2000 صف في الدفعة");
      setMap(p.mapping); setHeaders(p.headers); setSheets(p.sheets); setResults(null);
      await check(p.rows);
    } catch (e) { toast.error(arabicError(e)); reset(); } finally { setBusy(false); }
  }
  async function remap(key: string, col: string) {
    if (!buf || !map) return;
    const next = { ...map }; if (col === "") delete next[key]; else next[key] = Number(col);
    setBusy(true);
    try { const p = parseWorkbook(buf, kind, next); setMap(next); await check(p.rows); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }

  /** Each stage is idempotent: existing rows are reused (national ID / mobile), so a retry never duplicates. */
  async function write(list: CheckedRow[], prev?: Result[]) {
    setBusy(true);
    const out: Result[] = [];
    for (const r of list) {
      const key = `${r.sheet}:${r.line}`;
      const res: Result = { key, line: `${r.sheet} · ${r.line}`, name: String(r.data["full_name"] ?? ""), academic: null, placement: null, guardian: null, account: null, guardianAccount: null, row: r };
      out.push(res);
      if (r.errors.length) { res.academic = { ok: false, msg: r.errors.join("، ") }; continue; }
      const d = r.data;
      let id = r.existingId ?? null;
      if (!id) {
        const payload: Row = kind === "students"
          ? { school_id: schoolId, full_name: d["full_name"], display_name: d["display_name"] ?? null, national_id: d["national_id"], csmart_no: d["csmart_no"] ?? null, birth_date: d["birth_date"], gender: d["gender"], status: "active" }
          : { school_id: schoolId, full_name: d["full_name"], display_name: d["display_name"] ?? null, national_id: (lookups as { nidLocked?: boolean } | undefined)?.nidLocked ? null : d["national_id"], phone: d["phone"], email: d["email"], specialization: d["specialization"], department_id: r.department_id ?? null, status: "active" };
        const ins = await db.from(kind).insert(payload).select("id").single();
        if (ins.error) {
          // a previous attempt may have saved it: look it up instead of duplicating
          const q = kind === "students" ? db.from("students").select("id").eq("school_id", schoolId).eq("national_id", d["national_id"]) : db.from("teachers").select("id").eq("school_id", schoolId).eq("phone", d["phone"]);
          const again = await q.maybeSingle();
          if (!again.data) { res.academic = { ok: false, msg: arabicError(ins.error) }; continue; }
          id = again.data["id"];
        } else id = ins.data["id"];
        res.academic = { ok: true, msg: "أُضيف" };
      } else if (kind === "students" && d["csmart_no"]) {
        // fill a missing C‑Smart number only; a stored different number was already rejected as a conflict
        const up = await db.from("students").update({ csmart_no: d["csmart_no"] }).eq("id", id).is("csmart_no", null);
        res.academic = up.error ? { ok: false, msg: arabicError(up.error) } : { ok: true, msg: "موجود مسبقًا" };
        if (up.error) continue;
      } else if (kind === "teachers" && d["national_id"] && !lookups?.rowNid?.get(id) && !(lookups as { nidLocked?: boolean } | undefined)?.nidLocked) {
        // existing teacher without an ID: record it through the checked server path (refuses an ID owned by someone else)
        const up = await db.rpc("teacher_nid_save", { _teacher: id, _nid: d["national_id"] });
        res.academic = up.error ? { ok: false, msg: arabicError(up.error) } : { ok: true, msg: "موجود مسبقًا — أُضيفت الهوية" };
        if (up.error) continue;
      } else res.academic = { ok: true, msg: "موجود مسبقًا" };
      (r as CheckedRow & { savedId?: string }).savedId = id!;
      if (kind === "students") {
        if (r.section) {
          const cur = await db.from("enrollments").select("section_id").eq("student_id", id).eq("year_id", r.section.year_id).eq("status", "active").maybeSingle();
          if (cur.data?.["section_id"] === r.section.id) res.placement = { ok: true, msg: "مسكّن" };
          else if (cur.data) res.placement = { ok: false, msg: "مسكّن في شعبة أخرى — انقله من شاشة التسكين" };
          else {
            const en = await db.from("enrollments").insert({ student_id: id, section_id: r.section.id, year_id: r.section.year_id, school_id: schoolId });
            res.placement = en.error ? { ok: false, msg: arabicError(en.error) } : { ok: true, msg: "سُكّن" };
          }
        }
        if (d["guardian_name"] && (d["guardian_id"] || d["guardian_phone"])) {
          const g = await db.rpc("upsert_student_guardian", { _student: id, _name: d["guardian_name"], _phone: d["guardian_phone"] ?? "", _national_id: d["guardian_id"] ?? "", _relationship: d["relationship"] ?? "father" });
          if (g.error) res.guardian = { ok: false, msg: arabicError(g.error) };
          else { const gg = (g.data as Row[])[0] ?? {}; (res as Result & { gid?: string }).gid = gg["guardian_id"]; res.guardian = { ok: true, msg: gg["created"] ? "أُضيف ولي الأمر" : "رُبط بولي أمر موجود" }; }
        }
      }
    }
    // accounts in batches (server: permission re-check, fixed role, no password/role change for existing accounts)
    const accKind = kind === "students" ? "student" : "teacher";
    const ids = out.filter((x) => x.academic?.ok).map((x) => (x.row as CheckedRow & { savedId?: string }).savedId!).filter(Boolean);
    const gids = out.map((x) => (x as Result & { gid?: string }).gid).filter(Boolean) as string[];
    const apply = async (k: "student" | "teacher" | "guardian", list: string[], set: (x: Result, s: Stage) => void, pick: (x: Result) => string | undefined) => {
      for (let i = 0; i < list.length; i += 50) {
        const part = [...new Set(list.slice(i, i + 50))];
        try {
          const rs = await provision({ data: { kind: k, ids: part } });
          for (const x of out) { const pid = pick(x); const m = pid ? rs.find((y) => y.id === pid) : undefined; if (m) set(x, m.state === "error" ? { ok: false, msg: m.msg ?? "تعذّر" } : { ok: !["review", "missing_phone", "missing_id"].includes(m.state), msg: ACCOUNT_STATE[m.state] ?? m.state }); }
        } catch (e) { for (const x of out) if (part.includes(pick(x) ?? "")) set(x, { ok: false, msg: arabicError(e) }); }
      }
    };
    await apply(accKind, ids, (x, s) => { x.account = s; }, (x) => (x.row as CheckedRow & { savedId?: string }).savedId);
    if (gids.length) await apply("guardian", gids, (x, s) => { x.guardianAccount = s; }, (x) => (x as Result & { gid?: string }).gid);
    const merged = prev ? prev.map((p) => out.find((o) => o.key === p.key) ?? p) : out;
    setResults(merged); setBusy(false);
    qc.invalidateQueries();
    const failed = merged.filter(hasFailure).length;
    toast.success(`اكتمل: ${merged.length - failed} صف دون أخطاء، ${failed} يحتاج مراجعة`);
    return merged;
  }
  const hasFailure = (x: Result) => [x.academic, x.placement, x.guardian, x.account, x.guardianAccount].some((s) => s && !s.ok);

  async function retry() {
    if (!results) return;
    const fresh = await loadLookups(kind, schoolId);
    const again = validate(kind, results.filter(hasFailure).map((x) => x.row), { ...fresh, sectionChoice: choice });
    await write(again, results);
  }

  function downloadReport() {
    if (!results) return;
    const s = (x: Stage) => (x ? `${x.ok ? "✓" : "✗"} ${x.msg}` : "—");
    const head = kind === "students" ? ["الورقة · السطر", "الاسم", "الملف الأكاديمي", "التسكين", "ولي الأمر", "حساب الطالب", "حساب ولي الأمر"] : ["الورقة · السطر", "الاسم", "الملف الأكاديمي", "الحساب"];
    const body = results.map((x) => kind === "students" ? [x.line, x.name, s(x.academic), s(x.placement), s(x.guardian), s(x.account), s(x.guardianAccount)] : [x.line, x.name, s(x.academic), s(x.account)]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]); const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "النتائج"); XLSX.writeFile(wb, `نتائج-${TITLE[kind]}.xlsx`);
  }

  async function addSingle(e: React.FormEvent) {
    e.preventDefault();
    // a single added student is always linked to a guardian (same ID or mobile reuses the existing guardian)
    if (kind === "students" && (!(single["guardian_name"] ?? "").trim() || !(single["guardian_id"] ?? "").trim())) return void toast.error("أدخل اسم ولي الأمر ورقم هويته ليُربط بالطالب تلقائيًا");
    setBusy(true);
    try {
      const raw: RawRow = { sheet: "إضافة فردية", line: 1, values: Object.fromEntries(fields.map((f) => [f.key, single[f.key] ?? ""])), formulas: [] };
      const [r] = validate(kind, [raw], await loadLookups(kind, schoolId));
      if (r!.errors.length) { setBusy(false); return void toast.error(r!.errors.join("، ")); }
      await write([r!]);
    } catch (err) { toast.error(arabicError(err)); setBusy(false); }
  }

  const valid = rows?.filter((r) => !r.errors.length).length ?? 0;
  const unmatched = (() => {
    const m = new Map<string, { key: string; grade: string; section: string; count: number }>();
    for (const r of rows ?? []) {
      const u = r.unmatchedSection; if (!u) continue;
      const cur = m.get(u.key) ?? { ...u, count: 0 }; cur.count++; m.set(u.key, cur);
    }
    for (const k of choice.keys()) if (!m.has(k)) { const r = rows?.find((x) => `${norm(x.values["grade"])}|${norm(x.values["section"])}` === k); if (r) m.set(k, { key: k, grade: r.values["grade"] ?? "", section: r.values["section"] ?? "", count: rows!.filter((x) => `${norm(x.values["grade"])}|${norm(x.values["section"])}` === k).length }); }
    return [...m.values()];
  })();
  const cols = Math.max(0, ...headers.map((_, i) => i)) + 1;
  const colName = (c: number) => `${XLSX.utils.encode_col(c)}${headers[c] ? ` — ${headers[c]}` : ""}`;
  const stageCell = (x: Stage) => !x ? <span className="text-muted-foreground">—</span> : <span className={x.ok ? "text-primary" : "text-destructive"}>{x.msg}</span>;
  return (
    <>
      <Button size="sm" onClick={() => { reset(); setSingle({}); setOpen("single"); }}><UserPlus className="size-4" /> {kind === "students" ? "إضافة طالب" : "إضافة"}</Button>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen("import"); }}><FileUp className="size-4" /> استيراد Excel</Button>
      <Dialog open={!!open} onOpenChange={(o) => { if (!busy && !o) setOpen(null); }}>
        <DialogContent dir="rtl" className="max-h-[92dvh] max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>{open === "single" ? `إضافة ${kind === "students" ? "طالب" : "معلم"}` : `استيراد ${TITLE[kind]} من Excel`}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            {kind === "students"
              ? "يدخل الطالب برقم هويته أو إقامته ورقمه الداخلي في C‑Smart. يُنشأ لولي الأمر حساب واحد لكل أبنائه يدخل به بالهوية أو الإقامة ثم رمز تحقق على جواله المعتمد. الحسابات الموجودة تُربط دون تغيير كلمة مرورها أو صلاحياتها."
              : "يُنشأ للمعلم حساب بدور معلم فقط يدخل به بالهوية أو الإقامة ثم رمز تحقق على جواله المعتمد، ولا يصل لشيء قبل أول دخول. الحسابات الموجودة تُربط دون تغيير كلمة مرورها أو صلاحياتها."}
          </p>
          {open === "single" && !results && (
            <form onSubmit={addSingle} className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`ps-${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
                  <Input id={`ps-${f.key}`} dir={/phone|national_id|csmart_no|guardian_id|birth_date|email/.test(f.key) ? "ltr" : undefined} placeholder={f.hint} value={single[f.key] ?? ""} onChange={(e) => setSingle(fillDn(single, f.key, e.target.value))} />
                </div>
              ))}
              <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button></div>
            </form>
          )}
          {open === "import" && !results && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => XLSX.writeFile(templateBook(kind), `قالب-${TITLE[kind]}.xlsx`)}>تنزيل القالب الفارغ</Button>
                <label className="inline-flex cursor-pointer items-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">
                  اختيار ملف .xlsx
                  <input type="file" accept=".xlsx,.xls" className="sr-only" aria-label="ملف الاستيراد" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">يقبل القالب أو تقارير نور كما هي: العناوين والخلايا المدمجة وتعدد الأوراق (ورقة لكل فصل)، ويتجاهل العناوين والتذييل والأسطر الفارغة. خلايا الصيغ مرفوضة.</p>
              {busy && <p className="text-sm">جارٍ المعالجة…</p>}
              {map && rows && (
                <div className="space-y-3">
                  <details open className="rounded-lg border p-2">
                    <summary className="cursor-pointer text-sm font-medium">ربط الأعمدة ({sheets} ورقة) — عدّل إن لزم</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {fields.map((f) => (
                        <label key={f.key} className="space-y-1 text-xs">
                          <span>{f.label}{f.required ? " *" : ""}</span>
                          <select aria-label={`عمود ${f.label}`} className={selectCls("w-full", true)} value={map[f.key] ?? ""} onChange={(e) => remap(f.key, e.target.value)}>
                            <option value="">{kind === "students" && (f.key === "grade" || f.key === "section") ? "من رأس الورقة / غير موجود" : "غير موجود"}</option>
                            {Array.from({ length: cols }, (_, c) => <option key={c} value={c}>{colName(c)}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                  {unmatched.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-destructive/40 p-2">
                      <p className="text-sm font-medium">شعب في الملف لا تطابق أسماء الشعب في ركاز — اختر المقابل لكل منها صراحة (لا يُفترض أن «1» تعني «أ»):</p>
                      {unmatched.map((u) => (
                        <label key={u.key} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="min-w-40">«{u.grade} / {u.section}» ({u.count} صف){sectionSuggestion(u.section) ? ` — اقتراح: «${sectionSuggestion(u.section)}»` : ""}</span>
                          <select aria-label={`مقابل ${u.grade} / ${u.section}`} className={selectCls("w-64", true)} value={choice.get(u.key) ?? ""} onChange={(e) => choose(u.key, e.target.value)}>
                            <option value="">— اختر الشعبة —</option>
                            {(lookups?.secList ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                  {choice.size > 0 && <p className="text-xs text-muted-foreground">اخترت مقابل {choice.size} شعبة؛ يظهر ذلك في ملاحظة كل صف.</p>}
                  <p className="text-sm">المعاينة: <b>{rows.length}</b> صف — <span className="text-primary">{valid} صالح</span> · <span className="text-destructive">{rows.length - valid} به أخطاء</span></p>
                  <div className="max-h-80 overflow-auto rounded-lg border">
                    <table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-1.5 text-start">الورقة · السطر</th>{fields.map((c) => <th key={c.key} className="p-1.5 text-start">{c.label}</th>)}<th className="p-1.5 text-start">الحالة</th></tr></thead>
                      <tbody>{rows.map((r) => (
                        <tr key={`${r.sheet}:${r.line}`} className={`border-t ${r.errors.length ? "bg-destructive/5" : ""}`}>
                          <td className="whitespace-nowrap p-1.5">{r.sheet} · {r.line}</td>
                          {fields.map((c) => <td key={c.key} className="p-1.5" dir={/phone|national_id|csmart_no|guardian_id/.test(c.key) ? "ltr" : undefined}>{shown(c.key, r.data[c.key] ?? r.values[c.key])}</td>)}
                          <td className="p-1.5">{r.errors.length ? <span className="text-destructive">{r.errors.join("، ")}</span> : r.notes.length ? <span>{r.notes.join("، ")}</span> : "صالح"}</td>
                        </tr>))}</tbody></table>
                  </div>
                  <Button disabled={busy || !valid} onClick={() => write(rows)}>تأكيد استيراد {valid} صف صالح</Button>
                </div>
              )}
            </>
          )}
          {results && (
            <div className="space-y-2">
              <p className="text-sm">النتيجة: <span className="text-primary">{results.filter((x) => !hasFailure(x)).length} دون أخطاء</span> · <span className="text-destructive">{results.filter(hasFailure).length} يحتاج مراجعة</span></p>
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>
                  <th className="p-1.5 text-start">السطر</th><th className="p-1.5 text-start">الاسم</th><th className="p-1.5 text-start">الملف الأكاديمي</th>
                  {kind === "students" && <><th className="p-1.5 text-start">التسكين</th><th className="p-1.5 text-start">ولي الأمر</th></>}
                  <th className="p-1.5 text-start">الحساب</th>{kind === "students" && <th className="p-1.5 text-start">حساب ولي الأمر</th>}
                </tr></thead>
                  <tbody>{results.map((x) => (
                    <tr key={x.key} className="border-t"><td className="whitespace-nowrap p-1.5">{x.line}</td><td className="p-1.5">{x.name}</td><td className="p-1.5">{stageCell(x.academic)}</td>
                      {kind === "students" && <><td className="p-1.5">{stageCell(x.placement)}</td><td className="p-1.5">{stageCell(x.guardian)}</td></>}
                      <td className="p-1.5">{stageCell(x.account)}</td>{kind === "students" && <td className="p-1.5">{stageCell(x.guardianAccount)}</td>}
                    </tr>))}</tbody></table>
              </div>
              <div className="flex flex-wrap gap-2">
                {results.some(hasFailure) && <Button size="sm" disabled={busy} onClick={retry}>إعادة محاولة الصفوف الفاشلة ({results.filter(hasFailure).length})</Button>}
                <Button variant="outline" size="sm" onClick={downloadReport}>تنزيل تقرير النتائج</Button>
                <Button size="sm" variant="ghost" onClick={() => { reset(); setSingle({}); }}>{open === "single" ? "إضافة أخرى" : "دفعة جديدة"}</Button>
              </div>
              <p className="text-xs text-muted-foreground">لا يتضمن التقرير كلمات مرور. كلمة المرور الأولية للطالب تُصدر من صفحته عبر «إصدار كلمة مرور أولية».</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
