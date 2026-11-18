export type Doc = { id: string; school_id: string | null; school: string | null; kind: string; name: string; doc_no: string | null; issuer: string | null; issued_on: string | null; expires_on: string | null; status: string; file_id: string | null; file_name: string | null };
export type Con = { id: string; name: string; service: string; contact_name: string | null; phone: string | null; email: string | null; school_ids: string[]; schools: string[]; starts_on: string | null; ends_on: string | null; status: string; notes: string | null; community_partner: boolean; files: { id: string; name: string }[] };
type Archived = { archived_at: string; can_download: boolean };
export type ArchiveRecord = Archived & ((Doc & { record_type: "docs" }) | (Con & { record_type: "contractors" }));
export type ArchiveFilters = { type: string; category: string; from: string; to: string };

const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Riyadh", dateStyle: "short" });
export const archiveDay = (record: ArchiveRecord) => day.format(new Date(record.archived_at));
export const recordCategory = (record: ArchiveRecord) => record.record_type === "docs" ? record.kind : record.service;
export const recordType = (record: ArchiveRecord) => record.record_type === "docs" ? "وثيقة" : "متعهد";

export function filterArchive(records: ArchiveRecord[], filters: ArchiveFilters) {
  return records.filter((record) => (!filters.type || record.record_type === filters.type)
    && (!filters.category || recordCategory(record) === filters.category)
    && (!filters.from || archiveDay(record) >= filters.from)
    && (!filters.to || archiveDay(record) <= filters.to));
}

export function archiveDetails(r: ArchiveRecord): [string, string | null][] {
  if (r.record_type === "docs") return [
    ["النطاق", r.school ?? "المجموعة"], ["رقم الوثيقة", r.doc_no], ["جهة الإصدار", r.issuer],
    ["تاريخ الإصدار", r.issued_on], ["تاريخ الانتهاء", r.expires_on], ["المرفقات", r.file_name],
  ];
  return [
    ["المدارس", r.schools.join("، ")], ["المسؤول", r.contact_name], ["الجوال", r.phone], ["البريد", r.email],
    ["بداية السريان", r.starts_on], ["نهاية السريان", r.ends_on], ["شراكات مجتمعية", r.community_partner ? "نعم" : "لا"],
    ["الملاحظات", r.notes], ["المرفقات", r.files.map((f) => f.name).join("، ")],
  ];
}