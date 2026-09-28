const express = require('express');
const router  = express.Router();
const {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  broadcastNotification,
} = require('../controllers/notification.controller');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { broadcastValidation } = require('../validators/notification.validator');
const validate = require('../middlewares/validate.middleware');

// All notification routes require authentication
router.use(protect);

// GET  /api/v1/notifications            — inbox (paginated, supports ?unread=true)
// PATCH /api/v1/notifications/read-all  — mark all as read
router.get('/', getMyNotifications);
router.patch('/read-all', markAllAsRead);

// Admin: broadcast to many users at once
router.post(
  '/broadcast',
  restrictTo('MAYOR', 'UC_OFFICER'),
  broadcastValidation,
  validate,
  broadcastNotification
);

// Single notification actions
router.patch('/:id/read', markAsRead);
router.delete('/:id',     deleteNotification);

module.exports = router;
