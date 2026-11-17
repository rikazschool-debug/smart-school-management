import { describe, expect, it } from "vitest";
import { canUse, diffSpecs, filterCards, formCards, printable, recordNo, sectionProgress } from "@/components/supervision/forms-model";
import { missingFields, svSearch, type SvForm, type SvSpec } from "@/components/supervision/model";
import { formPrintHtml } from "@/components/supervision/form-print";

const obs: SvSpec = { sections: [{ title: "الممارسات", fields: [{ key: "obs", label: "الممارسات", type: "indicators", required: true, evidence: "required", levels: ["في طور النمو", "متمكن"], items: [{ code: "o1", label: "وضوح الأهداف" }] }] },
  { title: "داخلي", fields: [{ key: "sup_notes", label: "ملاحظات داخلية", type: "textarea", private: true }] }] };
const form = (p: Partial<SvForm>): SvForm => ({ id: "x", org_id: null, school_id: null, key: "k", version: 1, title: "ن", purpose: "", kind: "observation", source: { type: "internal" }, spec: obs, roles: {}, acceptance: "", outputs: "", status: "published", rev: 1, creator: "", publisher: null, published_at: null, return_reason: null, can_edit: false, can_publish: false, created_by: null, ...p });

describe("supervision forms library", () => {
  it("a chosen level needs its linked observation before submit", () => {
    expect(missingFields(obs, { obs: { o1: { level: "متمكن" } } })).toEqual(["الممارسات: الشاهد الملاحظ في وضوح الأهداف"]);
    expect(missingFields(obs, { obs: { o1: { level: "متمكن", evidence: "سأل الطلاب عن الهدف" } } })).toEqual([]);
    expect(missingFields(obs, { obs: { o1: { state: "nl" } } })).toEqual([]);
  });
  it("templates are never usable; only an org-published copy is", () => {
    expect(canUse(form({}))).toBe(false);
    expect(canUse(form({ org_id: "o", status: "draft" }))).toBe(false);
    expect(canUse(form({ org_id: "o" }))).toBe(true);
  });
  it("cards prefer the org copy and flag a newer template", () => {
    const t1 = form({ id: "t1", status: "archived" }), t2 = form({ id: "t2", version: 2 }), o = form({ id: "o2", org_id: "o", version: 2, based_on: "t1" });
    const [c] = formCards([t1, t2, o]);
    expect(c!.main.id).toBe("o2"); expect(c!.approval).toBe("adopted"); expect(c!.newerTemplate?.id).toBe("t2");
    expect(filterCards([c!], { q: "", domain: "", purpose: "", approval: "template" })).toHaveLength(0);
  });
  it("version diff names added, removed and changed fields", () => {
    const a: SvSpec = { sections: [{ title: "أ", fields: [{ key: "x", label: "س", type: "text" }, { key: "y", label: "ص", type: "text" }] }] };
    const b: SvSpec = { sections: [{ title: "أ", fields: [{ key: "x", label: "س٢", type: "text", required: true }, { key: "z", label: "ع", type: "date" }] }] };
    const d = diffSpecs(a, b);
    expect(d.map((c) => c.kind).sort()).toEqual(["added", "changed", "removed"]);
    expect(d.find((c) => c.kind === "changed")!.detail).toContain("أصبح إلزاميًا");
  });
  it("teacher copy drops internal fields, in print too", () => {
    expect(printable(obs, true).sections.map((s) => s.title)).toEqual(["الممارسات"]);
    const html = formPrintHtml(obs, { sup_notes: "سري جدًا" }, { title: "ز", version: 2, branch: "ف", recordId: "12345678-aaaa-bbbb-cccc-000000000000", teacherCopy: true, source: "داخلي" });
    expect(html).not.toContain("سري جدًا"); expect(html).toContain("SV-12345678");
    expect(recordNo("abcdef12-0000-0000-0000-000000000000")).toBe("SV-ABCDEF12");
  });
  it("progress counts missing required items per section", () => {
    expect(sectionProgress(obs, {})).toEqual([{ title: "الممارسات", required: 1, missing: 1 }, { title: "داخلي", required: 0, missing: 0 }]);
  });
  it("search accepts a form key to use", () => { expect(svSearch({ tab: "records", use: "support_visit" })).toEqual({ tab: "records", use: "support_visit" }); expect(svSearch({ use: "X;drop" })).toEqual({}); });
});
