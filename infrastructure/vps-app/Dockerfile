# Approved stage 1. Build context: the reviewed repository root.
ARG NODE_IMAGE=node@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG BUN_IMAGE=oven/bun@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7
FROM ${BUN_IMAGE} AS bun-tool

FROM ${NODE_IMAGE} AS build
COPY --from=bun-tool /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
# Keep build dependencies (including server-only agora-token), keep the lock,
# and do not execute dependency lifecycle scripts.
RUN bun install --frozen-lockfile --ignore-scripts
COPY vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY"
# Only these PUBLIC variables reach Vite. No service key is supplied at build.
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
    NITRO_PRESET=node-server \
    NITRO_COMPATIBILITY_DATE=2026-11-13 \
    DO_NOT_TRACK=1
RUN node node_modules/vite/bin/vite.js build \
 && test -s .output/server/index.mjs

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
 CMD node -e "fetch('http://127.0.0.1:3000/',{signal:AbortSignal.timeout(8000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
