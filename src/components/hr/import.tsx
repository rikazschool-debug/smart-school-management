import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createHrEmployeeLogin } from "@/lib/accounts.functions";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { CENTRAL, roleLabel, rpc, useHrCats, type HrEmp, type HrMe } from "@/components/hr/shared";
import { useHrOwners } from "@/components/hr/profile-fields";
import { ManagerPick, type MgrOpt } from "@/components/hr/manager-pick";
import { CAL_LABEL, HR_FIELDS, TEMPLATE_HEAD, cleanValue, fieldForHeader, norm, type Cal, type HrField } from "@/lib/hr-fields";

// HR employee import (shared field rules in src/lib/hr-fields.ts):
// workbook → sheet + header row → editable column map → per-row preview → row-by-row save through
// hr_employee_save + hr_employee_profile_save. With «إنشاء حسابات الدخول» each ready row also gets its login in the same
// server operation (createHrEmployeeLogin) or is linked to an existing staff account after confirmation (hr_employee_link_login);
// the per-row plan (create/link/review) comes from hr_login_plan, the role from the owner-approved title→role table.
type State = "review" | "new" | "dup" | "fill" | "same" | "conflict" | "bad" | "ok" | "filled" | "fail";
type Row = { mgr?: string | undefined; mgrAuto?: string | undefined; mgrErr?: string | undefined; mgrFail?: boolean; i: number; p: Record<string, string>; cal: Record<string, Cal | null>; errs: string[]; state: State; match?: string | undefined; gaps: string[]; msg?: string | undefined; schoolName: string; login?: Login | undefined };
type Plan = { action: "create" | "link" | "link_guardian" | "review"; children?: number; why?: string; user_id?: string; name?: string; roles?: string[]; schools?: string[] | null };
type Login = { role: string; act: "wait" | "create" | "link" | "link_guardian" | "review"; why?: string | undefined; pl?: Plan | undefined };
const tnorm = (t: unknown) => String(t ?? "").trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ");
const pkey = (p: Record<string, string>) => `${p["national_id"] ?? ""}|${p["phone"] ?? ""}`;
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
  const qc = useQueryClient();
  const createLogin = useServerFn(createHrEmployeeLogin);
  const [withLogin, setWithLogin] = useState(sens);
  const [rolePick, setRolePick] = useState<Record<number, string>>({});
  const [linkOk, setLinkOk] = useState<Record<number, boolean>>({});
  const [plan, setPlan] = useState<Record<string, Plan>>({});
  const [allowed, setAllowed] = useState<Record<string, string[]>>({});
  // per-row direct manager choice: "hr" default · "e:<employee>" · "o:<owner account>" · "b:<row in this batch>"
  const [mgrPick, setMgrPick] = useState<Record<number, string>>({});
  const owners = useHrOwners(org).data ?? [];
  const titles = useQuery({ enabled: withLogin, queryKey: ["hr-title-roles", org], queryFn: () => rpc<{ title: string; norm: string; base: string }[]>("hr_title_role_list", { _org: org }) });
  const tmap = useMemo(() => new Map((titles.data ?? []).map((t) => [t.norm, t.base])), [titles.data]);

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
    const fileNos = new Map<string, string>(), fileRow = new Map<string, number>();
    for (const d of data) { const k = map["employee_no"]; if (k != null) { const v = norm(d.cells[k]); if (v) { fileNos.set(v, String(d.cells[map["full_name"] ?? -1] ?? "")); if (!fileRow.has(v)) fileRow.set(v, d.i); } } }
    const seenNo = new Set<string>(), seenId = new Set<string>();
    return data.map(({ i, cells }) => {
      const p: Record<string, string> = {}, cal: Record<string, Cal | null> = {}, errs: string[] = [];
      for (const f of fields) {
        if (map[f.key] == null || ["school", "category"].includes(f.key)) continue;
        const c = cleanValue(f, cells[map[f.key]!]); p[f.key] = c.v; if (c.err) errs.push(c.err); if (f.kind === "docdate") cal[f.key] = c.cal ?? null;
      }
      if (!p["full_name"]) errs.push("الاسم مطلوب");
      const sName = String(cells[map["school"] ?? -1] ?? "").trim();
      // central administration (no school): owner only, same rule as the manual add form
      const sch = pick[i] ?? (m.owner && /^(ال)?ادار[هة] (ال)?مركزي[هة]/.test(norm(sName)) ? CENTRAL : schools.find((s) => norm(s.name) === norm(sName))?.id);
      if (sch) p["school_id"] = sch; else errs.push(sName ? `الفرع «${sName}» غير مطابق — اختر المدرسة` : "الفرع مطلوب — اختر المدرسة");
      const cn = norm(cells[map["category"] ?? -1]); if (cn) { const c = cats.find((x) => norm(x.name) === cn); if (!c) errs.push("تصنيف وظيفي غير معروف أو معطل"); else p["category_id"] = c.id; }
      if ((p["display_name"] ?? "").length > 80) errs.push("الاسم المعروض طويل (حتى 80 حرفًا)");
      const no = norm(p["employee_no"]), nid = p["national_id"] ?? "";
      if (no) { if (seenNo.has(no)) errs.push("الرقم الوظيفي مكرر في الملف"); seenNo.add(no); }
      if (nid) { if (seenId.has(nid)) errs.push("رقم الهوية مكرر في الملف"); seenId.add(nid); }
      const a = no ? byNo.get(no) : undefined, b = nid ? byId.get(nid) : undefined;
      // manager by employee number (existing file or same batch); name only for review
      // the number from Excel only gives the initial choice; the row's manager can be changed in the preview
      const mno = norm(p["manager_no"]);
      let mgrAuto: string | undefined, mgrErr: string | undefined;
      if (mno) {
        const ex = byNo.get(mno); const inFile = fileNos.get(mno);
        if (mno === no) mgrErr = "المسؤول المباشر لا يكون الموظف نفسه";
        else if (ex) { const ow = owners.find((o) => o.employee_id === ex.id); mgrAuto = ow ? `o:${ow.user_id}` : `e:${ex.id}`; }
        else if (inFile != null) mgrAuto = `b:${fileRow.get(mno)}`;
        else mgrErr = "رقم المسؤول المباشر غير موجود في المؤسسة أو الملف — اختر المسؤول";
        if (mgrAuto && p["manager_name"]) {
          const names = ex ? [ex.full_name, ex.display_name ?? ""] : [inFile ?? ""];
          if (!names.some((x) => x && (norm(x).includes(norm(p["manager_name"])) || norm(p["manager_name"]).includes(norm(x))))) mgrErr = "اسم المسؤول المباشر لا يطابق رقمه — تأكد من الاختيار";
        }
      }
      const rowBase = { i, p, cal, errs, gaps: [] as string[], schoolName: sName, mgrAuto, mgrErr };
      if (a && b && a.id !== b.id) return { ...rowBase, state: "conflict" as const, msg: "الرقم الوظيفي والهوية يخصان موظفين مختلفين" };
      const match = a ?? b;
      if (a && !b && nid && a.sensitive && a.national_id && a.national_id !== nid) return { ...rowBase, state: "conflict" as const, msg: "الرقم الوظيفي لموظف هويته مختلفة" };
      if (match) return { ...rowBase, match: match.id, state: "dup" as const, msg: a ? "الرقم الوظيفي موجود مسبقًا" : "رقم الهوية مسجل لموظف في المؤسسة", errs: errs.filter((e) => !e.startsWith("الفرع")) };
      p["import_key"] = importKey(p);
      return { ...rowBase, state: errs.length ? "bad" as const : "new" as const };
    });
  }, [data, map, pick, cats, byNo, byId, owners]); // eslint-disable-line react-hooks/exhaustive-deps

  // login plan per row (server decides create / link / review) and roles the caller may grant per school
  useEffect(() => {
    if (!withLogin || mode !== "new") return;
    const need = base.filter((r) => r.state === "new" && !(pkey(r.p) in plan));
    const sch = [...new Set(base.filter((r) => r.state === "new" && r.p["school_id"] && !allowed[r.p["school_id"]]).map((r) => r.p["school_id"]!))];
    let off = false;
    (async () => {
      if (need.length) { try { const got = await rpc<Record<string, Plan>>("hr_login_plan", { _org: org, _rows: [...new Map(need.map((r) => [pkey(r.p), { k: pkey(r.p), nid: r.p["national_id"] ?? "", phone: r.p["phone"] ?? "" }])).values()] }); if (!off) setPlan((x) => ({ ...x, ...got })); } catch (e) { toast.error(arabicError(e)); } }
      for (const id of sch) { try { const a = id === CENTRAL ? await rpc<string[]>("hr_login_central_roles", { _org: org }) : await rpc<string[]>("hr_login_roles", { _org: org, _school: id }); if (!off) setAllowed((x) => ({ ...x, [id]: a ?? [] })); } catch { /* shown as review */ } }
    })();
    return () => { off = true; };
  }, [withLogin, mode, base]); // eslint-disable-line react-hooks/exhaustive-deps

  // manager options: active employees of the organisation, owner accounts (even with a login only), managers added in this batch
  const mgrOpts = useMemo<MgrOpt[]>(() => {
    const ownEmp = new Set(owners.map((o) => o.employee_id).filter(Boolean));
    const branch = (e: HrEmp) => (e.assignments ?? []).find((a) => a.is_primary && a.active)?.school ?? (e.assignments ?? [])[0]?.school ?? "";
    return [
      ...owners.map((o) => ({ v: `o:${o.user_id}`, name: o.name, role: "مالك المجموعة", branch: "", no: existing.find((e) => e.id === o.employee_id)?.employee_no ?? "", emp: o.employee_id ?? undefined })),
      ...existing.filter((e) => e.status === "active" && !ownEmp.has(e.id)).map((e) => ({ v: `e:${e.id}`, name: e.full_name, role: e.job_title ?? "", branch: branch(e), no: e.employee_no, emp: e.id })),
      ...base.filter((r) => r.state === "new" || r.state === "bad").map((r) => ({ v: `b:${r.i}`, name: r.p["full_name"] ?? "", role: r.p["job_title"] ?? "", branch: r.p["school_id"] === CENTRAL ? "الإدارة المركزية" : schools.find((x) => x.id === r.p["school_id"])?.name ?? r.schoolName, no: r.p["employee_no"] ?? "", batch: r.i })),
    ];
  }, [owners, existing, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const optFor = (r: Row) => mgrOpts.filter((o) => o.batch !== r.i && (!r.match || o.emp !== r.match));
  const withMgr = (r: Row): Row => {
    if (r.state !== "new" && r.state !== "bad" && !(r.state === "dup" && mode === "fill")) return r;
    const chosen = mgrPick[r.i];
    const mgr = chosen ?? r.mgrAuto ?? (r.p["manager_no"] ? undefined : "hr");
    let mgrErr = chosen ? undefined : r.mgrErr;
    if (mgr === `b:${r.i}` || (r.match && mgr === `e:${r.match}`)) mgrErr = "المسؤول المباشر لا يكون الموظف نفسه";
    else if (mgr?.startsWith("b:")) { const t = base.find((x) => x.i === +mgr.slice(2)); if (!t || (t.state !== "new" && t.state !== "bad")) mgrErr = `المدير المختار (صف ${mgr.slice(2)}) لن يُضاف في هذه الدفعة — اختر غيره`; else if (t.errs.length) mgrErr = `المدير المختار (صف ${t.i}) يحتاج تصحيحًا أولًا`; }
    else if (mgr && mgr !== "hr" && !mgrOpts.some((o) => o.v === mgr)) mgrErr = "المسؤول المختار غير متاح";
    const out: Row = { ...r, mgr, mgrErr };
    if (r.state === "bad" && !r.errs.length && !mgrErr) return { ...out, state: "new" };
    if (r.state === "new" && mgrErr) return { ...out, state: "bad" };
    return out;
  };
  const mgrPayload = (v: string | undefined, ids: Map<number, string>): Record<string, string> | null | string => {
    if (!v || v === "hr") return null;
    if (v.startsWith("e:")) return { manager_id: v.slice(2) };
    if (v.startsWith("o:")) return { manager_owner: v.slice(2) };
    const id = ids.get(+v.slice(2)); return id ? { manager_id: id } : `لم يُربط المسؤول المباشر لأن إضافة المدير (صف ${v.slice(2)}) تعذّرت — صحّح الاختيار`;
  };

  // completion mode: read current extra data for matched employees, then preview only empty → filled values
  useEffect(() => {
    if (mode !== "fill") return;
    const ids = [...new Set(base.filter((r) => r.match && !profs[r.match]).map((r) => r.match!))];
    if (!ids.length) return;
    let off = false;
    (async () => { const got: Record<string, Prof> = {}; for (const id of ids) { try { got[id] = await rpc<Prof>("hr_employee_profile_get", { _emp: id }); } catch { got[id] = {}; } } if (!off) setProfs((x) => ({ ...x, ...got })); })();
    return () => { off = true; };
  }, [mode, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<Row[]>(() => base.map((r0) => {
    const r = withMgr(r0);
    if (r.state === "new" && mode === "new" && withLogin) {
      const al = allowed[r.p["school_id"]!], t = tmap.get(tnorm(r.p["job_title"]));
      const pick0 = rolePick[r.i];
      const role = pick0 && al?.includes(pick0) ? pick0 : t && al?.includes(t) ? t : "";
      const pl = plan[pkey(r.p)];
      const lg: Login = !pl || !al ? { role, act: "wait", why: "جارٍ فحص الحساب…" }
        : pl.action === "review" ? { role, act: "review", why: pl.why, pl }
        : pl.action === "link_guardian" && !role ? { role, act: "review", why: "حساب ولي أمر موجود — اختر الدور الوظيفي الذي يُضاف له", pl }
        : pl.action === "create" && !role ? { role, act: "review", why: r.p["job_title"] ? (t ? `دور المسمى «${r.p["job_title"]}» لا يحق لك منحه في هذه المدرسة — اختر دورًا` : `المسمى «${r.p["job_title"]}» غير مربوط بدور — اختر الدور`) : "اختر دور الدخول", pl }
        : { role, act: pl.action, pl };
      return lg.act === "review" ? { ...r, login: lg, state: "review", msg: lg.why } : { ...r, login: lg };
    }
    if (r.state !== "dup" || mode !== "fill") return r;
    if (r.errs.length) return { ...r, state: "bad" };
    const e = existing.find((x) => x.id === r.match)!, pr = profs[r.match!]; if (!pr) return { ...r, msg: "جارٍ قراءة البيانات الحالية…" };
    const cur = (f: HrField) => f.where === "base" ? (e as Record<string, unknown>)[f.key] : f.key === "manager_no" ? pr.manager_no : f.key === "department" ? pr.department : pr[f.key];
    const gaps = fields.filter((f) => !["school", "category", "manager_name", "full_name", "employee_no", "display_name"].includes(f.key) && r.p[f.key] && (cur(f) == null || cur(f) === "")).map((f) => f.key);
    return gaps.length ? { ...r, state: "fill", gaps, msg: undefined } : { ...r, state: "same", msg: "لا توجد بيانات ناقصة يمكن استكمالها" };
  }), [base, mode, profs, existing, withLogin, allowed, tmap, rolePick, plan, mgrPick]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = HR_FIELDS.filter((f) => f.required && map[f.key] == null && !(f.key === "school" && Object.keys(pick).length));
  const ready = rows.filter((r) => r.state === "fill" || (r.state === "new" && (!r.login || r.login.act === "create" || ((r.login.act === "link" || r.login.act === "link_guardian") && linkOk[r.i]))));
  const readyIds = new Set(ready.map((r) => r.i));
  const unmappedTitles = withLogin && m.owner ? [...new Map(rows.filter((r) => r.p["job_title"] && !tmap.has(tnorm(r.p["job_title"]))).map((r) => [tnorm(r.p["job_title"]), r.p["job_title"]!])).values()] : [];
  const ownerRoles = allowed[Object.keys(allowed)[0] ?? ""] ?? [];
  const setTitle = async (title: string, b: string) => { try { await rpc("hr_title_role_set", { _org: org, _title: title, _base: b }); await qc.invalidateQueries({ queryKey: ["hr-title-roles", org] }); toast.success(`رُبط «${title}» بدور ${roleLabel(b)}`); } catch (e) { toast.error(arabicError(e)); } };
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
      if (r.state === "new" && readyIds.has(r.i)) {
        const p: Record<string, string> = { import_key: r.p["import_key"]! };
        for (const f of fields) if ((f.where === "base" || f.key === "department") && r.p[f.key]) p[f.key] = r.p[f.key]!;
        if (r.p["school_id"] === CENTRAL) p["central"] = "true"; else p["school_id"] = r.p["school_id"]!; if (r.p["category_id"]) p["category_id"] = r.p["category_id"];
        let id: string | null = null, dup = false;
        const rsn = `${why} — صف ${r.i}`;
        if (r.login?.act === "create") {
          try { const x = await createLogin({ data: { orgId: org, base: r.login.role, p, reason: rsn } }); if ("conflicts" in x && x.conflicts) { out.set(r.i, { ...r, state: "fail", msg: "توقف: الهوية أو الجوال تغيّر وضعهما — أعد المعاينة" }); continue; } id = (x as { employeeId: string }).employeeId; }
          catch (x) { out.set(r.i, { ...r, state: "fail", msg: `لم يُنشأ الملف/الحساب: ${arabicError(x)} — أعد الاعتماد لإكماله دون تكرار` }); continue; }
        } else if (r.login?.act === "link") {
          try { id = await call<string>("hr_employee_link_login", { _org: org, _uid: r.login.pl!.user_id, _p: p, _reason: rsn }); }
          catch (x) { out.set(r.i, { ...r, state: "fail", msg: `لم يُربط بالحساب: ${arabicError(x)}` }); continue; }
        } else if (r.login?.act === "link_guardian") {
          // existing guardian account: add the staff job, the guardian role and children links stay unchanged
          try { id = await call<string>("hr_employee_link_guardian", { _org: org, _uid: r.login.pl!.user_id, _base: r.login.role, _p: p, _reason: rsn }); }
          catch (x) { out.set(r.i, { ...r, state: "fail", msg: `لم يُربط بحساب ولي الأمر: ${arabicError(x)}` }); continue; }
        } else
        try { id = await call<string>("hr_employee_save", { _org: org, _id: null, _p: p, _reason: rsn }); }
        catch (x) { const em = String((x as Error)?.message ?? x); const k = em.match(/IMPORTED:([0-9a-f-]{36})/); if (k) { id = k[1]!; dup = true; } else { out.set(r.i, { ...r, state: "fail", msg: arabicError(x) }); continue; } }
        ids.set(r.i, id!);
        try { await call("hr_employee_profile_save", { _org: org, _emp: id, _p: profPayload(r), _mode: "fill", _reason: why }); out.set(r.i, { ...r, state: dup ? "dup" : "ok", msg: dup ? "أُضيف سابقًا من الملف نفسه — لم يُكرر" : r.login?.act === "create" ? `أُنشئ الحساب بدور ${roleLabel(r.login.role)}` : r.login?.act === "link" ? "رُبط بالحساب الموجود" : r.login?.act === "link_guardian" ? `رُبط بحساب ولي الأمر وأُضيفت صفة ${roleLabel(r.login.role)}` : undefined }); }
        catch (x) { out.set(r.i, { ...r, state: "fail", msg: `أُنشئ الملف لكن تعذّر حفظ البيانات الإضافية: ${arabicError(x)}` }); }
      } else if (r.state === "fill") {
        try { await call("hr_employee_profile_save", { _org: org, _emp: r.match, _p: { ...profPayload(r, r.gaps), ...(r.gaps.includes("manager_no") && typeof mgrPayload(r.mgr, ids) === "object" ? mgrPayload(r.mgr, ids) as Record<string, string> : {}) }, _mode: "fill", _reason: `${why} — استكمال صف ${r.i}` }); out.set(r.i, { ...r, state: "filled" }); }
        catch (x) { out.set(r.i, { ...r, state: "fail", msg: arabicError(x) }); }
      }
    }
    // second pass: direct managers (may be employees added in this same batch)
    for (const r of rows) {
      const id = ids.get(r.i); if (!id || out.get(r.i)?.state === "fail") continue;
      const mp = mgrPayload(r.mgr, ids); if (mp === null) continue;
      if (typeof mp === "string") { out.set(r.i, { ...out.get(r.i)!, mgrFail: true, msg: `حُفظ الموظف؛ ${mp}` }); continue; }
      try { await call("hr_employee_profile_save", { _org: org, _emp: id, _p: mp, _mode: "fill", _reason: `${why} — المسؤول المباشر للصف ${r.i}` }); }
      catch (x) { out.set(r.i, { ...out.get(r.i)!, mgrFail: true, msg: `حُفظ الموظف؛ لم يُربط المسؤول المباشر: ${arabicError(x)} — صحّح الاختيار` }); }
    }
    const list = [...out.values()].map((x) => ({ ...x, match: x.match ?? ids.get(x.i) }));
    setRes(list); setBusy(false); lock.current = false; onDone(); qc.invalidateQueries({ queryKey: ["hr-cand"] });
    const c = (s: State) => list.filter((x) => x.state === s).length;
    toast.success(`أُضيف ${c("ok")} · استُكمل ${c("filled")} · تُخطي ${c("dup") + c("same")} · رُفض ${c("bad") + c("conflict") + c("fail")} · للمراجعة ${c("review")}`);
  };
  // after the batch: correct a row whose manager could not be linked
  const fixMgr = async (r: Row): Promise<unknown> => {
    const ids = new Map(res!.filter((x) => x.match).map((x) => [x.i, x.match!]));
    const v = mgrPick[r.i] ?? r.mgr; const mp = mgrPayload(v, ids);
    if (!r.match || mp === null || typeof mp === "string") return toast.error(typeof mp === "string" ? mp : "اختر المسؤول المباشر");
    try { await call("hr_employee_profile_save", { _org: org, _emp: r.match, _p: mp, _mode: "fill", _reason: `استيراد Excel — تصحيح المسؤول المباشر للصف ${r.i}` });
      setRes((l) => l!.map((x) => (x.i === r.i ? { ...x, mgr: v, mgrFail: false, msg: "رُبط المسؤول المباشر" } : x))); toast.success("حُفظ المسؤول المباشر"); onDone(); }
    catch (x) { toast.error(arabicError(x)); }
    return null;
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
      <p className="text-sm text-muted-foreground">{withLogin ? "يُنشأ لكل صف جاهز ملف الموظف وحساب دخوله (بالهوية ثم رمز إلى الجوال) وعضوية المدرسة بالدور المحدد في عملية واحدة؛ الدور من ربط المسمى الوظيفي الذي يعتمده المالك أو من اختيارك في المعاينة." : "يُنشأ ملف موظف فقط — دون حساب دخول أو دور أو صلاحية."} لا يُحفظ أي صف قبل المعاينة، وإعادة رفع الملف لا تكرر السجلات. المطابقة بالرقم الوظيفي أو الهوية فقط، لا بالاسم.{!sens && " أعمدة الهوية والجواز والآيبان والوسيط والكفيل والجنسية والميلاد مخفية وتُتجاهل لأنها تحتاج صلاحية البيانات الحساسة."}</p>
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
          {mode === "new" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withLogin} disabled={!sens} onChange={(e) => setWithLogin(e.target.checked)} />إنشاء حسابات الدخول مع الملفات{!sens && " (يحتاج صلاحية البيانات الحساسة)"}</label>}
          {unmappedTitles.length > 0 && ownerRoles.length > 0 && (
            <div className="rounded border border-warning/40 bg-warning/10 p-2 text-sm" aria-label="ربط المسميات بالأدوار">
              <p className="mb-1 font-semibold">مسميات وظيفية غير مربوطة بدور دخول (يعتمدها المالك ويُحفظ الربط للمرات القادمة)</p>
              <div className="flex flex-wrap gap-2">{unmappedTitles.map((t) => (
                <label key={t} className="text-xs">{t}<select aria-label={`دور المسمى ${t}`} className={selectCls("ms-1")} value="" onChange={(e) => e.target.value && setTitle(t, e.target.value)}><option value="">— اختر —</option>{ownerRoles.map((b) => <option key={b} value={b}>{roleLabel(b)}</option>)}</select></label>))}</div>
            </div>)}
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
            <table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-start">الصف</th><th className="p-2 text-start">الاسم</th><th className="p-2 text-start">الرقم الوظيفي</th><th className="p-2 text-start">المدرسة</th><th className="p-2 text-start">المسؤول المباشر</th>{withLogin && mode === "new" && <><th className="p-2 text-start">الجوال</th><th className="p-2 text-start">دور الدخول</th><th className="p-2 text-start">الإجراء</th></>}<th className="p-2 text-start">الحالة</th></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.i} className="border-t align-top"><td className="p-2">{r.i}</td><td className="p-2">{r.p["full_name"] || "—"}</td><td className="p-2"><bdi dir="ltr">{r.p["employee_no"] || "تلقائي"}</bdi></td>
                  <td className="p-2">{!res && (r.p["school_id"] !== CENTRAL || pick[r.i]) && !schools.some((s) => norm(s.name) === norm(r.schoolName)) && r.state !== "dup" && r.state !== "fill" && r.state !== "same" ? (
                    <select aria-label={`مدرسة الصف ${r.i}`} className={selectCls("w-40")} value={pick[r.i] ?? ""} onChange={(e) => setPick((x) => ({ ...x, [r.i]: e.target.value }))}><option value="">{r.schoolName ? `«${r.schoolName}» ← اختر` : "اختر المدرسة"}</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}{m.owner && <option value={CENTRAL}>الإدارة المركزية (بلا مدرسة)</option>}</select>
                  ) : r.p["school_id"] === CENTRAL ? <span>الإدارة المركزية <span className="block text-xs text-muted-foreground">دور «مدير إدارة الموارد البشرية» فقط</span></span> : schools.find((s) => s.id === r.p["school_id"])?.name ?? r.schoolName ?? "—"}</td>
                  <td className="p-2 text-xs">{(!res && ["new", "bad", "review", "fill"].includes(r.state)) || (res && r.mgrFail) ? (
                    <>{r.p["manager_no"] && <p className="mb-1 text-muted-foreground">من الملف: <bdi dir="ltr">{r.p["manager_no"]}</bdi>{r.p["manager_name"] && ` — ${r.p["manager_name"]}`}</p>}
                      <ManagerPick row={r.i} value={res ? mgrPick[r.i] ?? r.mgr : r.mgr} opts={optFor(r)} onChange={(v) => setMgrPick((x) => ({ ...x, [r.i]: v }))} />
                      {res && r.mgrFail && <Button size="sm" variant="outline" className="mt-1" disabled={(() => { const v = mgrPick[r.i] ?? r.mgr; return !v || v === "hr" || (v.startsWith("b:") && !res.some((x) => x.i === +v.slice(2) && x.match)); })()} onClick={() => fixMgr(r)}>حفظ المسؤول</Button>}</>
                  ) : r.mgr && r.mgr !== "hr" ? mgrOpts.find((o) => o.v === r.mgr)?.name ?? "—" : r.p["manager_no"] ? <><bdi dir="ltr">{r.p["manager_no"]}</bdi>{r.p["manager_name"] && ` — ${r.p["manager_name"]}`}</> : <span className="text-muted-foreground">الموارد البشرية (افتراضي)</span>}</td>
                  {withLogin && mode === "new" && <>
                    <td className="p-2 text-xs"><bdi dir="ltr">{r.p["phone"] || "—"}</bdi></td>
                    <td className="p-2 text-xs">{r.login?.act === "link" ? <span>يحتفظ بأدواره: {(r.login.pl?.roles ?? []).map(roleLabel).join("، ")}</span>
                      : r.login && !res && (r.state === "new" || r.state === "review") ? <select aria-label={`دور الصف ${r.i}`} className={selectCls("w-36")} value={r.login.role} onChange={(e) => setRolePick((x) => ({ ...x, [r.i]: e.target.value }))}><option value="">اختر الدور</option>{(allowed[r.p["school_id"] ?? ""] ?? []).map((b) => <option key={b} value={b}>{roleLabel(b)}</option>)}</select>
                      : r.login?.role ? roleLabel(r.login.role) : "—"}</td>
                    <td className="p-2 text-xs">{!r.login ? "—" : r.login.act === "create" ? "إنشاء حساب" : r.login.act === "link" ? (
                      <label className="flex items-start gap-1"><input type="checkbox" aria-label={`تأكيد ربط الصف ${r.i}`} disabled={!!res} checked={!!linkOk[r.i]} onChange={(e) => setLinkOk((x) => ({ ...x, [r.i]: e.target.checked }))} /><span>ربط بحساب موجود بعد التأكيد: {r.login.pl?.name} — {(r.login.pl?.schools ?? []).join("، ")}</span></label>)
                      : r.login.act === "link_guardian" ? (
                      <label className="flex items-start gap-1"><input type="checkbox" aria-label={`تأكيد ربط ولي الأمر الصف ${r.i}`} disabled={!!res} checked={!!linkOk[r.i]} onChange={(e) => setLinkOk((x) => ({ ...x, [r.i]: e.target.checked }))} /><span>ربط بالحساب الموجود وإضافة الصفة الوظيفية: {r.login.pl?.name} — ولي أمر{r.login.pl?.children ? ` (${r.login.pl.children} من الأبناء)` : ""}، تبقى صفة ولي الأمر وروابط الأبناء</span></label>)
                      : r.login.act === "review" ? "يحتاج مراجعة" : "…"}</td>
                  </>}
                  <td className="p-2"><span className={`rounded px-1.5 ${CLS[r.state]}`}>{LBL[r.state]}</span> <span className="text-xs text-muted-foreground">{[...r.errs, r.mgrErr, r.msg].filter(Boolean).join("، ")}</span>
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
const LBL: Record<State, string> = { review: "يحتاج مراجعة", new: "جاهز للإضافة", fill: "سيُستكمل", dup: "موجود مسبقًا", same: "مكتمل — يُتخطى", conflict: "تعارض", bad: "يحتاج تصحيحًا", ok: "أُضيف", filled: "استُكمل", fail: "رفضه الخادم" };
const CLS: Record<State, string> = { review: "bg-warning/15", new: "bg-secondary", fill: "bg-primary/10 text-primary", dup: "bg-muted", same: "bg-muted", conflict: "bg-destructive/10 text-destructive", bad: "bg-destructive/10 text-destructive", ok: "bg-primary/10 text-primary", filled: "bg-primary/10 text-primary", fail: "bg-destructive/10 text-destructive" };
