/**
 * Admin Routes Index
 */

import express from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';

import eventsRoutes from './events.js';
import ordersRoutes from './orders.js';
import galleryRoutes from './gallery.js';
import uploadRoutes from './upload.js';
import statsRoutes from './stats.js';

const router = express.Router();

// All admin routes require authentication
router.use(requireAuth);
router.use(requireRole('admin', 'superadmin', 'staff'));

// Mount admin sub-routes
router.use('/events', eventsRoutes);
router.use('/orders', ordersRoutes);
router.use('/gallery', galleryRoutes);
router.use('/upload', uploadRoutes);
router.use('/stats', statsRoutes);

export default router;
