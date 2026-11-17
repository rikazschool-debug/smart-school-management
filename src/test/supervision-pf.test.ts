import { describe, expect, it } from "vitest";
import { filterPf, groupPf, NO_YEAR, pfRows, sourceLink, type PfItem } from "@/components/supervision/pf-model";

const base: PfItem = { id: "1", school_id: "s", school: "ف", teacher_id: "t", teacher: "معلم", source_kind: "record", source_id: "r", source: { title: "زيارة", date: "2026-10-01", detail: "سجل إشرافي معتمد" }, source_date: "2026-10-01", year: "1448", term: "الأول", domain: "instruction", title: "زيارة", reflection: "", status: "verified", review_note: null, verifier: "مشرف", verified_at: null, rev: 1, updated_at: "", is_teacher: false, can_edit: false, can_review: false, can_open: true };
const it2 = (o: Partial<PfItem>): PfItem => ({ ...base, ...o });

describe("professional portfolio model", () => {
  it("groups by year (newest first), then term, then domain in catalog order", () => {
    const g = groupPf([it2({ id: "a", year: "1447", domain: "pd" }), it2({ id: "b", domain: "pd" }), it2({ id: "c", domain: "planning" })]);
    expect(g.map((x) => x.year)).toEqual(["1448", "1447"]);
    expect(g[0]!.terms[0]!.domains.map((d) => d.domain)).toEqual(["planning", "pd"]);
  });
  it("items without a registered year go last, never dropped", () => {
    const g = groupPf([it2({ id: "a", year: null }), it2({ id: "b" })]);
    expect(g.map((x) => x.year)).toEqual(["1448", NO_YEAR]);
  });
  it("withdrawn items are hidden unless asked for", () => {
    const l = [it2({ id: "a", status: "withdrawn" }), it2({ id: "b" })];
    expect(filterPf(l, { teacher: "", year: "", term: "", domain: "", status: "" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterPf(l, { teacher: "", year: "", term: "", domain: "", status: "withdrawn" }).map((x) => x.id)).toEqual(["a"]);
  });
  it("report keeps an unverified item labelled as awaiting verification", () => {
    expect(pfRows([it2({ status: "proposed", verifier: null })])[0]![7]).toBe("بانتظار التحقق");
  });
  it("attendance items have no source link; records do", () => {
    expect(sourceLink({ source_kind: "pd_session", source_id: "x" })).toBeNull();
    expect(sourceLink({ source_kind: "record", source_id: "x" })).toEqual({ tab: "records", id: "x" });
  });
});
