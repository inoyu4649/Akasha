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

# Compile TypeScript (seed.ts copied into src so rootDir constraint is satisfied)
COPY backend/src ./backend/src
COPY backend/prisma/seed.ts ./backend/src/seed.ts
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

# Copy compiled output
COPY --from=builder /app/backend/dist ./backend/dist

WORKDIR /app/backend

EXPOSE 3001

# Run migrations then start server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/seed.js && node dist/index.js"]
