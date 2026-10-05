# The radio on its own server: the built site and the /api routes in one Node process.
# Data (SQLite database and voice audio) lives in /data; mount a volume there.
#
#   docker build -t dawn-radio .
#   docker run -p 8080:8080 --env-file .env -v radio-data:/data dawn-radio

FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Build the site.
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Only what the server needs at runtime. Node runs the TypeScript in server/ and shared/ directly.
FROM base AS runtime
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY server server
COPY shared shared
COPY migrations migrations
COPY --from=build /app/dist dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/node/main.ts"]
