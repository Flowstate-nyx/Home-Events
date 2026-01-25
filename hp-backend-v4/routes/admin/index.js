/**
 * Admin Routes Index
 * Multi-tenant SaaS upgrade
 *
 * BACKWARDS COMPATIBILITY:
 * - All existing routes preserved at same paths
 * - Auth now supports platform_admin, client_admin, client_staff roles
 * - Legacy 'admin' role still works
 */

import express from 'express';
import { requireAuth, requireAdmin, requirePlatformAdmin } from '../../middleware/auth.js';

// Existing routes (enhanced)
import eventsRoutes from './events.js';
import ordersRoutes from './orders.js';
import galleryRoutes from './gallery.js';
import uploadRoutes from './upload.js';
import statsRoutes from './stats.js';

// NEW routes (multi-tenant)
import clientsRoutes from './clients.js';
import customersRoutes from './customers.js';
import payoutsRoutes from './payouts.js';

const router = express.Router();

// All admin routes require authentication
router.use(requireAuth);
router.use(requireAdmin);

// Mount existing admin sub-routes (enhanced)
router.use('/events', eventsRoutes);
router.use('/orders', ordersRoutes);
router.use('/gallery', galleryRoutes);
router.use('/upload', uploadRoutes);
router.use('/stats', statsRoutes);

// Mount NEW admin sub-routes (multi-tenant)
router.use('/clients', requirePlatformAdmin, clientsRoutes);  // Platform admin only
router.use('/customers', customersRoutes);
router.use('/payouts', payoutsRoutes);

export default router;
