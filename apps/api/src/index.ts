import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { csrfProtection, getCsrfToken } from './middleware/csrf.js';
import { logger } from './lib/logger.js';
import { initializeWebSocket, getOnlineUsersCount } from './lib/socket.js';
import authRoutes from './routes/auth.routes.js';
import clientRoutes from './routes/client.routes.js';
import productRoutes from './routes/product.routes.js';
import locationRoutes from './routes/location.routes.js';
import alertRoutes from './routes/alert.routes.js';
import importRoutes from './routes/import.routes.js';
import reportRoutes from './routes/report.routes.js';
import aiRoutes from './routes/ai.routes.js';
import portalRoutes from './routes/portal/index.js';
import exportRoutes from './routes/export.routes.js';
import auditRoutes from './routes/audit.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import filterRoutes from './routes/filter.routes.js';
import searchRoutes from './routes/search.routes.js';
import orderRoutes from './routes/order.routes.js';
import collaborationRoutes from './routes/collaboration.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize WebSocket
initializeWebSocket(httpServer);

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
  })
);

// =============================================================================
// RATE LIMITERS (Tiered by endpoint sensitivity)
// =============================================================================

// Default limiter for general API endpoints
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload limiter (expensive operations)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: { error: 'Upload limit exceeded. Please try again later.' },
});

// AI/Analytics limiter (CPU-intensive)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 AI requests per minute
  message: { error: 'AI request limit exceeded. Please slow down.' },
});

// Report generation limiter
const reportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 reports per 5 minutes
  message: { error: 'Report generation limit exceeded. Please wait.' },
});

// Apply default limiter globally
app.use(defaultLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request ID middleware (must be before request logger)
app.use(requestIdMiddleware);

// Request logging
app.use(requestLogger);

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: {
      enabled: true,
      onlineUsers: getOnlineUsersCount(),
    },
  });
});

// CSRF token endpoint
app.get('/api/csrf-token', getCsrfToken);

// API routes with specific rate limiters
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/clients/:clientId/products', productRoutes);
app.use('/api/clients/:clientId/locations', locationRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/imports', uploadLimiter, importRoutes);
app.use('/api/reports', reportLimiter, reportRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/exports', reportLimiter, exportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/analytics', aiLimiter, analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/filters', filterRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

// =============================================================================
// START SERVER
// =============================================================================

httpServer.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    websocket: true,
  });
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 Inventory Intelligence Platform API                      ║
║                                                               ║
║   HTTP Server:     http://localhost:${PORT}                    ║
║   WebSocket:       ws://localhost:${PORT}                      ║
║   Environment:     ${process.env.NODE_ENV || 'development'}                              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
