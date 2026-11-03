import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { FIELDS, normPhone, parseDate, parseWorkbook, strongEnough, templateBook, validate, type Lookups } from "./people-import";
import { verifyAuthHook, watiStatus } from "./wati-otp";

const buf = (wb: XLSX.WorkBook) => XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
const empty: Lookups = { sections: new Map(), departments: new Map(), existingIds: new Map(), existingPhones: new Map() };

/** Ministry-style student sheet (synthetic names/IDs): titles, «الصف»/«الفصل» labels, two-line header, English duplicate rows, footer. */
function ministrySheet(grade: string, fasl: string, people: [string, string][]) {
  const aoa: (string | number | null)[][] = [];
  aoa[1] = [null, null, "المملكة العربية السعودية"];
  aoa[6] = [null, null, null, grade, null, ":", null, "الصف"];
  aoa[14] = [null, null, fasl, null, null, ":", null, "الفصل"];
  aoa[21] = [null, null, null, "كشف بيانات الطلاب"];
  aoa[24] = ["ملاحظات", "بيانات القيد", "تاريخ الميلاد", "بيانات الهوية", null, "اسم الطالب", "م"];
  aoa[25] = [null, "حالة القيد", "Date of birth", "رقمها", "نوعها", "Student's Name", null];
  people.forEach(([name, id], i) => {
    aoa.push(["", "مستجد", "2015-03-0" + (i + 1), id, "رقم الهوية", name, i + 1]);
    aoa.push(["", "", "2015-03-0" + (i + 1), "", "", "TEST STUDENT", ""]);
  });
  aoa.push([null, null, null, null, null, null, null]);
  aoa.push(["طُبع بواسطة النظام", null, null, null, null, null, null]);
  const ws = XLSX.utils.aoa_to_sheet(aoa.map((r) => r ?? []));
  ws["!merges"] = [{ s: { r: 24, c: 3 }, e: { r: 24, c: 4 } }];
  return ws;
}

describe("phone, date and password rules", () => {
  it("normalizes Saudi mobiles and keeps the leading zero meaning", () => {
    expect(normPhone("0501234567")).toBe("966501234567");
    expect(normPhone("501234567")).toBe("966501234567");
    expect(normPhone("+966 50 123 4567")).toBe("966501234567");
    expect(normPhone("00966501234567")).toBe("966501234567");
    expect(normPhone("0112345678")).toBeNull();
  });
  it("accepts Gregorian dates in two orders and rejects Hijri", () => {
    expect(parseDate("2015-03-01").v).toBe("2015-03-01");
    expect(parseDate("01/03/2015").v).toBe("2015-03-01");
    expect(parseDate("1436/05/10").err).toMatch(/هجري/);
    expect(parseDate("2015-02-30").err).toBeTruthy();
  });
  it("requires 8+ chars with letters and digits", () => {
    expect(strongEnough("abc12")).toBeTruthy();
    expect(strongEnough("abcdefgh")).toBeTruthy();
    expect(strongEnough("abcd1234")).toBeNull();
  });
});

describe("ministry report parsing", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ministrySheet("الأول الابتدائي", "1", [["طالب أول تجريبي", "1000000001"], ["طالب ثان تجريبي", "1000000002"]]), "Sheet1");
  XLSX.utils.book_append_sheet(wb, ministrySheet("الثاني الابتدائي", "2", [["طالب ثالث تجريبي", "1000000003"]]), "Sheet2");
  const p = parseWorkbook(buf(wb), "students");
  it("reads every sheet, skips titles, English duplicate lines and footer", () => {
    expect(p.sheets).toBe(2);
    expect(p.rows.map((r) => r.values["full_name"])).toEqual(["طالب أول تجريبي", "طالب ثان تجريبي", "طالب ثالث تجريبي"]);
  });
  it("finds the ID under a two-line merged header and the sheet's grade/section", () => {
    expect(p.rows[0]!.values["national_id"]).toBe("1000000001");
    expect(p.rows[2]!.values["grade"]).toBe("الثاني الابتدائي");
    expect(p.rows[2]!.values["section"]).toBe("2");
  });
  it("reports formula cells instead of trusting them", () => {
    const ws = XLSX.utils.aoa_to_sheet([["اسم الطالب", "رقم الهوية"], ["طالب تجريبي", "1000000009"]]);
    ws["B2"] = { t: "s", v: "1000000009", f: "CONCAT(\"1\",\"000000009\")" };
    const w2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w2, ws, "x");
    const r = parseWorkbook(buf(w2), "students").rows[0]!;
    expect(validate("students", [r], empty)[0]!.errors.join()).toMatch(/صيغ/);
  });
  it("blank template has only column names", () => {
    const t = XLSX.read(buf(templateBook("teachers")), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<string[]>(t.Sheets["البيانات"]!, { header: 1, blankrows: false }).filter((r) => r.some((c) => String(c ?? "").trim()));
    expect(rows).toEqual([FIELDS.teachers.map((f) => f.label)]);
  });
});

