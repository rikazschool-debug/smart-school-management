import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { rpc, useHrCats, type HrEmp, type HrMe } from "@/components/hr/shared";
import { CAL_LABEL, HR_FIELDS, TEMPLATE_HEAD, cleanValue, fieldForHeader, norm, type Cal, type HrField } from "@/lib/hr-fields";

// HR employee import (shared field rules in src/lib/hr-fields.ts):
// workbook → sheet + header row → editable column map → per-row preview → row-by-row save through
// hr_employee_save + hr_employee_profile_save (same server checks as the form; never creates logins or roles).
type State = "new" | "dup" | "fill" | "same" | "conflict" | "bad" | "ok" | "filled" | "fail";
type Row = { i: number; p: Record<string, string>; cal: Record<string, Cal | null>; errs: string[]; state: State; match?: string | undefined; gaps: string[]; msg?: string | undefined; schoolName: string };
type Prof = Record<string, string | null> & { manager_no?: string | null; department?: string | null };

export function HrImport({ org, m, existing, onClose, onDone }: { org: string; m: HrMe; existing: HrEmp[]; onClose: () => void; onDone: () => void }) {
  const [wb, setWb] = useState<{ name: string; book: XLSX.WorkBook } | null>(null);
  const [sheet, setSheet] = useState(""), [hdr, setHdr] = useState(1);
  const [map, setMap] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"new" | "fill">("new");
  const [pick, setPick] = useState<Record<number, string>>({});
  const [profs, setProfs] = useState<Record<string, Prof>>({});
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Row[] | null>(null);
  const schools = m.schools.filter((s) => s.create || m.caps.create);
  const sens = m.caps.sensitive;
  const fields = HR_FIELDS.filter((f) => !f.sensitive || sens);
  const cats = (useHrCats(org).data ?? []).filter((c) => c.is_active);

  const template = () => {
    const head = TEMPLATE_HEAD.filter((h) => h === "#" || fields.some((f) => f.label === h));
    const ws = XLSX.utils.aoa_to_sheet([head, head.map((h, k) => (k === 0 ? 1 : h === "الفرع" ? schools[0]?.name ?? "" : h === "الجنس" ? "ذكر" : ""))]);
    ws["!cols"] = head.map(() => ({ wch: 20 })); const b = XLSX.utils.book_new(); b.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(b, ws, "البيانات الأساسية"); XLSX.writeFile(b, "قالب-بيانات-الموظفين.xlsx");
  };

  const grid = useMemo(() => {
    const sh = wb?.book.Sheets[sheet]; if (!sh) return null;
    const rawA = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, raw: true, defval: "" });
    const txtA = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, raw: false, defval: "" });
    return { rawA, txtA };
  }, [wb, sheet]);
  const autoMap = (head: string[]) => { const mp: Record<string, number> = {}; head.forEach((h, k) => { const f = fieldForHeader(h); if (f && mp[f] == null && fields.some((x) => x.key === f)) mp[f] = k; }); return mp; };
  const pickSheet = (book: XLSX.WorkBook, name: string) => {
    setSheet(name); setPick({}); setRes(null);
    const sh = book.Sheets[name]; const a = sh ? XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, raw: false, defval: "" }) : [];
    let best = 0, bestN = -1;
    for (let r = 0; r < Math.min(15, a.length); r++) { const c = (a[r] ?? []).filter((h) => fieldForHeader(h)).length; if (c > bestN) { bestN = c; best = r; } }
    setHdr(best + 1); setMap(autoMap((a[best] ?? []).map((h) => String(h).trim())));
  };
  const load = async (file: File): Promise<unknown> => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast.error("نوع الملف غير مدعوم؛ استخدم xlsx أو xls أو csv");
    if (file.size > MAX_BYTES) return toast.error("حجم الملف أكبر من 5 ميغابايت");
    let book: XLSX.WorkBook; try { book = XLSX.read(await file.arrayBuffer()); } catch { return toast.error("تعذّر قراءة الملف؛ قد يكون تالفًا"); }
    if (!book.SheetNames.length) return toast.error("الملف فارغ");
    setWb({ name: file.name, book });
    pickSheet(book, book.SheetNames.find((s) => !/عقود|عقد|contract/i.test(s)) ?? book.SheetNames[0]!);
    return null;
  };
  const head = useMemo(() => (grid?.txtA[hdr - 1] ?? []).map((h) => String(h).trim()), [grid, hdr]);
  const data = useMemo(() => {
    if (!grid) return [];
    const out: { i: number; cells: unknown[] }[] = [];
    for (let r = hdr; r < grid.rawA.length; r++) {
      const raw = grid.rawA[r]!, txt = grid.txtA[r] ?? [];
      if (!raw.some((c) => String(c).trim() !== "")) continue;
      // text keeps the displayed value (leading zeros); date columns keep the Excel serial
      out.push({ i: r + 1, cells: raw.map((c, k) => (typeof c === "number" ? (k in dateCols(map) ? c : txt[k] ?? c) : c)) });
    }
    return out;
  }, [grid, hdr, map]);

  const byNo = useMemo(() => new Map(existing.filter((e) => e.employee_no).map((e) => [norm(e.employee_no), e])), [existing]);
  const byId = useMemo(() => new Map(existing.filter((e) => e.sensitive && e.national_id).map((e) => [e.national_id!, e])), [existing]);

  const base = useMemo<Row[]>(() => {
    const fileNos = new Map<string, string>();
    for (const d of data) { const k = map["employee_no"]; if (k != null) { const v = norm(d.cells[k]); if (v) fileNos.set(v, String(d.cells[map["full_name"] ?? -1] ?? "")); } }
    const seenNo = new Set<string>(), seenId = new Set<string>();
    return data.map(({ i, cells }) => {
      const p: Record<string, string> = {}, cal: Record<string, Cal | null> = {}, errs: string[] = [];
      for (const f of fields) {
        if (map[f.key] == null || ["school", "category"].includes(f.key)) continue;
        const c = cleanValue(f, cells[map[f.key]!]); p[f.key] = c.v; if (c.err) errs.push(c.err); if (f.kind === "docdate") cal[f.key] = c.cal ?? null;
      }
      if (!p["full_name"]) errs.push("الاسم مطلوب");
      const sName = String(cells[map["school"] ?? -1] ?? "").trim();
      const sch = pick[i] ?? schools.find((s) => norm(s.name) === norm(sName))?.id;
      if (sch) p["school_id"] = sch; else errs.push(sName ? `الفرع «${sName}» غير مطابق — اختر المدرسة` : "الفرع مطلوب — اختر المدرسة");
      const cn = norm(cells[map["category"] ?? -1]); if (cn) { const c = cats.find((x) => norm(x.name) === cn); if (!c) errs.push("تصنيف وظيفي غير معروف أو معطل"); else p["category_id"] = c.id; }
      if ((p["display_name"] ?? "").length > 80) errs.push("الاسم المعروض طويل (حتى 80 حرفًا)");
      const no = norm(p["employee_no"]), nid = p["national_id"] ?? "";
      if (no) { if (seenNo.has(no)) errs.push("الرقم الوظيفي مكرر في الملف"); seenNo.add(no); }
      if (nid) { if (seenId.has(nid)) errs.push("رقم الهوية مكرر في الملف"); seenId.add(nid); }
      const a = no ? byNo.get(no) : undefined, b = nid ? byId.get(nid) : undefined;
      // manager by employee number (existing file or same batch); name only for review
      const mno = norm(p["manager_no"]);
      if (mno) {
        if (mno === no) errs.push("المسؤول المباشر لا يكون الموظف نفسه");
        const ex = byNo.get(mno); const inFile = fileNos.get(mno);
        if (!ex && inFile == null) errs.push("رقم المسؤول المباشر غير موجود في المؤسسة أو الملف");
        else if (p["manager_name"]) {
          const names = ex ? [ex.full_name, ex.display_name ?? ""] : [inFile ?? ""];
          if (!names.some((x) => x && (norm(x).includes(norm(p["manager_name"])) || norm(p["manager_name"]).includes(norm(x))))) errs.push("اسم المسؤول المباشر لا يطابق رقمه");
        }
      }
      const rowBase = { i, p, cal, errs, gaps: [] as string[], schoolName: sName };
      if (a && b && a.id !== b.id) return { ...rowBase, state: "conflict" as const, msg: "الرقم الوظيفي والهوية يخصان موظفين مختلفين" };
      const match = a ?? b;
      if (a && !b && nid && a.sensitive && a.national_id && a.national_id !== nid) return { ...rowBase, state: "conflict" as const, msg: "الرقم الوظيفي لموظف هويته مختلفة" };
      if (match) return { ...rowBase, match: match.id, state: "dup" as const, msg: a ? "الرقم الوظيفي موجود مسبقًا" : "رقم الهوية مسجل لموظف في المؤسسة", errs: errs.filter((e) => !e.startsWith("الفرع")) };
      p["import_key"] = importKey(p);
      return { ...rowBase, state: errs.length ? "bad" as const : "new" as const };
    });
  }, [data, map, pick, cats, byNo, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  // completion mode: read current extra data for matched employees, then preview only empty → filled values
  useEffect(() => {
    if (mode !== "fill") return;
    const ids = [...new Set(base.filter((r) => r.match && !profs[r.match]).map((r) => r.match!))];
    if (!ids.length) return;
    let off = false;
    (async () => { const got: Record<string, Prof> = {}; for (const id of ids) { try { got[id] = await rpc<Prof>("hr_employee_profile_get", { _emp: id }); } catch { got[id] = {}; } } if (!off) setProfs((x) => ({ ...x, ...got })); })();
    return () => { off = true; };
  }, [mode, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<Row[]>(() => base.map((r) => {
    if (r.state !== "dup" || mode !== "fill") return r;
    if (r.errs.length) return { ...r, state: "bad" };
    const e = existing.find((x) => x.id === r.match)!, pr = profs[r.match!]; if (!pr) return { ...r, msg: "جارٍ قراءة البيانات الحالية…" };
    const cur = (f: HrField) => f.where === "base" ? (e as Record<string, unknown>)[f.key] : f.key === "manager_no" ? pr.manager_no : f.key === "department" ? pr.department : pr[f.key];
    const gaps = fields.filter((f) => !["school", "category", "manager_name", "full_name", "employee_no", "display_name"].includes(f.key) && r.p[f.key] && (cur(f) == null || cur(f) === "")).map((f) => f.key);
    return gaps.length ? { ...r, state: "fill", gaps, msg: undefined } : { ...r, state: "same", msg: "لا توجد بيانات ناقصة يمكن استكمالها" };
  }), [base, mode, profs, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = HR_FIELDS.filter((f) => f.required && map[f.key] == null && !(f.key === "school" && Object.keys(pick).length));
  const ready = rows.filter((r) => r.state === "new" || r.state === "fill");
  const lock = useRef(false);
  const profPayload = (r: Row, only?: string[]) => {
    const o: Record<string, string> = {};
    for (const f of fields) if ((f.where === "prof" || f.key === "department" || (only && f.where === "base")) && r.p[f.key] && (!only || only.includes(f.key))) { o[f.key] = r.p[f.key]!; if (f.kind === "docdate" && r.cal[f.key]) o[`${f.key}_cal`] = r.cal[f.key]!; }
    return o;
  };
  const call = async <T,>(fn: string, args: Record<string, unknown>) => {
    let e: unknown = null;
    for (let t = 0; t < 3; t++) { try { return await rpc<T>(fn, args); } catch (x) { e = x; if (!/fetch|network|Failed/i.test(String((x as Error)?.message ?? x))) break; await new Promise((s) => setTimeout(s, 800 * (t + 1))); } }
    throw e;
  };
  const run = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    const out = new Map<number, Row>(rows.map((r) => [r.i, r]));
    const why = `استيراد Excel: ${wb!.name}`;
    const ids = new Map<number, string>();
    for (const r of rows) {
      if (r.state === "new") {
        const p: Record<string, string> = { import_key: r.p["import_key"]! };
        for (const f of fields) if ((f.where === "base" || f.key === "department") && r.p[f.key]) p[f.key] = r.p[f.key]!;
        p["school_id"] = r.p["school_id"]!; if (r.p["category_id"]) p["category_id"] = r.p["category_id"];
        let id: string | null = null, dup = false;
        try { id = await call<string>("hr_employee_save", { _org: org, _id: null, _p: p, _reason: `${why} — صف ${r.i}` }); }
        catch (x) { const em = String((x as Error)?.message ?? x); const k = em.match(/IMPORTED:([0-9a-f-]{36})/); if (k) { id = k[1]!; dup = true; } else { out.set(r.i, { ...r, state: "fail", msg: arabicError(x) }); continue; } }
        ids.set(r.i, id!);
        try { await call("hr_employee_profile_save", { _org: org, _emp: id, _p: profPayload(r), _mode: "fill", _reason: why }); out.set(r.i, { ...r, state: dup ? "dup" : "ok", msg: dup ? "أُضيف سابقًا من الملف نفسه — لم يُكرر" : undefined }); }
        catch (x) { out.set(r.i, { ...r, state: "fail", msg: `أُنشئ الملف لكن تعذّر حفظ البيانات الإضافية: ${arabicError(x)}` }); }
      } else if (r.state === "fill") {
        try { await call("hr_employee_profile_save", { _org: org, _emp: r.match, _p: { ...profPayload(r, r.gaps), ...(r.gaps.includes("manager_no") ? { manager_no: r.p["manager_no"] } : {}) }, _mode: "fill", _reason: `${why} — استكمال صف ${r.i}` }); out.set(r.i, { ...r, state: "filled" }); }
        catch (x) { out.set(r.i, { ...r, state: "fail", msg: arabicError(x) }); }
      }
    }
    // second pass: direct managers (may be employees added in this same batch)
    for (const r of rows) {
      const id = ids.get(r.i); if (!id || !r.p["manager_no"] || out.get(r.i)?.state === "fail") continue;
      try { await call("hr_employee_profile_save", { _org: org, _emp: id, _p: { manager_no: r.p["manager_no"] }, _mode: "fill", _reason: why }); }
      catch (x) { out.set(r.i, { ...out.get(r.i)!, msg: `حُفظ الموظف؛ لم يُربط المسؤول المباشر: ${arabicError(x)}` }); }
    }
    const list = [...out.values()];
    setRes(list); setBusy(false); lock.current = false; onDone();
    const c = (s: State) => list.filter((x) => x.state === s).length;
    toast.success(`أُضيف ${c("ok")} · استُكمل ${c("filled")} · تُخطي ${c("dup") + c("same")} · رُفض ${c("bad") + c("conflict") + c("fail")}`);
  };
  const report = () => {
    const ws = XLSX.utils.aoa_to_sheet([["الصف", "الاسم", "الرقم الوظيفي", "المدرسة", "النتيجة", "التفاصيل"], ...res!.map((r) => [r.i, safe(r.p["full_name"] ?? ""), safe(r.p["employee_no"] ?? ""), safe(schools.find((s) => s.id === r.p["school_id"])?.name ?? r.schoolName), LBL[r.state], safe([...r.errs, r.msg].filter(Boolean).join("، "))])]);
    const b = XLSX.utils.book_new(); b.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(b, ws, "النتائج"); XLSX.writeFile(b, "تقرير-استيراد-الموظفين.xlsx");
  };
  const shown = res ?? rows;
  const unmapped = head.map((h, k) => ({ h, k })).filter(({ h, k }) => h && h !== "#" && !Object.values(map).includes(k));
  const fLabel = (k: string) => HR_FIELDS.find((f) => f.key === k)?.label ?? k;
  const showVal = (r: Row, k: string) => { const f = HR_FIELDS.find((x) => x.key === k)!; const v = r.p[k] ?? ""; return f.kind === "docdate" && r.cal[k] ? `${v} (${CAL_LABEL[r.cal[k]!]})` : f.kind === "gender" ? (v === "male" ? "ذكر" : "أنثى") : v; };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2"><h3 className="flex-1 font-bold">استيراد موظفين من Excel</h3><Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <p className="text-sm text-muted-foreground">يُنشأ ملف موظف فقط — دون حساب دخول أو دور أو صلاحية؛ المسمى الوظيفي وصف للوظيفة فقط. لا يُحفظ أي صف قبل المعاينة، وإعادة رفع الملف لا تكرر السجلات. المطابقة بالرقم الوظيفي أو الهوية فقط، لا بالاسم.{!sens && " أعمدة الهوية والجواز والآيبان والوسيط والكفيل والجنسية والميلاد مخفية وتُتجاهل لأنها تحتاج صلاحية البيانات الحساسة."}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={template}><Download className="size-4" />تنزيل القالب</Button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm"><Upload className="size-4" />اختيار ملف
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="ملف الاستيراد" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        {wb && <span className="self-center text-sm">{wb.name} — {data.length} صف</span>}
      </div>
      {wb && !res && (
        <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label>ورقة العمل<select aria-label="ورقة العمل" className={selectCls("mt-1 block")} value={sheet} onChange={(e) => pickSheet(wb.book, e.target.value)}>{wb.book.SheetNames.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label>صف العناوين<input aria-label="صف العناوين" type="number" min={1} max={30} className="mt-1 block w-20 rounded-md border bg-background px-2 py-1" value={hdr} onChange={(e) => { const v = Math.max(1, +e.target.value || 1); setHdr(v); setMap(autoMap((grid?.txtA[v - 1] ?? []).map((h) => String(h).trim()))); }} /></label>
            <div role="radiogroup" aria-label="وضع الاستيراد" className="flex gap-2">
              {([["new", "إضافة الموظفين الجدد"], ["fill", "استكمال البيانات الناقصة للموظفين الموجودين"]] as const).map(([k, t]) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={"rounded-md border px-3 py-1.5 " + (mode === k ? "border-primary bg-primary/10" : "")}>{t}</button>))}
            </div>
          </div>
          {mode === "fill" && <p className="rounded bg-secondary p-2 text-xs">يُستكمل فقط ما هو فارغ حاليًا لموظف مطابق بالرقم الوظيفي أو الهوية دون تعارض. لا تُستبدل قيمة قائمة ولا تُمسح بخانة فارغة، ولا يُضاف موظف جديد في هذا الوضع.</p>}
          <details className="rounded border p-2" open={Object.keys(map).length < 3}>
            <summary className="cursor-pointer text-sm font-semibold">ربط الأعمدة ({Object.keys(map).length} مربوط{unmapped.length ? ` · ${unmapped.length} عمود غير مربوط` : ""})</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="text-xs">{f.label}{f.required && " *"}
                  <select aria-label={`عمود ${f.label}`} className={selectCls("mt-1 w-full")} value={map[f.key] ?? ""} onChange={(e) => setMap((x) => { const y = { ...x }; if (e.target.value === "") delete y[f.key]; else y[f.key] = +e.target.value; return y; })}>
                    <option value="">— غير موجود —</option>{head.map((h, k) => <option key={k} value={k}>{h || `عمود ${k + 1}`}</option>)}
                  </select></label>
              ))}
            </div>
            {unmapped.length > 0 && <p className="mt-2 text-xs text-muted-foreground">أعمدة لن يُحفظ محتواها: {unmapped.map((u) => u.h).join("، ")}</p>}
          </details>
        </>
      )}
      {wb && missing.length > 0 && <p className="text-sm text-destructive">حدد عمود: {missing.map((f) => f.label).join("، ")}</p>}
      {wb && missing.filter((f) => f.key !== "school").length === 0 && (
        <>
          <div className="flex flex-wrap gap-3 text-sm" aria-label="ملخص المعاينة">
            {(Object.keys(LBL) as State[]).map((s) => { const c = shown.filter((r) => r.state === s).length; return c ? <span key={s} className={`rounded px-2 py-0.5 ${CLS[s]}`}>{LBL[s]}: {c}</span> : null; })}
          </div>
          <div className="max-h-[28rem] overflow-auto rounded border">
            <table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-start">الصف</th><th className="p-2 text-start">الاسم</th><th className="p-2 text-start">الرقم الوظيفي</th><th className="p-2 text-start">المدرسة</th><th className="p-2 text-start">المسؤول المباشر</th><th className="p-2 text-start">الحالة</th></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.i} className="border-t align-top"><td className="p-2">{r.i}</td><td className="p-2">{r.p["full_name"] || "—"}</td><td className="p-2"><bdi dir="ltr">{r.p["employee_no"] || "تلقائي"}</bdi></td>
                  <td className="p-2">{!res && !schools.some((s) => norm(s.name) === norm(r.schoolName)) && r.state !== "dup" && r.state !== "fill" && r.state !== "same" ? (
                    <select aria-label={`مدرسة الصف ${r.i}`} className={selectCls("w-40")} value={pick[r.i] ?? ""} onChange={(e) => setPick((x) => ({ ...x, [r.i]: e.target.value }))}><option value="">{r.schoolName ? `«${r.schoolName}» ← اختر` : "اختر المدرسة"}</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  ) : schools.find((s) => s.id === r.p["school_id"])?.name ?? r.schoolName ?? "—"}</td>
                  <td className="p-2 text-xs">{r.p["manager_no"] ? <><bdi dir="ltr">{r.p["manager_no"]}</bdi>{r.p["manager_name"] && ` — ${r.p["manager_name"]}`}</> : "—"}</td>
                  <td className="p-2"><span className={`rounded px-1.5 ${CLS[r.state]}`}>{LBL[r.state]}</span> <span className="text-xs text-muted-foreground">{[...r.errs, r.msg].filter(Boolean).join("، ")}</span>
                    {r.state === "fill" && <ul className="mt-1 text-xs">{r.gaps.map((k) => <li key={k}>{fLabel(k)}: <bdi>{showVal(r, k)}</bdi></li>)}</ul>}
                    {r.state === "new" && !res && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">القيم</summary><ul>{fields.filter((f) => r.p[f.key]).map((f) => <li key={f.key}>{f.label}: <bdi>{showVal(r, f.key)}</bdi></li>)}</ul></details>}
                  </td></tr>
              ))}</tbody></table>
          </div>
          {!res ? <Button disabled={busy || ready.length === 0} onClick={run}>{busy ? "جارٍ الحفظ…" : mode === "new" ? `إضافة ${ready.length} موظفًا` : `استكمال ${ready.length} ملفًا`}</Button>
            : <Button variant="outline" onClick={report}><Download className="size-4" />تقرير النتائج</Button>}
        </>
      )}
    </div>
  );
}
const dateCols = (map: Record<string, number>) => Object.fromEntries(HR_FIELDS.filter((f) => f.kind === "date" || f.kind === "docdate").map((f) => map[f.key]).filter((k) => k != null).map((k) => [k, 1]));
const MAX_BYTES = 5 * 1024 * 1024;
// neutralise spreadsheet formulas in exported text
export const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? "'" + v : v);
// stable per-row key: re-importing the same row (or retrying after a lost response) never creates a second employee
export function importKey(p: Record<string, string>) {
  const s = ["full_name", "school_id", "employee_no", "national_id", "phone", "email"].map((k) => norm(p[k])).join("|");
  let h1 = 0x811c9dc5, h2 = 5381; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 33) + c) | 0; }
  return "x" + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
const LBL: Record<State, string> = { new: "جاهز للإضافة", fill: "سيُستكمل", dup: "موجود مسبقًا", same: "مكتمل — يُتخطى", conflict: "تعارض", bad: "يحتاج تصحيحًا", ok: "أُضيف", filled: "استُكمل", fail: "رفضه الخادم" };
const CLS: Record<State, string> = { new: "bg-secondary", fill: "bg-primary/10 text-primary", dup: "bg-muted", same: "bg-muted", conflict: "bg-destructive/10 text-destructive", bad: "bg-destructive/10 text-destructive", ok: "bg-primary/10 text-primary", filled: "bg-primary/10 text-primary", fail: "bg-destructive/10 text-destructive" };
