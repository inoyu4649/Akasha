# ── Build stage ───────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --workspace=backend --ignore-scripts

# Generate Prisma client for target platform
COPY backend/prisma ./backend/prisma
RUN cd backend && npx prisma generate

# Compile TypeScript
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
RUN npm run build -w backend

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install production deps only
RUN npm ci --workspace=backend --omit=dev --ignore-scripts

# Copy Prisma schema + generated client
COPY backend/prisma ./backend/prisma
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma 2>/dev/null || true

# Copy compiled output
COPY --from=builder /app/backend/dist ./backend/dist

WORKDIR /app/backend

EXPOSE 3001

# Run migrations then start server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
