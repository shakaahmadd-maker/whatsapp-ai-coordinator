# Production Dockerfile for Dokploy / VPS Deployment
FROM node:22-slim AS builder

WORKDIR /app

# Install all dependencies deterministically from package-lock.json
# Explicitly include dev and optional native bindings (e.g., @rolldown/binding-linux-x64-gnu)
COPY package.json package-lock.json ./
RUN npm ci --include=dev --include=optional

# Copy application source and build the React/Vite frontend bundle
COPY . .
RUN npm run build

# Production runtime image
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Copy built frontend, server entrypoint, shared TypeScript modules, and node_modules (including tsx)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

# Ensure persistent data directory exists for Dokploy volume mount (/app/data)
RUN mkdir -p /app/data

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["./node_modules/.bin/tsx", "server.ts"]
