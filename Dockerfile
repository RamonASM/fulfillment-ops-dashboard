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
# Stage 3: Build API
# -----------------------------------------------------------------------------
FROM base AS api-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package*.json ./
COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

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
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package*.json ./
COPY tsconfig.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

WORKDIR /app/apps/web
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 5: Build Portal
# -----------------------------------------------------------------------------
FROM base AS portal-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/portal/node_modules ./apps/portal/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package*.json ./
COPY tsconfig.json ./
COPY apps/portal ./apps/portal
COPY packages/shared ./packages/shared

WORKDIR /app/apps/portal
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 6: Production API image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS api-production
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 api

# Copy built API
COPY --from=api-builder --chown=api:nodejs /app/apps/api/dist ./dist
COPY --from=api-builder --chown=api:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=api-builder --chown=api:nodejs /app/apps/api/prisma ./prisma
COPY --from=api-builder --chown=api:nodejs /app/apps/api/package.json ./

USER api

EXPOSE 3001

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
