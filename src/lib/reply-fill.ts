/** Saved-reply placeholders, filled with the sending account's own name at insert time: {الاسم} = full name, {الاسم_الأول} = first name. */
export function fillReply(body: string, fullName: string) {
  const name = fullName.trim();
  const first = name.split(/\s+/)[0] ?? "";
  return body.replace(/\{\s*الاسم_الأول\s*\}/g, first || "{الاسم_الأول}").replace(/\{\s*الاسم\s*\}/g, name || "{الاسم}");
}
