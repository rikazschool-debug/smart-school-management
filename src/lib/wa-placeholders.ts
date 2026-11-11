/** Fills operator placeholders in WhatsApp quick replies (WATI style, e.g. {{operator.first_name}}) with the signed-in employee's name. */
export function fillOperator(text: string, fullName?: string | null): string {
  const full = (fullName ?? "").replace(/\s+/g, " ").trim();
  if (!full) return text;
  const first = full.split(" ")[0]!;
  return text.replace(/\{\{\s*(operator\.(first_name|name|full_name)|operator_name|agent_name|employee_name)\s*\}\}/gi, (_m, _k, f) =>
    (f ?? "").toLowerCase() === "first_name" ? first : full);
}
