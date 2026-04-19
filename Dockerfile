FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install dependencies (including dev deps for build)
FROM base AS deps
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Prisma postinstall runs `prisma generate` which needs the schema present.
COPY prisma ./prisma
RUN npm ci
RUN node -e "require('@prisma/client'); console.log('prisma-client-ok')"

# Build
FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 以最終進映像的 prisma schema 重新產出 client（含 binaryTargets 對應的全部 engines）
RUN npx prisma generate
RUN npm run build

# Runtime
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Cloud Run uses PORT env var; Next will respect it, but we pass -p explicitly in start script too.
ENV PORT=8080

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma

EXPOSE 8080
CMD ["npm","run","start"]
