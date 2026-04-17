FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install dependencies (including dev deps for build)
FROM base AS deps
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Prisma postinstall runs `prisma generate` which needs the schema present.
COPY prisma ./prisma
RUN npm ci

# Build
FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runtime
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Cloud Run uses PORT env var; Next will respect it, but we pass -p explicitly in start script too.
ENV PORT=8080

COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules

EXPOSE 8080
CMD ["npm","run","start"]
