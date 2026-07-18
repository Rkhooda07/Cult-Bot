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

CMD ["node", "dist/index.js"]
