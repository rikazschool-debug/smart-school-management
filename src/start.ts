import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { supabase } from "./integrations/supabase/client";

const attachAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return next(t ? { headers: { Authorization: `Bearer ${t}` } } : undefined);
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  // A fixed server-side origin supports HTTPS termination at Nginx without
  // trusting an arbitrary forwarded host/protocol. Unset keeps preview defaults.
  origin: (origin, ctx) => origin === (process.env["RIKAZ_PUBLIC_ORIGIN"] || new URL(ctx.request.url).origin),
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
  functionMiddleware: [attachAuth],
}));
