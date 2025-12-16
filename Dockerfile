# =============================================================================
# Multi-stage Dockerfile for Inventory Intelligence Platform
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image with dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat

# -----------------------------------------------------------------------------
# Stage 2: Install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY apps/portal/package*.json ./apps/portal/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies
RUN npm ci

# -----------------------------------------------------------------------------
# Stage X: Build Shared package
# -----------------------------------------------------------------------------
FROM base AS shared-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared

WORKDIR /app/packages/shared
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Build API
# -----------------------------------------------------------------------------
FROM base AS api-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package*.json ./
COPY apps/api ./apps/api
COPY --from=shared-builder /app/packages/shared ./packages/shared

# Clear Prisma cache to prevent engine issues
RUN rm -rf /root/.cache/prisma

# Generate Prisma client
WORKDIR /app/apps/api
RUN npx prisma generate

# Build API
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 4: Build Web Dashboard
# -----------------------------------------------------------------------------
FROM base AS web-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package*.json ./
COPY apps/web ./apps/web
COPY --from=shared-builder /app/packages/shared ./packages/shared

WORKDIR /app/apps/web
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 5: Build Portal
# -----------------------------------------------------------------------------
FROM base AS portal-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package*.json ./
COPY apps/portal ./apps/portal
COPY --from=shared-builder /app/packages/shared ./packages/shared

WORKDIR /app/apps/portal
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 6: Production API image
# -----------------------------------------------------------------------------
FROM node:20-slim AS api-production
WORKDIR /app

ENV NODE_ENV=production

# Install Python 3, pip, build tools, PostgreSQL client, AND OpenSSL/SSL libraries for Prisma
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    postgresql-client \
    openssl \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy python-importer code
COPY apps/python-importer /app/apps/python-importer

# Install Python dependencies
RUN python3 -m pip install --no-cache-dir -r apps/python-importer/requirements.txt --user --break-system-packages

# Create non-root user BEFORE copying files with ownership
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

# Create Prisma cache and uploads directories with correct permissions for non-root user
RUN mkdir -p /home/api/.cache/prisma && \
    chown -R api:nodejs /home/api/.cache && \
    mkdir -p /app/uploads && \
    chown -R api:nodejs /app/uploads

# Copy built API with correct ownership
COPY --from=api-builder --chown=api:nodejs /app/apps/api/dist ./dist
COPY --from=api-builder --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=shared-builder --chown=api:nodejs /app/packages ./packages
COPY --from=api-builder --chown=api:nodejs /app/apps/api/prisma ./prisma
COPY --from=api-builder --chown=api:nodejs /app/apps/api/package.json ./

# Add entrypoint with correct ownership
COPY --chown=api:nodejs entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set HOME environment variable for non-root user (Prisma cache location)
ENV HOME=/home/api

USER api

EXPOSE 3001

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]

# -----------------------------------------------------------------------------
# Stage 7: Production static file server (Web + Portal)
# -----------------------------------------------------------------------------
FROM nginx:alpine AS static-production

# Copy nginx config
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Copy built static files
COPY --from=web-builder /app/apps/web/dist /usr/share/nginx/html/web
COPY --from=portal-builder /app/apps/portal/dist /usr/share/nginx/html/portal

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
