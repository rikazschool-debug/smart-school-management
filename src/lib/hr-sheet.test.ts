import { describe, expect, it } from "vitest";
import { buildSheet, sheetHtml, ACCOUNT_TITLE, MASKED } from "@/lib/hr-sheet";
import { HR_GROUPS } from "@/lib/hr-fields";

const item = (sensitive: boolean) => ({
  employee: { id: "1", employee_no: "E-7", full_name: "أحمد علي", status: "active", phone: "+966500000000", national_id: sensitive ? "1012345678" : "••••78", nationality: sensitive ? "سعودي" : null, sensitive, password: "x" },
  assignments: [{ school: "فرع الضاحية", start_date: "2026-01-01", is_primary: true, active: true }],
  profile: { iban: sensitive ? "SA0380000000608010167519" : "••••7519", sensitive },
  account: { has_login: true, self_access: false, roles: [{ role: "teacher", school: "فرع الضاحية", active: true }], templates: [] },
});

describe("employee file sheet", () => {
  it("uses the «إضافة موظف» section order, then account and permissions", () => {
    expect(buildSheet(item(true)).map((s) => s.title)).toEqual([...HR_GROUPS.map((g) => g.label), ACCOUNT_TITLE]);
    expect(HR_GROUPS.map((g) => g.label)).toEqual(["البيانات الشخصية", "الهوية والوثائق", "البيانات الوظيفية", "المؤهلات", "بيانات التواصل", "البيانات البنكية والدفع"]);
  });
  it("without sensitive permission, sensitive fields stay masked", () => {
    const rows = buildSheet(item(false)).flatMap((s) => s.rows);
    expect(rows.find((r) => r.label === "الجنسية")?.value).toBe(MASKED);
    expect(rows.find((r) => r.label === "رقم الهوية")?.value).toBe("••••78");
  });
  it("never prints passwords", () => {
    expect(sheetHtml([item(true)])).not.toContain(">x<");
  });
  it("bulk print starts each employee on a new page", () => {
    const html = sheetHtml([item(true), item(true), item(true)]);
    expect(html.match(/<article class="pb"/g)?.length).toBe(2);
  });
});
