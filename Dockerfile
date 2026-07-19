FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build
# prisma/seed.ts lives outside src/, so the main tsc build skips it. Compile it
# standalone to dist/seed.js so the runner can seed badges with plain `node`
# (ts-node is a devDependency and is absent from the production image).
RUN npx tsc prisma/seed.ts --outDir dist --module commonjs --target ES2022 --esModuleInterop --skipLibCheck --resolveJsonModule

FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
RUN npx prisma generate

# The health endpoint (src/server/healthServer.ts). Documentation only — it does
# not publish anything — but it is what a PaaS reads to know which port to probe.
EXPOSE 8000

# migrate (apply pending schema changes to Neon) -> seed (badge rows the
# auto-award system needs; upsert, so safe every boot) -> bot.
#
# This chain previously lived only in docker-compose.yml's `command:`, which a
# PaaS building straight from the Dockerfile never reads. Without it here, a
# Koyeb deploy would start the bot against an unmigrated schema.
#
# `exec` on the last command is load-bearing, not style: without it `sh` stays
# PID 1 and does NOT forward SIGTERM to node, so the graceful-shutdown handlers
# in src/index.ts never fire. Every redeploy would then hang until the platform
# SIGKILLs — and a SIGKILL landing mid-`migrate deploy` leaves a
# _prisma_migrations row with finished_at NULL, which makes the NEXT boot fail
# until someone runs `prisma migrate resolve` by hand. On a PaaS that redeploys
# on every push, that is the most likely way this bricks itself unattended.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed.js && exec node dist/index.js"]
