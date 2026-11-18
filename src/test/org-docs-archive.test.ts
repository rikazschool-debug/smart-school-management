import { describe, expect, it } from "vitest";
import { archiveDetails, filterArchive, type ArchiveRecord } from "@/components/org-docs/archive-model";

const doc: ArchiveRecord = { record_type: "docs", id: "1", name: "ترخيص الفرع", kind: "ترخيص", archived_at: "2026-11-18T21:10:00Z", school_id: "s", school: "الفرع", doc_no: "011", issuer: "البلدية", issued_on: "2026-01-01", expires_on: "2027-01-01", status: "valid", file_id: "f1", file_name: "license.pdf", can_download: true };
const contractor: ArchiveRecord = { record_type: "contractors", id: "2", name: "متعهد الفرع", service: "الصيانة", archived_at: "2026-11-18T19:00:00Z", schools: ["الفرع"], school_ids: ["s"], starts_on: null, ends_on: null, phone: "0500000000", email: null, contact_name: null, notes: "ملاحظات العقد", status: "none", community_partner: true, files: [{ id: "f2", name: "contract.pdf" }], can_download: false };
const records = [doc, contractor];
const all = { type: "", category: "", from: "", to: "" };

describe("organization documents archive", () => {
  it("filters by record type", () => {
    expect(filterArchive(records, { ...all, type: "contractors" })).toEqual([contractor]);
  });
  it("filters by document or service category", () => {
    expect(filterArchive(records, { ...all, category: "ترخيص" })).toEqual([doc]);
  });
  it("uses both date boundaries inclusively in Riyadh time", () => {
    expect(filterArchive(records, { ...all, from: "2026-11-19", to: "2026-11-19" })).toEqual([doc]);
    expect(filterArchive(records, { ...all, to: "2026-11-18" })).toEqual([contractor]);
  });
  it("keeps document identifiers and contractor contact, notes, and attachments in report data", () => {
    expect(new Map(archiveDetails(doc)).get("رقم الوثيقة")).toBe("011");
    const details = new Map(archiveDetails(contractor));
    expect([...details.values()]).toEqual(expect.arrayContaining(["0500000000", "ملاحظات العقد", "contract.pdf"]));
  });
});