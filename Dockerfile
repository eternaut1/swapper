# --- Dependencies ---
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install

# --- Build ---
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" bunx prisma generate && bun run build

# --- Production ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOME=/app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy standalone Next.js output (includes traced node_modules for runtime)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy prisma schema + config for db push at startup
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Install prisma CLI (+ its transitive deps) for runtime db push
RUN npm install --no-save prisma dotenv

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "npx prisma db push && node server.js"]
