type Portal = "guardian" | "staff";
type Result = { error?: string; token?: string; challenge?: string; masked?: string };
type Service = {
  requestIdCode: (data: { nid: string; portal: Portal }) => Promise<Result>;
  verifyIdCode: (data: { challenge: string; code: string; portal: Portal }) => Promise<Result>;
  studentSignIn: (data: { nid: string; csmart: string }) => Promise<Result>;
};
type Path = "request-code" | "verify-code" | "student-login";
type ServiceSource = Service | (() => Promise<Service>);

// Public, reviewed preview origin. No suffix matching, wildcards, or forwarded-host trust.
// Replace/remove this exact entry in review when the temporary Replit preview changes/ends.
export const MOBILE_LOGIN_PREVIEW_ORIGIN =
  "https://de465eba-d58f-4044-a96f-e509a0f51668-00-2hirn3vv6u77u.expo.sisko.replit.dev";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};
const preflightVary = "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
const reply = (body: Result, status: number) =>
  Response.json(body, {
    status,
    headers: status === 405 ? { ...headers, Allow: "POST" } : headers,
  });
const invalid = () => reply({ error: "بيانات الطلب غير صحيحة." }, 400);

export async function mobileLoginHandler(
  request: Request,
  path: Path,
  service: ServiceSource,
): Promise<Response> {
  // This policy belongs only to the three mobile routes, not server functions or Supabase.
  const origin = request.headers.get("origin");
  const publicOrigin = process.env["RIKAZ_PUBLIC_ORIGIN"] || new URL(request.url).origin;
  const preview = origin === MOBILE_LOGIN_PREVIEW_ORIGIN;
  if (origin && origin !== publicOrigin && !preview) {
    const denied = reply({ error: "الطلب غير مسموح." }, 403);
    if (request.method === "OPTIONS") denied.headers.set("Vary", preflightVary);
    return denied;
  }
  if (request.method === "OPTIONS" && preview) {
    // The actual Expo Web fetch uses JSON + safelisted Accept, without cross-origin cookies.
    // Do not load the login module, read a body, look up an account, or issue/send a code here.
    if (
      request.headers.get("access-control-request-method") !== "POST" ||
      request.headers.get("access-control-request-headers")?.trim().toLowerCase() !== "content-type"
    ) {
      const denied = reply({ error: "الطلب غير مسموح." }, 403);
      denied.headers.set("Vary", preflightVary);
      return denied;
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        Vary: preflightVary,
        "Access-Control-Allow-Origin": MOBILE_LOGIN_PREVIEW_ORIGIN,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  const response = await handleMobileLoginPost(request, path, service);
  if (preview) response.headers.set("Access-Control-Allow-Origin", MOBILE_LOGIN_PREVIEW_ORIGIN);
  return response;
}

async function handleMobileLoginPost(
  request: Request,
  path: Path,
  service: ServiceSource,
): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "طريقة الطلب غير مسموحة." }, 405);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return reply({ error: "نوع الطلب غير مسموح." }, 415);
  }
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
  const getService = () => (typeof service === "function" ? service() : Promise.resolve(service));
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
      result = await (await getService()).studentSignIn({ nid, csmart: csmart.trim() });
    } else {
      if (portal !== "guardian" && portal !== "staff") return invalid();
      if (path === "request-code") {
        if (typeof nid !== "string" || !/^[12]\d{9}$/.test(nid)) return invalid();
        result = await (await getService()).requestIdCode({ nid, portal });
      } else {
        if (
          typeof challenge !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challenge) ||
          typeof code !== "string" ||
          !/^\d{6}$/.test(code)
        )
          return invalid();
        result = await (
          await getService()
        ).verifyIdCode({
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
