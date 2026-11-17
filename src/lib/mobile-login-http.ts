type Portal = "guardian" | "staff";
type Result = { error?: string; token?: string; challenge?: string; masked?: string };
type Service = {
  requestIdCode: (data: { nid: string; portal: Portal }) => Promise<Result>;
  verifyIdCode: (data: { challenge: string; code: string; portal: Portal }) => Promise<Result>;
  studentSignIn: (data: { nid: string; csmart: string }) => Promise<Result>;
};
type Path = "request-code" | "verify-code" | "student-login";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body: Result, status: number) =>
  Response.json(body, {
    status,
    headers: status === 405 ? { ...headers, Allow: "POST" } : headers,
  });
const invalid = () => reply({ error: "بيانات الطلب غير صحيحة." }, 400);

export async function mobileLoginHandler(
  request: Request,
  path: Path,
  service: Service,
): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "طريقة الطلب غير مسموحة." }, 405);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return reply({ error: "نوع الطلب غير مسموح." }, 415);
  }
  // Native callers omit Origin. Browser callers must be same-origin; this is not identity authorization.
  const origin = request.headers.get("origin");
  // Match the existing web CSRF boundary behind HTTPS termination. Never trust client forwarded headers.
  const publicOrigin = process.env["RIKAZ_PUBLIC_ORIGIN"] || new URL(request.url).origin;
  if (origin && origin !== publicOrigin) return reply({ error: "الطلب غير مسموح." }, 403);
  if (Number(request.headers.get("content-length")) > 2048) return invalid();
  const reader = request.body?.getReader();
  if (!reader) return invalid();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2048) {
        await reader.cancel();
        return invalid();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return invalid();
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalid();
    body = parsed as Record<string, unknown>;
  } catch {
    return invalid();
  }
  const allowed =
    path === "student-login"
      ? ["nid", "csmart"]
      : path === "request-code"
        ? ["nid", "portal"]
        : ["challenge", "code", "portal"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return invalid();
  const { nid, csmart, portal, challenge, code } = body;
  let result: Result;
  try {
    if (path === "student-login") {
      if (
        typeof nid !== "string" ||
        !/^[12]\d{9}$/.test(nid) ||
        typeof csmart !== "string" ||
        !csmart.trim() ||
        csmart.length > 40
      )
        return invalid();
      result = await service.studentSignIn({ nid, csmart: csmart.trim() });
    } else {
      if (portal !== "guardian" && portal !== "staff") return invalid();
      if (path === "request-code") {
        if (typeof nid !== "string" || !/^[12]\d{9}$/.test(nid)) return invalid();
        result = await service.requestIdCode({ nid, portal });
      } else {
        if (
          typeof challenge !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challenge) ||
          typeof code !== "string" ||
          !/^\d{6}$/.test(code)
        )
          return invalid();
        result = await service.verifyIdCode({
          challenge,
          code,
          portal,
        });
      }
    }
  } catch {
    // Do not log identities, tokens, codes, phone numbers, or database errors here.
    return reply({ error: "تعذّر إتمام الدخول. حاول مرة أخرى." }, 500);
  }
  if (result.error) return reply({ error: result.error }, 400);
  // Only return existing public DTO fields, never database rows or phone numbers.
  if (path === "request-code" && result.challenge)
    return reply({ challenge: result.challenge, masked: result.masked ?? "" }, 200);
  if (path !== "request-code" && result.token) return reply({ token: result.token }, 200);
  return reply({ error: "تعذّر إتمام الدخول. حاول مرة أخرى." }, 500);
}
