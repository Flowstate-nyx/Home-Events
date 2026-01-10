/**
 * Admin Routes Index
 */

const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

// All admin routes require authentication
router.use(requireAuth);
router.use(requireRole('admin', 'superadmin', 'staff'));

// Mount admin sub-routes
router.use('/events', require('./events'));
router.use('/orders', require('./orders'));
router.use('/gallery', require('./gallery'));
router.use('/upload', require('./upload'));
router.use('/stats', require('./stats'));

module.exports = router;
