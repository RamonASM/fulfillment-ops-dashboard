import { Router } from 'express';
import authRoutes from './auth.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import productsRoutes from './products.routes.js';
import ordersRoutes from './orders.routes.js';
import alertsRoutes from './alerts.routes.js';
import settingsRoutes from './settings.routes.js';
import analyticsRoutes from './analytics.routes.js';
import exportsRoutes from './exports.routes.js';
import locationsRoutes from './locations.routes.js';
import artworksRoutes from './artworks.routes.js';

const router = Router();

// Portal routes
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/alerts', alertsRoutes);
router.use('/settings', settingsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/exports', exportsRoutes);
router.use('/locations', locationsRoutes);
router.use('/artworks', artworksRoutes);

export default router;
