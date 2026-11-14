import { useEffect } from "react";
import { useSchoolLogo } from "@/components/school-logo";
import { setExportBrand } from "@/lib/export-brand";

/** Keeps the export letterhead (name + logo) in sync with the active school / group context. Renders nothing. */
export function ExportBrandSync({ name, schoolId, groupLogo }: { name: string; schoolId: string | null; groupLogo: string | null }) {
  const logo = useSchoolLogo(schoolId);
  const url = schoolId ? logo.data ?? null : groupLogo;
  useEffect(() => { void setExportBrand(name, url); }, [name, url]);
  return null;
}