describe("validation rules (import and single add)", () => {
  const raw = (values: Record<string, string>, line = 2) => ({ sheet: "s", line, values, formulas: [] });
  const lk: Lookups = { ...empty, sections: new Map([["الاول|ا", { id: "S1", year_id: "Y", capacity: 1, used: 0 }]]), existingIds: new Map([["1000000005", "OLD"]]) };
  it("student needs a 10-digit ID; duplicates in the file are rejected", () => {
    const r = validate("students", [raw({ full_name: "أ ب" }), raw({ full_name: "ج د", national_id: "1000000001" }), raw({ full_name: "هـ و", national_id: "1000000001" })], lk);
    expect(r[0]!.errors.join()).toMatch(/مطلوب/);
    expect(r[1]!.errors).toEqual([]);
    expect(r[2]!.errors.join()).toMatch(/مكرر/);
  });
  it("existing student is reused, not duplicated", () => {
    const r = validate("students", [raw({ full_name: "قديم", national_id: "1000000005" })], lk)[0]!;
    expect(r.existingId).toBe("OLD"); expect(r.errors).toEqual([]);
  });
  it("section capacity is enforced before saving", () => {
    const r = validate("students", [raw({ full_name: "أ", national_id: "1000000011", grade: "الأول", section: "أ" }), raw({ full_name: "ب", national_id: "1000000012", grade: "الأول", section: "أ" })], lk);
    expect(r[0]!.errors).toEqual([]); expect(r[1]!.errors.join()).toMatch(/ممتلئة/);
  });
  it("guardian needs a name and a valid mobile; never matched by name alone", () => {
    const r = validate("students", [raw({ full_name: "أ", national_id: "1000000013", guardian_name: "ولي", guardian_phone: "123" })], lk)[0]!;
    expect(r.errors.join()).toMatch(/جوال ولي الأمر/);
  });
  it("teacher needs a valid mobile; same mobile twice is rejected", () => {
    const r = validate("teachers", [raw({ full_name: "م1", phone: "0501111111" }), raw({ full_name: "م2", phone: "501111111" }), raw({ full_name: "م3" })], empty);
    expect(r[0]!.errors).toEqual([]); expect(r[1]!.errors.join()).toMatch(/مكرر/); expect(r[2]!.errors.join()).toMatch(/الجوال مطلوب/);
  });
});

describe("WhatsApp code delivery helpers", () => {
  it("verifies Supabase hook signatures and rejects tampering/old timestamps", async () => {
    const secretBytes = new Uint8Array(32).fill(7);
    const secret = "v1,whsec_" + btoa(String.fromCharCode(...secretBytes));
    const body = JSON.stringify({ user: { id: "u", phone: "966500000000" }, sms: { otp: "123456" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`id1.${ts}.${body}`)))));
    const h = (sig: string, t = ts) => new Headers({ "webhook-id": "id1", "webhook-timestamp": t, "webhook-signature": `v1,${sig}` });
    expect(await verifyAuthHook(secret, h(mac), body)).toBe(true);
    expect(await verifyAuthHook(secret, h(mac), body.replace("123456", "000000"))).toBe(false);
    expect(await verifyAuthHook(secret, h(mac, String(Number(ts) - 3600)), body)).toBe(false);
  });
  it("maps WATI status events and ignores others", () => {
    expect(watiStatus({ eventType: "templateMessageFailed", localMessageId: "x", failedCode: "131026" })?.status).toBe("failed");
    expect(watiStatus({ eventType: "sentMessageDELIVERED_v2", localMessageId: "x" })?.status).toBe("delivered");
    expect(watiStatus({ eventType: "message", localMessageId: "" })).toBeNull();
  });
});
