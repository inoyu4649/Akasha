# ── Build stage ───────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Install deps (workspace-aware: needs root + workspace package.jsons)
COPY package*.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN npm ci --workspace=frontend --ignore-scripts

# Build React app
COPY frontend ./frontend
RUN npm run build -w frontend

# ── Serve stage ────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY nginx/spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
