# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

# better-sqlite3 is a native module. Keep the toolchain only in the build stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=5234 \
    DATA_DIR=/app/data

WORKDIR /app

# Run the application without root. The data directory is also used by the
# anonymous/named volume in Compose and must be writable by this user.
RUN groupadd --system --gid 10001 workbench \
  && useradd --system --uid 10001 --gid workbench --create-home --home-dir /home/workbench workbench \
  && mkdir -p /app/data \
  && chown -R workbench:workbench /app

COPY --from=build --chown=workbench:workbench /app/node_modules ./node_modules
COPY --from=build --chown=workbench:workbench /app/dist ./dist
COPY --from=build --chown=workbench:workbench /app/dist-server ./dist-server
COPY --from=build --chown=workbench:workbench /app/package.json ./package.json

USER workbench
EXPOSE 5234

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5234)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist-server/server/index.js"]
