# UI build stage
FROM oven/bun:1 AS ui-builder
WORKDIR /ui
COPY ui/package.json ./
RUN bun install
COPY ui/ ./
RUN bun run build

# Agent build stage
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .

# Runtime stage
FROM oven/bun:1-slim
WORKDIR /app

# Copy agent
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agent ./agent
COPY --from=builder /app/package.json ./

# Copy built SPA
COPY --from=ui-builder /ui/dist ./public

# Use non-root user already present in oven/bun image (bun:1000)
RUN chown -R bun:bun /app
USER bun

# OAuth callback server + SPA
EXPOSE 80

# Run the agent
CMD ["bun", "run", "agent/index.ts"]
