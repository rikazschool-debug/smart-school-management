/** Guardian accounts sign in with their national ID (or phone); auth needs an email, so it is derived. */
export const STAFF_DOMAIN = "staff.rikaz.app";
export const GUARDIAN_DOMAIN = "guardian.rikaz.app";
export function guardianLoginEmail(digits: string) {
  return `${digits.replace(/\D/g, "")}@${GUARDIAN_DOMAIN}`;
}
/** Login field accepts an email, or digits (ID / phone) for guardian accounts. */
export function toLoginEmail(input: string) {
  const v = input.trim();
  if (/^[\d\s+-]{6,}$/.test(v)) return guardianLoginEmail(v);
  // staff created by the owner sign in with a username (case-insensitive)
  if (!v.includes("@") && /^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$/.test(v)) return `${v.toLowerCase()}@${STAFF_DOMAIN}`;
  return v;
}
