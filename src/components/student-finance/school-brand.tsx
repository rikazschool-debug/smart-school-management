import { useEffect } from "react";
import { useSchoolLogo } from "@/components/school-logo";
import { setExportBrandOverride } from "@/lib/export-brand";

/** Brands every print/PDF/Excel from this page with the school chosen on the page (logo top-right), not the group context. */
export function SchoolExportBrand({ schoolId, name }: { schoolId: string | null; name: string }) {
  const logo = useSchoolLogo(schoolId);
  useEffect(() => { if (schoolId && name) void setExportBrandOverride(name, logo.data ?? null); return () => void setExportBrandOverride(null); }, [schoolId, name, logo.data]);
  return null;
}
