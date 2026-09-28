const mongoose = require('mongoose');

/**
 * Notification Model
 * Persists every notification so users have an in-app inbox.
 * BullMQ worker creates a Notification document AND sends the push/WhatsApp alert.
 */
const notificationSchema = new mongoose.Schema(
  {
    // Who should receive this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // What triggered this notification
    type: {
      type: String,
      required: true,
      enum: [
        'REPORT_STATUS_CHANGED',   // Report status updated by officer/rep
        'WORK_ORDER_ASSIGNED',     // UC Officer assigned a work order to contractor
        'WORK_ORDER_UPDATED',      // Contractor updated work order status
        'REPORT_UPVOTED',          // Someone upvoted your report
        'COMMENT_ADDED',           // New comment on your report
        'REPORT_RESOLVED',         // Your reported issue has been fixed
        'SYSTEM',                  // Generic system message
      ],
    },

    // Human-readable message for the notification bell / push
    title: {
      type: String,
      required: true,
      maxlength: 120,
    },

    body: {
      type: String,
      required: true,
      maxlength: 500,
    },

    // Optional deep-link data so the mobile app can navigate to the right screen
    data: {
      reportId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
      workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder' },
      extraPayload: { type: mongoose.Schema.Types.Mixed }, // any custom KV pairs
    },

    // Delivery channels attempted
    channels: {
      fcmSent:       { type: Boolean, default: false },
      whatsappSent:  { type: Boolean, default: false },
    },

    // Read state for in-app inbox
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Compound index for fast unread inbox queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
