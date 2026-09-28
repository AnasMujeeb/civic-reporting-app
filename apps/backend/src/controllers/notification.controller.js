const Notification = require('../models/Notification');
const { dispatchNotification } = require('../queues/notificationQueue');

// ─── 1. Get current user's notification inbox (paginated) ─────────────────────
/**
 * GET /api/v1/notifications
 * Query params:
 *   page    (default: 1)
 *   limit   (default: 20)
 *   unread  (boolean — only return unread notifications if 'true')
 */
exports.getMyNotifications = async (req, res, next) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip   = (page - 1) * limit;

    const filter = { recipient: req.user._id };
    if (req.query.unread === 'true') filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('data.reportId',    'title category status')
        .populate('data.workOrderId', 'status deadline')
        .lean(),

      Notification.countDocuments(filter),

      // Always include total unread count in the response (for badge)
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    res.status(200).json({
      success: true,
      unreadCount,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 2. Mark a single notification as read ────────────────────────────────────
/**
 * PATCH /api/v1/notifications/:id/read
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id }, // owner check
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

// ─── 3. Mark ALL unread notifications as read ─────────────────────────────────
/**
 * PATCH /api/v1/notifications/read-all
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notification(s) marked as read.`,
    });
  } catch (error) {
    next(error);
  }
};

// ─── 4. Delete a notification ─────────────────────────────────────────────────
/**
 * DELETE /api/v1/notifications/:id
 */
exports.deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id, // owner check — cannot delete someone else's notification
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, message: 'Notification deleted.' });
  } catch (error) {
    next(error);
  }
};

// ─── 5. Admin: Broadcast a system notification to all users ──────────────────
/**
 * POST /api/v1/notifications/broadcast
 * Body: { title, body, recipientIds (optional array — omit for all users) }
 * Restricted to: MAYOR, UC_OFFICER
 */
exports.broadcastNotification = async (req, res, next) => {
  try {
    const { title, body, recipientIds } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    const User = require('../models/User');

    let recipients;
    if (recipientIds && Array.isArray(recipientIds) && recipientIds.length > 0) {
      recipients = await User.find({ _id: { $in: recipientIds } }).select('_id phone fcmToken');
    } else {
      // Broadcast to all citizens
      recipients = await User.find({ role: 'CITIZEN' }).select('_id phone fcmToken');
    }

    if (recipients.length === 0) {
      return res.status(404).json({ success: false, message: 'No recipients found.' });
    }

    // Queue a separate job for each recipient (BullMQ handles batching)
    const jobPromises = recipients.map((user) =>
      dispatchNotification({
        recipientId:       user._id.toString(),
        recipientFcmToken: user.fcmToken || null,
        recipientPhone:    user.phone    || null,
        type:  'SYSTEM',
        title,
        body,
      })
    );

    await Promise.allSettled(jobPromises); // don't fail if some enqueues fail

    res.status(200).json({
      success: true,
      message: `Broadcast notification queued for ${recipients.length} recipient(s).`,
    });
  } catch (error) {
    next(error);
  }
};