/** Guardian accounts sign in with their national ID (or phone); auth needs an email, so it is derived. */
export const GUARDIAN_DOMAIN = "guardian.rikaz.app";
export function guardianLoginEmail(digits: string) {
  return `${digits.replace(/\D/g, "")}@${GUARDIAN_DOMAIN}`;
}
/** Login field accepts an email, or digits (ID / phone) for guardian accounts. */
export function toLoginEmail(input: string) {
  const v = input.trim();
  return /^[\d\s+-]{6,}$/.test(v) ? guardianLoginEmail(v) : v;
}
